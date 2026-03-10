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

function clearVolume(builder, minX, maxX, minY, maxY, minZ, maxZ) {
  for (let y = minY; y <= maxY; y += 1) {
    builder.carveRect(minX, maxX, y, minZ, maxZ);
  }
}

function buildPerimeter(builder, halfExtent) {
  for (let y = 0; y <= 6; y += 1) {
    const typeId = y >= 5 ? BLOCK.metal : y >= 3 ? BLOCK.brick : BLOCK.clay;
    for (let x = -halfExtent; x <= halfExtent; x += 1) {
      const westGate = x === -halfExtent && y <= 4;
      const eastGate = x === halfExtent && y <= 4;
      if (!westGate) {
        builder.setBlock(x, y, -halfExtent, typeId);
      }
      if (!eastGate) {
        builder.setBlock(x, y, halfExtent, typeId);
      }
    }
    for (let z = -halfExtent; z <= halfExtent; z += 1) {
      const westGate = z >= -6 && z <= 6;
      const eastGate = z >= -10 && z <= 10;
      if (!(westGate && y <= 4)) {
        builder.setBlock(-halfExtent, y, z, typeId);
      }
      if (!(eastGate && y <= 4)) {
        builder.setBlock(halfExtent, y, z, typeId);
      }
    }
  }
}

function buildSpawnBay(builder) {
  builder.fillRect(-56, -32, 0, 0, -13, 13, BLOCK.metal);
  builder.fillRect(-56, -32, 4, 4, -13, 13, BLOCK.metal);
  builder.fillRect(-56, -56, 0, 4, -13, 13, BLOCK.metal);
  builder.fillRect(-56, -32, 0, 4, -13, -13, BLOCK.metal);
  builder.fillRect(-56, -32, 0, 4, 13, 13, BLOCK.metal);
  builder.fillRect(-32, -32, 0, 4, -13, -6, BLOCK.metal);
  builder.fillRect(-32, -32, 0, 4, 6, 13, BLOCK.metal);
  clearVolume(builder, -55, -33, 1, 3, -12, 12);

  builder.fillRect(-54, -48, 0, 1, -9, -7, BLOCK.stone);
  builder.fillRect(-54, -48, 0, 1, 7, 9, BLOCK.stone);
  builder.fillRect(-46, -34, 0, 0, -2, 2, BLOCK.sand);
  builder.fillRect(-33, -24, 0, 0, -3, 3, BLOCK.sand);

  builder.fillRect(-48, -46, 1, 2, -3, 3, BLOCK.ice);
  builder.fillRect(-42, -40, 1, 2, -3, 3, BLOCK.ice);

  for (let z = -6; z <= 6; z += 3) {
    builder.fillRect(-31, -29, 0, 1, z, z + 1, BLOCK.stone);
  }
}

function buildCentralPad(builder) {
  builder.fillRect(-4, 18, 0, 0, -11, 11, BLOCK.clay);
  builder.fillRect(0, 14, 1, 1, -7, 7, BLOCK.metal);
  clearVolume(builder, 3, 11, 1, 1, -4, 4);

  builder.fillRect(6, 8, 2, 4, -2, 2, BLOCK.brick);
  clearVolume(builder, 7, 7, 2, 3, -1, 1);

  const barricades = [
    [-1, -8],
    [-1, 6],
    [15, -8],
    [15, 6],
    [3, -10],
    [11, 8]
  ];
  for (const [x, z] of barricades) {
    builder.fillRect(x, x + 2, 1, 2, z, z + 1, BLOCK.stone);
  }
}

function buildFiringLanes(builder) {
  const laneCenters = [-24, -9, 7, 23];
  for (const centerZ of laneCenters) {
    builder.fillRect(-18, 45, 0, 0, centerZ - 4, centerZ + 4, BLOCK.sand);
    builder.fillRect(-18, 45, 1, 1, centerZ - 5, centerZ - 5, BLOCK.stone);
    builder.fillRect(-18, 45, 1, 1, centerZ + 5, centerZ + 5, BLOCK.stone);

    builder.fillRect(28, 30, 1, 2, centerZ - 3, centerZ - 2, BLOCK.stone);
    builder.fillRect(34, 36, 1, 2, centerZ + 1, centerZ + 2, BLOCK.stone);
    builder.fillRect(40, 42, 1, 3, centerZ - 1, centerZ + 1, BLOCK.brick);
    builder.fillRect(46, 55, 0, 7, centerZ - 5, centerZ + 5, BLOCK.clay);

    builder.fillRect(48, 48, 2, 4, centerZ - 2, centerZ - 2, BLOCK.ice);
    builder.fillRect(48, 48, 2, 5, centerZ, centerZ, BLOCK.ice);
    builder.fillRect(48, 48, 2, 4, centerZ + 2, centerZ + 2, BLOCK.ice);
    builder.fillRect(53, 53, 3, 6, centerZ - 3, centerZ - 3, BLOCK.metal);
  }

  builder.fillRect(-18, 45, 0, 1, -16, -14, BLOCK.stone);
  builder.fillRect(-18, 45, 0, 1, -1, 1, BLOCK.stone);
  builder.fillRect(-18, 45, 0, 1, 15, 17, BLOCK.stone);
}

