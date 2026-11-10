// 브라우저 기본 confirm·alert 대신 쓰는 확인 창(ask)과 알림(toast). 모든 앱이 같이 쓴다.
// 스타일은 처음 쓸 때 한 번 넣는다. 색은 각 앱의 theme.css 변수(--paper, --text, --blue, --red, --field)를 따른다.
const CSS = `
.ui-ask { width: min(92vw, 400px); max-height: 86vh; padding: 0; border: 0; border-radius: 18px; background: var(--paper, #fff); color: var(--text, #222); outline: none; }
.ui-ask::backdrop { background: rgba(47, 42, 38, 0.45); }
.ui-ask form { padding: 22px 20px 18px; }
.ui-ask h2 { margin: 0; font-family: "Gowun Batang", serif; font-size: 19px; font-weight: 700; letter-spacing: -0.02em; }
.ui-ask .msg { margin-top: 10px; font-size: 14px; line-height: 1.6; color: var(--sub, #666); }
.ui-ask .msg:empty { display: none; }
.ui-ask .msg b { color: var(--text, #222); }
.ui-ask .msg ul { margin: 6px 0 0; padding-left: 18px; }
.ui-ask .msg label, .ui-ask .msg .field { display: block; margin-top: 12px; font-size: 13px; }
.ui-ask .msg input[type="number"] { display: block; width: 100%; height: 44px; margin-top: 6px; padding: 0 12px; border: 0; border-radius: 10px; background: var(--field, #f2f2f2); color: var(--text, #222); font: inherit; font-size: 17px; font-weight: 600; outline: none; }
.ui-ask .msg input[type="number"]:focus { box-shadow: inset 0 0 0 2px var(--blue, #36c); }
.ui-ask .choice { display: flex; gap: 6px; margin-top: 6px; }
.ui-ask .choice label { flex: 1; margin: 0; }
.ui-ask .choice input { position: absolute; opacity: 0; pointer-events: none; }
.ui-ask .choice span { display: grid; place-items: center; height: 40px; border-radius: 10px; background: var(--field, #f2f2f2); color: var(--sub, #666); font-size: 14px; font-weight: 600; cursor: pointer; }
.ui-ask .choice input:checked + span { background: var(--blue, #36c); color: #fff; }
.ui-ask .btns { display: flex; gap: 8px; margin-top: 20px; }
.ui-ask .btns.col { flex-direction: column; }
.ui-ask .btns button { flex: 1; min-height: 46px; padding: 0 12px; border: 0; border-radius: 12px; background: var(--field, #f2f2f2); color: var(--text, #222); font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.ui-ask .btns button.primary { background: var(--blue, #36c); color: #fff; }
.ui-ask .btns button.danger { background: var(--red, #c33); color: #fff; }
.ui-toast { position: fixed; inset: auto 0 calc(96px + env(safe-area-inset-bottom)); width: max-content; max-width: min(90vw, 420px); margin: 0 auto; padding: 12px 16px; border: 0; border-radius: 12px; background: rgba(47, 42, 38, 0.94); color: #fffdf8; font: 600 14px/1.45 "Pretendard Variable", Pretendard, sans-serif; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18); opacity: 0; transform: translateY(8px); transition: opacity 0.2s, transform 0.2s; }
.ui-toast.show { opacity: 1; transform: none; }
.ui-toast a { margin-left: 10px; color: #f6c4d1; font-weight: 700; text-decoration: none; white-space: nowrap; }
`;
let styled = false;
function style() {
  if (styled) return;
  document.head.insertAdjacentHTML('beforeend', `<style>${CSS}</style>`);
  styled = true;
}

// ask({ title, body, buttons }) → 누른 버튼의 value(취소·바깥 누르기·뒤로는 null).
// body는 HTML이라 입력칸을 넣을 수 있고, 확인하면 { button, ...입력값 } 을 돌려준다.
// buttons 기본값: [취소, 확인]. { value, label, kind: 'primary' | 'danger' }
export function ask({ title, body = '', buttons, column = false }) {
  style();
  buttons ??= [{ value: null, label: '취소' }, { value: 'ok', label: '확인', kind: 'primary' }];
  const dlg = document.createElement('dialog');
  dlg.className = 'ui-ask';
  dlg.innerHTML = `<form method="dialog"><h2 tabindex="-1" autofocus></h2><div class="msg">${body}</div>
    <div class="btns${column ? ' col' : ''}">${buttons.map((b, i) => `<button type="submit" value="${i}" class="${b.kind ?? ''}">${b.label}</button>`).join('')}</div></form>`;
  dlg.querySelector('h2').textContent = title;
  document.body.append(dlg);
  return new Promise((resolve) => {
    let result = null;
    const form = dlg.querySelector('form');
    form.addEventListener('submit', (e) => {
      const b = buttons[Number(e.submitter?.value)];
      result = b && b.value !== null ? { button: b.value, ...Object.fromEntries(new FormData(form)) } : null;
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    // 입력칸에서 키보드 완료(엔터)를 누르면 창이 닫히지 않고 키보드만 내린다
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input')) {
        e.preventDefault();
        e.target.blur();
      }
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
  });
}

// 확인만 받을 때: confirmBox('제목', '설명', { ok: '지우기', danger: true }) → true/false
export async function confirmBox(title, body = '', { ok = '확인', cancel = '취소', danger = false } = {}) {
  const r = await ask({ title, body, buttons: [{ value: null, label: cancel }, { value: 'ok', label: ok, kind: danger ? 'danger' : 'primary' }] });
  return !!r;
}

// toast('메시지', { link: { href, label } }) — 아래쪽에 잠깐 떴다 사라진다. 열린 창(dialog) 위에도 보이게 popover로 띄운다.
let toastEl, timer;
export function toast(msg, { link, ms = 2600 } = {}) {
  style();
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'ui-toast';
    toastEl.setAttribute('role', 'status');
    if ('popover' in toastEl) toastEl.popover = 'manual';
    document.body.append(toastEl);
  }
  toastEl.textContent = msg;
  if (link) toastEl.insertAdjacentHTML('beforeend', `<a href="${link.href}">${link.label}</a>`);
  if (toastEl.popover) {
    toastEl.hidePopover?.();
    toastEl.showPopover();
  }
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(timer);
  timer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.popover && toastEl.matches(':popover-open') && toastEl.hidePopover(), 250);
  }, ms);
}
