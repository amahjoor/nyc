import {INDICES, LISTINGS, listingBySymbol, marketStory, portfolio, priceHistory, sharePrice} from './market.js';
import {formatMoney} from './money.js';

const money = cents => formatMoney(cents / 100);
const signed = cents => (cents < 0 ? '−' : '+') + money(Math.abs(cents));
const percent = (first, last) => ((last < first ? '−' : '+') + (Math.abs(last - first) * 100 / first).toFixed(2) + '%');
const indexPoints = new Intl.NumberFormat('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const direction = change => change < 0 ? 'down' : change > 0 ? 'up' : 'flat';
const ranges = new Map([[10,'10 minutes'], [60,'1 hour'], [360,'6 hours']]);

function drawChart(canvas, prices, detailed = false) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height, low = Math.min(...prices), high = Math.max(...prices);
  const y = value => high === low ? h / 2 : 7 + (high - value) * (h - 14) / (high - low);
  const color = prices.at(-1) < prices[0] ? '#ff776f' : prices.at(-1) > prices[0] ? '#5bddaa' : '#aab2bd';
  ctx.clearRect(0, 0, w, h);
  if (detailed) {
    ctx.strokeStyle = '#38414b';
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(0, y(prices[0])); ctx.lineTo(w, y(prices[0])); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  prices.forEach((value, i) => {
    const x = 3 + (w - 6) * i / (prices.length - 1);
    if (i) ctx.lineTo(x, y(value));
    else ctx.moveTo(x, y(value));
  });
  ctx.strokeStyle = color; ctx.lineWidth = detailed ? 3.5 : 3; ctx.lineJoin = 'round'; ctx.stroke();
  if (detailed) {
    ctx.lineTo(w - 3, h); ctx.lineTo(3, h); ctx.closePath();
    const fill = ctx.createLinearGradient(0, 0, 0, h);
    fill.addColorStop(0, color + '48'); fill.addColorStop(1, color + '04');
    ctx.fillStyle = fill; ctx.fill();
  }
}

export function createStockScreens({$, click, activate, show, render, onTrade}) {
  let selected, displayedPrice, storySymbol, range = 10, ownedOnly = false;
  let page = 0, filter = null, visible = [];
  const pageSize = 6, search = $('phone-market-search');
  search.value = '';
  const input = $('phone-order-shares'), status = $('phone-order-status');

  function openCompany(company) {
    if (!company) return;
    selected = company;
    input.value = '1';
    status.textContent = '';
    range = 10;
    $('phone-order').scrollTop = 0;
    show('order');
  }

  function renderMarket(now, time, cash) {
    const market = portfolio(now.bank?.holdings || {}, time);
    $('phone-market-value').textContent = money(market.value);
    const openReturn = market.value - market.cost;
    const returns = $('phone-market-return');
    returns.textContent = signed(openReturn) + ' open return';
    returns.setAttribute('data-move', direction(openReturn));
    $('phone-market-cash').textContent = money(cash);
    $('phone-market-realized').textContent = signed(now.bank?.realized || 0);
    const story = marketStory(time);
    storySymbol = story.symbol;
    $('phone-story-symbol').textContent = story.symbol + ' ›';
    $('phone-story-headline').textContent = story.headline;
    $('phone-market-owned').setAttribute('aria-pressed', String(ownedOnly));
    $('phone-market-all').setAttribute('aria-pressed', String(!ownedOnly));
    for (const [i, index] of INDICES.entries()) {
      const level = sharePrice(index, time), previous = sharePrice(index, time - 600000);
      const id = 'phone-index-' + i;
      $(id + '-level').textContent = indexPoints.format(level / 100);
      $(id + '-change').textContent = percent(previous, level);
      $(id).setAttribute('data-move', direction(level - previous));
    }
    const holdings = now.bank?.holdings || {}, query = search.value.trim().toUpperCase();
    const matches = LISTINGS.filter(company =>
      (!ownedOnly && !company.sellOnly || holdings[company.symbol]) &&
      (!filter || (company.flags & filter.flag)) &&
      (!query || company.symbol.includes(query) || company.name.toUpperCase().includes(query)));
    if (query) {
      const exact = matches.findIndex(company => company.symbol === query);
      if (exact > 0) matches.unshift(matches.splice(exact, 1)[0]);
    }
    const pages = Math.ceil(matches.length / pageSize);
    page = Math.min(page, Math.max(0, pages - 1));
    visible = matches.slice(page * pageSize, (page + 1) * pageSize);
    $('phone-market-filter').hidden = !filter;
    if (filter) $('phone-market-filter').textContent = filter.label + ' listings  ×';
    $('phone-holdings-empty').hidden = matches.length > 0;
    $('phone-holdings-empty').textContent = query ? 'No matching symbols.' : 'Buy your first share from the market to track it here.';
    $('phone-market-pages').hidden = pages <= 1;
    $('phone-market-prev').disabled = page === 0;
    $('phone-market-next').disabled = page + 1 >= pages;
    $('phone-market-page').textContent = (page + 1) + ' / ' + pages;
    for (let i = 0; i < pageSize; i++) {
      const company = visible[i], id = 'phone-quote-' + i, button = $(id);
      button.hidden = !company;
      if (!company) continue;
      const shares = holdings[company.symbol]?.shares ?? 0;
      const prices = priceHistory(company, time, 10), price = prices.at(-1);
      const change = percent(prices[0], price);
      button.setAttribute('data-move', direction(price - prices[0]));
      button.setAttribute('aria-label', [company.symbol, company.name, money(price), change + ' in ten minutes', shares + ' shares held'].join(', '));
      $(id + '-symbol').textContent = company.symbol;
      $(id + '-name').textContent = company.name + (shares ? ' · ' + shares + ' held' : '');
      $(id + '-quote').textContent = money(price);
      $(id + '-change').textContent = change;
      drawChart($(id + '-chart'), prices);
    }
  }

  function renderOrder(now, time, cash) {
    displayedPrice = sharePrice(selected, time);
    const {shares = 0, cost = 0} = now.bank?.holdings?.[selected.symbol] || {};
    const prices = priceHistory(selected, time, range), change = displayedPrice - prices[0];
    $('phone-order-symbol').textContent = selected.symbol;
    $('phone-order-name').textContent = selected.name + ' · ' + selected.sector;
    const index = Boolean(selected.fund);
    const quote = index ? amount => indexPoints.format(amount / 100) + ' pts' : money;
    $('phone-order-price').textContent = quote(displayedPrice);
    const movement = $('phone-stock-change');
    movement.textContent = (index ? (change < 0 ? '−' : '+') + quote(Math.abs(change)) : signed(change)) + ' (' + percent(prices[0], displayedPrice) + ') · ' + ranges.get(range);
    movement.setAttribute('data-move', direction(change));
    for (const minutes of ranges.keys()) $('phone-range-' + minutes).setAttribute('aria-pressed', String(minutes === range));
    drawChart($('phone-stock-chart'), prices, true);
    $('phone-chart-range').textContent = 'Low ' + quote(Math.min(...prices)) + '  ·  High ' + quote(Math.max(...prices));
    $('phone-stock-ticket').hidden = index;
    $('phone-order-position').hidden = index;
    $('phone-index-actions').hidden = !index;
    if (index) {
      $('phone-index-browse').textContent = 'Browse ' + selected.label + ' companies';
      $('phone-index-fund').textContent = 'Trade ' + selected.fund + ' tracking fund';
      return;
    }
    $('phone-order-position').textContent = shares + (shares === 1 ? ' share held' : ' shares held') +
      (shares ? ' · ' + money(cost / shares) + ' average cost · ' + signed(shares * displayedPrice - cost) + ' open return' : '');
    const quantity = Number(input.value), total = quantity * displayedPrice;
    const valid = /^\d+$/.test(input.value.trim()) && quantity >= 1 && Number.isSafeInteger(total);
    $('phone-order-less').disabled = !valid || quantity <= 1;
    $('phone-order-total').textContent = valid ? 'Order total  ' + money(total) : 'Enter a positive whole number of shares.';
    $('phone-order-cash').textContent = money(cash) + ' available in checking';
    $('phone-order-buy').disabled = selected.sellOnly || !valid || total > cash;
    $('phone-order-sell').disabled = !valid || quantity > shares;
  }

  for (let i = 0; i < pageSize; i++) click('phone-quote-' + i, () => openCompany(visible[i]));
  for (const [i, index] of INDICES.entries()) click('phone-index-' + i, () => openCompany(index));
  click('phone-index-fund', () => openCompany(listingBySymbol.get(selected.fund)));
  click('phone-index-browse', () => {
    filter = selected; ownedOnly = false; search.value = ''; page = 0; show('market', true);
  });
  click('phone-market-filter', () => { filter = null; page = 0; render(); });
  click('phone-market-prev', () => { page--; render(); });
  click('phone-market-next', () => { page++; render(); });
  search.addEventListener('input', () => { page = 0; render(); });
  click('phone-market-story', () => openCompany(listingBySymbol.get(storySymbol)));
  for (const tab of ['all','owned']) click('phone-market-' + tab, () => {
    ownedOnly = tab === 'owned'; filter = null; search.value = ''; page = 0; render();
  });
  for (const minutes of ranges.keys()) click('phone-range-' + minutes, () => { range = minutes; render(); });
  for (const [id, delta] of [['less', -1], ['more', 1]]) click('phone-order-' + id, () => {
    const quantity = Number(input.value);
    input.value = String(Number.isSafeInteger(quantity) && quantity > 0 ? Math.max(1, quantity + delta) : 1);
    status.textContent = ''; render();
  });
  input.addEventListener('input', () => { status.textContent = ''; render(); });
  for (const side of ['buy','sell']) {
    const button = $('phone-order-' + side);
    button.addEventListener('click', event => {
      // Capture the visible quote before the animated handset press settles.
      const price = displayedPrice, quantity = input.value;
      activate(button, event, () => {
        const error = onTrade(selected.symbol, side, quantity, price);
        status.textContent = error || (side === 'buy' ? 'Bought ' : 'Sold ') + quantity + ' ' + selected.symbol + ' at ' + money(price) + '.';
        render();
      });
    });
  }

  return (screen, now) => {
    const time = Date.now(), cash = now.availableChecking ?? now.bank?.checking ?? 0;
    if (screen === 'market') renderMarket(now, time, cash);
    else renderOrder(now, time, cash);
  };
}
