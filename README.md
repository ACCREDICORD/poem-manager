# poem-manager

个人诗词管理系统：收藏、整理、创作原创诗词，支持分类/时间/评分浏览、格律模板填词、批注与配图，并接入 DeepSeek AI 进行对话辅助与 agent 操作。

## 技术栈

- **后端**：Python FastAPI + SQLAlchemy + SQLite
- **前端**：React + Vite + Tailwind CSS（移动端优先，PWA）
- **AI**：DeepSeek API（对话 / agent 双模式）
- **部署**：Caddy 反向代理（自动 HTTPS）

## 目录结构

```
backend/    FastAPI 后端（API + SQLite + DeepSeek 代理）
frontend/   React 前端（PWA）
deploy/     部署配置（Caddyfile 等）
```

## 本地运行

### 后端

```bash
cd backend
uv sync                          # 安装依赖（需已安装 uv）
uv run uvicorn app.main:app --reload --port 8000
```

接口文档：http://127.0.0.1:8000/docs

### 前端（构建完成后）

```bash
cd frontend
npm install
npm run dev
```

## 功能

- 诗词导入（粘贴 / 上传文本）、自动分类识别与归档
- 按类型、创作时间、评分查找 / 筛选 / 排序
- 收藏、批注（逐句/整首）、图片配图
- 格律模板（预置词牌/诗体 + agent 搜索 + 手动修改）
- 评分（用户自评 + agents 5 评委 + 1 裁判综合 + 综合分）
- DeepSeek 对话 / agent 双模式（agent 每步执行前确认）
