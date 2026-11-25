# Requirement Review Agent

一个面向需求文档的多角色评审助手。它把 PDF 转成结构化文本，识别流程图候选页，生成 Mermaid 草稿，再按产品、测试、用户或自定义角色分别评审，输出可复制的 Markdown 报告。

## 功能

- 使用 PDF.js 提取文字和页面结构，不要求先上传 OCR 结果。
- 用文本密度、图片块、线条和色块特征识别流程图、表格与普通页。
- 将短文本块聚类成节点，按空间顺序推断 Mermaid 连接关系。
- 优先用文字和 Mermaid 评审，只对关键流程图和表格页发送截图复核。
- 支持动态角色库、自定义评审标准、OpenAI 兼容接口与 Azure OpenAI。
- API Key 保存在服务端，页面只拿到脱敏配置；本地磁盘值使用随机密钥加密。
- 模型不可用时保留本地规则兜底，页面明确标出降级模式。

## 本地启动

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python3 server.py
```

打开 `http://127.0.0.1:8000`，上传 PDF 后选择角色和模型即可评审。

## 配置模型

复制 `.env.example` 为 `.env`，或在页面里维护多个模型配置。不要提交 `.env`、`.llm_secret`、`llm_models_store.json` 或 `roles_store.json`。

OpenAI 兼容接口使用：

```text
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_MAX_COMPLETION_TOKENS=4096
```

Azure OpenAI 配置项见 `.env.example`。

## 测试

```bash
python3 -m unittest discover -s . -p 'test_*.py'
```

## 部署

仓库包含 Render Blueprint 和 Netlify 代理配置。Render 健康检查是 `/api/health`；如果使用免费实例，模型配置和角色库写入本地文件，重新部署后会丢失。

## 说明

仓库不包含真实需求文档。演示时可使用一份脱敏的请假审批或报销审批流程图；后续可以补充 `examples/approval-flow-sample.pdf`。
