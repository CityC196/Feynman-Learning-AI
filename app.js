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
  feedbackReturnScreen: "setup",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_FEEDBACK_IMAGES = 6;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
let selectedImageDataUrl = "";
let selectedMaterialFile = null;
let selectedMaterialDataUrl = "";

const elements = {
  setupScreen: document.querySelector("#setupScreen"),
  lectureScreen: document.querySelector("#lectureScreen"),
  reportScreen: document.querySelector("#reportScreen"),
  libraryScreen: document.querySelector("#libraryScreen"),
  feedbackScreen: document.querySelector("#feedbackScreen"),
  appSidebar: document.querySelector("#appSidebar"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  mobileCloseSidebarButton: document.querySelector("#mobileCloseSidebarButton"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
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
  taskVoiceToolButton: document.querySelector("#taskVoiceToolButton"),
  taskFormulaToolButton: document.querySelector("#taskFormulaToolButton"),
  taskImageToolButton: document.querySelector("#taskImageToolButton"),
  taskVoiceStatus: document.querySelector("#taskVoiceStatus"),
  conceptModeCard: document.querySelector("#conceptModeCard"),
  problemModeCard: document.querySelector("#problemModeCard"),
  sessionSummary: document.querySelector("#sessionSummary"),
  lectureTopicBanner: document.querySelector("#lectureTopicBanner"),
  conversation: document.querySelector("#conversation"),
  replyForm: document.querySelector("#replyForm"),
  replyInput: document.querySelector("#replyInput"),
  voiceToolButton: document.querySelector("#voiceToolButton"),
  formulaToolButton: document.querySelector("#formulaToolButton"),
  imageToolButton: document.querySelector("#imageToolButton"),
  voiceStatus: document.querySelector("#voiceStatus"),
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
  pdfFileSummary: document.querySelector("#pdfFileSummary"),
  privacyBanner: document.querySelector("#privacyBanner"),
  researchStatus: document.querySelector("#researchStatus"),
  joinResearchButton: document.querySelector("#joinResearchButton"),
  stopSyncButton: document.querySelector("#stopSyncButton"),
  consentModal: document.querySelector("#consentModal"),
  consentCheckbox: document.querySelector("#consentCheckbox"),
  confirmConsentButton: document.querySelector("#confirmConsentButton"),
  cancelConsentButton: document.querySelector("#cancelConsentButton"),
  feedbackForm: document.querySelector("#feedbackForm"),
  feedbackContactInput: document.querySelector("#feedbackContactInput"),
  feedbackSubscriptionInput: document.querySelector("#feedbackSubscriptionInput"),
  feedbackMessageInput: document.querySelector("#feedbackMessageInput"),
  feedbackImageInput: document.querySelector("#feedbackImageInput"),
  feedbackImagePreviewList: document.querySelector("#feedbackImagePreviewList"),
  feedbackImageEmptyState: document.querySelector("#feedbackImageEmptyState"),
  feedbackStatus: document.querySelector("#feedbackStatus"),
  feedbackError: document.querySelector("#feedbackError"),
  submitFeedbackButton: document.querySelector("#submitFeedbackButton"),
  removeFeedbackImageButton: document.querySelector("#removeFeedbackImageButton"),
  feedbackBackButton: document.querySelector("#feedbackBackButton"),
  librarySearch: document.querySelector("#librarySearch"),
  libraryList: document.querySelector("#libraryList"),
  libraryDetail: document.querySelector("#libraryDetail"),
  libraryLoadButton: document.querySelector("#libraryLoadButton"),
  libraryDeleteButton: document.querySelector("#libraryDeleteButton"),
};

let saveNoticeTimer = 0;
let activeInsertTarget = null;
let feedbackImageDataUrls = [];
const VOICE_CHUNK_MS = 1000;
const VOICE_MIN_CHUNK_MS = 300;
const VOICE_OVERLAP_MS = 300;
const VOICE_TARGET_SAMPLE_RATE = 16000;
const VOICE_LOCAL_FALLBACK_MS = 4500;
const voiceState = {
  mode: "idle",
  isListening: false,
  targetInput: null,
  recognition: null,
  localResults: [],
  localHadText: false,
  localFallbackTimer: 0,
  stream: null,
  audioContext: null,
  source: null,
  processor: null,
  buffers: [],
  overlapSamples: new Float32Array(0),
  sampleRate: 0,
  flushTimer: 0,
  chunkIndex: 0,
  pendingRequests: 0,
  transcriptChunks: new Map(),
  draftStart: 0,
  draftEnd: 0,
  draftText: "",
};

elements.taskForm.addEventListener("submit", startSession);
elements.replyForm.addEventListener("submit", submitReply);
elements.reportButton.addEventListener("click", finishSession);
elements.lectureButton.addEventListener("click", resetSession);
elements.mobileMenuButton.addEventListener("click", openMobileSidebar);
elements.mobileCloseSidebarButton.addEventListener("click", closeMobileSidebar);
elements.sidebarBackdrop.addEventListener("click", closeMobileSidebar);
elements.libraryButton.addEventListener("click", openLibrary);
elements.feedbackButton.addEventListener("click", openFeedbackScreen);
elements.saveReportButton.addEventListener("click", () => saveCurrentToLibrary({ requireReport: true }));
elements.continueButton.addEventListener("click", continueLecture);
elements.taskForm.addEventListener("input", updateSetupPreview);
elements.taskForm.addEventListener("change", updateSetupPreview);
elements.taskVoiceToolButton.addEventListener("click", () => toggleVoiceInput(elements.taskContent));
elements.taskFormulaToolButton.addEventListener("click", () => openFormulaModal(elements.taskContent));
elements.taskImageToolButton.addEventListener("click", () => openImageModal(elements.taskContent));
elements.voiceToolButton.addEventListener("click", () => toggleVoiceInput(elements.replyInput));
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
elements.feedbackForm.addEventListener("submit", submitFeedback);
elements.removeFeedbackImageButton.addEventListener("click", clearFeedbackImage);
elements.feedbackBackButton.addEventListener("click", closeFeedbackScreen);
elements.formulaModal.addEventListener("click", closeModalOnBackdrop);
elements.imageModal.addEventListener("click", closeModalOnBackdrop);
elements.consentModal.addEventListener("click", closeModalOnBackdrop);
document.addEventListener("paste", handleImagePaste);
document.addEventListener("keydown", handleGlobalKeydown);
elements.librarySearch.addEventListener("input", updateLibrarySearch);
elements.libraryList.addEventListener("click", selectLibraryRecord);
elements.sidebarConversationList.addEventListener("click", loadSidebarConversation);
elements.sidebarConversationList.addEventListener("contextmenu", deleteSidebarConversation);
elements.libraryLoadButton.addEventListener("click", loadSelectedLibraryRecord);
elements.libraryDeleteButton.addEventListener("click", deleteSelectedLibraryRecord);
document
  .querySelectorAll('input[name="libraryFilter"]')
  .forEach((input) => input.addEventListener("change", updateLibraryFilter));

initializeVoiceInput();

async function startSession(event) {
  event.preventDefault();
  if (voiceState.isListening) await stopVoiceInput({ focusTarget: false });
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

  startSessionFromTask(task);
}

function startSessionFromTask(task, introText = "") {
  state.task = task;
  state.messages = [{ role: "assistant", text: introText || buildIntroMessage(task), turn: 0 }];
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

function startSessionFromMaterial(material) {
  const task = buildTaskFromMaterial(material);
  setRadioValue("taskType", "知识点讲解");
  elements.courseName.value = task.courseName === "未命名学科" ? "" : task.courseName;
  elements.taskContent.value = task.taskContent;
  updateSetupPreview();
  startSessionFromTask(task, material.starterQuestion || buildIntroMessage(task));
  showSaveNotice("已根据学习材料创建 AI 学生。");
}

async function addMaterialToCurrentDialogue(material) {
  if (state.busy) return;

  mergeTaskMaterialContext(material);
  const explanation = formatMaterialDialogueMessage(material);
  const visibleMessage = formatMaterialVisibleMessage(material);
  clearError();
  appendUserMessage(visibleMessage);
  setBusy(true, "AI 学生正在阅读材料...");

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
      text: result.assistantText || material.starterQuestion,
      turn: state.turn,
    });
    renderConversation();
    renderFocusList();
    saveSession();
    saveCurrentToLibrary({ silent: true });
    showSaveNotice("AI 学生已读入补充材料。");
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

async function submitReply(event) {
  event.preventDefault();
  if (state.busy) return;
  if (voiceState.isListening) await stopVoiceInput({ focusTarget: false });

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
  if (voiceState.isListening) await stopVoiceInput({ focusTarget: false });
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

function initializeVoiceInput() {
  updateVoiceButtons();
  const hint = canUseNativeSpeechInput() || canCaptureMicrophone()
    ? "语音输入"
    : "当前浏览器无法访问麦克风，建议使用 Chrome / Edge 或手机系统键盘听写";
  elements.taskVoiceToolButton.title = hint;
  elements.voiceToolButton.title = hint;
}

function canUseNativeSpeechInput() {
  return Boolean(getSpeechRecognitionConstructor());
}

function canCaptureMicrophone() {
  return Boolean(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));
}

function getSpeechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

async function toggleVoiceInput(targetInput) {
  if (state.busy) return;

  if (voiceState.isListening && voiceState.targetInput === targetInput) {
    await stopVoiceInput();
    return;
  }

  await startVoiceInput(targetInput);
}

async function startVoiceInput(targetInput) {
  if (!canUseNativeSpeechInput() && !canCaptureMicrophone()) {
    showVoiceStatus(targetInput, "当前浏览器无法访问麦克风。可以直接点输入框，用手机键盘或系统听写输入。", true);
    targetInput.focus();
    return;
  }

  if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    showVoiceStatus(targetInput, "语音输入需要 HTTPS 或 localhost 环境。", true);
    targetInput.focus();
    return;
  }

  if (voiceState.isListening) {
    await stopVoiceInput({ focusTarget: false, keepStatus: true });
  }

  hideVoiceStatus(elements.taskContent);
  hideVoiceStatus(elements.replyInput);
  resetVoiceSession(targetInput);
  activeInsertTarget = targetInput;

  await startServerVoiceCapture(targetInput);
}

function startNativeSpeechInput(targetInput, SpeechRecognition) {
  try {
    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechLanguage();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      voiceState.mode = "native";
      voiceState.isListening = true;
      updateVoiceButtons();
      showVoiceStatus(targetInput, "正在尝试浏览器自带语音输入，文字会同步显示。 ");
      voiceState.localFallbackTimer = window.setTimeout(() => {
        if (voiceState.mode === "native" && voiceState.isListening && !voiceState.localHadText) {
          switchToServerVoiceCapture(targetInput).catch((error) => showVoiceStatus(targetInput, error.message, true));
        }
      }, VOICE_LOCAL_FALLBACK_MS);
    };

    recognition.onresult = (event) => handleNativeSpeechResult(event, targetInput);

    recognition.onerror = (event) => {
      if (["not-allowed", "service-not-allowed"].includes(event.error)) {
        stopNativeRecognition();
        voiceState.mode = "idle";
        voiceState.isListening = false;
        updateVoiceButtons();
        showVoiceStatus(targetInput, getNativeSpeechErrorMessage(event.error), true);
        return;
      }

      if (!voiceState.localHadText) {
        switchToServerVoiceCapture(targetInput).catch((error) => showVoiceStatus(targetInput, error.message, true));
      } else {
        showVoiceStatus(targetInput, getNativeSpeechErrorMessage(event.error), true);
      }
    };

    recognition.onend = () => {
      if (voiceState.mode !== "native") return;
      window.clearTimeout(voiceState.localFallbackTimer);
      voiceState.localFallbackTimer = 0;
      voiceState.recognition = null;
      voiceState.isListening = false;
      voiceState.mode = "idle";
      updateVoiceButtons();
      showVoiceStatus(targetInput, "语音输入已停止。可以继续编辑后提交。 ");
    };

    voiceState.recognition = recognition;
    recognition.start();
    return true;
  } catch {
    stopNativeRecognition();
    return false;
  }
}

