#!/usr/bin/env python3
"""Minimal requirement-document review workflow.

Usage:
    python3 review_requirements.py ./requirement.pdf

Optional LLM environment variables:
    LLM_API_KEY   API key for an OpenAI-compatible chat completions endpoint
    LLM_BASE_URL  Default: https://api.openai.com/v1
    LLM_MODEL     Default: gpt-4o-mini
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import textwrap
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_ROLES = [
    {
        "name": "产品",
        "definition": "从产品规划角度评审需求目标、范围、优先级、规则和验收口径是否清晰。",
        "criteria": [
            "需求背景、目标和成功指标是否明确",
            "功能范围、优先级和不做范围是否清晰",
            "产品规则、状态流转和业务约束是否完整",
            "验收口径、上线影响和版本边界是否说明",
        ],
        "pass_score": 80,
    },
    {
        "name": "测试",
        "definition": "从测试验证角度评审需求是否可测、可验收、覆盖关键场景。",
        "criteria": [
            "验收标准是否明确且可量化",
            "正常流程、异常流程和边界场景是否完整",
            "流程图、表格和文字描述是否一致",
            "是否足以设计测试用例和测试数据",
        ],
        "pass_score": 80,
    },
    {
        "name": "用户",
        "definition": "从业务价值和最终用户体验角度评审需求是否有用、易懂、流程自然。",
        "criteria": [
            "业务目标和用户价值是否明确",
            "用户场景、操作路径和角色权限是否清晰",
            "页面文案、提示和交互预期是否易理解",
            "是否覆盖用户真实使用中的关键分支",
        ],
        "pass_score": 80,
    },
]


ROLE_SIGNALS = {
    "产品": {
        "目标与指标": ["目标", "指标", "收益", "价值", "背景", "痛点", "成功标准"],
        "范围与优先级": ["范围", "优先级", "版本", "一期", "二期", "不做", "边界"],
        "产品规则": ["规则", "策略", "状态", "权限", "流程", "约束", "条件"],
        "验收与影响": ["验收", "上线", "影响", "灰度", "回滚", "埋点", "监控"],
    },
    "测试": {
        "验收标准": ["验收", "通过标准", "验收标准", "成功条件", "判定"],
        "异常场景": ["异常", "失败", "错误", "为空", "超时", "取消", "回退"],
        "边界场景": ["边界", "最大", "最小", "限制", "重复", "并发", "权限"],
        "测试数据": ["测试", "用例", "测试数据", "样例", "示例", "输入", "输出"],
    },
    "用户": {
        "业务目标": ["目标", "价值", "收益", "背景", "痛点", "业务"],
        "用户场景": ["用户", "场景", "角色", "使用", "操作", "流程"],
        "体验与文案": ["页面", "按钮", "提示", "文案", "交互", "展示", "通知"],
        "关键分支": ["成功", "失败", "取消", "修改", "删除", "审批", "驳回"],
    },
}


@dataclass
class ExtractedDocument:
    pdf_path: Path
    pages: list[str]
    tables: list[dict[str, Any]]
    page_images: list[Path]

    @property
    def text(self) -> str:
        chunks = []
        for index, page_text in enumerate(self.pages, start=1):
            chunks.append(f"## 第 {index} 页文字\n{page_text.strip() or '[未提取到文字]'}")

        if self.tables:
            table_lines = ["## 表格内容"]
            for table in self.tables:
                table_lines.append(f"### 第 {table['page']} 页表格 {table['index']}")
                table_lines.append(table_to_markdown(table["rows"]))
            chunks.append("\n".join(table_lines))

        if self.page_images:
            image_lines = ["## 页面截图"]
            image_lines.extend(str(path) for path in self.page_images)
            chunks.append("\n".join(image_lines))

        return "\n\n".join(chunks)


def main() -> int:
    parser = argparse.ArgumentParser(description="评审 PDF 需求文档并生成报告。")
    parser.add_argument("pdf", type=Path, help="需求文档 PDF 路径")
    parser.add_argument("--roles", type=Path, default=Path("roles.json"), help="角色配置 JSON")
    parser.add_argument("--out", type=Path, default=Path("reports"), help="报告输出目录")
    parser.add_argument("--threshold", type=int, default=80, help="默认通过分数")
    parser.add_argument("--max-chars", type=int, default=55000, help="发送给模型的最大字符数")
    parser.add_argument("--no-llm", action="store_true", help="不调用大模型，只使用本地规则打分")
    args = parser.parse_args()

    if not args.pdf.exists():
        print(f"找不到 PDF 文件：{args.pdf}", file=sys.stderr)
        return 2

    args.out.mkdir(parents=True, exist_ok=True)
    asset_dir = args.out / f"{args.pdf.stem}_assets"
    asset_dir.mkdir(parents=True, exist_ok=True)

    roles = load_roles(args.roles)
    document = extract_pdf(args.pdf, asset_dir)
    document_text = limit_text(document.text, args.max_chars)

    reviews = []
    for role in roles:
        review = review_document(role, document_text, args.threshold, use_llm=not args.no_llm)
        reviews.append(review)

    report = build_report(document, reviews, args.threshold)
    json_report = {
        "pdf": str(args.pdf.resolve()),
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "passed": all(item["passed"] for item in reviews),
        "reviews": reviews,
        "extraction": {
            "pages": len(document.pages),
            "tables": len(document.tables),
            "page_images": [str(path.resolve()) for path in document.page_images],
        },
    }

    report_path = args.out / f"{args.pdf.stem}_review.md"
    json_path = args.out / f"{args.pdf.stem}_review.json"
    report_path.write_text(report, encoding="utf-8")
    json_path.write_text(json.dumps(json_report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"评审完成：{report_path.resolve()}")
    print(f"结构化结果：{json_path.resolve()}")
    return 0


def load_roles(path: Path) -> list[dict[str, Any]]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return DEFAULT_ROLES


def extract_pdf(pdf_path: Path, asset_dir: Path) -> ExtractedDocument:
    pages = extract_text_with_pymupdf(pdf_path, asset_dir)
    if pages is None:
        pages = extract_text_with_pdfplumber(pdf_path)

    tables = extract_tables_with_pdfplumber(pdf_path)
    images = render_pages_with_pymupdf(pdf_path, asset_dir)

    if pages is None:
        raise RuntimeError(
            "无法解析 PDF。请先安装依赖：python3 -m pip install -r requirements.txt"
        )

    return ExtractedDocument(pdf_path=pdf_path, pages=pages, tables=tables, page_images=images)


def extract_text_with_pymupdf(pdf_path: Path, asset_dir: Path) -> list[str] | None:
    try:
        import fitz  # type: ignore
    except ImportError:
        return None

    doc = fitz.open(pdf_path)
    text_pages = [page.get_text("text") for page in doc]
    doc.close()
    return text_pages


def extract_text_with_pdfplumber(pdf_path: Path) -> list[str] | None:
    try:
        import pdfplumber  # type: ignore
    except ImportError:
        return None

    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    return pages


def extract_tables_with_pdfplumber(pdf_path: Path) -> list[dict[str, Any]]:
    try:
        import pdfplumber  # type: ignore
    except ImportError:
        return []

    tables: list[dict[str, Any]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_index, page in enumerate(pdf.pages, start=1):
            for table_index, table in enumerate(page.extract_tables() or [], start=1):
                rows = [[cell or "" for cell in row] for row in table if row]
                if rows:
                    tables.append({"page": page_index, "index": table_index, "rows": rows})
    return tables


def render_pages_with_pymupdf(pdf_path: Path, asset_dir: Path) -> list[Path]:
    try:
        import fitz  # type: ignore
    except ImportError:
        return []

    image_dir = asset_dir / "pages"
    image_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(pdf_path)
    image_paths = []
    for page_index, page in enumerate(doc, start=1):
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        image_path = image_dir / f"page_{page_index:03d}.png"
        pixmap.save(image_path)
        image_paths.append(image_path)
    doc.close()
    return image_paths


def review_document(
    role: dict[str, Any], document_text: str, default_threshold: int, use_llm: bool
) -> dict[str, Any]:
    if use_llm and os.getenv("LLM_API_KEY"):
        try:
            return llm_review(role, document_text, default_threshold)
        except Exception as exc:
            fallback = heuristic_review(role, document_text, default_threshold)
            fallback["review_mode"] = "local_rules_after_llm_error"
            fallback["llm_error"] = str(exc)
            return fallback

    review = heuristic_review(role, document_text, default_threshold)
    review["review_mode"] = "local_rules"
    return review


def llm_review(role: dict[str, Any], document_text: str, default_threshold: int) -> dict[str, Any]:
    pass_score = int(role.get("pass_score", default_threshold))
    criteria = "\n".join(f"- {item}" for item in role.get("criteria", []))
    prompt = f"""
