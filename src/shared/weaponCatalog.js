export const DEFAULT_WEAPON_ID = "m4a1";

export const WEAPON_CATALOG = Object.freeze([
  Object.freeze({
    id: "m4a1",
    name: "M4A1",
    category: "ASSAULT RIFLE",
    description: "균형형 자동소총. 빠른 연사와 안정적인 제어.",
    magazineSize: 30,
    reserve: 150,
    reloadDuration: 1.28,
    shotCooldown: 0.132,
    shotSound: "shot:m4a1",
    shotGain: 0.78,
    shotRateJitter: 0.004,
    soundMinIntervalMs: 108,
    damage: 24,
    recoilKick: 1,
    recoilRecover: 8.8,
    recoilDistance: 0.07,
    recoilPitch: 0.18,
    pelletCount: 1,
    pelletDamage: 24,
    headshotMultiplier: 1.7,
    aimFov: 52,
    viewScale: 0.61,
    bobScale: 1,
    hipSpread: 0.006,
    aimSpread: 0.0019,
    hipOffset: { x: 0.24, y: -0.25, z: -0.44 },
    aimOffset: { x: 0.018, y: -0.11, z: -0.24 },
    aimReferenceTarget: { x: 0, y: 0.002, z: -0.19 },
    hipRotation: { x: -0.04, y: 0.22, z: 0.02 },
    aimRotation: { x: -0.004, y: 0, z: 0 }
  }),
  Object.freeze({
    id: "spas12",
    name: "SPAS-12",
    category: "SHOTGUN",
    description: "근거리 고화력 산탄총. 사거리는 짧지만 한 방이 강함.",
    magazineSize: 8,
    reserve: 48,
    reloadDuration: 1.76,
    shotCooldown: 0.72,
    shotSound: "shot:spas12",
    shotGain: 0.9,
    shotRateJitter: 0.018,
    soundMinIntervalMs: 300,
    damage: 117,
    recoilKick: 1.24,
    recoilRecover: 6.7,
    recoilDistance: 0.098,
    recoilPitch: 0.24,
    pelletCount: 9,
    pelletDamage: 13,
    headshotMultiplier: 1.35,
    damageFalloffStart: 7,
    damageFalloffEnd: 28,
    minDamageScale: 0.22,
    aimFov: 58,
    viewScale: 0.67,
    bobScale: 0.9,
    hipSpread: 0.068,
    aimSpread: 0.03,
    spreadPattern: "circle",
    spreadRadiusScale: 1.15,
    hipOffset: { x: 0.27, y: -0.27, z: -0.5 },
    aimOffset: { x: 0.024, y: -0.12, z: -0.29 },
    aimReferenceTarget: { x: 0, y: 0.004, z: -0.22 },
    hipRotation: { x: -0.06, y: 0.2, z: 0.018 },
    aimRotation: { x: -0.008, y: 0, z: 0 }
  }),
  Object.freeze({
    id: "awp",
    name: "AWP",
    category: "SNIPER RIFLE",
    description: "장거리 정밀소총. 느리지만 강력한 일격.",
    magazineSize: 1,
    reserve: 20,
    reloadDuration: 1.95,
    shotCooldown: 0.24,
    shotSound: "shot:awp",
    shotGain: 1,
    shotRateJitter: 0.012,
    soundMinIntervalMs: 680,
    damage: 100,
    recoilKick: 1.45,
    recoilRecover: 5.2,
    recoilDistance: 0.12,
    recoilPitch: 0.34,
    pelletCount: 1,
    pelletDamage: 100,
    headshotMultiplier: 1.9,
    aimFov: 26,
    viewScale: 0.76,
    bobScale: 0.72,
    hipSpread: 0.0022,
    aimSpread: 0.0004,
    hipOffset: { x: 0.28, y: -0.27, z: -0.55 },
    aimOffset: { x: 0.018, y: -0.102, z: -0.43 },
    aimReferenceTarget: { x: 0, y: -0.002, z: -0.14 },
    hipRotation: { x: -0.05, y: 0.18, z: 0.015 },
    aimRotation: { x: -0.004, y: 0, z: 0 }
  })
]);

const WEAPON_BY_ID = new Map(WEAPON_CATALOG.map((weapon) => [weapon.id, weapon]));

export function sanitizeWeaponId(rawWeaponId) {
  const weaponId = String(rawWeaponId ?? "")
    .trim()
    .toLowerCase();
  return WEAPON_BY_ID.has(weaponId) ? weaponId : DEFAULT_WEAPON_ID;
}

export function getWeaponDefinition(rawWeaponId) {
  const weaponId = sanitizeWeaponId(rawWeaponId);
  return WEAPON_BY_ID.get(weaponId) ?? WEAPON_BY_ID.get(DEFAULT_WEAPON_ID);
}