async function switchToServerVoiceCapture(targetInput) {
  if (voiceState.mode !== "native") return;
  stopNativeRecognition();
  voiceState.mode = "server-starting";
  voiceState.isListening = false;
  updateVoiceButtons();
  showVoiceStatus(targetInput, "浏览器自带语音没有返回文字，已切换到后端转写兜底。 ");
  await startServerVoiceCapture(targetInput);
}

async function startServerVoiceCapture(targetInput) {
  if (!canCaptureMicrophone()) {
    voiceState.mode = "idle";
    voiceState.isListening = false;
    updateVoiceButtons();
    showVoiceStatus(targetInput, "当前浏览器无法访问麦克风。可以直接点输入框，用手机键盘或系统听写输入。", true);
    targetInput.focus();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      if (voiceState.mode !== "server" || !voiceState.isListening) return;
      const input = event.inputBuffer.getChannelData(0);
      voiceState.buffers.push(new Float32Array(input));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    voiceState.stream = stream;
    voiceState.audioContext = audioContext;
    voiceState.source = source;
    voiceState.processor = processor;
    voiceState.sampleRate = audioContext.sampleRate;
    voiceState.mode = "server";
    voiceState.isListening = true;
    voiceState.flushTimer = window.setInterval(() => {
      flushVoiceChunk().catch((error) => showVoiceStatus(targetInput, error.message, true));
    }, VOICE_CHUNK_MS);

    updateVoiceButtons();
    showVoiceStatus(targetInput, "正在语音输入。 ");
    targetInput.focus();
  } catch (error) {
    cleanupVoiceCapture();
    clearVoiceDraft();
    updateVoiceButtons();
    showVoiceStatus(targetInput, getMicrophoneErrorMessage(error), true);
    targetInput.focus();
  }
}

