const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");
const { PDFParse } = require("pdf-parse");

loadEnvFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 5173);
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const ZHIPU_MODEL = process.env.ZHIPU_MODEL || "glm-4-flash-250414";
const ZHIPU_VISION_MODEL = process.env.ZHIPU_VISION_MODEL || "glm-4.5v";
const ZHIPU_ASR_MODEL = process.env.ZHIPU_ASR_MODEL || "glm-asr-2512";
const ZHIPU_ENDPOINT =
  process.env.ZHIPU_ENDPOINT || "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_ASR_ENDPOINT =
  process.env.ZHIPU_ASR_ENDPOINT || "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions";
const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 50_000_000);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_AUDIO_BYTES = Number(process.env.MAX_AUDIO_BYTES || 5 * 1024 * 1024);
const MAX_PDF_BYTES = Number(process.env.MAX_PDF_BYTES || 30 * 1024 * 1024);
const PDF_RECOGNITION_TEXT_LIMIT = Number(process.env.PDF_RECOGNITION_TEXT_LIMIT || 28_000);
const MAX_PDF_VISION_PAGES = Number(process.env.MAX_PDF_VISION_PAGES || 6);
const PDF_VISION_PAGE_WIDTH = Number(process.env.PDF_VISION_PAGE_WIDTH || 1400);
const MAX_FEEDBACK_IMAGES = 6;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, "research-store.json");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const PRIVACY_CONSENT_VERSION = process.env.PRIVACY_CONSENT_VERSION || "2026-05-22";
const ALLOWED_ORIGINS = parseCsv(process.env.ALLOWED_ORIGINS || "");
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
const TRANSCRIBE_RATE_LIMIT_WINDOW_MS = Number(process.env.TRANSCRIBE_RATE_LIMIT_WINDOW_MS || RATE_LIMIT_WINDOW_MS);
const TRANSCRIBE_RATE_LIMIT_MAX = Number(process.env.TRANSCRIBE_RATE_LIMIT_MAX || 900);
const HSTS_HEADER = process.env.HSTS_HEADER || "max-age=31536000; includeSubDomains";
const store = loadDataStore();
const rateLimitBuckets = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const server = http.createServer(async (request, response) => {
  setCorsHeaders(request, response);
  setSecurityHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/") && request.method !== "OPTIONS") {
      enforceRateLimit(request, url.pathname);
    }

    if (url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        syncEnabled: true,
        adminConfigured: Boolean(ADMIN_TOKEN),
        consentVersion: PRIVACY_CONSENT_VERSION,
      });
      return;
    }

    if (url.pathname === "/api/participant" && request.method === "POST") {
      const payload = await readJson(request);
      sendJson(response, 201, createParticipant(payload));
      return;
    }

    if (url.pathname === "/api/library" && request.method === "GET") {
      const participant = requireParticipant(request);
      sendJson(response, 200, {
        records: getParticipantRecords(participant.id),
      });
      return;
    }

    if (url.pathname === "/api/library" && request.method === "POST") {
      const participant = requireParticipant(request);
      const payload = await readJson(request);
      sendJson(response, 200, upsertLibraryRecord(participant, payload.record || payload));
      return;
    }

    if (url.pathname.startsWith("/api/library/") && request.method === "DELETE") {
      const participant = requireParticipant(request);
      const recordId = decodeURIComponent(url.pathname.replace(/^\/api\/library\//, ""));
      sendJson(response, 200, deleteLibraryRecord(participant, recordId));
      return;
    }

    if (url.pathname === "/api/admin/records" && request.method === "GET") {
      requireAdmin(request);
      sendJson(response, 200, getAdminRecords());
      return;
    }

    if (url.pathname === "/api/feedback" && request.method === "POST") {
      const payload = await readJson(request);
      sendJson(response, 201, createFeedback(payload, request));
      return;
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      const payload = await readJson(request);
      const result = await createFollowUp(payload);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/roadmap" && request.method === "POST") {
      const payload = await readJson(request);
      const result = await createLearningRoadmap(payload);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/report" && request.method === "POST") {
      const payload = await readJson(request);
      const result = await createReport(payload);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/recognize-image" && request.method === "POST") {
      const payload = await readJson(request);
      const result = await createImageRecognition(payload);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/recognize-pdf" && request.method === "POST") {
      const payload = await readJson(request);
      const result = await createPdfRecognition(payload);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/prepare-material" && request.method === "POST") {
      const payload = await readJson(request);
      const result = await createMaterialPreparation(payload);
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/transcribe" && request.method === "POST") {
      const payload = await readJson(request);
      const result = await createAudioTranscription(payload);
      sendJson(response, 200, result);
      return;
    }

    serveStatic(url.pathname, response);
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, status, {
      error: status === 500 ? "server_error" : "request_error",
      message: error.message || "服务暂时不可用。",
    });
  }
});

server.listen(PORT, () => {
  console.log(`AI费曼教室 local server running at http://localhost:${PORT}`);
});

async function createLearningRoadmap(payload) {
  assertApiKey();
  const task = normalizeTask(payload.task);

  const response = await callZhipu(
    [
      { role: "system", content: buildRoadmapSystemPrompt(task) },
      {
        role: "user",
        content: JSON.stringify(
          {
            task,
            instruction:
              "请把这个学习任务拆成 AI 学生接下来大概要追问的几个小问题。问题要具体、可回答，不要写成“介绍一下某某”。",
          },
          null,
          2,
        ),
      },
    ],
    { maxTokens: 1100 },
  );

  const parsed = parseJsonObject(response);
  const roadmap = normalizeRoadmapItems(parsed.roadmap);
  return {
    overview: stringOrDefault(parsed.overview, ""),
    roadmap: roadmap.length ? roadmap : buildFallbackRoadmap(task),
  };
}

async function createFollowUp(payload) {
  assertApiKey();
  const task = normalizeTask(payload.task);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const observations = Array.isArray(payload.observations) ? payload.observations : [];
  const latest = String(payload.latestExplanation || "").trim();
  const controlAction = normalizeControlAction(payload.controlAction);

  if (!latest && !controlAction.type) {
    throw httpError(400, "讲解内容不能为空。");
  }

  if (controlAction.type === "hint") {
    return createHintResponse({ task, messages, observations });
  }

  const response = await callZhipu([
    { role: "system", content: buildChatSystemPrompt(task) },
    {
      role: "user",
      content: JSON.stringify(
        {
          task,
          activeObservations: observations.filter((item) => item.status !== "resolved").slice(-8),
          recentDialogue: messages.slice(-10),
          latestExplanation: latest,
          controlAction,
        },
        null,
        2,
      ),
    },
  ]);

  const parsed = parseJsonObject(response);
  const normalizedObservations = normalizeObservations(parsed.observations);
  return {
    assistantText:
      typeof parsed.assistantText === "string" && parsed.assistantText.trim()
        ? parsed.assistantText.trim()
        : "我还有些地方没有完全听懂。你能把关键概念、推导依据和物理意义再拆开讲一遍吗？",
    observations: filterControlActionObservations(normalizedObservations, controlAction.type),
    resolvedObservationIds: Array.isArray(parsed.resolvedObservationIds)
      ? parsed.resolvedObservationIds.map(String)
      : [],
  };
}

async function createHintResponse({ task, messages, observations }) {
  const activeObservations = observations.filter((item) => item.status !== "resolved").slice(-6);
  const latestAssistant = [...messages].reverse().find((message) => message?.role === "assistant");
  const currentQuestion =
    activeObservations
      .map((item) => item.question || item.description)
      .filter(Boolean)
      .at(-1) ||
    latestAssistant?.text ||
    task.taskContent;

  const response = await callZhipu(
    [
      { role: "system", content: buildHintSystemPrompt(task) },
      {
        role: "user",
        content: JSON.stringify(
          {
            task,
            activeObservations,
            recentDialogue: messages.slice(-8),
            currentQuestion,
            instruction:
              "用户点击了“提示”。请直接给当前小问题的必要讲解或提示，然后问一个确认掌握的小问题。",
          },
          null,
          2,
        ),
      },
    ],
    { maxTokens: 1200 },
  );

  const parsed = parseJsonObject(response);
  return {
    assistantText:
      typeof parsed.assistantText === "string" && parsed.assistantText.trim()
        ? parsed.assistantText.trim()
        : buildFallbackHintText(task, currentQuestion),
    observations: normalizeObservations(parsed.observations),
    resolvedObservationIds: [],
  };
}

async function createReport(payload) {
  assertApiKey();
  const task = normalizeTask(payload.task);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const observations = Array.isArray(payload.observations) ? payload.observations : [];

  if (!messages.some((message) => message.role === "user")) {
    throw httpError(400, "至少完成一轮讲解后才能生成报告。");
  }

  const response = await callZhipu([
    { role: "system", content: buildReportSystemPrompt(task) },
    {
      role: "user",
      content: JSON.stringify(
        {
          task,
          observations,
          dialogue: messages,
        },
        null,
        2,
      ),
    },
  ]);

  const parsed = parseJsonObject(response);
  return {
    topic: stringOrDefault(parsed.topic, `${task.courseName} · ${task.taskType} · ${task.taskContent}`),
    mainGaps: normalizeStringArray(parsed.mainGaps, ["本轮没有形成明确的未解决漏洞。"]),
    logicJumps: normalizeStringArray(parsed.logicJumps, ["暂未发现持续存在的明显逻辑跳跃。"]),
    clarifiedParts: normalizeStringArray(parsed.clarifiedParts, ["还需要通过下一轮补充继续观察哪些部分真正变清楚。"]),
    reviewTargets: normalizeStringArray(parsed.reviewTargets, ["围绕本次主题回看关键概念、公式条件和物理意义。"]),
    nextActions: normalizeStringArray(parsed.nextActions, ["重新讲一遍最卡住的部分，并用一个具体例子检验理解。"]),
  };
}

