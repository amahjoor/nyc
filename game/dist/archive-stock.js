// Where the archive collection is sold.
//
// The pieces are real garments with real makers, and New York has the shops:
// a house's own store carries that house's pieces, a few multi-brand stores
// carry the designers they are known for, the resale shops carry a changing
// handful of everything, and any other clothing shop keeps a rail of them. Prices are what an original sells for now.
import { parodyLabel, punMode } from './business-puns.js';
import { ARCHIVE } from './archive-collection.js';

const byId = new Map(ARCHIVE.map(piece => [piece.id, piece]));
/** The pieces sold, in list order: a suit's trousers come with its jacket and are not sold alone. */
export const ARCHIVE_PIECES = ARCHIVE.filter(piece => !piece.part);
export const archivePiece = id => byId.get(id);
export function archiveName(piece, usePuns = punMode) {
  const label = piece.designer + ' · ' + piece.name;
  if (!usePuns) return label;
  if (piece.id === 'supreme-box-logo-hoodie') return 'Subordinate · Name Badge Hoodie';
  return parodyLabel(label).replace('Mickey Mouse Graphic Tee', 'Matinee Tee').replace('Box Logo Hoodie', 'Panel Hoodie');
}

/** A piece as a shop sells it: what buying it puts on. */
export function archiveItem(piece) {
  const item = { sku: piece.id, name: archiveName(piece), season: piece.season, price: piece.price, slot: piece.slot, archive: piece.n };
  if (piece.slot === 'bag') return { ...item, design: { bag: piece.bag, trimColour: piece.colour } };
  const dye = slot => slot === 'shoes' ? 'shoeColour' : slot + 'Colour';
  item.design = { [piece.slot]: piece.id, [dye(piece.slot)]: piece.colour };
  const other = piece.with && byId.get(piece.with);
  if (other) Object.assign(item.design, { [other.slot]: other.id, [dye(other.slot)]: other.colour });
  return item;
}

