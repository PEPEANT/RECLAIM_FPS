import { createMapBuilder } from "./MapBuilder.js";
import { generateForestFrontlineMap } from "./maps/forestFrontlineMap.js";

const DEFAULT_MAP_ID = "forest_frontline";

const MAP_GENERATORS = Object.freeze({
  [DEFAULT_MAP_ID]: generateForestFrontlineMap
});

export function getDefaultMapId() {
  return DEFAULT_MAP_ID;
}

export function buildSelectedMap(world, options = {}) {
  const mapId = String(options.mapId ?? DEFAULT_MAP_ID);
  const generator = MAP_GENERATORS[mapId] ?? MAP_GENERATORS[DEFAULT_MAP_ID];
  const builder = createMapBuilder(world);
  const result = generator(builder, options);
  return result && typeof result === "object" ? result : null;
}

