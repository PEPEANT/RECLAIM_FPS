import * as THREE from "three";

const PREVIEW_TO_VIEW_ROTATION = new THREE.Euler(0, Math.PI / 2, 0, "XYZ");
const CYLINDER_ALONG_X = Math.PI / 2;
const CYLINDER_ALONG_Z = Math.PI / 2;

function createMaterial(color, roughness, metalness, emissive = null, emissiveIntensity = 0.38) {
  const baseColor = new THREE.Color(color);
  const emissiveColor =
    emissive != null
      ? new THREE.Color(emissive)
      : baseColor.clone().multiplyScalar(0.18).lerp(new THREE.Color(0xffffff), 0.03);
  return new THREE.MeshStandardMaterial({
    color: baseColor,
    roughness,
    metalness,
    emissive: emissiveColor,
    emissiveIntensity: emissive != null ? emissiveIntensity : 0.42
  });
}

function createBox(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 35;
  return mesh;
}

function createCylinder(radiusTop, radiusBottom, length, radialSegments, material) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments),
    material
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 35;
  return mesh;
}

function put(group, mesh, x, y, z, rx = 0, ry = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  group.add(mesh);
  return mesh;
}

function rotatePreviewVector(x, y, z) {
  return new THREE.Vector3(x, y, z).applyEuler(PREVIEW_TO_VIEW_ROTATION);
}

