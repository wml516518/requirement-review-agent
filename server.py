#!/usr/bin/env python3
"""Local web server and model review proxy.

The browser page never receives the API key. Model API keys are encrypted on
disk and decrypted only when the server calls the configured model.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from pdf_visual_detector import decode_pdf_data_url, detect_pdf_visual_pages

try:
    from cryptography.fernet import Fernet, InvalidToken  # type: ignore
except ImportError:  # pragma: no cover - handled at runtime with a clear error.
    Fernet = None  # type: ignore
    InvalidToken = Exception  # type: ignore


ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT)).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
ROLES_STORE = DATA_DIR / "roles_store.json"
MODELS_STORE = DATA_DIR / "llm_models_store.json"
MODEL_SECRET_FILE = DATA_DIR / ".llm_secret"
SENSITIVE_FILES = {".env", ".llm_secret", "llm_models_store.json"}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


load_env_file(ROOT / ".env")

DEFAULT_MAX_COMPLETION_TOKENS = int(os.getenv("LLM_MAX_COMPLETION_TOKENS", "4096"))


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
    },
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the requirement review web app.")
    default_host = os.getenv("HOST") or ("0.0.0.0" if os.getenv("PORT") else "127.0.0.1")
    default_port = int(os.getenv("PORT", "8000"))
    parser.add_argument("--host", default=default_host)
    parser.add_argument("--port", type=int, default=default_port)
    parser.add_argument("--test-only", action="store_true", help="Only test selected model connectivity.")
    args = parser.parse_args()

    if args.test_only:
        result = test_llm()
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["ok"] else 1

    server = ThreadingHTTPServer((args.host, args.port), ReviewHandler)
    print(f"Serving requirement review app at http://{args.host}:{args.port}")
    selected_model = get_selected_model(redact=True)
    if selected_model:
        print(f"Selected model: {selected_model['name']} ({selected_model['model']})")
    else:
        print("Selected model: none")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


class ReviewHandler(BaseHTTPRequestHandler):
    server_version = "RequirementReview/0.1"

    def send_response(self, code: int, message: str | None = None) -> None:
        self._cors_headers_sent = False
        super().send_response(code, message)

    def end_headers(self) -> None:
        if not getattr(self, "_cors_headers_sent", False):
            self.send_cors_headers()
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_HEAD(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path in ("", "/"):
            path = "/index.html"

        file_path = (ROOT / path.lstrip("/")).resolve()
        if not str(file_path).startswith(str(ROOT)) or not file_path.exists() or file_path.is_dir():
            self.send_error(404)
            return
        if file_path.name in SENSITIVE_FILES or file_path.name.startswith("."):
            self.send_error(404)
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(file_path.stat().st_size))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_GET(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/health":
            self.send_json({"ok": True, "service": "requirement-review"})
            return
        if path == "/api/health/llm":
            self.send_json(test_llm())
            return
        if path == "/api/models":
            self.send_json({"ok": True, **load_model_store_public()})
            return
        if path == "/api/roles":
            self.send_json({"ok": True, "roles": load_roles_store()})
            return


        if path in ("", "/"):
            path = "/index.html"

        file_path = (ROOT / path.lstrip("/")).resolve()
        if not str(file_path).startswith(str(ROOT)) or not file_path.exists() or file_path.is_dir():
            self.send_error(404)
            return
        if file_path.name in SENSITIVE_FILES or file_path.name.startswith("."):
            self.send_error(404)
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        model_test_id = parse_model_action_id(path, "test")
        if model_test_id:
            self.handle_test_model(model_test_id)
            return

        if path == "/api/models":
            self.handle_create_model()
            return

        if path == "/api/models/select":
            self.handle_select_model()
            return

        if path == "/api/roles/suggest-criteria":
            self.handle_suggest_criteria()
            return

        if path == "/api/roles":
            self.handle_create_role()
            return

        if path in ("/api/review", "/api/ask"):
            self.handle_review()
            return

        if path == "/api/pdf/visual-pages":
            self.handle_pdf_visual_pages()
            return

        self.send_error(404)

    def do_PUT(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        model_id = parse_model_id(path)
        if model_id:
            self.handle_update_model(model_id)
            return

        role_id = parse_role_id(path)
        if not role_id:
            self.send_error(404)
            return

        try:
            payload = self.read_json()
            role = normalize_role_payload(payload, role_id=role_id)
            roles = load_roles_store()
            index = next((i for i, item in enumerate(roles) if item["id"] == role_id), -1)
            if index < 0:
                self.send_json({"ok": False, "error": "角色不存在。"}, status=404)
                return
            roles[index] = role
            save_roles_store(roles)
            self.send_json({"ok": True, "role": role})
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)

    def do_DELETE(self) -> None:
        path = urllib.parse.urlparse(self.path).path
        model_id = parse_model_id(path)
        if model_id:
            self.handle_delete_model(model_id)
            return

        role_id = parse_role_id(path)
        if not role_id:
            self.send_error(404)
            return

        roles = load_roles_store()
        next_roles = [role for role in roles if role["id"] != role_id]
        if len(next_roles) == len(roles):
            self.send_json({"ok": False, "error": "角色不存在。"}, status=404)
            return
        save_roles_store(next_roles)
        self.send_json({"ok": True, "roles": next_roles})

    def handle_create_role(self) -> None:
        try:
            payload = self.read_json()
            role = normalize_role_payload(payload)
            roles = load_roles_store()
            roles.append(role)
            save_roles_store(roles)
            self.send_json({"ok": True, "role": role})
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)

    def handle_suggest_criteria(self) -> None:
        try:
            payload = self.read_json()
            name = str(payload.get("name") or "").strip()
            definition = str(payload.get("definition") or "").strip()
            model = require_model_config(str(payload.get("modelId") or "").strip() or None)
            if not name or not definition:
                raise ValueError("请先填写角色名称和角色定义。")
            result = suggest_role_criteria(name, definition, model)
            self.send_json({"ok": True, **result})
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=500)

    def handle_review(self) -> None:
        try:
            payload = self.read_json()
            document_text = str(payload.get("text") or "").strip()
            threshold = int(payload.get("threshold") or 80)
            roles = normalize_roles(payload.get("roles"))
            page_images = normalize_page_images(payload.get("pageImages"))
            model = require_model_config(str(payload.get("modelId") or "").strip() or None)
            if not document_text:
                raise ValueError("缺少需求文档内容。")
            if not roles:
                raise ValueError("请至少配置一个有效评审角色。")
            reviews = review_document(document_text, threshold, roles, model, page_images)
            self.send_json(
                {
                    "ok": True,
                    "mode": "model",
                    "model": public_model(model),
                    "reviews": reviews,
                }
            )
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=500)

    def handle_pdf_visual_pages(self) -> None:
        try:
            payload = self.read_json()
            pdf_data_url = str(payload.get("pdfDataUrl") or "")
            pdf_bytes = decode_pdf_data_url(pdf_data_url)
            result = detect_pdf_visual_pages(pdf_bytes)
            self.send_json(result)
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)

    def handle_create_model(self) -> None:
        try:
            payload = self.read_json()
            store = load_model_store_private()
            model = normalize_model_payload(payload)
            store["models"].append(model)
            if payload.get("selected") or not store.get("selectedModelId"):
                store["selectedModelId"] = model["id"]
            save_model_store_private(store)
            self.send_json({"ok": True, **load_model_store_public()})
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)

    def handle_update_model(self, model_id: str) -> None:
        try:
            payload = self.read_json()
            store = load_model_store_private()
            index = next((i for i, item in enumerate(store["models"]) if item["id"] == model_id), -1)
            if index < 0:
                self.send_json({"ok": False, "error": "模型配置不存在。"}, status=404)
                return
            current = store["models"][index]
            model = normalize_model_payload(payload, model_id=model_id, existing=current)
            store["models"][index] = model
            if payload.get("selected"):
                store["selectedModelId"] = model["id"]
            save_model_store_private(store)
            self.send_json({"ok": True, **load_model_store_public()})
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)

    def handle_delete_model(self, model_id: str) -> None:
        store = load_model_store_private()
        next_models = [model for model in store["models"] if model["id"] != model_id]
        if len(next_models) == len(store["models"]):
            self.send_json({"ok": False, "error": "模型配置不存在。"}, status=404)
            return
        store["models"] = next_models
        if store.get("selectedModelId") == model_id:
            store["selectedModelId"] = next_models[0]["id"] if next_models else None
        save_model_store_private(store)
        self.send_json({"ok": True, **load_model_store_public()})

    def handle_select_model(self) -> None:
        try:
            payload = self.read_json()
            model_id = str(payload.get("modelId") or "").strip()
            store = load_model_store_private()
            if not any(model["id"] == model_id for model in store["models"]):
                raise ValueError("模型配置不存在。")
            store["selectedModelId"] = model_id
            save_model_store_private(store)
            self.send_json({"ok": True, **load_model_store_public()})
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)

    def handle_test_model(self, model_id: str) -> None:
        try:
            model = require_model_config(model_id)
            self.send_json(test_llm(model))
        except Exception as exc:
            self.send_json({"ok": False, "error": str(exc)}, status=400)

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_cors_headers(self) -> None:
        self._cors_headers_sent = True
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def parse_model_id(path: str) -> str | None:
    prefix = "/api/models/"
    if not path.startswith(prefix):
        return None
    model_id = urllib.parse.unquote(path[len(prefix) :]).strip()
    if not model_id or "/" in model_id:
        return None
    return model_id


def parse_model_action_id(path: str, action: str) -> str | None:
    prefix = "/api/models/"
    suffix = f"/{action}"
    if not path.startswith(prefix) or not path.endswith(suffix):
        return None
    model_id = urllib.parse.unquote(path[len(prefix) : -len(suffix)]).strip()
    return model_id or None


def load_model_store_public() -> dict[str, Any]:
    store = load_model_store_private(redact=True)
    return {
        "models": [public_model(model) for model in store["models"]],
        "selectedModelId": store.get("selectedModelId"),
    }


def load_model_store_private(redact: bool = False) -> dict[str, Any]:
    if not MODELS_STORE.exists():
        bootstrap_models_store()
    try:
        raw = json.loads(MODELS_STORE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        raw = {"selectedModelId": None, "models": []}

    models = []
    for item in raw.get("models", []):
        if not isinstance(item, dict):
            continue
        model = normalize_stored_model(item, redact=redact)
        if model:
            models.append(model)
    selected = raw.get("selectedModelId")
    if selected and not any(model["id"] == selected for model in models):
        selected = None
    if not selected and models:
        selected = models[0]["id"]
    return {"selectedModelId": selected, "models": models}


def save_model_store_private(store: dict[str, Any]) -> None:
    data = {
        "selectedModelId": store.get("selectedModelId"),
        "models": [stored_model_payload(model) for model in store.get("models", [])],
    }
    MODELS_STORE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def bootstrap_models_store() -> None:
    models = []
    if os.getenv("AZURE_OPENAI_API_KEY"):
        models.append(
            normalize_model_payload(
                {
                    "name": os.getenv("AZURE_OPENAI_MODEL", "Azure OpenAI"),
                    "provider": "azure",
                    "baseUrl": os.getenv(
                        "AZURE_OPENAI_ENDPOINT",
                        "https://soimt-pm.cognitiveservices.azure.com/",
                    ),
                    "deployment": os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini-email"),
                    "apiVersion": os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview"),
                    "model": os.getenv("AZURE_OPENAI_MODEL", "gpt-5.4-mini"),
                    "apiKey": os.getenv("AZURE_OPENAI_API_KEY"),
                    "maxCompletionTokens": DEFAULT_MAX_COMPLETION_TOKENS,
                }
            )
        )
    elif os.getenv("LLM_API_KEY"):
        models.append(
            normalize_model_payload(
                {
                    "name": os.getenv("LLM_MODEL", "OpenAI Compatible"),
                    "provider": "openai_compatible",
                    "baseUrl": os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
                    "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
                    "apiKey": os.getenv("LLM_API_KEY"),
                    "maxCompletionTokens": DEFAULT_MAX_COMPLETION_TOKENS,
                }
            )
        )
    save_model_store_private({"selectedModelId": models[0]["id"] if models else None, "models": models})


def normalize_stored_model(item: dict[str, Any], redact: bool = False) -> dict[str, Any] | None:
    try:
        encrypted_key = str(item.get("apiKeyEncrypted") or "")
        api_key = "" if redact else decrypt_secret(encrypted_key)
        return {
            "id": str(item.get("id") or f"model-{uuid.uuid4().hex[:12]}").strip(),
            "name": str(item.get("name") or "").strip(),
            "provider": normalize_provider(item.get("provider")),
            "baseUrl": str(item.get("baseUrl") or "").strip().rstrip("/"),
            "model": str(item.get("model") or "").strip(),
            "deployment": str(item.get("deployment") or "").strip(),
            "apiVersion": str(item.get("apiVersion") or "").strip(),
            "apiKey": api_key,
            "apiKeyEncrypted": encrypted_key,
            "maxCompletionTokens": normalize_token_limit(item.get("maxCompletionTokens")),
        }
    except Exception:
        return None


def normalize_model_payload(
    payload: dict[str, Any],
    model_id: str | None = None,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("模型配置格式不正确。")
    existing = existing or {}
    provider = normalize_provider(payload.get("provider") or existing.get("provider"))
    name = str(payload.get("name") or existing.get("name") or "").strip()
    base_url = str(payload.get("baseUrl") or existing.get("baseUrl") or "").strip().rstrip("/")
    model = str(payload.get("model") or existing.get("model") or "").strip()
    deployment = str(payload.get("deployment") or existing.get("deployment") or "").strip()
    api_version = str(payload.get("apiVersion") or existing.get("apiVersion") or "").strip()
    api_key = str(payload.get("apiKey") or "").strip()
    encrypted = str(existing.get("apiKeyEncrypted") or "")

    if not name:
        raise ValueError("请填写大模型名称。")
    if not base_url:
        raise ValueError("请填写 API 地址。")
    if provider == "azure":
        if not deployment:
            raise ValueError("Azure OpenAI 需要填写部署名称。")
        if not api_version:
            raise ValueError("Azure OpenAI 需要填写 API Version。")
        model = model or deployment
    elif not model:
        raise ValueError("请填写模型标识。")
    if api_key:
        encrypted = encrypt_secret(api_key)
    if not encrypted:
        raise ValueError("请填写 API Key。")

    return {
        "id": model_id or str(payload.get("id") or f"model-{uuid.uuid4().hex[:12]}").strip(),
        "name": name,
        "provider": provider,
        "baseUrl": base_url,
        "model": model,
        "deployment": deployment,
        "apiVersion": api_version,
        "apiKey": api_key or str(existing.get("apiKey") or ""),
        "apiKeyEncrypted": encrypted,
        "maxCompletionTokens": normalize_token_limit(
            payload.get("maxCompletionTokens", existing.get("maxCompletionTokens"))
        ),
    }


def normalize_provider(value: Any) -> str:
    provider = str(value or "openai_compatible").strip()
    if provider not in {"openai_compatible", "azure"}:
        raise ValueError("模型类型仅支持 OpenAI 兼容接口或 Azure OpenAI。")
    return provider


def normalize_token_limit(value: Any) -> int:
    try:
        return max(128, min(65536, int(value or DEFAULT_MAX_COMPLETION_TOKENS)))
    except (TypeError, ValueError):
        return DEFAULT_MAX_COMPLETION_TOKENS


def stored_model_payload(model: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": model["id"],
        "name": model["name"],
        "provider": model["provider"],
        "baseUrl": model["baseUrl"],
        "model": model["model"],
        "deployment": model.get("deployment", ""),
        "apiVersion": model.get("apiVersion", ""),
        "apiKeyEncrypted": model["apiKeyEncrypted"],
        "maxCompletionTokens": model["maxCompletionTokens"],
    }


def public_model(model: dict[str, Any]) -> dict[str, Any]:
    has_key = bool(model.get("apiKeyEncrypted") or model.get("apiKey"))
    return {
        "id": model["id"],
        "name": model["name"],
        "provider": model["provider"],
        "baseUrl": model["baseUrl"],
        "model": model["model"],
        "deployment": model.get("deployment", ""),
        "apiVersion": model.get("apiVersion", ""),
        "maxCompletionTokens": model["maxCompletionTokens"],
        "hasApiKey": has_key,
    }


def require_model_config(model_id: str | None = None) -> dict[str, Any]:
    store = load_model_store_private()
    target_id = model_id or store.get("selectedModelId")
    if not target_id:
        raise RuntimeError("请先在大模型 API 设置中新增并选择一个可用模型。")
    model = next((item for item in store["models"] if item["id"] == target_id), None)
    if not model:
        raise RuntimeError("当前选择的大模型配置不存在。")
    if not model.get("apiKey"):
        model["apiKey"] = decrypt_secret(model["apiKeyEncrypted"])
    return model


def get_selected_model(redact: bool = False) -> dict[str, Any] | None:
    store = load_model_store_private(redact=redact)
    selected = store.get("selectedModelId")
    return next((item for item in store["models"] if item["id"] == selected), None)


def encrypt_secret(value: str) -> str:
    return get_cipher().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    if not value:
        return ""
    try:
        return get_cipher().decrypt(value.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError("API Key 解密失败，可能是 .llm_secret 被替换或丢失。") from exc


def get_cipher() -> Any:
    if Fernet is None:
        raise RuntimeError("缺少 cryptography 依赖，请先运行：python3 -m pip install -r requirements.txt")
    secret = get_or_create_secret()
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def get_or_create_secret() -> bytes:
    if MODEL_SECRET_FILE.exists():
        return MODEL_SECRET_FILE.read_bytes().strip()
    secret = base64.urlsafe_b64encode(os.urandom(32))
    MODEL_SECRET_FILE.write_bytes(secret)
    try:
        MODEL_SECRET_FILE.chmod(0o600)
    except OSError:
        pass
    return secret


def test_llm(model: dict[str, Any] | None = None) -> dict[str, Any]:
    model = model or get_selected_model()
    if not model:
        return {"ok": False, "error": "请先新增并选择一个大模型 API 配置。"}
    if not model.get("apiKey"):
        try:
            model = require_model_config(model["id"])
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    try:
        content = call_model_chat(
            model,
            [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "请只回复：模型已连通"},
            ],
            max_completion_tokens=128,
        )
        return {
            "ok": True,
            "model": public_model(model),
            "message": content,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def parse_role_id(path: str) -> str | None:
    prefix = "/api/roles/"
    if not path.startswith(prefix):
        return None
    role_id = urllib.parse.unquote(path[len(prefix) :]).strip()
    return role_id or None


def load_roles_store() -> list[dict[str, Any]]:
    if not ROLES_STORE.exists():
        save_roles_store(DEFAULT_ROLES)
    try:
        data = json.loads(ROLES_STORE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        data = DEFAULT_ROLES
    return normalize_roles(data)


def save_roles_store(roles: list[dict[str, Any]]) -> None:
    ROLES_STORE.write_text(json.dumps(roles, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_role_payload(payload: dict[str, Any], role_id: str | None = None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("角色数据格式不正确。")

    role = normalize_roles([{**payload, "id": role_id or payload.get("id") or f"role-{uuid.uuid4().hex[:12]}"}])
    if not role:
        raise ValueError("角色名称、定义和评审标准不能为空。")
    return role[0]


def normalize_roles(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return DEFAULT_ROLES

    roles = []
    for item in value:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        definition = str(item.get("definition") or "").strip()
        criteria_value = item.get("criteria")
        if isinstance(criteria_value, list):
            criteria = [str(entry).strip() for entry in criteria_value if str(entry).strip()]
        else:
            criteria = [line.strip() for line in str(criteria_value or "").splitlines() if line.strip()]
        criteria = criteria[:12]
        if name and definition and criteria:
            role_id = str(item.get("id") or f"role-{uuid.uuid4().hex[:12]}").strip()
            roles.append({"id": role_id, "name": name, "definition": definition, "criteria": criteria})
    return roles


def normalize_page_images(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    images = []
    for item in value:
        if not isinstance(item, dict):
            continue
        data_url = str(item.get("dataUrl") or "")
        if not data_url.startswith("data:image/"):
            continue
        try:
            page = int(item.get("page") or len(images) + 1)
        except (TypeError, ValueError):
            page = len(images) + 1
        images.append({"page": page, "dataUrl": data_url})
    return images


def review_document(
    document_text: str,
    threshold: int,
    roles: list[dict[str, Any]],
    model: dict[str, Any],
    page_images: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    text = limit_text(document_text, 45000)
    page_images = page_images or []
    reviews = []
    for role in roles:
        criteria = "\n".join(f"- {item}" for item in role["criteria"])
        prompt = f"""
