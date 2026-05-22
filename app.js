const API_BASE = window.location.protocol === "file:" ? "http://localhost:5173" : "";
const SESSION_STORAGE_KEY = "mechanics-feynman-session";
const LIBRARY_STORAGE_KEY = "mechanics-feynman-library";
const PARTICIPANT_STORAGE_KEY = "mechanics-feynman-participant";
const PRIVACY_CONSENT_VERSION = "2026-05-22";

const state = {
  screen: "intro",
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
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
let selectedImageDataUrl = "";

const elements = {
  introScreen: document.querySelector("#introScreen"),
  setupScreen: document.querySelector("#setupScreen"),
  lectureScreen: document.querySelector("#lectureScreen"),
  reportScreen: document.querySelector("#reportScreen"),
  libraryScreen: document.querySelector("#libraryScreen"),
  lectureButton: document.querySelector("#lectureButton"),
  libraryButton: document.querySelector("#libraryButton"),
  startExperienceButton: document.querySelector("#startExperienceButton"),
  saveNotice: document.querySelector("#saveNotice"),
  stageLabel: document.querySelector("#stageLabel"),
  turnCount: document.querySelector("#turnCount"),
  taskForm: document.querySelector("#taskForm"),
  courseName: document.querySelector("#courseName"),
  taskContent: document.querySelector("#taskContent"),
  taskContentLabel: document.querySelector("#taskContentLabel"),
  conceptModeCard: document.querySelector("#conceptModeCard"),
  problemModeCard: document.querySelector("#problemModeCard"),
  sessionSummary: document.querySelector("#sessionSummary"),
  conversation: document.querySelector("#conversation"),
  replyForm: document.querySelector("#replyForm"),
  replyInput: document.querySelector("#replyInput"),
  formulaToolButton: document.querySelector("#formulaToolButton"),
  imageToolButton: document.querySelector("#imageToolButton"),
  submitReplyButton: document.querySelector("#submitReplyButton"),
  reportButton: document.querySelector("#reportButton"),
  saveDraftButton: document.querySelector("#saveDraftButton"),
  resetButton: document.querySelector("#resetButton"),
  editSetupButton: document.querySelector("#editSetupButton"),
  saveReportButton: document.querySelector("#saveReportButton"),
  continueButton: document.querySelector("#continueButton"),
  sampleConceptButton: document.querySelector("#sampleConceptButton"),
  sampleProblemButton: document.querySelector("#sampleProblemButton"),
  focusList: document.querySelector("#focusList"),
  reportPanel: document.querySelector("#reportPanel"),
  loadingState: document.querySelector("#loadingState"),
  errorState: document.querySelector("#errorState"),
  formulaModal: document.querySelector("#formulaModal"),
  formulaField: document.querySelector("#formulaField"),
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
  librarySearch: document.querySelector("#librarySearch"),
  libraryList: document.querySelector("#libraryList"),
  libraryDetail: document.querySelector("#libraryDetail"),
  libraryLoadButton: document.querySelector("#libraryLoadButton"),
  libraryDeleteButton: document.querySelector("#libraryDeleteButton"),
};

let saveNoticeTimer = 0;

elements.taskForm.addEventListener("submit", startSession);
elements.replyForm.addEventListener("submit", submitReply);
elements.reportButton.addEventListener("click", finishSession);
elements.startExperienceButton.addEventListener("click", startExperience);
elements.lectureButton.addEventListener("click", resetSession);
elements.libraryButton.addEventListener("click", openLibrary);
elements.saveDraftButton.addEventListener("click", () => saveCurrentToLibrary({ requireReport: false }));
elements.resetButton.addEventListener("click", resetSession);
elements.editSetupButton.addEventListener("click", editSetup);
elements.saveReportButton.addEventListener("click", () => saveCurrentToLibrary({ requireReport: true }));
elements.continueButton.addEventListener("click", continueLecture);
elements.sampleConceptButton.addEventListener("click", fillConceptSample);
elements.sampleProblemButton.addEventListener("click", fillProblemSample);
elements.taskForm.addEventListener("input", updateSetupPreview);
elements.taskForm.addEventListener("change", updateSetupPreview);
elements.formulaToolButton.addEventListener("click", openFormulaModal);
elements.imageToolButton.addEventListener("click", openImageModal);
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
elements.formulaModal.addEventListener("click", closeModalOnBackdrop);
elements.imageModal.addEventListener("click", closeModalOnBackdrop);
elements.consentModal.addEventListener("click", closeModalOnBackdrop);
elements.librarySearch.addEventListener("input", updateLibrarySearch);
elements.libraryList.addEventListener("click", selectLibraryRecord);
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
    if (state.libraryId) {
      saveCurrentToLibrary({ requireReport: true, silent: true });
    }
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

function startExperience() {
  resetSession();
  elements.courseName.focus();
}

function appendUserMessage(text) {
  state.turn += 1;
  state.messages.push({ role: "user", text, turn: state.turn });
  renderConversation();
  updateTurnCount();
  saveSession();
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

function openFormulaModal() {
  clearError();
  elements.formulaModal.hidden = false;
  setupMathKeyboard();
  window.setTimeout(() => elements.formulaField.focus(), 0);
}

function closeFormulaModal() {
  elements.formulaModal.hidden = true;
  hideMathKeyboard();
  elements.replyInput.focus();
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

  insertIntoReply(`\\(${latex}\\)`);
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

function openImageModal() {
  clearError();
  resetImageRecognition();
  elements.imageModal.hidden = false;
}

function closeImageModal() {
  elements.imageModal.hidden = true;
  clearImageMessages();
  elements.replyInput.focus();
}

function handleImageSelection(event) {
  const file = event.target.files?.[0];
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
      task: state.task,
      imageDataUrl: selectedImageDataUrl,
      hint: sanitize(elements.imageHintInput.value),
    });
    elements.recognizedTextInput.value = formatRecognitionResult(result);
    showImageStatus("识别完成。请先检查并修改，再插入讲解。");
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

  const prefix = elements.replyInput.value.trim() ? "\n\n[图片识别结果]\n" : "[图片识别结果]\n";
  insertIntoReply(`${prefix}${text}`);
  closeImageModal();
}

function insertIntoReply(text) {
  const input = elements.replyInput;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  input.value = `${before}${text}${after}`;
  const cursor = start + text.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
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
  if (event.target === elements.consentModal) closeConsentModal();
}

function openConsentModal() {
  clearError();
  elements.consentCheckbox.checked = false;
  elements.confirmConsentButton.disabled = false;
  elements.consentModal.hidden = false;
}

function closeConsentModal() {
  elements.consentModal.hidden = true;
  elements.consentCheckbox.checked = false;
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
    showSaveNotice(`匿名同步已开启。你的测试码是 ${participant.participantCode}。`);
    await syncAllLibraryRecords();
  } catch (error) {
    showSaveNotice(error.message || "匿名同步开启失败，请稍后再试。");
  } finally {
    state.syncBusy = false;
    updatePrivacyBanner();
  }
}