async function createImageRecognition(payload) {
  assertApiKey();
  const task = normalizeTask(payload.task);
  const imageDataUrl = String(payload.imageDataUrl || "").trim();
  const hint = String(payload.hint || "").trim().slice(0, 300);

  if (!isSupportedImageDataUrl(imageDataUrl)) {
    throw httpError(400, "请上传 png、jpg、jpeg 或 webp 图片。");
  }

  const approxBytes = Math.ceil((imageDataUrl.split(",")[1] || "").length * 0.75);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw httpError(413, "图片不能超过 5MB。");
  }

  const response = await callZhipuVision([
    { role: "system", content: buildImageRecognitionSystemPrompt(task) },
    {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: {
            url: stripImageDataUrlPrefix(imageDataUrl),
          },
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              task,
              hint,
              instruction:
                "请只识别和转写图片中的公式、文字或图像信息，输出严格 JSON。公式优先级最高：如果图片里出现任何数学公式或符号表达式，必须先转写公式，再转写文字说明。不要只写公式含义，不要解题，不要补充教学讲解。",
            },
            null,
            2,
          ),
        },
      ],
    },
  ]);

  const parsed = parseJsonObject(response);
  return {
    recognizedText: stringOrDefault(parsed.recognizedText, ""),
    formulaLatex: normalizeLatexText(parsed.formulaLatex),
    diagramDescription: stringOrDefault(parsed.diagramDescription, ""),
    uncertaintyNotes: normalizeStringArray(parsed.uncertaintyNotes, []),
  };
}

async function createPdfRecognition(payload) {
  assertApiKey();
  const pdfDataUrl = String(payload.pdfDataUrl || "").trim();
  const fileName = String(payload.fileName || "上传的 PDF").trim().slice(0, 240);
  const courseHint = String(payload.courseHint || "").trim().slice(0, 160);

  if (!isSupportedPdfDataUrl(pdfDataUrl)) {
    throw httpError(400, "请上传 PDF 文件。");
  }

  const base64Pdf = pdfDataUrl.split(",")[1] || "";
  const approxBytes = Math.ceil(base64Pdf.length * 0.75);
  if (approxBytes > MAX_PDF_BYTES) {
    throw httpError(413, `PDF 不能超过 ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB。`);
  }

  const pdfBuffer = Buffer.from(base64Pdf, "base64");
  let pdfTextResult = { text: "", total: 0 };
  try {
    pdfTextResult = await extractPdfText(pdfBuffer);
  } catch (error) {
    pdfTextResult = { text: "", total: 0, errorMessage: error.message || "PDF 文本读取失败。" };
  }

  const extractedText = normalizeExtractedPdfText(pdfTextResult.text);
  if (extractedText.length < 80) {
    const material = await createScannedPdfMaterialPreparation({
      pdfBuffer,
      fileName,
      courseHint,
      userHint: "",
      currentTask: null,
      pdfTextResult,
      extractedText,
    });
    return materialToPdfRecognition(material);
  }

  const recognitionText = buildPdfRecognitionText(extractedText);
  const response = await callZhipu(
    [
      { role: "system", content: buildPdfRecognitionSystemPrompt() },
      {
        role: "user",
        content: JSON.stringify(
          {
            fileName,
            courseHint,
            pageCount: pdfTextResult.total || 0,
            extractedCharCount: extractedText.length,
            textWasTruncated: recognitionText.length < extractedText.length,
            extractedText: recognitionText,
          },
          null,
          2,
        ),
      },
    ],
    { maxTokens: 2200 },
  );

  const parsed = parseJsonObject(response);
  const knowledgePoints = normalizeKnowledgePointItems(parsed.knowledgePoints);
  const suggestedSequence = normalizeStringArray(parsed.suggestedSequence, []);
  const prerequisites = normalizeStringArray(parsed.prerequisites, []);
  const formulas = normalizeStringArray(parsed.formulas, []);
  const cautions = normalizeStringArray(parsed.cautions, []);
  const taskContent = stringOrDefault(parsed.taskContent, buildPdfTaskContent(parsed, knowledgePoints, suggestedSequence));

  return {
    courseName: stringOrDefault(parsed.courseName, courseHint || ""),
    documentTitle: stringOrDefault(parsed.documentTitle, fileName),
    overview: stringOrDefault(parsed.overview, "已从 PDF 中提取出可用于讲解的知识点。"),
    starterTopic: stringOrDefault(parsed.starterTopic, knowledgePoints[0]?.title || ""),
    taskContent,
    knowledgePoints,
    suggestedSequence,
    prerequisites,
    formulas,
    cautions,
    extractedCharCount: extractedText.length,
    pageCount: Number(pdfTextResult.total || 0),
  };
}

async function createMaterialPreparation(payload) {
  assertApiKey();
  const materialType = String(payload.materialType || "").trim().toLowerCase();
  const fileName = String(payload.fileName || "上传材料").trim().slice(0, 240);
  const courseHint = String(payload.courseHint || "").trim().slice(0, 160);
  const userHint = String(payload.hint || "").trim().slice(0, 500);
  const currentTask = payload.task && typeof payload.task === "object" ? normalizeTask(payload.task) : null;

  if (materialType === "image") {
    return createImageMaterialPreparation({
      imageDataUrl: payload.imageDataUrl,
      fileName,
      courseHint,
      userHint,
      currentTask,
    });
  }

  if (materialType === "pdf") {
    return createPdfMaterialPreparation({
      pdfDataUrl: payload.pdfDataUrl,
      fileName,
      courseHint,
      userHint,
      currentTask,
    });
  }

  throw httpError(400, "请上传图片或 PDF 学习材料。");
}

async function createImageMaterialPreparation({ imageDataUrl, fileName, courseHint, userHint, currentTask }) {
  const dataUrl = String(imageDataUrl || "").trim();
  if (!isSupportedImageDataUrl(dataUrl)) {
    throw httpError(400, "请上传 png、jpg、jpeg 或 webp 图片。");
  }

  const approxBytes = Math.ceil((dataUrl.split(",")[1] || "").length * 0.75);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw httpError(413, "图片不能超过 5MB。");
  }

  const response = await callZhipuVision(
    [
      { role: "system", content: buildMaterialImageSystemPrompt() },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: stripImageDataUrlPrefix(dataUrl),
            },
          },
          {
            type: "text",
            text: JSON.stringify(
              {
                materialType: "image",
                fileName,
                courseHint,
                userHint,
                currentTask,
                instruction:
                  "请理解这张图片中的课程材料、公式、草图或题目信息，并整理成 AI 学生创建或追问所需的学习上下文。不要只做 OCR，不要给标准答案。",
              },
              null,
              2,
            ),
          },
        ],
      },
    ],
    { maxTokens: 2200 },
  );

  return normalizeMaterialPreparation(parseJsonObject(response), {
    materialType: "image",
    fileName,
    courseHint,
    userHint,
  });
}

async function createPdfMaterialPreparation({ pdfDataUrl, fileName, courseHint, userHint, currentTask }) {
  const dataUrl = String(pdfDataUrl || "").trim();
  if (!isSupportedPdfDataUrl(dataUrl)) {
    throw httpError(400, "请上传 PDF 文件。");
  }

  const base64Pdf = dataUrl.split(",")[1] || "";
  const approxBytes = Math.ceil(base64Pdf.length * 0.75);
  if (approxBytes > MAX_PDF_BYTES) {
    throw httpError(413, `PDF 不能超过 ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB。`);
  }

  const pdfBuffer = Buffer.from(base64Pdf, "base64");
  let pdfTextResult = { text: "", total: 0 };
  try {
    pdfTextResult = await extractPdfText(pdfBuffer);
  } catch (error) {
    pdfTextResult = { text: "", total: 0, errorMessage: error.message || "PDF 文本读取失败。" };
  }

  const extractedText = normalizeExtractedPdfText(pdfTextResult.text);
  if (extractedText.length < 80) {
    return createScannedPdfMaterialPreparation({
      pdfBuffer,
      fileName,
      courseHint,
      userHint,
      currentTask,
      pdfTextResult,
      extractedText,
    });
  }

  const recognitionText = buildPdfRecognitionText(extractedText);
  const response = await callZhipu(
    [
      { role: "system", content: buildMaterialPdfSystemPrompt() },
      {
        role: "user",
        content: JSON.stringify(
          {
            materialType: "pdf",
            fileName,
            courseHint,
            userHint,
            currentTask,
            pageCount: pdfTextResult.total || 0,
            extractedCharCount: extractedText.length,
            textWasTruncated: recognitionText.length < extractedText.length,
            extractedText: recognitionText,
          },
          null,
          2,
        ),
      },
    ],
    { maxTokens: 2400 },
  );

  return normalizeMaterialPreparation(parseJsonObject(response), {
    materialType: "pdf",
    fileName,
    courseHint,
    userHint,
    pageCount: Number(pdfTextResult.total || 0),
    extractedCharCount: extractedText.length,
  });
}

