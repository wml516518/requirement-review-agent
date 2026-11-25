"""PDF visual page detector plugin.

The web app uses this module as an optional backend detector before falling
back to browser-side heuristics. It intentionally depends only on PyMuPDF and
Pillow so the project remains runnable without OpenCV.
"""

from __future__ import annotations

import base64
import io
import re
from dataclasses import dataclass
from typing import Any


MAX_INLINE_PDF_BYTES = 80 * 1024 * 1024


@dataclass
class PageDetection:
    page: int
    kind: str
    confidence: float
    reasons: list[str]
    text_length: int
    text_item_count: int
    metrics: dict[str, Any]

    @property
    def flow_candidate(self) -> bool:
        return self.kind == "flowchart"

    @property
    def table_candidate(self) -> bool:
        return self.kind == "table"

    @property
    def has_visual_content(self) -> bool:
        return self.kind in {"flowchart", "table", "graphic"}

    def to_dict(self) -> dict[str, Any]:
        return {
            "page": self.page,
            "kind": self.kind,
            "confidence": round(self.confidence, 3),
            "reasons": self.reasons,
            "textLength": self.text_length,
            "textItemCount": self.text_item_count,
            "flowCandidate": self.flow_candidate,
            "tableCandidate": self.table_candidate,
            "hasVisualContent": self.has_visual_content,
            "metrics": self.metrics,
        }


def decode_pdf_data_url(data_url: str) -> bytes:
    prefix = "data:application/pdf;base64,"
    if not data_url.startswith(prefix):
        raise ValueError("PDF 数据格式不正确。")
    data = base64.b64decode(data_url[len(prefix) :], validate=True)
    if not data:
        raise ValueError("PDF 数据为空。")
    if len(data) > MAX_INLINE_PDF_BYTES:
        raise ValueError("PDF 文件过大，请使用小于 80MB 的文件。")
    return data


def detect_pdf_visual_pages(pdf_bytes: bytes) -> dict[str, Any]:
    try:
        import fitz  # type: ignore
    except ImportError as exc:  # pragma: no cover - dependency check.
        raise RuntimeError("缺少 PyMuPDF 依赖，请先运行：python3 -m pip install -r requirements.txt") from exc

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    detections: list[PageDetection] = []
    for index, page in enumerate(doc, start=1):
        text = page.get_text("text") or ""
        text_dict = page.get_text("dict") or {}
        strings = extract_text_strings(text_dict)
        page_hints = get_page_hints(page, text_dict)
        metrics = analyze_page_image(page, page_hints)
        detections.append(classify_page(index, text, strings, metrics))
    doc.close()

    expand_flowchart_ranges(detections)
    return {
        "ok": True,
        "detector": "pymupdf-pillow",
        "pages": len(detections),
        "detections": [item.to_dict() for item in detections],
        "summary": {
            "flowPages": [item.page for item in detections if item.flow_candidate],
            "tablePages": [item.page for item in detections if item.table_candidate],
            "visualPages": [item.page for item in detections if item.has_visual_content],
        },
    }


def extract_text_strings(text_dict: dict[str, Any]) -> list[str]:
    strings: list[str] = []
    for block in text_dict.get("blocks", []):
        for line in block.get("lines", []):
            parts = []
            for span in line.get("spans", []):
                text = str(span.get("text") or "").strip()
                if text:
                    parts.append(text)
            if parts:
                strings.append(" ".join(parts))
    return strings


def get_page_hints(page: Any, text_dict: dict[str, Any]) -> dict[str, Any]:
    image_blocks = sum(1 for block in text_dict.get("blocks", []) if block.get("type") == 1)
    text_blocks = sum(1 for block in text_dict.get("blocks", []) if block.get("type") == 0)
    try:
        images = len(page.get_images(full=True))
    except Exception:
        images = image_blocks
    try:
        drawings = page.get_drawings()
    except Exception:
        drawings = []
    rects = 0
    lines = 0
    for drawing in drawings:
        for item in drawing.get("items", []):
            if item and item[0] == "re":
                rects += 1
            elif item and item[0] == "l":
                lines += 1
    return {
        "imageBlocks": image_blocks,
        "textBlocks": text_blocks,
        "images": images,
        "drawingCount": len(drawings),
        "drawingRects": rects,
        "drawingLines": lines,
    }


