// Local game market. Integer cents keep order settlement and the bank ledger in sync.
export const COMPANIES = [
  {symbol:'BGL',name:'Five Borough Bagel',base:850,seed:17},
  {symbol:'PIER',name:'Pier Street Freight',base:2140,seed:51},
  {symbol:'LUMA',name:'Luma Studios',base:3675,seed:93},
];

function sample(tick, seed) {
  let n = Math.imul(tick ^ seed, 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff - .5;
}

export function sharePrice(company, now) {
  const tick = Math.floor(now / 30000);
  const wave = (span) => {
    const period = Math.floor(tick / span), fraction = (tick % span) / span;
    return sample(period, company.seed) * (1 - fraction) + sample(period + 1, company.seed) * fraction;
  };
  return Math.round(company.base * (1 + wave(20) * .40 + wave(4) * .12));
}

export function restoreHoldings(saved) {
  const result = {};
  for (const {symbol} of COMPANIES) {
    const position = saved?.[symbol];
    if (Number.isSafeInteger(position?.shares) && position.shares > 0 &&
        Number.isSafeInteger(position.cost) && position.cost > 0) result[symbol] = {shares:position.shares,cost:position.cost};
  }
  return result;
}

export function portfolio(holdings, now = Date.now()) {
  const stocks = COMPANIES.map(company => {
    const price = sharePrice(company, now), {shares = 0, cost = 0} = holdings[company.symbol] || {};
    return {symbol:company.symbol, name:company.name, price, shares, cost, value:price * shares};
  });
  return {stocks, value:stocks.reduce((sum, stock) => sum + stock.value, 0), cost:stocks.reduce((sum, stock) => sum + stock.cost, 0)};
}
