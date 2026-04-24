#!/usr/bin/env bash
set -euo pipefail

PREFIX="kintone-emulator-"
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --dry-run|-n) DRY_RUN=true ;;
    *) echo "Usage: $0 [--dry-run|-n]" >&2; exit 1 ;;
  esac
done

run() {
  if $DRY_RUN; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

# 対象ボリュームの一覧取得
VOLUME_NAMES=$(docker volume ls --format "{{.Name}}" | grep "^${PREFIX}" || true)

if [ -z "$VOLUME_NAMES" ]; then
  echo "対象のボリュームが見つかりませんでした: ${PREFIX}*"
  exit 0
fi

$DRY_RUN && echo "(dry-run モード: 実際の削除は行いません)"
echo ""
echo "=== 削除対象のボリューム ==="
echo "$VOLUME_NAMES"

echo ""
echo "=== ボリュームを削除 ==="
run docker volume rm $VOLUME_NAMES
$DRY_RUN || echo "完了しました"