你现在扮演「{role['name']}」角色，对需求文档进行评审打分。

角色定义：
{role['definition']}

评审标准：
{criteria}

文档包含两类输入：
1. 整份 PDF 转换后的 Markdown。普通页面会包含提取文字。
2. PDF 页面截图。截图可能包含表格、流程图、泳道图、节点、箭头、条件分支和异常路径。

请同时理解文字和截图。对于截图中的流程图，请直接识别其节点、判断分支、箭头方向和业务路径。评审时重点检查：
- 流程图中的开始、结束、处理节点、判断节点、箭头方向、分支条件是否清楚。
- 流程图与文字描述是否一致，是否存在图上有但文字未说明、文字有但图上缺失的内容。
- 异常路径、回退路径、审批/驳回/失败等分支是否闭环。
- 表格、页面说明和流程图之间是否存在冲突或遗漏。

请给出 0-100 分。分数 >= {threshold} 代表该角色通过。
如果未通过，必须说明原因和优化方向；即使通过，也要给出主要风险点。

只输出合法 JSON，不要输出 Markdown。JSON 结构必须是：
{{
  "role": "{role['name']}",
  "score": 0,
  "passed": false,
  "reasons": [],
  "suggestions": [],
  "risks": []
}}

需求文档内容：
{text}
""".strip()

        messages = build_review_messages(prompt, page_images)
        try:
            content = call_model_chat(model, messages)
        except RuntimeError:
            if not page_images:
                raise
            content = call_model_chat(
                model,
                [
                    {"role": "system", "content": "你是严谨的需求评审助手，只输出合法 JSON。"},
                    {
                        "role": "user",
                        "content": f"{prompt}\n\n[注意] 当前模型接口未接受页面截图，本次只能基于提取文字评审。",
                    },
                ]
            )
        reviews.append(normalize_review(parse_json_object(content), role, threshold))
    return reviews


def build_review_messages(prompt: str, page_images: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not page_images:
        return [
            {"role": "system", "content": "你是严谨的需求评审助手，只输出合法 JSON。"},
            {"role": "user", "content": prompt},
        ]

    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": (
                f"{prompt}\n\n下面附上 PDF 页面截图，请识别其中的流程图、表格、页面结构和箭头关系。"
            ),
        }
    ]
    for image in page_images:
        content.append({"type": "text", "text": f"第 {image['page']} 页截图："})
        content.append({"type": "image_url", "image_url": {"url": image["dataUrl"]}})

    return [
        {"role": "system", "content": "你是严谨的需求评审助手，只输出合法 JSON。"},
        {"role": "user", "content": content},
    ]


def suggest_role_criteria(name: str, definition: str, model: dict[str, Any]) -> dict[str, Any]:
    prompt = f"""