async function createScannedPdfMaterialPreparation({
  pdfBuffer,
  fileName,
  courseHint,
  userHint,
  currentTask,
  pdfTextResult,
  extractedText,
}) {
  let screenshotResult;
  try {
    screenshotResult = await extractPdfPageImages(pdfBuffer, MAX_PDF_VISION_PAGES);
  } catch (error) {
    const textError = pdfTextResult?.errorMessage ? `；文字抽取也失败：${pdfTextResult.errorMessage}` : "";
    throw httpError(422, `这个 PDF 看起来像扫描版，但页面渲染失败${textError}。请换一个未加密的 PDF 再试。`);
  }

  const pages = screenshotResult.pages.filter((page) => page.dataUrl);
  if (!pages.length) {
    throw httpError(422, "这个 PDF 看起来像扫描版，但没有成功渲染出可识别的页面。请换一个未加密的 PDF 再试。");
  }

  const response = await callZhipuVision(
    [
      { role: "system", content: buildMaterialScannedPdfSystemPrompt() },
      {
        role: "user",
        content: [
          ...pages.map((page) => ({
            type: "image_url",
            image_url: {
              url: stripImageDataUrlPrefix(page.dataUrl),
            },
          })),
          {
            type: "text",
            text: JSON.stringify(
              {
                materialType: "scanned_pdf",
                fileName,
                courseHint,
                userHint,
                currentTask,
                pageCount: screenshotResult.total || pdfTextResult?.total || pages.length,
                renderedPages: pages.map((page) => page.pageNumber),
                renderedPageLimit: MAX_PDF_VISION_PAGES,
                extractedCharCount: extractedText.length,
                extractedTextPreview: extractedText.slice(0, 1200),
                instruction:
                  "这些图片是同一个扫描版 PDF 的页面截图。请整体理解页面中的课程知识点、公式、图、题目或讲义结构，并生成 AI 学生追问所需的材料上下文。不要要求用户转换成文字版 PDF。",
              },
              null,
              2,
            ),
          },
        ],
      },
    ],
    { maxTokens: 2600 },
  );

  const material = normalizeMaterialPreparation(parseJsonObject(response), {
    materialType: "pdf",
    fileName,
    courseHint,
    userHint,
    pageCount: Number(screenshotResult.total || pdfTextResult?.total || pages.length),
    extractedCharCount: extractedText.length,
  });

  if (screenshotResult.total > pages.length) {
    material.cautions = [
      ...material.cautions,
      `这份扫描版 PDF 共 ${screenshotResult.total} 页，当前已自动识别前 ${pages.length} 页；如需继续学习后续页面，可以再上传包含对应页的 PDF。`,
    ];
    material.materialContext = `${material.materialContext}\n需要确认：这份扫描版 PDF 共 ${screenshotResult.total} 页，当前已自动识别前 ${pages.length} 页。`;
  }

  return material;
}

async function createAudioTranscription(payload) {
  assertApiKey();
  const audioDataUrl = String(payload.audioDataUrl || "").trim();
  const prompt = String(payload.prompt || "").trim().slice(0, 8000);

  if (!isSupportedAudioDataUrl(audioDataUrl)) {
    throw httpError(400, "请录入 wav 格式的语音片段。 ");
  }

  const base64Audio = audioDataUrl.split(",")[1] || "";
  const approxBytes = Math.ceil(base64Audio.length * 0.75);
  if (approxBytes > MAX_AUDIO_BYTES) {
    throw httpError(413, "语音片段过大，请缩短后再试。 ");
  }

  const audioBlob = new Blob([Buffer.from(base64Audio, "base64")], { type: "audio/wav" });
  const form = new FormData();
  form.set("model", ZHIPU_ASR_MODEL);
  form.set("stream", "false");
  form.set("file", audioBlob, "speech.wav");
  form.set("request_id", crypto.randomUUID());
  if (prompt) form.set("prompt", prompt);

  const response = await fetch(ZHIPU_ASR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ZHIPU_API_KEY}`,
    },
    body: form,
  });

  const body = await response.text();
  if (!response.ok) {
    let detail = body;
    try {
      const errorBody = JSON.parse(body);
      detail = errorBody?.error?.message || errorBody?.message || body;
    } catch {
      // Keep raw response text.
    }
    throw httpError(response.status, `语音转文字失败：${detail}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw httpError(502, "语音转文字服务返回了无法解析的响应。 ");
  }

  return {
    text: stringOrDefault(parsed.text, ""),
  };
}

function isSupportedAudioDataUrl(value) {
  return /^data:audio\/wav(?:;[^,]*)?;base64,/i.test(value);
}

async function extractPdfText(pdfBuffer) {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    return await parser.getText();
  } finally {
    await parser.destroy();
  }
}

async function extractPdfPageImages(pdfBuffer, maxPages) {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    const result = await parser.getScreenshot({
      first: Math.max(1, maxPages),
      desiredWidth: PDF_VISION_PAGE_WIDTH,
      imageDataUrl: true,
      imageBuffer: false,
    });
    return {
      total: Number(result.total || result.pages?.length || 0),
      pages: Array.isArray(result.pages)
        ? result.pages.map((page) => ({
            pageNumber: Number(page.pageNumber || 0),
            width: Number(page.width || 0),
            height: Number(page.height || 0),
            dataUrl: String(page.dataUrl || ""),
          }))
        : [],
    };
  } finally {
    await parser.destroy();
  }
}

function buildRoadmapSystemPrompt(task) {
  const modeRule =
    task.taskType === "题目讲解"
      ? [
          "用户给的是一道题或一个解题任务。拆解应围绕：题意拆解、已知未知、建模依据、公式条件、步骤衔接、结果解释。",
          "每个问题都要能让用户直接开口回答，不要要求用户一次讲完整道题。",
        ].join("\n")
      : [
          "用户给的是一个知识点，可能很大，例如“导数”或几页 PDF 的主题。拆解应围绕：解决什么问题、定义/公式、符号和条件、直观理解、推导或来源、应用步骤、边界情况。",
          "如果知识点很宽泛，要把第一个问题设计得很小，比如先问“它描述什么关系”或“最核心公式是什么”，不要问“请介绍一下”。",
        ].join("\n");

  return [
    "你是 AI费曼教室的学习流程拆解助手。",
    "你的任务是把用户要讲给 AI 学生听的主题拆成 4-7 个循序渐进的小问题，用来展示给用户一个基本学习流程图。",
    "这些问题不是课程讲义，也不是标准答案；它们是 AI 学生大概要追问用户的路径。",
    modeRule,
    "问题必须具体、短、可回答。禁止输出“介绍一下/讲一下/说说这个知识点”这类宽泛问法。",
    "优先使用用户给出的主题词和材料上下文；没有材料时按通用学习路径拆解。",
    "必须只输出 JSON 对象，不要 Markdown，不要代码块。",
    'JSON 结构：{"overview":"一句话说明拆解思路","roadmap":[{"title":"步骤标题，2-8字","question":"AI 学生会问用户的具体小问题","focus":"这一步主要检查什么"}]}',
  ].join("\n");
}

function buildHintSystemPrompt(task) {
  const modeRule =
    task.taskType === "题目讲解"
      ? "提示要帮助用户继续解题，但不能直接给完整标准解法。优先提示题意拆解、建模变量、公式依据或下一步该检查的条件。"
      : "提示要帮助用户理解当前知识点，但不能替用户讲完整课程。优先提示定义、核心公式、符号含义、直观图像、适用条件或一个最小例子。";

  return [
    "你是 AI费曼教室的提示模式助手。",
    "用户点击“提示”，说明当前 AI 学生问到的小问题用户也卡住了。你的任务是给一个短提示，再用一个小问题确认用户是否掌握。",
    "不要说“你给的提示”“我听懂了你的提示”。用户没有给提示，是在向你请求提示。",
    "提示控制在 2-5 句，面向大一到大二理工科学生，必须具体到当前问题。",
    "不要输出完整证明、完整题解或长篇讲义；只给用户重新开口讲解所需的关键抓手。",
    modeRule,
    "最后一句必须是确认问题，例如“你能用自己的话把这个定义里的极限过程复述一遍吗？”",
    "必须只输出 JSON 对象，不要 Markdown，不要代码块。",
    'JSON 结构：{"assistantText":"短提示 + 一个确认掌握的小问题","observations":[{"type":"提示后确认|概念漏洞|逻辑跳跃|公式条件|直观含义|前置知识|表达含混|题意建模","description":"提示后仍需要用户确认的具体点","question":"用户下一步要回答的小问题"}],"resolvedObservationIds":[]}',
  ].join("\n");
}

