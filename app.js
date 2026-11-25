const THUMBNAIL_WIDTH = 600;

const VISUAL_PAGE_KEYWORDS = [
  ["流程图", 8],
  ["工作流", 8],
  ["START", 8],
  ["END", 8],
  ["Start", 8],
  ["End", 8],
  ["Flowchart", 8],
  ["Workflow", 8],
  ["泳道", 8],
  ["状态流转", 7],
  ["流程", 5],
  ["审批", 5],
  ["审核", 5],
  ["驳回", 5],
  ["异常", 4],
  ["回退", 4],
  ["分支", 4],
  ["节点", 4],
  ["箭头", 4],
  ["判断", 4],
  ["是否", 4],
  ["条件", 4],
  ["Query", 4],
  ["Success", 4],
  ["Skip", 4],
  ["Default", 3],
  ["表格", 4],
  ["Table", 4],
  ["规则", 4],
  ["步骤", 3],
  ["开始", 3],
  ["结束", 3],
  ["提交", 3],
  ["失败", 3],
  ["成功", 3],
];

const defaultRoles = [
  {
    id: "product",
    name: "产品",
    definition: "从产品规划角度评审需求目标、范围、优先级、规则和验收口径是否清晰。",
    criteria: [
      "需求背景、目标和成功指标是否明确",
      "功能范围、优先级和不做范围是否清晰",
      "产品规则、状态流转和业务约束是否完整",
      "验收口径、上线影响和版本边界是否说明",
    ],
    signals: {
      "目标与指标": ["目标", "指标", "收益", "价值", "背景", "痛点", "成功标准"],
      "范围与优先级": ["范围", "优先级", "版本", "一期", "二期", "不做", "边界"],
      "产品规则": ["规则", "策略", "状态", "权限", "流程", "约束", "条件"],
      "验收与影响": ["验收", "上线", "影响", "灰度", "回滚", "埋点", "监控"],
    },
  },
  {
    id: "qa",
    name: "测试",
    definition: "从测试验证角度评审需求是否可测、可验收、覆盖关键场景。",
    criteria: [
      "验收标准是否明确且可量化",
      "正常流程、异常流程和边界场景是否完整",
      "流程图、表格和文字描述是否一致",
      "是否足以设计测试用例和测试数据",
    ],
    signals: {
      "验收标准": ["验收", "通过标准", "验收标准", "成功条件", "判定"],
      "异常场景": ["异常", "失败", "错误", "为空", "超时", "取消", "回退"],
      "边界场景": ["边界", "最大", "最小", "限制", "重复", "并发", "权限"],
      "测试数据": ["测试", "用例", "测试数据", "样例", "示例", "输入", "输出"],
    },
  },
  {
    id: "user",
    name: "用户",
    definition: "从业务价值和最终用户体验角度评审需求是否有用、易懂、流程自然。",
    criteria: [
      "业务目标和用户价值是否明确",
      "用户场景、操作路径和角色权限是否清晰",
      "页面文案、提示和交互预期是否易理解",
      "是否覆盖用户真实使用中的关键分支",
    ],
    signals: {
      "业务目标": ["目标", "价值", "收益", "背景", "痛点", "业务"],
      "用户场景": ["用户", "场景", "角色", "使用", "操作", "流程"],
      "体验与文案": ["页面", "按钮", "提示", "文案", "交互", "展示", "通知"],
      "关键分支": ["成功", "失败", "取消", "修改", "删除", "审批", "驳回"],
    },
  },
];

const suggestions = {
  产品: {
    目标与指标: "补充需求背景、用户痛点、产品目标和可衡量的成功指标。",
    范围与优先级: "明确本次版本范围、功能优先级、不做范围和后续迭代边界。",
    产品规则: "补充核心业务规则、状态流转、权限约束和关键判断条件。",
    验收与影响: "补充验收口径、上线影响、灰度/回滚方案以及必要的埋点或监控。",
  },
  测试: {
    验收标准: "为每个功能点增加可判断的验收标准，避免只写主观描述。",
    异常场景: "补充失败、取消、超时、权限不足、数据不存在等异常路径。",
    边界场景: "补充最大值、最小值、重复、并发、空数据等边界条件。",
    测试数据: "补充输入样例、输出样例和测试数据准备方式。",
  },
  用户: {
    业务目标: "说明业务背景、用户痛点、目标收益和成功指标。",
    用户场景: "补充目标用户、典型场景、前置条件和完整操作路径。",
    体验与文案: "补充页面元素、按钮动作、提示文案和交互反馈。",
    关键分支: "补充成功、失败、撤销、修改、审批或驳回等用户分支。",
  },
};

const state = {
  file: null,
  text: "",
  pages: 0,
  pageImages: [],
  reviews: [],
  roles: cloneRoles(defaultRoles),
  selectedRoleIds: new Set(defaultRoles.map((role) => role.id)),
  savedRoleIds: new Set(),
  savedRoleSnapshots: new Map(),
  rolesLoaded: false,
  models: [],
  selectedModelId: null,
  editingModelId: null,
};

const els = {
  pdfInput: document.querySelector("#pdfInput"),
  fileName: document.querySelector("#fileName"),
  fileMeta: document.querySelector("#fileMeta"),
  reviewButton: document.querySelector("#reviewButton"),
  copyButton: document.querySelector("#copyButton"),
  thresholdInput: document.querySelector("#thresholdInput"),
  overallStatus: document.querySelector("#overallStatus"),
  pageCount: document.querySelector("#pageCount"),
  textCount: document.querySelector("#textCount"),
  passedCount: document.querySelector("#passedCount"),
  averageScore: document.querySelector("#averageScore"),
  roleList: document.querySelector("#roleList"),
  roleEditorList: document.querySelector("#roleEditorList"),
  addRoleButton: document.querySelector("#addRoleButton"),
  resetRolesButton: document.querySelector("#resetRolesButton"),
  documentPreview: document.querySelector("#documentPreview"),
  extractMode: document.querySelector("#extractMode"),
  modelStatus: document.querySelector("#modelStatus"),
  modelList: document.querySelector("#modelList"),
  modelForm: document.querySelector("#modelForm"),
  modelIdInput: document.querySelector("#modelIdInput"),
  modelNameInput: document.querySelector("#modelNameInput"),
  modelProviderInput: document.querySelector("#modelProviderInput"),
  modelBaseUrlInput: document.querySelector("#modelBaseUrlInput"),
  modelModelInput: document.querySelector("#modelModelInput"),
  modelDeploymentInput: document.querySelector("#modelDeploymentInput"),
  modelApiVersionInput: document.querySelector("#modelApiVersionInput"),
  modelApiKeyInput: document.querySelector("#modelApiKeyInput"),
  modelMaxTokensInput: document.querySelector("#modelMaxTokensInput"),
  saveModelButton: document.querySelector("#saveModelButton"),
  newModelButton: document.querySelector("#newModelButton"),
  testModelButton: document.querySelector("#testModelButton"),
  deleteModelButton: document.querySelector("#deleteModelButton"),
};

els.pdfInput.addEventListener("change", handleFileChange);
els.reviewButton.addEventListener("click", runReview);
els.copyButton.addEventListener("click", copyReport);
els.addRoleButton.addEventListener("click", addRole);
els.resetRolesButton.addEventListener("click", selectAllRolesForCurrentReview);
els.roleEditorList.addEventListener("input", handleRoleInput);
els.roleEditorList.addEventListener("change", handleRoleChange);
els.roleEditorList.addEventListener("click", handleRoleClick);
els.modelForm.addEventListener("submit", saveModelConfig);
els.newModelButton.addEventListener("click", startNewModelConfig);
els.testModelButton.addEventListener("click", testEditingModel);
els.deleteModelButton.addEventListener("click", deleteEditingModel);
els.modelProviderInput.addEventListener("change", updateModelProviderFields);
els.modelList.addEventListener("click", handleModelListClick);

loadRoleDefinitions();
loadModelDefinitions();
refreshReviewButton();

async function handleFileChange(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  state.file = file;
  state.text = "";
  state.pages = 0;
  state.pageImages = [];
  state.reviews = [];

  els.fileName.textContent = file.name;
  els.fileMeta.textContent = `${formatBytes(file.size)} · PDF`;
  els.copyButton.disabled = true;
  setStatus("已选择文件");
  setMetrics({ pages: "-", textCount: "-", passed: "-", average: "-" });
  els.extractMode.textContent = "未解析";
  els.documentPreview.textContent = "点击开始评审后显示提取内容。";
  renderEmpty();
  refreshReviewButton();
}

