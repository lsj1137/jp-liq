# 일본여행 가이드북 (jp-trip)

https://jp-trip.stillim.dev — 일본 여행용 모바일 웹앱 여러 개(쇼핑·술 가격·회화·체크리스트·경비·지역 지도)와 메인 화면을 한 프로젝트로 운영한다.

| 폴더 | 주소 | 내용 |
|---|---|---|
| `trip/` | `/` | 메인. 오른쪽 위 지역 버튼(설정) → 일본 지도에서 지방을 고르면 그 지역 전용 메뉴가 맨 위에 옅은 벚꽃색으로 나옴 |
| `shop/` | `/shop/` | 일본 쇼핑 필수템 853개, J픽(일본 현지 인기)·K픽(한국 여행자 인기), 면세·반입 팁, 쇼핑 목록. 픽 조사는 `research/shop-picks-*.json` → `node research/shop-picks.mjs` |
| `liquor/` + `api/` | `/liquor/` | 일본 술 한국 평균가 vs 일본 평균가, 사진 인식, 면세 장바구니 |
| `talk/` | `/talk/` | 보여주는 일본어 (상황별 문장, 크게 보기, 읽어주기) |
| `check/` | `/check/` | 출입국 체크리스트 (출발 전·짐·도착·면세·귀국) |
| `money/` | `/money/` | 여행 경비 (엔/원 기록, 현금·카드, 원화 합계) |
| `kansai/` | `/kansai/` | 간사이 조이패스 시설 지도 (간사이 선택 시) |
| `common/` | `/<앱>/common/` | 공통 디자인 `theme.css`, 새 앱 뼈대 `base.css` |
| `research/`, `scripts/` | — | 술 가격 조사·갱신, 조이패스 시설 수집, 일본 지도 생성(`build-japan-map.mjs`) |

`shop/`(원본 커밋 d3fc09d)과 `kansai/`(ca186ae)는 [lsj1137.github.io](https://github.com/lsj1137/lsj1137.github.io)에서 옮겨 왔다. GitHub Pages 배포는 내렸다.

새 메뉴를 추가할 때: 폴더를 만들고 `server.js`의 `APPS`와 `trip/index.html`의 `MENUS`에 추가한다(지역 전용이면 `region: 'kansai'`처럼). nginx는 고칠 필요 없다.

메인의 일본 지도는 `node scripts/build-japan-map.mjs`로 다시 만든다. 도도부현 경계([dataofjapan/land](https://github.com/dataofjapan/land))를 9개 지방으로 묶어 단순화하고 `trip/index.html`의 `<!-- japan-map -->` 자리에 넣는다. 이름표 위치는 스크립트의 `LABELS`에서 조정.

## 간사이 조이패스 데이터

GitHub Actions(`.github/workflows/kansai.yml`)가 매주 월요일 KST 05:17에 `scripts/fetch-kansai.mjs`로 시설을 다시 받아 `kansai/data.json`을 커밋한다. 서버는 crontab으로 매주 월요일 KST 06:00에 `git pull`해서 반영한다(정적 파일이라 재시작 불필요).

## 디자인

모든 화면이 같은 컨셉을 쓴다: 화지(和紙) 바탕, 쪽빛(藍) 버튼·선택색, 주홍(朱) 할인·경고색, 벚꽃색 접힌 종이 모서리, 제목은 고운바탕.
각 앱은 `style.css`(배치·동작) 다음에 `common/theme.css`(색·배경·글꼴)를 불러온다. 디자인만 바꿀 때는 `theme.css`만 고친다.

## 술 가격 비교 (`liquor/`)

- 이름 검색: 한글·영어·일본어, 초성(`ㅎㅂㅋ`), 띄어쓰기/오타 일부 허용.
- 사진 검색: 앱 안 카메라(또는 앨범) → Gemini 3.1 Flash-Lite(기본) 또는 Claude Haiku 4.5가 목록에서 해당 제품을 찾음.
- 매장 가격 입력: 실제 매장 가격(¥)을 넣으면 면세(−10%) 반영해서 한국 평균가와 비교.
- 환율: open.er-api.com 실시간 (6시간 캐시, 실패 시 마지막 값).
- 면세 장바구니: 합계 용량·금액을 한국 입국 면세 한도(2L·$400, 병 수 무관)와 비교하고, 넘으면 예상 세금 계산.
- 사진 인식 남용 방지: IP당 분당 6회·하루 60회, 전체 하루 600회 (`IDENTIFY_*` 환경변수로 조정).

가격 데이터는 `liquor/whiskies.json` (`kr`/`jp`는 `[최저, 평균, 최고]`). `research/*.json`을 고친 뒤 `node research/merge.mjs`로 반영, 병 사진은 `node research/images.mjs`.

## 오프라인

모든 앱이 서비스 워커로 목록·데이터를 캐시해서 인터넷이 약한 매장에서도 열린다(술 사진 인식만 온라인).
같은 도메인이라 캐시 저장소를 같이 쓰므로, 각 서비스 워커는 자기 이름(`jp-liq-*`, `jp-shop-*`, `jp-talk-*` …)으로 시작하는 옛 캐시만 지운다.
앱 파일을 바꿨는데 폰에 반영이 안 되면 해당 앱 `sw.js`의 `CACHE` 버전을 올린다.

## 실행

```bash
cp .env.example .env   # GEMINI_API_KEY 입력 (없으면 사진 검색만 꺼짐)
npm start              # http://localhost:3000  → / 는 술 앱, /shop/ 쇼핑, /trip/ 메인
```

의존성 없음 (Node 22+). 프런트엔드 경로는 모두 상대 경로라서 도메인 루트에서도 `/liquor/` 아래에서도 동작한다.

## 배포

서버 `myserver-deployjun`(~/.ssh/config)에서 pm2 + nginx로 운영한다. Node 서버 하나가 전부 서빙하고 nginx는 경로만 나눈다.

| 항목 | 값 |
|---|---|
| 앱 위치 | `~/projects/jp-liq` (이 저장소 checkout) |
| 프로세스 | pm2 `jp-liq` (127.0.0.1:3240, 재부팅 시 자동 시작) |
| 환경변수 | 서버의 `~/projects/jp-liq/.env` (`PORT`, `HOST`, `GEMINI_API_KEY`) |
| nginx | `/etc/nginx/sites-available/jp-trip.conf` — `/`→`/trip/`, `/liquor/` 앞부분 떼고 전달, 나머지는 그대로 전달 |
| 예전 주소 | `jp-liq.stillim.dev` → `jp-trip.stillim.dev/liquor/` 301 (`jp-liq.conf`) |

```bash
git commit -am "..." && git push
./deploy.sh        # 서버에서 git pull + pm2 restart
```

API 키를 바꿀 때는 서버에서 `.env` 수정 후 `pm2 restart jp-liq --update-env`.