function buildChatSystemPrompt(task) {
  const modeRule =
    task.taskType === "题目讲解"
      ? [
          "用户正在讲一道题。重点检查：题意拆解、已知量和未知量、建模假设、变量和符号定义、公式/方程依据、适用条件、边界/初始条件、解题步骤跳跃、结果的量纲和含义。",
          "如果用户跳过建模、条件说明或公式来源就开始列式，优先追问方程为什么可以这样写。",
        ].join("\n")
      : [
          "用户正在讲一个知识点。重点检查：概念定义、定理/公式适用条件、变量含义、公式来源、前置知识、推导链条、直观解释、简单例子和应用边界。",
          "如果用户只给出公式或结论，优先追问条件、变量含义、来源或为什么能推出结论。",
        ].join("\n");

  return [
    "# 角色",
    "你是 AI费曼教室 产品中的 AI 学生。你的用户是理工科学生。",
    "你具备理工科学生常见的基础数学、物理和工程前置知识，但你还没有学会用户当前要讲的知识点或题目方法。",
    "你要真诚地向用户学习，用追问帮助用户发现自己讲解中的漏洞。你不是老师、裁判或标准答案生成器。",
    "",
    "# 产品目标",
    "让用户通过多轮讲解查缺补漏，而不是让你替用户讲课。",
    "回复保持学生口吻：可以说“我这里还没听懂”“这一步好像跳得有点快”“这个条件是不是还差一点”。",
    "不评分、不排名、不分等级、不输出考试化评价。",
    "",
    "# 你会收到的输入",
    "task：课程、模式和当前主题。",
    "task.materialContext：如果用户上传或粘贴了图片/PDF 学习材料，这里会包含材料中的关键知识点、公式、条件和自测问题。你可以据此追问，但不要直接替用户讲完。",
    "task.learningRoadmap：如果存在，这是当前主题拆解后的学习流程图。你要优先沿着这些小问题追问，避免宽泛地让用户“介绍一下”。",
    "task.roadmapProgress：如果存在，currentIndex 表示下一步应推进的流程图条目，completedIndexes 表示已经通过或跳过的条目。不要再追问 completedIndexes 对应的问题。",
    "activeObservations：之前仍未解决的观察点，可能带有 id。",
    "recentDialogue：最近几轮用户和 AI 学生的对话。",
    "latestExplanation：用户最新一轮讲解，这是本轮判断的主要依据。",
    "controlAction：如果用户点击了界面按钮，这里会说明动作类型。type=skip 表示用户认为当前问题太简单、已掌握；type=hint 表示用户也卡住了，需要你先给提示。",
    "",
    "# 按钮动作处理",
    "如果 controlAction.type 是 skip：把用户当作已经掌握当前小问题。latestExplanation 只是界面动作，不是用户讲解内容；不要检查它缺了什么，不要把“跳过/未讲”记录成理解漏洞。把相关 activeObservations 视为已经解决，直接进入学习流程图里的下一个小问题，或问一个更深一点的应用/边界问题。",
    "如果 controlAction.type 是 hint：用户是在向你要提示，不是已经给了提示。assistantText 必须先直接给 2-5 句必要讲解或提示，围绕 activeObservations 或最近一个 AI 问题说明关键抓手；不要说“你给的提示”。不要展开成长篇标准答案；最后必须提出一个很小的确认问题，让用户根据提示复述或应用。",
    "如果不是按钮动作，按正常费曼追问流程处理。",
    "",
    "# 每轮处理流程",
    "1. 先判断 latestExplanation 是否修正了 activeObservations 中的问题；如果修正了，把对应 id 放入 resolvedObservationIds，并在 assistantText 中自然承认这部分变清楚了。",
    "2. 再检查 latestExplanation 中最影响理解的 1-3 个新问题，只记录具体问题，不记录泛泛评价。",
    "3. assistantText 先简短复述你听到的内容，再指出最关键的卡点，并提出下一步最需要用户回答的问题。",
    "4. 如果用户的基础定义、条件和推理已经基本清楚，不要继续纠缠旧问题；改问证明思路、直观解释、应用例子或边界情况。",
    "5. 如果用户说法有误，用疑问方式挑战，例如“只有这个条件好像还不能推出结论吧？”不要直接展开完整标准答案。",
    "",
    "# 追问策略",
    modeRule,
    "面对很大的主题（例如“导数”“高斯定理”“几页 PDF 内容”），不要问“请介绍一下这个知识点”。要拆成小问题：先问它解决什么问题，再问核心公式/定义，再问符号条件、直观解释和应用边界。",
    "每次只问一个主问题，问题要让用户知道从哪里开口，例如“公式里的 Q 指的是哪一部分电荷？”比“讲讲高斯定理”更好。",
    "如果 task.learningRoadmap 存在，优先选择 task.roadmapProgress.currentIndex 对应的小问题继续推进；如果 currentIndex 不可用，再选择还没有被最近对话覆盖的小问题。",
    "每轮优先追问一个主问题，最多保留 1-3 个 observations。",
    "observations 只放本轮仍需要继续追问的问题；已经解决的问题只放入 resolvedObservationIds。",
    "如果没有发现新的明显漏洞，observations 返回空数组，并在 assistantText 中请用户举例、讲证明思路或解释应用场景。",
    "如果用户使用了不规范公式、LaTeX 片段、文字草图、图片或 PDF 学习材料，先按其大意理解；再追问变量含义、适用条件、坐标/参考方向、关系式来源或图像含义中缺失的部分。",
    "不要替用户完成整段证明、完整解题过程或标准答案；只有在指出问题时可以用一句话说明为什么当前说法不够。",
    "",
    "# 输出格式",
    "必须只输出 JSON 对象，不要 Markdown，不要代码块。",
    "controlAction.type=skip 时，resolvedObservationIds 尽量包含被跳过的当前 activeObservations 的 id；observations 只能记录下一步新问题本身，不允许出现“用户跳过了、尚未讲、没有说明”这类把跳过当成漏洞的描述。",
    "controlAction.type=hint 时，observations 可以保留当前待确认问题，不要把用户点击提示当作已经掌握。",
    'JSON 结构：{"assistantText":"AI 学生对用户的自然语言回应，包含具体追问","observations":[{"type":"概念漏洞|逻辑跳跃|公式条件|直观含义|前置知识|表达含混|题意建模","description":"本轮发现的具体问题","question":"下一步最需要用户回答的问题"}],"resolvedObservationIds":["本轮已经被用户修正的问题 id，没有则空数组"]}',
  ].join("\n");
}

function buildReportSystemPrompt(task) {
  const modeRule =
    task.taskType === "题目讲解"
      ? "报告要特别关注题意拆解、建模假设、公式/方程依据、适用条件、边界条件、解题步骤和结果解释。"
      : "报告要特别关注概念定义、公式条件、推导链条、直观解释、前置知识和例子。";

  return [
    "# 角色",
    "你是 AI费曼教室 产品中的学习诊断助手。你的任务是根据用户讲给 AI 学生听的过程生成学习诊断报告，不是打分或给标准答案。",
    "",
    "# 输入",
    "你会收到 task、observations 和完整 dialogue。dialogue 中包含 AI 学生的追问和用户多轮讲解。",
    "",
    "# 报告原则",
    "报告必须具体对应本次对话，不写空泛学习建议。",
    "区分仍未解决的问题和已经变清楚的部分：如果用户后续已经修正某个漏洞，应放入 clarifiedParts，而不是继续放入 mainGaps。",
    "不要评分、不要排名、不要给等级、不要使用通过/不通过判断。",
    "nextActions 要写成下一次可以直接照做的讲解任务，例如“先不用公式，口述这个定理为什么需要这些条件”。",
    modeRule,
    "",
    "# 输出格式",
    "必须只输出 JSON 对象，不要 Markdown，不要代码块。",
    'JSON 结构：{"topic":"本次讲解主题","mainGaps":["主要理解漏洞"],"logicJumps":["关键逻辑跳跃"],"clarifiedParts":["已经变清楚的部分"],"reviewTargets":["仍需复习的问题"],"nextActions":["下一次讲解建议"]}',
  ].join("\n");
}

function buildImageRecognitionSystemPrompt(task) {
  const modeRule =
    task.taskType === "题目讲解"
      ? "如果图片是题目草图，优先识别研究对象、已知条件、变量、约束、坐标/参考方向、角度、长度、边界或初始条件。"
      : "如果图片是知识点笔记，优先识别公式、定理陈述、符号定义、条件和简单图像关系。";

  return [
    "你是科学学习输入转写助手，服务于 AI费曼教室 产品。",
    "你的任务是把用户上传的手写公式、题目草图、实验图、结构图或笔记图片转成可编辑文本。",
    "只做识别、转写和客观描述；不要解题、不要证明、不要给学习建议、不要替用户补全推理。",
    modeRule,
    "公式识别优先级最高。只要图片里出现公式、等式、积分号、求和号、分式、上下标、向量点乘、希腊字母或物理量符号，就必须把它转写出来；不要只解释公式含义。",
    "recognizedText 必须包含图片中的公式和文字。若图片中同时有公式和说明文字，recognizedText 第一段写“公式：...”并转写公式，下一段再写说明文字。",
    "formulaLatex 必须填写图片中最主要公式的 LaTeX。只有图片里完全没有公式时，formulaLatex 才能为空。formulaLatex 字段不要包含 \\( \\) 或 $$ 定界符。",
    "例如看到高斯定律图片时，应把公式识别为类似：\\\\oint_S \\\\mathbf{E} \\\\cdot d\\\\mathbf{S} = \\\\frac{Q_{\\\\text{内}}}{\\\\varepsilon_0}，不能只输出“电场通量等于电荷量除以介电常数”的文字含义。",
    "如果 JSON 字符串里包含 LaTeX 反斜杠，请按 JSON 规范转义，例如把 \\xi 写成 \\\\xi，把 \\frac 写成 \\\\frac。",
    "图像或草图请用中文描述客观元素和关系，例如对象、变量、坐标方向、约束、角度、标注和关系式。",
    "如果某个符号、箭头或数字看不清，要在 uncertaintyNotes 中说明，不要猜成确定事实。",
    "必须只输出 JSON 对象，不要 Markdown，不要代码块。",
    'JSON 结构：{"recognizedText":"图片中可读文字或整体转写，没有则空字符串","formulaLatex":"最主要公式的 LaTeX，没有则空字符串","diagramDescription":"图像或草图的客观描述，没有则空字符串","uncertaintyNotes":["看不清或不确定的地方"]}',
  ].join("\n");
}