你现在扮演「{role['name']}」角色。

角色定义：
{role.get('definition', '')}

评审标准：
{criteria}

请评审下面的需求文档，给出 0-100 分。分数 >= {pass_score} 代表该角色通过。
如果未通过，必须说明原因和优化方向。即使通过，也请给出主要风险点和建议。

只输出 JSON，不要输出 Markdown。JSON 结构必须是：
{{
  "role": "{role['name']}",
  "score": 0,
  "passed": false,
  "reasons": [],
  "suggestions": [],
  "risks": []
}}

需求文档内容：
{document_text}
""".strip()

    response = call_chat_completion(prompt)
    data = parse_json_object(response)
    return normalize_review(data, role["name"], pass_score, "llm")


def call_chat_completion(prompt: str) -> str:
    api_key = os.environ["LLM_API_KEY"]
    base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    url = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你是严谨的需求评审助手，只输出合法 JSON。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    try:
        return post_json(url, api_key, payload)
    except RuntimeError:
        payload.pop("response_format", None)
        return post_json(url, api_key, payload)


def post_json(url: str, api_key: str, payload: dict[str, Any]) -> str:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"LLM 请求失败：HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"LLM 请求失败：{exc.reason}") from exc

    return data["choices"][0]["message"]["content"]


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def heuristic_review(
    role: dict[str, Any], document_text: str, default_threshold: int
) -> dict[str, Any]:
    role_name = role["name"]
    pass_score = int(role.get("pass_score", default_threshold))
    signals = ROLE_SIGNALS.get(role_name, {})

    missing = []
    found = []
    for topic, keywords in signals.items():
        if any(keyword.lower() in document_text.lower() for keyword in keywords):
            found.append(topic)
        else:
            missing.append(topic)

    length_bonus = min(max(len(document_text) // 2500, 0), 8)
    score = 100 - len(missing) * 10 + length_bonus
    score = max(45, min(95, score))
    passed = score >= pass_score and not missing

    if missing:
        reasons = [f"缺少或未明显描述：{item}" for item in missing]
        suggestions = [suggest_for(role_name, item) for item in missing]
    else:
        reasons = ["核心信息较完整，未发现会阻断该角色评审通过的明显缺口。"]
        suggestions = ["建议继续补充更具体的示例、验收条件和风险说明，便于后续落地。"]

    return normalize_review(
        {
            "role": role_name,
            "score": score,
            "passed": passed,
            "reasons": reasons,
            "suggestions": suggestions,
            "risks": [] if missing else ["本地规则评审只能做关键词和结构判断，建议接入大模型做语义复核。"],
        },
        role_name,
        pass_score,
        "local_rules",
    )


def suggest_for(role_name: str, topic: str) -> str:
    suggestions = {
        "产品": {
            "目标与指标": "补充需求背景、用户痛点、产品目标和可衡量的成功指标。",
            "范围与优先级": "明确本次版本范围、功能优先级、不做范围和后续迭代边界。",
            "产品规则": "补充核心业务规则、状态流转、权限约束和关键判断条件。",
            "验收与影响": "补充验收口径、上线影响、灰度/回滚方案以及必要的埋点或监控。",
        },
        "测试": {
            "验收标准": "为每个功能点增加可判断的验收标准，避免只写主观描述。",
            "异常场景": "补充失败、取消、超时、权限不足、数据不存在等异常路径。",
            "边界场景": "补充最大值、最小值、重复、并发、空数据等边界条件。",
            "测试数据": "补充输入样例、输出样例和测试数据准备方式。",
        },
        "用户": {
            "业务目标": "说明业务背景、用户痛点、目标收益和成功指标。",
            "用户场景": "补充目标用户、典型场景、前置条件和完整操作路径。",
            "体验与文案": "补充页面元素、按钮动作、提示文案和交互反馈。",
            "关键分支": "补充成功、失败、撤销、修改、审批或驳回等用户分支。",
        },
    }
    return suggestions.get(role_name, {}).get(topic, f"补充「{topic}」相关说明。")


def normalize_review(
    data: dict[str, Any], role_name: str, pass_score: int, review_mode: str
) -> dict[str, Any]:
    score = int(data.get("score", 0))
    score = max(0, min(100, score))
    passed = bool(data.get("passed", score >= pass_score))
    return {
        "role": str(data.get("role") or role_name),
        "score": score,
        "passed": passed,
        "pass_score": pass_score,
        "reasons": ensure_string_list(data.get("reasons")),
        "suggestions": ensure_string_list(data.get("suggestions")),
        "risks": ensure_string_list(data.get("risks")),
        "review_mode": review_mode,
    }


def ensure_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    return [str(value)]


def table_to_markdown(rows: list[list[str]]) -> str:
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    normalized = [row + [""] * (width - len(row)) for row in rows]
    header = normalized[0]
    separator = ["---"] * width
    body = normalized[1:]
    lines = [
        "| " + " | ".join(clean_cell(cell) for cell in header) + " |",
        "| " + " | ".join(separator) + " |",
    ]
    for row in body:
        lines.append("| " + " | ".join(clean_cell(cell) for cell in row) + " |")
    return "\n".join(lines)


def clean_cell(value: str) -> str:
    return str(value).replace("\n", " ").replace("|", "\\|").strip()


def limit_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    omitted = len(text) - max_chars
    return text[:max_chars] + f"\n\n[内容过长，已截断 {omitted} 个字符]"


def build_report(
    document: ExtractedDocument, reviews: list[dict[str, Any]], default_threshold: int
) -> str:
    passed = all(review["passed"] for review in reviews)
    conclusion = "通过" if passed else "未通过"
    generated_at = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = [
        f"# 需求文档评审报告",
        "",
        f"- 文档：`{document.pdf_path.resolve()}`",
        f"- 生成时间：{generated_at}",
        f"- 评审结论：**{conclusion}**",
        f"- 默认通过分数：{default_threshold}",
        f"- 解析页数：{len(document.pages)}",
        f"- 提取表格：{len(document.tables)}",
        f"- 页面截图：{len(document.page_images)}",
        "",
        "## 评分汇总",
        "",
        "| 角色 | 分数 | 通过线 | 结果 | 模式 |",
        "| --- | ---: | ---: | --- | --- |",
    ]

    for review in reviews:
        result = "通过" if review["passed"] else "未通过"
        lines.append(
            f"| {review['role']} | {review['score']} | {review['pass_score']} | {result} | {review['review_mode']} |"
        )

    lines.extend(["", "## 角色评审详情", ""])
    for review in reviews:
        result = "通过" if review["passed"] else "未通过"
        lines.extend(
            [
                f"### {review['role']}：{result}",
                "",
                f"- 分数：{review['score']}/{100}",
                f"- 通过线：{review['pass_score']}",
                "",
                "原因：",
            ]
        )
        lines.extend(format_list(review["reasons"]))
        lines.append("")
        lines.append("优化方向：")
        lines.extend(format_list(review["suggestions"]))
        if review["risks"]:
            lines.append("")
            lines.append("风险提示：")
            lines.extend(format_list(review["risks"]))
        if review.get("llm_error"):
            lines.append("")
            lines.append(f"LLM 调用异常：`{review['llm_error']}`")
        lines.append("")

    if document.page_images:
        lines.extend(["## 页面截图路径", ""])
        lines.extend(f"- `{path.resolve()}`" for path in document.page_images)
        lines.append("")

    lines.extend(
        [
            "## 说明",
            "",
            textwrap.dedent(
                """
                - `local_rules` 是本地规则评审，只适合跑通流程和做粗略检查。
                - 设置 `LLM_API_KEY` 后会改用大模型按角色语义评审。
                - 流程图在 MVP 中先渲染为页面截图；如果需要识别图中节点和连线，下一步可接入视觉模型。
                """
            ).strip(),
            "",
        ]
    )
    return "\n".join(lines)


def format_list(items: list[str]) -> list[str]:
    if not items:
        return ["- 无"]
    return [f"- {item}" for item in items]


if __name__ == "__main__":
    raise SystemExit(main())
