// The archive collection: the hundred pieces of data/archive-collection/, each
// shown alone and on a plainly dressed figure, in the order of the list.
import { ARCHIVE_PIECES, archiveItem, archivePiece } from '../archive-stock.js';
import { DEFAULT_PERSON } from '../human-designs.js';
import { avatar, dispose } from './business.js';

export const archiveCollection = 'Archive fashion';
// Quiet clothes for the rest of the figure, so the piece is what is seen.
const MODEL = { ...DEFAULT_PERSON, topColour: '#e9e6df', bottomColour: '#2a2c31', shoeColour: '#d8d4ca' };
const kinds = { top: 'Tops', bottom: 'Bottoms', shoes: 'Footwear', bag: 'Bags' };
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const garmentViews = [{ id: 'item', label: 'Piece' }, { id: 'worn', label: 'Worn' }, { id: 'walk', label: 'Walking' }];

// Where to stand for what the whole figure would make small.
const views = {
  shoes: { position: [.62, .46, 1.22], target: [0, .17, .02] },
  bag: { position: [-.74, 1.5, -1.5], target: [0, 1.2, -.08] },
};
// A bag alone is looked at from behind, where its face is.
const alone = { bag: { position: [-.5, 1.4, -1.22], target: [0, 1.2, -.17] } };

// The pictures are large and arrive after the mesh; a piece photographed before then is a dark shape.
async function painted(object) {
  const pictures = new Set();
  object.traverse(part => { for (const material of [part.material].flat()) for (const map of [material?.map, material?.normalMap]) if (map) pictures.add(map); });
  for (let i = 0; i < 200 && [...pictures].some(map => !map.image?.width); i++) await new Promise(done => setTimeout(done, 50));
  await Promise.all([...pictures].map(map => map.image?.decode?.().catch(() => {})));
  return object;
}

async function show(piece, view) {
  const item = archiveItem(piece);
  const object = await avatar(() => ({ ...MODEL, ...item.design }), view === 'walk' ? 'walk' : 'idle');
  if (view === 'item') {
    // The piece and what is sewn to it: its layers end in a number, a suit brings its other half.
    const ids = [piece.id, piece.with].filter(Boolean);
    const mine = mesh => piece.slot === 'bag' ? mesh.name.startsWith('Bag')
      : ids.some(id => { const rest = mesh.name.slice(mesh.name.indexOf('/') + 1); return rest.startsWith(id) && /^\d*$/.test(rest.slice(id.length)); });
    const others = [];
    object.traverse(part => { if (part.isMesh && !mine(part)) others.push(part); });
    if (others.length === 0 || !object.getObjectsByProperty('isMesh', true).some(mine)) { dispose(object); throw new Error('No mesh is worn for ' + piece.id); }
    for (const part of others) part.removeFromParent();
    if (alone[piece.slot]) object.userData.inspectionView = alone[piece.slot];
  } else if (views[piece.slot]) object.userData.inspectionView = views[piece.slot];
  return painted(object);
}

export function fashionEntries() {
  return ARCHIVE_PIECES.map(piece => {
    const other = piece.with && archivePiece(piece.with), price = dollars.format(piece.price);
    return {
      id: 'archive-' + piece.id, name: piece.name, caption: piece.designer + ' · ' + piece.season, order: piece.n,
      collection: archiveCollection, group: piece.designer, model: piece.id, source: 'archive-collection.js',
      detail: piece.designer + ' · ' + piece.season + ' · ' + price,
      tags: ['archive', '#' + piece.n, kinds[piece.slot], piece.season, price, other?.name],
      variants: piece.slot === 'bag' ? garmentViews.slice(0, 2) : garmentViews,
      build: view => show(piece, view || 'item'), dispose,
    };
  });
}
