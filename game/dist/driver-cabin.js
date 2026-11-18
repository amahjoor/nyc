import * as THREE from './vendor/three.module.min.js';

// Cockpit controls follow the chassis. The windscreen uses the exterior's
// actual glazing so a driver's view follows each crack or missing pane.
export function createDriverCabin(scene) {
  const group = new THREE.Group();
  group.name = 'Driver cabin';
  scene.add(group);
  const trim = new THREE.MeshStandardMaterial({ color: 0x292c30, roughness: .9 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151719, roughness: .78 });
  const paint = new THREE.MeshStandardMaterial({ roughness: .37, metalness: .35 });
  const cube = new THREE.BoxGeometry();
  function panel(material, x, y, z, width, height, depth, parent = group) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  // +Z is the nose. Facing forward, the left-hand seat is on local +X.
  const eye = new THREE.Vector3(.37, 1.23, -.16);
  const hood = panel(paint, 0, .78, 1.46, 1.66, .10, 1.25);
  panel(trim, 0, .89, .75, 1.74, .21, .48).rotation.x = -.04;
  panel(rubber, .37, .99, .66, .45, .12, .22);
  panel(rubber, 0, .32, -.23, 1.73, .10, 2.16);
  panel(trim, 0, 1.53, -.52, 1.48, .06, 1.46);
  const doors = [];
  for (const side of [1, -1]) {
    const door = new THREE.Group();
    door.position.set(side * .86, 0, .75);
    group.add(door); doors.push(door);
    panel(trim, 0, .63, -.73, .07, .58, 1.48, door);
    panel(trim, side * .86, .63, -1.02, .07, .58, .58);
    const foot = new THREE.Vector3(side * .84, .95, .94);
    const top = new THREE.Vector3(side * .71, 1.52, .17);
    const pillar = panel(trim, 0, 0, 0, .055, foot.distanceTo(top), .07);
    pillar.position.lerpVectors(foot, top, .5);
    pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.sub(foot).normalize());
  }
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.175, .019, 8, 40), rubber);
  wheel.position.set(eye.x, .93, .31);
  wheel.rotation.x = .34;
  group.add(wheel);
  panel(trim, 0, 0, 0, .32, .035, .035, wheel);
  panel(trim, 0, -.085, 0, .035, .16, .035, wheel);
  panel(rubber, 0, 0, 0, .13, .10, .055, wheel);
  const windshield = new THREE.Mesh();
  group.add(windshield);

  let fittedCar = null, frontWheel;
  function placeCamera(camera, carMesh, turn, pitch) {
    const { chassis, wheels, tint, detail } = carMesh.userData;
    if (fittedCar !== carMesh) {
      const body = carMesh.getObjectByName('Car body').geometry;
      if (!body.boundingBox) body.computeBoundingBox();
      frontWheel = wheels.find(w => w.userData.front);
      const rear = wheels.find(w => !w.userData.front);
      group.scale.set(Math.abs(frontWheel.position.x) / .78,
        THREE.MathUtils.clamp(body.boundingBox.max.y / 1.53, .82, 1.55),
        (frontWheel.position.z - rear.position.z) / 2.65);
      paint.color.set(tint);
      fittedCar = carMesh;
    }
    const pane = detail.pieces.windshield;
    windshield.visible = !!pane?.visible;
    if (pane) {
      windshield.geometry = pane.geometry; windshield.material = pane.material;
      windshield.scale.set(1/group.scale.x, 1/group.scale.y, 1/group.scale.z);
    }
    hood.rotation.x = .08 + detail.hood.rotation.x;
    hood.rotation.z = detail.hood.rotation.z;
    for (let i = 0; i < doors.length; i++) {
      doors[i].visible = detail.doors[i].visible;
      doors[i].rotation.copy(detail.doors[i].rotation);
    }
    chassis.getWorldPosition(group.position);
    chassis.getWorldQuaternion(group.quaternion);
    wheel.rotation.z = -3 * frontWheel.rotation.y;
    group.visible = true;
    group.localToWorld(camera.position.copy(eye));
    camera.rotation.set(-pitch, Math.PI + turn, 0, 'YXZ');
    camera.quaternion.premultiply(group.quaternion);
  }
  return { group, placeCamera };
}