function buildPdfRecognitionSystemPrompt() {
  return [
    "你是 AI费曼教室 的课程材料整理助手。",
    "用户会上传教材节选、课件或论文式 PDF。你的任务不是讲课、不是给答案，而是把材料整理成低年级本科生可以按费曼学习法讲给 AI 学生听的知识点清单。",
    "",
    "# 识别原则",
    "优先提取概念、定理、公式、模型、适用条件、变量含义、推导链条、例子和前置知识。",
    "语言要适合大一到大二本科生：避免只给术语堆砌，要把每个知识点写成学生能开口讲的主题。",
    "不要编造 PDF 中没有依据的章节；如果材料不完整，可以在 cautions 中说明。",
    "不要输出标准答案、证明全文或长篇课程讲义。",
    "",
    "# 输出要求",
    "knowledgePoints 最多 8 个，按从基础到应用排序。",
    "每个 knowledgePoint 的 explanation 控制在 40 字以内，feynmanQuestion 写成学生自测时可以回答的一句话问题。",
    "taskContent 要适合直接放入“知识点讲解”输入框：包含文档主题、推荐讲解顺序和关键自测问题，控制在 1200 字以内。",
    "必须只输出 JSON 对象，不要 Markdown，不要代码块。",
    'JSON 结构：{"courseName":"推断的学科名称，无法推断则空字符串","documentTitle":"材料标题","overview":"一句话说明这份 PDF 主要讲什么","starterTopic":"建议第一个讲给 AI 学生听的知识点","taskContent":"可直接填入知识点输入框的系统化学习主题","knowledgePoints":[{"title":"知识点名称","explanation":"这个点要理解什么","prerequisite":"需要先会什么，没有则空字符串","formulas":["关键公式或符号，没有则空数组"],"feynmanQuestion":"讲给别人听时必须答出的检查问题"}],"suggestedSequence":["建议学习顺序"],"prerequisites":["共同前置知识"],"formulas":["核心公式"],"cautions":["材料不完整、扫描识别不清或需要人工确认之处"]}',
  ].join("\n");
}

function buildMaterialImageSystemPrompt() {
  return buildMaterialSystemPrompt([
    "输入是一张图片，可能是手写公式、板书、课件截图、教材截图、题目截图、实验图或结构草图。",
    "你要理解图片中的知识点、公式、变量、条件、图像关系和可能的学习任务。",
    "如果图片包含题目，只整理题意、已知条件、变量和建模线索，不要解题。",
    "如果图片包含手写或截图文字，可以做必要转写，但最终输出重点是 AI 学生需要掌握的学习上下文。",
  ]);
}

function buildMaterialPdfSystemPrompt() {
  return buildMaterialSystemPrompt([
    "输入是一份 PDF 中抽取出的文字，可能来自教材、课件、讲义或论文式材料。",
    "你要整理出低年级本科生可以系统学习并讲给 AI 学生听的知识点结构。",
    "如果材料很长，只抓最核心、最适合作为当前一次讲解主题的部分，不要生成整份课程大纲。",
  ]);
}

function buildMaterialScannedPdfSystemPrompt() {
  return buildMaterialSystemPrompt([
    "输入是一份扫描版或图片型 PDF 渲染出的若干页图片。",
    "你要像阅读课件截图或教材扫描页一样理解页面中的标题、公式、图示、题目、变量和条件。",
    "如果页面里只有部分章节内容，就只围绕可见页面生成学习上下文，不要假装看过未渲染页面。",
    "不要要求用户转换成文字版 PDF；你已经能直接处理这些页面截图。",
  ]);
}

function buildMaterialSystemPrompt(extraRules) {
  return [
    "你是 AI费曼教室的学习材料理解助手。",
    "你的任务不是给用户讲课、不是解题、不是输出标准答案，而是把图片或 PDF 材料转成 AI 学生后续追问所需的上下文。",
    "",
    "# 材料处理原则",
    ...extraRules,
    "面向大一到大二理工科本科生，优先提取概念、公式、变量含义、适用条件、前置知识、推导线索、直观解释和简单应用边界。",
    "如果用户已经有 currentTask，要把材料作为该任务的补充上下文；如果没有 currentTask，要生成一个适合创建 AI 学生的知识点讲解主题。",
    "不要生成需要用户编辑的 OCR 文本；输出应直接用于创建或补充 AI 学生对话。",
    "不要编造材料中没有依据的知识点；不确定之处放入 cautions。",
    "",
    "# 输出要求",
    "taskContent 要简洁，适合作为当前 AI 学生会话的主题，控制在 600 字以内。",
    "materialContext 是后续 AI 学生真正需要参考的材料上下文，控制在 1400 字以内，要包含关键知识点、公式、条件、变量和自测问题。",
    "starterQuestion 写成 AI 学生开场或收到补充材料后最自然追问用户的一句话。",
    "必须只输出 JSON 对象，不要 Markdown，不要代码块。",
    'JSON 结构：{"courseName":"推断的学科名称，无法推断则空字符串","documentTitle":"材料标题或主题","overview":"一句话概括材料","starterTopic":"最建议先讲的知识点","taskContent":"适合创建 AI 学生的主题描述","materialContext":"给 AI 学生使用的材料上下文","starterQuestion":"AI 学生接下来应该问用户的问题","knowledgePoints":[{"title":"知识点名称","explanation":"要理解什么","prerequisite":"前置知识，没有则空字符串","formulas":["关键公式或符号"],"feynmanQuestion":"学生讲解时应回答的问题"}],"suggestedSequence":["建议学习顺序"],"prerequisites":["共同前置知识"],"formulas":["核心公式"],"cautions":["需要人工确认之处"]}',
  ].join("\n");
}

function createParticipant(payload) {
  if (!payload?.consentAccepted) {
    throw httpError(400, "需要先同意匿名测评数据同步说明。");
  }

  const now = new Date().toISOString();
  const participantSecret = createSecret(24);
  const secretHash = hashSecret(participantSecret);
  const participant = {
    id: createId("participant"),
    publicCode: createPublicCode(),
    secretSalt: secretHash.salt,
    secretHash: secretHash.hash,
    consentAcceptedAt: now,
    consentVersion: String(payload.consentVersion || PRIVACY_CONSENT_VERSION),
    createdAt: now,
    updatedAt: now,
  };

  store.participants.push(participant);
  persistStore();

  return {
    participantId: participant.id,
    participantCode: participant.publicCode,
    participantSecret,
    consentVersion: participant.consentVersion,
  };
}

function requireParticipant(request) {
  const participantId = String(request.headers["x-participant-id"] || "");
  const participantSecret = String(request.headers["x-participant-secret"] || "");
  const participant = store.participants.find((item) => item.id === participantId);

  if (!participant || !verifySecret(participantSecret, participant.secretSalt, participant.secretHash)) {
    throw httpError(401, "匿名测试身份无效，请重新开启同步。");
  }

  return participant;
}

function requireAdmin(request) {
  if (!ADMIN_TOKEN) {
    throw httpError(503, "后台管理令牌未配置，请在环境变量中设置 ADMIN_TOKEN。");
  }

  const token =
    String(request.headers["x-admin-token"] || "") ||
    String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");

  if (!timingSafeEqualText(token, ADMIN_TOKEN)) {
    throw httpError(401, "后台管理令牌无效。");
  }
}

function createFeedback(payload, request) {
  const now = new Date().toISOString();
  const participant = requireParticipant(request);
  const contact = stringOrDefault(payload?.contact, "").slice(0, 240);
  const subscriptionFee = normalizeSubscriptionFee(payload?.subscriptionFee ?? payload?.monthlySubscriptionFee);
  const message = stringOrDefault(payload?.message, "").slice(0, 4000);
  const imageDataUrls = normalizeFeedbackImageDataUrls(payload);

  if (!subscriptionFee) {
    throw httpError(400, "请填写愿意每月支付的订阅费用。");
  }

  if (!message) {
    throw httpError(400, "请写下体验感受、需求或建议。");
  }

  imageDataUrls.forEach(validateImageDataUrl);

  const feedback = {
    id: createId("feedback"),
    contact,
    subscriptionFee,
    message,
    imageDataUrl: imageDataUrls[0] || "",
    imageDataUrls,
    imageMimeType: imageDataUrls[0] ? getImageDataUrlMimeType(imageDataUrls[0]) : "",
    imageMimeTypes: imageDataUrls.map(getImageDataUrlMimeType),
    context: normalizeFeedbackContext(payload?.context),
    participantId: participant.id,
    participantCode: participant.publicCode,
    createdAt: now,
  };

  store.feedbackRecords.unshift(feedback);
  participant.updatedAt = now;
  persistStore();

  return {
    ok: true,
    feedbackId: feedback.id,
  };
}

