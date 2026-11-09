#!/usr/bin/env bash
# 코드·데이터를 서버(~/projects/jp-liq)에 올리고 pm2를 재시작한다.
# 서버의 .env(API 키, 포트)는 건드리지 않는다.
# 사용: ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

HOST=myserver-deployjun
DIR=projects/jp-liq

tar czf - --exclude=.env --exclude=node_modules --exclude='_*' . \
  | ssh "$HOST" "cd $DIR && tar xzf - && pm2 restart jp-liq --update-env >/dev/null && pm2 save >/dev/null"
ssh "$HOST" "curl -s -o /dev/null -w 'jp-liq: HTTP %{http_code}\n' http://127.0.0.1:3240/"