async function stopVoiceInput(options = {}) {
  const targetInput = voiceState.targetInput;
  if (!voiceState.isListening && !voiceState.pendingRequests) return;

  if (voiceState.mode === "native") {
    voiceState.isListening = false;
    stopNativeRecognition();
    voiceState.mode = "idle";
    updateVoiceButtons();
    if (targetInput && !options.keepStatus) {
      showVoiceStatus(targetInput, "语音输入已停止。可以继续编辑后提交。 ");
    }
    if (options.focusTarget !== false && targetInput) targetInput.focus();
    return;
  }

  voiceState.isListening = false;
  voiceState.mode = "server-stopping";
  window.clearInterval(voiceState.flushTimer);
  voiceState.flushTimer = 0;
  cleanupVoiceCapture();
  updateVoiceButtons();

  await flushVoiceChunk({ force: true });
  voiceState.mode = "idle";
  if (targetInput && !options.keepStatus && voiceState.pendingRequests === 0) {
    showVoiceStatus(targetInput, "语音输入已停止。可以继续编辑后提交。 ");
  }

  if (options.focusTarget !== false && targetInput) {
    targetInput.focus();
  }
}

function handleNativeSpeechResult(event, targetInput) {
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    voiceState.localResults[index] = {
      text: result[0]?.transcript || "",
      isFinal: Boolean(result.isFinal),
    };
  }
  voiceState.localResults.length = Math.max(voiceState.localResults.length, event.results.length);

  const finalText = voiceState.localResults
    .filter((item) => item?.isFinal)
    .map((item) => item.text)
    .join("");
  const interimText = voiceState.localResults
    .filter((item) => item && !item.isFinal)
    .map((item) => item.text)
    .join("");
  const text = normalizeSpeechTranscript(`${finalText}${interimText}`);

  if (!text) return;
  voiceState.localHadText = true;
  window.clearTimeout(voiceState.localFallbackTimer);
  voiceState.localFallbackTimer = 0;
  renderSpeechTranscript(targetInput, text);
  showVoiceStatus(
    targetInput,
    interimText ? `正在识别：${normalizeSpeechTranscript(interimText)}` : "已同步写入，继续说即可。 ",
  );
}

