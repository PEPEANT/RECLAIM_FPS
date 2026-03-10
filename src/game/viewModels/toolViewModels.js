import * as THREE from "three";

export function createShovelViewModel() {
  const group = new THREE.Group();
  const bladeGroup = new THREE.Group();

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
    color: 0xc9d1db,
    roughness: 0.2,
    metalness: 0.82
  });
  const bladeEdgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x8e98a4,
    roughness: 0.34,
    metalness: 0.74
  });

  // Handle along Y axis — blade end is Y+, grip end is Y-
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.021, 0.88, 10), handleMaterial);
  handle.castShadow = true;

  // Grip wrap (lower hand area, Y- side = near player)
  const handWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.20, 10), gripMaterial);
  handWrap.position.set(0, -0.22, 0);
  handWrap.castShadow = true;

  // Butt cap at very bottom (Y-)
  const buttCap = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.026, 0.06, 10), gripMaterial);
  buttCap.position.set(0, -0.46, 0);
  buttCap.castShadow = true;

  // === BLADE GROUP at the TOP of handle (Y+) ===
  // Metal socket connecting handle top to blade
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.028, 0.10, 8), bladeEdgeMaterial);
  socket.position.set(0, -0.07, 0);
  socket.castShadow = true;

  // Main flat square blade — XY plane, thin in Z, faces camera
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.28, 0.026), metalMaterial);
  blade.position.set(0, 0.10, 0);
  blade.castShadow = true;

  // Bottom edge of blade
  const bladeLip = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.032, 0.044), bladeEdgeMaterial);
  bladeLip.position.set(0, -0.03, 0);
  bladeLip.castShadow = true;

  // Left edge
  const bladeEdgeL = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.28, 0.036), bladeEdgeMaterial);
  bladeEdgeL.position.set(-0.136, 0.10, 0);
  bladeEdgeL.castShadow = true;

  // Right edge
  const bladeEdgeR = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.28, 0.036), bladeEdgeMaterial);
  bladeEdgeR.position.set(0.136, 0.10, 0);
  bladeEdgeR.castShadow = true;

  bladeGroup.add(socket, blade, bladeLip, bladeEdgeL, bladeEdgeR);
  // Place blade group at TOP of handle (Y = +0.50)
  bladeGroup.position.set(0, 0.50, 0);
  // No rotation — blade already faces camera in XY plane

  group.add(handle, handWrap, buttCap, bladeGroup);
  group.scale.setScalar(0.72);
  // Diagonal hold: blade end (Y+) points upper-left toward screen center
  group.position.set(0.36, -0.44, -0.50);
  group.rotation.set(0.08, -0.20, 0.44);
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
