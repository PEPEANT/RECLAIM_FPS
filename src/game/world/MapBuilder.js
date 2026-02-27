const KEY_SEPARATOR = "|";

export function createMapBuilder(world) {
  if (!world) {
    throw new Error("createMapBuilder requires a world instance.");
  }

  return {
    setBlock(x, y, z, typeId) {
      return world.setBlock(x, y, z, typeId);
    },

    removeBlock(x, y, z) {
      return world.removeBlock(x, y, z);
    },

    hasBlock(x, y, z) {
      return world.hasBlock(x, y, z);
    },

    key(x, z) {
      return `${x}${KEY_SEPARATOR}${z}`;
    },

    fillRect(minX, maxX, minY, maxY, minZ, maxZ, typeId) {
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          for (let z = minZ; z <= maxZ; z += 1) {
            world.setBlock(x, y, z, typeId);
          }
        }
      }
    },

    carveRect(minX, maxX, y, minZ, maxZ) {
      for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          world.removeBlock(x, y, z);
        }
      }
    },

    getSurfaceYAt(x, z, minY = -32, maxY = 64) {
      return world.getSurfaceYAt(x, z, minY, maxY);
    }
  };
}

