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

const DEFAULT_MAP_SEED = 20260227;

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

function clearRectVolume(builder, minX, maxX, minY, maxY, minZ, maxZ) {
  for (let y = minY; y <= maxY; y += 1) {
    builder.carveRect(minX, maxX, y, minZ, maxZ);
  }
}

function buildFlagFortress(
  builder,
  {
    centerX,
    centerZ,
    gateDirection,
    wallType = BLOCK.stone,
    floorType = BLOCK.sand,
    accentType = BLOCK.metal
  }
) {
  const half = 8;
  const minX = centerX - half;
  const maxX = centerX + half;
  const minZ = centerZ - half;
  const maxZ = centerZ + half;

  builder.fillRect(minX, maxX, -1, 0, minZ, maxZ, floorType);
  builder.fillRect(centerX - 3, centerX + 3, 0, 0, centerZ - 3, centerZ + 3, BLOCK.clay);

  for (let y = 1; y <= 5; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const border = x === minX || x === maxX || z === minZ || z === maxZ;
        if (!border) {
          continue;
        }

        const gateEast =
          gateDirection === "east" && x === maxX && Math.abs(z - centerZ) <= 2 && y <= 3;
        const gateWest =
          gateDirection === "west" && x === minX && Math.abs(z - centerZ) <= 2 && y <= 3;

        if (gateEast || gateWest) {
          continue;
        }

        builder.setBlock(x, y, z, wallType);
      }
    }
  }

  clearRectVolume(builder, minX + 1, maxX - 1, 1, 4, minZ + 1, maxZ - 1);

  const corners = [
    [minX, minZ],
    [minX, maxZ],
    [maxX, minZ],
    [maxX, maxZ]
  ];
  for (const [tx, tz] of corners) {
    builder.fillRect(tx - 1, tx + 1, 1, 7, tz - 1, tz + 1, accentType);
  }

  builder.fillRect(centerX - 1, centerX + 1, 1, 2, centerZ - 1, centerZ + 1, accentType);
  builder.fillRect(centerX, centerX, 3, 3, centerZ, centerZ, wallType);

  if (gateDirection === "east") {
    builder.fillRect(maxX + 1, maxX + 7, -1, 0, centerZ - 2, centerZ + 2, floorType);
  } else {
    builder.fillRect(minX - 7, minX - 1, -1, 0, centerZ - 2, centerZ + 2, floorType);
  }
}

function buildControlHub(builder) {
  builder.fillRect(-8, 8, -1, 0, -8, 8, BLOCK.stone);
  builder.fillRect(-4, 4, 0, 0, -4, 4, BLOCK.sand);

  builder.fillRect(-1, 1, 1, 3, -1, 1, BLOCK.metal);
  clearRectVolume(builder, 0, 0, 1, 2, 0, 0);

  const pillarCoords = [
    [-6, -6],
    [-6, 6],
    [6, -6],
    [6, 6]
  ];
  for (const [x, z] of pillarCoords) {
    builder.fillRect(x - 1, x + 1, 1, 5, z - 1, z + 1, BLOCK.brick);
  }
}

function plantTree(builder, x, y, z, seed, variant = 0) {
  const trunkHeight = 3 + Math.floor(hash2D(x + 7, z - 11, seed) * 3);
  const trunkType = variant === 0 ? BLOCK.brick : BLOCK.clay;
  const leavesType = variant === 0 ? BLOCK.grass : BLOCK.clay;

  for (let i = 1; i <= trunkHeight; i += 1) {
    if (!builder.hasBlock(x, y + i, z)) {
      builder.setBlock(x, y + i, z, trunkType);
    }
  }

  const topY = y + trunkHeight;
  const canopyRadius = trunkHeight >= 5 ? 2 : 1;
  for (let dy = -1; dy <= 2; dy += 1) {
    for (let dx = -canopyRadius; dx <= canopyRadius; dx += 1) {
      for (let dz = -canopyRadius; dz <= canopyRadius; dz += 1) {
        const d = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy);
        if (d > canopyRadius + 2) {
          continue;
        }
        const px = x + dx;
        const py = topY + dy;
        const pz = z + dz;
        if (!builder.hasBlock(px, py, pz)) {
          builder.setBlock(px, py, pz, leavesType);
        }
      }
    }
  }

  if (!builder.hasBlock(x, topY + 3, z)) {
    builder.setBlock(x, topY + 3, z, BLOCK.grass);
  }
}

