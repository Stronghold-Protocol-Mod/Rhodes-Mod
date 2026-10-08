#!/usr/bin/env bash
# 卫戍协议：盟约 · 罗德岛 MOD —— macOS / Linux 安装入口
#   ./install.sh                            自动找游戏目录
#   ./install.sh /path/to/Stronghold-Protocol   指定游戏根目录
#   ./install.sh --check                    只检查
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "  ============================================"
echo "    卫戍协议：盟约  ·  罗德岛 MOD  安装"
echo "  ============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "  没找到 Node.js。请先安装 Node.js 22 或 24 LTS： https://nodejs.org/zh-cn/download"
  exit 1
fi

if [ "${1:-}" != "" ] && [ "${1#-}" = "$1" ] && [ -d "$1" ]; then
  exec node tools/install.mjs --game "$1" "${@:2}"
fi
exec node tools/install.mjs "$@"
