import * as THREE from './vendor/three.module.min.js';

// A tile lists the cars whose headlights or tail lights can reach it. The
// receiver evaluates each light at its own world height, even on stacked roads.
const TILES = 24, WIDTH = 128;
const BEAM_START = 2, BEAM_LENGTH = 30, BEAM_WIDTH = 7.5;
const TAIL_OFFSET = 3.2, TAIL_RADIUS = 3;

export class VehicleLights {
  constructor() {
    this.tiles = Array.from({ length: TILES * TILES }, () => []);
    this.texture = null;
  }

  update(cars, minX, minZ, span) {
    for (const tile of this.tiles) tile.length = 0;
    const scale = TILES / span;
    let texels = this.tiles.length;
    for (const car of cars) {
      if ((car.parked && !car.controlled) || car.destroyed || car.burningSince != null || !Number.isFinite(car.y)) continue;
      const sin = Math.sin(car.angle), cos = Math.cos(car.angle);
      const end = BEAM_START + BEAM_LENGTH, back = -TAIL_OFFSET - TAIL_RADIUS;
      const mid = (end + back) / 2, half = (end - back) / 2;
      const cx = car.x + mid * sin, cz = car.z + mid * cos;
      const rx = half * Math.abs(sin) + BEAM_WIDTH * Math.abs(cos);
      const rz = half * Math.abs(cos) + BEAM_WIDTH * Math.abs(sin);
      const x0 = Math.max(0, Math.floor((cx - rx - minX) * scale));
      const z0 = Math.max(0, Math.floor((cz - rz - minZ) * scale));
      const x1 = Math.min(TILES - 1, Math.floor((cx + rx - minX) * scale));
      const z1 = Math.min(TILES - 1, Math.floor((cz + rz - minZ) * scale));
      // The four wheel contacts already provide the road's grade and crossfall.
      const rise = -Math.tan(car.pitch || 0), bank = Math.tan(car.roll || 0);
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          this.tiles[z * TILES + x].push(car.x, car.y, car.z, cos, sin, rise, bank, 0);
          texels += 2;
        }
      }
    }
    if (!this.texture || texels > this.texture.image.data.length / 4) {
      this.texture?.dispose();
      const rows = THREE.MathUtils.ceilPowerOfTwo(Math.ceil(texels / WIDTH));
      const data = new Float32Array(WIDTH * rows * 4);
      this.texture = new THREE.DataTexture(data, WIDTH, rows, THREE.RGBAFormat, THREE.FloatType);
      this.texture.name = 'Vehicle lights by street tile';
    }
    const data = this.texture.image.data;
    let cursor = this.tiles.length;
    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      data[i * 4] = cursor;
      data[i * 4 + 1] = tile.length / 8;
      data.set(tile, cursor * 4);
      cursor += tile.length / 4;
    }
    this.texture.needsUpdate = true;
    return this.texture;
  }

  dispose() { this.texture?.dispose(); }
}

export const VEHICLE_LIGHT_GLSL = /* glsl */`
uniform highp sampler2D uNycCarLights;
vec4 nycCarTexel( int index ) {
  return texelFetch( uNycCarLights, ivec2( index % ${WIDTH}, index / ${WIDTH} ), 0 );
}
vec3 nycVehicleLight( vec3 world, vec2 uv, float normalY, float night ) {
  ivec2 tile = ivec2( uv * ${TILES}.0 );
  ivec2 list = ivec2( nycCarTexel( tile.y * ${TILES} + tile.x ).xy );
  vec3 light = vec3( 0.0 );
  for ( int i = 0; i < list.y; i++ ) {
    vec4 car = nycCarTexel( list.x + 2 * i );
    vec3 direction = nycCarTexel( list.x + 2 * i + 1 ).xyz;
    vec2 delta = world.xz - car.xz;
    float along = dot( delta, vec2( direction.x, car.w ) );
    float across = dot( delta, vec2( car.w, -direction.x ) );
    float above = world.y - ( car.y + along * direction.y + across * direction.z );
    // An underside directly below the tyres faces away from the lamps.
    if ( normalY < -0.4 && above < 0.7 ) continue;
    float reach = smoothstep( -0.8, -0.2, above ) * ( 1.0 - smoothstep( 0.8, 2.5, above ) );
    if ( reach <= 0.0 ) continue;
    float ahead = ( along - ${BEAM_START}.0 ) / ${BEAM_LENGTH}.0;
    if ( ahead > 0.0 && ahead < 1.0 ) {
      float side = across / ( ${BEAM_WIDTH} * mix( 0.16, 1.0, ahead ) );
      float beam = max( 1.0 - side * side, 0.0 ) * pow( 1.0 - ahead, 1.35 ) * smoothstep( 0.0, 0.05, ahead );
      light += vec3( 1.0, 0.93, 0.78 ) * ( 2.6 * max( night, 0.25 ) * reach * beam );
    }
    vec2 tail = vec2( across, along + ${TAIL_OFFSET} ) / ${TAIL_RADIUS}.0;
    float pool = max( 1.0 - dot( tail, tail ), 0.0 );
    light += vec3( 0.55, 0.03, 0.02 ) * ( night * reach * pow( pool, 2.2 ) );
  }
  return light;
}`;
