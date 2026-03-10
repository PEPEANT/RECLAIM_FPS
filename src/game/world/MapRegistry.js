import { createMapBuilder } from "./MapBuilder.js";
import { getInitialOnlineMapId } from "../../shared/onlineMapRotation.js";
import { generateCityFrontlineMap } from "./maps/cityFrontlineMap.js";
import { generateForestFrontlineMap } from "./maps/forestFrontlineMap.js";
import { generateTrainingCompoundMap } from "./maps/trainingCompoundMap.js";

const DEFAULT_MAP_ID = getInitialOnlineMapId();

const MAP_GENERATORS = Object.freeze({
  [DEFAULT_MAP_ID]: generateForestFrontlineMap,
  forest_frontline_v2: generateForestFrontlineMap,
  city_frontline: generateCityFrontlineMap,
  training_compound: generateTrainingCompoundMap
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