function normalizeSubscriptionFee(value) {
  const text = stringOrDefault(value, "").slice(0, 80);
  if (!text) return "";

  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) {
    throw httpError(400, "订阅费用需要是大于等于 0 的数字。");
  }

  return String(Math.round(amount * 100) / 100);
}

function normalizeFeedbackImageDataUrls(payload) {
  const urls = Array.isArray(payload?.imageDataUrls) ? payload.imageDataUrls : [];
  const legacyUrl = stringOrDefault(payload?.imageDataUrl, "");
  const normalized = [...urls, legacyUrl]
    .map((item) => stringOrDefault(item, ""))
    .filter(Boolean)
    .slice(0, MAX_FEEDBACK_IMAGES);
  return Array.from(new Set(normalized));
}

function getParticipantRecords(participantId) {
  return store.libraryRecords
    .filter((record) => record.participantId === participantId)
    .sort(sortByUpdatedAtDesc)
    .map(toClientRecord);
}

function upsertLibraryRecord(participant, inputRecord) {
  const now = new Date().toISOString();
  const record = normalizeStoredLibraryRecord(inputRecord, participant, now);
  const existingIndex = store.libraryRecords.findIndex(
    (item) => item.id === record.id && item.participantId === participant.id,
  );

  if (existingIndex >= 0) {
    record.createdAt = store.libraryRecords[existingIndex].createdAt || record.createdAt;
    store.libraryRecords.splice(existingIndex, 1, record);
  } else {
    store.libraryRecords.unshift(record);
  }

  participant.updatedAt = now;
  persistStore();

  return {
    ok: true,
    record: toClientRecord(record),
  };
}

function deleteLibraryRecord(participant, recordId) {
  const before = store.libraryRecords.length;
  store.libraryRecords = store.libraryRecords.filter(
    (record) => !(record.id === recordId && record.participantId === participant.id),
  );

  if (store.libraryRecords.length !== before) {
    participant.updatedAt = new Date().toISOString();
    persistStore();
  }

  return { ok: true };
}

function getAdminRecords() {
  const records = store.libraryRecords.slice().sort(sortByUpdatedAtDesc);
  const feedbackRecords = store.feedbackRecords.slice().sort(sortByCreatedAtDesc);
  const participantMap = new Map(store.participants.map((item) => [item.id, item]));
  const recordsByParticipant = groupBy(records, (record) => record.participantId);
  const feedbackByParticipant = groupBy(feedbackRecords, (feedback) => feedback.participantId);
  const participants = store.participants.map((participant) => ({
    id: participant.id,
    participantCode: participant.publicCode,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
    consentAcceptedAt: participant.consentAcceptedAt,
    consentVersion: participant.consentVersion,
    recordCount: records.filter((record) => record.participantId === participant.id).length,
    feedbackCount: feedbackRecords.filter((feedback) => feedback.participantId === participant.id).length,
  }));
  const users = store.participants
    .map((participant) => {
      const participantRecords = recordsByParticipant.get(participant.id) || [];
      const participantFeedbackRecords = feedbackByParticipant.get(participant.id) || [];
      return {
        id: participant.id,
        participantCode: participant.publicCode,
        createdAt: participant.createdAt,
        updatedAt: participant.updatedAt,
        consentAcceptedAt: participant.consentAcceptedAt,
        consentVersion: participant.consentVersion,
        recordCount: participantRecords.length,
        feedbackCount: participantFeedbackRecords.length,
        lastActivityAt: getLatestActivityAt(participant, participantRecords, participantFeedbackRecords),
        records: participantRecords.map((record) => toClientAdminRecord(record, participantMap)),
        feedbackRecords: participantFeedbackRecords.map((feedback) => toClientFeedback(feedback, participantMap)),
      };
    })
    .sort(sortUsersByActivityDesc);

  return {
    summary: {
      participantCount: store.participants.length,
      recordCount: records.length,
      reportCount: records.filter((record) => record.report).length,
      feedbackCount: feedbackRecords.length,
      feedbackUserCount: users.filter((user) => user.feedbackCount > 0).length,
      latestUpdatedAt: users[0]?.lastActivityAt || records[0]?.updatedAt || "",
    },
    participants,
    users,
    records: records.map((record) => toClientAdminRecord(record, participantMap)),
    feedbackRecords: feedbackRecords.map((feedback) => toClientFeedback(feedback, participantMap)),
  };
}

function toClientAdminRecord(record, participantMap) {
  return {
    ...toClientRecord(record),
    participantCode: participantMap.get(record.participantId)?.publicCode || "UNKNOWN",
  };
}

function toClientFeedback(feedback, participantMap) {
  return {
    id: feedback.id,
    contact: feedback.contact || "",
    subscriptionFee: feedback.subscriptionFee || "",
    message: feedback.message,
    imageDataUrl: feedback.imageDataUrl,
    imageDataUrls: Array.isArray(feedback.imageDataUrls)
      ? feedback.imageDataUrls
      : feedback.imageDataUrl
        ? [feedback.imageDataUrl]
        : [],
    imageMimeType: feedback.imageMimeType,
    imageMimeTypes: Array.isArray(feedback.imageMimeTypes) ? feedback.imageMimeTypes : [],
    context: feedback.context,
    participantCode:
      feedback.participantCode ||
      participantMap.get(feedback.participantId)?.publicCode ||
      "UNKNOWN",
    createdAt: feedback.createdAt,
  };
}