function stopNativeRecognition() {
  window.clearTimeout(voiceState.localFallbackTimer);
  voiceState.localFallbackTimer = 0;
  const recognition = voiceState.recognition;
  voiceState.recognition = null;
  if (!recognition) return;
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  try {
    recognition.stop();
  } catch {
    try {
      recognition.abort();
    } catch {
      // Already stopped.
    }
  }
}

function getSpeechLanguage() {
  const language = navigator.language || "zh-CN";
  return language.toLowerCase().startsWith("zh") ? language : "zh-CN";
}

function getNativeSpeechErrorMessage(errorCode) {
  const messages = {
    "audio-capture": "没有检测到可用麦克风，请检查设备或系统权限。",
    "not-allowed": "麦克风权限被拒绝。请在浏览器地址栏里允许麦克风后再试。",
    "service-not-allowed": "浏览器没有允许当前页面使用语音识别。请检查权限或换用后端转写。",
    "no-speech": "没有听到声音，正在准备后端转写兜底。",
    network: "浏览器自带语音识别暂时不可用，正在准备后端转写兜底。",
    aborted: "语音输入已停止。",
  };
  return messages[errorCode] || "浏览器自带语音识别中断。";
}
function resetVoiceSession(input) {
  voiceState.targetInput = input;
  voiceState.mode = "idle";
  voiceState.localResults = [];
  voiceState.localHadText = false;
  voiceState.buffers = [];
  voiceState.overlapSamples = new Float32Array(0);
  voiceState.sampleRate = 0;
  voiceState.chunkIndex = 0;
  voiceState.pendingRequests = 0;
  voiceState.transcriptChunks = new Map();
  voiceState.draftStart = input.selectionStart ?? input.value.length;
  voiceState.draftEnd = input.selectionEnd ?? input.value.length;
  voiceState.draftText = "";
}

function cleanupVoiceCapture() {
  if (voiceState.processor) {
    voiceState.processor.onaudioprocess = null;
    try {
      voiceState.processor.disconnect();
    } catch {
      // Already disconnected.
    }
  }
  if (voiceState.source) {
    try {
      voiceState.source.disconnect();
    } catch {
      // Already disconnected.
    }
  }
  if (voiceState.stream) {
    voiceState.stream.getTracks().forEach((track) => track.stop());
  }
  if (voiceState.audioContext && voiceState.audioContext.state !== "closed") {
    voiceState.audioContext.close().catch(() => {});
  }

  voiceState.stream = null;
  voiceState.audioContext = null;
  voiceState.source = null;
  voiceState.processor = null;
}

function clearVoiceDraft() {
  voiceState.mode = "idle";
  stopNativeRecognition();
  voiceState.targetInput = null;
  voiceState.localResults = [];
  voiceState.localHadText = false;
  voiceState.buffers = [];
  voiceState.overlapSamples = new Float32Array(0);
  voiceState.pendingRequests = 0;
  voiceState.transcriptChunks = new Map();
  voiceState.draftStart = 0;
  voiceState.draftEnd = 0;
  voiceState.draftText = "";
}

async function flushVoiceChunk(options = {}) {
  const targetInput = voiceState.targetInput;
  const sampleRate = voiceState.sampleRate;
  const buffers = voiceState.buffers;
  if (!targetInput || !sampleRate || !buffers.length) return;

  voiceState.buffers = [];
  const currentSamples = flattenAudioBuffers(buffers);
  const sampleCount = currentSamples.length;
  const durationMs = (sampleCount / sampleRate) * 1000;
  if (!options.force && durationMs < VOICE_MIN_CHUNK_MS) {
    voiceState.buffers.unshift(...buffers);
    return;
  }

  const chunkIndex = voiceState.chunkIndex;
  voiceState.chunkIndex += 1;
  const audioSamples = prependAudioSamples(voiceState.overlapSamples, currentSamples);
  voiceState.overlapSamples = getTailAudioSamples(currentSamples, sampleRate, VOICE_OVERLAP_MS);
  const audioDataUrl = encodeWavDataUrlFromSamples(audioSamples, sampleRate);
  voiceState.pendingRequests += 1;
  try {
    const result = await postJson("/api/transcribe", {
      audioDataUrl,
      task: getVoiceTaskContext(),
      prompt: buildVoicePrompt(),
    });
    const text = sanitize(result?.text);
    if (text) {
      voiceState.transcriptChunks.set(chunkIndex, text);
      renderVoiceTranscript(targetInput);
      if (!voiceState.isListening) showVoiceStatus(targetInput, "语音输入已停止。可以继续编辑后提交。 ");
    }
  } catch (error) {
    showVoiceStatus(targetInput, error.message || "语音转文字失败，请稍后再试。", true);
  } finally {
    voiceState.pendingRequests = Math.max(0, voiceState.pendingRequests - 1);
    if (!voiceState.isListening && voiceState.pendingRequests === 0) {
      updateVoiceButtons();
    }
  }
}

function renderVoiceTranscript(input) {
  const text = Array.from(voiceState.transcriptChunks.entries())
    .sort((left, right) => left[0] - right[0])
    .map((entry) => normalizeSpeechTranscript(entry[1]))
    .reduce((combined, chunk) => appendTranscriptChunk(combined, chunk), "");
  renderSpeechTranscript(input, text);
}