function attachMuzzleEffects(root, muzzlePosition, muzzleFlashMap) {
  const flashMaterial = new THREE.SpriteMaterial({
    map: muzzleFlashMap ?? null,
    color: 0xffdf9e,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  const muzzleFlash = new THREE.Sprite(flashMaterial);
  muzzleFlash.position.copy(muzzlePosition);
  muzzleFlash.scale.setScalar(0.22);
  muzzleFlash.renderOrder = 60;
  root.add(muzzleFlash);

  const muzzleLight = new THREE.PointLight(0xffcf82, 0, 2.8, 2);
  muzzleLight.position.copy(muzzlePosition);
  root.add(muzzleLight);

  return { muzzleFlash, muzzleLight };
}

function finalizeWeaponView({
  weaponId,
  buildModel,
  muzzlePosition,
  aimReferencePosition,
  handAnchorPosition,
  muzzleFlashMap
}) {
  const root = new THREE.Group();
  const model = buildModel();
  model.rotation.y = PREVIEW_TO_VIEW_ROTATION.y;
  const handAnchor = handAnchorPosition
    ? rotatePreviewVector(handAnchorPosition.x, handAnchorPosition.y, handAnchorPosition.z)
    : new THREE.Vector3();
  model.position.copy(handAnchor).multiplyScalar(-1);
  root.add(model);
  root.userData.weaponId = weaponId;
  root.renderOrder = 35;
  if (aimReferencePosition) {
    root.userData.aimReference = rotatePreviewVector(
      aimReferencePosition.x,
      aimReferencePosition.y,
      aimReferencePosition.z
    ).sub(handAnchor);
  }

  const { muzzleFlash, muzzleLight } = attachMuzzleEffects(
    root,
    rotatePreviewVector(muzzlePosition.x, muzzlePosition.y, muzzlePosition.z).sub(handAnchor),
    muzzleFlashMap
  );

  return { group: root, muzzleFlash, muzzleLight };
}

function buildM4Model() {
  const group = new THREE.Group();

  const body = createMaterial(0x2c3440, 0.48, 0.64);
  const upper = createMaterial(0x394353, 0.42, 0.72);
  const rail = createMaterial(0x586375, 0.2, 0.92);
  const barrel = createMaterial(0x7a8698, 0.14, 0.96);
  const grip = createMaterial(0x20252d, 0.84, 0.05);
  const stock = createMaterial(0x2b313a, 0.68, 0.14);
  const chrome = createMaterial(0xa1afbe, 0.08, 0.98);
  const flashHider = createMaterial(0x485260, 0.26, 0.88);
  const fiberRed = createMaterial(0xbf2424, 0.3, 0.12, 0xff2d2d, 0.55);

  put(group, createBox(1.0, 0.14, 0.076, body), 0, 0, 0);
  put(group, createBox(0.9, 0.11, 0.072, upper), 0, 0.125, 0);
  put(group, createBox(0.88, 0.024, 0.05, rail), 0, 0.198, 0);
  for (let index = 0; index < 10; index += 1) {
    put(group, createBox(0.024, 0.015, 0.053, rail), -0.385 + index * 0.086, 0.212, 0);
  }

  put(group, createCylinder(0.022, 0.022, 0.92, 12, barrel), 0.71, 0.08, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createBox(0.07, 0.07, 0.07, body), 0.32, 0.08, 0);
  put(group, createCylinder(0.007, 0.007, 0.52, 8, chrome), 0.16, 0.158, 0, 0, 0, CYLINDER_ALONG_X);

  put(group, createCylinder(0.028, 0.024, 0.085, 6, flashHider), 1.205, 0.08, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.02, 0.026, 0.035, 6, flashHider), 1.25, 0.08, 0, 0, 0, CYLINDER_ALONG_X);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const port = createBox(0.01, 0.034, 0.01, flashHider);
    port.position.set(1.268, 0.08 + Math.sin(angle) * 0.023, Math.cos(angle) * 0.023);
    group.add(port);
  }

  put(group, createBox(0.44, 0.084, 0.086, body), 0.28, 0.08, 0);
  put(group, createBox(0.42, 0.02, 0.05, rail), 0.28, 0.124, 0);
  put(group, createBox(0.42, 0.02, 0.05, rail), 0.28, 0.037, 0);
  put(group, createBox(0.42, 0.05, 0.02, rail), 0.28, 0.08, 0.054);
  put(group, createBox(0.42, 0.05, 0.02, rail), 0.28, 0.08, -0.054);

  put(group, createBox(0.018, 0.09, 0.036, body), 0.488, 0.18, 0);
  put(group, createBox(0.018, 0.05, 0.065, body), 0.488, 0.16, 0);
  put(group, createCylinder(0.004, 0.004, 0.028, 6, chrome), 0.488, 0.242, 0);
  put(group, createCylinder(0.0032, 0.0032, 0.02, 6, fiberRed), 0.488, 0.272, 0);
  put(group, createBox(0.05, 0.042, 0.066, body), -0.215, 0.218, 0);
  put(group, createBox(0.016, 0.038, 0.016, chrome), -0.215, 0.235, 0);

  const magazine = new THREE.Group();
  put(magazine, createBox(0.076, 0.28, 0.062, grip), 0, -0.1, 0);
  put(magazine, createBox(0.08, 0.04, 0.065, body), 0, 0.065, 0);
  put(magazine, createBox(0.07, 0.024, 0.058, grip), 0, -0.258, 0);
  magazine.position.set(-0.055, -0.105, 0);
  magazine.rotation.z = 0.09;
  group.add(magazine);

  const pistolGrip = new THREE.Group();
  put(pistolGrip, createBox(0.06, 0.2, 0.074, grip), 0, -0.062, 0);
  for (let index = 0; index < 4; index += 1) {
    put(
      pistolGrip,
      createBox(0.062, 0.012, 0.076, createMaterial(0x09090c, 0.9, 0.02)),
      0,
      -0.018 - index * 0.04,
      0
    );
  }
  put(pistolGrip, createBox(0.052, 0.065, 0.072, grip), 0, 0.12, 0);
  pistolGrip.position.set(-0.19, -0.09, 0);
  pistolGrip.rotation.z = 0.3;
  group.add(pistolGrip);

  put(group, createBox(0.145, 0.012, 0.047, upper), -0.115, -0.082, 0);
  put(group, createBox(0.012, 0.075, 0.047, upper), -0.042, -0.046, 0);
  put(group, createBox(0.012, 0.075, 0.047, upper), -0.188, -0.046, 0);
  put(group, createBox(0.01, 0.048, 0.013, chrome), -0.115, -0.042, 0);

  put(group, createBox(0.058, 0.022, 0.032, body), -0.275, 0.198, 0);
  put(group, createBox(0.022, 0.016, 0.052, body), -0.285, 0.206, 0);

  put(group, createCylinder(0.034, 0.034, 0.38, 12, upper), -0.665, 0.068, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.042, 0.042, 0.022, 8, rail), -0.485, 0.068, 0, 0, 0, CYLINDER_ALONG_X);

  put(group, createBox(0.21, 0.092, 0.07, stock), -0.86, 0.044, 0);
  put(group, createBox(0.032, 0.165, 0.07, stock), -0.966, 0.002, 0);
  put(group, createBox(0.155, 0.044, 0.066, stock), -0.848, 0.134, 0);
  put(group, createBox(0.022, 0.172, 0.076, grip), -0.984, 0.002, 0);

  put(group, createCylinder(0.015, 0.015, 0.026, 8, body), 0.1, 0.132, 0.04, CYLINDER_ALONG_Z);
  put(group, createCylinder(0.013, 0.013, 0.013, 8, chrome), -0.175, 0.022, 0.04, CYLINDER_ALONG_Z);
  put(group, createBox(0.016, 0.04, 0.013, chrome), -0.02, -0.005, 0.04);

  group.position.set(-0.137, 0.075, 0);
  return group;
}

