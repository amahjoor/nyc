import * as THREE from './vendor/three.module.min.js';

// The handset's own lens. It is not the chase camera: a rear shot looks
// ahead from the eyes, and a selfie looks back at the face. The first-person
// view hides the head only for its own camera, so this one still sees it.
const WIDTH = 216, HEIGHT = 288;
const FRAME_INTERVAL = 1000 / 24;

export function aimLens(camera, player, eye, facing) {
  const angle = player?.angle || 0, sin = Math.sin(angle), cos = Math.cos(angle);
  const x = eye?.x ?? player?.x ?? 0, y = eye?.y ?? (player?.y || 0) + 1.55, z = eye?.z ?? player?.z ?? 0;
  camera.up.set(0, 1, 0);
  if (facing === 'selfie') {
    camera.position.set(x + sin * 0.62, y - 0.02, z + cos * 0.62);
    camera.lookAt(x, y - 0.04, z);
    camera.fov = 46;
  } else {
    camera.position.set(x + sin * 0.22, y - 0.06, z + cos * 0.22);
    camera.lookAt(x + sin * 8, y - 0.35, z + cos * 8);
    camera.fov = 58;
  }
  camera.aspect = WIDTH / HEIGHT;
  camera.near = 0.06;
  camera.far = 2500;
  camera.updateProjectionMatrix();
}

export function createPhoneLens() {
  const camera = new THREE.PerspectiveCamera(58, WIDTH / HEIGHT, 0.06, 2500);
  let target = null, pixels = null, frame = null, last = 0, fresh = false, context = null;
  function blit(canvas) {
    const ctx = canvas.getContext?.('2d');
    if (!ctx || !pixels) return false;
    if (canvas.width !== WIDTH || canvas.height !== HEIGHT) { canvas.width = WIDTH; canvas.height = HEIGHT; frame = null; }
    frame ??= ctx.createImageData(WIDTH, HEIGHT);
    const row = WIDTH * 4, data = frame.data;
    for (let y = 0; y < HEIGHT; y++) data.set(pixels.subarray((HEIGHT - 1 - y) * row, (HEIGHT - y) * row), y * row);
    ctx.putImageData(frame, 0, 0);
    return true;
  }
  function draw(force) {
    const { renderer, scene, view, canvas, player, eye, facing, body, hide } = context || {};
    if (!renderer?.setRenderTarget || !scene || !canvas) return false;
    const now = performance.now();
    if (!force && fresh && now - last < FRAME_INTERVAL) return true;
    target ??= new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { depthBuffer: true, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
    pixels ??= new Uint8Array(WIDTH * HEIGHT * 4);
    aimLens(camera, player, eye, facing);
    if (view?.layers) camera.layers.mask = view.layers.mask;
    const shown = body?.visible, held = hide?.visible;
    const previous = renderer.getRenderTarget(), face = renderer.getActiveCubeFace?.(), mip = renderer.getActiveMipmapLevel?.();
    const xr = renderer.xr?.enabled, shadows = renderer.shadowMap?.autoUpdate;
    try {
      if (facing === 'selfie' && body) body.visible = true;
      if (hide) hide.visible = false;
      if (renderer.xr) renderer.xr.enabled = false;
      if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, pixels);
      fresh = blit(canvas);
      last = now;
    } catch {
      fresh = false;
    } finally {
      renderer.setRenderTarget(previous, face, mip);
      if (renderer.xr) renderer.xr.enabled = xr;
      if (renderer.shadowMap) renderer.shadowMap.autoUpdate = shadows;
      if (body) body.visible = shown;
      if (hide) hide.visible = held;
    }
    return fresh;
  }
  return {
    preview(next) {
      const changed = next.facing !== context?.facing || next.canvas !== context?.canvas;
      context = next;
      return draw(changed);
    },
    snapshot(canvas, facing) {
      if (context) context = { ...context, canvas, facing: facing || context.facing };
      if (!draw(true) || !canvas?.toDataURL) return '';
      try { return canvas.toDataURL('image/jpeg', 0.72); } catch { return ''; }
    },
  };
}