function appendTranscriptChunk(combined, chunk) {
  if (!chunk) return combined;
  if (!combined) return chunk;

  const maxOverlap = Math.min(24, combined.length, chunk.length);
  for (let length = maxOverlap; length >= 2; length -= 1) {
    if (combined.slice(-length) === chunk.slice(0, length)) {
      return combined + chunk.slice(length);
    }
  }
  return combined + chunk;
}

function renderSpeechTranscript(input, transcript) {
  const text = normalizeSpeechTranscript(transcript);
  const start = Math.min(voiceState.draftStart, input.value.length);
  const end = Math.min(Math.max(voiceState.draftEnd, start), input.value.length);
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const spacer = getSpeechSpacer(before, text);
  const draftText = text ? `${spacer}${text}` : "";

  input.value = `${before}${draftText}${after}`;
  voiceState.draftStart = start;
  voiceState.draftEnd = start + draftText.length;
  voiceState.draftText = draftText;

  const cursor = voiceState.draftEnd;
  input.focus();
  input.setSelectionRange(cursor, cursor);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (input === elements.taskContent) updateSetupPreview();
}

function normalizeSpeechTranscript(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getSpeechSpacer(before, text) {
  if (!before || !text || /\s$/.test(before)) return "";
  if (/^[,.;:!?，。；：！？、）)\]}】》”]/.test(text)) return "";
  if (/[（([\[{《“]$/.test(before)) return "";
  if (/[A-Za-z0-9]$/.test(before) && /^[A-Za-z0-9]/.test(text)) return " ";
  return "";
}

function getVoiceTaskContext() {
  if (voiceState.targetInput !== elements.taskContent && state.task) return state.task;
  return {
    courseName: sanitize(elements.courseName.value) || "未命名学科",
    taskType: getSelectedTaskType(),
    taskContent: sanitize(elements.taskContent.value) || "当前主题",
  };
}

function buildVoicePrompt() {
  const task = getVoiceTaskContext();
  return [
    "这是 AI费曼教室中的学生讲题或讲知识点语音。",
    `学科：${task.courseName}`,
    `模式：${task.taskType}`,
    `主题：${task.taskContent}`,
    "请按中文学习讲解场景转写，保留公式、变量名、英文术语和常见理工科词汇。",
  ].join("\n");
}

function encodeWavDataUrl(buffers, inputSampleRate) {
  return encodeWavDataUrlFromSamples(flattenAudioBuffers(buffers), inputSampleRate);
}

function encodeWavDataUrlFromSamples(sourceSamples, inputSampleRate) {
  const samples = downsampleAudioBuffer(sourceSamples, inputSampleRate, VOICE_TARGET_SAMPLE_RATE);
  const wavBytes = encodePcmWav(samples, VOICE_TARGET_SAMPLE_RATE);
  return `data:audio/wav;base64,${uint8ToBase64(wavBytes)}`;
}

function prependAudioSamples(prefixSamples, sourceSamples) {
  if (!prefixSamples?.length) return sourceSamples;
  const output = new Float32Array(prefixSamples.length + sourceSamples.length);
  output.set(prefixSamples, 0);
  output.set(sourceSamples, prefixSamples.length);
  return output;
}

function getTailAudioSamples(samples, sampleRate, durationMs) {
  const length = Math.max(0, Math.round((sampleRate * durationMs) / 1000));
  if (!length || !samples.length) return new Float32Array(0);
  if (samples.length <= length) return samples.slice();
  return samples.slice(samples.length - length);
}

function flattenAudioBuffers(buffers) {
  const length = buffers.reduce((total, item) => total + item.length, 0);
  const output = new Float32Array(length);
  let offset = 0;
  buffers.forEach((buffer) => {
    output.set(buffer, offset);
    offset += buffer.length;
  });
  return output;
}

function downsampleAudioBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (outputSampleRate === inputSampleRate) return buffer;
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.max(1, Math.round(buffer.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), buffer.length);
    let sum = 0;
    let count = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      sum += buffer[sourceIndex];
      count += 1;
    }
    output[index] = count ? sum / count : 0;
  }

  return output;
}

function encodePcmWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  samples.forEach((sample) => {
    const value = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    offset += bytesPerSample;
  });

  return new Uint8Array(buffer);
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function uint8ToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

function getMicrophoneErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "麦克风权限被拒绝。请在浏览器地址栏里允许麦克风后再试。";
  }
  if (error?.name === "NotFoundError") {
    return "没有检测到可用麦克风，请检查设备或系统权限。";
  }
  if (error?.name === "NotReadableError") {
    return "麦克风正被其他应用占用，请关闭占用后再试。";
  }
  return error?.message || "麦克风启动失败，请稍后再试。";
}

function getVoiceControls(targetInput) {
  const isTaskInput = targetInput === elements.taskContent;
  return {
    button: isTaskInput ? elements.taskVoiceToolButton : elements.voiceToolButton,
    status: isTaskInput ? elements.taskVoiceStatus : elements.voiceStatus,
  };
}

function updateVoiceButtons() {
  [elements.taskContent, elements.replyInput].forEach((targetInput) => {
    const { button } = getVoiceControls(targetInput);
    const isActive = voiceState.isListening && voiceState.targetInput === targetInput;
    button.classList.toggle("active", isActive);
    button.textContent = isActive ? "停止" : "语音";
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.title = isActive ? "停止语音输入" : "语音输入";
  });
}

