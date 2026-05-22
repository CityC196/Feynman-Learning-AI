const API_BASE = window.location.protocol === "file:" ? "http://localhost:5173" : "";
const SESSION_STORAGE_KEY = "mechanics-feynman-session";
const LIBRARY_STORAGE_KEY = "mechanics-feynman-library";
const PARTICIPANT_STORAGE_KEY = "mechanics-feynman-participant";
const PRIVACY_CONSENT_VERSION = "2026-05-22";

const state = {
  screen: "setup",
  task: null,
  messages: [],
  observations: [],
  report: null,
  turn: 0,
  busy: false,
  library: [],
  libraryId: "",
  activeLibraryId: "",
  libraryFilter: "all",
  libraryQuery: "",
  libraryReturnScreen: "setup",
  participant: null,
  syncBusy: false,
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FEEDBACK_IMAGES = 6;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
let selectedImageDataUrl = "";

const elements = {
  setupScreen: document.querySelector("#setupScreen"),
  lectureScreen: document.querySelector("#lectureScreen"),
  reportScreen: document.querySelector("#reportScreen"),
  libraryScreen: document.querySelector("#libraryScreen"),
  lectureButton: document.querySelector("#lectureButton"),
  libraryButton: document.querySelector("#libraryButton"),
  sidebarConversationList: document.querySelector("#sidebarConversationList"),
  feedbackButton: document.querySelector("#feedbackButton"),
  saveNotice: document.querySelector("#saveNotice"),
  stageLabel: document.querySelector("#stageLabel"),
  turnCount: document.querySelector("#turnCount"),
  taskForm: document.querySelector("#taskForm"),
  courseName: document.querySelector("#courseName"),
  taskContent: document.querySelector("#taskContent"),
  taskContentLabel: document.querySelector("#taskContentLabel"),
  taskFormulaToolButton: document.querySelector("#taskFormulaToolButton"),
  taskImageToolButton: document.querySelector("#taskImageToolButton"),
  conceptModeCard: document.querySelector("#conceptModeCard"),
  problemModeCard: document.querySelector("#problemModeCard"),
  sessionSummary: document.querySelector("#sessionSummary"),
  lectureTopicBanner: document.querySelector("#lectureTopicBanner"),
  conversation: document.querySelector("#conversation"),
  replyForm: document.querySelector("#replyForm"),
  replyInput: document.querySelector("#replyInput"),
  formulaToolButton: document.querySelector("#formulaToolButton"),
  imageToolButton: document.querySelector("#imageToolButton"),
  submitReplyButton: document.querySelector("#submitReplyButton"),
  reportButton: document.querySelector("#reportButton"),
  saveReportButton: document.querySelector("#saveReportButton"),
  continueButton: document.querySelector("#continueButton"),
  focusList: document.querySelector("#focusList"),
  reportPanel: document.querySelector("#reportPanel"),
  loadingState: document.querySelector("#loadingState"),
  errorState: document.querySelector("#errorState"),
  formulaModal: document.querySelector("#formulaModal"),
  formulaField: document.querySelector("#formulaField"),
  formulaModalHint: document.querySelector("#formulaModalHint"),
  insertFormulaButton: document.querySelector("#insertFormulaButton"),
  clearFormulaButton: document.querySelector("#clearFormulaButton"),
  closeFormulaButton: document.querySelector("#closeFormulaButton"),
  cancelFormulaButton: document.querySelector("#cancelFormulaButton"),
  imageModal: document.querySelector("#imageModal"),
  imageUploadInput: document.querySelector("#imageUploadInput"),
  imagePreview: document.querySelector("#imagePreview"),
  imageEmptyState: document.querySelector("#imageEmptyState"),
  imageHintInput: document.querySelector("#imageHintInput"),
  imageStatus: document.querySelector("#imageStatus"),
  imageError: document.querySelector("#imageError"),
  recognizedTextInput: document.querySelector("#recognizedTextInput"),
  recognizeImageButton: document.querySelector("#recognizeImageButton"),
  insertRecognizedButton: document.querySelector("#insertRecognizedButton"),
  closeImageButton: document.querySelector("#closeImageButton"),
  cancelImageButton: document.querySelector("#cancelImageButton"),
  privacyBanner: document.querySelector("#privacyBanner"),
  researchStatus: document.querySelector("#researchStatus"),
  joinResearchButton: document.querySelector("#joinResearchButton"),
  stopSyncButton: document.querySelector("#stopSyncButton"),
  consentModal: document.querySelector("#consentModal"),
  consentCheckbox: document.querySelector("#consentCheckbox"),
  confirmConsentButton: document.querySelector("#confirmConsentButton"),
  cancelConsentButton: document.querySelector("#cancelConsentButton"),
  feedbackModal: document.querySelector("#feedbackModal"),
  feedbackMessageInput: document.querySelector("#feedbackMessageInput"),
  feedbackImageInput: document.querySelector("#feedbackImageInput"),
  feedbackImagePreviewList: document.querySelector("#feedbackImagePreviewList"),
  feedbackImageEmptyState: document.querySelector("#feedbackImageEmptyState"),
  feedbackStatus: document.querySelector("#feedbackStatus"),
  feedbackError: document.querySelector("#feedbackError"),
  submitFeedbackButton: document.querySelector("#submitFeedbackButton"),
  removeFeedbackImageButton: document.querySelector("#removeFeedbackImageButton"),
  closeFeedbackButton: document.querySelector("#closeFeedbackButton"),
  cancelFeedbackButton: document.querySelector("#cancelFeedbackButton"),
  librarySearch: document.querySelector("#librarySearch"),
  libraryList: document.querySelector("#libraryList"),
  libraryDetail: document.querySelector("#libraryDetail"),
  libraryLoadButton: document.querySelector("#libraryLoadButton"),
  libraryDeleteButton: document.querySelector("#libraryDeleteButton"),
};

let saveNoticeTimer = 0;
let activeInsertTarget = null;
let feedbackImageDataUrls = [];

elements.taskForm.addEventListener("submit", startSession);
elements.replyForm.addEventListener("submit", submitReply);
elements.reportButton.addEventListener("click", finishSession);
elements.lectureButton.addEventListener("click", resetSession);
elements.libraryButton.addEventListener("click", openLibrary);
elements.feedbackButton.addEventListener("click", openFeedbackModal);
elements.saveReportButton.addEventListener("click", () => saveCurrentToLibrary({ requireReport: true }));
elements.continueButton.addEventListener("click", continueLecture);
elements.taskForm.addEventListener("input", updateSetupPreview);
elements.taskForm.addEventListener("change", updateSetupPreview);
elements.taskFormulaToolButton.addEventListener("click", () => openFormulaModal(elements.taskContent));
elements.taskImageToolButton.addEventListener("click", () => openImageModal(elements.taskContent));
elements.formulaToolButton.addEventListener("click", () => openFormulaModal(elements.replyInput));
elements.imageToolButton.addEventListener("click", () => openImageModal(elements.replyInput));
elements.insertFormulaButton.addEventListener("click", insertFormula);
elements.clearFormulaButton.addEventListener("click", clearFormula);
elements.closeFormulaButton.addEventListener("click", closeFormulaModal);
elements.cancelFormulaButton.addEventListener("click", closeFormulaModal);
elements.imageUploadInput.addEventListener("change", handleImageSelection);
elements.recognizeImageButton.addEventListener("click", recognizeSelectedImage);
elements.insertRecognizedButton.addEventListener("click", insertRecognizedText);
elements.closeImageButton.addEventListener("click", closeImageModal);
elements.cancelImageButton.addEventListener("click", closeImageModal);
elements.joinResearchButton.addEventListener("click", openConsentModal);
elements.stopSyncButton.addEventListener("click", disableResearchSync);
elements.confirmConsentButton.addEventListener("click", enableResearchSync);
elements.cancelConsentButton.addEventListener("click", closeConsentModal);
elements.feedbackImageInput.addEventListener("change", handleFeedbackImageSelection);
elements.submitFeedbackButton.addEventListener("click", submitFeedback);
elements.removeFeedbackImageButton.addEventListener("click", clearFeedbackImage);
elements.closeFeedbackButton.addEventListener("click", closeFeedbackModal);
elements.cancelFeedbackButton.addEventListener("click", closeFeedbackModal);
elements.formulaModal.addEventListener("click", closeModalOnBackdrop);
elements.imageModal.addEventListener("click", closeModalOnBackdrop);
elements.consentModal.addEventListener("click", closeModalOnBackdrop);
elements.feedbackModal.addEventListener("click", closeModalOnBackdrop);
document.addEventListener("paste", handleImagePaste);
elements.librarySearch.addEventListener("input", updateLibrarySearch);
elements.libraryList.addEventListener("click", selectLibraryRecord);
elements.sidebarConversationList.addEventListener("click", loadSidebarConversation);
elements.sidebarConversationList.addEventListener("contextmenu", deleteSidebarConversation);
elements.libraryLoadButton.addEventListener("click", loadSelectedLibraryRecord);
elements.libraryDeleteButton.addEventListener("click", deleteSelectedLibraryRecord);
document
  .querySelectorAll('input[name="libraryFilter"]')
  .forEach((input) => input.addEventListener("change", updateLibraryFilter));

function startSession(event) {
  event.preventDefault();
  const form = new FormData(elements.taskForm);
  const task = {
    courseName: sanitize(form.get("courseName")) || "未命名学科",
    taskType: form.get("taskType") === "题目讲解" ? "题目讲解" : "知识点讲解",
    taskContent: sanitize(form.get("taskContent")),
  };

  if (!task.taskContent) {
    flashMissingInput([elements.taskContent]);
    return;
  }

  state.task = task;
  state.messages = [{ role: "assistant", text: buildIntroMessage(task), turn: 0 }];
  state.observations = [];
  state.report = null;
  state.turn = 0;
  state.libraryId = "";
  renderSessionSummary();
  renderConversation();
  renderFocusList();
  switchScreen("lecture");
  saveSession();
  saveCurrentToLibrary({ silent: true });
  elements.replyInput.focus();
}

async function submitReply(event) {
  event.preventDefault();
  if (state.busy) return;

  const explanation = sanitize(elements.replyInput.value);
  if (!explanation) {
    flashMissingInput([elements.replyInput]);
    return;
  }

  clearError();
  appendUserMessage(explanation);
  elements.replyInput.value = "";
  setBusy(true);

  try {
    const result = await postJson("/api/chat", {
      task: state.task,
      messages: state.messages,
      observations: state.observations,
      latestExplanation: explanation,
    });

    mergeObservations(result.observations || [], result.resolvedObservationIds || []);
    state.messages.push({
      role: "assistant",
      text: result.assistantText,
      turn: state.turn,
    });
    renderConversation();
    renderFocusList();
    saveSession();
    saveCurrentToLibrary({ silent: true });
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

async function finishSession() {
  if (state.busy) return;
  if (!state.messages.some((message) => message.role === "user")) {
    flashMissingInput([elements.replyInput]);
    elements.replyInput.focus();
    return;
  }

  clearError();
  setBusy(true, "正在生成诊断报告...");

  try {
    state.report = await postJson("/api/report", {
      task: state.task,
      messages: state.messages,
      observations: state.observations,
    });
    renderReport();
    switchScreen("report");
    saveCurrentToLibrary({ requireReport: true, silent: true });
    saveSession();
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

function continueLecture() {
  switchScreen("lecture");
  elements.replyInput.focus();
  saveSession();
}

function editSetup() {
  populateSetupFromState();
  switchScreen("setup");
  saveSession();
}

function appendUserMessage(text) {
  state.turn += 1;
  state.messages.push({ role: "user", text, turn: state.turn });
  renderConversation();
  updateTurnCount();
  saveSession();
  saveCurrentToLibrary({ silent: true });
}

function mergeObservations(newItems, resolvedIds) {
  const resolvedSet = new Set(resolvedIds.map(String));
  state.observations = state.observations.map((item) =>
    resolvedSet.has(item.id) ? { ...item, status: "resolved", resolvedTurn: state.turn } : item,
  );

  const incoming = newItems.map((item) => ({
    id: item.id || `obs-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: item.type || "理解漏洞",
    description: item.description || "",
    question: item.question || "",
    status: "active",
    firstSeenTurn: state.turn,
  }));

  state.observations.push(...incoming.filter((item) => item.description || item.question));
}

function openFormulaModal(targetInput = elements.replyInput) {
  activeInsertTarget = targetInput;
  clearError();
  updateModalCopy();
  elements.formulaModal.hidden = false;
  setupMathKeyboard();
  window.setTimeout(() => elements.formulaField.focus(), 0);
}

function closeFormulaModal() {
  elements.formulaModal.hidden = true;
  hideMathKeyboard();
  focusActiveInsertTarget();
}

function clearFormula() {
  elements.formulaField.value = "";
  elements.formulaField.focus();
}

function insertFormula() {
  const latex = String(elements.formulaField.value || "").trim();
  if (!latex) {
    elements.formulaField.focus();
    return;
  }

  insertIntoActiveInput(`\\(${latex}\\)`);
  closeFormulaModal();
}

function setupMathKeyboard() {
  if (!window.mathVirtualKeyboard) return;

  window.mathVirtualKeyboard.layouts = [
    {
      label: "常用",
      tooltip: "常用数学符号",
      rows: [
        ["+", "-", "\\times", "\\cdot", "\\frac{#@}{#?}", "\\sqrt{#0}", "#@^{#?}", "#@_{#?}", "="],
        ["\\sum", "\\int", "\\partial", "\\nabla", "\\lim_{#?}", "\\Delta", "\\infty", "\\approx", "\\ne"],
        ["\\alpha", "\\beta", "\\gamma", "\\theta", "\\lambda", "\\mu", "\\xi", "\\sigma", "\\omega"],
      ],
    },
    "symbols",
    "greek",
  ];
  window.mathVirtualKeyboard.visible = true;
}

function hideMathKeyboard() {
  if (window.mathVirtualKeyboard) {
    window.mathVirtualKeyboard.visible = false;
  }
}

function openImageModal(targetInput = elements.replyInput) {
  activeInsertTarget = targetInput;
  clearError();
  updateModalCopy();
  resetImageRecognition();
  elements.imageModal.hidden = false;
  window.setTimeout(() => elements.imageModal.focus(), 0);
}

function closeImageModal() {
  elements.imageModal.hidden = true;
  clearImageMessages();
  focusActiveInsertTarget();
}

function handleImageSelection(event) {
  loadImageFile(event.target.files?.[0] || null);
}

function handleImagePaste(event) {
  const files = getClipboardImageFiles(event.clipboardData);
  if (!files.length) return;

  if (!elements.feedbackModal.hidden) {
    event.preventDefault();
    loadFeedbackImageFiles(files, { source: "paste" });
    return;
  }

  const pasteTarget = getImagePasteTarget(event.target);
  if (pasteTarget) {
    openImageModal(pasteTarget);
  } else if (elements.imageModal.hidden) {
    return;
  }

  event.preventDefault();
  loadImageFile(files[0], { source: pasteTarget ? "direct-paste" : "paste" });
}

function getImagePasteTarget(target) {
  if (target === elements.taskContent) return elements.taskContent;
  if (target === elements.replyInput) return elements.replyInput;
  return null;
}

function getClipboardImageFiles(clipboardData) {
  const files = Array.from(clipboardData?.files || []);
  const imageFiles = files.filter((item) => item.type.startsWith("image/"));
  if (imageFiles.length) return imageFiles;

  const items = Array.from(clipboardData?.items || []);
  return items
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

function loadImageFile(file, options = {}) {
  clearImageMessages();
  selectedImageDataUrl = "";
  elements.recognizedTextInput.value = "";
  elements.recognizeImageButton.disabled = true;
  elements.imagePreview.hidden = true;
  elements.imagePreview.removeAttribute("src");
  elements.imageEmptyState.hidden = false;

  if (!file) return;

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    showImageError("请选择 png、jpg、jpeg 或 webp 图片。");
    elements.imageUploadInput.value = "";
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    showImageError("图片不能超过 5MB。可以先裁剪或压缩后再上传。");
    elements.imageUploadInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    selectedImageDataUrl = String(reader.result || "");
    elements.imagePreview.src = selectedImageDataUrl;
    elements.imagePreview.hidden = false;
    elements.imageEmptyState.hidden = true;
    elements.recognizeImageButton.disabled = false;
    if (options.source === "paste" || options.source === "direct-paste") {
      showImageStatus("已粘贴图片，可以开始识别。");
    }
  };
  reader.onerror = () => {
    showImageError("图片读取失败，请换一张图片再试。");
  };
  reader.readAsDataURL(file);
}

async function recognizeSelectedImage() {
  if (!selectedImageDataUrl) {
    showImageError("请先选择一张图片。");
    return;
  }

  clearImageMessages();
  setImageBusy(true, "正在识别图片...");

  try {
    const result = await postJson("/api/recognize-image", {
      task: getRecognitionTask(),
      imageDataUrl: selectedImageDataUrl,
      hint: sanitize(elements.imageHintInput.value),
    });
    elements.recognizedTextInput.value = formatRecognitionResult(result);
    showImageStatus(`识别完成。请先检查并修改，再插入${getActiveInsertLabel()}。`);
  } catch (error) {
    showImageError(`${error.message || "图片识别失败。"} 可以改用文字描述图像或公式。`);
  } finally {
    setImageBusy(false);
  }
}

function formatRecognitionResult(result) {
  const sections = [];
  const formulaLatex = sanitize(result?.formulaLatex);
  const recognizedText = sanitize(result?.recognizedText);
  const diagramDescription = sanitize(result?.diagramDescription);
  const uncertaintyNotes = Array.isArray(result?.uncertaintyNotes)
    ? result.uncertaintyNotes.map((item) => sanitize(item)).filter(Boolean)
    : [];

  if (recognizedText) {
    const content =
      formulaLatex && !looksFormulaIncluded(recognizedText, formulaLatex)
        ? `公式：\\(${formulaLatex}\\)\n\n${recognizedText}`
        : recognizedText;
    sections.push(`识别内容：\n${content}`);
  }
  if (!recognizedText && formulaLatex) sections.push(`识别内容：\n\\(${formulaLatex}\\)`);
  if (diagramDescription) sections.push(`图像描述：\n${diagramDescription}`);
  if (uncertaintyNotes.length) sections.push(`不确定处：\n${uncertaintyNotes.map((item) => `- ${item}`).join("\n")}`);

  return sections.length ? sections.join("\n\n") : "图片里没有识别出明确的公式或草图信息。";
}

function looksFormulaIncluded(text, latex) {
  const compactText = normalizeFormulaText(text);
  const compactLatex = normalizeFormulaText(latex);
  if (compactLatex && compactText.includes(compactLatex)) return true;
  if (/\\\(|\\\[|\$|\\frac|\\oint|\\int|\\sum/.test(text)) return true;
  if (/[∫∮∑√≈≤≥∞]/.test(text)) return true;
  return /[=<>]/.test(text) && /[A-Za-zΑ-Ωα-ωεθλμξπρσφω]/.test(text);
}

function normalizeFormulaText(value) {
  return String(value || "")
    .replace(/\\left|\\right/g, "")
    .replace(/[\\{}\s_]/g, "")
    .replace(/\^/g, "")
    .toLowerCase();
}

function insertRecognizedText() {
  const text = sanitize(elements.recognizedTextInput.value);
  if (!text) {
    flashMissingInput([elements.recognizedTextInput]);
    return;
  }

  const target = getActiveInsertTarget();
  const prefix = target.value.trim() ? "\n\n[图片识别结果]\n" : "[图片识别结果]\n";
  insertIntoActiveInput(`${prefix}${text}`);
  closeImageModal();
}

function insertIntoActiveInput(text) {
  const input = getActiveInsertTarget();
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = `${before}${text}${after}`;
  const cursor = start + text.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
  if (input === elements.taskContent) updateSetupPreview();
}

function getActiveInsertTarget() {
  return activeInsertTarget === elements.taskContent ? elements.taskContent : elements.replyInput;
}

function focusActiveInsertTarget() {
  getActiveInsertTarget().focus();
}

function getActiveInsertLabel() {
  if (getActiveInsertTarget() !== elements.taskContent) return "讲解";
  return getSelectedTaskType() === "题目讲解" ? "题目" : "知识点";
}

function updateModalCopy() {
  const label = getActiveInsertLabel();
  elements.formulaModalHint.innerHTML = `插入后会以 LaTeX 形式进入${escapeHtml(label)}，例如 <span>\\( f'(x)=0 \\)</span>。`;
  elements.insertFormulaButton.textContent = `插入${label}`;
  elements.insertRecognizedButton.textContent = `插入${label}`;
}

function getSelectedTaskType() {
  const form = new FormData(elements.taskForm);
  return form.get("taskType") === "题目讲解" ? "题目讲解" : "知识点讲解";
}

function getRecognitionTask() {
  if (getActiveInsertTarget() !== elements.taskContent && state.task) return state.task;

  return {
    courseName: sanitize(elements.courseName.value) || "未命名学科",
    taskType: getSelectedTaskType(),
    taskContent: sanitize(elements.taskContent.value) || "当前主题",
  };
}

function resetImageRecognition(clearFile = true) {
  selectedImageDataUrl = "";
  if (clearFile) elements.imageUploadInput.value = "";
  elements.imageHintInput.value = "";
  elements.recognizedTextInput.value = "";
  elements.imagePreview.hidden = true;
  elements.imagePreview.removeAttribute("src");
  elements.imageEmptyState.hidden = false;
  elements.recognizeImageButton.disabled = true;
  setImageBusy(false);
  clearImageMessages();
}

function setImageBusy(isBusy, message = "") {
  elements.recognizeImageButton.disabled = isBusy || !selectedImageDataUrl;
  elements.insertRecognizedButton.disabled = isBusy;
  elements.imageUploadInput.disabled = isBusy;
  elements.imageHintInput.disabled = isBusy;
  if (message) showImageStatus(message);
}

function showImageStatus(message) {
  elements.imageStatus.hidden = false;
  elements.imageStatus.textContent = message;
}

function showImageError(message) {
  elements.imageError.hidden = false;
  elements.imageError.textContent = message;
}

function clearImageMessages() {
  elements.imageStatus.hidden = true;
  elements.imageStatus.textContent = "";
  elements.imageError.hidden = true;
  elements.imageError.textContent = "";
}

function closeModalOnBackdrop(event) {
  if (event.target === elements.formulaModal) closeFormulaModal();
  if (event.target === elements.imageModal) closeImageModal();
  if (event.target === elements.consentModal && hasParticipant()) closeConsentModal();
  if (event.target === elements.feedbackModal) closeFeedbackModal();
}

function openConsentModal() {
  clearError();
  elements.consentCheckbox.checked = hasParticipant();
  elements.confirmConsentButton.disabled = false;
  elements.consentModal.hidden = false;
}

function closeConsentModal() {
  if (!hasParticipant()) {
    showSaveNotice("请先授权同步并生成访问码，再开始测评。");
    return;
  }

  elements.consentModal.hidden = true;
  elements.consentCheckbox.checked = false;
}

function openFeedbackModal() {
  if (!hasParticipant()) {
    openConsentModal();
    showSaveNotice("请先授权同步并生成访问码，再提交反馈。");
    return;
  }

  clearFeedbackMessages();
  elements.feedbackModal.hidden = false;
  window.setTimeout(() => elements.feedbackMessageInput.focus(), 0);
}

function closeFeedbackModal() {
  elements.feedbackModal.hidden = true;
  clearFeedbackMessages();
}

function handleFeedbackImageSelection(event) {
  loadFeedbackImageFiles(event.target.files || []);
}

function loadFeedbackImageFiles(files, options = {}) {
  clearFeedbackMessages();
  const incomingFiles = Array.from(files || []);

  if (!incomingFiles.length) return;
  if (feedbackImageDataUrls.length + incomingFiles.length > MAX_FEEDBACK_IMAGES) {
    showFeedbackError(`最多上传 ${MAX_FEEDBACK_IMAGES} 张截图。请先移除部分截图后再添加。`);
    elements.feedbackImageInput.value = "";
    return;
  }

  const invalidType = incomingFiles.find((file) => !ALLOWED_IMAGE_TYPES.has(file.type));
  if (invalidType) {
    showFeedbackError("请选择 png、jpg、jpeg 或 webp 图片。");
    elements.feedbackImageInput.value = "";
    return;
  }

  const oversized = incomingFiles.find((file) => file.size > MAX_IMAGE_BYTES);
  if (oversized) {
    showFeedbackError("图片不能超过 5MB。可以先裁剪或压缩后再上传。");
    elements.feedbackImageInput.value = "";
    return;
  }

  Promise.all(incomingFiles.map(readFileAsDataUrl))
    .then((dataUrls) => {
      feedbackImageDataUrls.push(...dataUrls.filter(Boolean));
      renderFeedbackImagePreviews();
      if (options.source === "paste") {
        showFeedbackStatus(`已粘贴 ${incomingFiles.length} 张截图。`);
      } else {
        showFeedbackStatus(`已添加 ${incomingFiles.length} 张截图。`);
      }
    })
    .catch(() => {
      showFeedbackError("图片读取失败，请换一张图片再试。");
    })
    .finally(() => {
      elements.feedbackImageInput.value = "";
    });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function submitFeedback() {
  if (!hasParticipant()) {
    openConsentModal();
    showSaveNotice("请先授权同步并生成访问码，再提交反馈。");
    return;
  }

  const message = sanitize(elements.feedbackMessageInput.value);
  if (!message && !feedbackImageDataUrls.length) {
    flashMissingInput([elements.feedbackMessageInput]);
    showFeedbackError("请写下反馈内容，或粘贴一张问题截图。");
    return;
  }

  setFeedbackBusy(true, "正在提交反馈...");

  try {
    await postJson(
      "/api/feedback",
      {
        message,
        imageDataUrls: feedbackImageDataUrls,
        context: buildFeedbackContext(),
      },
      { headers: participantHeaders() },
    );
    elements.feedbackMessageInput.value = "";
    clearFeedbackImage();
    showFeedbackStatus("反馈已提交。谢谢你帮我们把产品打磨得更好。");
    showSaveNotice("反馈已同步到后台。");
  } catch (error) {
    showFeedbackError(error.message || "反馈提交失败，请稍后再试。");
  } finally {
    setFeedbackBusy(false);
  }
}

function buildFeedbackContext() {
  loadLibrary();
  const activeRecord = state.screen === "library" ? getActiveLibraryRecord() : null;
  return {
    screen: state.screen,
    url: window.location.href,
    userAgent: navigator.userAgent,
    task: copyValue(activeRecord?.task || state.task),
    messages: copyValue(activeRecord?.messages || state.messages),
    observations: copyValue(activeRecord?.observations || state.observations),
    report: copyValue(activeRecord?.report || state.report),
    turn: Number(activeRecord?.turn || state.turn || 0),
    libraryId: activeRecord?.id || state.libraryId || "",
  };
}

function clearFeedbackImage() {
  feedbackImageDataUrls = [];
  elements.feedbackImageInput.value = "";
  elements.feedbackImagePreviewList.innerHTML = "";
  elements.feedbackImagePreviewList.hidden = true;
  elements.feedbackImageEmptyState.hidden = false;
  elements.removeFeedbackImageButton.disabled = true;
}

function renderFeedbackImagePreviews() {
  elements.feedbackImagePreviewList.hidden = !feedbackImageDataUrls.length;
  elements.feedbackImageEmptyState.hidden = Boolean(feedbackImageDataUrls.length);
  elements.removeFeedbackImageButton.disabled = !feedbackImageDataUrls.length;
  elements.feedbackImagePreviewList.innerHTML = feedbackImageDataUrls
    .map(
      (dataUrl, index) => `
        <figure class="feedback-preview-item">
          <img src="${escapeHtml(dataUrl)}" alt="反馈截图 ${index + 1}" />
          <figcaption>截图 ${index + 1}</figcaption>
        </figure>
      `,
    )
    .join("");
}

function setFeedbackBusy(isBusy, message = "") {
  elements.submitFeedbackButton.disabled = isBusy;
  elements.feedbackMessageInput.disabled = isBusy;
  elements.feedbackImageInput.disabled = isBusy;
  elements.removeFeedbackImageButton.disabled = isBusy || !feedbackImageDataUrls.length;
  if (message) showFeedbackStatus(message);
}

function showFeedbackStatus(message) {
  elements.feedbackStatus.hidden = false;
  elements.feedbackStatus.textContent = message;
  elements.feedbackError.hidden = true;
  elements.feedbackError.textContent = "";
}

function showFeedbackError(message) {
  elements.feedbackError.hidden = false;
  elements.feedbackError.textContent = message;
  elements.feedbackStatus.hidden = true;
  elements.feedbackStatus.textContent = "";
}

function clearFeedbackMessages() {
  elements.feedbackStatus.hidden = true;
  elements.feedbackStatus.textContent = "";
  elements.feedbackError.hidden = true;
  elements.feedbackError.textContent = "";
}

async function enableResearchSync() {
  if (!elements.consentCheckbox.checked) {
    showSaveNotice("请先勾选匿名测评数据同步说明。");
    return;
  }

  elements.confirmConsentButton.disabled = true;
  state.syncBusy = true;
  updatePrivacyBanner();

  try {
    const participant = await postJson("/api/participant", {
      consentAccepted: true,
      consentVersion: PRIVACY_CONSENT_VERSION,
    });
    state.participant = participant;
    localStorage.setItem(PARTICIPANT_STORAGE_KEY, JSON.stringify(participant));
    closeConsentModal();
    showSaveNotice(`授权完成。你的唯一访问码是 ${participant.participantCode}。`);
    await syncAllLibraryRecords();
  } catch (error) {
    showSaveNotice(error.message || "匿名同步开启失败，请稍后再试。");
  } finally {
    state.syncBusy = false;
    updatePrivacyBanner();
  }
}

function disableResearchSync() {
  openConsentModal();
  showSaveNotice("本次测评需要授权同步后继续。");
}

function restoreResearchIdentity() {
  const raw = localStorage.getItem(PARTICIPANT_STORAGE_KEY);
  if (!raw) {
    state.participant = null;
    return;
  }

  try {
    const participant = JSON.parse(raw);
    if (participant?.participantId && participant?.participantSecret) {
      state.participant = participant;
      return;
    }
  } catch {
    // Fall through and clear invalid identity.
  }

  state.participant = null;
  localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
}

function updatePrivacyBanner() {
  elements.privacyBanner.hidden = false;
  const participant = state.participant;
  const isSynced = hasParticipant();
  elements.joinResearchButton.hidden = isSynced;
  elements.stopSyncButton.hidden = true;
  elements.joinResearchButton.disabled = state.syncBusy;
  elements.stopSyncButton.disabled = state.syncBusy;

  if (state.syncBusy) {
    elements.researchStatus.textContent = "正在同步到调研后台...";
  } else if (isSynced) {
    elements.researchStatus.textContent = `已授权同步，唯一访问码：${participant.participantCode || participant.participantId}`;
  } else {
    elements.researchStatus.textContent = "请先授权同步并生成访问码。";
  }
}

function hasParticipant() {
  return Boolean(state.participant?.participantId && state.participant?.participantSecret);
}

async function syncLibraryRecord(record, options = {}) {
  if (!hasParticipant()) return;

  state.syncBusy = true;
  updatePrivacyBanner();

  try {
    await postJson(
      "/api/library",
      { record },
      {
        headers: participantHeaders(),
      },
    );
    if (!options.silent) showSaveNotice("已保存到对话记录，并同步到调研后台。");
  } catch (error) {
    if (!options.silent) showSaveNotice(`已保存在本机，但同步后台失败：${error.message || "网络异常"}`);
  } finally {
    state.syncBusy = false;
    updatePrivacyBanner();
  }
}

async function syncAllLibraryRecords() {
  loadLibrary();
  for (const record of state.library) {
    await syncLibraryRecord(record);
  }
}

async function deleteRemoteLibraryRecord(recordId) {
  if (!hasParticipant()) return;

  try {
    await fetch(`${API_BASE}/api/library/${encodeURIComponent(recordId)}`, {
      method: "DELETE",
      headers: participantHeaders(),
    });
  } catch {
    // Local delete should not be blocked by a transient sync failure.
  }
}

function participantHeaders() {
  return {
    "X-Participant-Id": state.participant.participantId,
    "X-Participant-Secret": state.participant.participantSecret,
  };
}

function buildIntroMessage(task) {
  if (task.taskType === "题目讲解") {
    return buildFirstQuestion(task);
  }

  return buildFirstQuestion(task);
}

function buildFirstQuestion(task) {
  const topic = taskLabel(task).replace(/[「」]/g, "").trim();
  const quotedTopic = `「${topic}」`;

  if (task.taskType === "题目讲解") {
    return `我有一些基础，但还不会这道题。\n\n请你先用自己的话讲一下这道题主要在问什么。`;
  }

  if (/定理|法则|原理|公式/.test(topic)) {
    return `我有一些基础，但还没真正学会${quotedTopic}。\n\n请你用自己的话陈述一下${quotedTopic}的主要内容。`;
  }

  if (/关系|方法|判据|方程/.test(topic)) {
    return `我有一些基础，但还没真正学会${quotedTopic}。\n\n请你用自己的话讲一下${quotedTopic}主要在解决什么问题。`;
  }

  return `我有一些基础，但还没真正学会${quotedTopic}。\n\n请你先用自己的话讲一下${quotedTopic}的主要内容。`;
}

function switchScreen(screen) {
  if (screen === "intro") screen = "setup";

  state.screen = screen;
  elements.setupScreen.classList.toggle("active", screen === "setup");
  elements.lectureScreen.classList.toggle("active", screen === "lecture");
  elements.reportScreen.classList.toggle("active", screen === "report");
  elements.libraryScreen.classList.toggle("active", screen === "library");
  if (elements.stageLabel) {
    elements.stageLabel.textContent =
      screen === "setup"
        ? "创建学习会话"
        : screen === "lecture"
          ? "正式讲解"
          : screen === "report"
            ? "诊断报告"
            : "对话记录";
  }
  updateTurnCount();
  updateSaveButtons();
  renderSidebarConversations();
}

function renderSessionSummary() {
  if (!state.task) return;

  elements.sessionSummary.innerHTML = `
    <div class="summary-item">
      <strong>学科</strong>
      ${escapeHtml(state.task.courseName)}
    </div>
    <div class="summary-item">
      <strong>模式</strong>
      ${escapeHtml(state.task.taskType)}
    </div>
  `;
  renderLectureTopicBanner();
}

function renderLectureTopicBanner() {
  if (!state.task) {
    elements.lectureTopicBanner.innerHTML = "";
    return;
  }

  const topicLabel = state.task.taskType === "题目讲解" ? "题目" : "知识点";
  elements.lectureTopicBanner.innerHTML = `
    <div class="lecture-topic-meta">
      <span>${escapeHtml(state.task.courseName || "未命名学科")}</span>
      <span>${escapeHtml(state.task.taskType || "知识点讲解")}</span>
      <span>${escapeHtml(topicLabel)}</span>
    </div>
    <p>${escapeHtml(state.task.taskContent || "当前主题")}</p>
  `;
}

function renderConversation() {
  elements.conversation.innerHTML = state.messages
    .map((message) => {
      const roleLabel =
        message.role === "user"
          ? `你的第 ${message.turn} 轮讲解`
          : message.turn === 0
            ? "AI 学生的开场"
            : "AI 学生";
      return `
        <article class="message ${message.role === "user" ? "user" : "ai"}">
          <div class="message-role">${escapeHtml(roleLabel)}</div>
          <div class="message-body">${escapeHtml(message.text)}</div>
        </article>
      `;
    })
    .join("");
  elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

function renderFocusList() {
  const observations = state.observations.slice().reverse();

  if (!observations.length) {
    elements.focusList.innerHTML = `<p class="muted">暂无观察。</p>`;
    return;
  }

  elements.focusList.innerHTML = observations
    .map((item) => {
      const resolved = item.status === "resolved";
      const stateLabel = resolved ? `第 ${item.resolvedTurn} 轮已变清楚` : `第 ${item.firstSeenTurn} 轮发现`;

      return `
        <article class="focus-card ${resolved ? "resolved" : ""}">
          <div class="tag-row">
            <span class="tag ${resolved ? "resolved" : ""}">${escapeHtml(item.type)}</span>
          </div>
          <strong>${escapeHtml(stateLabel)}</strong>
          <p>${escapeHtml(item.description || item.question)}</p>
        </article>
      `;
    })
    .join("");
}

function renderReport() {
  const report = state.report || {};
  elements.reportPanel.innerHTML = `
    <section class="report-section wide">
      <h3>本次讲解主题</h3>
      <p>${escapeHtml(report.topic || `${state.task.courseName} · ${state.task.taskType} · ${taskLabel(state.task)}`)}</p>
    </section>

    <section class="report-section">
      <h3>主要理解漏洞</h3>
      ${renderList(report.mainGaps || ["暂无明确记录。"])}
    </section>

    <section class="report-section">
      <h3>关键逻辑跳跃</h3>
      ${renderList(report.logicJumps || ["暂无明确记录。"])}
    </section>

    <section class="report-section">
      <h3>已经讲清楚的部分</h3>
      ${renderList(report.clarifiedParts || ["暂无明确记录。"])}
    </section>

    <section class="report-section">
      <h3>仍需复习的问题</h3>
      ${renderList(report.reviewTargets || ["围绕本次主题回看关键概念、公式条件和物理意义。"])}
    </section>

    <section class="report-section wide">
      <h3>下一轮重讲任务</h3>
      ${renderList(report.nextActions || ["重新讲一遍最卡住的部分，并用一个具体例子检验理解。"])}
    </section>
  `;
  updateSaveButtons();
}

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function openLibrary() {
  if (state.screen !== "library") {
    state.libraryReturnScreen = state.screen;
  }
  loadLibrary();
  renderLibrary();
  switchScreen("library");
  saveSession();
}

function renderSidebarConversations() {
  loadLibrary();
  const records = state.library.slice(0, 24);

  elements.sidebarConversationList.innerHTML = records.length
    ? records.map(renderSidebarConversationItem).join("")
    : `<div class="sidebar-empty-state">暂无对话记录</div>`;
}

function renderSidebarConversationItem(record) {
  const active = record.id === state.libraryId || (state.screen === "library" && record.id === state.activeLibraryId);

  return `
    <button class="sidebar-conversation-item ${active ? "active" : ""}" type="button" title="左键打开，右键删除" data-conversation-id="${escapeHtml(record.id)}">
      <span class="sidebar-conversation-title">${escapeHtml(record.title)}</span>
      <span class="sidebar-conversation-time">${escapeHtml(formatSidebarTime(record.updatedAt))}</span>
    </button>
  `;
}

function loadSidebarConversation(event) {
  const item = event.target.closest("[data-conversation-id]");
  if (!item) return;

  loadLibrary();
  state.activeLibraryId = item.dataset.conversationId;
  loadSelectedLibraryRecord({ source: "sidebar" });
}

function deleteSidebarConversation(event) {
  const item = event.target.closest("[data-conversation-id]");
  if (!item) return;

  event.preventDefault();
  loadLibrary();
  const record = state.library.find((entry) => entry.id === item.dataset.conversationId);
  if (!record) return;
  removeLibraryRecord(record, { source: "sidebar" });
}

function saveCurrentToLibrary({ requireReport = false, silent = false } = {}) {
  if (!state.task) {
    showSaveNotice("先创建一个讲解会话，再保存到对话记录。");
    return;
  }

  if (requireReport && !state.report) {
    showSaveNotice("请先生成报告，再保存到对话记录。");
    return;
  }

  loadLibrary();
  const now = new Date().toISOString();
  const id = state.libraryId || `kb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const existingIndex = state.library.findIndex((item) => item.id === id);
  const existing = existingIndex >= 0 ? state.library[existingIndex] : null;
  const record = {
    id,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    title: buildLibraryTitle(state.task, state.report),
    task: copyValue(state.task),
    messages: copyValue(state.messages),
    observations: copyValue(state.observations),
    report: copyValue(state.report),
    turn: state.turn,
  };

  if (existingIndex >= 0) {
    state.library.splice(existingIndex, 1, record);
  } else {
    state.library.unshift(record);
  }

  sortLibrary();
  state.libraryId = id;
  state.activeLibraryId = id;
  saveLibrary();
  void syncLibraryRecord(record, { silent });
  updateSaveButtons();
  saveSession();

  if (state.screen === "library") {
    renderLibrary();
  }
  renderSidebarConversations();

  if (!silent) {
    showSaveNotice(existing ? "已更新对话记录。" : "已保存到对话记录。");
  }
}

function updateLibrarySearch(event) {
  state.libraryQuery = event.target.value;
  renderLibrary();
}

function updateLibraryFilter(event) {
  if (!event.target.checked) return;
  state.libraryFilter = event.target.value;
  renderLibrary();
}

function selectLibraryRecord(event) {
  const item = event.target.closest("[data-record-id]");
  if (!item) return;
  state.activeLibraryId = item.dataset.recordId;
  renderLibrary();
  saveSession();
}

function loadSelectedLibraryRecord(options = {}) {
  const record = getActiveLibraryRecord();
  if (!record) return;

  state.task = copyValue(record.task);
  state.messages = copyValue(record.messages);
  state.observations = copyValue(record.observations);
  state.report = copyValue(record.report);
  state.turn = Number(record.turn || 0);
  state.busy = false;
  state.libraryId = record.id;
  state.libraryReturnScreen = state.report ? "report" : "lecture";
  elements.replyInput.value = "";

  populateSetupFromState();
  renderSessionSummary();
  renderConversation();
  renderFocusList();
  if (state.report) renderReport();
  switchScreen(state.report ? "report" : "lecture");
  saveSession();
  renderSidebarConversations();
  const defaultMessage = state.report ? "已进入这条记录的诊断报告。" : "这条记录还没有报告，已进入讲解继续完善。";
  showSaveNotice(options.source === "sidebar" ? "已打开这段对话。" : defaultMessage);
}

function deleteSelectedLibraryRecord() {
  const record = getActiveLibraryRecord();
  if (!record) return;

  removeLibraryRecord(record);
}

function removeLibraryRecord(record, options = {}) {
  const confirmed = window.confirm(`删除「${record.title}」这条对话记录？`);
  if (!confirmed) return;

  const removedCurrent = state.libraryId === record.id;
  state.library = state.library.filter((item) => item.id !== record.id);
  if (removedCurrent) {
    state.libraryId = "";
  }
  state.activeLibraryId = state.library[0]?.id || "";
  saveLibrary();
  void deleteRemoteLibraryRecord(record.id);

  if (removedCurrent) {
    resetSession();
    showSaveNotice("已删除当前对话。");
    return;
  }

  renderLibrary();
  renderSidebarConversations();
  updateSaveButtons();
  saveSession();
  showSaveNotice(options.source === "sidebar" ? "已删除这条对话。" : "已从对话记录删除。");
}

function renderLibrary() {
  loadLibrary();
  elements.librarySearch.value = state.libraryQuery;
  setRadioValue("libraryFilter", state.libraryFilter);

  const filtered = getFilteredLibrary();
  if (state.activeLibraryId && !filtered.some((item) => item.id === state.activeLibraryId)) {
    state.activeLibraryId = filtered[0]?.id || "";
  }
  if (!state.activeLibraryId && filtered.length) {
    state.activeLibraryId = filtered[0].id;
  }

  elements.libraryList.innerHTML = filtered.length
    ? filtered.map(renderLibraryListItem).join("")
    : `<div class="library-empty-state">${
        state.library.length ? "没有匹配的记录。" : "还没有对话记录。开始讲解后，系统会自动保存问答和报告。"
      }</div>`;

  renderLibraryDetail();
  renderSidebarConversations();
  updateSaveButtons();
}

function renderLibraryListItem(record) {
  const active = record.id === state.activeLibraryId;
  const hasReport = Boolean(record.report);
  return `
    <button class="library-card ${active ? "active" : ""}" type="button" data-record-id="${escapeHtml(record.id)}">
      <span class="tag">${escapeHtml(getTaskKindLabel(record.task))}</span>
      <strong>${escapeHtml(record.title)}</strong>
      <small>${escapeHtml(formatSavedAt(record.updatedAt))} · ${Number(record.turn || 0)} 轮讲解 · ${
        hasReport ? "有报告" : "仅记录"
      }</small>
      <p>${escapeHtml(buildLibraryExcerpt(record))}</p>
    </button>
  `;
}

function renderLibraryDetail() {
  const record = getActiveLibraryRecord();
  elements.libraryLoadButton.disabled = !record;
  elements.libraryDeleteButton.disabled = !record;

  if (!record) {
    elements.libraryDetail.innerHTML = `
      <div class="library-empty-state detail-empty">
        ${state.library.length ? "选中一条记录后，可以查看问答记录和理解报告。" : "对话记录会保存每次讲解的问答记录、追问点和诊断报告。"}
      </div>
    `;
    return;
  }

  elements.libraryDetail.innerHTML = `
    <div class="library-record-header">
      <div class="tag-row">
        <span class="tag">${escapeHtml(getTaskKindLabel(record.task))}</span>
        <span class="tag neutral">${escapeHtml(record.task.courseName || "未命名学科")}</span>
      </div>
      <h3>${escapeHtml(record.title)}</h3>
      <p>${escapeHtml(formatSavedAt(record.updatedAt))} 保存 · ${Number(record.turn || 0)} 轮讲解</p>
    </div>

    <section class="library-section">
      <div class="library-section-heading">
        <h3>问答记录</h3>
        <span>${countUserTurns(record.messages)} 轮</span>
      </div>
      <div class="stored-dialogue">
        ${renderStoredDialogue(record.messages)}
      </div>
    </section>

    ${renderStoredReport(record)}
    ${renderStoredObservations(record.observations)}
  `;
}

function renderStoredDialogue(messages) {
  if (!Array.isArray(messages) || !messages.length) {
    return `<p class="muted">暂无问答记录。</p>`;
  }

  return messages
    .map((message) => {
      const roleLabel =
        message.role === "user"
          ? `你的第 ${message.turn || ""} 轮讲解`
          : message.turn === 0
            ? "AI 学生的开场"
            : "AI 学生";
      return `
        <article class="stored-message ${message.role === "user" ? "user" : "ai"}">
          <strong>${escapeHtml(roleLabel)}</strong>
          <p>${escapeHtml(message.text || "")}</p>
        </article>
      `;
    })
    .join("");
}

function renderStoredReport(record) {
  const report = record.report;
  const title = record.task?.taskType === "题目讲解" ? "题目报告" : "知识点报告";
  if (!report) {
    return `
      <section class="library-section">
        <div class="library-section-heading">
          <h3>${title}</h3>
        </div>
        <p class="muted">这条记录还没有生成报告。载入继续后，可以结束讲解并生成报告。</p>
      </section>
    `;
  }

  return `
    <section class="library-section">
      <div class="library-section-heading">
        <h3>${title}</h3>
        <span>已生成</span>
      </div>
      <div class="report-panel library-report-panel">
        <section class="report-section wide">
          <h3>本次讲解主题</h3>
          <p>${escapeHtml(report.topic || buildLibraryTitle(record.task, report))}</p>
        </section>
        <section class="report-section">
          <h3>主要理解漏洞</h3>
          ${renderList(report.mainGaps || ["暂无明确记录。"])}
        </section>
        <section class="report-section">
          <h3>关键逻辑跳跃</h3>
          ${renderList(report.logicJumps || ["暂无明确记录。"])}
        </section>
        <section class="report-section">
          <h3>已经讲清楚的部分</h3>
          ${renderList(report.clarifiedParts || ["暂无明确记录。"])}
        </section>
        <section class="report-section">
          <h3>仍需复习的问题</h3>
          ${renderList(report.reviewTargets || ["围绕本次主题回看关键概念、公式条件和物理意义。"])}
        </section>
        <section class="report-section wide">
          <h3>下一轮重讲任务</h3>
          ${renderList(report.nextActions || ["重新讲一遍最卡住的部分，并用一个具体例子检验理解。"])}
        </section>
      </div>
    </section>
  `;
}

function renderStoredObservations(observations) {
  if (!Array.isArray(observations) || !observations.length) return "";

  return `
    <section class="library-section">
      <div class="library-section-heading">
        <h3>观察点</h3>
        <span>${observations.length} 条</span>
      </div>
      <div class="stored-observations">
        ${observations
          .map((item) => {
            const resolved = item.status === "resolved";
            return `
              <article class="focus-card ${resolved ? "resolved" : ""}">
                <div class="tag-row">
                  <span class="tag ${resolved ? "resolved" : ""}">${escapeHtml(item.type || "理解漏洞")}</span>
                </div>
                <strong>${resolved ? "已变清楚" : "仍需关注"}</strong>
                <p>${escapeHtml(item.description || item.question || "")}</p>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function getFilteredLibrary() {
  const query = state.libraryQuery.trim().toLowerCase();
  return state.library.filter((record) => {
    const matchesType =
      state.libraryFilter === "all" ||
      (state.libraryFilter === "concept" && record.task?.taskType !== "题目讲解") ||
      (state.libraryFilter === "problem" && record.task?.taskType === "题目讲解");
    if (!matchesType) return false;
    if (!query) return true;
    return buildSearchText(record).toLowerCase().includes(query);
  });
}

function getActiveLibraryRecord() {
  return state.library.find((record) => record.id === state.activeLibraryId) || null;
}

function loadLibrary() {
  const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
  if (!raw) {
    state.library = [];
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.library = Array.isArray(parsed) ? parsed.map(normalizeLibraryRecord).filter(Boolean) : [];
    sortLibrary();
  } catch {
    state.library = [];
  }
}

function saveLibrary() {
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(state.library));
}

function normalizeLibraryRecord(record) {
  if (!record || !record.id || !record.task) return null;
  return {
    id: String(record.id),
    createdAt: record.createdAt || record.updatedAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
    title: record.title || buildLibraryTitle(record.task, record.report),
    task: record.task,
    messages: Array.isArray(record.messages) ? record.messages : [],
    observations: Array.isArray(record.observations) ? record.observations : [],
    report: record.report || null,
    turn: Number(record.turn || countUserTurns(record.messages)),
  };
}

function sortLibrary() {
  state.library.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function buildLibraryTitle(task, report) {
  return sanitize(report?.topic) || `${task?.courseName || "未命名学科"} · ${task?.taskContent || "当前主题"}`;
}

function buildLibraryExcerpt(record) {
  const lastUserMessage = [...(record.messages || [])].reverse().find((message) => message.role === "user");
  const text = lastUserMessage?.text || record.report?.nextActions?.[0] || record.task?.taskContent || "";
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

function buildSearchText(record) {
  const report = record.report || {};
  return [
    record.title,
    record.task?.courseName,
    record.task?.taskType,
    record.task?.taskContent,
    ...(record.messages || []).map((message) => message.text),
    ...(record.observations || []).flatMap((item) => [item.type, item.description, item.question]),
    report.topic,
    ...(report.mainGaps || []),
    ...(report.logicJumps || []),
    ...(report.clarifiedParts || []),
    ...(report.reviewTargets || []),
    ...(report.nextActions || []),
  ]
    .filter(Boolean)
    .join("\n");
}

function getTaskKindLabel(task) {
  return task?.taskType === "题目讲解" ? "题目" : "知识点";
}

function countUserTurns(messages) {
  return Array.isArray(messages) ? messages.filter((message) => message.role === "user").length : 0;
}

function formatSavedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSidebarTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (diffDays < 7) return `${diffDays} 天`;
  if (diffDays < 35) return `${Math.floor(diffDays / 7)} 周`;
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function updateSaveButtons() {
  elements.saveReportButton.disabled = state.busy || !state.report;
  elements.saveReportButton.textContent = "存入对话记录";
  elements.libraryLoadButton.disabled = !state.activeLibraryId;
  elements.libraryDeleteButton.disabled = !state.activeLibraryId;
}

function showSaveNotice(message) {
  window.clearTimeout(saveNoticeTimer);
  elements.saveNotice.textContent = message;
  elements.saveNotice.hidden = false;
  saveNoticeTimer = window.setTimeout(() => {
    elements.saveNotice.hidden = true;
  }, 2400);
}

function copyValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function updateSetupPreview() {
  const form = new FormData(elements.taskForm);
  const taskType = form.get("taskType") === "题目讲解" ? "题目讲解" : "知识点讲解";
  const course = sanitize(form.get("courseName")) || "待输入";
  const topic = sanitize(form.get("taskContent")) || "待输入";
  const isProblem = taskType === "题目讲解";

  elements.taskContentLabel.textContent = isProblem ? "题目" : "知识点";
  elements.taskContent.placeholder = isProblem
    ? "粘贴或输入题目，包括已知条件和要求"
    : "如：拉格朗日中值定理";
  elements.conceptModeCard.classList.toggle("active", !isProblem);
  elements.problemModeCard.classList.toggle("active", isProblem);

  document.querySelector(".preview-lines").innerHTML = `
    <span>学科：${escapeHtml(course)}</span>
    <span>${isProblem ? "题目" : "知识点"}：${escapeHtml(topic)}</span>
    <span>模式：${escapeHtml(taskType)}</span>
  `;
}

function updateTurnCount() {
  if (elements.turnCount) {
    elements.turnCount.textContent = `${state.turn} 轮讲解`;
  }
}

function taskLabel(task) {
  const text = task?.taskContent || "当前主题";
  return text.length > 30 ? `${text.slice(0, 30)}...` : text;
}

function populateSetupFromState() {
  if (!state.task) return;

  elements.courseName.value = state.task.courseName === "未命名学科" ? "" : state.task.courseName;
  elements.taskContent.value = state.task.taskContent;
  setRadioValue("taskType", state.task.taskType);
  updateSetupPreview();
}

function setRadioValue(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function setBusy(isBusy, message = "AI 学生正在思考...") {
  state.busy = isBusy;
  elements.loadingState.hidden = !isBusy;
  elements.loadingState.textContent = message;
  elements.submitReplyButton.disabled = isBusy;
  elements.reportButton.disabled = isBusy;
  elements.formulaToolButton.disabled = isBusy;
  elements.imageToolButton.disabled = isBusy;
  updateSaveButtons();
}

function showError(message) {
  elements.errorState.hidden = false;
  elements.errorState.textContent = message || "请求失败，请稍后重试。";
}

function clearError() {
  elements.errorState.hidden = true;
  elements.errorState.textContent = "";
}

async function postJson(path, payload, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || "大模型服务请求失败。");
  }
  return body;
}

function flashMissingInput(items) {
  items.forEach((item) => {
    if (!item.value.trim()) {
      item.style.borderColor = "var(--coral)";
      setTimeout(() => {
        item.style.borderColor = "";
      }, 1000);
    }
  });
}

function resetSession() {
  state.screen = "setup";
  state.task = null;
  state.messages = [];
  state.observations = [];
  state.report = null;
  state.turn = 0;
  state.busy = false;
  state.libraryId = "";
  state.libraryReturnScreen = "setup";
  elements.courseName.value = "";
  elements.taskContent.value = "";
  setRadioValue("taskType", "知识点讲解");
  elements.replyInput.value = "";
  elements.conversation.innerHTML = "";
  elements.lectureTopicBanner.innerHTML = "";
  elements.focusList.innerHTML = `<p class="muted">暂无观察。</p>`;
  elements.reportPanel.innerHTML = "";
  closeFormulaModal();
  closeImageModal();
  resetImageRecognition();
  clearError();
  updateSetupPreview();
  updateTurnCount();
  switchScreen("setup");
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function saveSession() {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      screen: state.screen,
      task: state.task,
      messages: state.messages,
      observations: state.observations,
      report: state.report,
      turn: state.turn,
      libraryId: state.libraryId,
      activeLibraryId: state.activeLibraryId,
      libraryFilter: state.libraryFilter,
      libraryQuery: state.libraryQuery,
      libraryReturnScreen: state.libraryReturnScreen,
    }),
  );
}

function restoreSession() {
  loadLibrary();
  restoreResearchIdentity();
  updatePrivacyBanner();
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    updateSetupPreview();
    updateSaveButtons();
    switchScreen("setup");
    ensureConsentGate();
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.screen = saved.screen === "intro" ? "setup" : saved.screen || "setup";
    state.task = saved.task;
    state.messages = saved.messages || [];
    state.observations = saved.observations || [];
    state.report = saved.report || null;
    state.turn = saved.turn || 0;
    state.libraryId = saved.libraryId || "";
    state.activeLibraryId = saved.activeLibraryId || state.libraryId || "";
    state.libraryFilter = saved.libraryFilter || "all";
    state.libraryQuery = saved.libraryQuery || "";
    state.libraryReturnScreen = saved.libraryReturnScreen || "setup";

    if (state.screen === "library") {
      if (state.task) {
        populateSetupFromState();
        renderSessionSummary();
        renderConversation();
        renderFocusList();
        if (state.report) renderReport();
      } else {
        updateSetupPreview();
      }
      renderLibrary();
      switchScreen("library");
    } else if (state.task) {
      populateSetupFromState();
      renderSessionSummary();
      renderConversation();
      renderFocusList();
      if (state.screen === "report") renderReport();
      switchScreen(state.screen);
    } else {
      updateSetupPreview();
      switchScreen("setup");
    }
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    updateSetupPreview();
    switchScreen("setup");
  }

  ensureConsentGate();
}

function ensureConsentGate() {
  if (!hasParticipant()) {
    openConsentModal();
  }
}

function sanitize(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

restoreSession();