function buildSpasModel() {
  const group = new THREE.Group();

  const body = createMaterial(0x292d33, 0.56, 0.55);
  const barrel = createMaterial(0x747f8d, 0.16, 0.93);
  const tube = createMaterial(0x85909d, 0.14, 0.95);
  const pump = createMaterial(0x23272d, 0.76, 0.1);
  const grip = createMaterial(0x1c2025, 0.86, 0.04);
  const stock = createMaterial(0x2f353d, 0.62, 0.18);
  const heat = createMaterial(0x49515c, 0.3, 0.82);
  const chrome = createMaterial(0xa0adbc, 0.1, 0.95);
  const fiberRed = createMaterial(0xc32929, 0.3, 0.1, 0xff3030, 0.5);

  put(group, createBox(0.68, 0.22, 0.092, body), 0, 0, 0);
  put(group, createBox(0.64, 0.038, 0.086, heat), 0, 0.129, 0);
  put(group, createCylinder(0.042, 0.042, 0.58, 14, barrel), 0.49, 0.065, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.029, 0.029, 0.62, 14, body), 0.51, 0.065, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.048, 0.042, 0.042, 8, heat), 0.802, 0.065, 0, 0, 0, CYLINDER_ALONG_X);

  put(group, createBox(0.58, 0.026, 0.096, heat), 0.47, 0.115, 0);
  for (let index = 0; index < 10; index += 1) {
    put(group, createBox(0.012, 0.024, 0.098, body), 0.19 + index * 0.055, 0.115, 0);
  }

  put(group, createCylinder(0.038, 0.038, 0.62, 14, tube), 0.48, -0.076, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.044, 0.044, 0.024, 10, body), 0.8, -0.076, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.05, 0.05, 0.018, 8, heat), 0.788, -0.076, 0, 0, 0, CYLINDER_ALONG_X);

  put(group, createBox(0.2, 0.075, 0.1, pump), 0.46, -0.005, 0);
  for (let index = 0; index < 6; index += 1) {
    put(group, createBox(0.009, 0.077, 0.102, body), 0.38 + index * 0.036, -0.005, 0);
  }
  put(group, createBox(0.009, 0.072, 0.006, heat), 0.46, -0.005, 0.046);
  put(group, createBox(0.009, 0.072, 0.006, heat), 0.46, -0.005, -0.046);

  put(group, createCylinder(0.007, 0.007, 0.018, 6, chrome), 0.8, 0.112, 0);
  put(group, createCylinder(0.0035, 0.0035, 0.018, 6, fiberRed), 0.8, 0.132, 0);
  put(group, createBox(0.032, 0.032, 0.054, heat), -0.08, 0.155, 0);

  const pistolGrip = new THREE.Group();
  put(pistolGrip, createBox(0.074, 0.22, 0.086, grip), 0, -0.065, 0);
  for (let index = 0; index < 5; index += 1) {
    put(
      pistolGrip,
      createBox(0.076, 0.014, 0.088, createMaterial(0x07080a, 0.92, 0.02)),
      0,
      -0.01 - index * 0.038,
      0
    );
  }
  put(pistolGrip, createBox(0.064, 0.07, 0.084, grip), 0, 0.13, 0);
  pistolGrip.position.set(-0.18, -0.095, 0);
  pistolGrip.rotation.z = 0.2;
  group.add(pistolGrip);

  put(group, createBox(0.16, 0.013, 0.05, body), -0.1, -0.115, 0);
  put(group, createBox(0.013, 0.08, 0.05, body), -0.02, -0.075, 0);
  put(group, createBox(0.013, 0.08, 0.05, body), -0.18, -0.075, 0);
  put(group, createBox(0.01, 0.048, 0.013, chrome), -0.1, -0.076, 0);

  put(group, createBox(0.32, 0.024, 0.02, stock), -0.4, 0.142, 0);
  put(group, createBox(0.024, 0.27, 0.02, stock), -0.55, 0.01, 0);
  put(group, createBox(0.16, 0.024, 0.02, stock), -0.472, -0.123, 0);
  put(group, createBox(0.035, 0.2, 0.074, body), -0.563, 0.01, 0);
  put(group, createBox(0.024, 0.024, 0.068, stock), -0.55, 0.142, 0);
  put(group, createBox(0.024, 0.024, 0.068, stock), -0.55, -0.123, 0);
  for (const sign of [-1, 1]) {
    put(group, createBox(0.024, 0.27, 0.02, stock), -0.55, 0.01, sign * 0.038);
  }

  put(group, createBox(0.13, 0.055, 0.094, createMaterial(0x08090b, 0.95, 0.1)), 0.08, 0.04, 0);

  group.position.set(-0.12, 0.08, 0);
  return group;
}

