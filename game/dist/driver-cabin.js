import * as THREE from './vendor/three.module.min.js';

// The seat and upholstery already follow the model's cabin dimensions and suspension.
export function cabinSeatPoint(driver, seat, point) {
  if (seat) {
    if (seat.side < 0) point.x -= 2 * driver.position.x / driver.scale.x;
    point.z += seat.along;
  }
  return driver.localToWorld(point);
}

export function placeDriverCamera(camera, carMesh, turn, pitch, seat, duck=0) {
  const { driver } = carMesh.userData.detail;
  cabinSeatPoint(driver, seat, camera.position.set(.1*duck, 1.18-.28*duck, -.015+.09*duck));
  driver.getWorldQuaternion(camera.quaternion);
  camera.quaternion.multiply(look.setFromEuler(angles.set(-pitch, Math.PI + turn, 0, 'YXZ')));
}
const look = new THREE.Quaternion(), angles = new THREE.Euler();
