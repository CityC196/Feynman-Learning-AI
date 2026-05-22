const ADMIN_TOKEN_STORAGE_KEY = "mechanics-feynman-admin-token";

const elements = {
  tokenInput: document.querySelector("#adminTokenInput"),
  loadButton: document.querySelector("#loadAdminButton"),
  status: document.querySelector("#adminStatus"),
  stats: document.querySelector("#adminStats"),
  feedbackRecords: document.querySelector("#adminFeedbackRecords"),
  records: document.querySelector("#adminRecords"),
};

elements.tokenInput.value = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
elements.loadButton.addEventListener("click", loadAdminRecords);
elements.tokenInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadAdminRecords();
});

if (elements.tokenInput.value) {
  void loadAdminRecords();
}

async function loadAdminRecords() {
  const token = elements.tokenInput.value.trim();
  if (!token) {
    showStatus("请输入后台令牌。", true);
    elements.tokenInput.focus();
    return;
  }

  elements.loadButton.disabled = true;
  showStatus("正在加载调研数据...");

  try {
    const response = await fetch("/api/admin/records", {
      headers: { "X-Admin-Token": token },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "后台数据加载失败。");

    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    renderStats(body.summary || {});
    renderFeedbackRecords(body.feedbackRecords || []);
    renderRecords(body.records || []);
    showStatus("调研数据已更新。");
  } catch (error) {
    renderStats({});
    renderFeedbackRecords([]);
    renderRecords([]);
    showStatus(error.message || "后台数据加载失败。", true);
  } finally {
    elements.loadButton.disabled = false;
  }
}

function renderStats(summary) {
  elements.stats.innerHTML = `
    <article class="admin-stat-card">
      <span>测试用户</span>
      <strong>${Number(summary.participantCount || 0)}</strong>
    </article>
    <article class="admin-stat-card">
      <span>知识库记录</span>
      <strong>${Number(summary.recordCount || 0)}</strong>
    </article>
    <article class="admin-stat-card">
      <span>诊断报告</span>
      <strong>${Number(summary.reportCount || 0)}</strong>
    </article>
    <article class="admin-stat-card">
      <span>用户反馈</span>
      <strong>${Number(summary.feedbackCount || 0)}</strong>
    </article>
    <article class="admin-stat-card">
      <span>最近同步</span>
      <strong>${escapeHtml(formatDate(summary.latestUpdatedAt))}</strong>
    </article>
  `;
}

function renderFeedbackRecords(feedbackRecords) {
  if (!feedbackRecords.length) {
    elements.feedbackRecords.innerHTML = `<div class="library-empty-state">暂无用户反馈。</div>`;
    return;
  }

  elements.feedbackRecords.innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">用户反馈</p>
      <h2>问题与建议</h2>
    </div>
    ${feedbackRecords
      .map((feedback) => {
        const task = feedback.context?.task;
        const contextText = [
          feedback.context?.screen ? `页面：${feedback.context.screen}` : "",
          task?.taskContent ? `主题：${task.taskContent}` : "",
        ]
          .filter(Boolean)
          .join(" · ");

        return `
          <article class="admin-record-card feedback-record-card">
            <div class="library-record-header">
              <div>
                <div class="tag-row">
                  <span class="tag">${escapeHtml(feedback.participantCode || "UNKNOWN")}</span>
                  <span class="tag neutral">${escapeHtml(formatDate(feedback.createdAt))}</span>
                </div>
                <h3>${escapeHtml(contextText || "未记录上下文")}</h3>
              </div>
            </div>
            <div class="feedback-record-body">
              <p>${escapeHtml(feedback.message || "用户只提交了截图。")}</p>
              ${renderFeedbackImages(feedback)}
              ${renderFeedbackDialogue(feedback.context?.messages || [])}
            </div>
          </article>
        `;
      })
      .join("")}
  `;
}

function renderFeedbackImages(feedback) {
  const images = Array.isArray(feedback.imageDataUrls) && feedback.imageDataUrls.length
    ? feedback.imageDataUrls
    : feedback.imageDataUrl
      ? [feedback.imageDataUrl]
      : [];

  if (!images.length) return "";

  return `
    <div class="feedback-image-list">
      ${images
        .map(
          (imageDataUrl, index) => `
            <figure class="feedback-image-item">
              <img src="${escapeHtml(imageDataUrl)}" alt="用户反馈截图 ${index + 1}" />
              <figcaption>截图 ${index + 1}</figcaption>
            </figure>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderFeedbackDialogue(messages) {
  if (!Array.isArray(messages) || !messages.length) {
    return `<div class="library-empty-state">提交反馈时没有可附带的对话记录。</div>`;
  }

  return `
    <section class="feedback-dialogue">
      <div class="library-section-heading">
        <h3>提交时完整对话</h3>
        <span>${messages.length} 条消息</span>
      </div>
      <div class="feedback-dialogue-list">
        ${messages
          .map((message) => {
            const isUser = message.role === "user";
            const roleLabel = isUser
              ? `用户第 ${Number(message.turn || 0)} 轮讲解`
              : Number(message.turn || 0) === 0
                ? "AI 学生开场"
                : "AI 学生追问";
            return `
              <article class="feedback-dialogue-message ${isUser ? "user" : "assistant"}">
                <strong>${escapeHtml(roleLabel)}</strong>
                <p>${escapeHtml(message.text || "")}</p>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderRecords(records) {
  if (!records.length) {
    elements.records.innerHTML = `<div class="library-empty-state">暂无同步记录。</div>`;
    return;
  }

  elements.records.innerHTML = records
    .map((record) => {
      const report = record.report || {};
      const gaps = normalizeList(report.mainGaps).slice(0, 3);
      const actions = normalizeList(report.nextActions).slice(0, 2);
      const lastUserMessage = [...(record.messages || [])].reverse().find((message) => message.role === "user");

      return `
        <article class="admin-record-card">
          <div class="library-record-header">
            <div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(record.participantCode || "UNKNOWN")}</span>
                <span class="tag neutral">${escapeHtml(record.task?.courseName || "未命名学科")}</span>
                <span class="tag neutral">${escapeHtml(record.task?.taskType || "未命名类型")}</span>
              </div>
              <h3>${escapeHtml(record.title || "未命名记录")}</h3>
              <p>${escapeHtml(formatDate(record.updatedAt))} 同步 · ${Number(record.turn || 0)} 轮讲解</p>
            </div>
          </div>

          <div class="admin-record-grid">
            <section class="library-section">
              <div class="library-section-heading">
                <h3>最近讲解</h3>
              </div>
              <p>${escapeHtml(lastUserMessage?.text || "暂无用户讲解。")}</p>
            </section>

            <section class="library-section">
              <div class="library-section-heading">
                <h3>主要漏洞</h3>
              </div>
              ${renderList(gaps.length ? gaps : ["暂无诊断报告。"])}
            </section>

            <section class="library-section">
              <div class="library-section-heading">
                <h3>下一步任务</h3>
              </div>
              ${renderList(actions.length ? actions : ["暂无下一步任务。"])}
            </section>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function normalizeList(items) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function showStatus(message, isError = false) {
  elements.status.hidden = false;
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function formatDate(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