function buildAwpModel() {
  const group = new THREE.Group();

  const action = createMaterial(0x313842, 0.46, 0.72);
  const barrel = createMaterial(0x8a93a0, 0.12, 0.96);
  const scope = createMaterial(0x3a424d, 0.18, 0.86, 0x5a6675, 0.34);
  const lens = createMaterial(0x243957, 0.05, 0.34, 0x4b88d8, 0.82);
  const stock = createMaterial(0x43513c, 0.72, 0.08);
  const grip = createMaterial(0x2c3422, 0.86, 0.04);
  const mount = createMaterial(0x56606f, 0.32, 0.88);
  const bolt = createMaterial(0xa1aec0, 0.12, 0.95);

  put(group, createBox(0.72, 0.17, 0.078, action), 0, 0, 0);
  put(group, createBox(0.68, 0.05, 0.072, action), 0, 0.11, 0);
  put(group, createBox(0.72, 0.065, 0.065, stock), 0, -0.056, 0);

  put(group, createCylinder(0.024, 0.024, 1.32, 16, barrel), 0.87, 0.04, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.032, 0.032, 0.09, 12, barrel), 0.64, 0.04, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.04, 0.035, 0.1, 8, barrel), 1.485, 0.04, 0, 0, 0, CYLINDER_ALONG_X);
  for (let index = 0; index < 3; index += 1) {
    put(group, createBox(0.024, 0.028, 0.044, action), 1.46 + index * 0.026, 0.066, 0);
  }
  put(group, createCylinder(0.03, 0.038, 0.03, 8, barrel), 1.548, 0.04, 0, 0, 0, CYLINDER_ALONG_X);

  put(group, createCylinder(0.052, 0.052, 0.56, 20, scope), 0.08, 0.236, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.062, 0.052, 0.055, 18, scope), -0.155, 0.236, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.064, 0.052, 0.065, 18, scope), 0.315, 0.236, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.05, 0.05, 0.008, 18, lens), -0.188, 0.236, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.048, 0.048, 0.008, 18, lens), 0.352, 0.236, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.016, 0.016, 0.09, 8, scope), 0.08, 0.322, 0, 0, 0, CYLINDER_ALONG_X);
  put(group, createCylinder(0.018, 0.018, 0.044, 8, mount), 0.08, 0.29, 0);
  put(group, createCylinder(0.013, 0.013, 0.008, 6, bolt), 0.08, 0.316, 0);
  for (const xPos of [-0.06, 0.2]) {
    put(group, createBox(0.032, 0.058, 0.044, mount), xPos, 0.152, 0);
    put(group, createBox(0.042, 0.016, 0.048, mount), xPos, 0.122, 0);
    put(group, createBox(0.028, 0.016, 0.048, mount), xPos, 0.198, 0);
  }

  put(group, createBox(0.62, 0.165, 0.078, stock), -0.45, -0.03, 0);
  put(group, createBox(0.32, 0.068, 0.035, stock), -0.35, 0.073, -0.056);
  put(group, createBox(0.16, 0.08, 0.08, createMaterial(0x0c1009, 0.95, 0.05)), -0.265, -0.022, 0);
  put(group, createBox(0.034, 0.2, 0.088, grip), -0.768, -0.022, 0);

  const pistolGrip = new THREE.Group();
  put(pistolGrip, createBox(0.058, 0.22, 0.074, grip), 0, -0.065, 0);
  for (let index = 0; index < 5; index += 1) {
    put(
      pistolGrip,
      createBox(0.06, 0.011, 0.076, createMaterial(0x08100a, 0.93, 0.02)),
      0,
      -0.014 - index * 0.036,
      0
    );
  }
  put(pistolGrip, createBox(0.05, 0.065, 0.072, grip), 0, 0.125, 0);
  pistolGrip.position.set(-0.08, -0.09, 0);
  pistolGrip.rotation.z = 0.22;
  group.add(pistolGrip);

  put(group, createBox(0.155, 0.012, 0.05, action), -0.1, -0.105, 0);
  put(group, createBox(0.012, 0.078, 0.05, action), -0.022, -0.067, 0);
  put(group, createBox(0.012, 0.078, 0.05, action), -0.177, -0.067, 0);
  put(group, createBox(0.01, 0.048, 0.013, bolt), -0.1, -0.065, 0);

  put(group, createCylinder(0.014, 0.014, 0.15, 8, bolt), 0.1, 0.088, 0.037, CYLINDER_ALONG_Z);
  put(group, createCylinder(0.03, 0.03, 0.042, 12, bolt), 0.1, 0.088, 0.115, CYLINDER_ALONG_Z);
  for (let index = 0; index < 4; index += 1) {
    put(group, createCylinder(0.032, 0.032, 0.004, 12, action), 0.1, 0.088, 0.098 + index * 0.011, CYLINDER_ALONG_Z);
  }

  const magazine = new THREE.Group();
  put(magazine, createBox(0.058, 0.15, 0.065, action), 0, -0.055, 0);
  put(magazine, createBox(0.063, 0.024, 0.068, grip), 0, -0.138, 0);
  put(magazine, createBox(0.055, 0.028, 0.062, mount), 0, 0.089, 0);
  magazine.position.set(-0.04, -0.147, 0);
  group.add(magazine);

  group.position.set(-0.39, 0.02, 0);
  return group;
}

