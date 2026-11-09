# jp-liq

일본 술(위스키·사케·소주·우메슈·진) 이름이나 라벨 사진으로 검색하면 **한국 평균가 / 일본 평균가 / 차액**을 바로 보여주는 모바일 웹앱.

- 이름 검색: 한글·영어·일본어, 초성(`ㅎㅂㅋ`), 띄어쓰기/오타 일부 허용. 브라우저에서 바로 검색해서 즉시 결과.
- 사진 검색: 카메라 버튼 → 앱 안에서 촬영(또는 앨범) → Gemini 3.1 Flash-Lite(기본) 또는 Claude Haiku 4.5가 목록에서 해당 제품 찾음.
- 매장 가격 입력: 카드 열고 실제 매장 가격(¥)을 넣으면 면세(−10%) 반영해서 한국 평균가와 비교.
- 환율: open.er-api.com 실시간 (6시간 캐시, 실패 시 마지막 값).

## 실행

```bash
cp .env.example .env   # GEMINI_API_KEY 입력 (없으면 사진 검색만 꺼짐)
npm start              # http://localhost:3000
```

의존성 없음 (Node 22+).

## 배포 (https://jp-liq.stillim.dev)

서버 `myserver-deployjun`(~/.ssh/config)에서 pm2 + nginx로 운영.

| 항목 | 값 |
|---|---|
| 앱 위치 | `~/projects/jp-liq` |
| 프로세스 | pm2 `jp-liq` (127.0.0.1:3240, 재부팅 시 자동 시작) |
| 환경변수 | 서버의 `~/projects/jp-liq/.env` (`PORT`, `HOST`, `GEMINI_API_KEY`) |
| nginx | `/etc/nginx/sites-available/jp-liq.conf` |

코드: https://github.com/lsj1137/jp-liq (서버 폴더도 이 저장소를 받아온 것)

코드나 가격 데이터를 바꾼 뒤 업데이트:

```bash
git commit -am "..." && git push
./deploy.sh        # 서버에서 git pull + pm2 restart
```

API 키를 바꿀 때는 서버에서 `.env` 수정 후 `pm2 restart jp-liq --update-env`.

폰 브라우저에서 열고 "홈 화면에 추가"하면 앱처럼 사용.

## 가격 데이터

`public/whiskies.json` — `kr`/`jp`는 `[최저, 평균, 최고]`.
일반 매장(한국: 마트·보틀샵, 일본: 빅카메라·요도바시·돈키호테 등) 기준 참고 가격이라 출발 전에 한 번 갱신 추천.
