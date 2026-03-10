const BLOCK_TYPE_DATA = [
  {
    key: "grass",
    name: "Grass",
    color: "#72be5c",
    emissive: "#1f3b1b",
    emissiveIntensity: 0.08
  },
  {
    key: "dirt",
    name: "Dirt",
    color: "#bc9267",
    emissive: "#50311a",
    emissiveIntensity: 0.18
  },
  {
    key: "stone",
    name: "Stone",
    color: "#a9b1bb",
    emissive: "#1a1e24",
    emissiveIntensity: 0.04
  },
  {
    key: "sand",
    name: "Sand",
    color: "#d9c78b",
    emissive: "#473d1f",
    emissiveIntensity: 0.08
  },
  {
    key: "clay",
    name: "Clay",
    color: "#d7ab88",
    emissive: "#663a22",
    emissiveIntensity: 0.2
  },
  {
    key: "brick",
    name: "Brick",
    color: "#cd8b7c",
    emissive: "#5f281d",
    emissiveIntensity: 0.22
  },
  {
    key: "ice",
    name: "White",
    color: "#f2f5fb",
    emissive: "#d7e6f7",
    emissiveIntensity: 0.06
  },
  {
    key: "metal",
    name: "Road",
    color: "#626c78",
    emissive: "#1a2028",
    emissiveIntensity: 0.05,
    roughness: 0.72,
    metalness: 0.14
  }
];

export const BLOCK_TYPES = Object.freeze(
  BLOCK_TYPE_DATA.map((entry, index) =>
    Object.freeze({
      id: index + 1,
      texture: null,
      ...entry
    })
  )
);

export const BLOCK_TYPE_COUNT = BLOCK_TYPES.length;
export const BLOCK_TYPE_BY_ID = new Map(BLOCK_TYPES.map((type) => [type.id, type]));

export function getBlockTypeBySlot(slot) {
  return BLOCK_TYPES[Math.max(0, Math.min(BLOCK_TYPES.length - 1, slot - 1))];
}