请为需求文档评审工作流中的「{name}」角色生成评审标准。

角色概述：
{definition}

要求：
1. 输出 4-6 条评审标准。
2. 每条标准要具体、可用于判断需求文档是否合格。
3. 语言简洁，适合直接放在评审表单中。
4. 如果角色概述表达不够专业，可以给出一版更清晰的角色定义。

只输出合法 JSON，不要输出 Markdown。JSON 结构必须是：
{{
  "definition": "润色后的角色定义",
  "criteria": ["评审标准1", "评审标准2"]
}}
""".strip()

    content = call_model_chat(
        model,
        [
            {"role": "system", "content": "你是资深需求评审流程设计专家，只输出合法 JSON。"},
            {"role": "user", "content": prompt},
        ],
        max_completion_tokens=1024,
    )
    data = parse_json_object(content)
    criteria = ensure_string_list(data.get("criteria"))[:6]
    if not criteria:
        raise RuntimeError("模型没有返回有效评审标准。")
    return {
        "definition": str(data.get("definition") or definition).strip(),
        "criteria": criteria,
    }


def call_model_chat(
    model: dict[str, Any],
    messages: list[dict[str, Any]],
    max_completion_tokens: int | None = None,
) -> str:
    api_key = str(model.get("apiKey") or "")
    if not api_key:
        api_key = decrypt_secret(str(model.get("apiKeyEncrypted") or ""))
    if not api_key:
        raise RuntimeError("模型配置缺少 API Key。")

    payload = build_chat_payload(model, messages, max_completion_tokens)
    url = build_chat_url(model)
    headers = {"Content-Type": "application/json"}
    if model["provider"] == "azure":
        headers["api-key"] = api_key
    else:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        data = post_chat_payload(url, headers, payload)
    except RuntimeError:
        if model["provider"] == "azure" or "max_completion_tokens" not in payload:
            raise
        payload["max_tokens"] = payload.pop("max_completion_tokens")
        data = post_chat_payload(url, headers, payload)

    return data["choices"][0]["message"]["content"]


def post_chat_payload(url: str, headers: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=120, context=ssl_context()) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"大模型请求失败：HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"大模型请求失败：{exc.reason}") from exc


def build_chat_url(model: dict[str, Any]) -> str:
    base_url = str(model["baseUrl"]).rstrip("/")
    if model["provider"] == "azure":
        deployment = urllib.parse.quote(str(model["deployment"]), safe="")
        query = urllib.parse.urlencode({"api-version": model["apiVersion"]})
        return f"{base_url}/openai/deployments/{deployment}/chat/completions?{query}"
    if base_url.endswith("/chat/completions"):
        return base_url
    return f"{base_url}/chat/completions"


def build_chat_payload(
    model: dict[str, Any],
    messages: list[dict[str, Any]],
    max_completion_tokens: int | None,
) -> dict[str, Any]:
    token_limit = max_completion_tokens or int(model.get("maxCompletionTokens") or DEFAULT_MAX_COMPLETION_TOKENS)
    payload: dict[str, Any] = {
        "messages": messages,
        "max_completion_tokens": token_limit,
    }
    if model["provider"] != "azure":
        payload["model"] = model["model"]
    return payload


def ssl_context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def normalize_review(data: dict[str, Any], role: dict[str, Any], threshold: int) -> dict[str, Any]:
    score = max(0, min(100, int(data.get("score") or 0)))
    passed = bool(data.get("passed", score >= threshold))
    return {
        "role": str(data.get("role") or role["name"]),
        "definition": role["definition"],
        "score": score,
        "passed": passed,
        "threshold": threshold,
        "reasons": ensure_string_list(data.get("reasons")),
        "suggestions": ensure_string_list(data.get("suggestions")),
        "risks": ensure_string_list(data.get("risks")),
        "reviewMode": "模型评审",
    }


def ensure_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    return [str(value)]



def limit_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    omitted = len(text) - max_chars
    return text[:max_chars] + f"\n\n[内容过长，已截断 {omitted} 个字符]"


if __name__ == "__main__":
    raise SystemExit(main())
