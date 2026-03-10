export const ONLINE_MAP_ROTATION = Object.freeze(["forest_frontline", "city_frontline"]);

const ONLINE_MAP_CONFIGS = Object.freeze({
  forest_frontline: Object.freeze({
    id: "forest_frontline",
    name: "FOREST FRONTLINE",
    description: "숲 전선 · 넓은 초원 외곽 · CTF 메인 전장",
    alphaBase: Object.freeze({ x: -54, y: 0, z: 0 }),
    bravoBase: Object.freeze({ x: 54, y: 0, z: 0 }),
    alphaFlag: Object.freeze({ x: -62, y: 0, z: 0 }),
    bravoFlag: Object.freeze({ x: 62, y: 0, z: 0 }),
    mid: Object.freeze({ x: 0, y: 0, z: 0 }),
    halfExtent: 88
  }),
  city_frontline: Object.freeze({
    id: "city_frontline",
    name: "CITY FRONTLINE",
    description: "확장 도시 전장 · 고층 엄폐 · 외곽 초원 링",
    alphaBase: Object.freeze({ x: -78, y: 0, z: 0 }),
    bravoBase: Object.freeze({ x: 78, y: 0, z: 0 }),
    alphaFlag: Object.freeze({ x: -92, y: 0, z: 0 }),
    bravoFlag: Object.freeze({ x: 92, y: 0, z: 0 }),
    mid: Object.freeze({ x: 0, y: 0, z: 0 }),
    halfExtent: 116
  })
});

export function getInitialOnlineMapId() {
  return ONLINE_MAP_ROTATION[0];
}

export function normalizeOnlineMapId(mapId) {
  const value = String(mapId ?? "")
    .trim()
    .toLowerCase();
  if (value === "forest_frontline_v2") {
    return "forest_frontline";
  }
  return ONLINE_MAP_CONFIGS[value] ? value : getInitialOnlineMapId();
}

export function getOnlineMapConfig(mapId) {
  const normalized = normalizeOnlineMapId(mapId);
  return ONLINE_MAP_CONFIGS[normalized] ?? ONLINE_MAP_CONFIGS[getInitialOnlineMapId()];
}

export function getNextOnlineMapId(mapId) {
  const normalized = normalizeOnlineMapId(mapId);
  const currentIndex = ONLINE_MAP_ROTATION.indexOf(normalized);
  if (currentIndex < 0) {
    return getInitialOnlineMapId();
  }
  return ONLINE_MAP_ROTATION[(currentIndex + 1) % ONLINE_MAP_ROTATION.length];
}
