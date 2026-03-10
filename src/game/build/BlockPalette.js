const BLOCK_TYPE_DATA = [
  ["grass", "잔디", "#5fae45"],
  ["dirt", "흙", "#7b5a3b"],
  ["stone", "돌", "#858d95"],
  ["sand", "모래", "#cfbe7e"],
  ["clay", "점토", "#a67957"],
  ["brick", "벽돌", "#9b4d3f"],
  ["ice", "얼음", "#9fd9ff"],
  ["metal", "금속", "#6d7685"]
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
