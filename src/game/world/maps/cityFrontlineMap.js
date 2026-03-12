import { createNoise2D } from "simplex-noise";

const BLOCK = Object.freeze({
  grass: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  clay: 5,
  brick: 6,
  ice: 7,
  metal: 8
});

const ROAD_BLOCK = BLOCK.metal;
const SIDEWALK_BLOCK = BLOCK.stone;

const DEFAULT_MAP_SEED = 20260310;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(x, z, seed) {
  let n = (x * 374761393 + z * 668265263 + seed * 1442695041) >>> 0;
  n = (n ^ (n >> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

function clearVolume(builder, minX, maxX, minY, maxY, minZ, maxZ) {
  for (let y = minY; y <= maxY; y += 1) {
    builder.carveRect(minX, maxX, y, minZ, maxZ);
  }
}

function plantTree(builder, x, y, z, seed) {
  const trunkHeight = 4 + Math.floor(hash2D(x + 11, z - 7, seed) * 2);
  for (let i = 1; i <= trunkHeight; i += 1) {
    if (!builder.hasBlock(x, y + i, z)) {
      builder.setBlock(x, y + i, z, BLOCK.brick);
    }
  }

  const topY = y + trunkHeight;
  for (let dy = -1; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        const distance = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy);
        if (distance > 4) {
          continue;
        }
        const px = x + dx;
        const py = topY + dy;
        const pz = z + dz;
        if (!builder.hasBlock(px, py, pz)) {
          builder.setBlock(px, py, pz, BLOCK.grass);
        }
      }
    }
  }
}

function paveSurface(builder, surfaceMap, minX, maxX, minZ, maxZ, typeId) {
  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      const topY = surfaceMap.get(builder.key(x, z));
      const foundationY = Number.isFinite(topY) ? Math.max(-1, Math.min(0, topY)) : -1;
      builder.fillRect(x, x, foundationY - 1, foundationY, z, z, typeId);
      clearVolume(builder, x, x, foundationY + 1, 18, z, z);
    }
  }
}

function buildPerimeterMeadow(builder, surfaceMap, halfExtent, seed) {
  const meadowBand = halfExtent - 28;
  for (let x = -halfExtent + 6; x <= halfExtent - 6; x += 2) {
    for (let z = -halfExtent + 6; z <= halfExtent - 6; z += 2) {
      const axisDistance = Math.max(Math.abs(x), Math.abs(z));
      if (axisDistance < meadowBand) {
        continue;
      }
      if (Math.abs(z) <= 10 && Math.abs(x) <= halfExtent - 8) {
        continue;
      }
      const topY = surfaceMap.get(builder.key(x, z));
      if (!Number.isFinite(topY) || topY < -2 || topY > 4) {
        continue;
      }
      const rnd = hash2D(x, z, seed);
      if (rnd < 0.03) {
        plantTree(builder, x, topY, z, seed);
        continue;
      }
      if (rnd < 0.055) {
        builder.setBlock(x, topY + 1, z, BLOCK.grass);
        if (!builder.hasBlock(x + 1, topY + 1, z)) {
          builder.setBlock(x + 1, topY + 1, z, BLOCK.dirt);
        }
      }
    }
  }
}

