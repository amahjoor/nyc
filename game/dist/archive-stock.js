// Where the archive collection is sold.
//
// The pieces are real garments with real makers, and New York has the shops:
// a house's own store carries that house's pieces, a few multi-brand stores
// carry the designers they are known for, and the resale shops carry a
// changing handful of everything. Prices are what an original sells for now.
import { ARCHIVE } from './archive-collection.js';

const byId = new Map(ARCHIVE.map(piece => [piece.id, piece]));
/** The pieces sold, in list order: a suit's trousers come with its jacket and are not sold alone. */
export const ARCHIVE_PIECES = ARCHIVE.filter(piece => !piece.part);
export const archivePiece = id => byId.get(id);
export const archiveName = piece => piece.designer + ' · ' + piece.name;

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
  [/\b(issey|miyake)\b/i, /Miyake/],
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
  // Stores that carry many houses, and the ones they are known for.
  [/\bdover street\b/i, /Comme des Gar|Junya|Undercover|Raf Simons|Craig Green|Kapital|Number|Visvim|Chalayan|Westwood|McQueen|Gaultier|Balenciaga|Margiela|Sterling Ruby/],
  [/\batelier new york\b/i, /Rick Owens|Poell|Guidi|Saberi|Julius|Demeulemeester|Yohji/],
  [/\bopening ceremony\b/i, /Kapital|Visvim|Undercover|Number|BAPE|Raf Simons|Helmut Lang|Westwood/],
  [/\bkith\b/i, /Visvim|BAPE|Stone Island|Supreme|C\.P\. Company/],
  [/\b(barneys|bergdorf|saks)\b/i, /Dior|Gucci|Prada|Saint Laurent|Balenciaga|Givenchy|Jil Sander|McQueen|Rick Owens|Helmut Lang|Margiela|Yohji|Comme des Gar|Demeulemeester|Miyake/],
];
// Shops that deal in what others have worn.
// [shop, how many pieces, the dearest it would have]: a neighbourhood vintage shop has finds, not museum pieces.
const RESALE = [[/\breal\s?real\b/i, Infinity, Infinity], [/\b(tokio 7|what goes around|procell|james veloria)\b/i, 26, 12000], [/\b(vintage|consign\w*|resale|archive|thrift|exchange|closet)\b/i, 12, 1500]];
const SNEAKERS = /\b(flight club|stadium goods)\b/i;

const hash = text => { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * The archive pieces a place sells, as shop items, or null if it sells none.
 * `only` is true where they are all it sells (a house's own shop, a dealer in the archive).
 */
export function archiveStock(place) {
  const name = typeof place === 'string' ? '' : place?.name || '', kind = typeof place === 'string' ? place : place?.kind;
  if (!name || !['clothes', 'department', 'shoes', 'secondhand', 'bags'].includes(kind)) return null;
  if (SNEAKERS.test(name)) {
    const sneakers = ARCHIVE_PIECES.filter(piece => piece.slot === 'shoes' && /sneaker|dunk|trainer|geobasket|ramones/i.test(piece.name));
    return sneakers.length ? { only: false, items: sneakers.map(archiveItem) } : null;
  }
  for (const [shop, makers] of HOUSES) if (shop.test(name)) {
    const items = ARCHIVE_PIECES.filter(piece => makers.test(piece.designer)).map(archiveItem);
    return items.length ? { only: kind !== 'department' || /dover street/i.test(name), items } : null;
  }
  for (const [shop, count, dearest] of RESALE) if (shop.test(name)) {
    // The same shop has the same pieces in every time, and no two shops quite the same ones.
    const ranked = ARCHIVE_PIECES.filter(piece => piece.price <= dearest).map(piece => [hash(name.toLowerCase() + '/' + piece.id), piece]).sort((a, b) => a[0] - b[0]).slice(0, count).map(entry => entry[1]);
    return { only: true, items: ranked.sort((a, b) => a.n - b.n).map(archiveItem) };
  }
  return null;
}
