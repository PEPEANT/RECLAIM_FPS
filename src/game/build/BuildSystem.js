import * as THREE from "three";
import { BLOCK_TYPES, getBlockTypeBySlot } from "./BlockPalette.js";

const CENTER = new THREE.Vector2(0, 0);
const LINE_BUILD_MAX = 8;
const TOOL_LABELS = Object.freeze({
  place: "블록",
  dig: "삽",
  gun: "총"
});
const DEFAULT_SLOT_STOCK = 32;
const MAX_SLOT_STOCK = 999;
const DIG_REQUIRED_HITS_BY_KEY = Object.freeze({
  grass: 2,
  dirt: 2,
  sand: 2,
  ice: 2,
  clay: 3,
  brick: 3,
  stone: 4,
  metal: 4
});

function clampSlot(slot) {
  return Math.max(1, Math.min(BLOCK_TYPES.length, Math.trunc(Number(slot) || 1)));
}

export class BuildSystem {
  constructor({
    world,
    camera,
    raycaster,
    onModeChanged = null,
    onInventoryChanged = null,
    onStatus = null,
    onBlockChanged = null,
    onDigAction = null,
    canInteract = null,
    canRemoveBlock = null,
    canPlaceBlock = null
  }) {
    this.world = world;
    this.camera = camera;
    this.raycaster = raycaster;
    this.onModeChanged = onModeChanged;
    this.onInventoryChanged = onInventoryChanged;
    this.onStatus = onStatus;
    this.onBlockChanged = onBlockChanged;
    this.onDigAction = onDigAction;
    this.canInteract = canInteract;
    this.canRemoveBlock = canRemoveBlock;
    this.canPlaceBlock = canPlaceBlock;

    this.toolMode = "gun";
    this.inventoryOpen = false;
    this.selectedSlot = 1;
    this.maxReach = 12;
    this.previewPosition = null;
    this.previewPositions = [];
    this.previewValid = false;
    this.lineAnchor = null;
    this.slotStock = new Map();
    this.slotCountEls = new Map();
    this.digTargetKey = "";
    this.digTargetHits = 0;

    this.buildHudEl = document.getElementById("build-hud");
    this.modeBadgeEl = document.getElementById("build-mode-badge");
    this.toolTrayEl = document.getElementById("build-tool-tray");
    this.toolButtons = Array.from(document.querySelectorAll(".build-tool-btn"));
    this.blockPanelEl = document.getElementById("block-panel");
    this.blockPanelCloseEl = document.getElementById("block-panel-close");
    this.hotbarEl = document.getElementById("block-hotbar");
    this.selectionCardEl = document.getElementById("block-selection-card");
    this.selectionSwatchEl = document.getElementById("block-selection-swatch");
    this.selectionNameEl = document.getElementById("block-selection-name");
    this.selectionSlotEl = document.getElementById("block-selection-slot");
    this.selectionHintEl = document.getElementById("block-selection-hint");

    this.hotbarSlots = [];
    this.previewLine = this.createPlacementPreview();

    this.buildHotbarSlots();
    this.initSlotStock();
    this.bindToolTrayInteractions();
    this.bindHotbarInteractions();
    this.renderUi();
  }

  isBuildMode() {
    return this.toolMode === "place" || this.toolMode === "dig";
  }

  isGunMode() {
    return this.toolMode === "gun";
  }

  isPlaceMode() {
    return this.toolMode === "place";
  }

  isDigMode() {
    return this.toolMode === "dig";
  }

  getToolMode() {
    return this.toolMode;
  }

  isInventoryOpen() {
    return this.inventoryOpen;
  }

  setInventoryOpen(open) {
    const next = Boolean(open);
    if (this.inventoryOpen === next) {
      this.syncAuxiliaryToolUi();
      return this.inventoryOpen;
    }
    this.inventoryOpen = next;
    this.syncAuxiliaryToolUi();
    this.onInventoryChanged?.(this.inventoryOpen);
    return this.inventoryOpen;
  }

  resetDigProgress() {
    this.digTargetKey = "";
    this.digTargetHits = 0;
  }

  getDigRequiredHits(typeId) {
    const type = BLOCK_TYPES.find((entry) => entry.id === typeId) ?? null;
    const key = String(type?.key ?? "").trim().toLowerCase();
    return Math.max(1, Math.trunc(Number(DIG_REQUIRED_HITS_BY_KEY[key] ?? 3) || 3));
  }