function showVoiceStatus(targetInput, message, isError = false) {
  const { status } = getVoiceControls(targetInput);
  status.textContent = message;
  status.hidden = false;
  status.classList.toggle("error", isError);
}

function hideVoiceStatus(targetInput) {
  const { status } = getVoiceControls(targetInput);
  status.hidden = true;
  status.textContent = "";
  status.classList.remove("error");
}

function openFormulaModal(targetInput = elements.replyInput) {
  if (voiceState.isListening) stopVoiceInput({ focusTarget: false });
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
  if (voiceState.isListening) stopVoiceInput({ focusTarget: false });
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
  if (state.screen === "lecture") {
    elements.replyInput.focus();
  } else {
    focusActiveInsertTarget();
  }
}

function handleImageSelection(event) {
  loadImageFile(event.target.files?.[0] || null);
}

function handleImagePaste(event) {
  const files = getClipboardImageFiles(event.clipboardData);
  if (!files.length) return;

  if (state.screen === "feedback") {
    event.preventDefault();
    loadFeedbackImageFiles(files.filter((file) => file.type.startsWith("image/")), { source: "paste" });
    return;
  }

  const pasteTarget = getImagePasteTarget(event.target);
  if (!pasteTarget && elements.imageModal.hidden) {
    return;
  }

  event.preventDefault();
  const targetInput = pasteTarget || getActiveInsertTarget();
  activeInsertTarget = targetInput;
  processMaterialFile(files[0], { source: pasteTarget ? "direct-paste" : "paste", targetInput });
}

function getImagePasteTarget(target) {
  if (target === elements.taskContent) return elements.taskContent;
  if (target === elements.replyInput) return elements.replyInput;
  return null;
}

function getClipboardImageFiles(clipboardData) {
  const files = Array.from(clipboardData?.files || []);
  const materialFiles = files.filter(isSupportedMaterialFile);
  if (materialFiles.length) return materialFiles;

  const items = Array.from(clipboardData?.items || []);
  return items
    .filter((item) => item.kind === "file" && (item.type.startsWith("image/") || item.type === "application/pdf"))
    .map((item) => item.getAsFile())
    .filter(isSupportedMaterialFile);
}

function isImageFile(file) {
  return Boolean(file && ALLOWED_IMAGE_TYPES.has(file.type));
}

