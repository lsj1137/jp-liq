#!/usr/bin/env bash
# jp-trip.stillim.dev 배포: GitHub main 브랜치를 서버(~/projects/jp-liq)에 받아오고 pm2를 재시작한다.
# 먼저 커밋하고 git push 한 다음 실행. 서버의 .env(API 키, 포트)는 git에 없어서 그대로 유지된다.
# 사용: ./deploy.sh
set -euo pipefail

if [ -n "$(git status --porcelain)" ] || [ "$(git rev-parse HEAD)" != "$(git rev-parse @{u})" ]; then
  echo "커밋 안 된 변경이나 push 안 된 커밋이 있어요. 커밋하고 git push 한 뒤 다시 실행하세요." >&2
  exit 1
fi

ssh myserver-deployjun 'set -e
  cd ~/projects/jp-liq && git pull --ff-only -q && echo "배포: $(git log --oneline -1)"
  pm2 restart jp-liq --update-env >/dev/null && sleep 1
  for p in /trip/ /shop/ /; do curl -s -o /dev/null -w "  $p HTTP %{http_code}\n" http://127.0.0.1:3240$p; done'
