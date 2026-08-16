# 诗词管理系统（Poem Manager）— 项目指南

本文件供 AI 运维 agent（如 DeepSeek Harness `dsh`、Claude Code）理解并操作本仓库。

## 技术栈

- **后端**：Python 3.11+ / FastAPI / SQLAlchemy / SQLite（单文件 `backend/poems.db`）
- **前端**：React + Vite + Tailwind CSS，构建成静态文件，由后端统一托管（无需独立前端服务器）
- **AI**：DeepSeek API（后端通过 `httpx` 直调 OpenAI 兼容接口，key 只存服务端 `.env`，绝不下发前端）
- **鉴权**：单用户密码登录（token 持久化在 `auth_sessions` 表，后端重启后登录状态保留）
- **部署**：一个 FastAPI 进程同时 serve API + 前端 + 上传图片

## 目录结构

```
backend/    FastAPI 后端（app/main.py 是入口；app/routers/ 各路由；app/scoring.py 评分；app/reference_*.py 参考库）
frontend/   React 前端（src/ 源码，dist/ 构建产物，public/ PWA 的 manifest/sw/图标）
deploy/     Caddyfile、systemd 服务（Linux 部署用）
AGENTS.md   本文件
DEPLOY.md   部署手册（Linux）
```

## 本地运行 / 验证

```bash
# 后端（首次先装依赖）
cd backend && uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000

# 前端构建（改完前端后需重新 build 才会生效）
cd frontend && npm install && npm run build

# 验证
curl http://127.0.0.1:8000/api/health   # {"status":"ok"}
```

后端启动时会自动：建表、补缺失列（轻量迁移）、预置 21 个格律模板、预置 16 首参考作品、创建默认用户。

## 环境变量（backend/.env，从 .env.example 复制）

```
DEEPSEEK_API_KEY=sk-xxxx          # 必填，AI 功能依赖
DEEPSEEK_MODEL_FLASH=deepseek-v4-flash
DEEPSEEK_MODEL_PRO=deepseek-v4-pro
ADMIN_USERNAME=admin
ADMIN_PASSWORD=一个强密码          # 启动时同步为此密码
```

## 关键约定（改代码时务必遵守）

1. **数据库**：`backend/poems.db`（SQLite，勿手工删）。改表结构用 `app/main.py` 里 `create_all` 后那段「轻量迁移」补列，不要破坏已有数据。
2. **AI 实现方式**：所有 AI 都是直接调 DeepSeek API（`app/deepseek.py` 的 `stream_chat` / `chat_complete`），没有用 agent 框架。评分在 `app/scoring.py`（神/形双维度、5 分制），参考基准在 `app/reference_data.py` + `reference_seed.py`。
3. **评分是后台任务**：`POST /api/poems/{id}/rate` 立即返回 running，前端轮询 `/rate/status`；改评分逻辑时保持这个"后台 + 轮询"模式。
4. **前端改完必须 `npm run build`**，后端会直接 serve `frontend/dist/`。
5. **参考库初始化**：`POST /api/references/seed`（批量）或 `/api/references/{id}/init`（单个），只评审 `article` 为空的条目。
6. **鉴权**：除 `/api/auth/login`、`/api/health` 外，`/api` 和 `/media` 都要带 `Authorization: Bearer <token>`。
7. **AI 工作区体系**（agent 模式）：`session_id` 即工作区标识，`general` 全局、`poems`/`templates`/`references` 为三个栏目工作区（父级）、`poem_{id}` 为单首诗词工作区（子级）。同级工作区工具集互相隔离；子工作区做库级/他诗操作时步骤会被标记 `escalation=true`（越权申请），用户批准后才执行。工作区系统提示词在 `app/routers/agent.py` 的 `build_system_prompt`。agent 对话持久化在 `messages` 表（`mode='agent'`），`/api/agent/history` 读取；chat 历史接口只返回 `mode='chat'`，两者互不串扰。

## 部署

- **Linux（云服务器）**：按 `DEPLOY.md` 走（Caddy + systemd）。
- **Windows（异地电脑）**：
  1. 装 Python 3.11+、`uv`、Node.js、Git。
  2. `cd backend && uv sync`；`cd frontend && npm install && npm run build`。
  3. 复制 `backend/.env.example` 为 `.env` 并填 key/密码。
  4. 启动：`cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`（可注册成 Windows 服务或用 `nssm`，或写个开机自启脚本）。
  5. 手机/浏览器访问 `http://<服务器IP>:8000`。（HTTPS 需 Caddy/Cloudflare Tunnel，见下）

## 数据备份

备份这两个目录即可：`backend/poems.db`、`backend/uploads/`。
