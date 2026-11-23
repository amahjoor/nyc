export const SHOP_GLASS_TINT = 0x9fc8d5;
export const SHOP_GLASS_OPACITY = .13;

// Apertures in both the surveyed facade and the room. The door leaf and
// handle are geometry, so its entire opening stays clear as the hinge turns.
export const SHOP_WINDOW_GLSL = /* glsl */`
float nycShopPane( vec2 p, float halfWidth ) {
  float a = abs( p.x ), w = abs( halfWidth );
  float glazing = min( min( w - 0.22 - a, p.y - 0.64 ), 2.27 - p.y );
  if ( halfWidth < 0.0 ) return min( glazing, a - 0.025 );
  glazing = min( glazing, a - 0.7 );
  if ( w > 3.0 ) glazing = min( glazing, abs( a - ( w + 0.48 ) * 0.5 ) - 0.025 );
  return max( min( 0.55 - a, min( p.y + 0.06, 2.22 - p.y ) ), glazing );
}
`;
