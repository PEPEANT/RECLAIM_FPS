import * as THREE from "three";

export function createShovelViewModel() {
  const group = new THREE.Group();

  const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b6947,
    roughness: 0.84,
    metalness: 0.08
  });
  const gripMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b4633,
    roughness: 0.9,
    metalness: 0.04
  });
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0xb7bec8,
    roughness: 0.28,
    metalness: 0.78
  });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 1.08, 10), handleMaterial);
  handle.castShadow = true;

  const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.08, 10), gripMaterial);
  topCap.position.set(0, 0.58, 0);
  topCap.castShadow = true;

  const handWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), gripMaterial);
  handWrap.position.set(0, -0.08, 0);
  handWrap.castShadow = true;

  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.14, 0.09), metalMaterial);
  collar.position.set(0, -0.44, 0.02);
  collar.castShadow = true;

  const bladeShoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), metalMaterial);
  bladeShoulderL.position.set(-0.08, -0.58, 0.04);
  bladeShoulderL.rotation.z = 0.34;
  bladeShoulderL.castShadow = true;

  const bladeShoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), metalMaterial);
  bladeShoulderR.position.set(0.08, -0.58, 0.04);
  bladeShoulderR.rotation.z = -0.34;
  bladeShoulderR.castShadow = true;

  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.05), metalMaterial);
  blade.position.set(0, -0.7, 0.08);
  blade.rotation.x = 0.22;
  blade.castShadow = true;

  const bladeTip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.05), metalMaterial);
  bladeTip.position.set(0, -0.88, 0.13);
  bladeTip.rotation.x = 0.46;
  bladeTip.castShadow = true;

  group.add(
    handle,
    topCap,
    handWrap,
    collar,
    bladeShoulderL,
    bladeShoulderR,
    blade,
    bladeTip
  );
  group.position.set(0.3, -0.48, -0.58);
  group.rotation.set(-0.04, 0.1, 0.48);
  group.visible = false;
  return group;
}

export function createBlockViewModel() {
  const group = new THREE.Group();

  const blockMaterial = new THREE.MeshStandardMaterial({
    color: 0x5fae45,
    roughness: 0.78,
    metalness: 0.08
  });
  const bevelMaterial = new THREE.MeshStandardMaterial({
    color: 0x8cd47c,
    roughness: 0.62,
    metalness: 0.06
  });
  const shadowMaterial = new THREE.MeshStandardMaterial({
    color: 0x33552d,
    roughness: 0.92,
    metalness: 0.02
  });

  const block = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), blockMaterial);
  block.castShadow = true;
  block.receiveShadow = true;

  const topFace = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.22), bevelMaterial);
  topFace.position.set(0, 0.135, -0.01);
  topFace.castShadow = true;

  const sideFace = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.2), shadowMaterial);
  sideFace.position.set(-0.135, -0.015, 0.02);
  sideFace.castShadow = true;

  group.add(block, topFace, sideFace);
  group.userData.blockMaterial = blockMaterial;
  group.userData.bevelMaterial = bevelMaterial;
  group.userData.shadowMaterial = shadowMaterial;
  group.visible = false;
  return group;
}

export function applyBlockViewColor(group, colorValue) {
  if (!group) {
    return;
  }

  const color = new THREE.Color(colorValue ?? "#5fae45");
  const topColor = color.clone().lerp(new THREE.Color(0xffffff), 0.2);
  const sideColor = color.clone().multiplyScalar(0.52);

  group.userData.blockMaterial?.color.copy(color);
  group.userData.bevelMaterial?.color.copy(topColor);
  group.userData.shadowMaterial?.color.copy(sideColor);
}