export function createWeaponViewModel(weaponId, { muzzleFlashMap } = {}) {
  const normalizedWeaponId = String(weaponId ?? "m4a1")
    .trim()
    .toLowerCase();

  if (normalizedWeaponId === "spas12") {
    return finalizeWeaponView({
      weaponId: "spas12",
      buildModel: buildSpasModel,
      muzzlePosition: { x: 0.82, y: 0.07, z: 0 },
      aimReferencePosition: { x: 0.8, y: 0.132, z: 0 },
      handAnchorPosition: { x: -0.18, y: -0.095, z: 0 },
      muzzleFlashMap
    });
  }

  if (normalizedWeaponId === "awp") {
    return finalizeWeaponView({
      weaponId: "awp",
      buildModel: buildAwpModel,
      muzzlePosition: { x: 1.56, y: 0.04, z: 0 },
      aimReferencePosition: { x: -0.188, y: 0.236, z: 0 },
      handAnchorPosition: { x: -0.08, y: -0.09, z: 0 },
      muzzleFlashMap
    });
  }

  return finalizeWeaponView({
    weaponId: "m4a1",
    buildModel: buildM4Model,
    muzzlePosition: { x: 1.27, y: 0.08, z: 0 },
    aimReferencePosition: { x: 0.488, y: 0.272, z: 0 },
    handAnchorPosition: { x: -0.19, y: -0.09, z: 0 },
    muzzleFlashMap
  });
}
