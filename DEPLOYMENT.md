# 稳定部署说明

当前本地地址 `http://127.0.0.1:5173` 只适合开发机自测。给多名用户测评时，应部署到正式托管平台，并使用 HTTPS 稳定域名。

## 推荐方案：Render

项目已包含 `render.yaml`，可以作为 Render Blueprint 部署。

需要在 Render 环境变量中配置：

- `ZHIPU_API_KEY`：智谱 API key
- `ZHIPU_MODEL`：默认 `glm-5.1`
- `ZHIPU_VISION_MODEL`：默认 `glm-4.5v`
- `ADMIN_TOKEN`：后台管理令牌，建议使用 32 字节以上随机字符串
- `ALLOWED_ORIGINS`：正式域名，例如 `https://your-app.onrender.com`

部署后访问：

- 用户端：`https://your-app.onrender.com/`
- 管理后台：`https://your-app.onrender.com/admin.html`
- 健康检查：`https://your-app.onrender.com/api/health`

## 数据与隐私

- 用户端默认仍会把知识库保存在浏览器本机。
- 用户勾选匿名测评同步后，知识库记录会同步到后端。
- 后端只保存匿名测试码、讲解记录、追问记录和诊断报告。
- 管理后台必须使用 `ADMIN_TOKEN` 才能查看。
- `data/` 目录已加入 `.gitignore`，不要提交真实测评数据。

## 本地运行

```powershell
npm install
npm start
```

访问 `http://127.0.0.1:5173`。

## 当前生产服务器

生产交接信息见 [SERVER_HANDOFF.md](./SERVER_HANDOFF.md)。该文件记录服务器、域名、Docker、Nginx、证书、数据目录和同步流程，但不记录密钥。

## 本地 / Git / 服务器同步

默认以本地仓库为代码源。

1. 本地修改代码。
2. 运行检查：

```powershell
npm run check
```

3. 提交到 git：

```powershell
git add .
git commit -m "your message"
```

4. 如果已配置远程仓库，再推送：

```powershell
git push
```

5. 部署到服务器：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
```

6. 检查线上状态：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/server-status.ps1
```

注意：`.env`、SSH 私钥、生产数据目录 `data/` 不进入 git。服务器上的生产环境变量保存在 `/opt/ai-assist-interview/.env`，测评数据保存在 `/opt/ai-assist-interview/data`。
