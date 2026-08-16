# Windows 部署 + 本地调试指南（异地 Win10 服务器）

目标：在异地 Windows 10 电脑上装好环境、跑起来，并支持**后续继续改代码调试**。

> 另见：`DEPLOY.md`（Linux 云服务器版）、`AGENTS.md`（给 AI 运维 agent 看的项目指南）。

---

## 0. 一次性装前置环境

| 工具 | 用途 | 安装方式 |
|---|---|---|
| **Python 3.11+** | 后端运行 | https://www.python.org 下载安装，**勾选 "Add python.exe to PATH"** |
| **uv** | Python 依赖管理 | 打开 PowerShell 执行：`irm https://astral.sh/uv/install.ps1 \| iex` |
| **Node.js LTS** | 前端构建 | https://nodejs.org 下载 LTS 安装 |
| **Git**（可选） | 拉代码/提交 | https://git-scm.com 安装 |

> ⚠️ 若是 **32 位系统**：请装 **Python 3.11**（更新的版本可能没有 32 位支持）；其余照旧。

---

## 1. 拿到代码

**方式一（推荐）**：用 git 克隆
```powershell
git clone https://github.com/ACCREDICORD/poem-manager.git
cd poem-manager
```

**方式二**：把本地项目文件夹直接拷过去
> 拷贝时**排除**这些可再生的目录/文件：`frontend/node_modules`、`frontend/dist`、`backend/.venv`、`backend/poems.db`、`backend/uploads`、`backend/.env`

---

## 2. 装后端依赖

```powershell
cd backend
uv sync
```
> 会创建 `backend/.venv` 并装好 FastAPI、SQLAlchemy、httpx 等全部依赖。

---

## 3. 配置 .env

```powershell
cd backend
copy .env.example .env
notepad .env
```
填两项关键的（其余保持默认）：
```
DEEPSEEK_API_KEY=sk-你的key
ADMIN_PASSWORD=你的登录密码
```

---

## 4. 构建前端

```powershell
cd frontend
npm install
npm run build
```
> 生成 `frontend/dist/`，后端会直接托管它。

---

## 5. 启动后端

```powershell
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**调试模式（改后端代码自动重启）**：
```powershell
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

启动后会自动：建表、预置 21 个格律模板、预置 16 首参考作品、创建登录用户。

---

## 6. 验证

- 服务器本机浏览器打开：`http://127.0.0.1:8000` → 应看到登录页
- 手机（**同一 WiFi**）打开：`http://<服务器局域网IP>:8000`

> 查局域网 IP：`ipconfig`，找 IPv4 地址（如 192.168.x.x）。

---

## 7. 手机出门也能访问（可选，后续再配）

- **Tailscale**（免费内网穿透，免域名/免公网 IP）：服务器和手机各装 Tailscale，手机访问它分配的 IP。
- **Cloudflare Tunnel**（需域名，免费 HTTPS，PWA 体验好）。

这块等你把服务器用起来了、需要出门访问时再弄。

---

## 8. 后续日常调试

| 操作 | 怎么做 |
|---|---|
| 改**后端** Python 代码 | 用 `--reload` 会自动重启；否则 `Ctrl+C` 停掉再重跑 |
| 改**前端**代码 | `cd frontend && npm run build`（重新生成 dist，后端自动 serve 新的） |
| 看日志 | uvicorn 控制台输出 |
| 改完想提交 | `git add -A && git commit -m "..." && git push` |
| 数据备份 | 备份 `backend/poems.db` 和 `backend/uploads/` 两个东西即可 |

---

## 常见问题

- **登录后 401 / 又要重新登录**：登录 token 已持久化在数据库，后端重启后无需重登；若出现 401 可刷新页面重新登录。
- **改了前端没生效**：确认已 `npm run build`，并清浏览器缓存（PWA 有 service worker）。
- **手机访问不到**：确认手机和服务器在**同一 WiFi**，且 Windows 防火墙放行了 8000 端口（首次启动 uvicorn 时 Windows 会弹窗问是否允许，点"允许"）。
- **端口被占用**：改 `--port 8001` 等。