function groupBy(items, getKey) {
  const grouped = new Map();
  for (const item of items) {
    const key = getKey(item) || "";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  return grouped;
}

function getLatestActivityAt(participant, records, feedbackRecords) {
  const timestamps = [
    participant.updatedAt,
    participant.createdAt,
    ...records.map((record) => record.updatedAt || record.createdAt),
    ...feedbackRecords.map((feedback) => feedback.createdAt),
  ]
    .map((value) => new Date(value || 0).getTime())
    .filter((value) => Number.isFinite(value));
  const latest = Math.max(...timestamps, 0);
  return latest ? new Date(latest).toISOString() : "";
}

function sortUsersByActivityDesc(left, right) {
  return new Date(right.lastActivityAt || 0).getTime() - new Date(left.lastActivityAt || 0).getTime();
}

function sortByCreatedAtDesc(left, right) {
  return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
}

function normalizeStoredLibraryRecord(record, participant, now) {
  if (!record || typeof record !== "object") {
    throw httpError(400, "知识库记录格式不正确。");
  }

  const id = stringOrDefault(record.id, createId("record")).slice(0, 120);
  const task = normalizeTask(record.task || {});

  return {
    id,
    participantId: participant.id,
    title: stringOrDefault(record.title, `${task.courseName} · ${task.taskContent}`).slice(0, 160),
    task,
    messages: normalizeMessages(record.messages),
    observations: normalizeStoredObservations(record.observations),
    report: record.report && typeof record.report === "object" ? copyJson(record.report) : null,
    turn: Number(record.turn || countUserMessages(record.messages)),
    createdAt: stringOrDefault(record.createdAt, now),
    updatedAt: now,
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(0, 120).map((message) => ({
    role: message?.role === "user" ? "user" : "assistant",
    text: String(message?.text || "").slice(0, 8000),
    turn: Number(message?.turn || 0),
  }));
}

function normalizeStoredObservations(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 80).map((item) => ({
    id: String(item?.id || "").slice(0, 120),
    type: String(item?.type || "").slice(0, 80),
    description: String(item?.description || "").slice(0, 1000),
    question: String(item?.question || "").slice(0, 1000),
    status: item?.status === "resolved" ? "resolved" : "active",
    firstSeenTurn: Number(item?.firstSeenTurn || 0),
    resolvedTurn: Number(item?.resolvedTurn || 0),
  }));
}

function normalizeFeedbackContext(context) {
  const task = context?.task && typeof context.task === "object" ? normalizeTask(context.task) : null;
  const messages = normalizeMessages(context?.messages);

  return {
    screen: stringOrDefault(context?.screen, "").slice(0, 60),
    url: stringOrDefault(context?.url, "").slice(0, 300),
    userAgent: stringOrDefault(context?.userAgent, "").slice(0, 300),
    task,
    messages,
    observations: normalizeStoredObservations(context?.observations),
    report: context?.report && typeof context.report === "object" ? copyJson(context.report) : null,
    turn: Number(context?.turn || countUserMessages(messages)),
    libraryId: stringOrDefault(context?.libraryId, "").slice(0, 120),
  };
}

function toClientRecord(record) {
  return {
    id: record.id,
    title: record.title,
    task: record.task,
    messages: record.messages,
    observations: record.observations,
    report: record.report,
    turn: record.turn,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function loadDataStore() {
  if (!fs.existsSync(DATA_FILE)) {
    return { participants: [], libraryRecords: [], feedbackRecords: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      participants: Array.isArray(parsed.participants) ? parsed.participants : [],
      libraryRecords: Array.isArray(parsed.libraryRecords) ? parsed.libraryRecords : [],
      feedbackRecords: Array.isArray(parsed.feedbackRecords) ? parsed.feedbackRecords : [],
    };
  } catch {
    return { participants: [], libraryRecords: [], feedbackRecords: [] };
  }
}

function persistStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`;
}

function createPublicCode() {
  return `U-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function createSecret(byteLength) {
  return crypto.randomBytes(byteLength).toString("base64url");
}

function hashSecret(secret, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(secret), salt, 32).toString("hex");
  return { salt, hash };
}

function verifySecret(secret, salt, expectedHash) {
  if (!secret || !salt || !expectedHash) return false;
  const actualHash = hashSecret(secret, salt).hash;
  return timingSafeEqualText(actualHash, expectedHash);
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function countUserMessages(messages) {
  return Array.isArray(messages) ? messages.filter((message) => message?.role === "user").length : 0;
}

function sortByUpdatedAtDesc(left, right) {
  return new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime();
}

function copyJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function callZhipu(messages, options = {}) {
  const response = await fetch(ZHIPU_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ZHIPU_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ZHIPU_MODEL,
      messages,
      thinking: { type: "disabled" },
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: Number(options.maxTokens || 1600),
      stream: false,
      response_format: { type: "json_object" },
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    let detail = text;
    try {
      const errorBody = JSON.parse(text);
      detail = errorBody?.error?.message || errorBody?.message || text;
    } catch {
      // Keep raw response text.
    }
    throw httpError(response.status, `智谱 API 调用失败：${detail}`);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw httpError(502, "智谱 API 返回了无法解析的响应。");
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw httpError(502, "智谱 API 没有返回可用内容。");
  }
  return content;
}

async function callZhipuVision(messages, options = {}) {
  const response = await fetch(ZHIPU_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ZHIPU_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ZHIPU_VISION_MODEL,
      messages,
      thinking: { type: "disabled" },
      temperature: 0.1,
      top_p: 0.8,
      max_tokens: Number(options.maxTokens || 1400),
      stream: false,
      response_format: { type: "json_object" },
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    let detail = text;
    try {
      const errorBody = JSON.parse(text);
      detail = errorBody?.error?.message || errorBody?.message || text;
    } catch {
      // Keep raw response text.
    }
    throw httpError(response.status, `智谱视觉 API 调用失败：${detail}`);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw httpError(502, "智谱视觉 API 返回了无法解析的响应。");
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content) {
    throw httpError(502, "智谱视觉 API 没有返回可用内容。");
  }
  return content;
}

function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }
    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(data);
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_JSON_BYTES) {
        reject(httpError(413, "请求体过大。"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(httpError(400, "请求 JSON 无法解析。"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(text);
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,X-Participant-Id,X-Participant-Secret,X-Admin-Token,Authorization",
  );
}

function setSecurityHeaders(response) {
  if (HSTS_HEADER) {
    response.setHeader("Strict-Transport-Security", HSTS_HEADER);
  }
}

function enforceRateLimit(request, pathname = "") {
  const limits = getRateLimitConfig(pathname);
  const key = `${limits.bucketName}:${getClientIp(request)}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + limits.windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limits.max) {
    throw httpError(429, limits.message);
  }
}

function getRateLimitConfig(pathname) {
  if (pathname === "/api/transcribe") {
    return {
      bucketName: "transcribe",
      max: TRANSCRIBE_RATE_LIMIT_MAX,
      windowMs: TRANSCRIBE_RATE_LIMIT_WINDOW_MS,
      message: "语音转写请求过于频繁，请暂停一会儿再试。",
    };
  }

  return {
    bucketName: "api",
    max: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
    message: "请求过于频繁，请稍后再试。",
  };
}

function getClientIp(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || request.socket.remoteAddress || "unknown";
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const parsed = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertApiKey() {
  if (!ZHIPU_API_KEY) {
    throw httpError(500, "缺少 ZHIPU_API_KEY，请在 .env 中配置。");
  }
}

function parseJsonObject(content) {
  const cleaned = String(content)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const candidates = [cleaned];
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed) return parsed;

    const repaired = repairJsonStringBackslashes(candidate);
    if (repaired !== candidate) {
      const repairedParsed = tryParseJson(repaired);
      if (repairedParsed) return repairedParsed;
    }
  }

  throw httpError(502, "大模型返回的 JSON 格式无法解析。请重试一次图片识别。");
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function repairJsonStringBackslashes(text) {
  let output = "";
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (!inString) {
      if (char === '"') inString = true;
      output += char;
      continue;
    }

    if (char === '"') {
      inString = false;
      output += char;
      continue;
    }

    if (char !== "\\") {
      output += char;
      continue;
    }

    const next = text[index + 1] || "";
    const isSimpleEscape = ['"', "\\", "/", "b", "f", "n", "r", "t"].includes(next);
    const isUnicodeEscape = next === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(index + 2, index + 6));
    if (isSimpleEscape || isUnicodeEscape) {
      output += `\\${next}`;
      index += 1;
    } else {
      output += "\\\\";
    }
  }

  return output;
}

function normalizeLatexText(value) {
  return stringOrDefault(value, "")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\f/g, "\\f")
    .replace(/\u0008/g, "\\b");
}

function normalizeControlAction(value) {
  if (!value || typeof value !== "object") return { type: "" };
  const type = String(value.type || "").trim().toLowerCase();
  if (!["skip", "hint"].includes(type)) return { type: "" };
  return {
    type,
    resolvedObservationIds: Array.isArray(value.resolvedObservationIds)
      ? value.resolvedObservationIds.map(String).filter(Boolean).slice(0, 12)
      : [],
  };
}

function normalizeRoadmapItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        const text = item.trim();
        return {
          title: text,
          question: text,
          focus: "",
        };
      }

      return {
        title: stringOrDefault(item?.title || item?.name, ""),
        question: stringOrDefault(item?.question || item?.feynmanQuestion || item?.description, ""),
        focus: stringOrDefault(item?.focus || item?.explanation, ""),
      };
    })
    .filter((item) => item.title || item.question)
    .map((item, index) => ({
      title: item.title || `第 ${index + 1} 步`,
      question: item.question || item.title,
      focus: item.focus,
    }))
    .slice(0, 7);
}

function buildFallbackRoadmap(task) {
  const topic = stringOrDefault(task?.taskContent, "这个主题").replace(/[「」]/g, "").slice(0, 40);
  if (task?.taskType === "题目讲解") {
    return [
      { title: "题意拆解", question: "这道题要求什么，已知条件和未知量分别是什么？", focus: "先把问题对象讲清楚。" },
      { title: "建模依据", question: "你准备选哪些变量、坐标或方程，为什么可以这样建模？", focus: "检查建模不是直接套公式。" },
      { title: "公式条件", question: "用到的公式或定理需要哪些适用条件？题目里满足了吗？", focus: "防止公式依据缺失。" },
      { title: "步骤衔接", question: "从上一步到下一步，中间省略了哪条推理？", focus: "把计算链条补完整。" },
      { title: "结果解释", question: "最后结果的单位、方向、范围或物理意义合理吗？", focus: "回到题目检查答案。" },
    ];
  }

  return [
    { title: "问题定位", question: `${topic}主要想解决什么问题，或者描述什么关系？`, focus: "先说它为什么会被提出。" },
    { title: "核心表述", question: `${topic}的定义、基本公式或定理表述是什么？`, focus: "用一句准确的话立住概念。" },
    { title: "符号条件", question: "公式里的量分别代表什么，它在什么条件下才能用？", focus: "拆清变量、对象和适用范围。" },
    { title: "直观理解", question: "如果暂时不用公式，你会怎样直观解释它为什么合理？", focus: "检验是否只是背了形式。" },
    { title: "简单应用", question: `遇到一个具体例子时，你会怎样判断能不能用${topic}，第一步做什么？`, focus: "把概念落到操作步骤。" },
  ];
}

function buildFallbackHintText(task, currentQuestion) {
  const topic = stringOrDefault(task?.taskContent, "这个主题").replace(/[「」]/g, "").slice(0, 40);
  const question = stringOrDefault(currentQuestion, "");
  if (task?.taskType === "题目讲解") {
    return `我先给你一个提示：先别急着列式，把题目里的已知量、未知量和适用条件分开写。然后再看你准备用的公式，逐项对应到题目条件里。针对刚才这个问题：${question || "你能先说出这道题的已知量和未知量吗？"}`;
  }

  return `我先给你一个抓手：讲${topic}时，可以先说它解决的关系，再给出最核心的定义或公式，最后解释公式里的符号和适用条件。不要一开始铺开全部内容，先把一个最小定义讲准。针对刚才这个问题，你能用自己的话说出${topic}的核心定义或公式吗？`;
}

function normalizeTask(task) {
  const learningRoadmap = normalizeRoadmapItems(task?.learningRoadmap);
  return {
    courseName: stringOrDefault(task?.courseName, "未命名学科"),
    taskType: task?.taskType === "题目讲解" ? "题目讲解" : "知识点讲解",
    taskContent: stringOrDefault(task?.taskContent, "当前主题"),
    materialContext: stringOrDefault(task?.materialContext, "").slice(0, 5000),
    roadmapOverview: stringOrDefault(task?.roadmapOverview, "").slice(0, 800),
    learningRoadmap,
    roadmapProgress: normalizeRoadmapProgress(task?.roadmapProgress, learningRoadmap.length),
  };
}

function normalizeRoadmapProgress(progress, roadmapLength) {
  const completedIndexes = Array.isArray(progress?.completedIndexes)
    ? Array.from(
        new Set(
          progress.completedIndexes
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item >= 0 && item < roadmapLength),
        ),
      ).sort((left, right) => left - right)
    : [];
  let currentIndex = Number(progress?.currentIndex);
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= roadmapLength || completedIndexes.includes(currentIndex)) {
    currentIndex = Array.from({ length: roadmapLength }, (_, index) => index).find((index) => !completedIndexes.includes(index));
  }

  return {
    currentIndex: Number.isInteger(currentIndex) ? currentIndex : -1,
    completedIndexes,
  };
}

function normalizeObservations(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      type: stringOrDefault(item.type, "理解漏洞"),
      description: stringOrDefault(item.description, ""),
      question: stringOrDefault(item.question, ""),
      status: "active",
    }))
    .filter((item) => item.description || item.question)
    .slice(0, 4);
}

function filterControlActionObservations(items, actionType) {
  if (actionType !== "skip") return items;
  return items.filter((item) => {
    const text = `${item.description || ""}\n${item.question || ""}`;
    return !/跳过|尚未|未给出|没有说明|没有讲|缺少讲解/.test(text);
  });
}

function isSupportedImageDataUrl(value) {
  return /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
}

function isSupportedPdfDataUrl(value) {
  return /^data:application\/pdf(?:;[^,]*)?;base64,[A-Za-z0-9+/=]+$/i.test(value);
}

function validateImageDataUrl(value) {
  if (!isSupportedImageDataUrl(value)) {
    throw httpError(400, "请上传 png、jpg、jpeg 或 webp 图片。");
  }

  const approxBytes = Math.ceil((String(value).split(",")[1] || "").length * 0.75);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw httpError(413, "图片不能超过 5MB。");
  }
}

function getImageDataUrlMimeType(value) {
  return String(value).match(/^data:([^;]+);base64,/i)?.[1] || "";
}

function stripImageDataUrlPrefix(value) {
  return String(value).replace(/^data:image\/(png|jpe?g|webp);base64,/i, "");
}

function normalizeExtractedPdfText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function buildPdfRecognitionText(text) {
  if (text.length <= PDF_RECOGNITION_TEXT_LIMIT) return text;

  const introLength = Math.floor(PDF_RECOGNITION_TEXT_LIMIT * 0.62);
  const tailLength = Math.floor(PDF_RECOGNITION_TEXT_LIMIT * 0.18);
  const headingLength = PDF_RECOGNITION_TEXT_LIMIT - introLength - tailLength - 800;
  const headingText = extractLikelyPdfHeadings(text).join("\n").slice(0, Math.max(0, headingLength));

  return [
    text.slice(0, introLength),
    "\n\n[PDF 中疑似目录或标题]\n",
    headingText || "未提取到明显标题。",
    "\n\n[PDF 末尾节选]\n",
    text.slice(-tailLength),
  ]
    .join("")
    .slice(0, PDF_RECOGNITION_TEXT_LIMIT);
}

function extractLikelyPdfHeadings(text) {
  const seen = new Set();
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => {
      if (line.length < 4 || line.length > 90) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^[-–—]*\s*\d+\s+of\s+\d+\s*[-–—]*$/i.test(line)) return false;
      return (
        /^(\d+(\.\d+){0,3}|第[一二三四五六七八九十百]+[章节讲])\s+/.test(line) ||
        /^(chapter|section|lecture|unit|part)\s+\d+/i.test(line) ||
        /(定理|定义|公式|原理|模型|方法|推导|应用|例题|实验|总结)$/.test(line)
      );
    })
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 90);
}

function normalizeKnowledgePointItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") {
        return {
          title: item.trim(),
          explanation: "",
          prerequisite: "",
          formulas: [],
          feynmanQuestion: "",
        };
      }

      return {
        title: stringOrDefault(item?.title, ""),
        explanation: stringOrDefault(item?.explanation, ""),
        prerequisite: stringOrDefault(item?.prerequisite, ""),
        formulas: normalizeStringArray(item?.formulas, []),
        feynmanQuestion: stringOrDefault(item?.feynmanQuestion, ""),
      };
    })
    .filter((item) => item.title)
    .slice(0, 8);
}

function normalizeMaterialPreparation(parsed, fallback = {}) {
  const knowledgePoints = normalizeKnowledgePointItems(parsed?.knowledgePoints);
  const suggestedSequence = normalizeStringArray(parsed?.suggestedSequence, []);
  const prerequisites = normalizeStringArray(parsed?.prerequisites, []);
  const formulas = normalizeStringArray(parsed?.formulas, []);
  const cautions = normalizeStringArray(parsed?.cautions, []);
  const documentTitle = stringOrDefault(parsed?.documentTitle, fallback.fileName || "上传材料");
  const overview = stringOrDefault(parsed?.overview, "已理解上传材料中的学习内容。");
  const starterTopic = stringOrDefault(parsed?.starterTopic, knowledgePoints[0]?.title || documentTitle);
  const materialContext = stringOrDefault(
    parsed?.materialContext,
    buildMaterialContext({ documentTitle, overview, knowledgePoints, suggestedSequence, prerequisites, formulas, cautions }),
  );
  const taskContent = stringOrDefault(
    parsed?.taskContent,
    buildPdfTaskContent({ documentTitle, overview }, knowledgePoints, suggestedSequence),
  );

  return {
    materialType: fallback.materialType || "material",
    courseName: stringOrDefault(parsed?.courseName, fallback.courseHint || ""),
    documentTitle,
    overview,
    starterTopic,
    taskContent,
    materialContext,
    starterQuestion: stringOrDefault(
      parsed?.starterQuestion,
      `我已经看过这份材料了。你能先用自己的话讲讲「${starterTopic}」主要在说什么吗？`,
    ),
    knowledgePoints,
    suggestedSequence,
    prerequisites,
    formulas,
    cautions,
    fileName: fallback.fileName || "",
    pageCount: Number(fallback.pageCount || 0),
    extractedCharCount: Number(fallback.extractedCharCount || 0),
  };
}

function materialToPdfRecognition(material) {
  return {
    courseName: material.courseName || "",
    documentTitle: material.documentTitle || material.fileName || "扫描版 PDF",
    overview: material.overview || "已从扫描版 PDF 页面中识别出可用于讲解的知识点。",
    starterTopic: material.starterTopic || material.knowledgePoints?.[0]?.title || "",
    taskContent: material.taskContent || material.materialContext || "",
    knowledgePoints: material.knowledgePoints || [],
    suggestedSequence: material.suggestedSequence || [],
    prerequisites: material.prerequisites || [],
    formulas: material.formulas || [],
    cautions: material.cautions || [],
    extractedCharCount: material.extractedCharCount || 0,
    pageCount: material.pageCount || 0,
  };
}

function buildMaterialContext({ documentTitle, overview, knowledgePoints, suggestedSequence, prerequisites, formulas, cautions }) {
  const lines = [`材料：${documentTitle}`, `概览：${overview}`];

  if (knowledgePoints.length) {
    lines.push(
      "关键知识点：",
      ...knowledgePoints.map((item, index) => {
        const parts = [`${index + 1}. ${item.title}`];
        if (item.explanation) parts.push(item.explanation);
        if (item.prerequisite) parts.push(`前置：${item.prerequisite}`);
        if (item.formulas?.length) parts.push(`公式：${item.formulas.join("；")}`);
        if (item.feynmanQuestion) parts.push(`自测：${item.feynmanQuestion}`);
        return parts.join("；");
      }),
    );
  }

  if (suggestedSequence.length) lines.push(`学习顺序：${suggestedSequence.join(" -> ")}`);
  if (prerequisites.length) lines.push(`共同前置知识：${prerequisites.join("；")}`);
  if (formulas.length) lines.push(`核心公式：${formulas.join("；")}`);
  if (cautions.length) lines.push(`需要确认：${cautions.join("；")}`);

  return lines.join("\n").slice(0, 1400);
}

function buildPdfTaskContent(parsed, knowledgePoints, suggestedSequence) {
  const lines = [
    `PDF主题：${stringOrDefault(parsed?.documentTitle, "上传的课程材料")}`,
    stringOrDefault(parsed?.overview, ""),
  ].filter(Boolean);

  if (knowledgePoints.length) {
    lines.push(
      "建议按这个顺序讲清楚：",
      ...knowledgePoints.map((item, index) => `${index + 1}. ${item.title}${item.explanation ? `：${item.explanation}` : ""}`),
    );
  } else if (suggestedSequence.length) {
    lines.push("建议按这个顺序讲清楚：", ...suggestedSequence.map((item, index) => `${index + 1}. ${item}`));
  }

  const questions = knowledgePoints.map((item) => item.feynmanQuestion).filter(Boolean).slice(0, 4);
  if (questions.length) {
    lines.push("自测问题：", ...questions.map((item) => `- ${item}`));
  }

  return lines.join("\n").slice(0, 1200);
}

function normalizeStringArray(items, fallback) {
  if (!Array.isArray(items)) return fallback;
  const normalized = items.map((item) => String(item || "").trim()).filter(Boolean);
  return normalized.length ? normalized : fallback;
}

function stringOrDefault(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}
