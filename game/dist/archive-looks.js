// The archive collection as it is worn on the street.
//
// People who own these pieces wear them as looks: a house's jacket over its
// own trousers and boots. Each look here is a top from the collection with the
// trousers and shoes that go with it, where the collection has them; where it
// has not, plain dark jeans and whatever shoes the wearer already had.
// human-cast.js deals them to the cast, most wanted first.
import { archivePiece } from './archive-stock.js';

const JEANS = { bottom: 'male_casualsuit04-bottom', bottomColour: '#24262b' };
/** `who` says who a look is for: 'w' or 'm' where it is cut for one sex, 'young' where it is not for the old, both, or null for anybody. */
function look(name, occasion, who, top, bottom = null, shoes = null) {
  const clothes = { top, topColour: archivePiece(top).colour, ...JEANS };
  if (bottom) Object.assign(clothes, { bottom, bottomColour: archivePiece(bottom).colour });
  if (shoes) Object.assign(clothes, { shoes, shoeColour: archivePiece(shoes).colour });
  const [sex] = /\b[wm]\b/.exec(who || '') || [];
  return { name, occasion, woman: sex ? sex === 'w' : null, young: /young/.test(who || ''), archive: true, clothes };
}

export const ARCHIVE_LOOKS = [
  look('Riot', 'casual', null, 'raf-riot-camo-bomber', 'raf-consumed-bondage-pants', 'mmm-replica-gat'),
  look('Creatch', 'casual', null, 'ro-stooges-leather', 'ro-drkshdw-detroit-waxed', 'ro-geobasket'),
  look('Box logo', 'casual', null, 'supreme-box-logo-hoodie', 'uc-eighty-five-denim', 'ro-dunks'),
  look('Scab', 'casual', null, 'uc-scab-jacket', 'uc-scab-patchwork-crust-pants', 'guidi-pl2-boots'),
  look('Highland', 'casual', 'young w', 'mcq-highland-rape-jacket', 'mcq-bumster-trousers', 'mcq-armadillo-shoes'),
  look('Closer', 'casual', null, 'raf-new-order-parka', 'dior-strip-denim', 'dior-navigate-combat-boots'),
  look('Shark', 'casual', null, 'bape-shark-full-zip-hoodie', 'uc-but-beautiful-yarn-denim', 'visvim-fbt'),
  look('Astro', 'casual', null, 'hl-astro-jacket', 'hl-painter-jeans', 'mmm-square-toe-boots'),
  look('Babel', 'casual', 'young', 'ro-babel-rod-parka', 'ro-tecuatl-cargo-trousers', 'ro-kiss-boots'),
  look('Lumps', 'casual', 'w', 'cdg-body-meets-dress', null, 'mmm-tabi-boots'),
  look('Double skull', 'casual', null, 'nn-double-skull-hoodie', 'nn-high-streets-distressed-denim', 'ro-ramones'),
  look('Bones', 'casual', null, 'kapital-bone-knit-sweater', 'uc-klaus-patchwork-denim', 'guidi-788z-boots'),
  look('Aviator', 'casual', null, 'yohji-painted-leather-aviator', 'yohji-hakama-trousers', 'ccp-tornado-boots'),
  look('Seditionaries', 'casual', 'young', 'vw-pirate-shirt', 'vw-seditionaries-bondage-trousers', 'ad-back-lace-boots'),
  look('Scarstitch', 'casual', 'm', 'ccp-scarstitch-leather', 'dior-luster-waxed-denim', 'ccp-prosthetic-drip-boots'),
  look('After Words', 'casual', 'young w', 'issey-pleats-please-top', 'chalayan-coffee-table-skirt', 'mmm-tabi-boots'),
  look('Boro', 'casual', null, 'kapital-boro-first-jacket', 'junya-patchwork-denim', 'visvim-fbt'),
  look('Tatouages', 'casual', 'young', 'jpg-tattoo-mesh-top', 'gucci-floral-jeans', 'ysl-wyatt-harness-boots'),
  look('Nuptse', 'casual', null, 'supreme-tnf-leopard-nuptse', null, 'ro-dunks'),
  look('Rottweiler', 'casual', null, 'givenchy-rottweiler-tee', 'ro-drkshdw-detroit-waxed', 'ro-geobasket'),
  look('Ice', 'casual', 'm', 'si-ice-jacket', null, 'mmm-replica-gat'),
  look('Seven layers', 'casual', null, 'balenciaga-seven-layer-jacket', 'uc-eighty-five-denim', 'mmm-replica-gat'),
  look('Kollaps', 'casual', null, 'raf-kollaps-hoodie', 'raf-consumed-bondage-pants', 'dior-navigate-combat-boots'),
  look('Artisanal', 'casual', null, 'mmm-reconstructed-denim-coat', null, 'mmm-tabi-boots'),
  look('Goggles', 'casual', 'm', 'cp-mille-miglia-goggle-jacket', null, 'guidi-pl2-boots'),
  look('Velvet', 'business', null, 'gucci-red-velvet-suit', 'gucci-red-velvet-trousers', 'ysl-wyatt-harness-boots'),
  look('Luster', 'business', null, 'dior-luster-blazer', 'dior-luster-waxed-denim', 'dior-navigate-combat-boots'),
  look('Gabardine', 'business', null, 'yohji-pour-homme-button-lapel-blazer', 'yohji-hakama-trousers', 'guidi-788z-boots'),
  look('Marble', 'business', null, 'jil-marble-sweater', null, 'mmm-square-toe-boots'),
  look('Tapestry', 'business', null, 'cdg-gobelins-tapestry-jacket', null, 'mmm-square-toe-boots'),
  look('Feathers', 'business', null, 'ad-feather-jacket', null, 'ad-back-lace-boots'),
  look('Broken bride', 'business', 'w', 'cdg-broken-bride-jacket', null, 'mmm-tabi-boots'),
  look('Sterling', 'business', null, 'raf-sterling-ruby-patch-coat', 'dior-strip-denim', 'ccp-tornado-boots'),
];