def analyze_page_image(page: Any, page_hints: dict[str, Any]) -> dict[str, Any]:
    import fitz  # type: ignore
    from PIL import Image

    scale = min(1.0, 260 / max(float(page.rect.width), 1.0))
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    image = Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGB")
    target_width = 480
    if image.width > target_width:
        target_height = max(1, round(image.height * target_width / image.width))
        image = image.resize((target_width, target_height))

    width, height = image.size
    gray = image.convert("L")
    pixels = gray.load()
    rgb_pixels = image.load()
    dark = bytearray(width * height)
    nonwhite = 0
    dark_count = 0
    yellow_or_orange = 0

    for y in range(height):
        for x in range(width):
            lum = pixels[x, y]
            if lum < 245:
                nonwhite += 1
            if lum < 200:
                dark[y * width + x] = 1
                dark_count += 1
            r, g, b = rgb_pixels[x, y]
            if r >= 180 and 95 <= g <= 210 and b <= 120:
                yellow_or_orange += 1

    edge_count = 0
    for y in range(1, height):
        for x in range(1, width):
            lum = pixels[x, y]
            if abs(lum - pixels[x - 1, y]) > 42 or abs(lum - pixels[x, y - 1]) > 42:
                edge_count += 1

    horizontal_runs, dense_rows = count_horizontal_runs(dark, width, height)
    vertical_runs, dense_cols = count_vertical_runs(dark, width, height)
    diagonal_runs = count_diagonal_runs(dark, width, height)
    pixels_total = max(1, width * height)
    line_score = min(42.0, horizontal_runs * 0.22 + vertical_runs * 0.28)
    grid_score = min(28.0, min(dense_rows, 22) * 0.45 + min(dense_cols, 22) * 0.45)
    table_grid_score = min(45.0, min(horizontal_runs, vertical_runs) * 0.55 + min(dense_rows, dense_cols) * 0.8)

    return {
        **page_hints,
        "width": width,
        "height": height,
        "edgeDensity": edge_count / pixels_total,
        "inkDensity": nonwhite / pixels_total,
        "darkDensity": dark_count / pixels_total,
        "yellowOrangeDensity": yellow_or_orange / pixels_total,
        "horizontalRuns": horizontal_runs,
        "verticalRuns": vertical_runs,
        "denseRows": dense_rows,
        "denseCols": dense_cols,
        "diagonalRunCount": diagonal_runs,
        "lineScore": round(line_score, 3),
        "gridScore": round(grid_score, 3),
        "tableGridScore": round(table_grid_score, 3),
        "visualScore": round(line_score + grid_score + min(30.0, edge_count / pixels_total * 190), 3),
    }


def count_horizontal_runs(dark: bytearray, width: int, height: int) -> tuple[int, int]:
    min_run = max(10, round(width * 0.055))
    runs = 0
    dense = 0
    for y in range(height):
        run = 0
        row_dark = 0
        for x in range(width):
            value = dark[y * width + x]
            row_dark += value
            if value:
                run += 1
            else:
                if run >= min_run:
                    runs += 1
                run = 0
        if run >= min_run:
            runs += 1
        if row_dark / max(1, width) > 0.18:
            dense += 1
    return runs, dense


def count_vertical_runs(dark: bytearray, width: int, height: int) -> tuple[int, int]:
    min_run = max(10, round(height * 0.04))
    runs = 0
    dense = 0
    for x in range(width):
        run = 0
        col_dark = 0
        for y in range(height):
            value = dark[y * width + x]
            col_dark += value
            if value:
                run += 1
            else:
                if run >= min_run:
                    runs += 1
                run = 0
        if run >= min_run:
            runs += 1
        if col_dark / max(1, height) > 0.12:
            dense += 1
    return runs, dense