function disableResearchSync() {
  state.participant = null;
  localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
  updatePrivacyBanner();
  showSaveNotice("已切换为仅本机保存。后台不会看到后续知识库记录。");
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
  const isSynced = Boolean(participant?.participantId && participant?.participantSecret);
  elements.joinResearchButton.hidden = isSynced;
  elements.stopSyncButton.hidden = !isSynced;
  elements.joinResearchButton.disabled = state.syncBusy;
  elements.stopSyncButton.disabled = state.syncBusy;

  if (state.syncBusy) {
    elements.researchStatus.textContent = "正在同步到调研后台...";
  } else if (isSynced) {
    elements.researchStatus.textContent = `已开启同步，匿名测试码：${participant.participantCode || participant.participantId}`;
  } else {
    elements.researchStatus.textContent = "仅保存在本机，后台暂不可见。";
  }
}

async function syncLibraryRecord(record) {
  if (!state.participant?.participantId || !state.participant?.participantSecret) return;

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
    showSaveNotice("已保存到个人知识库，并同步到调研后台。");
  } catch (error) {
    showSaveNotice(`已保存在本机，但同步后台失败：${error.message || "网络异常"}`);
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
  if (!state.participant?.participantId || !state.participant?.participantSecret) return;

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
  state.screen = screen;
  document.body.classList.toggle("intro-active", screen === "intro");
  elements.introScreen.classList.toggle("active", screen === "intro");
  elements.setupScreen.classList.toggle("active", screen === "setup");
  elements.lectureScreen.classList.toggle("active", screen === "lecture");
  elements.reportScreen.classList.toggle("active", screen === "report");
  elements.libraryScreen.classList.toggle("active", screen === "library");
  if (elements.stageLabel) {
    elements.stageLabel.textContent =
      screen === "setup"
        ? "创建学习会话"
        : screen === "intro"
          ? "产品介绍"
          : screen === "lecture"
          ? "正式讲解"
          : screen === "report"
            ? "诊断报告"
            : "个人知识库";
  }
  updateTurnCount();
  updateSaveButtons();
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
    <div class="summary-item">
      <strong>${state.task.taskType === "题目讲解" ? "题目" : "知识点"}</strong>
      ${escapeHtml(state.task.taskContent)}
    </div>
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

function saveCurrentToLibrary({ requireReport = false, silent = false } = {}) {
  if (!state.task) {
    showSaveNotice("先创建一个讲解会话，再保存到知识库。");
    return;
  }

  if (requireReport && !state.report) {
    showSaveNotice("请先生成报告，再保存到知识库。");
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
  void syncLibraryRecord(record);
  updateSaveButtons();
  saveSession();

  if (state.screen === "library") {
    renderLibrary();
  }

  if (!silent) {
    showSaveNotice(existing ? "已更新到个人知识库。" : "已保存到个人知识库。");
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

function loadSelectedLibraryRecord() {
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
  showSaveNotice(state.report ? "已进入这条记录的诊断报告。" : "这条记录还没有报告，已进入讲解继续完善。");
}

function deleteSelectedLibraryRecord() {
  const record = getActiveLibraryRecord();
  if (!record) return;

  const confirmed = window.confirm(`删除「${record.title}」这条知识库记录？`);
  if (!confirmed) return;

  state.library = state.library.filter((item) => item.id !== record.id);
  if (state.libraryId === record.id) {
    state.libraryId = "";
  }
  state.activeLibraryId = state.library[0]?.id || "";
  saveLibrary();
  void deleteRemoteLibraryRecord(record.id);
  renderLibrary();
  updateSaveButtons();
  saveSession();
  showSaveNotice("已从个人知识库删除。");
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
        state.library.length ? "没有匹配的记录。" : "还没有学习档案。生成报告后，可以把问答记录和理解报告存到这里。"
      }</div>`;

  renderLibraryDetail();
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
        ${state.library.length ? "选中一条记录后，可以查看问答记录和理解报告。" : "知识库会保存每次讲解的问答记录、追问点和诊断报告。"}
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

function updateSaveButtons() {
  elements.saveDraftButton.disabled = state.busy || !state.task;
  elements.saveDraftButton.textContent = state.libraryId ? "更新记录" : "保存记录";
  elements.saveReportButton.disabled = state.busy || !state.report;
  elements.saveReportButton.textContent = "存入知识库";
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

function fillConceptSample() {
  elements.courseName.value = "高等数学";
  elements.taskContent.value = "拉格朗日中值定理";
  setRadioValue("taskType", "知识点讲解");
  updateSetupPreview();
}

function fillProblemSample() {
  elements.courseName.value = "大学物理";
  elements.taskContent.value =
    "一个电容器充电过程中，电压随时间变化为 U(t)=U0(1-e^{-t/RC})。请解释这个表达式从哪里来，并说明每个量的含义。";
  setRadioValue("taskType", "题目讲解");
  updateSetupPreview();
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
    switchScreen("intro");
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.screen = saved.screen || "intro";
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
    } else if (state.screen === "intro") {
      updateSetupPreview();
      switchScreen("intro");
    } else {
      updateSetupPreview();
      switchScreen("setup");
    }
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    updateSetupPreview();
    switchScreen("intro");
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
