#!/usr/bin/env bash
set -euo pipefail

PREFIX="vsc-kintone-emulator-"
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

# 対象イメージの一覧取得
IMAGE_IDS=$(docker images --format "{{.ID}} {{.Repository}}:{{.Tag}}" | awk -v p="$PREFIX" '$2 ~ "^"p {print $1}')

if [ -z "$IMAGE_IDS" ]; then
  echo "対象のイメージが見つかりませんでした: ${PREFIX}*"
  exit 0
fi

$DRY_RUN && echo "(dry-run モード: 実際の削除は行いません)"
echo ""
echo "=== 削除対象のイメージ ==="
docker images --format "{{.ID}} {{.Repository}}:{{.Tag}} ({{.Size}})" | awk -v p="$PREFIX" '$2 ~ "^"p'

# 各イメージを使用しているコンテナを停止・削除
for IMAGE_ID in $IMAGE_IDS; do
  CONTAINERS=$(docker ps -a --filter "ancestor=${IMAGE_ID}" --format "{{.ID}}")
  if [ -n "$CONTAINERS" ]; then
    echo ""
    echo "=== イメージ ${IMAGE_ID} を使用しているコンテナを削除 ==="
    docker ps -a --filter "ancestor=${IMAGE_ID}" --format "{{.ID}} {{.Names}} {{.Status}}"
    run docker rm -f $CONTAINERS
    $DRY_RUN || echo "コンテナを削除しました"
  fi
done

# イメージを削除
echo ""
echo "=== イメージを削除 ==="
run docker rmi -f $IMAGE_IDS
$DRY_RUN || echo "完了しました"