def count_diagonal_runs(dark: bytearray, width: int, height: int) -> int:
    min_run = max(7, round(min(width, height) * 0.035))
    runs = 0
    for y in range(2, max(2, height - min_run - 2), 3):
        for x in range(2, max(2, width - min_run - 2), 3):
            if has_diagonal_run(dark, width, height, x, y, 1, min_run):
                runs += 1
            if has_diagonal_run(dark, width, height, x, y + min_run, -1, min_run):
                runs += 1
    return runs


def has_diagonal_run(dark: bytearray, width: int, height: int, start_x: int, start_y: int, direction: int, min_run: int) -> bool:
    hits = 0
    for step in range(min_run):
        x = start_x + step
        y = start_y + direction * step
        if x < 0 or x >= width or y < 0 or y >= height:
            return False
        if has_dark_near(dark, width, height, x, y):
            hits += 1
    return hits / max(1, min_run) >= 0.65


def has_dark_near(dark: bytearray, width: int, height: int, x: int, y: int) -> bool:
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            px = x + dx
            py = y + dy
            if 0 <= px < width and 0 <= py < height and dark[py * width + px]:
                return True
    return False


def classify_page(page: int, text: str, strings: list[str], metrics: dict[str, Any]) -> PageDetection:
    compact_text = re.sub(r"\s+", "", text)
    text_length = len(compact_text)
    item_count = len(strings)
    short_count = sum(1 for item in strings if 0 < len(item.strip()) <= 8)
    short_ratio = short_count / item_count if item_count else 0
    reasons: list[str] = []

    if is_directory_page(compact_text, strings) or is_document_meta_page(compact_text, strings):
        return PageDetection(page, "none", 0.0, ["疑似目录/文档元信息页"], text_length, item_count, metrics)

    flow_text = bool(re.search(r"流程图|工作流|泳道|状态流转|Start|End|START|END|Flowchart|Workflow|PickList|Process", compact_text, re.I))
    decision_text = bool(re.search(r"判断|是否|条件|分支|Success|Default|Decision|Query", compact_text, re.I))
    vector_table = metrics.get("images", 0) == 0 and (
        (metrics.get("drawingLines", 0) >= 8 and item_count >= 24 and text_length >= 220)
        or (metrics.get("drawingRects", 0) >= 4 and item_count >= 24 and text_length >= 220)
    )
    text_heavy_table = (
        item_count >= 70
        and text_length >= 300
        and metrics["diagonalRunCount"] == 0
        and (metrics["horizontalRuns"] >= 10 or metrics["edgeDensity"] >= 0.015)
    )
    table_text = bool(re.search(r"表格|清单|字段|规则表|配置表|明细|序号|Table|Field|Row|Column|Rule", compact_text, re.I))
    table_like = vector_table or text_heavy_table or (
        metrics["tableGridScore"] >= 8
        and metrics["diagonalRunCount"] == 0
        and not flow_text
        and (table_text or item_count >= 50)
    )

    flow_shape = (
        (metrics.get("images", 0) >= 1 and item_count <= 25 and text_length <= 220)
        or
        metrics["diagonalRunCount"] >= 3
        or metrics["yellowOrangeDensity"] >= 0.003
        or (metrics["lineScore"] >= 12 and text_length <= 220)
    )
    sparse_flow = item_count <= 20 and text_length <= 180 and (
        flow_text or decision_text or metrics["lineScore"] >= 8 or metrics["yellowOrangeDensity"] >= 0.002
    )

    if table_like:
        reasons.append("更像表格/网格页")
        return PageDetection(page, "table", 0.72, reasons, text_length, item_count, metrics)

    if flow_text:
        reasons.append("命中流程关键词")
    if decision_text:
        reasons.append("命中判断/分支关键词")
    if metrics["diagonalRunCount"] >= 3:
        reasons.append("检测到斜向连线")
    if metrics["yellowOrangeDensity"] >= 0.003:
        reasons.append("检测到流程节点色块")
    if sparse_flow:
        reasons.append("低文本流程页")

    flow_score = 0.0
    flow_score += 0.18 if flow_text else 0.0
    flow_score += 0.12 if decision_text else 0.0
    flow_score += min(0.28, metrics["diagonalRunCount"] / 2500)
    flow_score += min(0.18, metrics["lineScore"] / 60)
    flow_score += min(0.18, metrics["yellowOrangeDensity"] * 30)
    flow_score += 0.15 if sparse_flow else 0.0

    if text_length >= 300 and item_count >= 24 and metrics.get("images", 0) == 0:
        flow_score = min(flow_score, 0.18)

    if flow_score >= 0.28 and not table_like:
        return PageDetection(page, "flowchart", min(0.96, flow_score), reasons, text_length, item_count, metrics)

    if metrics["visualScore"] >= 18 or metrics["edgeDensity"] >= 0.006 or metrics["inkDensity"] >= 0.03:
        return PageDetection(page, "graphic", 0.45, ["存在视觉内容"], text_length, item_count, metrics)

    return PageDetection(page, "none", 0.0, reasons, text_length, item_count, metrics)


