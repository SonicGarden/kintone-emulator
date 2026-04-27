#!/usr/bin/env bash
# kintone メンテナンス観測スクリプトを一定間隔で繰り返し実行する
#
# 使い方:
#   export KINTONE_DOMAIN=xxx
#   export KINTONE_USER=xxx
#   export KINTONE_PASSWORD=xxx
#   scripts/observe-maintenance-loop.sh                 # デフォルト 300 秒間隔
#   scripts/observe-maintenance-loop.sh 60              # 60 秒間隔
#   INTERVAL=120 scripts/observe-maintenance-loop.sh    # 環境変数でも指定可
#
# 停止: Ctrl-C または kill
#
# ログ: tmp/logs/loop-{YYYYMMDD-HHMMSS}.log に stdout/stderr を tee
#       各サイクルの JSON は observe-maintenance.ts が tmp/logs/{ISO}/ 配下に保存

set -u

INTERVAL="${1:-${INTERVAL:-300}}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p tmp/logs
LOG_FILE="tmp/logs/loop-$(date +%Y%m%d-%H%M%S).log"

echo "[loop] start $(date -Iseconds) interval=${INTERVAL}s log=${LOG_FILE}" | tee -a "$LOG_FILE"

trap 'echo "[loop] stopped $(date -Iseconds)" | tee -a "$LOG_FILE"; exit 0' INT TERM

while true; do
  echo "[loop] tick $(date -Iseconds)" | tee -a "$LOG_FILE"
  pnpm tsx scripts/observe-maintenance.ts 2>&1 | tee -a "$LOG_FILE"
  echo "[loop] sleep ${INTERVAL}s" | tee -a "$LOG_FILE"
  sleep "$INTERVAL"
done