  toggleInventory(forceOpen = null) {
    const next = forceOpen === null ? !this.inventoryOpen : Boolean(forceOpen);
    return this.setInventoryOpen(next);
  }

  getSelectedType() {
    return getBlockTypeBySlot(this.selectedSlot);
  }

  buildHotbarSlots() {
    if (!this.hotbarEl) {
      return;
    }

    this.hotbarEl.innerHTML = "";
    this.hotbarSlots = [];
    this.slotCountEls.clear();

    BLOCK_TYPES.forEach((type, index) => {
      const slot = index + 1;
      const slotEl = document.createElement("button");
      slotEl.type = "button";
      slotEl.className = "hotbar-slot";
      slotEl.dataset.slot = String(slot);
      slotEl.title = `${String(slot).padStart(2, "0")} ${type.name}`;
      slotEl.setAttribute("aria-label", `${type.name} 블록 색상`);

      const swatchEl = document.createElement("span");
      swatchEl.className = `swatch swatch-${type.key}`;
      swatchEl.style.setProperty("--swatch-color", type.color ?? "#9aa3ad");
      slotEl.appendChild(swatchEl);

      const keyEl = document.createElement("span");
      keyEl.className = "slot-key";
      keyEl.textContent = String(slot);
      slotEl.appendChild(keyEl);

      const countEl = document.createElement("span");
      countEl.className = "slot-count";
      countEl.textContent = String(DEFAULT_SLOT_STOCK);
      slotEl.appendChild(countEl);

      this.hotbarEl.appendChild(slotEl);
      this.hotbarSlots.push(slotEl);
      this.slotCountEls.set(slot, countEl);
    });
  }

  initSlotStock() {
    for (let slot = 1; slot <= BLOCK_TYPES.length; slot += 1) {
      if (!this.slotStock.has(slot)) {
        this.slotStock.set(slot, DEFAULT_SLOT_STOCK);
      }
    }
  }

  resetStockToDefault() {
    for (let slot = 1; slot <= BLOCK_TYPES.length; slot += 1) {
      this.setSlotStock(slot, DEFAULT_SLOT_STOCK);
    }
    this.renderUi();
  }

  getSlotStock(slot) {
    return Math.max(0, Math.trunc(this.slotStock.get(clampSlot(slot)) ?? 0));
  }

  setSlotStock(slot, value) {
    const key = clampSlot(slot);
    const next = Math.max(0, Math.min(MAX_SLOT_STOCK, Math.trunc(Number(value) || 0)));
    this.slotStock.set(key, next);
    const countEl = this.slotCountEls.get(key);
    if (countEl) {
      countEl.textContent = String(next);
    }
    return next;
  }

  changeSlotStock(slot, delta) {
    return this.setSlotStock(slot, this.getSlotStock(slot) + Math.trunc(Number(delta) || 0));
  }

  consumeSelectedStock(amount = 1) {
    const need = Math.max(1, Math.trunc(Number(amount) || 1));
    const current = this.getSlotStock(this.selectedSlot);
    if (current < need) {
      return false;
    }
    this.setSlotStock(this.selectedSlot, current - need);
    return true;
  }

  resolveSlotByTypeId(typeId) {
    const id = Math.trunc(Number(typeId) || 0);
    const index = BLOCK_TYPES.findIndex((entry) => entry.id === id);
    return index >= 0 ? index + 1 : null;
  }

  collectByTypeId(typeId, amount = 1) {
    const slot = this.resolveSlotByTypeId(typeId);
    if (!slot) {
      return 0;
    }
    const before = this.getSlotStock(slot);
    const after = this.setSlotStock(slot, before + Math.max(1, Math.trunc(Number(amount) || 1)));
    return after - before;
  }

  getStockSnapshotByType() {
    const snapshot = {};
    for (let slot = 1; slot <= BLOCK_TYPES.length; slot += 1) {
      const type = getBlockTypeBySlot(slot);
      snapshot[type.id] = this.getSlotStock(slot);
    }
    return snapshot;
  }

  applyStockSnapshot(stockByType = null) {
    if (!stockByType || typeof stockByType !== "object") {
      return false;
    }

    let changed = false;
    for (let slot = 1; slot <= BLOCK_TYPES.length; slot += 1) {
      const type = getBlockTypeBySlot(slot);
      const rawValue = Number(stockByType[type.id] ?? stockByType[String(type.id)]);
      if (!Number.isFinite(rawValue)) {
        continue;
      }
      const before = this.getSlotStock(slot);
      const after = this.setSlotStock(slot, rawValue);
      if (after !== before) {
        changed = true;
      }
    }

    if (changed) {
      this.renderUi();
    }
    return changed;
  }