function buildTeamBase(builder, { centerX, centerZ, gateDirection, wallType, accentType }) {
  const halfX = 16;
  const halfZ = 13;
  const minX = centerX - halfX;
  const maxX = centerX + halfX;
  const minZ = centerZ - halfZ;
  const maxZ = centerZ + halfZ;

  builder.fillRect(minX, maxX, -1, 0, minZ, maxZ, BLOCK.stone);
  builder.fillRect(centerX - 5, centerX + 5, 0, 0, centerZ - 4, centerZ + 4, BLOCK.metal);

  for (let y = 1; y <= 6; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const border = x === minX || x === maxX || z === minZ || z === maxZ;
        if (!border) {
          continue;
        }

        const gateWest =
          gateDirection === "west" && x === minX && Math.abs(z - centerZ) <= 3 && y <= 4;
        const gateEast =
          gateDirection === "east" && x === maxX && Math.abs(z - centerZ) <= 3 && y <= 4;
        if (gateWest || gateEast) {
          continue;
        }

        builder.setBlock(x, y, z, y >= 5 ? accentType : wallType);
      }
    }
  }

  clearVolume(builder, minX + 1, maxX - 1, 1, 5, minZ + 1, maxZ - 1);

  const towerOffsets = [
    [minX, minZ],
    [minX, maxZ],
    [maxX, minZ],
    [maxX, maxZ]
  ];
  for (const [tx, tz] of towerOffsets) {
    builder.fillRect(tx - 1, tx + 1, 1, 9, tz - 1, tz + 1, accentType);
  }

  if (gateDirection === "east") {
    builder.fillRect(maxX + 1, maxX + 18, -1, 0, centerZ - 5, centerZ + 5, ROAD_BLOCK);
  } else {
    builder.fillRect(minX - 18, minX - 1, -1, 0, centerZ - 5, centerZ + 5, ROAD_BLOCK);
  }
}

function buildRoadGrid(builder, surfaceMap, halfExtent) {
  const majorRoads = [
    { minX: -halfExtent + 6, maxX: halfExtent - 6, minZ: -8, maxZ: 8 },
    { minX: -8, maxX: 8, minZ: -halfExtent + 8, maxZ: halfExtent - 8 },
    { minX: -90, maxX: 90, minZ: -36, maxZ: -24 },
    { minX: -90, maxX: 90, minZ: 24, maxZ: 36 },
    { minX: -36, maxX: -24, minZ: -82, maxZ: 82 },
    { minX: 24, maxX: 36, minZ: -82, maxZ: 82 },
    { minX: -104, maxX: -72, minZ: -8, maxZ: 8 },
    { minX: 72, maxX: 104, minZ: -8, maxZ: 8 }
  ];
  for (const road of majorRoads) {
    paveSurface(builder, surfaceMap, road.minX, road.maxX, road.minZ, road.maxZ, ROAD_BLOCK);
  }

  const sideRoads = [
    { minX: -78, maxX: -70, minZ: -54, maxZ: -10 },
    { minX: -78, maxX: -70, minZ: 10, maxZ: 54 },
    { minX: 70, maxX: 78, minZ: -54, maxZ: -10 },
    { minX: 70, maxX: 78, minZ: 10, maxZ: 54 },
    { minX: -54, maxX: -10, minZ: -78, maxZ: -70 },
    { minX: 10, maxX: 54, minZ: -78, maxZ: -70 },
    { minX: -54, maxX: -10, minZ: 70, maxZ: 78 },
    { minX: 10, maxX: 54, minZ: 70, maxZ: 78 }
  ];
  for (const road of sideRoads) {
    paveSurface(builder, surfaceMap, road.minX, road.maxX, road.minZ, road.maxZ, ROAD_BLOCK);
  }
}

function buildCoverBarrier(builder, minX, maxX, minZ, maxZ, { height = 2, typeId = BLOCK.stone } = {}) {
  builder.fillRect(minX, maxX, 1, height, minZ, maxZ, typeId);
}

