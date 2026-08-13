# 部署指南

把诗词管理系统部署到云服务器（Ubuntu/Debian）。前端由后端统一托管，Caddy 负责 HTTPS。

## 0. 前置条件

- 一台云服务器（有公网 IP）
- 一个已解析到该 IP 的域名（HTTPS 需要）
- 服务器已装：Python 3.11+、`uv`、Node.js 18+、`git`、`caddy`

```bash
# 装 caddy（官方安装方式）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# 装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## 1. 拉代码 & 构建

```bash
git clone https://github.com/ACCREDICORD/poem-manager.git /opt/poem-manager
cd /opt/poem-manager

# 构建前端
cd frontend && npm install && npm run build && cd ..

# 安装后端依赖
cd backend && uv sync && cd ..
```

## 2. 配置环境变量

```bash
cd /opt/poem-manager/backend
cp .env.example .env
# 编辑 .env，填入：
#   DEEPSEEK_API_KEY=sk-xxxx
#   ADMIN_USERNAME=admin
#   ADMIN_PASSWORD=一个强密码
```

## 3. 启动后端（systemd）

```bash
sudo cp /opt/poem-manager/deploy/poem-manager.service /etc/systemd/system/
# 按需修改 service 里的路径
sudo systemctl daemon-reload
sudo systemctl enable --now poem-manager
sudo systemctl status poem-manager   # 确认 running
```

## 4. 配置 Caddy（HTTPS）

```bash
# 编辑 deploy/Caddyfile，把 your-domain.com 换成你的域名
sudo cp /opt/poem-manager/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

访问 `https://你的域名`，用 `.env` 里设置的用户名密码登录。

## 5. 数据与备份

- 数据库：`backend/poems.db`（SQLite 单文件）
- 上传图片：`backend/uploads/`
- 备份这两个目录即可：

```bash
tar czf backup-$(date +%F).tar.gz backend/poems.db backend/uploads
```

## 常见问题

- **登录后 401**：服务重启会清空内存会话，重新登录即可。
- **图片看不到**：确认 `backend/uploads/` 有读写权限。
- **HTTPS 没生效**：确认域名已解析到服务器 IP，且 80/443 端口已放行。