function buildShoothouse(builder) {
  builder.fillRect(-8, 18, 0, 0, -48, -20, BLOCK.stone);
  builder.fillRect(-8, 18, 5, 5, -48, -20, BLOCK.metal);
  builder.fillRect(-8, -8, 0, 5, -48, -20, BLOCK.brick);
  builder.fillRect(18, 18, 0, 5, -48, -20, BLOCK.brick);
  builder.fillRect(-8, 18, 0, 5, -48, -48, BLOCK.brick);
  builder.fillRect(-8, 18, 0, 5, -20, -20, BLOCK.brick);
  clearVolume(builder, -7, 17, 1, 4, -47, -21);

  builder.fillRect(2, 4, 0, 4, -48, -34, BLOCK.clay);
  builder.fillRect(8, 10, 0, 4, -38, -20, BLOCK.clay);
  builder.fillRect(-2, 0, 0, 4, -30, -20, BLOCK.clay);
  clearVolume(builder, 3, 3, 1, 3, -42, -39);
  clearVolume(builder, 9, 9, 1, 3, -31, -28);
  clearVolume(builder, -1, -1, 1, 3, -25, -22);
  clearVolume(builder, -8, -8, 1, 3, -36, -32);
  clearVolume(builder, 18, 18, 1, 3, -29, -25);

  builder.fillRect(-5, -3, 1, 2, -42, -40, BLOCK.stone);
  builder.fillRect(12, 14, 1, 2, -44, -42, BLOCK.stone);
  builder.fillRect(12, 14, 1, 2, -26, -24, BLOCK.stone);
}

function buildSouthCourse(builder) {
  builder.fillRect(-12, 28, 0, 0, 22, 48, BLOCK.dirt);
  builder.fillRect(-10, 26, 1, 1, 24, 46, BLOCK.sand);

  const cover = [
    [-8, 28, 3, 2, BLOCK.stone],
    [-2, 34, 4, 2, BLOCK.brick],
    [6, 30, 3, 3, BLOCK.clay],
    [14, 38, 5, 2, BLOCK.stone],
    [22, 28, 3, 2, BLOCK.brick]
  ];
  for (const [x, z, width, height, typeId] of cover) {
    builder.fillRect(x, x + width, 1, height, z, z + 1, typeId);
    builder.fillRect(x, x + 1, 1, height + 1, z - 2, z - 1, typeId);
  }

  builder.fillRect(2, 12, 3, 3, 36, 44, BLOCK.metal);
  builder.fillRect(2, 2, 0, 3, 36, 36, BLOCK.metal);
  builder.fillRect(12, 12, 0, 3, 44, 44, BLOCK.metal);
  builder.fillRect(3, 11, 0, 0, 35, 35, BLOCK.stone);
  builder.fillRect(11, 11, 1, 2, 39, 43, BLOCK.stone);
  builder.fillRect(7, 7, 1, 2, 35, 39, BLOCK.stone);
}

function buildEnemyReadyBay(builder) {
  builder.fillRect(28, 44, 0, 0, -14, 14, BLOCK.dirt);
  builder.fillRect(28, 44, 1, 1, -2, 2, BLOCK.sand);
  builder.fillRect(32, 34, 1, 3, -10, -8, BLOCK.stone);
  builder.fillRect(32, 34, 1, 3, 8, 10, BLOCK.stone);
  builder.fillRect(39, 41, 1, 4, -3, 3, BLOCK.brick);
  builder.fillRect(24, 27, 0, 5, -18, -12, BLOCK.metal);
  builder.fillRect(24, 27, 0, 5, 12, 18, BLOCK.metal);
}

export function generateTrainingCompoundMap(builder) {
  const halfExtent = 60;

  builder.fillRect(-halfExtent, halfExtent, -4, -1, -halfExtent, halfExtent, BLOCK.stone);
  builder.fillRect(-halfExtent, halfExtent, -5, -5, -halfExtent, halfExtent, BLOCK.dirt);

  buildPerimeter(builder, halfExtent);
  buildSpawnBay(builder);
  buildCentralPad(builder);
  buildFiringLanes(builder);
  buildShoothouse(builder);
  buildSouthCourse(builder);
  buildEnemyReadyBay(builder);

  return {
    arenaMeta: {
      alphaBase: { x: -40, y: 0, z: 0 },
      bravoBase: { x: 36, y: 0, z: 0 },
      alphaFlag: { x: -24, y: 0, z: 0 },
      bravoFlag: { x: 46, y: 0, z: 0 },
      mid: { x: 8, y: 0, z: 0 },
      trainingSpawn: { x: -46, y: 0, z: 0 },
      halfExtent
    }
  };
}