function buildTrafficFurniture(builder, surfaceMap) {
  const sidewalks = [
    { minX: -110, maxX: 110, minZ: -12, maxZ: -9, typeId: SIDEWALK_BLOCK },
    { minX: -110, maxX: 110, minZ: 9, maxZ: 12, typeId: SIDEWALK_BLOCK },
    { minX: -12, maxX: -9, minZ: -108, maxZ: 108, typeId: SIDEWALK_BLOCK },
    { minX: 9, maxX: 12, minZ: -108, maxZ: 108, typeId: SIDEWALK_BLOCK },
    { minX: -92, maxX: 92, minZ: -38, maxZ: -37, typeId: SIDEWALK_BLOCK },
    { minX: -92, maxX: 92, minZ: 37, maxZ: 38, typeId: SIDEWALK_BLOCK },
    { minX: -38, maxX: -37, minZ: -82, maxZ: 82, typeId: SIDEWALK_BLOCK },
    { minX: 37, maxX: 38, minZ: -82, maxZ: 82, typeId: SIDEWALK_BLOCK }
  ];
  for (const walkway of sidewalks) {
    paveSurface(builder, surfaceMap, walkway.minX, walkway.maxX, walkway.minZ, walkway.maxZ, walkway.typeId);
  }

  const roadCover = [
    { minX: -4, maxX: 4, minZ: -54, maxZ: -44, height: 2 },
    { minX: -4, maxX: 4, minZ: 44, maxZ: 54, height: 2 },
    { minX: -56, maxX: -46, minZ: -4, maxZ: 4, height: 2 },
    { minX: 46, maxX: 56, minZ: -4, maxZ: 4, height: 2 },
    { minX: -72, maxX: -66, minZ: -18, maxZ: -12, height: 3, typeId: BLOCK.brick },
    { minX: -72, maxX: -66, minZ: 12, maxZ: 18, height: 3, typeId: BLOCK.brick },
    { minX: 66, maxX: 72, minZ: -18, maxZ: -12, height: 3, typeId: BLOCK.clay },
    { minX: 66, maxX: 72, minZ: 12, maxZ: 18, height: 3, typeId: BLOCK.clay }
  ];
  for (const cover of roadCover) {
    buildCoverBarrier(builder, cover.minX, cover.maxX, cover.minZ, cover.maxZ, {
      height: cover.height,
      typeId: cover.typeId ?? BLOCK.stone
    });
  }
}

function buildCentralPlaza(builder) {
  builder.fillRect(-16, 16, -1, 0, -16, 16, SIDEWALK_BLOCK);
  builder.fillRect(-4, 4, 1, 2, -4, 4, BLOCK.metal);

  const coverIslands = [
    { minX: -14, maxX: -9, minZ: -6, maxZ: -2 },
    { minX: 9, maxX: 14, minZ: -6, maxZ: -2 },
    { minX: -14, maxX: -9, minZ: 2, maxZ: 6 },
    { minX: 9, maxX: 14, minZ: 2, maxZ: 6 }
  ];
  for (const island of coverIslands) {
    buildCoverBarrier(builder, island.minX, island.maxX, island.minZ, island.maxZ, {
      height: 2,
      typeId: BLOCK.stone
    });
  }

  buildCoverBarrier(builder, -24, -18, -2, 2, { height: 2, typeId: BLOCK.clay });
  buildCoverBarrier(builder, 18, 24, -2, 2, { height: 2, typeId: BLOCK.brick });
  buildCoverBarrier(builder, -2, 2, -24, -18, { height: 2, typeId: BLOCK.clay });
  buildCoverBarrier(builder, -2, 2, 18, 24, { height: 2, typeId: BLOCK.brick });
}