  discardFromSlot(slot, amount = 1) {
    const take = Math.max(1, Math.trunc(Number(amount) || 1));
    const current = this.getSlotStock(slot);
    if (current < take) {
      return false;
    }
    this.setSlotStock(slot, current - take);
    return true;
  }

  bindHotbarInteractions() {
    if (this.hotbarSlots.length === 0) {
      return;
    }

    for (const slotEl of this.hotbarSlots) {
      const slot = Number(slotEl.dataset.slot ?? "0");
      if (!Number.isFinite(slot) || slot <= 0) {
        continue;
      }

      slotEl.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        if (typeof this.canInteract === "function" && !this.canInteract()) {
          return;
        }
        event.preventDefault();
        this.setSlot(slot);
      });
    }
  }

  bindToolTrayInteractions() {
    for (const button of this.toolButtons) {
      const mode = String(button.dataset.mode ?? "").trim();
      if (!mode) {
        continue;
      }

      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return;
        }
        if (typeof this.canInteract === "function" && !this.canInteract()) {
          return;
        }
        event.preventDefault();
        const wasPlaceMode = this.isPlaceMode();
        this.setToolMode(mode);
        if (mode === "place") {
          this.setInventoryOpen(wasPlaceMode ? !this.inventoryOpen : false);
          return;
        }
        this.setInventoryOpen(false);
      });
    }

    this.blockPanelCloseEl?.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      if (typeof this.canInteract === "function" && !this.canInteract()) {
        return;
      }
      event.preventDefault();
      this.setInventoryOpen(false);
    });
  }

  createPlacementPreview() {
    const group = new THREE.Group();
    const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
    const previewCells = [];

    for (let index = 0; index < LINE_BUILD_MAX; index += 1) {
      const line = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0x62ff9b,
          transparent: true,
          opacity: 0.92,
          depthTest: false
        })
      );
      line.visible = false;
      line.renderOrder = 10;
      previewCells.push(line);
      group.add(line);
    }

    group.visible = false;
    group.userData.previewCells = previewCells;
    this.world.group.add(group);
    return group;
  }

  hidePlacementPreview() {
    if (!this.previewLine) {
      return;
    }
    this.previewLine.visible = false;
    for (const cell of this.previewLine.userData.previewCells ?? []) {
      cell.visible = false;
    }
    this.previewPosition = null;
    this.previewPositions = [];
    this.previewValid = false;
  }

  clearLineAnchor() {
    this.lineAnchor = null;
  }

  getLineAnchor() {
    return this.lineAnchor ? { ...this.lineAnchor } : null;
  }

  captureLineAnchor(canPlaceOverride = null) {
    const placement = this.resolvePlacementTarget(canPlaceOverride);
    if (!placement) {
      this.lineAnchor = null;
      return null;
    }
    this.lineAnchor = {
      x: placement.x,
      y: placement.y,
      z: placement.z,
      valid: placement.valid
    };
    return { ...this.lineAnchor };
  }

  resolveCanPlaceBlock(canPlaceOverride = null) {
    if (typeof canPlaceOverride === "function") {
      return canPlaceOverride;
    }
    if (typeof this.canPlaceBlock === "function") {
      return this.canPlaceBlock;
    }
    return null;
  }

  resolvePlacementTarget(canPlaceOverride = null) {
    this.raycaster.setFromCamera(CENTER, this.camera);
    const hit = this.world.raycast(this.raycaster, this.maxReach);
    if (!hit) {
      return null;
    }

    const x = hit.x + Math.round(hit.normal.x);
    const y = hit.y + Math.round(hit.normal.y);
    const z = hit.z + Math.round(hit.normal.z);
    const canPlace = this.resolveCanPlaceBlock(canPlaceOverride);
    const hasStock = this.getSlotStock(this.selectedSlot) > 0;
    const valid =
      hasStock && !this.world.hasBlock(x, y, z) && (!canPlace || canPlace(x, y, z));

    return { hit, x, y, z, valid };
  }

  resolveLineDirection(hit = null) {
    if (!hit?.normal) {
      return { x: 1, y: 0, z: 0 };
    }

    const normal = hit.normal;
    const majorAxis =
      Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z)
        ? "x"
        : Math.abs(normal.y) >= Math.abs(normal.z)
          ? "y"
          : "z";
    const direction = this.raycaster.ray.direction;
    const candidateAxes =
      majorAxis === "x" ? ["z", "y"] : majorAxis === "y" ? ["x", "z"] : ["x", "y"];
    const axis =
      Math.abs(direction[candidateAxes[0]]) >= Math.abs(direction[candidateAxes[1]])
        ? candidateAxes[0]
        : candidateAxes[1];
    const sign = direction[axis] >= 0 ? 1 : -1;

    return {
      x: axis === "x" ? sign : 0,
      y: axis === "y" ? sign : 0,
      z: axis === "z" ? sign : 0
    };
  }

  resolvePlacementChain(canPlaceOverride = null, { lineMode = false, anchor = null } = {}) {
    const placement = this.resolvePlacementTarget(canPlaceOverride);
    const stock = this.getSlotStock(this.selectedSlot);
    const canPlace = this.resolveCanPlaceBlock(canPlaceOverride);
    const baseAnchor = anchor ?? this.lineAnchor ?? null;

    if (lineMode && !placement && !baseAnchor) {
      return null;
    }
    if (!lineMode && !placement && !baseAnchor) {
      return null;
    }

    const origin = baseAnchor ?? placement;
    if (!origin) {
      return null;
    }

    let direction = { x: 0, y: 0, z: 0 };
    let previewCount = 1;

    if (lineMode && placement && baseAnchor) {
      const deltaX = placement.x - baseAnchor.x;
      const deltaY = placement.y - baseAnchor.y;
      const deltaZ = placement.z - baseAnchor.z;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const absZ = Math.abs(deltaZ);

      if (absX >= absY && absX >= absZ && absX > 0) {
        direction = { x: deltaX >= 0 ? 1 : -1, y: 0, z: 0 };
        previewCount = absX + 1;
      } else if (absY >= absZ && absY > 0) {
        direction = { x: 0, y: deltaY >= 0 ? 1 : -1, z: 0 };
        previewCount = absY + 1;
      } else if (absZ > 0) {
        direction = { x: 0, y: 0, z: deltaZ >= 0 ? 1 : -1 };
        previewCount = absZ + 1;
      }
    }

    previewCount = Math.min(LINE_BUILD_MAX, Math.max(1, previewCount), Math.max(1, stock));
    const placements = [];

    for (let index = 0; index < previewCount; index += 1) {
      const x = origin.x + direction.x * index;
      const y = origin.y + direction.y * index;
      const z = origin.z + direction.z * index;
      const hasStock = index < stock;
      const valid =
        hasStock && !this.world.hasBlock(x, y, z) && (!canPlace || canPlace(x, y, z));

      placements.push({ x, y, z, valid });
      if (!valid) {
        break;
      }
    }

    return { hit: placement?.hit ?? null, placements };
  }

  updatePlacementPreview(canPlaceOverride = null, { lineMode = false, anchor = null } = {}) {
    if (!this.previewLine || !this.isPlaceMode()) {
      this.hidePlacementPreview();
      return;
    }

    if (typeof this.canInteract === "function" && !this.canInteract()) {
      this.hidePlacementPreview();
      return;
    }

    const preview = this.resolvePlacementChain(canPlaceOverride, { lineMode, anchor });
    if (!preview || !Array.isArray(preview.placements) || preview.placements.length === 0) {
      this.hidePlacementPreview();
      return;
    }

    this.previewLine.visible = true;
    this.previewPosition = { ...preview.placements[0] };
    this.previewPositions = preview.placements.map((entry) => ({ ...entry }));
    this.previewValid = preview.placements.every((entry) => entry.valid);

    const cells = this.previewLine.userData.previewCells ?? [];
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      const placement = preview.placements[index];
      if (!cell) {
        continue;
      }
      if (!placement) {
        cell.visible = false;
        continue;
      }
      cell.position.set(placement.x + 0.5, placement.y + 0.5, placement.z + 0.5);
      cell.material.color.setHex(placement.valid ? 0x62ff9b : 0xff5c5c);
      cell.visible = true;
    }
  }

  syncAuxiliaryToolUi() {
    const blockPanelOpen = this.inventoryOpen && this.toolMode === "place";
    const trayOpen = this.inventoryOpen && this.toolMode !== "place";
    this.buildHudEl?.classList.toggle("is-open", this.inventoryOpen);
    this.buildHudEl?.setAttribute("aria-hidden", this.inventoryOpen ? "false" : "true");
    this.toolTrayEl?.classList.toggle("is-hidden", !trayOpen);
    this.blockPanelEl?.classList.toggle("is-open", blockPanelOpen);
    this.selectionCardEl?.classList.toggle("is-active", blockPanelOpen);

    for (const button of this.toolButtons) {
      const mode = String(button.dataset.mode ?? "").trim();
      button.classList.toggle("is-active", mode === this.toolMode);
    }
  }

  setToolMode(mode, { silentStatus = false } = {}) {
    if (mode !== "gun" && mode !== "place" && mode !== "dig") {
      return;
    }

    const changed = this.toolMode !== mode;
    this.toolMode = mode;
    if (mode !== "dig") {
      this.resetDigProgress();
    }
    if (mode !== "place") {
      this.clearLineAnchor();
      this.hidePlacementPreview();
    }
    this.renderUi();
    this.syncAuxiliaryToolUi();
    if (changed) {
      this.onModeChanged?.(this.toolMode);
    }

    if (silentStatus) {
      return;
    }

    if (this.toolMode === "place") {
      const type = this.getSelectedType();
      this.onStatus?.(`블록 모드: ${type.name}`, false, 0.75);
      return;
    }
    if (this.toolMode === "dig") {
      this.onStatus?.("삽 모드", false, 0.65);
      return;
    }
    this.onStatus?.("총 모드", false, 0.6);
  }

  setMode(mode) {
    if (mode === "weapon") {
      this.setToolMode("gun");
      return;
    }
    if (mode === "build") {
      this.setToolMode("place");
      return;
    }
    this.setToolMode(mode);
  }

  toggleMode() {
    this.setToolMode(this.isGunMode() ? "place" : "gun");
  }

  setSlot(slot) {
    const clamped = clampSlot(slot);
    if (this.selectedSlot === clamped) {
      this.renderSelectedPreview();
      return;
    }

    this.selectedSlot = clamped;
    this.renderUi();
    const type = this.getSelectedType();
    this.onStatus?.(`블록 색상: ${type.name}`, false, 0.45);
  }

  cycleSlot(step) {
    const total = BLOCK_TYPES.length;
    const next = ((this.selectedSlot - 1 + Math.trunc(Number(step) || 0) + total) % total) + 1;
    this.setSlot(next);
  }

  handleWheel(event) {
    if (!this.isPlaceMode()) {
      return false;
    }

    const delta = event.deltaY > 0 ? 1 : -1;
    this.cycleSlot(delta);
    return true;
  }

  handleKeyDown(event) {
    if (event.code === "KeyQ") {
      this.toggleMode();
      return true;
    }

    if (event.code === "Digit1") {
      const wasPlaceMode = this.isPlaceMode();
      this.setToolMode("place");
      this.setInventoryOpen(wasPlaceMode ? !this.inventoryOpen : false);
      return true;
    }
    if (event.code === "Digit2") {
      this.setToolMode("dig");
      this.setInventoryOpen(false);
      return true;
    }
    if (event.code === "Digit3") {
      this.setToolMode("gun");
      this.setInventoryOpen(false);
      return true;
    }

    if (event.code === "BracketLeft") {
      this.cycleSlot(-1);
      return true;
    }
    if (event.code === "BracketRight") {
      this.cycleSlot(1);
      return true;
    }

    return false;
  }

  handlePointerAction(button, canPlace = null, { lineMode = false } = {}) {
    if (!this.isBuildMode()) {
      return false;
    }
    if (button !== 0 && button !== 2) {
      return false;
    }
    if (button === 2) {
      return true;
    }

    const placement = this.isPlaceMode()
      ? this.resolvePlacementChain(canPlace, { lineMode, anchor: this.lineAnchor })
      : null;
    const hasPlaceTarget =
      this.isPlaceMode() &&
      Array.isArray(placement?.placements) &&
      placement.placements.length > 0;
    const hit =
      placement?.hit ??
      (() => {
        this.raycaster.setFromCamera(CENTER, this.camera);
        return this.world.raycast(this.raycaster, this.maxReach);
      })();

    if (!hit && !hasPlaceTarget) {
      this.resetDigProgress();
      this.onStatus?.(this.isPlaceMode() ? "배치할 블록이 없습니다." : "제거할 블록이 없습니다.", true, 0.28);
      return true;
    }

    if (this.isPlaceMode()) {
      if (this.getSlotStock(this.selectedSlot) <= 0) {
        this.onStatus?.("선택한 블록 재고가 없습니다.", true, 0.6);
        return true;
      }

      const typeId = this.getSelectedType().id;
      const placements = placement?.placements ?? [];
      let placedCount = 0;

      for (const entry of placements) {
        if (!entry.valid || this.getSlotStock(this.selectedSlot) <= 0) {
          break;
        }

        const placed = this.world.setBlock(entry.x, entry.y, entry.z, typeId);
        if (!placed) {
          break;
        }

        this.consumeSelectedStock(1);
        this.onBlockChanged?.({ action: "place", x: entry.x, y: entry.y, z: entry.z, typeId });
        placedCount += 1;
      }

      if (placedCount <= 0) {
        this.onStatus?.("여기에는 블록을 놓을 수 없습니다.", true, 0.35);
      } else if (lineMode && placedCount > 1) {
        this.onStatus?.(`블록 ${placedCount}개 설치`, false, 0.45);
      }

      this.clearLineAnchor();
      this.updatePlacementPreview(canPlace, { lineMode: false });
      this.renderUi();
      return true;
    }

    if (this.isDigMode()) {
      const x = hit.x;
      const y = hit.y;
      const z = hit.z;
      const minedTypeId = hit.typeId;
      const minedType = BLOCK_TYPES.find((entry) => entry.id === minedTypeId) ?? null;
      if (this.canRemoveBlock && !this.canRemoveBlock(x, y, z, minedTypeId)) {
        this.resetDigProgress();
        this.onStatus?.("이 블록은 제거할 수 없습니다.", true, 0.45);
        return true;
      }

      const digTargetKey = `${x}|${y}|${z}|${minedTypeId}`;
      if (this.digTargetKey !== digTargetKey) {
        this.digTargetKey = digTargetKey;
        this.digTargetHits = 0;
      }
      const requiredHits = this.getDigRequiredHits(minedTypeId);
      const hitCount = Math.min(requiredHits, this.digTargetHits + 1);
      const completed = hitCount >= requiredHits;
      this.digTargetHits = completed ? 0 : hitCount;
      if (completed) {
        this.digTargetKey = "";
      }
      this.onDigAction?.({
        x,
        y,
        z,
        typeId: minedTypeId,
        blockKey: minedType?.key ?? "default",
        hitCount,
        requiredHits,
        completed
      });
      if (!completed) {
        return true;
      }

      const removed = this.world.removeFromHit(hit);
      if (!removed) {
        this.resetDigProgress();
        this.onStatus?.("블록 제거에 실패했습니다.", true, 0.3);
      } else {
        const gained = this.collectByTypeId(minedTypeId, 1);
        if (gained > 0) {
          this.onStatus?.(`${minedType?.name ?? "블록"} +1`, false, 0.35);
        }
        this.onBlockChanged?.({ action: "remove", x, y, z, typeId: minedTypeId });
      }
      this.hidePlacementPreview();
      this.renderUi();
      return true;
    }

    return false;
  }

  renderSelectedPreview() {
    const type = this.getSelectedType();
    if (this.selectionSwatchEl) {
      this.selectionSwatchEl.style.setProperty("--swatch-color", type?.color ?? "#9aa3ad");
    }
    if (this.selectionNameEl) {
      this.selectionNameEl.textContent = type?.name ?? "Block";
    }
    if (this.selectionSlotEl) {
      this.selectionSlotEl.textContent =
        `${String(this.selectedSlot).padStart(2, "0")} / ${String(BLOCK_TYPES.length).padStart(2, "0")}`;
    }
    if (this.selectionHintEl) {
      this.selectionHintEl.textContent = this.isPlaceMode()
        ? "휠로 색상 변경 · Shift+클릭 일괄 설치"
        : "블록 모드에서 색상 선택";
    }
  }

  renderUi() {
    if (this.modeBadgeEl) {
      this.modeBadgeEl.textContent = `모드: ${TOOL_LABELS[this.toolMode]}`;
    }

    for (const slotEl of this.hotbarSlots) {
      const slotValue = Number(slotEl.dataset.slot ?? "0");
      slotEl.classList.toggle("is-selected", slotValue === this.selectedSlot);
      slotEl.classList.toggle("is-empty", this.getSlotStock(slotValue) <= 0);
      const countEl = this.slotCountEls.get(slotValue);
      if (countEl) {
        countEl.textContent = String(this.getSlotStock(slotValue));
      }
    }

    this.renderSelectedPreview();
    this.syncAuxiliaryToolUi();
  }
}

