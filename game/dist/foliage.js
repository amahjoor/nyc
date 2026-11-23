import * as THREE from './vendor/three.module.min.js';

// One leaf material for every tree in the city: the instanced street trees
// and the park crowns shaped from lidar. A crown is a closed lumpy surface;
// the fragment stage turns it into foliage by breaking its outline, mottling
// it with leaf-sized light and shade, and darkening its heart.

/**
 * @param {object} options attribute: read crown-local coordinates from `aCrown`
 *   instead of the vertex position (for meshes that are not unit-sphere instances).
 */
export function createLeafMaterial({ attribute = false, vertexColors = false, side = THREE.FrontSide } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .82, metalness: 0, vertexColors, side });
  material.name = 'Tree crown';
  if (attribute) material.defines = { NYC_CROWN_ATTRIBUTE: 1 };
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec4 vCrown;\n#ifdef NYC_CROWN_ATTRIBUTE\nattribute vec4 aCrown;\n#endif\n${shader.vertexShader}`.replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
	#ifdef NYC_CROWN_ATTRIBUTE
		vCrown = aCrown;
	#else
		vCrown = vec4( position, 1.0 );
	#endif
	// A gust travels across a stand of trees. Convert its direction back
	// into each crown's rotated axes before bending the outer branches.
	vec2 breeze = vec2( 0.88, 0.47 );
	vec2 centre = modelMatrix[3].xz;
	vec2 bend = breeze;
	#ifdef USE_INSTANCING
		centre += instanceMatrix[3].xz;
		vec2 axisX = instanceMatrix[0].xz, axisZ = instanceMatrix[2].xz;
		bend = vec2( dot( breeze, axisX ) / max( length( axisX ), 0.001 ),
		             dot( breeze, axisZ ) / max( length( axisZ ), 0.001 ) );
	#endif
	float gust = sin( dot( centre, breeze ) * 0.09 - uNycTime * 0.96 );
	float flutter = sin( dot( centre, vec2( 0.37, 0.19 ) ) + vCrown.y * 2.1 + uNycTime * 2.7 );
	float flex = vCrown.w * smoothstep( -0.9, 1.0, vCrown.y );
	transformed.xz += bend * flex * ( 0.045 * gust + 0.014 * flutter );`);
    shader.fragmentShader = `varying vec4 vCrown;\n${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
	if ( vCrown.w > 0.5 ) {
		vec3 c = vCrown.xyz;
		// Leaves are the same size on every tree, so the pattern is laid out in
		// world metres, not stretched to fit each crown.
		vec3 w = ( cameraPosition - vViewPosition * mat3( viewMatrix ) ) * 0.42;
		float clump = texture2D( uNycNoise, w.xy * 0.61 + w.z * 0.37 ).r;
		float leaf = texture2D( uNycNoise, w.xz * 2.3 + w.y * 1.7 ).b;
		float fine = texture2D( uNycNoise, w.zy * 5.1 + w.x * 3.3 ).a;
		// Break the outline into leaves: drop fragments that graze the eye.
		float edge = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
		if ( edge < 0.12 + 0.34 * leaf + 0.16 * fine ) discard;
		// Dark in the heart of the crown and underneath, bright at the tips.
		float height = smoothstep( -0.8, 0.9, c.y );
		diffuseColor.rgb *= ( 0.42 + 0.58 * height ) * ( 0.55 + 0.85 * clump ) * ( 0.74 + 0.52 * leaf );
		// Thin outer leaves pick up a yellow-green tint when seen into the sun.
		vec3 eyeRay = -normalize( vViewPosition ) * mat3( viewMatrix );
		float through = pow( max( dot( eyeRay, uNycSunDir ), 0.0 ), 3.0 ) * ( 1.0 - uNycNight );
		float fringe = through * ( 1.0 - edge ) * height * smoothstep( 0.35, 0.68, clump );
		diffuseColor.rgb *= vec3( 1.0 ) + vec3( 1.15, 0.64, 0.10 ) * fringe;
		// Gaps between boughs read as near-black holes.
		diffuseColor.rgb *= 1.0 - 0.4 * smoothstep( 0.58, 0.72, texture2D( uNycNoise, w.xy * 1.1 + w.z * 0.83 + 0.4 ).g );
		vec3 flutter = vec3( leaf, texture2D( uNycNoise, w.zy * 2.1 ).g, clump ) - 0.5;
		normal = normalize( normal + ( viewMatrix * vec4( flutter, 0.0 ) ).xyz * 1.25 );
		roughnessFactor = 0.78;
	}`);
  };
  return material;
}
