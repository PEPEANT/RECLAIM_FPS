const BLOCK_TYPE_DATA = [
  ["grass", "Grass", "#5fae45"],
  ["dirt", "Dirt", "#916b47"],
  ["stone", "Stone", "#9ea7b2"],
  ["sand", "Sand", "#cfbe7e"],
  ["clay", "Clay", "#bc8d67"],
  ["brick", "Brick", "#b66556"],
  ["ice", "White", "#f2f5fb"],
  ["metal", "Road", "#505965"]
];

export const BLOCK_TYPES = Object.freeze(
  BLOCK_TYPE_DATA.map(([key, name, color], index) =>
    Object.freeze({
      id: index + 1,
      key,
      name,
      texture: null,
      color
    })
  )
);

export const BLOCK_TYPE_COUNT = BLOCK_TYPES.length;
export const BLOCK_TYPE_BY_ID = new Map(BLOCK_TYPES.map((type) => [type.id, type]));

export function getBlockTypeBySlot(slot) {
  return BLOCK_TYPES[Math.max(0, Math.min(BLOCK_TYPES.length - 1, slot - 1))];
}
