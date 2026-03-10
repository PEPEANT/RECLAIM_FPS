import * as THREE from "three";
import { BLOCK_TYPE_BY_ID } from "../build/BlockPalette.js";

const FALL_GRAVITY = 22;
const MAX_FALL_ROTATION = 0.75;

function getBlockColor(typeId) {
  return BLOCK_TYPE_BY_ID.get(Math.trunc(Number(typeId) || 0))?.color ?? "#858d95";
}

export class CollapseSystem {
  constructor(scene) {
    this.scene = scene;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.materials = new Map();
    this.activeColumns = [];
  }

  getMaterial(typeId) {
    const key = Math.trunc(Number(typeId) || 0);
    let material = this.materials.get(key);
    if (material) {
      return material;
    }

    material = new THREE.MeshStandardMaterial({
      color: getBlockColor(key),
      roughness: 0.8,
      metalness: 0.06
    });
    this.materials.set(key, material);
    return material;
  }

  spawnColumn(blocks = [], voxelWorld = null) {
    if (!Array.isArray(blocks) || blocks.length === 0 || !this.scene) {
      return false;
    }

    const column = new THREE.Group();
    let minCenterY = Infinity;
    let maxLandingCenterY = -Infinity;
    let firstBlock = null;
    const center = new THREE.Vector3();
    let count = 0;

    for (const block of blocks) {
      if (!block) {
        continue;
      }
      center.x += block.x + 0.5;
      center.y += block.y + 0.5;
      center.z += block.z + 0.5;
      count += 1;
    }

    if (count <= 0) {
      return false;
    }

    center.divideScalar(count);
    column.position.copy(center);

    for (const block of blocks) {
      if (!block) {
        continue;
      }
      const mesh = new THREE.Mesh(this.geometry, this.getMaterial(block.typeId));
      mesh.position.set(block.x + 0.5 - center.x, block.y + 0.5 - center.y, block.z + 0.5 - center.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      column.add(mesh);
      minCenterY = Math.min(minCenterY, mesh.position.y);
      const surfaceY = voxelWorld?.getSurfaceYAt?.(block.x + 0.5, block.z + 0.5, -32, 64);
      const landingCenterY = Number.isFinite(surfaceY) ? surfaceY - 0.5 : -40;
      maxLandingCenterY = Math.max(maxLandingCenterY, landingCenterY);
      firstBlock ??= block;
    }

    if (!firstBlock || !Number.isFinite(minCenterY)) {
      return false;
    }
    if (!Number.isFinite(maxLandingCenterY)) {
      maxLandingCenterY = -40;
    }

    this.scene.add(column);
    this.activeColumns.push({
      group: column,
      velocityY: -1.4,
      rotationVelocityX: (Math.random() * 2 - 1) * (MAX_FALL_ROTATION * 0.18),
      rotationVelocityZ: (Math.random() * 2 - 1) * (MAX_FALL_ROTATION * 0.18),
      minCenterY,
      landingCenterY: maxLandingCenterY
    });
    return true;
  }

  update(delta) {
    if (!Number.isFinite(delta) || delta <= 0 || this.activeColumns.length === 0) {
      return;
    }

    for (let index = this.activeColumns.length - 1; index >= 0; index -= 1) {
      const column = this.activeColumns[index];
      column.velocityY -= FALL_GRAVITY * delta;
      column.group.position.y += column.velocityY * delta;
      column.group.rotation.x += column.rotationVelocityX * delta;
      column.group.rotation.z += column.rotationVelocityZ * delta;

      if (column.group.position.y + column.minCenterY > column.landingCenterY) {
        continue;
      }

      this.scene.remove(column.group);
      this.activeColumns.splice(index, 1);
    }
  }

  reset() {
    for (const column of this.activeColumns) {
      this.scene.remove(column.group);
    }
    this.activeColumns.length = 0;
  }

  dispose() {
    this.reset();
    this.geometry.dispose();
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
  }
}