// A house's own shop, by its name on the map, and whose work it carries.
const HOUSES = [
  [/\brick owens\b/i, /Rick Owens/],
  [/\bmargiela\b/i, /Margiela/],
  [/\byohji\b/i, /Yohji/],
  [/\b(issey|miyake)\b/i, /Miyake|IM MEN/],
  [/\bjil sander\b/i, /Jil Sander/],
  [/\bprada\b/i, /Prada/],
  [/\bgucci\b/i, /Gucci/],
  [/\bdior\b/i, /Dior/],
  [/\bsaint laurent\b/i, /Saint Laurent/],
  [/\bbalenciaga\b/i, /Balenciaga/],
  [/\b(bape|bathing ape)\b/i, /BAPE/],
  [/\bstone island\b/i, /Stone Island|C\.P\. Company/],
  [/\bsupreme\b(?! department)/i, /Supreme/],
  [/\bnorth face\b/i, /North Face/],
  [/\bhelmut lang\b/i, /Helmut Lang/],
  [/\bcomme des gar/i, /Comme des Gar|Junya/],
  [/\balexander mcqueen\b/i, /McQueen/],
  [/\bvivienne westwood\b/i, /Westwood/],
  [/\bgivenchy\b/i, /Givenchy/],
  [/\bchrome hearts\b/i, /Chrome Hearts/],
  [/\bkapital\b/i, /Kapital/],
  [/\bundercover\b/i, /Undercover/],
  [/\bgaultier\b/i, /Gaultier/],
  [/\bmiu miu\b/i, /Miu Miu/],
  [/\b(y-3|adidas)\b/i, /Y-3/],
  // What a house made with somebody else is sold by both.
  [/\bnike\b/i, /Nike/],
  [/\bnew balance\b/i, /New Balance/],
  [/\btimberland\b/i, /Timberland/],
  [/\bcarhartt\b/i, /Carhartt/],
  [/\blevi'?s\b/i, /Levi's/],
  [/\bcanada goose\b/i, /Canada Goose/],
  [/\bbarbour\b/i, /Barbour/],
  [/\bbrooks brothers\b/i, /Brooks Brothers/],
  [/\blouis vuitton\b/i, /Louis Vuitton/],
  [/\bpendleton\b/i, /Pendleton/],
  [/\bschott\b/i, /Schott/],
  // Stores that carry many houses, and the ones they are known for.
  [/\bdover street\b/i, /Comme des Gar|Junya|Undercover|Raf Simons|Craig Green|Kapital|Number|Visvim|Chalayan|Westwood|McQueen|Gaultier|Balenciaga|Margiela|Sterling Ruby/],
  [/\batelier new york\b/i, /Rick Owens|Poell|Guidi|Saberi|Julius|Demeulemeester|Yohji|Chrome Hearts/],
  [/\bopening ceremony\b/i, /Kapital|Visvim|Undercover|Number|BAPE|Raf Simons|Helmut Lang|Westwood|Gaultier|Miu Miu/],
  [/\bkith\b/i, /Visvim|BAPE|Stone Island|Supreme|C\.P\. Company/],
  [/\b(barneys|bergdorf|saks)\b/i, /Dior|Gucci|Prada|Miu Miu|Saint Laurent|Balenciaga|Givenchy|Jil Sander|McQueen|Rick Owens|Helmut Lang|Margiela|Yohji|Comme des Gar|Demeulemeester|Miyake|Chrome Hearts/],
];
// Shops that deal in what others have worn.
// [shop, how many pieces, the dearest it would have]: a neighbourhood vintage shop has finds, not museum pieces.
const RESALE = [[/\breal\s?real\b/i, Infinity, Infinity], [/\b(tokio 7|what goes around|procell|james veloria)\b/i, 26, 12000], [/\b(vintage|consign\w*|resale|archive|thrift|exchange|closet)\b/i, 12, 1500]];
const SNEAKERS = /\b(flight club|stadium goods)\b/i;
// Every other shop that sells clothes keeps a rail of the archive beside its own lines:
// [how many pieces, which of them]. No two shops have quite the same rail.
// (What is worn in the bag's place is not always a bag: the collection's hat, necklaces and rings are too. A bag shop keeps the bags.)
const carried = piece => piece.slot === 'bag' && /pack|sack|tote|bag/.test(piece.bag);
const RAILS = { clothes: [14, piece => piece.slot !== 'bag' || !carried(piece)], department: [28, () => true], shoes: [6, piece => piece.slot === 'shoes'], bags: [2, carried] };

const hash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// The same shop has the same pieces every time, and no two shops quite the same ones.
const chosen = (name, pieces, count) => pieces.map(piece => [hash(name.toLowerCase() + '/' + piece.id), piece]).sort((a, b) => a[0] - b[0]).slice(0, count).map(entry => entry[1]).sort((a, b) => a.n - b.n);

/**
 * The archive pieces a place sells, as shop items, or null if it sells none.
 * `only` is true where they are all it sells (a house's own shop, a dealer in the archive).
 */
export function archiveStock(place) {
  const name = typeof place === 'string' ? '' : (place?.registeredName ?? place?.name ?? ''), kind = typeof place === 'string' ? place : place?.kind;
  if (!name || !['clothes', 'department', 'shoes', 'secondhand', 'bags'].includes(kind)) return null;
  if (SNEAKERS.test(name)) {
    const sneakers = ARCHIVE_PIECES.filter(piece => piece.slot === 'shoes' && /sneaker|dunk|trainer|geobasket|ramones|bape sta|foamposite/i.test(piece.name));
    return sneakers.length ? { only: false, items: sneakers.map(archiveItem) } : null;
  }
  for (const [shop, makers] of HOUSES) if (shop.test(name)) {
    const items = ARCHIVE_PIECES.filter(piece => makers.test(piece.designer)).map(archiveItem);
    return items.length ? { only: kind !== 'department' || /dover street/i.test(name), items } : null;
  }
  for (const [shop, count, dearest] of RESALE) if (shop.test(name)) {
    return { only: true, items: chosen(name, ARCHIVE_PIECES.filter(piece => piece.price <= dearest), count).map(archiveItem) };
  }
  const [count, sold] = RAILS[kind] || [0];
  const rail = count ? chosen(name, ARCHIVE_PIECES.filter(sold), count) : [];
  return rail.length ? { only: false, items: rail.map(archiveItem) } : null;
}
