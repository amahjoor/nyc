import {portfolio} from './market.js';
import {formatMoney} from './money.js';

const money = cents => formatMoney(cents / 100);

function duration(minutes) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours && hours + 'h', rest && rest + 'm'].filter(Boolean).join(' ');
}

function drawHistory($, history, total) {
  const [start, opening] = history[0] ?? [0, total];
  const end = history.at(-1)?.[0] ?? start;
  const span = end - start, change = total - opening;
  const caption = $('phone-bank-change');
  caption.textContent = span ? (change < 0 ? '−' : '+') + money(Math.abs(change)) + ' over ' + duration(span) + ' in game' : 'First recorded balance';
  caption.setAttribute('data-trend', change < 0 ? 'down' : change > 0 ? 'up' : 'flat');
  $('phone-bank-chart-start').textContent = span ? duration(span) + ' ago' : '';
  $('phone-bank-chart-description').textContent = span
    ? 'Total money over ' + duration(span) + ' of game time, from ' + money(opening) + ' to ' + money(total) + '.'
    : 'Total money starts at ' + money(total) + '.';

  const canvas = $('phone-bank-chart'), ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height, pad = 7;
  const values = history.map(point => point[1]);
  const low = Math.min(total, ...values), high = Math.max(total, ...values);
  const y = value => high === low ? h / 2 : pad + (high - value) / (high - low) * (h - 2 * pad);
  const x = minute => span ? pad + (minute - start) / span * (w - 2 * pad) : w - pad;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath(); ctx.moveTo(pad, y(opening)); ctx.lineTo(w - pad, y(opening));
  ctx.setLineDash([3, 7]); ctx.strokeStyle = '#506260'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
  const color = change < 0 ? '#ff9587' : '#77e3bc';
  if (span) {
    ctx.beginPath(); ctx.moveTo(pad, y(opening));
    for (const [minute, value] of history) ctx.lineTo(x(minute), y(minute === end ? total : value));
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.lineTo(w - pad, h); ctx.lineTo(pad, h); ctx.closePath();
    const fill = ctx.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, color + '40'); fill.addColorStop(1, color + '03');
    ctx.fillStyle = fill; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(w - pad, y(total), 4, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
}

export function renderBank($, now) {
  const checking = now.bank?.checking ?? 0, cash = now.cash ?? 0;
  const invested = portfolio(now.bank?.holdings || {}).value;
  const total = Math.round(cash * 100) + checking + invested;
  $('phone-bank-total').textContent = money(total);
  $('phone-bank-balance').textContent = money(checking);
  $('phone-bank-cash').textContent = formatMoney(cash);
  $('phone-bank-invested').textContent = money(invested);
  drawHistory($, now.bank?.history || [], total);

  const entries = now.bank?.entries || [];
  $('phone-bank-empty').hidden = entries.length > 0;
  for (let i = 0; i < 16; i++) {
    const entry = entries[i], id = 'phone-activity-' + i;
    $(id).hidden = !entry;
    if (!entry) continue;
    $(id).setAttribute('data-flow', entry.amount > 0 ? 'in' : 'out');
    $(id + '-name').textContent = entry.name;
    $(id + '-time').textContent = [entry.account, entry.clock].filter(Boolean).join(' · ');
    $(id + '-amount').textContent = (entry.amount > 0 ? '+' : '−') + money(Math.abs(entry.amount));
  }
}

export function renderTransfer($, now) {
  const deposit = $('phone-bank-direction').value === 'deposit';
  const cash = formatMoney(now.availableCash ?? now.cash ?? 0) + ' available';
  const checking = money(now.bank?.checking ?? 0) + ' available';
  $('phone-bank-from').textContent = deposit ? 'Cash on hand' : 'Checking';
  $('phone-bank-to').textContent = deposit ? 'Checking' : 'Cash on hand';
  $('phone-bank-from-balance').textContent = deposit ? cash : checking;
  $('phone-bank-to-balance').textContent = deposit ? checking : cash;
  const available = deposit ? Math.round((now.availableCash ?? now.cash ?? 0) * 100) : now.bank?.checking ?? 0;
  for (const amount of [20, 100]) $('phone-atm-' + amount).disabled = available < amount * 100;
  $('phone-atm-all').value = (available / 100).toFixed(2);
  $('phone-atm-all').disabled = available < 1;
  $('phone-bank-confirm').textContent = deposit ? 'Deposit cash' : 'Withdraw cash';
}
