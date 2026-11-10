// 여행 경비(localStorage jp-money)에 다른 앱에서 기록을 넣는다. 형식은 money/app.js 와 같다.
// [{ id, date: 'YYYY-MM-DD', amount, cur: 'JPY' | 'KRW', cat, pay: 'cash' | 'card', memo }]
const KEY = 'jp-money';
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const lastPay = () => localStorage.getItem('jp-money-pay') ?? 'card';

export function addExpense({ amount, pay = lastPay(), cat = 'shop', memo = '' }) {
  const list = JSON.parse(localStorage.getItem(KEY) || '[]');
  list.push({ id: Date.now(), date: today(), amount: Math.round(amount), cur: 'JPY', cat, pay, memo });
  localStorage.setItem(KEY, JSON.stringify(list));
  localStorage.setItem('jp-money-pay', pay);
}

// 결제 창 안에 넣는 금액·결제 수단 입력칸 (common/ui.js 의 ask body 용)
export const payFields = (amount, note = '') => `
  ${note}
  <label>실제 결제 금액 (엔)<input type="number" name="amount" inputmode="numeric" enterkeyhint="done" value="${Math.round(amount)}" /></label>
  <div class="field">결제 수단<span class="choice">
    <label><input type="radio" name="pay" value="cash" ${lastPay() === 'cash' ? 'checked' : ''} /><span>현금</span></label>
    <label><input type="radio" name="pay" value="card" ${lastPay() === 'card' ? 'checked' : ''} /><span>카드</span></label>
  </span></div>`;