function isPdfFile(file) {
  return Boolean(file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")));
}

function isSupportedMaterialFile(file) {
  return isImageFile(file) || isPdfFile(file);
}

function renderMaterialPreview(file, dataUrl) {
  elements.imageEmptyState.hidden = true;
  elements.imagePreview.hidden = true;
  elements.imagePreview.removeAttribute("src");
  elements.pdfFileSummary.hidden = true;
  elements.pdfFileSummary.innerHTML = "";

  if (isImageFile(file)) {
    elements.imagePreview.src = dataUrl;
    elements.imagePreview.hidden = false;
    return;
  }

  elements.pdfFileSummary.hidden = false;
  elements.pdfFileSummary.innerHTML = `
    <strong>${escapeHtml(file.name || "上传的 PDF")}</strong>
    <span>${escapeHtml(formatFileSize(file.size))}</span>
  `;
}

async function processMaterialFile(file, options = {}) {
  if (state.busy) {
    showSaveNotice("AI 学生正在思考，等这一轮结束后再添加材料。");
    return;
  }

  if (!file || !isSupportedMaterialFile(file)) {
    showImageError("请上传图片或 PDF 学习材料。");
    return;
  }

  const targetInput = options.targetInput || getActiveInsertTarget();
  const materialType = isPdfFile(file) ? "pdf" : "image";
  const modalOpen = !elements.imageModal.hidden;
  if (modalOpen) {
    clearImageMessages();
    setImageBusy(true, "正在理解材料并生成 AI 学生...");
  } else {
    showSaveNotice("正在理解你粘贴的学习材料...");
  }

  try {
    const dataUrl = options.dataUrl || (await readFileAsDataUrl(file));
    const result = await postJson("/api/prepare-material", {
      materialType,
      imageDataUrl: materialType === "image" ? dataUrl : "",
      pdfDataUrl: materialType === "pdf" ? dataUrl : "",
      fileName: file.name || (materialType === "pdf" ? "粘贴的 PDF" : "粘贴的图片"),
      courseHint: sanitize(elements.courseName.value || state.task?.courseName),
      hint: sanitize(elements.imageHintInput.value),
      task: state.task || getRecognitionTask(),
    });

    if (targetInput === elements.replyInput && state.task) {
      await addMaterialToCurrentDialogue(result);
    } else {
      startSessionFromMaterial(result);
    }

    if (modalOpen) closeImageModal();
  } catch (error) {
    if (modalOpen) {
      showImageError(error.message || "材料理解失败。");
    } else {
      showSaveNotice(error.message || "材料理解失败。");
    }
  } finally {
    if (modalOpen) setImageBusy(false);
  }
}

function loadImageFile(file, options = {}) {
  clearImageMessages();
  selectedImageDataUrl = "";
  selectedMaterialFile = null;
  selectedMaterialDataUrl = "";
  elements.recognizedTextInput.value = "";
  elements.recognizeImageButton.disabled = true;
  elements.imagePreview.hidden = true;
  elements.imagePreview.removeAttribute("src");
  elements.pdfFileSummary.hidden = true;
  elements.pdfFileSummary.innerHTML = "";
  elements.imageEmptyState.hidden = false;

  if (!file) return;

  if (!isSupportedMaterialFile(file)) {
    showImageError("请选择图片或 PDF 文件。");
    elements.imageUploadInput.value = "";
    return;
  }

  if (isImageFile(file) && file.size > MAX_IMAGE_BYTES) {
    showImageError("图片不能超过 5MB。可以先裁剪或压缩后再上传。");
    elements.imageUploadInput.value = "";
    return;
  }

  if (isPdfFile(file) && file.size > MAX_PDF_BYTES) {
    showImageError("PDF 不能超过 15MB。可以先拆分章节或压缩后再上传。");
    elements.imageUploadInput.value = "";
    return;
  }

  readFileAsDataUrl(file)
    .then((dataUrl) => {
      selectedMaterialFile = file;
      selectedMaterialDataUrl = dataUrl;
      selectedImageDataUrl = isImageFile(file) ? dataUrl : "";
      renderMaterialPreview(file, dataUrl);
      elements.recognizeImageButton.disabled = false;
      const pasted = options.source === "paste" || options.source === "direct-paste";
      showImageStatus(pasted ? "已粘贴材料，可以直接使用。" : "材料已载入，可以直接使用。");
    })
    .catch(() => {
      showImageError("材料读取失败，请换一个文件再试。");
    });
}

async function recognizeSelectedImage() {
  if (!selectedMaterialFile || !selectedMaterialDataUrl) {
    showImageError("请先选择图片或 PDF。");
    return;
  }

  await processMaterialFile(selectedMaterialFile, {
    dataUrl: selectedMaterialDataUrl,
    source: "modal",
    targetInput: getActiveInsertTarget(),
  });
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
  elements.recognizeImageButton.textContent = label === "讲解" ? "加入当前对话" : "生成 AI 学生";
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
  selectedMaterialFile = null;
  selectedMaterialDataUrl = "";
  if (clearFile) elements.imageUploadInput.value = "";
  elements.imageHintInput.value = "";
  elements.recognizedTextInput.value = "";
  elements.imagePreview.hidden = true;
  elements.imagePreview.removeAttribute("src");
  elements.pdfFileSummary.hidden = true;
  elements.pdfFileSummary.innerHTML = "";
  elements.imageEmptyState.hidden = false;
  elements.recognizeImageButton.disabled = true;
  setImageBusy(false);
  clearImageMessages();
}

function setImageBusy(isBusy, message = "") {
  elements.recognizeImageButton.disabled = isBusy || !selectedMaterialDataUrl;
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

function normalizeClientStringArray(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => sanitize(item)).filter(Boolean);
}

function buildTaskFromMaterial(material) {
  const courseName = sanitize(material?.courseName || elements.courseName.value) || "未命名学科";
  const topic = sanitize(material?.taskContent || material?.starterTopic || material?.overview || material?.documentTitle);
  return {
    courseName,
    taskType: "知识点讲解",
    taskContent: topic || "上传学习材料中的核心知识点",
    materialContext: formatMaterialContextForTask(material),
  };
}

function mergeTaskMaterialContext(material) {
  if (!state.task) return;
  const incoming = formatMaterialContextForTask(material);
  const existing = sanitize(state.task.materialContext);
  state.task = {
    ...state.task,
    materialContext: [existing, incoming].filter(Boolean).join("\n\n--- 补充材料 ---\n").slice(0, 5000),
  };
  renderSessionSummary();
  renderLectureTopicBanner();
  saveSession();
}

function formatMaterialContextForTask(material) {
  const context = sanitize(material?.materialContext);
  if (context) return context;

  return [
    sanitize(material?.documentTitle) ? `材料：${sanitize(material.documentTitle)}` : "",
    sanitize(material?.overview) ? `概览：${sanitize(material.overview)}` : "",
    ...normalizeClientStringArray(material?.suggestedSequence).map((item) => `学习顺序：${item}`),
    ...normalizeClientStringArray(material?.formulas).map((item) => `公式：${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function formatMaterialDialogueMessage(material) {
  const title = sanitize(material?.documentTitle || material?.fileName || "补充学习材料");
  const overview = sanitize(material?.overview);
  const context = formatMaterialContextForTask(material);
  return [
    `我补充了一份学习材料：${title}`,
    overview ? `材料概览：${overview}` : "",
    context ? `材料上下文：\n${context}` : "",
    "请你基于这份材料继续用 AI 学生的方式追问我，帮助我把关键知识点讲清楚。",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatMaterialVisibleMessage(material) {
  const title = sanitize(material?.documentTitle || material?.fileName || "补充学习材料");
  const overview = sanitize(material?.overview);
  return [`我补充了一份学习材料：${title}`, overview ? `材料概览：${overview}` : ""].filter(Boolean).join("\n\n");
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function closeModalOnBackdrop(event) {
  if (event.target === elements.formulaModal) closeFormulaModal();
  if (event.target === elements.imageModal) closeImageModal();
  if (event.target === elements.consentModal && hasParticipant()) closeConsentModal();
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

function openFeedbackScreen() {
  if (!hasParticipant()) {
    openConsentModal();
    showSaveNotice("请先授权同步并生成访问码，再提交反馈。");
    return;
  }

  if (state.screen !== "feedback") {
    state.feedbackReturnScreen = state.screen || "setup";
  }

  clearFeedbackMessages();
  switchScreen("feedback");
  saveSession();
  window.setTimeout(() => elements.feedbackContactInput.focus(), 0);
}

function closeFeedbackScreen() {
  const returnScreen = state.feedbackReturnScreen && state.feedbackReturnScreen !== "feedback"
    ? state.feedbackReturnScreen
    : "setup";

  clearFeedbackMessages();
  if (returnScreen === "library") {
    renderLibrary();
  }
  switchScreen(returnScreen);
  saveSession();
}

function openMobileSidebar() {
  loadLibrary();
  renderSidebarConversations();
  elements.appSidebar.classList.add("mobile-open");
  elements.sidebarBackdrop.hidden = false;
  elements.mobileMenuButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("mobile-sidebar-open");
}

function closeMobileSidebar() {
  elements.appSidebar.classList.remove("mobile-open");
  elements.sidebarBackdrop.hidden = true;
  elements.mobileMenuButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("mobile-sidebar-open");
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
    closeMobileSidebar();
  }
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

async function submitFeedback(event) {
  event.preventDefault();

  if (!hasParticipant()) {
    openConsentModal();
    showSaveNotice("请先授权同步并生成访问码，再提交反馈。");
    return;
  }

  const contact = sanitize(elements.feedbackContactInput.value);
  const subscriptionFee = sanitize(elements.feedbackSubscriptionInput.value);
  const message = sanitize(elements.feedbackMessageInput.value);

  if (!subscriptionFee) {
    flashMissingInput([elements.feedbackSubscriptionInput]);
    showFeedbackError("请填写你愿意每月支付的订阅费用。");
    return;
  }

  const subscriptionAmount = Number(subscriptionFee);
  if (!Number.isFinite(subscriptionAmount) || subscriptionAmount < 0) {
    flashMissingInput([elements.feedbackSubscriptionInput]);
    showFeedbackError("请填写有效的月订阅费用。");
    return;
  }

  if (!message) {
    flashMissingInput([elements.feedbackMessageInput]);
    showFeedbackError("请写下你的体验感受、需求或建议。");
    return;
  }

  setFeedbackBusy(true, "正在提交反馈...");

  try {
    await postJson(
      "/api/feedback",
      {
        contact,
        subscriptionFee,
        message,
        imageDataUrls: feedbackImageDataUrls,
        context: buildFeedbackContext(),
      },
      { headers: participantHeaders() },
    );
    clearFeedbackForm();
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
  const sourceScreen = state.screen === "feedback" ? state.feedbackReturnScreen : state.screen;
  const activeRecord = sourceScreen === "library" ? getActiveLibraryRecord() : null;
  return {
    screen: sourceScreen,
    submittedFrom: state.screen,
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

function clearFeedbackForm() {
  elements.feedbackContactInput.value = "";
  elements.feedbackSubscriptionInput.value = "";
  elements.feedbackMessageInput.value = "";
  clearFeedbackImage();
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
  elements.feedbackContactInput.disabled = isBusy;
  elements.feedbackSubscriptionInput.disabled = isBusy;
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

  if (task.materialContext) {
    return `我已经看过你上传的学习材料了，但我还没有真正学会${quotedTopic}。\n\n请你先用自己的话讲一下这份材料里最核心的知识点。`;
  }

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
  elements.feedbackScreen.classList.toggle("active", screen === "feedback");
  if (elements.stageLabel) {
    elements.stageLabel.textContent =
      screen === "setup"
        ? "创建学习会话"
        : screen === "lecture"
          ? "正式讲解"
          : screen === "report"
            ? "诊断报告"
            : screen === "library"
              ? "对话记录"
              : "反馈";
  }
  updateTurnCount();
  updateSaveButtons();
  renderSidebarConversations();
  closeMobileSidebar();
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
  elements.voiceToolButton.disabled = isBusy;
  elements.formulaToolButton.disabled = isBusy;
  elements.imageToolButton.disabled = isBusy;
  elements.taskVoiceToolButton.disabled = isBusy;
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
  closeMobileSidebar();
  state.screen = "setup";
  state.task = null;
  state.messages = [];
  state.observations = [];
  state.report = null;
  state.turn = 0;
  state.busy = false;
  state.libraryId = "";
  state.libraryReturnScreen = "setup";
  state.feedbackReturnScreen = "setup";
  elements.courseName.value = "";
  elements.taskContent.value = "";
  setRadioValue("taskType", "知识点讲解");
  elements.replyInput.value = "";
  elements.conversation.innerHTML = "";
  elements.lectureTopicBanner.innerHTML = "";
  elements.focusList.innerHTML = `<p class="muted">暂无观察。</p>`;
  elements.reportPanel.innerHTML = "";
  stopVoiceInput({ focusTarget: false, keepStatus: true });
  hideVoiceStatus(elements.taskContent);
  hideVoiceStatus(elements.replyInput);
  closeFormulaModal();
  closeImageModal();
  resetImageRecognition();
  clearFeedbackForm();
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
      feedbackReturnScreen: state.feedbackReturnScreen,
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
    state.feedbackReturnScreen = saved.feedbackReturnScreen || "setup";

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
    } else if (state.screen === "feedback") {
      if (state.task) {
        populateSetupFromState();
        renderSessionSummary();
        renderConversation();
        renderFocusList();
        if (state.report) renderReport();
      } else {
        updateSetupPreview();
      }
      clearFeedbackMessages();
      switchScreen("feedback");
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