function plantForest(builder, halfExtent, surfaceMap, seed) {
  const baseOffset = 44;

  for (let x = -halfExtent + 5; x <= halfExtent - 5; x += 2) {
    for (let z = -halfExtent + 5; z <= halfExtent - 5; z += 2) {
      if (Math.abs(z) <= 5 && Math.abs(x) <= halfExtent - 6) {
        continue;
      }
      if (Math.abs(x) <= 12 && Math.abs(z) <= 12) {
        continue;
      }
      if ((Math.abs(x + baseOffset) <= 14 || Math.abs(x - baseOffset) <= 14) && Math.abs(z) <= 14) {
        continue;
      }

      const topY = surfaceMap.get(builder.key(x, z));
      if (!Number.isFinite(topY) || topY < -2 || topY > 3) {
        continue;
      }

      const rnd = hash2D(x, z, seed);
      if (rnd > 0.068) {
        if (rnd > 0.12 || rnd < 0.1) {
          continue;
        }
        if (!builder.hasBlock(x, topY + 1, z)) {
          builder.setBlock(x, topY + 1, z, BLOCK.grass);
        }
        if (!builder.hasBlock(x + 1, topY + 1, z)) {
          builder.setBlock(x + 1, topY + 1, z, BLOCK.clay);
        }
        continue;
      }

      const variant = rnd < 0.034 ? 0 : 1;
      plantTree(builder, x, topY, z, seed, variant);
    }
  }
}

function carvePathing(builder, halfExtent) {
  builder.fillRect(-halfExtent + 2, halfExtent - 2, -1, -1, -2, 2, BLOCK.sand);
  builder.fillRect(-56, -24, -1, -1, -3, 3, BLOCK.sand);
  builder.fillRect(24, 56, -1, -1, -3, 3, BLOCK.sand);
}

export function generateForestFrontlineMap(builder, options = {}) {
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) : DEFAULT_MAP_SEED;
  const random = mulberry32(seed);
  const noise2D = createNoise2D(random);

  const halfExtent = 60;
  const minY = -8;
  const baseOffset = 44;
  const surfaceMap = new Map();

  for (let x = -halfExtent; x <= halfExtent; x += 1) {
    for (let z = -halfExtent; z <= halfExtent; z += 1) {
      const edgeDistance = halfExtent - Math.max(Math.abs(x), Math.abs(z));
      const edgeAlpha = clamp((18 - edgeDistance) / 18, 0, 1);

      const n1 = noise2D(x * 0.046, z * 0.046);
      const n2 = noise2D(x * 0.117 + 31.7, z * 0.117 - 19.4);
      const ridgeNoise = Math.max(0, noise2D(x * 0.029 - 9.4, z * 0.029 + 6.8));
      const rolling = Math.round(n1 * 2.5 + n2 * 1.3);
      const corridor = Math.exp(-(z * z) / 380);
      const corridorFlatten = Math.round(corridor * 1.5);
      const mountainLift = Math.round(edgeAlpha * edgeAlpha * (8 + ridgeNoise * 8));

      let topY = -1 + rolling - corridorFlatten + mountainLift;
      if (Math.abs(z) <= 2 && Math.abs(x) <= halfExtent - 6) {
        topY = Math.min(topY, -1);
      }
      if ((Math.abs(x + baseOffset) <= 11 || Math.abs(x - baseOffset) <= 11) && Math.abs(z) <= 11) {
        topY = Math.min(topY, 0);
      }
      if (Math.abs(x) <= 10 && Math.abs(z) <= 10) {
        topY = Math.min(topY, 0);
      }
      topY = clamp(topY, -2, 14);
      surfaceMap.set(builder.key(x, z), topY);

      for (let y = minY; y <= topY; y += 1) {
        let typeId = BLOCK.stone;
        if (y >= topY - 2) {
          typeId = BLOCK.dirt;
        }
        if (y === topY) {
          typeId = edgeAlpha > 0.62 ? (topY >= 9 ? BLOCK.ice : BLOCK.stone) : BLOCK.grass;
        }
        builder.setBlock(x, y, z, typeId);
      }
    }
  }

  carvePathing(builder, halfExtent);
  buildControlHub(builder);

  buildFlagFortress(builder, {
    centerX: -baseOffset,
    centerZ: 0,
    gateDirection: "east",
    wallType: BLOCK.stone,
    floorType: BLOCK.sand,
    accentType: BLOCK.metal
  });
  buildFlagFortress(builder, {
    centerX: baseOffset,
    centerZ: 0,
    gateDirection: "west",
    wallType: BLOCK.stone,
    floorType: BLOCK.sand,
    accentType: BLOCK.brick
  });

  plantForest(builder, halfExtent, surfaceMap, seed);

  return {
    arenaMeta: {
      alphaBase: { x: -35, y: 0, z: 0 },
      bravoBase: { x: 35, y: 0, z: 0 },
      alphaFlag: { x: -baseOffset, y: 0, z: 0 },
      bravoFlag: { x: baseOffset, y: 0, z: 0 },
      mid: { x: 0, y: 0, z: 0 },
      halfExtent
    }
  };
}

