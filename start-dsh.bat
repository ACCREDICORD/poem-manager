@echo off
chcp 65001 >nul
REM ============================================
REM  启动 DeepSeek Harness（dsh）运维 agent
REM  前提：已安装 Node.js（含 npx）
REM ============================================
echo [dsh] 正在启动 DeepSeek Harness...
echo [dsh] 首次运行会自动下载，请稍候。
echo.
echo 启动后请用浏览器打开: http://127.0.0.1:3080
echo 首次使用两步:
echo   1) Settings - Models 里填入 DeepSeek API Key 并保存
echo   2) Choose workspace 选择本项目目录（本脚本所在目录）
echo.
npx -y @deepseek-ai/dsh web
pause
