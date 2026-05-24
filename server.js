const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

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

async function createFollowUp(payload) {
  assertApiKey();
  const task = normalizeTask(payload.task);
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const observations = Array.isArray(payload.observations) ? payload.observations : [];
  const latest = String(payload.latestExplanation || "").trim();

  if (!latest) {
    throw httpError(400, "讲解内容不能为空。");
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
        },
        null,
        2,
      ),
    },
  ]);

  const parsed = parseJsonObject(response);
  return {
    assistantText:
      typeof parsed.assistantText === "string" && parsed.assistantText.trim()
        ? parsed.assistantText.trim()
        : "我还有些地方没有完全听懂。你能把关键概念、推导依据和物理意义再拆开讲一遍吗？",
    observations: normalizeObservations(parsed.observations),
    resolvedObservationIds: Array.isArray(parsed.resolvedObservationIds)
      ? parsed.resolvedObservationIds.map(String)
      : [],
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
    "activeObservations：之前仍未解决的观察点，可能带有 id。",
    "recentDialogue：最近几轮用户和 AI 学生的对话。",
    "latestExplanation：用户最新一轮讲解，这是本轮判断的主要依据。",
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
    "每轮优先追问一个主问题，最多保留 1-3 个 observations。",
    "observations 只放本轮仍需要继续追问的问题；已经解决的问题只放入 resolvedObservationIds。",
    "如果没有发现新的明显漏洞，observations 返回空数组，并在 assistantText 中请用户举例、讲证明思路或解释应用场景。",
    "如果用户使用了不规范公式、LaTeX 片段、文字草图或图片识别结果，先按其大意理解；再追问变量含义、适用条件、坐标/参考方向、关系式来源或图像含义中缺失的部分。",
    "不要替用户完成整段证明、完整解题过程或标准答案；只有在指出问题时可以用一句话说明为什么当前说法不够。",
    "",
    "# 输出格式",
    "必须只输出 JSON 对象，不要 Markdown，不要代码块。",
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

async function callZhipu(messages) {
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
      max_tokens: 1600,
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

async function callZhipuVision(messages) {
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
      max_tokens: 1400,
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

function normalizeTask(task) {
  return {
    courseName: stringOrDefault(task?.courseName, "未命名学科"),
    taskType: task?.taskType === "题目讲解" ? "题目讲解" : "知识点讲解",
    taskContent: stringOrDefault(task?.taskContent, "当前主题"),
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

function isSupportedImageDataUrl(value) {
  return /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(value);
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