function buildCityBlock(
  builder,
  {
    minX,
    maxX,
    minZ,
    maxZ,
    height,
    wallType = BLOCK.brick,
    trimType = BLOCK.metal,
    floorType = BLOCK.stone,
    doorSide = "south"
  }
) {
  builder.fillRect(minX, maxX, -1, 0, minZ, maxZ, floorType);

  for (let y = 1; y <= height; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const border = x === minX || x === maxX || z === minZ || z === maxZ;
        if (!border) {
          continue;
        }
        builder.setBlock(x, y, z, y === height ? trimType : wallType);
      }
    }
  }

  clearVolume(builder, minX + 1, maxX - 1, 1, height - 1, minZ + 1, maxZ - 1);
  builder.fillRect(minX, maxX, height, height, minZ, maxZ, trimType);

  const centerX = Math.round((minX + maxX) * 0.5);
  const centerZ = Math.round((minZ + maxZ) * 0.5);
  if (doorSide === "south") {
    clearVolume(builder, centerX - 1, centerX + 1, 1, 3, minZ, minZ);
  } else if (doorSide === "north") {
    clearVolume(builder, centerX - 1, centerX + 1, 1, 3, maxZ, maxZ);
  } else if (doorSide === "west") {
    clearVolume(builder, minX, minX, 1, 3, centerZ - 1, centerZ + 1);
  } else {
    clearVolume(builder, maxX, maxX, 1, 3, centerZ - 1, centerZ + 1);
  }

  for (let y = 3; y <= height - 2; y += 3) {
    for (let x = minX + 2; x <= maxX - 2; x += 4) {
      builder.setBlock(x, y, minZ, BLOCK.ice);
      builder.setBlock(x, y, maxZ, BLOCK.ice);
    }
    for (let z = minZ + 2; z <= maxZ - 2; z += 4) {
      builder.setBlock(minX, y, z, BLOCK.ice);
      builder.setBlock(maxX, y, z, BLOCK.ice);
    }
  }

  builder.fillRect(centerX - 1, centerX + 1, height + 1, height + 2, centerZ - 1, centerZ + 1, trimType);
}

function buildCityCenter(builder) {
  const blocks = [
    { minX: -62, maxX: -46, minZ: -48, maxZ: -30, height: 12, wallType: BLOCK.brick, trimType: BLOCK.metal, doorSide: "east" },
    { minX: -28, maxX: -12, minZ: -48, maxZ: -30, height: 15, wallType: BLOCK.clay, trimType: BLOCK.metal, doorSide: "south" },
    { minX: 12, maxX: 30, minZ: -48, maxZ: -28, height: 13, wallType: BLOCK.brick, trimType: BLOCK.stone, doorSide: "west" },
    { minX: 44, maxX: 62, minZ: -46, maxZ: -28, height: 10, wallType: BLOCK.clay, trimType: BLOCK.metal, doorSide: "west" },
    { minX: -64, maxX: -44, minZ: 28, maxZ: 48, height: 11, wallType: BLOCK.clay, trimType: BLOCK.stone, doorSide: "east" },
    { minX: -30, maxX: -12, minZ: 28, maxZ: 48, height: 16, wallType: BLOCK.brick, trimType: BLOCK.metal, doorSide: "north" },
    { minX: 10, maxX: 28, minZ: 28, maxZ: 48, height: 12, wallType: BLOCK.clay, trimType: BLOCK.metal, doorSide: "west" },
    { minX: 42, maxX: 64, minZ: 26, maxZ: 50, height: 18, wallType: BLOCK.brick, trimType: BLOCK.metal, doorSide: "north" },
    { minX: -23, maxX: -9, minZ: -14, maxZ: 14, height: 9, wallType: BLOCK.brick, trimType: BLOCK.stone, doorSide: "east" },
    { minX: 9, maxX: 23, minZ: -14, maxZ: 14, height: 9, wallType: BLOCK.clay, trimType: BLOCK.stone, doorSide: "west" }
  ];

  for (const block of blocks) {
    buildCityBlock(builder, block);
  }

  builder.fillRect(-70, -58, 1, 4, -10, 10, BLOCK.stone);
  builder.fillRect(58, 70, 1, 4, -10, 10, BLOCK.stone);
  builder.fillRect(-8, 8, 1, 2, -56, -50, BLOCK.stone);
  builder.fillRect(-8, 8, 1, 2, 50, 56, BLOCK.stone);
}

function buildSkylineBackdrop(builder) {
  const silhouettes = [
    [-96, -88, -52, -42, 15, BLOCK.brick],
    [-84, -76, 40, 52, 19, BLOCK.clay],
    [-18, -10, -84, -74, 21, BLOCK.brick],
    [12, 20, 72, 84, 23, BLOCK.clay],
    [78, 88, -64, -52, 18, BLOCK.brick],
    [94, 104, 34, 46, 20, BLOCK.clay]
  ];

  for (const [minX, maxX, minZ, maxZ, height, typeId] of silhouettes) {
    builder.fillRect(minX, maxX, -1, 0, minZ, maxZ, BLOCK.stone);
    builder.fillRect(minX, maxX, 1, height, minZ, maxZ, typeId);
    clearVolume(builder, minX + 1, maxX - 1, 1, height - 1, minZ + 1, maxZ - 1);
    builder.fillRect(minX, maxX, height, height, minZ, maxZ, BLOCK.metal);
  }
}