async function runReview() {
  if (!state.file) return;
  const activeRoles = getActiveRoles();
  if (!activeRoles.length) {
    setStatus("缺少角色", "fail");
    renderError("请至少保留一个有效评审角色。");
    return;
  }

  setBusy(true);
  setStatus("解析中");
  els.documentPreview.textContent = "正在读取 PDF...";

  try {
    const extraction = await extractPdfText(state.file);
    state.text = extraction.text;
    state.pages = extraction.pages;
    state.pageImages = extraction.pageImages;

    if (!state.text.trim()) {
      throw new Error("未提取到文字内容。可能是扫描件或图片型 PDF。");
    }

    const threshold = clamp(Number(els.thresholdInput.value) || 80, 1, 100);
    const aiResult = await requestAiReview(state.text, threshold, activeRoles, state.pageImages);
    state.reviews = aiResult.ok
      ? aiResult.reviews
      : activeRoles.map((role) => reviewByRole(role, state.text, threshold));
    renderResults();
    setStatus(allPassed() ? "评审通过" : "评审未通过", allPassed() ? "pass" : "fail");
    els.extractMode.textContent = aiResult.ok ? `模型评审：${aiResult.model?.name || "已选模型"}` : "本地规则";
    const visualMarkdownPages = Array.from(state.text.matchAll(/^# 第 (\d+) 页[\s\S]*?> 此页包含/gm)).map(
      (match) => Number(match[1]),
    );
    const visualPages = state.pageImages.map((item) => item.page).join("、") || "无";
    const visualDetails = state.pageImages
      .map((item) => {
        return `第 ${item.page} 页：${(item.reasons || []).slice(0, 3).join("、") || "含图形内容"}，发送截图供视觉复核`;
      })
      .join("\n");
    const visualNote = state.pageImages.length
      ? `\n\n[Markdown 转换] 已将整份 PDF 转为 Markdown；标记 ${visualMarkdownPages.length} 页含视觉内容，已发送 ${state.pageImages.length} 页截图供视觉复核：第 ${visualPages} 页。\n${visualDetails}`
      : "\n\n[Markdown 转换] 已将整份 PDF 转为 Markdown，未发现需要发送截图复核的视觉页面。";
    els.documentPreview.textContent = aiResult.ok
      ? `${previewText(state.text)}${visualNote}`
      : `${previewText(state.text)}${visualNote}\n\n[模型评审未启用，已使用本地规则兜底]\n${aiResult.error}`;
    els.copyButton.disabled = false;
  } catch (error) {
    setStatus("解析失败", "fail");
    els.extractMode.textContent = "失败";
    els.documentPreview.textContent = `${error.message}\n\n如果这是图片扫描件，需要先做 OCR；如果页面提示 PDF.js 加载失败，请用本地服务打开页面或检查网络。`;
    renderError(error.message);
  } finally {
    setBusy(false);
  }
}

async function requestAiReview(text, threshold, activeRoles, pageImages) {
  if (location.protocol === "file:") {
    return { ok: false, error: "当前是本地文件打开方式，请通过 server.py 启动后使用模型评审。" };
  }
  if (!state.selectedModelId) {
    return { ok: false, error: "未选择大模型，已使用本地规则兜底。" };
  }

  try {
    const response = await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, threshold, roles: activeRoles, pageImages, modelId: state.selectedModelId }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    return { ok: true, reviews: result.reviews, model: result.model };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function loadModelDefinitions() {
  if (location.protocol === "file:") {
    renderModelSettings();
    return;
  }

  try {
    const response = await fetch("/api/models");
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    state.models = Array.isArray(result.models) ? result.models.map(normalizeModel) : [];
    state.selectedModelId = result.selectedModelId || state.models[0]?.id || null;
    state.editingModelId = state.selectedModelId || state.models[0]?.id || null;
  } catch (error) {
    showToast(`模型配置加载失败：${error.message}`);
    state.models = [];
    state.selectedModelId = null;
    state.editingModelId = null;
  }
  renderModelSettings();
}

function normalizeModel(model) {
  return {
    id: model.id || makeRoleId(),
    name: String(model.name || "").trim(),
    provider: model.provider === "azure" ? "azure" : "openai_compatible",
    baseUrl: String(model.baseUrl || "").trim(),
    model: String(model.model || "").trim(),
    deployment: String(model.deployment || "").trim(),
    apiVersion: String(model.apiVersion || "").trim(),
    maxCompletionTokens: Number(model.maxCompletionTokens) || 4096,
    hasApiKey: Boolean(model.hasApiKey),
  };
}

function renderModelSettings() {
  renderModelList();
  const editing = state.models.find((model) => model.id === state.editingModelId);
  if (editing) {
    fillModelForm(editing);
  } else {
    startNewModelConfig(false);
  }
  const selected = state.models.find((model) => model.id === state.selectedModelId);
  els.modelStatus.textContent = selected ? `当前：${selected.name}` : "未配置";
  els.modelStatus.className = `mode-label ${selected ? "pass" : ""}`.trim();
  refreshReviewButton();
}

function renderModelList() {
  if (!state.models.length) {
    els.modelList.innerHTML = `
      <article class="model-item is-empty">
        <strong>暂无模型配置</strong>
        <span>新增后可测试并用于全部角色评审。</span>
      </article>
    `;
    return;
  }
  els.modelList.innerHTML = state.models
    .map((model) => {
      const selected = model.id === state.selectedModelId;
      const editing = model.id === state.editingModelId;
      return `
        <article class="model-item ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""}" data-model-id="${escapeHtml(model.id)}">
          <button type="button" data-action="edit-model">
            <strong>${escapeHtml(model.name)}</strong>
            <span>${escapeHtml(model.provider === "azure" ? "Azure OpenAI" : "OpenAI 兼容")} · ${escapeHtml(model.model || model.deployment)}</span>
          </button>
          <button class="ghost-button compact-button" type="button" data-action="select-model" ${selected ? "disabled" : ""}>
            ${selected ? "已选择" : "选择"}
          </button>
        </article>
      `;
    })
    .join("");
}

function fillModelForm(model) {
  state.editingModelId = model.id;
  els.modelIdInput.value = model.id;
  els.modelNameInput.value = model.name;
  els.modelProviderInput.value = model.provider;
  els.modelBaseUrlInput.value = model.baseUrl;
  els.modelModelInput.value = model.model;
  els.modelDeploymentInput.value = model.deployment;
  els.modelApiVersionInput.value = model.apiVersion || (model.provider === "azure" ? "2024-12-01-preview" : "");
  els.modelApiKeyInput.value = "";
  els.modelMaxTokensInput.value = model.maxCompletionTokens;
  els.saveModelButton.textContent = "保存模型";
  els.testModelButton.disabled = false;
  els.deleteModelButton.disabled = false;
  updateModelProviderFields();
}

function startNewModelConfig(render = true) {
  state.editingModelId = null;
  els.modelForm.reset();
  els.modelIdInput.value = "";
  els.modelProviderInput.value = "openai_compatible";
  els.modelBaseUrlInput.value = "https://api.openai.com/v1";
  els.modelMaxTokensInput.value = "4096";
  els.saveModelButton.textContent = "新增模型";
  els.testModelButton.disabled = true;
  els.deleteModelButton.disabled = true;
  updateModelProviderFields();
  if (render) renderModelList();
}

function updateModelProviderFields() {
  const isAzure = els.modelProviderInput.value === "azure";
  document.querySelectorAll(".azure-only").forEach((item) => {
    item.style.display = isAzure ? "grid" : "none";
  });
  if (isAzure && !els.modelApiVersionInput.value) {
    els.modelApiVersionInput.value = "2024-12-01-preview";
  }
}

function collectModelForm() {
  return {
    id: els.modelIdInput.value.trim(),
    name: els.modelNameInput.value.trim(),
    provider: els.modelProviderInput.value,
    baseUrl: els.modelBaseUrlInput.value.trim(),
    model: els.modelModelInput.value.trim(),
    deployment: els.modelDeploymentInput.value.trim(),
    apiVersion: els.modelApiVersionInput.value.trim(),
    apiKey: els.modelApiKeyInput.value.trim(),
    maxCompletionTokens: Number(els.modelMaxTokensInput.value) || 4096,
  };
}

async function saveModelConfig(event) {
  event.preventDefault();
  if (location.protocol === "file:") {
    showToast("请通过 server.py 启动页面后保存模型配置");
    return;
  }

  const payload = collectModelForm();
  if (!payload.name || !payload.baseUrl || (payload.provider !== "azure" && !payload.model)) {
    showToast("请填写模型名称、API 地址和模型标识");
    return;
  }
  if (payload.provider === "azure" && (!payload.deployment || !payload.apiVersion)) {
    showToast("Azure OpenAI 需要填写部署名称和 API Version");
    return;
  }
  if (!payload.id && !payload.apiKey) {
    showToast("新增模型需要填写 API Key");
    return;
  }

  const isUpdate = Boolean(payload.id);
  els.saveModelButton.disabled = true;
  const oldText = els.saveModelButton.textContent;
  els.saveModelButton.textContent = "保存中";
  let saved = false;
  try {
    const response = await fetch(isUpdate ? `/api/models/${encodeURIComponent(payload.id)}` : "/api/models", {
      method: isUpdate ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, selected: true }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    state.models = result.models.map(normalizeModel);
    state.selectedModelId = result.selectedModelId;
    state.editingModelId = state.selectedModelId;
    saved = true;
    renderModelSettings();
    showToast("模型配置已加密保存");
  } catch (error) {
    showToast(`模型保存失败：${error.message}`);
  } finally {
    els.saveModelButton.disabled = false;
    if (!saved) {
      els.saveModelButton.textContent = oldText;
    }
  }
}

async function handleModelListClick(event) {
  const button = event.target.closest("[data-action]");
  const item = event.target.closest("[data-model-id]");
  if (!button || !item) return;
  const modelId = item.dataset.modelId;
  if (button.dataset.action === "edit-model") {
    const model = state.models.find((entry) => entry.id === modelId);
    if (model) {
      fillModelForm(model);
      renderModelList();
    }
    return;
  }
  if (button.dataset.action === "select-model") {
    await selectModel(modelId);
  }
}

async function selectModel(modelId) {
  if (location.protocol === "file:") return;
  const response = await fetch("/api/models/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    showToast(`选择失败：${result.error || `HTTP ${response.status}`}`);
    return;
  }
  state.models = result.models.map(normalizeModel);
  state.selectedModelId = result.selectedModelId;
  state.editingModelId = modelId;
  renderModelSettings();
  showToast("已选择当前评审模型");
}

async function testEditingModel() {
  const modelId = els.modelIdInput.value.trim();
  if (!modelId) return;
  els.testModelButton.disabled = true;
  const oldText = els.testModelButton.textContent;
  els.testModelButton.textContent = "测试中";
  try {
    const response = await fetch(`/api/models/${encodeURIComponent(modelId)}/test`, { method: "POST" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    showToast(`模型可用：${result.message || "已连通"}`);
  } catch (error) {
    showToast(`模型测试失败：${error.message}`);
  } finally {
    els.testModelButton.disabled = false;
    els.testModelButton.textContent = oldText;
  }
}

async function deleteEditingModel() {
  const modelId = els.modelIdInput.value.trim();
  const model = state.models.find((entry) => entry.id === modelId);
  if (!model) return;
  if (!confirm(`确定删除大模型配置「${model.name}」吗？`)) return;
  const response = await fetch(`/api/models/${encodeURIComponent(modelId)}`, { method: "DELETE" });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    showToast(`删除失败：${result.error || `HTTP ${response.status}`}`);
    return;
  }
  state.models = result.models.map(normalizeModel);
  state.selectedModelId = result.selectedModelId;
  state.editingModelId = state.selectedModelId;
  renderModelSettings();
  showToast("模型配置已删除");
}

function cloneRoles(value) {
  return value.map((role) => normalizeRole(JSON.parse(JSON.stringify(role))));
}

function normalizeRole(role) {
  return {
    id: role.id || makeRoleId(),
    name: String(role.name || "").trim() || "未命名角色",
    definition: String(role.definition || "").trim(),
    criteria: Array.isArray(role.criteria)
      ? role.criteria.map((item) => String(item).trim()).filter(Boolean)
      : splitCriteria(role.criteria),
    signals: role.signals && typeof role.signals === "object" ? role.signals : undefined,
  };
}

function stripRoleForStorage(role) {
  return {
    id: role.id,
    name: role.name,
    definition: role.definition,
    criteria: role.criteria,
  };
}

function roleSnapshot(role) {
  return JSON.stringify(stripRoleForStorage(normalizeRole(role)));
}

function rememberSavedRoles(roles) {
  state.savedRoleIds = new Set();
  state.savedRoleSnapshots = new Map();
  roles.forEach(rememberSavedRole);
}

function rememberSavedRole(role) {
  state.savedRoleIds.add(role.id);
  state.savedRoleSnapshots.set(role.id, roleSnapshot(role));
}

function isRoleDirty(role) {
  if (!state.savedRoleIds.has(role.id)) {
    return true;
  }
  return state.savedRoleSnapshots.get(role.id) !== roleSnapshot(role);
}

function updateRoleCardSaveState(card, role) {
  const isDirty = isRoleDirty(role);
  card.classList.toggle("is-dirty", isDirty);
  const saveButton = card.querySelector('[data-action="save-definition"]');
  if (saveButton) {
    saveButton.disabled = !isDirty;
  }
  const stateLabel = card.querySelector("[data-save-state]");
  if (stateLabel) {
    stateLabel.textContent = isDirty ? "未保存" : "已保存";
  }
}

function getActiveRoles() {
  return state.roles
    .map(normalizeRole)
    .filter((role) => state.selectedRoleIds.has(role.id))
    .filter((role) => role.name && role.definition && role.criteria.length);
}

async function loadRoleDefinitions() {
  if (location.protocol === "file:") {
    renderRoleEditor();
    return;
  }

  try {
    const response = await fetch("/api/roles");
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    const previousSelection = new Set(state.selectedRoleIds);
    state.roles = result.roles.map(normalizeRole);
    rememberSavedRoles(state.roles);
    if (!state.rolesLoaded) {
      state.selectedRoleIds = new Set(state.roles.map((role) => role.id));
    } else {
      state.selectedRoleIds = new Set(
        state.roles
          .filter((role) => previousSelection.size === 0 || previousSelection.has(role.id))
          .map((role) => role.id),
      );
      if (!state.selectedRoleIds.size) {
        state.selectedRoleIds = new Set(state.roles.map((role) => role.id));
      }
    }
    state.rolesLoaded = true;
  } catch (error) {
    showToast(`角色库加载失败，使用本地默认角色：${error.message}`);
    state.roles = cloneRoles(defaultRoles);
    state.savedRoleIds = new Set();
    state.savedRoleSnapshots = new Map();
    state.selectedRoleIds = new Set(state.roles.map((role) => role.id));
    state.rolesLoaded = true;
  }
  renderRoleEditor();
}

function renderRoleEditor() {
  els.roleEditorList.innerHTML = state.roles.map(renderRoleEditorCard).join("");
  refreshReviewButton();
}

function renderRoleEditorCard(role, index) {
  const isSelected = state.selectedRoleIds.has(role.id);
  const isSaved = state.savedRoleIds.has(role.id);
  const isDirty = isRoleDirty(role);
  const saveLabel = isSaved ? (isDirty ? "未保存" : "已保存") : "未保存";
  return `
    <article class="role-editor-card ${isSelected ? "" : "is-inactive"} ${isDirty ? "is-dirty" : ""}" data-role-id="${escapeHtml(role.id)}">
      <div class="role-editor-head">
        <label class="role-check">
          <input data-action="toggle-current" type="checkbox" ${isSelected ? "checked" : ""} />
          <span>参与本次评审</span>
        </label>
        <label class="field field-name">
          <span>角色名称</span>
          <input data-field="name" value="${escapeAttribute(role.name)}" />
        </label>
      </div>
      <label class="field">
        <span>角色定义</span>
        <textarea data-field="definition" rows="2">${escapeHtml(role.definition)}</textarea>
      </label>
      <label class="field">
        <span>评审标准</span>
        <textarea data-field="criteria" rows="4">${escapeHtml(role.criteria.join("\n"))}</textarea>
      </label>
      <div class="role-editor-actions">
        <button class="primary-button compact-button save-role-button" data-action="save-definition" type="button" ${isDirty ? "" : "disabled"}>
          保存
        </button>
        <button class="ghost-button compact-button ai-button" data-action="suggest-criteria" type="button">
          AI 生成标准
        </button>
        <button class="ghost-button compact-button" data-action="remove-current" type="button" ${isSelected ? "" : "disabled"}>
          移出本次
        </button>
        <button class="ghost-button compact-button danger-button" data-action="delete-definition" type="button">
          删除定义
        </button>
        <span class="save-state" data-save-state>${saveLabel}</span>
      </div>
      <div class="role-index">#${index + 1}</div>
    </article>
  `;
}

function handleRoleInput(event) {
  const target = event.target;
  if (!target.matches("[data-field]")) return;

  const card = target.closest("[data-role-id]");
  const role = state.roles.find((item) => item.id === card?.dataset.roleId);
  if (!role) return;

  const field = target.dataset.field;
  if (field === "criteria") {
    role.criteria = splitCriteria(target.value);
  } else {
    role[field] = target.value.trim();
  }
  updateRoleCardSaveState(card, role);
  refreshReviewButton();
}

function handleRoleChange(event) {
  const target = event.target;
  if (!target.matches('[data-action="toggle-current"]')) return;

  const card = target.closest("[data-role-id]");
  const roleId = card?.dataset.roleId;
  if (!roleId) return;

  if (target.checked) {
    state.selectedRoleIds.add(roleId);
  } else {
    state.selectedRoleIds.delete(roleId);
  }
  renderRoleEditor();
}

async function handleRoleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const card = button.closest("[data-role-id]");
  const roleId = card?.dataset.roleId;
  if (!roleId) return;

  if (button.dataset.action === "remove-current") {
    state.selectedRoleIds.delete(roleId);
    renderRoleEditor();
    return;
  }

  if (button.dataset.action === "delete-definition") {
    await deleteRoleDefinition(roleId);
    return;
  }

  if (button.dataset.action === "save-definition") {
    await saveRoleDefinition(roleId, button);
    return;
  }

  if (button.dataset.action === "suggest-criteria") {
    await suggestCriteria(roleId, button);
  }
}

async function addRole() {
  const role = {
    id: makeRoleId(),
    name: "新角色",
    definition: "请填写该角色在需求评审中的职责。",
    criteria: ["请填写该角色关注的评审标准"],
  };

  state.roles.push(role);
  state.selectedRoleIds.add(role.id);
  renderRoleEditor();
  showToast("已新增角色，请编辑后点击保存");
}

function selectAllRolesForCurrentReview() {
  state.selectedRoleIds = new Set(state.roles.map((role) => role.id));
  renderRoleEditor();
  showToast("已选择全部角色参与本次评审");
}

function splitCriteria(value) {
  return String(value || "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeRoleId() {
  return `role-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createRoleDefinition(role) {
  if (location.protocol === "file:") {
    throw new Error("当前不是通过 server.py 打开的页面。");
  }
  const response = await fetch("/api/roles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stripRoleForStorage(role)),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.role;
}

async function updateRoleDefinition(role) {
  if (location.protocol === "file:") {
    return role;
  }
  const response = await fetch(`/api/roles/${encodeURIComponent(role.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stripRoleForStorage(role)),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }
  return result.role;
}

async function saveRoleDefinition(roleId, button) {
  const role = state.roles.find((item) => item.id === roleId);
  if (!role) return;
  if (!role.name.trim() || !role.definition.trim() || !role.criteria.length) {
    showToast("角色名称、定义和评审标准不能为空");
    return;
  }

  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "保存中";
  try {
    const savedRole = state.savedRoleIds.has(role.id)
      ? await updateRoleDefinition(role)
      : await createRoleDefinition(role);
    const normalizedRole = normalizeRole(savedRole);
    const index = state.roles.findIndex((item) => item.id === roleId);
    if (index >= 0) {
      state.roles[index] = normalizedRole;
    }
    if (normalizedRole.id !== roleId) {
      state.selectedRoleIds.delete(roleId);
      state.selectedRoleIds.add(normalizedRole.id);
    }
    rememberSavedRole(normalizedRole);
    renderRoleEditor();
    showToast("角色定义已保存");
  } catch (error) {
    button.disabled = false;
    button.textContent = oldText;
    showToast(`角色保存失败：${error.message}`);
  }
}

async function suggestCriteria(roleId, button) {
  const role = state.roles.find((item) => item.id === roleId);
  if (!role) return;
  if (!role.name.trim() || !role.definition.trim()) {
    showToast("请先填写角色名称和角色定义");
    return;
  }
  if (location.protocol === "file:") {
    showToast("请通过 server.py 启动页面后使用 AI 生成标准");
    return;
  }
  if (!state.selectedModelId) {
    showToast("请先新增并选择一个大模型配置");
    return;
  }

  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "生成中";
  try {
    const response = await fetch("/api/roles/suggest-criteria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: role.name,
        definition: role.definition,
        modelId: state.selectedModelId,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    role.definition = result.definition || role.definition;
    role.criteria = Array.isArray(result.criteria) ? result.criteria : splitCriteria(result.criteria);
    renderRoleEditor();
    showToast("AI 已生成评审标准，请点击保存后写入角色库");
  } catch (error) {
    showToast(`AI 生成失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

async function deleteRoleDefinition(roleId) {
  const role = state.roles.find((item) => item.id === roleId);
  if (!role) return;
  if (!confirm(`确定从角色库删除「${role.name}」吗？这不会只影响当前文档，而是会删除这个角色定义。`)) {
    return;
  }

  if (location.protocol !== "file:") {
    const response = await fetch(`/api/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      showToast(`删除失败：${result.error || `HTTP ${response.status}`}`);
      return;
    }
  }

  state.roles = state.roles.filter((item) => item.id !== roleId);
  state.selectedRoleIds.delete(roleId);
  state.savedRoleIds.delete(roleId);
  state.savedRoleSnapshots.delete(roleId);
  renderRoleEditor();
  showToast("角色定义已删除");
}

async function extractPdfText(file) {
  const pdfjs = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const backendVisualPromise = requestBackendVisualDetections(arrayBuffer);
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pageStats = [];
  const pageData = [];
  const backendVisual = await backendVisualPromise;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    els.documentPreview.textContent = `正在分析 PDF 页面结构... ${pageNumber}/${pdf.numPages}`;
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const strings = textContent.items.map((item) => ("str" in item ? item.str : "")).filter(Boolean);
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const textSignals = getPageTextSignals(pageText, strings, textContent.items);
    const visual = shouldAnalyzePageVisual(textSignals, pdf.numPages)
      ? await analyzePdfPageVisual(page, textContent.items)
      : createEmptyVisualStats();
    const stats = scorePdfPage(pageNumber, pageText, strings, textContent.items, visual, pdf.numPages, textSignals);
    mergeBackendVisualDetection(stats, backendVisual.get(pageNumber));
    const flowMarkdown = buildFlowchartMarkdown(page, textContent.items, stats);
    stats.flowMarkdown = flowMarkdown;
    pageStats.push(stats);
    pageData.push({ pageNumber, pageText, stats, flowMarkdown });
  }

  expandFlowchartRanges(pageStats);
  const selectedPages = selectVisualPages(pageStats);
  const selectedPageSet = new Set(selectedPages);
  const pageMarkdowns = pageData.map((item) =>
    buildPageMarkdown(item.pageNumber, item.pageText, item.stats, item.flowMarkdown, selectedPageSet.has(item.pageNumber)),
  );
  const pageImages = [];
  for (const pageNumber of selectedPages) {
    els.documentPreview.textContent = `正在渲染关键页面截图... 第 ${pageNumber} 页`;
    const page = await pdf.getPage(pageNumber);
    pageImages.push({
      page: pageNumber,
      score: pageStats.find((item) => item.page === pageNumber)?.score || 0,
      reasons: pageStats.find((item) => item.page === pageNumber)?.reasons || [],
      flowMarkdown: pageStats.find((item) => item.page === pageNumber)?.flowMarkdown || "",
      dataUrl: await renderPdfPageImage(page),
    });
  }

  return {
    pages: pdf.numPages,
    pageImages,
    text: pageMarkdowns.join("\n\n---\n\n"),
  };
}

async function requestBackendVisualDetections(arrayBuffer) {
  if (location.protocol === "file:") return new Map();
  try {
    els.documentPreview.textContent = "正在调用后端视觉检测插件...";
    const response = await fetch("/api/pdf/visual-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfDataUrl: arrayBufferToDataUrl(arrayBuffer, "application/pdf") }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }
    return new Map((result.detections || []).map((item) => [Number(item.page), item]));
  } catch (error) {
    console.warn("Backend visual detector unavailable:", error);
    return new Map();
  }
}

function mergeBackendVisualDetection(stats, detection) {
  if (!detection) return;
  stats.backendVisual = detection;
  stats.reasons = [...stats.reasons, ...(detection.reasons || []).map((reason) => `后端插件：${reason}`)];
  if (detection.kind === "flowchart") {
    stats.flowCandidate = true;
    stats.tableCandidate = false;
    stats.hasVisualContent = true;
    stats.visualKind = "flowchart";
    stats.score = Math.max(stats.score, Math.round((Number(detection.confidence) || 0.5) * 100));
    return;
  }
  if (detection.kind === "table") {
    stats.flowCandidate = false;
    stats.tableCandidate = true;
    stats.hasVisualContent = true;
    stats.visualKind = "table";
    stats.score = Math.max(stats.score, Math.round((Number(detection.confidence) || 0.5) * 100));
    return;
  }
  if (detection.kind === "graphic") {
    stats.hasVisualContent = true;
    stats.visualKind = stats.visualKind === "none" ? "graphic" : stats.visualKind;
  }
}

function arrayBufferToDataUrl(arrayBuffer, mimeType) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function buildPageMarkdown(pageNumber, pageText, stats, flowMarkdown, screenshotSelected = false) {
  const lines = [`# 第 ${pageNumber} 页`];
  if (stats.hasVisualContent) {
    lines.push("");
    const screenshotNote = screenshotSelected ? "已发送截图供视觉复核" : "未作为流程图截图发送";
    lines.push(`> 此页包含${visualKindLabel(stats.visualKind)}，${screenshotNote}。`);
  }
  if (flowMarkdown) {
    lines.push("");
    lines.push("## 自动推断流程图");
    lines.push(flowMarkdown);
  }
  lines.push("");
  lines.push("## 页面文字");
  lines.push(pageText || "[未提取到文字]");
  return lines.join("\n");
}

function visualKindLabel(kind) {
  if (kind === "flowchart") return "流程图/泳道图内容";
  if (kind === "table") return "表格/网格内容";
  if (kind === "graphic") return "图形内容";
  return "视觉内容";
}

function buildFlowchartMarkdown(page, textItems, stats) {
  if (!stats.flowCandidate) return "";

  const boxes = normalizeTextBoxes(page, textItems);
  const lines = groupTextBoxesIntoLines(boxes);
  const nodes = buildFlowNodes(lines, page.getViewport({ scale: 1 }), stats).slice(0, 55);
  if (nodes.length < 2) return "";

  const direction = chooseFlowDirection(nodes);
  const nodeIds = nodes.map((_, index) => `N${index + 1}`);
  const mermaidLines = [`flowchart ${direction}`];
  nodes.forEach((node, index) => {
    const label = sanitizeMermaidLabel(node.text);
    const shape = isDecisionNode(node.text) ? `{${label}}` : `[${label}]`;
    mermaidLines.push(`  ${nodeIds[index]}${shape}`);
  });

  inferFlowEdges(nodes).forEach((edge) => {
    const from = nodeIds[edge.from];
    const to = nodeIds[edge.to];
    const label = edge.label ? ` -- ${edge.label} --> ` : " --> ";
    mermaidLines.push(`  ${from}${label}${to}`);
  });

  const confidence = estimateFlowMarkdownConfidence(nodes, stats);
  return [
    `> 自动转换说明：根据 PDF 文字块坐标、短文本分布和图形线条特征推断，置信度 ${confidence}%。如原图包含复杂泳道、跨页连接或纯图片节点，请结合页面截图复核。`,
    "",
    "```mermaid",
    ...mermaidLines,
    "```",
  ].join("\n");
}

function normalizeTextBoxes(page, textItems) {
  const viewport = page.getViewport({ scale: 1 });
  const boxes = [];
  for (const item of textItems) {
    if (!("str" in item) || !item.str.trim()) continue;
    const transform = item.transform || [];
    const x = Number(transform[4] || 0);
    const y = Number(transform[5] || 0);
        const charScale = /[\u4e00-\u9fff\u3000-\u30ff\uff00-\uffef]/.test(item.str) ? 10 : 5;
    const itemWidth = Math.max(Number(item.width || 0), item.str.length * charScale);
    const itemHeight = Math.max(Number(item.height || 0), 8);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const rect = viewport.convertToViewportRectangle([x, y, x + itemWidth, y + itemHeight]);
    const left = Math.min(rect[0], rect[2]);
    const top = Math.min(rect[1], rect[3]);
    const right = Math.max(rect[0], rect[2]);
    const bottom = Math.max(rect[1], rect[3]);
    // 去重: 文本包含关系 + 位置重叠 → 保留较长文本
    const newText = item.str.replace(/\s+/g, " ").trim();
    let skipBox = false;
    for (let bi = boxes.length - 1; bi >= 0; bi--) {
      const b = boxes[bi];
      const posClose = Math.abs(b.left - left) < 15 && Math.abs(b.top - top) < 15;
      if (!posClose) continue;
      // 新文本包含旧文本 → 替换旧盒子
      if (newText.includes(b.text) && newText !== b.text) {
        boxes[bi] = boxes[boxes.length - 1];
        boxes.pop();
        continue;
      }
      // 旧文本包含新文本 或 完全相同 → 跳过新盒子
      if (b.text.includes(newText) || b.text === newText) {
        skipBox = true;
        break;
      }
    }
    if (skipBox) continue;
    boxes.push({
      text: item.str.replace(/\s+/g, " ").trim(),
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    });
  }
  return boxes;
}

function groupTextBoxesIntoLines(boxes) {
  const sorted = boxes
    .filter((box) => isUsefulFlowText(box.text))
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines = [];
  for (const box of sorted) {
    const boxCenterY = (box.top + box.bottom) / 2;
    const line = lines.find((item) => {
      if (Math.abs(item.centerY - boxCenterY) > 8) return false;
      const overlap = Math.max(0, Math.min(item.right, box.right) - Math.max(item.left, box.left));
      if (overlap <= 1) return false; // 水平无重叠 → 不同列,不能归为同一行
      // 检查文本是否已在行中存在
      const boxText = box.text.replace(/\s+/g, "");
      const lineText = (item.leftText || "").replace(/\s+/g, "");
      if (lineText.includes(boxText) || boxText.includes(lineText)) return false;
      return true;
    });
    if (line) {
      line.leftText = ((line.leftText || "") + " " + box.text).replace(/\s+/g, " ").trim();
      line.parts.push(box);
      line.left = Math.min(line.left, box.left);
      line.right = Math.max(line.right, box.right);
      line.top = Math.min(line.top, box.top);
      line.bottom = Math.max(line.bottom, box.bottom);
      line.centerY = (line.top + line.bottom) / 2;
    } else {
      lines.push({
        parts: [box],
        leftText: box.text,
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        centerY: (box.top + box.bottom) / 2,
      });
    }
  }

  return lines
    .map((line) => {
      const parts = line.parts.sort((a, b) => a.left - b.left);
      return {
        text: parts.map((part) => part.text).join(" ").replace(/\s+/g, " ").trim(),
        left: line.left,
        right: line.right,
        top: line.top,
        bottom: line.bottom,
        centerX: (line.left + line.right) / 2,
        centerY: (line.top + line.bottom) / 2,
      };
    })
    .filter((line) => isUsefulFlowText(line.text));
}

function buildFlowNodes(lines, viewport, stats) {
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;
  const candidates = lines
    .filter((line) => {
      const text = line.text.replace(/\s+/g, "");
      const inBody = line.top > pageHeight * 0.015 && line.bottom < pageHeight * 0.985;
      const notPageNumber = !/^\d{1,3}$/.test(text);
      const shortEnough = text.length <= 130 || isDecisionNode(text);
      return inBody && notPageNumber && shortEnough;
    })
    .sort((a, b) => a.top - b.top || a.left - b.left);

  const nodes = [];
  for (const line of candidates) {
    const previous = nodes[nodes.length - 1];
    // 文本级别去重: 如果当前行文本已被前一个节点包含，跳过
    if (previous) {
      const prevCompact = previous.text.replace(/\s+/g, "");
      const curCompact = line.text.replace(/\s+/g, "");
      if (prevCompact.includes(curCompact) && curCompact.length > 2) continue;
    }
    if (
      previous &&
      line.top - previous.bottom <= 28 &&
      overlapRatio(previous.left, previous.right, line.left, line.right) >= 0.2 &&
      `${previous.text}${line.text}`.length <= 120
    ) {
      // 检查新追加文本是否重复
      const partial = line.text.replace(/\s+/g, "");
      const existing = previous.text.replace(/\s+/g, "");
      if (!existing.includes(partial)) {
        previous.text = `${previous.text} ${line.text}`.replace(/\s+/g, " ").trim();
      }
      previous.left = Math.min(previous.left, line.left);
      previous.right = Math.max(previous.right, line.right);
      previous.top = Math.min(previous.top, line.top);
      previous.bottom = Math.max(previous.bottom, line.bottom);
      previous.centerX = (previous.left + previous.right) / 2;
      previous.centerY = (previous.top + previous.bottom) / 2;
    } else {
      nodes.push({ ...line });
    }
  }

  return nodes.filter((node) => {
    const text = node.text.replace(/\s+/g, "");
    const nearEdge = node.left < pageWidth * 0.01 || node.right > pageWidth * 0.99;
    const looksLikeHeading = text.length > 24 && /需求|设计|说明|流程图$/.test(text);
    const semanticNode = /START|END|开始|结束|是否|成功|失败|Query|Skip|Default|Input/i.test(text);
    return !nearEdge && !looksLikeHeading && (stats.hasVisualContent || stats.visual.diamondNodeCount > 0 || text.length <= 120 || semanticNode);
  });
}

function inferFlowEdges(nodes) {
  const edges = [];
  const avgNodeHeight = nodes.length > 1
    ? nodes.reduce((s, n) => s + (n.bottom - n.top), 0) / nodes.length
    : 30;
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const current = nodes[index];
    const next = nodes[index + 1];
    // 水平距离过远 → 不同列, 跳过默认串联
    const hGap = Math.abs(next.centerX - current.centerX);
    const vGap = next.top - current.bottom;
    if (hGap > avgNodeHeight * 2.5 && vGap > avgNodeHeight * 1.2) continue;
    let label = "";
    if (isDecisionNode(current.text)) {
      // 判断节点: 查找同 Y 侧分支(否) 和 下方主分支(是)
      const sideBranch = nodes.find((n, i) => i > index && Math.abs(n.centerY - current.centerY) <= 25 && n !== current);
      const downBranch = nodes.find((n, i) => i > index && n.top > current.bottom + 10 && n !== sideBranch);
      if (sideBranch && downBranch) {
        const sideLabel = inferDecisionLabel(current, sideBranch, downBranch);
        edges.push({ from: index, to: nodes.indexOf(sideBranch), label: sideLabel });
        edges.push({ from: index, to: nodes.indexOf(downBranch), label: sideLabel === "是" ? "否" : "是" });
        // 跳过侧分支节点,避免被后续串联
        const skipTo = Math.max(nodes.indexOf(sideBranch), nodes.indexOf(downBranch));
        if (skipTo > index + 1) index = skipTo - 1;
      } else {
        label = inferDecisionLabel(current, next, nodes[index + 2]);
        edges.push({ from: index, to: index + 1, label });
        if (nodes[index + 2] && isParallelBranch(next, nodes[index + 2])) {
          edges.push({ from: index, to: index + 2, label: label === "是" ? "否" : "是" });
          index += 1;
        }
      }
    } else {
      edges.push({ from: index, to: index + 1, label });
    }
  }
  return dedupeEdges(edges);
}

function inferDecisionLabel(current, next, alternate) {
  if (/否|不通过|失败|驳回|异常|不满足|不完整/.test(next.text)) return "否";
  if (/是|通过|成功|同意|正常|满足|完整/.test(next.text)) return "是";
  if (alternate && next.centerX < current.centerX && alternate.centerX > current.centerX) return "否";
  return "是";
}

function isParallelBranch(left, right) {
  return Math.abs(left.centerY - right.centerY) <= 40 && Math.abs(left.centerX - right.centerX) >= 80;
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter((edge) => {
    const key = `${edge.from}:${edge.to}:${edge.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return edge.from !== edge.to;
  });
}

function chooseFlowDirection(nodes) {
  const xs = nodes.map((node) => node.centerX);
  const ys = nodes.map((node) => node.centerY);
  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);
  return spreadX > spreadY * 1.25 ? "LR" : "TD";
}

function estimateFlowMarkdownConfidence(nodes, stats) {
  const nodeScore = clamp(nodes.length * 6, 12, 42);
  const visualScore = clamp(stats.visual.lineScore + stats.visual.diagonalScore + stats.visual.diamondScore, 0, 42);
  const reasonScore = clamp(stats.reasons.length * 3, 0, 16);
  return Math.round(clamp(nodeScore + visualScore + reasonScore, 20, 92));
}

function isUsefulFlowText(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  if (!compact || compact.length < 1) return false;
  if (/^[\d.·…\-—_]+$/.test(compact)) return false;
  if (/^(第?\d+页|页码|目录|contents)$/i.test(compact)) return false;
  return true;
}

function isDecisionNode(text) {
  return /是否|判断|条件|通过|成功|失败|完整|合格|满足|存在|允许|可用|审批|同意|驳回|YES|NO|Success|Skip|？|\?/.test(
    String(text || ""),
  );
}

function sanitizeMermaidLabel(value) {
  let label = String(value || "")
    .replace(/["[\]{}|<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 取有意义的前 100 字符,若末尾被截断则添加 ... 
  if (label.length > 100) label = label.slice(0, 97) + "...";
  return label || "​";
}

function overlapRatio(aLeft, aRight, bLeft, bRight) {
  const overlap = Math.max(0, Math.min(aRight, bRight) - Math.max(aLeft, bLeft));
  const width = Math.max(Math.min(aRight - aLeft, bRight - bLeft), 1);
  return overlap / width;
}

function getPageTextSignals(text, strings, textItems) {
  const compactText = text.replace(/\s+/g, "");
  const itemCount = strings.length;
  const shortItemCount = strings.filter((item) => item.trim().length > 0 && item.trim().length <= 8).length;
  const shortRatio = itemCount ? shortItemCount / itemCount : 0;
  const regionCount = countTextRegions(textItems);
  const keywordScore = VISUAL_PAGE_KEYWORDS.reduce((score, [keyword, weight]) => {
    return compactText.includes(keyword) ? score + weight : score;
  }, 0);
  return {
    compactText,
    textLength: compactText.length,
    itemCount,
    shortItemCount,
    shortRatio,
    regionCount,
    keywordScore,
    directoryLike: isLikelyDirectoryPage(compactText, strings),
    documentMetaLike: isLikelyDocumentMetaPage(compactText, strings),
  };
}

function shouldAnalyzePageVisual(signals, totalPages) {
  if (signals.directoryLike) return false;
  if (signals.documentMetaLike) return false;
  if (signals.textLength === 0) return true;
  if (signals.keywordScore >= 4) return true;
  if (signals.regionCount >= 5 && signals.shortRatio >= 0.28) return true;
  if (signals.itemCount >= 70 && signals.shortRatio >= 0.38) return true;
  if (signals.textLength <= 220 && signals.itemCount >= 10) return true;
  return totalPages <= 12 && signals.itemCount >= 35 && signals.shortRatio >= 0.25;
}

function createEmptyVisualStats() {
  return {
    width: 0,
    height: 0,
    edgeDensity: 0,
    inkDensity: 0,
    darkDensity: 0,
    horizontalRuns: 0,
    verticalRuns: 0,
    denseRows: 0,
    denseCols: 0,
    diamondNodeCount: 0,
    diagonalRunCount: 0,
    lineScore: 0,
    gridScore: 0,
    edgeScore: 0,
    inkScore: 0,
    diamondScore: 0,
    diagonalScore: 0,
    tableGridScore: 0,
    visualScore: 0,
  };
}

async function analyzePdfPageVisual(page, textItems) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1.2, THUMBNAIL_WIDTH / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvasContext: context, viewport }).promise;
  maskTextRegions(context, viewport, textItems, canvas.width, canvas.height);
  return analyzeCanvasStructure(context, canvas.width, canvas.height);
}

function maskTextRegions(context, viewport, textItems, width, height) {
  context.save();
  context.fillStyle = "#fff";

  for (const item of textItems) {
    if (!("str" in item) || !item.str.trim()) continue;
    const transform = item.transform || [];
    const x = Number(transform[4] || 0);
    const y = Number(transform[5] || 0);
    const itemWidth = Math.max(Number(item.width || 0), item.str.length * 4);
    const itemHeight = Math.max(Number(item.height || 0), 8);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const rect = viewport.convertToViewportRectangle([x, y, x + itemWidth, y + itemHeight]);
    const left = clamp(Math.floor(Math.min(rect[0], rect[2])) - 1, 0, width);
    const top = clamp(Math.floor(Math.min(rect[1], rect[3])) - 1, 0, height);
    const right = clamp(Math.ceil(Math.max(rect[0], rect[2])) + 1, 0, width);
    const bottom = clamp(Math.ceil(Math.max(rect[1], rect[3])) + 1, 0, height);
    if (right > left && bottom > top) {
      context.fillRect(left, top, right - left, bottom - top);
    }
  }

  context.restore();
}

function analyzeCanvasStructure(context, width, height) {
  const image = context.getImageData(0, 0, width, height).data;
  const pixels = width * height;
  const dark = new Uint8Array(pixels);
  const luminance = new Uint8Array(pixels);
  let nonWhiteCount = 0;
  let darkCount = 0;

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const lum = Math.round(image[offset] * 0.299 + image[offset + 1] * 0.587 + image[offset + 2] * 0.114);
    luminance[index] = lum;
    if (lum < 245) nonWhiteCount += 1;
    if (lum < 200) {
      dark[index] = 1;
      darkCount += 1;
    }
  }

  let edgeCount = 0;
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const index = y * width + x;
      if (
        Math.abs(luminance[index] - luminance[index - 1]) > 42 ||
        Math.abs(luminance[index] - luminance[index - width]) > 42
      ) {
        edgeCount += 1;
      }
    }
  }

  let horizontalRuns = 0;
  let denseRows = 0;
  const minHorizontalRun = Math.max(10, Math.round(width * 0.055));
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    let rowDark = 0;
    for (let x = 0; x < width; x += 1) {
      const isDark = dark[y * width + x];
      rowDark += isDark;
      if (isDark) {
        run += 1;
      } else {
        if (run >= minHorizontalRun) horizontalRuns += 1;
        run = 0;
      }
    }
    if (run >= minHorizontalRun) horizontalRuns += 1;
    if (rowDark / width > 0.18) denseRows += 1;
  }

  let verticalRuns = 0;
  let denseCols = 0;
  const minVerticalRun = Math.max(10, Math.round(height * 0.04));
  for (let x = 0; x < width; x += 1) {
    let run = 0;
    let colDark = 0;
    for (let y = 0; y < height; y += 1) {
      const isDark = dark[y * width + x];
      colDark += isDark;
      if (isDark) {
        run += 1;
      } else {
        if (run >= minVerticalRun) verticalRuns += 1;
        run = 0;
      }
    }
    if (run >= minVerticalRun) verticalRuns += 1;
    if (colDark / height > 0.12) denseCols += 1;
  }

  const edgeDensity = edgeCount / pixels;
  const inkDensity = nonWhiteCount / pixels;
  const darkDensity = darkCount / pixels;
  const diamondNodeCount = countDiamondNodes(dark, width, height);
  const diagonalRunCount = countDiagonalRuns(dark, width, height);
  const lineScore = clamp(horizontalRuns * 0.22 + verticalRuns * 0.28, 0, 42);
  const gridScore = clamp(Math.min(denseRows, 22) * 0.45 + Math.min(denseCols, 22) * 0.45, 0, 28);
  const edgeScore = clamp(edgeDensity * 190, 0, 30);
  const inkScore = inkDensity > 0.015 && inkDensity < 0.38 ? clamp(inkDensity * 48, 0, 14) : 0;
  const diamondScore = clamp(diamondNodeCount * 14, 0, 32);
  const diagonalScore = clamp(diagonalRunCount * 0.9, 0, 24);
  const tableGridScore = estimateTableGridScore(horizontalRuns, verticalRuns, denseRows, denseCols);
  const visualScore = lineScore + gridScore + edgeScore + inkScore + diamondScore + diagonalScore;

  return {
    width,
    height,
    edgeDensity,
    inkDensity,
    darkDensity,
    horizontalRuns,
    verticalRuns,
    denseRows,
    denseCols,
    diamondNodeCount,
    diagonalRunCount,
    lineScore,
    gridScore,
    edgeScore,
    inkScore,
    diamondScore,
    diagonalScore,
    tableGridScore,
    visualScore,
  };
}

function countDiagonalRuns(dark, width, height) {
  const minRun = Math.max(7, Math.round(Math.min(width, height) * 0.035));
  let runs = 0;

  for (let y = 2; y < height - minRun - 2; y += 3) {
    for (let x = 2; x < width - minRun - 2; x += 3) {
      if (hasDiagonalRun(dark, width, height, x, y, 1, minRun)) runs += 1;
      if (hasDiagonalRun(dark, width, height, x, y + minRun, -1, minRun)) runs += 1;
    }
  }

  return runs;
}

function hasDiagonalRun(dark, width, height, startX, startY, direction, minRun) {
  let hits = 0;
  for (let step = 0; step < minRun; step += 1) {
    const x = startX + step;
    const y = startY + direction * step;
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    if (hasDarkNear(dark, width, height, x, y)) hits += 1;
  }
  return hits / minRun >= 0.65;
}

function estimateTableGridScore(horizontalRuns, verticalRuns, denseRows, denseCols) {
  const balancedRuns = Math.min(horizontalRuns, verticalRuns);
  const balancedDenseLines = Math.min(denseRows, denseCols);
  return clamp(balancedRuns * 0.55 + balancedDenseLines * 0.8, 0, 45);
}

function countDiamondNodes(dark, width, height) {
  let count = 0;
  const minRadius = Math.max(8, Math.round(Math.min(width, height) * 0.035));
  const maxRadius = Math.max(minRadius + 2, Math.round(Math.min(width, height) * 0.11));
  const step = Math.max(3, Math.round(minRadius * 0.5));

  for (let y = maxRadius; y < height - maxRadius; y += step) {
    for (let x = maxRadius; x < width - maxRadius; x += step) {
      if (isDiamondAt(dark, width, height, x, y, minRadius, maxRadius)) {
        count += 1;
        x += maxRadius;
      }
    }
  }

  return count;
}

function isDiamondAt(dark, width, height, centerX, centerY, minRadius, maxRadius) {
  for (let radius = minRadius; radius <= maxRadius; radius += 3) {
    const edgeHits = sampleDiamondEdges(dark, width, height, centerX, centerY, radius);
    if (edgeHits < 0.58) continue;

    const horizontalHits = sampleLine(dark, width, height, centerX - radius, centerY, centerX + radius, centerY);
    const verticalHits = sampleLine(dark, width, height, centerX, centerY - radius, centerX, centerY + radius);
    const centerFill = sampleRegionDensity(dark, width, height, centerX, centerY, Math.max(2, Math.round(radius * 0.22)));

    if (horizontalHits < 0.28 && verticalHits < 0.28 && centerFill < 0.45) {
      return true;
    }
  }
  return false;
}

function sampleDiamondEdges(dark, width, height, centerX, centerY, radius) {
  const points = [
    [centerX, centerY - radius, centerX + radius, centerY],
    [centerX + radius, centerY, centerX, centerY + radius],
    [centerX, centerY + radius, centerX - radius, centerY],
    [centerX - radius, centerY, centerX, centerY - radius],
  ];
  const ratios = points.map(([x1, y1, x2, y2]) => sampleLine(dark, width, height, x1, y1, x2, y2));
  return ratios.filter((ratio) => ratio >= 0.5).length / ratios.length;
}

function sampleLine(dark, width, height, x1, y1, x2, y2) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  let hits = 0;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    hits += hasDarkNear(dark, width, height, x, y) ? 1 : 0;
  }
  return hits / (steps + 1);
}

function hasDarkNear(dark, width, height, x, y) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && px < width && py >= 0 && py < height && dark[py * width + px]) return true;
    }
  }
  return false;
}

function sampleRegionDensity(dark, width, height, centerX, centerY, radius) {
  let hits = 0;
  let total = 0;
  for (let y = Math.max(0, centerY - radius); y <= Math.min(height - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(width - 1, centerX + radius); x += 1) {
      hits += dark[y * width + x] ? 1 : 0;
      total += 1;
    }
  }
  return total ? hits / total : 0;
}

function scorePdfPage(pageNumber, text, strings, textItems, visual, totalPages, textSignals) {
  const signals = textSignals || getPageTextSignals(text, strings, textItems);
  const compactText = signals.compactText;
  let score = 0;
  const reasons = [];

  if (signals.documentMetaLike) {
    return {
      page: pageNumber,
      score: 0,
      textLength: signals.textLength,
      itemCount: signals.itemCount,
      visual,
      hasVisualContent: false,
      flowCandidate: false,
      tableCandidate: false,
      visualKind: "none",
      reasons: ["疑似文档元信息页，降低优先级"],
    };
  }

  for (const [keyword, weight] of VISUAL_PAGE_KEYWORDS) {
    if (compactText.includes(keyword)) {
      score += weight;
      reasons.push(keyword);
    }
  }

  if (visual.diamondNodeCount > 0) reasons.push("检测到菱形判断节点");
  if (visual.diagonalRunCount >= 4) reasons.push("检测到斜向连接线");
  score += visual.diamondNodeCount > 0 ? visual.visualScore : visual.lineScore + visual.inkScore + Math.min(visual.edgeScore, 8);
  if (visual.lineScore >= 14) reasons.push("线条结构明显");
  if (visual.gridScore >= 10) reasons.push("疑似表格/泳道");
  if (visual.edgeScore >= 10) reasons.push("边缘/图形密集");

  const textLength = signals.textLength;
  const itemCount = signals.itemCount;
  const shortRatio = signals.shortRatio;
  const regionCount = signals.regionCount;
  const directoryLike = signals.directoryLike;

  if (itemCount >= 60 && shortRatio >= 0.45) {
    score += 8;
    reasons.push("短文本块密集");
  }
  if (itemCount >= 100) {
    score += 5;
    reasons.push("页面元素密集");
  }
  if (regionCount >= 6 && shortRatio >= 0.35) {
    score += 10;
    reasons.push("短文本分散成块");
  }
  if (textLength > 0 && textLength <= 180 && itemCount >= 12) {
    score += 9;
    reasons.push("疑似图形页");
  }
  if (textLength === 0 && visual.visualScore >= 10) {
    score += 10;
    reasons.push("无文字但有图形");
  }
  if (directoryLike) {
    score = Math.min(score - 25, 0);
    reasons.push("疑似目录页，降低优先级");
  }

  const strongGrid = hasStrongGridStructure(visual);
  const flowShapeSignal =
    visual.diamondNodeCount >= 1 ||
    visual.diagonalRunCount >= 3 ||
    (visual.diagonalRunCount >= 1 && /是否|判断|条件|分支|审批|驳回|成功|失败|开始|结束|START|END/i.test(compactText));
  const strongFlowTextSignal = /流程图|工作流|泳道|状态流转|分支|节点|箭头|开始|结束|START|END|Flowchart|Workflow/i.test(compactText);
  const decisionTextSignal = /判断|是否|条件|分支|审批|驳回|成功|失败|Success|Default|Decision/i.test(compactText);
  const flowTextSignal =
    strongFlowTextSignal ||
    (decisionTextSignal && textLength <= 260 && itemCount <= 45) ||
    (decisionTextSignal && visual.diagonalRunCount >= 1);
  const scatteredNodeSignal = regionCount >= 6 && shortRatio >= 0.34 && itemCount >= 12;
  const tableTextSignal = /表格|清单|列表|字段|规则表|配置表|明细|序号|Table|Field|Column|Row|Required|Rule/i.test(compactText);
  const textHeavyTableSignal =
    itemCount >= 70 &&
    textLength >= 300 &&
    visual.diagonalRunCount === 0 &&
    visual.diamondNodeCount === 0 &&
    (visual.horizontalRuns >= 10 || visual.edgeDensity >= 0.015);
  const tableGridSignal =
    visual.tableGridScore >= 8 ||
    (visual.horizontalRuns >= 6 && visual.verticalRuns >= 5 && visual.diagonalRunCount === 0 && visual.diamondNodeCount === 0);
  const tableCandidate =
    !flowShapeSignal &&
    (textHeavyTableSignal || (tableGridSignal && !flowTextSignal && (tableTextSignal || !scatteredNodeSignal)));
  const flowCandidate =
    !directoryLike &&
    !tableCandidate &&
    (flowShapeSignal ||
      (flowTextSignal && (visual.lineScore >= 3 || visual.edgeDensity >= 0.003)) ||
      (scatteredNodeSignal && visual.diagonalRunCount >= 1));

  // 视觉内容检测: 文本掩蔽后仍有明显图形→截图给 LLM 自行识别
  const hasVisualContent =
    flowCandidate ||
    tableCandidate ||
    visual.horizontalRuns >= 6 ||
    visual.verticalRuns >= 6 ||
    visual.inkDensity >= 0.03 ||
    visual.edgeDensity >= 0.006 ||
    visual.visualScore >= 18;
  if (!hasVisualContent) {
    score = Math.min(score, 0);
  }
  if (tableCandidate && !flowCandidate) {
    score = Math.max(score - 12, 5);
    reasons.push("更像表格/网格页");
  }

  return {
    page: pageNumber,
    score,
    textLength,
    itemCount,
    visual,
    hasVisualContent,
    flowCandidate,
    tableCandidate,
    visualKind: flowCandidate ? "flowchart" : tableCandidate ? "table" : hasVisualContent ? "graphic" : "none",
    reasons,
  };
}





function hasStrongGridStructure(visual) {
  return (
    visual.tableGridScore >= 10 ||
    (visual.horizontalRuns >= 7 && visual.verticalRuns >= 7 && visual.gridScore >= 5) ||
    (visual.denseRows >= 5 && visual.denseCols >= 4)
  );
}

function isLikelyDirectoryPage(compactText, strings) {
  if (!/目录|contents/i.test(compactText)) return false;
  const shortLineCount = strings.filter((item) => item.trim().length > 0 && item.trim().length <= 24).length;
  const pageNumberLikeCount = strings.filter((item) => /^\d{1,3}$/.test(item.trim())).length;
  const leaderLike = /[.·]{3,}|…{2,}/.test(compactText);
  return leaderLike || pageNumberLikeCount >= 4 || shortLineCount >= 18;
}

function isLikelyDocumentMetaPage(compactText, strings) {
  const text = compactText.toLowerCase();
  const hasCoverSignals =
    /系统需求说明书|产品开发部|版权所有|版本\d|srs|requirementsspecification/.test(text) &&
    compactText.length <= 180;
  const hasRevisionSignals =
    /文档信息|文档修订历史|修订者|修订日期|修订内容|版本号|最后修订者|审核者|创建日期|documenthistory|revisionhistory/.test(text);
  const hasSignatureSignals = /签字页|审核|批准|部门|签字|日期/.test(text) && /角色|部门|签字|日期/.test(text);

  const versionLikeCount = strings.filter((item) => /^v?\d+(?:\.\d+)?$/i.test(item.trim())).length;
  const dateLikeCount = strings.filter((item) => /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|yyyy-mm-dd/i.test(item.trim())).length;
  const tableHeaderLike = /版本号|修订日期|修订内容|修订者|作者|审核者|创建日期|文档类型|角色|部门|签字/.test(compactText);
  const revisionContinuationLike =
    versionLikeCount >= 1 &&
    /流程|判断|补充|更新|修改|删除|增加|修正|change|update|add|fix/i.test(compactText) &&
    /冯晴爽|李一峰|作者|修订者|reviewer|author/i.test(compactText);
  if (!hasCoverSignals && !hasRevisionSignals && !hasSignatureSignals && !revisionContinuationLike) return false;

  return hasCoverSignals || tableHeaderLike || versionLikeCount >= 3 || dateLikeCount >= 2 || revisionContinuationLike;
}

function countTextRegions(textItems) {
  const regions = new Set();
  for (const item of textItems) {
    if (!("str" in item) || !item.str.trim()) continue;
    const transform = item.transform || [];
    const x = Number(transform[4] || 0);
    const y = Number(transform[5] || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    regions.add(`${Math.floor(x / 120)}:${Math.floor(y / 90)}`);
  }
  return regions.size;
}

function selectVisualPages(pageStats) {
  const flowPages = pageStats
    .filter((item) => item.flowCandidate && item.score >= 8)
    .sort((a, b) => b.score - a.score || a.page - b.page);
  const maxFlowPages = pageStats.length >= 50 ? 80 : pageStats.length >= 20 ? 48 : 24;
  const selected = [];

  for (const item of flowPages) {
    if (selected.length >= maxFlowPages) break;
    selected.push(item.page);
  }

  return Array.from(new Set(selected)).sort((a, b) => a - b);
}

function expandFlowchartRanges(pageStats) {
  const strongFlowPages = pageStats
    .filter((item) => item.flowCandidate && item.score >= 40)
    .map((item) => item.page)
    .sort((a, b) => a - b);
  if (strongFlowPages.length < 2) return;

  const gaps = [];
  for (let index = 0; index < strongFlowPages.length - 1; index += 1) {
    const from = strongFlowPages[index];
    const to = strongFlowPages[index + 1];
    const gap = to - from;
    if (gap > 1 && gap <= 30) {
      gaps.push([from, to]);
    }
  }

  for (const [from, to] of gaps) {
    for (let page = from + 1; page < to; page += 1) {
      const stats = pageStats[page - 1];
      if (!stats || stats.flowCandidate || stats.tableCandidate || stats.visualKind === "table") continue;
      if (stats.textLength > 180 || stats.itemCount > 20) continue;
      stats.flowCandidate = true;
      stats.hasVisualContent = true;
      stats.visualKind = "flowchart";
      stats.score = Math.max(stats.score, 40);
      stats.reasons = [...stats.reasons, "位于连续流程图章节中"];
    }
  }
}

async function renderPdfPageImage(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(1.35, 1200 / baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.72);
}

async function getPdfJs() {
  const sources = [
    {
      lib: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs",
      worker: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs",
    },
    {
      lib: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs",
      worker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs",
    },
  ];

  let lastError;
  for (const source of sources) {
    try {
      const mod = await import(source.lib);
      mod.GlobalWorkerOptions.workerSrc = source.worker;
      return mod;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`PDF 解析库加载失败：${lastError?.message || "网络不可用"}`);
}

function reviewByRole(role, text, threshold) {
  const lowerText = text.toLowerCase();
  const found = [];
  const missing = [];
  const signals = buildSignals(role);

  Object.entries(signals).forEach(([topic, keywords]) => {
    const hit = keywords.some((keyword) => lowerText.includes(keyword.toLowerCase()));
    if (hit) {
      found.push(topic);
    } else {
      missing.push(topic);
    }
  });

  const structureBonus = calcStructureBonus(text);
  const lengthBonus = Math.min(Math.floor(text.length / 2500), 8);
  const score = clamp(100 - missing.length * 11 + structureBonus + lengthBonus, 45, 96);
  const passed = score >= threshold && missing.length === 0;

  return {
    role: role.name,
    definition: role.definition,
    score,
    passed,
    threshold,
    found,
    missing,
    reasons: missing.length
      ? missing.map((topic) => `缺少或未明显描述：${topic}`)
      : ["核心信息较完整，未发现会阻断该角色评审通过的明显缺口。"],
    suggestions: missing.length
      ? missing.map((topic) => suggestions[role.name]?.[topic] || `补充「${topic}」相关说明。`)
      : ["建议继续补充更具体的示例、验收条件和风险说明，便于后续落地。"],
    risks: missing.length ? [] : ["本地规则评审只能做关键词和结构判断，建议使用模型评审做语义复核。"],
    reviewMode: "本地规则",
  };
}

function calcStructureBonus(text) {
  const hints = ["一、", "二、", "1.", "1、", "流程", "表", "图", "说明", "规则"];
  const hits = hints.filter((hint) => text.includes(hint)).length;
  return Math.min(hits, 6);
}

function buildSignals(role) {
  if (role.signals && Object.keys(role.signals).length && !isEditedDefaultRole(role)) {
    return role.signals;
  }

  const entries = role.criteria.length ? role.criteria : [role.definition || role.name];
  return entries.reduce((acc, criterion, index) => {
    const topic = topicFromCriterion(criterion, index);
    const keywords = extractKeywords(criterion);
    acc[topic] = keywords.length ? keywords : [topic];
    return acc;
  }, {});
}

function isEditedDefaultRole(role) {
  const source = defaultRoles.find((item) => item.id === role.id);
  if (!source) return true;
  return (
    role.name !== source.name ||
    role.definition !== source.definition ||
    role.criteria.join("\n") !== source.criteria.join("\n")
  );
}

function topicFromCriterion(criterion, index) {
  return (
    String(criterion)
      .replace(/是否/g, "")
      .replace(/[，。；、,.?？]/g, " ")
      .trim()
      .split(/\s+/)[0]
      .slice(0, 12) || `评审点${index + 1}`
  );
}

function extractKeywords(value) {
  return String(value)
    .replace(/是否|明确|清晰|完整|可量化|说明|补充|评审|需求/g, " ")
    .split(/[，。；、,.?？\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 8);
}

function renderResults() {
  const passed = state.reviews.filter((item) => item.passed).length;
  const average = Math.round(
    state.reviews.reduce((sum, item) => sum + item.score, 0) / state.reviews.length,
  );

  setMetrics({
    pages: state.pages,
    textCount: state.text.length,
    passed: `${passed}/${state.reviews.length}`,
    average,
  });

  els.roleList.innerHTML = state.reviews.map(renderRoleCard).join("");
}

function renderRoleCard(review) {
  const resultClass = review.passed ? "pass" : "fail";
  const resultText = review.passed ? "通过" : "未通过";
  return `
    <article class="role-card">
      <div class="role-card-head">
        <div class="role-title">
          <span class="role-dot ${resultClass}" aria-hidden="true"></span>
          <div>
            <h3>${escapeHtml(review.role)}</h3>
            <p>${escapeHtml(review.definition)}</p>
          </div>
        </div>
        <div class="score">
          <strong>${review.score}</strong>
          <span>/100</span>
          <span class="badge ${resultClass}">${resultText}</span>
        </div>
      </div>
      <div class="role-body">
        <div class="detail-block">
          <h4>原因</h4>
          ${renderList(review.reasons)}
        </div>
        <div class="detail-block">
          <h4>优化方向</h4>
          ${renderList(review.suggestions)}
        </div>
        ${renderRisks(review.risks)}
      </div>
    </article>
  `;
}

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderRisks(items) {
  if (!items || !items.length) return "";
  return `
    <div class="detail-block detail-block-wide">
      <h4>风险提示</h4>
      ${renderList(items)}
    </div>
  `;
}

function renderEmpty() {
  els.roleList.innerHTML = `
    <article class="empty-state">
      <h3>尚未评审</h3>
      <p>添加 PDF 后点击开始评审。</p>
    </article>
  `;
}

function renderError(message) {
  els.roleList.innerHTML = `
    <article class="empty-state">
      <h3>无法完成评审</h3>
      <p>${escapeHtml(message)}</p>
    </article>
  `;
  setMetrics({ pages: "-", textCount: "-", passed: "-", average: "-" });
}

async function copyReport() {
  if (!state.reviews.length) return;
  const report = buildMarkdownReport();
  try {
    await navigator.clipboard.writeText(report);
    showToast("报告已复制");
  } catch {
    els.documentPreview.textContent = report;
    showToast("报告已显示在文档摘录区");
  }
}

function buildMarkdownReport() {
  const conclusion = allPassed() ? "通过" : "未通过";
  const lines = [
    "# 需求文档评审报告",
    "",
    `- 文档：${state.file?.name || "-"}`,
    `- 页数：${state.pages}`,
    `- 提取字数：${state.text.length}`,
    `- 视觉页面：${state.pageImages.length}`,
    `- 评审结论：${conclusion}`,
    "",
    "## 评分汇总",
    "",
    "| 角色 | 分数 | 通过线 | 结果 |",
    "| --- | ---: | ---: | --- |",
    ...state.reviews.map((item) => {
      const result = item.passed ? "通过" : "未通过";
      return `| ${item.role} | ${item.score} | ${item.threshold} | ${result} |`;
    }),
    "",
    "## 评审详情",
    "",
  ];

  state.reviews.forEach((item) => {
    lines.push(`### ${item.role}`);
    lines.push("");
    lines.push("原因：");
    item.reasons.forEach((reason) => lines.push(`- ${reason}`));
    lines.push("");
    lines.push("优化方向：");
    item.suggestions.forEach((suggestion) => lines.push(`- ${suggestion}`));
    if (item.risks?.length) {
      lines.push("");
      lines.push("风险提示：");
      item.risks.forEach((risk) => lines.push(`- ${risk}`));
    }
    lines.push("");
  });

  return lines.join("\n");
}

function allPassed() {
  return state.reviews.length > 0 && state.reviews.every((item) => item.passed);
}

function setBusy(isBusy) {
  els.reviewButton.disabled = isBusy || !state.file || !getActiveRoles().length;
  els.reviewButton.innerHTML = isBusy
    ? `<span aria-hidden="true">…</span> 评审中`
    : `<span aria-hidden="true">✓</span> 开始评审`;
}

function refreshReviewButton() {
  els.reviewButton.disabled = !state.file || !getActiveRoles().length;
}

function setStatus(text, type = "") {
  els.overallStatus.textContent = text;
  els.overallStatus.className = `status-pill ${type}`.trim();
}

function setMetrics({ pages, textCount, passed, average }) {
  els.pageCount.textContent = String(pages);
  els.textCount.textContent = typeof textCount === "number" ? textCount.toLocaleString() : textCount;
  els.passedCount.textContent = String(passed);
  els.averageScore.textContent = String(average);
}

function previewText(text) {
  if (text.length <= 12000) return text;
  return `${text.slice(0, 12000)}\n\n[内容较长，页面仅展示前 12000 个字符]`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function showToast(message) {
  const oldToast = document.querySelector(".toast");
  oldToast?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 1800);
}
