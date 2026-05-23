const ADMIN_TOKEN_STORAGE_KEY = "mechanics-feynman-admin-token";

const elements = {
  tokenInput: document.querySelector("#adminTokenInput"),
  loadButton: document.querySelector("#loadAdminButton"),
  status: document.querySelector("#adminStatus"),
  stats: document.querySelector("#adminStats"),
  users: document.querySelector("#adminUserRecords"),
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
    renderUserRecords(body.users || []);
    showStatus("调研数据已更新。");
  } catch (error) {
    renderStats({});
    renderUserRecords([]);
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
      <span>有反馈用户</span>
      <strong>${Number(summary.feedbackUserCount || 0)}</strong>
    </article>
    <article class="admin-stat-card">
      <span>最近同步</span>
      <strong>${escapeHtml(formatDate(summary.latestUpdatedAt))}</strong>
    </article>
  `;
}

function renderUserRecords(users) {
  if (!users.length) {
    elements.users.innerHTML = `<div class="library-empty-state">暂无同步用户。</div>`;
    return;
  }

  elements.users.innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">用户视图</p>
      <h2>按用户汇总</h2>
    </div>
    ${users.map(renderUserSection).join("")}
  `;
}

function renderUserSection(user) {
  const feedbackRecords = Array.isArray(user.feedbackRecords) ? user.feedbackRecords : [];
  const records = Array.isArray(user.records) ? user.records : [];

  return `
    <article class="admin-user-section">
      <div class="admin-user-header">
        <div>
          <div class="tag-row">
            <span class="tag">${escapeHtml(user.participantCode || "UNKNOWN")}</span>
            <span class="tag neutral">${Number(user.recordCount || records.length)} 条对话</span>
            <span class="tag neutral">${Number(user.feedbackCount || feedbackRecords.length)} 条反馈</span>
          </div>
          <h3>${escapeHtml(user.participantCode || "匿名用户")}</h3>
          <p>${escapeHtml(formatDate(user.lastActivityAt || user.updatedAt || user.createdAt))} 最近活动</p>
        </div>
      </div>

      <div class="admin-user-grid">
        <section class="admin-user-column">
          <div class="library-section-heading">
            <h3>反馈全流程</h3>
            <span>${feedbackRecords.length} 条</span>
          </div>
          ${renderUserFeedback(feedbackRecords)}
        </section>

        <section class="admin-user-column">
          <div class="library-section-heading">
            <h3>对话流程</h3>
            <span>${records.length} 条</span>
          </div>
          ${renderUserConversations(records)}
        </section>
      </div>
    </article>
  `;
}

function renderUserFeedback(feedbackRecords) {
  if (!feedbackRecords.length) {
    return `<div class="library-empty-state">该用户还没有提交反馈。</div>`;
  }

  return feedbackRecords.map(renderFeedbackEntry).join("");
}

function renderFeedbackEntry(feedback) {
  const task = feedback.context?.task;
  const contextText = [
    feedback.context?.screen ? `页面：${feedback.context.screen}` : "",
    task?.taskContent ? `主题：${task.taskContent}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <article class="admin-entry feedback-record-card">
      <div class="library-record-header">
        <div>
          <div class="tag-row">
            <span class="tag neutral">${escapeHtml(formatDate(feedback.createdAt))}</span>
            <span class="tag">${escapeHtml(formatSubscriptionFee(feedback.subscriptionFee))}</span>
          </div>
          <h4>${escapeHtml(contextText || "未记录上下文")}</h4>
        </div>
      </div>
      <div class="feedback-record-body">
        <dl class="feedback-meta-list">
          <div>
            <dt>联系方式</dt>
            <dd>${escapeHtml(feedback.contact || "未填写")}</dd>
          </div>
          <div>
            <dt>订阅意愿</dt>
            <dd>${escapeHtml(formatSubscriptionFee(feedback.subscriptionFee))}</dd>
          </div>
        </dl>
        <p>${escapeHtml(feedback.message || "用户未填写文字反馈。")}</p>
        ${renderFeedbackImages(feedback)}
        ${renderFeedbackDialogue(feedback.context?.messages || [])}
      </div>
    </article>
  `;
}

function renderUserConversations(records) {
  if (!records.length) {
    return `<div class="library-empty-state">该用户还没有同步对话。</div>`;
  }

  return records.map(renderConversationEntry).join("");
}

function renderConversationEntry(record) {
  return `
    <article class="admin-entry">
      <div class="library-record-header">
        <div>
          <div class="tag-row">
            <span class="tag neutral">${escapeHtml(record.task?.courseName || "未命名学科")}</span>
            <span class="tag neutral">${escapeHtml(record.task?.taskType || "未命名类型")}</span>
            <span class="tag">${Number(record.turn || 0)} 轮</span>
          </div>
          <h4>${escapeHtml(record.title || "未命名记录")}</h4>
          <p>${escapeHtml(formatDate(record.updatedAt))} 同步</p>
        </div>
      </div>
      ${renderReportSummary(record.report)}
      ${renderFeedbackDialogue(record.messages || [], "完整对话流程")}
    </article>
  `;
}

function renderReportSummary(report) {
  if (!report) {
    return `<div class="library-empty-state">这条对话还没有生成诊断报告。</div>`;
  }

  return `
    <section class="admin-report-summary">
      <div class="library-section-heading">
        <h3>诊断摘要</h3>
      </div>
      ${renderList(normalizeList(report.mainGaps).slice(0, 3).length ? normalizeList(report.mainGaps).slice(0, 3) : ["暂无主要漏洞。"])}
    </section>
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

function renderFeedbackDialogue(messages, title = "提交时完整对话") {
  if (!Array.isArray(messages) || !messages.length) {
    return `<div class="library-empty-state">${escapeHtml(title)}为空。</div>`;
  }

  return `
    <section class="feedback-dialogue">
      <div class="library-section-heading">
        <h3>${escapeHtml(title)}</h3>
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

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function normalizeList(items) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function formatSubscriptionFee(value) {
  if (value === 0 || value === "0") return "0 元/月";
  if (!value) return "未填写";
  return `${value} 元/月`;
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