export function generateCityFrontlineMap(builder, options = {}) {
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) : DEFAULT_MAP_SEED;
  const random = mulberry32(seed);
  const noise2D = createNoise2D(random);

  const halfExtent = 116;
  const minY = -8;
  const surfaceMap = new Map();

  for (let x = -halfExtent; x <= halfExtent; x += 1) {
    for (let z = -halfExtent; z <= halfExtent; z += 1) {
      const axisDistance = Math.max(Math.abs(x), Math.abs(z));
      const edgeDistance = halfExtent - axisDistance;
      const outerMeadowAlpha = clamp((axisDistance - (halfExtent - 28)) / 18, 0, 1);
      const cityCoreAlpha = 1 - clamp((axisDistance - 18) / 48, 0, 1);

      const n1 = noise2D(x * 0.038, z * 0.038);
      const n2 = noise2D(x * 0.091 + 24.3, z * 0.091 - 15.9);
      const ridgeNoise = Math.max(0, noise2D(x * 0.022 - 8.7, z * 0.022 + 5.4));
      const rolling = Math.round(n1 * 1.8 + n2 * 1.1);
      const meadowLift = Math.round(outerMeadowAlpha * (3 + ridgeNoise * 3));
      const cityFlatten = Math.round(cityCoreAlpha * (2.2 + Math.max(0, n2) * 1.6));
      const edgeRise = Math.round(clamp((14 - edgeDistance) / 14, 0, 1) * (2 + ridgeNoise * 2));

      let topY = -1 + rolling + meadowLift + edgeRise - cityFlatten;
      if (Math.abs(z) <= 6 || Math.abs(x) <= 6) {
        topY = Math.min(topY, -1);
      }
      if (Math.abs(x) <= 72 && Math.abs(z) <= 56) {
        topY = Math.min(topY, 0);
      }
      topY = clamp(topY, -2, 12);
      surfaceMap.set(builder.key(x, z), topY);

      for (let y = minY; y <= topY; y += 1) {
        let typeId = BLOCK.stone;
        if (y >= topY - 2) {
          typeId = BLOCK.dirt;
        }
        if (y === topY) {
          typeId = outerMeadowAlpha > 0.1 ? BLOCK.grass : cityCoreAlpha > 0.45 ? BLOCK.dirt : BLOCK.grass;
        }
        builder.setBlock(x, y, z, typeId);
      }
    }
  }

  buildRoadGrid(builder, surfaceMap, halfExtent);
  buildCentralPlaza(builder);
  buildTeamBase(builder, {
    centerX: -86,
    centerZ: 0,
    gateDirection: "east",
    wallType: BLOCK.clay,
    accentType: BLOCK.brick
  });
  buildTeamBase(builder, {
    centerX: 86,
    centerZ: 0,
    gateDirection: "west",
    wallType: BLOCK.brick,
    accentType: BLOCK.clay
  });
  buildTrafficFurniture(builder, surfaceMap);
  buildCityCenter(builder);
  buildSkylineBackdrop(builder);
  buildPerimeterMeadow(builder, surfaceMap, halfExtent, seed);

  return {
    arenaMeta: {
      alphaBase: { x: -78, y: 0, z: 0 },
      bravoBase: { x: 78, y: 0, z: 0 },
      alphaFlag: { x: -92, y: 0, z: 0 },
      bravoFlag: { x: 92, y: 0, z: 0 },
      mid: { x: 0, y: 0, z: 0 },
      trainingSpawn: { x: -78, y: 0, z: 0 },
      halfExtent
    }
  };
}
