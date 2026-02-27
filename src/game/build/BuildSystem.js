import * as THREE from "three";
import { BLOCK_TYPES, getBlockTypeBySlot } from "./BlockPalette.js";

const CENTER = new THREE.Vector2(0, 0);
const TOOL_LABELS = {
  place: "설치",
  dig: "삽",
  gun: "총"
};
const DEFAULT_SLOT_STOCK = 32;
const MAX_SLOT_STOCK = 999;
const DRAG_START_DISTANCE = 8;
const DRAG_DISCARD_DISTANCE = 42;

export class BuildSystem {
  constructor({
    world,
    camera,
    raycaster,
    onModeChanged = null,
    onStatus = null,
    onBlockChanged = null,
    canInteract = null
  }) {
    this.world = world;
    this.camera = camera;
    this.raycaster = raycaster;
    this.onModeChanged = onModeChanged;
    this.onStatus = onStatus;
    this.onBlockChanged = onBlockChanged;
    this.canInteract = canInteract;

    this.toolMode = "gun";
    this.selectedSlot = 1;
    this.maxReach = 12;

    this.modeBadgeEl = document.getElementById("build-mode-badge");
    this.hotbarEl = document.getElementById("block-hotbar");
    this.hotbarSlots = Array.from(document.querySelectorAll(".hotbar-slot"));
    this.slotStock = new Map();
    this.slotCountEls = new Map();
    this.dragState = null;
    this.initSlotStock();
    this.applySwatchPalette();
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

  getSelectedType() {
    return getBlockTypeBySlot(this.selectedSlot);
  }

  initSlotStock() {
    for (const slotEl of this.hotbarSlots) {
      const slot = Number(slotEl.dataset.slot ?? "0");
      if (!Number.isFinite(slot) || slot <= 0) {
        continue;
      }

      if (!this.slotStock.has(slot)) {
        this.slotStock.set(slot, DEFAULT_SLOT_STOCK);
      }

      const countEl = slotEl.querySelector(".slot-count");
      if (countEl) {
        this.slotCountEls.set(slot, countEl);
      }
    }
  }

  applySwatchPalette() {
    for (const slotEl of this.hotbarSlots) {
      const slot = Number(slotEl.dataset.slot ?? "0");
      if (!Number.isFinite(slot) || slot <= 0) {
        continue;
      }
      const type = getBlockTypeBySlot(slot);
      const swatchEl = slotEl.querySelector(".swatch");
      if (!swatchEl) {
        continue;
      }

      const baseColor = type?.color ?? "#9aa3ad";
      swatchEl.style.background = baseColor;
      swatchEl.style.boxShadow = "inset 0 0 0 1px rgba(255, 255, 255, 0.14)";
    }
  }

  resetStockToDefault() {
    for (let slot = 1; slot <= BLOCK_TYPES.length; slot += 1) {
      this.setSlotStock(slot, DEFAULT_SLOT_STOCK);
    }
    this.renderUi();
  }

  getSlotStock(slot) {
    const key = Math.max(1, Math.min(BLOCK_TYPES.length, Math.trunc(Number(slot) || 1)));
    return Math.max(0, Math.trunc(this.slotStock.get(key) ?? 0));
  }

  setSlotStock(slot, value) {
    const key = Math.max(1, Math.min(BLOCK_TYPES.length, Math.trunc(Number(slot) || 1)));
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

  isPointInsideHotbar(clientX, clientY) {
    if (!this.hotbarEl) {
      return false;
    }
    const rect = this.hotbarEl.getBoundingClientRect();
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    );
  }

  bindHotbarInteractions() {
    if (this.hotbarSlots.length === 0) {
      return;
    }

    const clearDragVisual = (drag) => {
      if (!drag?.slotEl) {
        return;
      }
      drag.slotEl.classList.remove("is-dragging");
      drag.slotEl.style.transform = "";
    };

    const finishDrag = (event, cancelled = false) => {
      const drag = this.dragState;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const endX = Number.isFinite(event.clientX) ? event.clientX : drag.lastX;
      const endY = Number.isFinite(event.clientY) ? event.clientY : drag.lastY;
      const pullDownDistance = endY - drag.startY;
      const outsideHotbar = !this.isPointInsideHotbar(endX, endY);
      const shouldDiscard =
        !cancelled &&
        drag.dragging &&
        (pullDownDistance >= DRAG_DISCARD_DISTANCE || outsideHotbar);

      if (shouldDiscard) {
        const type = getBlockTypeBySlot(drag.slot);
        if (this.discardFromSlot(drag.slot, 1)) {
          this.onStatus?.(`${type.name} -1 (버리기)`, false, 0.5);
        } else {
          this.onStatus?.("버릴 블록이 없습니다", true, 0.45);
        }
      }

      clearDragVisual(drag);
      if (drag.slotEl.hasPointerCapture?.(drag.pointerId)) {
        drag.slotEl.releasePointerCapture(drag.pointerId);
      }
      this.dragState = null;
      this.renderUi();
    };

    for (const slotEl of this.hotbarSlots) {
      slotEl.setAttribute("draggable", "false");
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

        this.dragState = {
          pointerId: event.pointerId,
          slot,
          slotEl,
          startX: event.clientX,
          startY: event.clientY,
          lastX: event.clientX,
          lastY: event.clientY,
          dragging: false
        };
        slotEl.setPointerCapture?.(event.pointerId);
      });

      slotEl.addEventListener("pointermove", (event) => {
        const drag = this.dragState;
        if (!drag || drag.pointerId !== event.pointerId || drag.slotEl !== slotEl) {
          return;
        }

        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        drag.lastX = event.clientX;
        drag.lastY = event.clientY;

        if (!drag.dragging && Math.hypot(dx, dy) >= DRAG_START_DISTANCE) {
          drag.dragging = true;
          slotEl.classList.add("is-dragging");
        }

        if (drag.dragging) {
          slotEl.style.transform = `translate(${dx}px, ${dy}px)`;
        }
      });

      slotEl.addEventListener("pointerup", (event) => finishDrag(event, false));
      slotEl.addEventListener("pointercancel", (event) => finishDrag(event, true));
    }
  }

  setToolMode(mode, { silentStatus = false } = {}) {
    if (mode !== "gun" && mode !== "place" && mode !== "dig") {
      return;
    }
    if (this.toolMode === mode) {
      return;
    }

    this.toolMode = mode;
    this.renderUi();
    this.onModeChanged?.(this.toolMode);

    if (silentStatus) {
      return;
    }

    if (this.toolMode === "place") {
      this.onStatus?.("설치 모드 (좌클릭 설치 / 슬롯 드래그 버리기)", false, 0.95);
      return;
    }
    if (this.toolMode === "dig") {
      this.onStatus?.("삽 모드 (좌클릭 제거 / 제거 시 블록 +1)", false, 0.95);
      return;
    }

    this.onStatus?.("총 모드 (좌클릭 사격 / 우클릭 조준)", false, 0.9);
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
    const clamped = Math.max(1, Math.min(BLOCK_TYPES.length, slot));
    if (this.selectedSlot === clamped) {
      return;
    }

    this.selectedSlot = clamped;
    this.renderUi();

    const type = this.getSelectedType();
    this.onStatus?.(`블록 선택: ${type.name}`, false, 0.45);
  }

  cycleSlot(step) {
    const total = BLOCK_TYPES.length;
    const next = ((this.selectedSlot - 1 + step + total) % total) + 1;
    this.setSlot(next);
  }

  handleWheel(event) {
    if (!this.isBuildMode()) {
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
      this.setToolMode("place");
      return true;
    }
    if (event.code === "Digit2") {
      this.setToolMode("dig");
      return true;
    }
    if (event.code === "Digit3") {
      this.setToolMode("gun");
      return true;
    }

    const numpadMatch = /^Numpad([1-8])$/.exec(event.code);
    if (numpadMatch) {
      this.setSlot(Number(numpadMatch[1]));
      return true;
    }

    return false;
  }

  handlePointerAction(button, canPlace = null) {
    if (!this.isBuildMode()) {
      return false;
    }

    if (button !== 0 && button !== 2) {
      return false;
    }

    if (button === 2) {
      return true;
    }

    this.raycaster.setFromCamera(CENTER, this.camera);
    const hit = this.world.raycast(this.raycaster, this.maxReach);
    if (!hit) {
      if (this.isPlaceMode()) {
        this.onStatus?.("설치 기준 블록이 범위 안에 없습니다", true, 0.2);
      } else {
        this.onStatus?.("제거할 블록이 범위 안에 없습니다", true, 0.2);
      }
      return true;
    }

    if (this.isPlaceMode()) {
      if (this.getSlotStock(this.selectedSlot) <= 0) {
        this.onStatus?.("선택한 블록이 없습니다. 삽 모드로 블록을 회수하세요", true, 0.7);
        return true;
      }

      const x = hit.x + Math.round(hit.normal.x);
      const y = hit.y + Math.round(hit.normal.y);
      const z = hit.z + Math.round(hit.normal.z);
      const typeId = this.getSelectedType().id;
      const placed = this.world.placeAdjacent(hit, typeId, canPlace);
      if (!placed) {
        this.onStatus?.("블록을 설치할 수 없습니다", true, 0.3);
      } else {
        this.consumeSelectedStock(1);
        this.onBlockChanged?.({ action: "place", x, y, z, typeId });
      }
      this.renderUi();
      return true;
    }

    if (this.isDigMode()) {
      const x = hit.x;
      const y = hit.y;
      const z = hit.z;
      const minedTypeId = hit.typeId;
      const removed = this.world.removeFromHit(hit);
      if (!removed) {
        this.onStatus?.("블록을 제거할 수 없습니다", true, 0.3);
      } else {
        const gained = this.collectByTypeId(minedTypeId, 1);
        if (gained > 0) {
          const minedType = BLOCK_TYPES.find((entry) => entry.id === minedTypeId);
          this.onStatus?.(`${minedType?.name ?? "블록"} +1`, false, 0.35);
        }
        this.onBlockChanged?.({ action: "remove", x, y, z, typeId: minedTypeId });
      }
      this.renderUi();
      return true;
    }

    return false;
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
  }
}
