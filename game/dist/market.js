import {MARKET_CATALOG} from './market-catalog.js';

// Starting prices are game balance values in cents. All quotes use the same wall-clock tick.
export const QUOTE_MS = 30000;
const featured = [
  {symbol:'F', name:'Ford Motor', sector:'Automotive', base:1250, seed:19, swing:.85,
    news:['City fleets bring forward orders for electric vans.', 'A parts shortage slows van deliveries.']},
  {symbol:'AAPL', name:'Apple', sector:'Technology', base:18500, seed:31, swing:1.1,
    news:['Shoppers line up for a new phone on Fifth Avenue.', 'Phone upgrade demand cools after launch weekend.']},
  {symbol:'JPM', name:'JPMorgan Chase', sector:'Banking', base:15500, seed:43, swing:.7,
    news:['A wave of business openings lifts demand for loans.', 'Small businesses put expansion loans on hold.']},
  {symbol:'DAL', name:'Delta Air Lines', sector:'Air travel', base:4200, seed:59, swing:1.3,
    news:['Holiday bookings fill flights out of LaGuardia.', 'Storms force cancellations across city airports.']},
  {symbol:'DIS', name:'Walt Disney', sector:'Entertainment', base:9200, seed:73, swing:1,
    news:['A new release draws packed opening-night crowds.', 'A quiet box-office weekend weighs on ticket sales.']},
  {symbol:'KO', name:'Coca-Cola', sector:'Beverages', base:5700, seed:89, swing:.55,
    news:['A city heat wave sends cold drinks flying off shelves.', 'Rain keeps fans and drink vendors out of the ballpark.']},
];

export const LEGACY_COMPANIES = [
  {symbol:'BGL.OLD',name:'Five Borough Bagel',base:850,seed:17},
  {symbol:'PIER',name:'Pier Street Freight',base:2140,seed:51},
  {symbol:'LUMA',name:'Luma Studios',base:3675,seed:93},
].map(company => ({...company, sector:'Legacy holding', sellOnly:true}));

// Game index levels and their tracking funds share one simulated return series.
export const INDICES = [
  {symbol:'^IXIC', label:'Nasdaq', name:'Nasdaq Composite', flag:1, fund:'ONEQ', fundBase:6400, base:1650000, seed:301},
  {symbol:'^GSPC', label:'S&P 500', name:'S&P 500', flag:2, fund:'SPY', fundBase:52000, base:520000, seed:302},
  {symbol:'^DJI', label:'Dow', name:'Dow Jones Industrial Average', flag:4, fund:'DIA', fundBase:39500, base:3950000, seed:303},
].map(index => ({...index, sector:'Market index', swing:.38}));

const directory = new Map(MARKET_CATALOG.map(([symbol,name,flags]) => {
  let seed = 5381;
  for (const char of symbol) seed = (Math.imul(seed, 33) + char.charCodeAt(0)) >>> 0;
  return [symbol, {symbol,name,flags,seed,base:800 + seed % 22400,swing:.65 + (seed % 85) / 100,sector:'Equity'}];
}));
for (const company of featured) directory.set(company.symbol, {...directory.get(company.symbol), ...company});
const funds = INDICES.map(index => ({symbol:index.fund, name:index.name + ' ETF', sector:'Index fund',
  flags:0, seed:index.seed, base:index.fundBase, swing:index.swing}));
const featuredSymbols = ['F','AAPL','NVDA','MSFT','GOOGL','AMZN','META','TSLA','JPM','DAL','DIS','KO'];
export const LISTINGS = [...featuredSymbols.map(symbol => directory.get(symbol)), ...funds,
  ...Array.from(directory.values()).filter(company => !featuredSymbols.includes(company.symbol)), ...LEGACY_COMPANIES];
export const listingBySymbol = new Map(LISTINGS.map(company => [company.symbol, company]));

function sample(tick, seed) {
  let n = Math.imul(tick ^ seed, 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff - .5;
}

// Each three-minute bulletin builds into its company's quote, then fades back out.
export function marketStory(now) {
  const tick = Math.floor(now / QUOTE_MS);
  const issue = Math.floor(tick / 6);
  const company = featured[Math.abs(issue) % featured.length];
  const positive = sample(issue, 109) > 0;
  const strength = Math.sin(Math.PI * ((tick % 6 + 6) % 6 + .5) / 6);
  return {symbol:company.symbol, headline:company.news[positive ? 0 : 1], impact:(positive ? 1 : -1) * .085 * strength};
}

function movement(seed, tick) {
  const wave = span => {
    const period = Math.floor(tick / span), fraction = (tick - period * span) / span;
    return sample(period, seed) * (1 - fraction) + sample(period + 1, seed) * fraction;
  };
  return wave(20) * .40 + wave(4) * .12;
}

export function sharePrice(company, now) {
  const tick = Math.floor(now / QUOTE_MS);
  const ownMove = movement(company.seed, tick);
  if (company.sellOnly) return Math.round(company.base * (1 + ownMove));
  // A listed company participates in the moves of its markets as well as its own news.
  let marketMove = 0, count = 0;
  for (const index of INDICES) {
    if (company.flags & index.flag) {
      marketMove += movement(index.seed, tick) * index.swing;
      count++;
    }
  }
  const change = count ? .7 * ownMove * company.swing + .3 * marketMove / count : ownMove * company.swing;
  const story = marketStory(now);
  return Math.round(company.base * (1 + change + (company.symbol === story.symbol ? story.impact : 0)));
}

export function priceHistory(company, now, minutes) {
  const ticks = minutes * 60000 / QUOTE_MS;
  return Array.from({length:ticks + 1}, (_, i) => sharePrice(company, now - (ticks - i) * QUOTE_MS));
}

export function restoreHoldings(saved, catalogVersion) {
  const result = {};
  for (const [key, position] of Object.entries(saved || {})) {
    const symbol = key === 'BGL' && catalogVersion !== 2 ? 'BGL.OLD' : key;
    if (!listingBySymbol.has(symbol)) continue;
    if (Number.isSafeInteger(position?.shares) && position.shares > 0 &&
        Number.isSafeInteger(position.cost) && position.cost > 0) result[symbol] = {shares:position.shares,cost:position.cost};
  }
  return result;
}

export function portfolio(holdings, now = Date.now()) {
  let value = 0, cost = 0;
  for (const [symbol, position] of Object.entries(holdings)) {
    const company = listingBySymbol.get(symbol);
    if (!company) continue;
    value += sharePrice(company, now) * position.shares;
    cost += position.cost;
  }
  return {value, cost};
}
