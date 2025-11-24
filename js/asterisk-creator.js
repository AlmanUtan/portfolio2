/**
 * AsteriskCreator - Creates the 3D asterisk shape
 */

import * as THREE from "https://esm.sh/three@0.160.0";

export class AsteriskCreator {
  static createAsterisk(size = 1.5, color = 0x000000) {
    const group = new THREE.Group();

    const armLength = size * 1.6;
    const armWidth = size * 0.35;
    const armDepth = size * 0.45;

    const fillMat = new THREE.MeshLambertMaterial({
      color,
      emissive: 0x000000,
      emissiveIntensity: 0.0,
      toneMapped: false,
    });

    for (let i = 0; i < 6; i++) {
      const geom = new THREE.BoxGeometry(armLength, armWidth, armDepth);
      const arm = new THREE.Mesh(geom, fillMat);
      arm.rotation.z = (Math.PI / 3) * i;
      group.add(arm);
    }

    group.userData.rotationSpeed = 0.01;
    return group;
  }
}