def expand_flowchart_ranges(detections: list[PageDetection]) -> None:
    strong_pages = [item.page for item in detections if item.kind == "flowchart" and item.confidence >= 0.28]
    for left, right in zip(strong_pages, strong_pages[1:]):
        if right - left <= 1 or right - left > 30:
            continue
        for page in range(left + 1, right):
            detection = detections[page - 1]
            if detection.kind == "table":
                continue
            if detection.text_length > 180 or detection.text_item_count > 20:
                continue
            detection.kind = "flowchart"
            detection.confidence = max(detection.confidence, 0.55)
            detection.reasons.append("位于连续流程图章节中")


def is_directory_page(compact_text: str, strings: list[str]) -> bool:
    if not re.search(r"目录|contents", compact_text, re.I):
        return False
    short_lines = sum(1 for item in strings if 0 < len(item.strip()) <= 24)
    page_numbers = sum(1 for item in strings if re.fullmatch(r"\d{1,3}", item.strip()))
    toc_terms = len(re.findall(r"flow|process|功能需求|vui|wakeup|oneshot|media|navigation|phone|weather", compact_text, re.I))
    return bool(re.search(r"[.·]{3,}|…{2,}", compact_text)) or page_numbers >= 4 or short_lines >= 18 or toc_terms >= 8


def is_document_meta_page(compact_text: str, strings: list[str]) -> bool:
    text = compact_text.lower()
    cover = bool(re.search(r"系统需求说明书|产品开发部|版权所有|版本\d|srs|requirementsspecification", text)) and len(compact_text) <= 180
    meta = bool(re.search(r"文档信息|文档修订历史|修订者|修订日期|修订内容|版本号|最后修订者|审核者|创建日期|documenthistory|revisionhistory", text))
    signature = bool(re.search(r"签字页|审核|批准|部门|签字|日期", text)) and bool(re.search(r"角色|部门|签字|日期", text))
    version_count = sum(1 for item in strings if re.fullmatch(r"v?\d+(?:\.\d+)?", item.strip(), re.I))
    date_count = sum(1 for item in strings if re.search(r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|yyyy-mm-dd", item.strip(), re.I))
    revision_continuation = (
        version_count >= 1
        and bool(re.search(r"流程|判断|补充|更新|修改|删除|增加|修正|change|update|add|fix", compact_text, re.I))
        and bool(re.search(r"冯晴爽|李一峰|作者|修订者|reviewer|author", compact_text, re.I))
    )
    table_header = bool(re.search(r"版本号|修订日期|修订内容|修订者|作者|审核者|创建日期|文档类型|角色|部门|签字", compact_text))
    return cover or meta or signature or table_header or version_count >= 3 or date_count >= 2 or revision_continuation
