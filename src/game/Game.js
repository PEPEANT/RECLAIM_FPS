import * as THREE from "three";
import { EnemyManager } from "./EnemyManager.js";
import { WeaponSystem } from "./WeaponSystem.js";
import { HUD } from "./HUD.js";
import { VoxelWorld } from "./build/VoxelWorld.js";
import { BuildSystem } from "./build/BuildSystem.js";
import { SoundSystem } from "./audio/SoundSystem.js";
import { DEFAULT_GAME_MODE, GAME_MODE, normalizeGameMode } from "../shared/gameModes.js";
import { CTF_PICKUP_RADIUS, CTF_WIN_SCORE, PVP_RESPAWN_MS } from "../shared/matchConfig.js";
import {
  getInitialOnlineMapId,
  getNextOnlineMapId,
  getOnlineMapConfig,
  normalizeOnlineMapId
} from "../shared/onlineMapRotation.js";
import {
  DEFAULT_WEAPON_ID,
  WEAPON_CATALOG,
  getWeaponDefinition,
  sanitizeWeaponId
} from "../shared/weaponCatalog.js";
import { drawMinimap } from "./render/minimapRenderer.js";
import {
  applyBlockViewColor,
  createBlockViewModel,
  createShovelViewModel
} from "./viewModels/toolViewModels.js";
import { createWeaponViewModel } from "./weapons/weaponModels.js";
import { CollapseSystem } from "./world/CollapseSystem.js";

const PLAYER_HEIGHT = 1.75;
const PLAYER_CROUCH_HEIGHT = 1.18;
const PLAYER_CROUCH_SPEED_MULTIPLIER = 0.68;
const PLAYER_CROUCH_EDGE_LOCK_DROP = 0.12;
const DEFAULT_FOV = 75;
const AIM_FOV = 48;
const PLAYER_SPEED = 6.8;
const PLAYER_SPRINT = 9.8;
const PLAYER_GRAVITY = -22;
const JUMP_FORCE = 9.2;
const WORLD_LIMIT = 72;
const PLAYER_RADIUS = 0.34;
const POINTER_LOCK_FALLBACK_MS = 900;
const MOBILE_LOOK_SENSITIVITY_X = 0.0047;
const MOBILE_LOOK_SENSITIVITY_Y = 0.0041;
const MOBILE_AIM_LOOK_SCALE = 0.78;
const ONLINE_ROOM_CODE = "GLOBAL";
const ONLINE_MAX_PLAYERS = 50;
const ONLINE_MAP_ID = getInitialOnlineMapId();
const TRAINING_MAP_ID = "training_compound";
const REMOTE_SYNC_INTERVAL = 1 / 12;
const REMOTE_NAME_TAG_DISTANCE = 72;
const MAX_PENDING_REMOTE_BLOCK_PLACEMENTS_PER_FRAME = 96;
const MIN_PENDING_REMOTE_BLOCK_PLACEMENTS_PER_FRAME = 12;
const MAX_PENDING_REMOTE_BLOCK_RETRIES = 120;
const PLAYER_STEP_UP_HEIGHT = 0.62;
const PLAYER_JUMP_LEDGE_CLIMB_HEIGHT = 1.08;
const PLAYER_STEP_UP_SPEED = 10;
const PLAYER_GROUND_SNAP_DOWN = 0.14;
const BUCKET_OPTIMIZE_INTERVAL = 1.2;
const PERF_REPORT_INTERVAL_MS = 4000;
const PERF_SLOW_FRAME_MS = 24;
const RENDER_PIXEL_RATIO_CAP = 1.25;
const RENDER_PIXEL_RATIO_LOW_CAP = 1.0;
const RENDER_PIXEL_RATIO_HIGH_CAP = 1.55;
const MOBILE_RENDER_PIXEL_RATIO_LOW_CAP = 0.72;
const MOBILE_RENDER_PIXEL_RATIO_CAP = 0.9;
const MOBILE_RENDER_PIXEL_RATIO_HIGH_CAP = 1.08;
const LOBBY_RUNTIME_PIXEL_RATIO_CAP = 0.9;
const LOBBY_PORTAL_ANIMATION_STEP = 1 / 30;
const LOBBY_REMOTE_PREVIEW_STEP = 1 / 24;
const SHADOW_MAP_SIZE_DEFAULT = 1024;
const SHADOW_MAP_SIZE_LOW = 512;
const SHADOW_MAP_SIZE_HIGH = 1536;
const SHADOW_CAMERA_EXTENT_DEFAULT = 120;
const SHADOW_CAMERA_EXTENT_LOW = 72;
const SHADOW_CAMERA_EXTENT_HIGH = 136;
const ADAPTIVE_QUALITY_ENABLED = false;
const ADAPTIVE_QUALITY_LOW_FPS_MS = 34;
const ADAPTIVE_QUALITY_STRIKE_LIMIT = 2;
const CTF_INTERACT_COOLDOWN_MS = 260;
const MOBILE_SPRINT_THRESHOLD = 0.94;
const FLAG_CARRIER_SPEED_MULTIPLIER = 0.9;
const PVP_HIT_SCORE = 10;
const PVP_KILL_SCORE = 100;
const PVP_IMMUNE_HINT_COOLDOWN_MS = 420;
const MAX_ACTIVE_HIT_SPARKS = 56;
const BLOCK_KEY_SEPARATOR = "|";
const LOCAL_DEATH_FALL_MS = 460;
const LOCAL_DEATH_OFFSET_Y = 0.92;
const LOCAL_DEATH_PITCH = 0.52;
const LOCAL_DEATH_ROLL = -0.68;
const SHOVEL_SWING_DURATION = 0.18;
const DIG_HOLD_REPEAT_INTERVAL = 0.16;
const COLLAPSE_GROUP_MAX_BLOCKS = 256;
const COLLAPSE_GROUP_OVERFLOW_LIMIT = 320;
const COLLAPSE_ANCHOR_MAX_Y = 0;
const COLLAPSE_ANCHOR_TYPE_IDS = Object.freeze(new Set([1, 2, 3, 4, 5]));
const COLLAPSE_NEIGHBOR_OFFSETS = Object.freeze([
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
]);
const REMOTE_DEATH_FALL_MS = 320;
const REMOTE_DEATH_OFFSET_Y = 0.56;
const REMOTE_DEATH_ROLL = -1.18;
const REMOTE_CARRIER_FLAG_BACK_OFFSET = 0.42;
const REMOTE_CARRIER_FLAG_SIDE_OFFSET = 0.13;
const REMOTE_CARRIER_FLAG_HEIGHT_OFFSET = 1.02;
const PVP_REMOTE_HITBOX_HALF_WIDTH = 0.46;
const PVP_REMOTE_HITBOX_FOOT_OFFSET = -0.06;
const PVP_REMOTE_HITBOX_TOP_OFFSET = 0.34;
const PVP_REMOTE_BODY_TOP_OFFSET = 1.22;
const PVP_REMOTE_HEAD_HALF_WIDTH = 0.24;
const PVP_REMOTE_HEAD_MIN_OFFSET = 1.14;
const PVP_REMOTE_HEAD_MAX_OFFSET = 1.98;
const PVP_REMOTE_CROUCH_BODY_TOP_OFFSET = 0.88;
const PVP_REMOTE_CROUCH_HEAD_MIN_OFFSET = 0.82;
const PVP_REMOTE_CROUCH_HEAD_MAX_OFFSET = 1.42;
const SPAWN_CORE_PROTECT_RADIUS = 4;
const SPAWN_CORE_PROTECT_RADIUS_SQ = SPAWN_CORE_PROTECT_RADIUS * SPAWN_CORE_PROTECT_RADIUS;
const SPAWN_CORE_PROTECT_MIN_Y = -1;
const SPAWN_CORE_PROTECT_MAX_Y = 6;
const BASE_FLOOR_PROTECT_RADIUS = 8;
const BASE_FLOOR_PROTECT_RADIUS_SQ = BASE_FLOOR_PROTECT_RADIUS * BASE_FLOOR_PROTECT_RADIUS;
const BASE_FLOOR_PROTECT_MAX_Y = -4;
const SHOT_BREAKABLE_TYPE_IDS = Object.freeze(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
const SHOT_BLOCK_HEALTH_BY_TYPE_ID = Object.freeze(
  new Map([
    [1, 4], // grass
    [2, 5], // dirt
    [3, 9], // stone
    [4, 4], // sand
    [5, 6], // clay
    [6, 7], // brick
    [7, 5], // ice
    [8, 10] // metal
  ])
);
const BASE_SUPPORT_RADIUS = 8.5;
const BASE_SUPPORT_RADIUS_SQ = BASE_SUPPORT_RADIUS * BASE_SUPPORT_RADIUS;
const BASE_SUPPORT_HEAL_PER_SEC = 12;
const BASE_SUPPORT_AMMO_PER_SEC = 18;
const FALL_DAMAGE_SAFE_DROP = 4.2;
const FALL_DAMAGE_PER_BLOCK = 14;
const FALL_DAMAGE_MAX = 96;
const VOID_DEATH_Y = -36;
const VOID_FATAL_DAMAGE = 999;
const HAZARD_EMIT_COOLDOWN_MS = 320;
const ONLINE_TEAM_SPAWN_OFFSETS = Object.freeze([
  [0, 0],
  [2.4, 0],
  [-2.4, 0],
  [0, 2.4],
  [0, -2.4],
  [3.8, 1.8],
  [3.8, -1.8],
  [-3.8, 1.8],
  [-3.8, -1.8],
  [5.3, 0],
  [-5.3, 0],
  [0, 5.3],
  [0, -5.3],
  [6.4, 2.6],
  [-6.4, 2.6],
  [6.4, -2.6],
  [-6.4, -2.6]
]);
const EFFECTS_VOLUME_STORAGE_KEY = "reclaim_effects_volume";
const DEFAULT_EFFECTS_VOLUME_SCALE = 1;
const MOBILE_LOOK_SENSITIVITY_STORAGE_KEY = "reclaim_mobile_look_sensitivity";
const MOBILE_CHAT_HEADER_TOGGLE_STORAGE_KEY = "reclaim_mobile_chat_header_toggle";
const RENDER_QUALITY_STORAGE_KEY = "reclaim_render_quality";
const SELECTED_WEAPON_STORAGE_KEY = "reclaim_selected_weapon";
const DEFAULT_RENDER_QUALITY = "high";
const DEFAULT_MOBILE_LOOK_SENSITIVITY_SCALE = 1;
const DEFAULT_MOBILE_CHAT_HEADER_TOGGLE_VISIBLE = false;
const MOBILE_LOOK_SENSITIVITY_MIN_SCALE = 0.4;
const MOBILE_LOOK_SENSITIVITY_MAX_SCALE = 2.2;
const MINIMAP_PADDING = 12;
const MINIMAP_PLAYER_RADIUS = 5.2;
const MINIMAP_REDRAW_INTERVAL_MS = 80;
const SKY_BASE_COLOR = 0x8ccfff;
const SKY_WIDTH_SEGMENTS_LOW = 24;
const SKY_WIDTH_SEGMENTS_MEDIUM = 32;
const SKY_WIDTH_SEGMENTS_HIGH = 40;
const SKY_HEIGHT_SEGMENTS_LOW = 16;
const SKY_HEIGHT_SEGMENTS_MEDIUM = 22;
const SKY_HEIGHT_SEGMENTS_HIGH = 28;
const SKY_CLOUD_COUNT_LOW = 18;
const SKY_CLOUD_COUNT_MEDIUM = 32;
const SKY_CLOUD_COUNT_HIGH = 52;
const SKY_CLOUD_COUNT_MOBILE_LOW = 8;
const SKY_CLOUD_COUNT_MOBILE_MEDIUM = 18;
const SKY_CLOUD_COUNT_MOBILE_HIGH = 28;
const SKY_UPDATE_STEP_LOW = 1 / 10;
const SKY_UPDATE_STEP_MEDIUM = 1 / 20;
const SKY_UPDATE_STEP_HIGH = 0;
const TEXTURE_ANISOTROPY_LOW_CAP = 2;
const TEXTURE_ANISOTROPY_MEDIUM_CAP = 4;
const LOBBY3D_CENTER_X = 0;
const LOBBY3D_CENTER_Z = -22;
const LOBBY3D_FLOOR_Y = 18;
const LOBBY3D_HALF_X = 34;
const LOBBY3D_HALF_Z = 24;
const LOBBY3D_WALL_HEIGHT = 10;
const LOBBY3D_PORTAL_TRIGGER_RADIUS = 3.2;
const LOBBY3D_PORTAL_COOLDOWN_MS = 700;
const LOBBY3D_PORTAL_WARMUP_MS = 850;
const LOBBY3D_PORTAL_HOLD_MS = 80;
const LOBBY3D_PORTAL_ARM_DISTANCE = 0.2;
const LOBBY3D_INFO_DESK_INTERACT_RADIUS = 4.4;
const LOBBY3D_INFO_DESK_HINT_COOLDOWN_MS = 1200;
const LOBBY3D_REMOTE_RING_BASE_RADIUS = 10.8;
const LOBBY3D_REMOTE_RING_STEP_RADIUS = 2.8;
const LOBBY3D_REMOTE_RING_BASE_SLOTS = 24;
const LOBBY_CITY_BILLBOARD_URL = new URL("../../PNG/CITY.png", import.meta.url).href;
const LOBBY_METAL_DARK = 0x262a30;
const LOBBY_METAL_MID = 0x59616b;
const LOBBY_METAL_LIGHT = 0xb9c0c8;
const LOBBY_ACCENT_SOFT = 0xd7dde3;
const LOBBY_ACCENT_DIM = 0x8d98a3;
const LOBBY_EXIT_TARGET_URL =
  "https://emptines-chat-2.onrender.com/?zone=lobby&returnPortal=fps&from=fps";
const MAP_DISPLAY_META = Object.freeze({
  forest_frontline: Object.freeze({
    name: getOnlineMapConfig("forest_frontline").name,
    description: getOnlineMapConfig("forest_frontline").description
  }),
  forest_frontline_v2: Object.freeze({
    name: getOnlineMapConfig("forest_frontline").name,
    description: getOnlineMapConfig("forest_frontline").description
  }),
  city_frontline: Object.freeze({
    name: getOnlineMapConfig("city_frontline").name,
    description: getOnlineMapConfig("city_frontline").description
  }),
  training_compound: Object.freeze({
    name: "TRAINING COMPOUND",
    description: "사격 레인 · CQB 훈련장 · 기동 코스"
  })
});
const PORTAL_FX_DURATION_SEC = 0.52;
const PORTAL_FX_TEAM_FOV_BOOST = 7;
const PORTAL_FX_DEPLOY_FOV_BOOST = 12;

function readStoredEffectsVolumeScale() {
  if (typeof window === "undefined") {
    return DEFAULT_EFFECTS_VOLUME_SCALE;
  }
  try {
    const stored = window.localStorage.getItem(EFFECTS_VOLUME_STORAGE_KEY);
    if (stored === null || stored.trim() === "") {
      return DEFAULT_EFFECTS_VOLUME_SCALE;
    }
    const raw = Number(stored);
    if (!Number.isFinite(raw)) {
      return DEFAULT_EFFECTS_VOLUME_SCALE;
    }
    return THREE.MathUtils.clamp(raw, 0, 1);
  } catch {
    return DEFAULT_EFFECTS_VOLUME_SCALE;
  }
}

function readStoredMobileLookSensitivityScale() {
  if (typeof window === "undefined") {
    return DEFAULT_MOBILE_LOOK_SENSITIVITY_SCALE;
  }
  try {
    const stored = window.localStorage.getItem(MOBILE_LOOK_SENSITIVITY_STORAGE_KEY);
    if (stored === null || stored.trim() === "") {
      return DEFAULT_MOBILE_LOOK_SENSITIVITY_SCALE;
    }
    const raw = Number(stored);
    if (!Number.isFinite(raw)) {
      return DEFAULT_MOBILE_LOOK_SENSITIVITY_SCALE;
    }
    return THREE.MathUtils.clamp(
      raw,
      MOBILE_LOOK_SENSITIVITY_MIN_SCALE,
      MOBILE_LOOK_SENSITIVITY_MAX_SCALE
    );
  } catch {
    return DEFAULT_MOBILE_LOOK_SENSITIVITY_SCALE;
  }
}

function readStoredSelectedWeaponId() {
  if (typeof window === "undefined") {
    return DEFAULT_WEAPON_ID;
  }
  try {
    return sanitizeWeaponId(window.localStorage.getItem(SELECTED_WEAPON_STORAGE_KEY));
  } catch {
    return DEFAULT_WEAPON_ID;
  }
}

function readStoredMobileChatHeaderToggleVisible() {
  if (typeof window === "undefined") {
    return DEFAULT_MOBILE_CHAT_HEADER_TOGGLE_VISIBLE;
  }
  try {
    const stored = window.localStorage.getItem(MOBILE_CHAT_HEADER_TOGGLE_STORAGE_KEY);
    if (stored === null || stored.trim() === "") {
      return DEFAULT_MOBILE_CHAT_HEADER_TOGGLE_VISIBLE;
    }
    return stored === "1" || stored === "true";
  } catch {
    return DEFAULT_MOBILE_CHAT_HEADER_TOGGLE_VISIBLE;
  }
}

function normalizeRenderQuality(rawQuality) {
  const quality = String(rawQuality ?? "")
    .trim()
    .toLowerCase();
  if (quality === "low" || quality === "medium" || quality === "high") {
    return quality;
  }
  return DEFAULT_RENDER_QUALITY;
}

function readStoredRenderQuality() {
  return DEFAULT_RENDER_QUALITY;
}

function normalizeTeamId(team) {
  return team === "alpha" || team === "bravo" ? team : null;
}

function getEnemyTeamId(team) {
  if (team === "alpha") {
    return "bravo";
  }
  if (team === "bravo") {
    return "alpha";
  }
  return null;
}

function formatTeamLabel(team) {
  if (team === "alpha") {
    return "블루팀";
  }
  if (team === "bravo") {
    return "레드팀";
  }
  return "중립";
}

function toBlockKey(x, y, z) {
  return `${x}${BLOCK_KEY_SEPARATOR}${y}${BLOCK_KEY_SEPARATOR}${z}`;
}

function isLikelyTouchDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const touchPoints = navigator.maxTouchPoints ?? 0;
  const ua = String(navigator.userAgent ?? "").toLowerCase();
  const uaMobile =
    ua.includes("android") ||
    ua.includes("iphone") ||
    ua.includes("ipad") ||
    ua.includes("ipod") ||
    ua.includes("mobile");

  return touchPoints > 0 || coarse || uaMobile;
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isPerfDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const query = new URLSearchParams(window.location.search);
    if (query.get("perf") === "1") {
      return true;
    }
  } catch {
    // no-op: fallback to localStorage flag
  }

  try {
    return window.localStorage?.getItem("reclaim_perf_debug") === "1";
  } catch {
    return false;
  }
}

function normalizeOnlineEntryRole(raw) {
  return String(raw ?? "").trim().toLowerCase() === "host" ? "host" : "player";
}

function readOnlineEntryRole() {
  if (typeof window === "undefined") {
    return "player";
  }
  try {
    const query = new URLSearchParams(window.location.search);
    return normalizeOnlineEntryRole(query.get("role"));
  } catch {
    return "player";
  }
}

export class Game {
  constructor(mount, options = {}) {
    this.mount = mount;
    this.clock = new THREE.Clock();
    this.chat = options.chat ?? null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_BASE_COLOR);
    this.scene.fog = new THREE.Fog(SKY_BASE_COLOR, 90, 420);

    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });
    this.pixelRatioCap = RENDER_PIXEL_RATIO_HIGH_CAP;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.textureLoader = new THREE.TextureLoader();
    this.graphics = this.loadGraphics();
    this.sound = new SoundSystem();
    this.effectsVolumeScale = readStoredEffectsVolumeScale();
    this.effectsVolumeBeforeMute = Math.max(0.1, this.effectsVolumeScale);
    this.sound.setEffectsVolumeScale(this.effectsVolumeScale);

    this.hud = new HUD();
    this.voxelWorld = new VoxelWorld(this.scene, this.textureLoader);
    this.collapseSystem = new CollapseSystem(this.scene);
    this.selectedWeaponId = readStoredSelectedWeaponId();
    this.selectedWeaponDef = getWeaponDefinition(this.selectedWeaponId);
    this.weapon = new WeaponSystem(this.selectedWeaponDef);
    this.enemyManager = new EnemyManager(this.scene, {
      enemyMap: this.graphics.enemyMap,
      muzzleFlashMap: this.graphics.muzzleFlashMap,
      canHitTarget: (from, to) => this.voxelWorld.hasLineOfSight(from, to),
      isBlockedAt: (x, y, z) => this.voxelWorld.hasBlockAtWorld(x, y, z),
      getSurfaceY: (x, z) => this.voxelWorld.getSurfaceYAt(x, z)
    });
    this.raycaster = new THREE.Raycaster();
    this.buildSystem = new BuildSystem({
      world: this.voxelWorld,
      camera: this.camera,
      raycaster: this.raycaster,
      onModeChanged: (mode) => {
        if (mode !== "gun") {
          this.rightMouseAiming = false;
          this.isAiming = false;
          this.handlePrimaryActionUp();
        }
        if (this.isRunning && !this.optionsMenuOpen && !this.buildSystem.isInventoryOpen()) {
          this.restoreGameplayLookState({ preferPointerLock: false });
        }
        this.updateVisualMode(mode);
        this.syncMobileUtilityButtons();
        this.syncCursorVisibility();
      },
      onInventoryChanged: (open) => {
        if (!this.mobileEnabled) {
          if (open) {
            this.mouseLookEnabled = false;
          } else if (this.isRunning && !this.isGameOver && !this.optionsMenuOpen) {
            this.tryPointerLock({ fallbackUnlockedLook: true });
          }
        }
        this.syncMobileUtilityButtons();
        this.syncCursorVisibility();
      },
      onBlockChanged: (change) => this.handleLocalBlockChanged(change),
      onDigAction: ({ blockKey, completed }) => {
        this.shovelSwingTimer = SHOVEL_SWING_DURATION;
        this.sound.play("shovel", {
          gain: completed ? 0.82 : 0.68,
          rateJitter: 0.05,
          minIntervalMs: 70
        });
        if (completed) {
          this.sound.playBlockBreakCue(blockKey ?? "default");
        }
      },
      onStatus: (text, isAlert = false, duration = 0.5) =>
        this.hud.setStatus(text, isAlert, duration),
      canPlaceBlock: (x, y, z) => !this.isPlayerIntersectingBlock(x, y, z),
      canRemoveBlock: (x, y, z, typeId) =>
        this.canModifyWorldBlock(x, y, z, { mode: "dig", typeId }),
      canInteract: () =>
        this.isRunning &&
        !this.isGameOver &&
        !this.isRespawning &&
        !this.isUiInputFocused() &&
        !this.hud.startOverlayEl?.classList.contains("show")
    });

    this.playerPosition = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;
    this.pendingMouseLookX = 0;
    this.pendingMouseLookY = 0;
    this.unlockedLookLastClientX = null;
    this.unlockedLookLastClientY = null;
    this.keys = new Set();
    this.moveForwardVec = new THREE.Vector3();
    this.moveRightVec = new THREE.Vector3();
    this.moveVec = new THREE.Vector3();
    this.weaponAimReferenceVec = new THREE.Vector3();
    this.weaponAimRotatedVec = new THREE.Vector3();
    this.weaponAimEuler = new THREE.Euler();
    this.skySunDir = new THREE.Vector3();

    this.weaponFlash = null;
    this.weaponFlashLight = null;
    this.weaponViewKeyLight = new THREE.PointLight(0xf5f8ff, 4.2, 5.6, 1.3);
    this.weaponViewKeyLight.position.set(0.38, 0.26, -0.46);
    this.weaponViewFillLight = new THREE.PointLight(0xa9bfd9, 2.1, 5.2, 1.6);
    this.weaponViewFillLight.position.set(-0.24, -0.08, -0.22);
    this.weaponViewCache = new Map();
    this.weaponView = this.getWeaponViewFromCache(this.selectedWeaponId);
    this.bindWeaponViewEffects(this.weaponView);
    this.shovelView = this.createShovelView();
    this.blockView = this.createBlockView();
    this.lastBlockViewTypeId = "";
    this.weaponRecoil = 0;
    this.weaponBobClock = 0;
    this.shovelSwingTimer = 0;
    this.primaryActionRepeatTimer = 0;
    this.currentPlayerHeight = PLAYER_HEIGHT;
    this.isCrouching = false;
    this.mobileCrouchToggle = false;
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.leftMouseDown = false;
    this.lineBuildDragActive = false;
    this.lineBuildDragMoved = false;
    this.lineBuildDragMotion = 0;
    this.aimBlend = 0;
    this.hitSparks = [];

    this.isRunning = false;
    this.isGameOver = false;
    this.pointerLocked = false;
    this.pointerLockFallbackTimer = null;
    this.pointerLockAutoMenuUntil = 0;
    this.unlockLookOnNextPointerLockFailure = false;

    this.state = {
      health: 100,
      score: 0,
      kills: 0,
      captures: 0,
      controlPercent: 0,
      controlOwner: "neutral",
      objectiveText: "",
      killStreak: 0,
      lastKillTime: 0
    };

    this._wasReloading = false;
    this.lastDryFireAt = -10;
    this.chatIntroShown = false;
    this.menuMode = "online";
    this.activeMatchMode = "single";
    this.onlineEntryRole = readOnlineEntryRole();

    this.pointerLockSupported =
      "pointerLockElement" in document &&
      typeof this.renderer.domElement.requestPointerLock === "function";
    this.allowUnlockedLook = !this.pointerLockSupported;
    this.mouseLookEnabled = this.allowUnlockedLook;
    this.mobileEnabled = isLikelyTouchDevice();
    this.mobileModeLocked = this.mobileEnabled;
    if (this.mobileEnabled) {
      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
    }

    this.mobileControlsEl = document.getElementById("mobile-controls");
    this.mobileJoystickEl = document.getElementById("mobile-joystick");
    this.mobileJoystickKnobEl = document.getElementById("mobile-joystick-knob");
    this.mobileFireButtonEl = document.getElementById("mobile-fire");
    this.mobileUtilityEl = document.getElementById("mobile-utility");
    this.mobileBagBtn = document.getElementById("mobile-bag");
    this.mobileModePlaceBtn = document.getElementById("mobile-mode-place");
    this.mobileModeDigBtn = document.getElementById("mobile-mode-dig");
    this.mobileModeGunBtn = document.getElementById("mobile-mode-gun");
    this.mobileAimBtn = document.getElementById("mobile-aim");
    this.mobileJumpBtn = document.getElementById("mobile-jump");
    this.mobileCrouchBtn = document.getElementById("mobile-crouch");
    this.mobileReloadBtn = document.getElementById("mobile-reload");
    this.mobileTabBtn = document.getElementById("mobile-tab");
    this.mobileOptionsBtn = document.getElementById("mobile-options");
    this.mobileChatBtn = document.getElementById("mobile-chat");
    this.mobileLookSensitivityScale = readStoredMobileLookSensitivityScale();
    this.mobileChatHeaderToggleVisible = readStoredMobileChatHeaderToggleVisible();
    this.mobileState = {
      moveForward: 0,
      moveStrafe: 0,
      stickPointerId: null,
      stickCenterX: 0,
      stickCenterY: 0,
      stickRadius: 46,
      lookPointerId: null,
      lookLastX: 0,
      lookLastY: 0,
      aimPointerId: null,
      firePointerId: null
    };
    this._mobileBound = false;

    this.startButton = document.getElementById("start-button");
    this.restartButton = document.getElementById("restart-button");
    this.optionsContinueBtn = document.getElementById("options-continue");
    this.optionsExitBtn = document.getElementById("options-exit");
    this.optionsSfxMuteBtn = document.getElementById("options-sfx-mute");
    this.optionsSfxVolumeEl = document.getElementById("options-sfx-volume");
    this.optionsSfxValueEl = document.getElementById("options-sfx-value");
    this.optionsMobileLookEl = document.getElementById("options-mobile-look");
    this.optionsMobileLookValueEl = document.getElementById("options-mobile-look-value");
    this.optionsMobileChatHeaderLabelEl = document.getElementById("options-mobile-chat-header-label");
    this.optionsMobileChatHeaderValueEl = document.getElementById("options-mobile-chat-header-value");
    this.optionsMobileChatHeaderToggleBtn = document.getElementById("options-mobile-chat-header-toggle");
    this.optionsNavButtons = Array.from(document.querySelectorAll(".options-nav-btn"));
    this._optionsNavBound = false;
    this.quickSettingsBtnEl = document.getElementById("quick-settings-btn");
    this.quickSettingsPanelEl = document.getElementById("quick-settings-panel");
    this.quickQualityButtons = Array.from(document.querySelectorAll(".quick-quality-btn"));
    this.quickFullscreenBtnEl = document.getElementById("quick-fullscreen");
    this.quickOpenOptionsBtnEl = document.getElementById("quick-open-options");
    this.quickSettingsOpen = false;
    this._quickSettingsBound = false;
    this.renderQualityMode = readStoredRenderQuality();
    this._lobbyPerfBudgetActive = false;
    this._lastAppliedPixelRatioCap = this.pixelRatioCap;
    this.startLayoutEl = document.querySelector(".start-layout");
    this.mpStatusEl = document.getElementById("mp-status");
    this.mpCreateBtn = document.getElementById("mp-create");
    this.mpJoinBtn = document.getElementById("mp-join");
    this.mpStartBtn = document.getElementById("mp-start");
    this.mpOpenTrainingBtn = document.getElementById("mp-open-training");
    this.mpOpenSimulacBtn = document.getElementById("mp-open-simulac");
    this.hostCommandPanelEl = document.getElementById("host-command-panel");
    this.hostCommandStateEl = document.getElementById("host-command-state");
    this.hostStartForestBtn = document.getElementById("host-start-forest");
    this.hostStartCityBtn = document.getElementById("host-start-city");
    this.hostOpenLobbyBtn = document.getElementById("host-open-lobby");
    this.hostOpenTrainingBtn = document.getElementById("host-open-training");
    this.hostOpenSimulacBtn = document.getElementById("host-open-simulac");
    this.mpRefreshBtn = document.getElementById("mp-refresh");
    this.mpNameInput = document.getElementById("mp-name");
    this.mpCodeInput = document.getElementById("mp-code");
    this.mpActiveRoomNameEl = document.getElementById("mp-active-room-name");
    this.mpActiveRoomStateEl = document.getElementById("mp-active-room-state");
    this.mpActiveMapNameEl = document.getElementById("mp-active-map-name");
    this.mpActiveMapDescEl = document.getElementById("mp-active-map-desc");
    this.mpWeaponSummaryEl = document.getElementById("mp-weapon-summary");
    this.mpWeaponButtons = Array.from(document.querySelectorAll(".mp-weapon-btn[data-weapon-id]"));
    this.mpRoomListEl = document.getElementById("mp-room-list");
    this.mpLobbyEl = document.getElementById("mp-lobby");
    this.mpRoomTitleEl = document.getElementById("mp-room-title");
    this.mpRoomSubtitleEl = document.getElementById("mp-room-subtitle");
    this.mpPlayerListEl = document.getElementById("mp-player-list");
    this.mpCopyCodeBtn = document.getElementById("mp-copy-code");
    this.mpLeaveBtn = document.getElementById("mp-leave");
    this.mpTeamAlphaBtn = document.getElementById("mp-team-alpha");
    this.mpTeamBravoBtn = document.getElementById("mp-team-bravo");
    this.mpTeamAlphaCountEl = document.getElementById("mp-team-alpha-count");
    this.mpTeamBravoCountEl = document.getElementById("mp-team-bravo-count");
    this.mpEnterLobbyBtn = document.getElementById("mp-enter-lobby");
    this.mpPortalHintEl = document.getElementById("mp-portal-hint");
    this.lobbyQuickPanelEl = document.getElementById("lobby-quick-panel");
    this.lobbyQuickNameInput = document.getElementById("lobby-quick-name");
    this.lobbyQuickNameSaveBtn = document.getElementById("lobby-quick-name-save");
    this.lobbyQuickCountEl = document.getElementById("lobby-quick-count");
    this.lobbyQuickGuideEl = document.getElementById("lobby-quick-guide");
    this.lobbyQuickRankListEl = document.getElementById("lobby-quick-rank-list");
    this.tabScoreboardEl = document.getElementById("tab-scoreboard");
    this.tabAlphaListEl = document.getElementById("tab-alpha-list");
    this.tabBravoListEl = document.getElementById("tab-bravo-list");
    this.tabAlphaCountEl = document.getElementById("tab-alpha-count");
    this.tabBravoCountEl = document.getElementById("tab-bravo-count");
    this.ctfScoreboardEl = document.getElementById("ctf-scoreboard");
    this.ctfScoreAlphaEl = document.getElementById("ctf-score-alpha");
    this.ctfScoreBravoEl = document.getElementById("ctf-score-bravo");
    this.flagInteractBtnEl = document.getElementById("flag-interact-btn");
    this.portalTransitionEl = document.getElementById("portal-transition");
    this.respawnBannerEl = document.getElementById("respawn-banner");
    this.minimapShellEl = document.getElementById("minimap-shell");
    this.minimapCanvasEl = document.getElementById("minimap-canvas");
    this.minimapCtx = this.minimapCanvasEl?.getContext?.("2d") ?? null;
    this.lastMinimapDrawAt = 0;
    this.lastAppliedFov = DEFAULT_FOV;
    this._lobbySocketBound = false;
    this._joiningDefaultRoom = false;
    this._nextAutoJoinAt = 0;
    this._autoEnteredLobby3D = false;
    this.onlineRoomCount = 0;
    this.tabBoardVisible = false;
    this._lastLobbyQuickPanelVisible = null;
    this._lastLobbyQuickCountText = "";
    this._lastLobbyQuickGuideText = "";
    this._lastLobbyQuickRankSignature = "";
    this.dailyLeaderboard = {
      dateKey: "",
      resetAt: 0,
      updatedAt: 0,
      players: []
    };
    this._dailyLeaderboardSignature = "";

    this.lobbyState = {
      roomCode: null,
      hostId: null,
      players: [],
      selectedTeam: null,
      state: null
    };
    this.lobby3d = {
      active: false,
      group: null,
      floorY: LOBBY3D_FLOOR_Y,
      centerX: LOBBY3D_CENTER_X,
      centerZ: LOBBY3D_CENTER_Z,
      bounds: {
        minX: LOBBY3D_CENTER_X - (LOBBY3D_HALF_X - 1),
        maxX: LOBBY3D_CENTER_X + (LOBBY3D_HALF_X - 1),
        minZ: LOBBY3D_CENTER_Z - (LOBBY3D_HALF_Z - 1),
        maxZ: LOBBY3D_CENTER_Z + (LOBBY3D_HALF_Z - 1)
      },
      spawn: new THREE.Vector3(LOBBY3D_CENTER_X, LOBBY3D_FLOOR_Y + PLAYER_HEIGHT, LOBBY3D_CENTER_Z + 14.2),
      portals: [],
      pulseClock: 0,
      animationAccumulator: 0,
      activePortalId: "",
      portalCooldownUntil: 0,
      pendingPortalId: "",
      pendingPortalSince: 0,
      enteredAt: 0,
      portalActivationArmed: false,
      infoDesk: null,
      lastDeskHintAt: 0,
      remotePreviewSignature: "",
      rankBoard: null
    };
    this.portalFx = {
      active: false,
      timer: 0,
      duration: PORTAL_FX_DURATION_SEC,
      fovBoost: 0,
      seed: 0,
      phase: 0,
      type: "alpha"
    };
    this.remotePlayers = new Map();
    this.remoteBoxGeometryCache = new Map();
    this.remoteSyncClock = 0;
    this.lobbyRemotePreviewAccumulator = 0;
    this._toRemote = new THREE.Vector3();
    this._remoteHead = new THREE.Vector3();
    this._pvpBox = new THREE.Box3();
    this._pvpBoxMin = new THREE.Vector3();
    this._pvpBoxMax = new THREE.Vector3();
    this._pvpHitPoint = new THREE.Vector3();
    this._pvpHeadHitPoint = new THREE.Vector3();
    this._pvpBodyHitPoint = new THREE.Vector3();
    this.pendingRemoteBlocks = new Map();
    this.dynamicBlockState = new Map();
    this.shotBlockDamageState = new Map();
    this.latestRoomSnapshot = null;
    this.lastAppliedRoomSnapshotKey = "";
    this.syncLobbyNicknameInputs(this.chat?.playerName ?? "", { force: true });

    this.objective = {
      alphaBase: new THREE.Vector3(),
      bravoBase: new THREE.Vector3(),
      trainingSpawn: new THREE.Vector3(),
      alphaFlagHome: new THREE.Vector3(),
      bravoFlagHome: new THREE.Vector3(),
      centerFlagHome: new THREE.Vector3(),
      playerHasEnemyFlag: false,
      controlPoint: new THREE.Vector3(),
      controlRadius: 6.4,
      controlProgress: 0,
      controlOwner: "neutral",
      controlBonusTimer: 0,
      controlStatusCooldown: 0,
      controlPulse: 0
    };
    this.baseSupport = {
      healPool: 0,
      ammoPool: 0
    };
    this.alphaFlag = null;
    this.bravoFlag = null;
    this.onlineCenterFlag = null;
    this.onlineCenterFlagCloth = null;
    this.onlineCenterFlagPulse = 0;
    this.controlBeacon = null;
    this.controlRing = null;
    this.controlCore = null;
    this.objectiveMarkers = [];
    this.onlineCtf = {
      mode: DEFAULT_GAME_MODE,
      revision: 0,
      flags: {
        alpha: {
          home: new THREE.Vector3(),
          at: new THREE.Vector3(),
          carrierId: null
        },
        bravo: {
          home: new THREE.Vector3(),
          at: new THREE.Vector3(),
          carrierId: null
        }
      },
      score: { alpha: 0, bravo: 0 },
      captures: { alpha: 0, bravo: 0 }
    };
    this.onlineTargetScore = CTF_WIN_SCORE;
    this.onlineRoundEnded = false;
    this.onlineRoundWinnerTeam = null;
    this.onlineRoundRestartAt = 0;
    this.onlineRoundLastSecond = -1;
    this.lastRoomStartedAt = 0;
    this.flagInteractVisible = false;
    this.flagInteractMode = "none";
    this.flagInteractCooldownUntil = 0;
    this.scoreHudState = { show: null, alpha: null, bravo: null };
    this.pvpImmuneHintUntil = 0;
    this.flagShootBlockedHintUntil = 0;
    this.optionsMenuOpen = false;

    this._initialized = false;
    this.onlineMapId = ONLINE_MAP_ID;
    this.mapId = this.onlineMapId ?? ONLINE_MAP_ID;
    this.skyDome = null;
    this.skyCloudSprites = [];
    this.skyCloudTexture = null;
    this.skyGradientTexture = null;
    this.skySunTexture = null;
    this.skySunSprite = null;
    this.skyUpdateAccumulator = 0;
    this._bucketOptimizeCooldown = BUCKET_OPTIMIZE_INTERVAL;
    this.perfDebugEnabled = isPerfDebugEnabled();
    this.perfStats = {
      frameCount: 0,
      totalMs: 0,
      slowFrames: 0,
      worstMs: 0,
      lastReportAt: getNowMs()
    };
    this.lowFpsStrikes = 0;
    this.lowSpecModeApplied = false;
    this.isRespawning = false;
    this.respawnEndAt = 0;
    this.respawnLastSecond = -1;
    this.localDeathAnimStartAt = 0;
    this.localDeathAnimBlend = 0;
    this.fallStartY = this.playerPosition.y;
    this.lastHazardEmitAt = 0;
  }

  init() {
    if (this._initialized) {
      return;
    }
    if (!this.mount) {
      throw new Error("Game mount element not found (#app).");
    }

    this._initialized = true;
    this.mount.appendChild(this.renderer.domElement);
    this.scene.add(this.camera);
    this.camera.add(this.weaponView);
    this.prewarmWeaponViewCache();
    this.camera.add(this.shovelView);
    this.camera.add(this.blockView);
    this.camera.add(this.weaponViewKeyLight);
    this.camera.add(this.weaponViewFillLight);
    this.setupWorld();
    this.applyRenderQualityMode(this.renderQualityMode, { persist: true, announce: false });
    this.repairUiLabels();
    this.chat?.setMobileHeaderToggleVisible?.(this.mobileChatHeaderToggleVisible);
    this.bindEvents();
    this.bindQuickSettingsControls();
    this.setupMobileControls();
    this.resetState();
    this.updateVisualMode(this.buildSystem.getToolMode());

    if (this.chat?.setFocusChangeHandler) {
      this.chat.setFocusChangeHandler((focused) => this.onChatFocusChanged(focused));
    }
    if (this.chat?.setTeamResolver) {
      this.chat.setTeamResolver(() => this.getMyTeam());
    }
    this.setupLobbySocket();
    this.setStartMenuMode("online");
    this.syncWeaponSelectionUi();
    this.refreshOnlineStatus();

    this.syncCursorVisibility();
    this.loop();
  }

  setStartMenuMode(mode = "online") {
    const nextMode = mode === "single" ? "single" : "online";
    const btnSingle = document.getElementById("mode-single");
    const btnOnline = document.getElementById("mode-online");
    const panelSingle = document.getElementById("single-panel");
    const panelOnline = document.getElementById("online-panel");

    this.menuMode = nextMode;
    if (!btnSingle || !btnOnline || !panelSingle || !panelOnline) {
      return;
    }

    const showSingle = nextMode === "single";
    btnSingle.classList.toggle("is-active", showSingle);
    btnSingle.setAttribute("aria-selected", showSingle ? "true" : "false");
    btnOnline.classList.toggle("is-active", !showSingle);
    btnOnline.setAttribute("aria-selected", showSingle ? "false" : "true");
    panelSingle.classList.toggle("hidden", !showSingle);
    panelOnline.classList.toggle("hidden", showSingle);
  }

  getCurrentMapDisplayMeta() {
    const mapId = String(this.mapId ?? "")
      .trim()
      .toLowerCase();
    const fallbackName = mapId ? mapId.replaceAll("_", " ").toUpperCase() : "ACTIVE MAP";
    return MAP_DISPLAY_META[mapId] ?? {
      name: fallbackName,
      description: "온라인 전장"
    };
  }

  getNextOnlineMapDisplayMeta(mapId = this.onlineMapId) {
    const nextMapId = getNextOnlineMapId(mapId);
    return MAP_DISPLAY_META[nextMapId] ?? this.getCurrentMapDisplayMeta();
  }

  getWorldLimit() {
    const halfExtent = Number(this.voxelWorld?.getArenaMeta?.()?.halfExtent ?? WORLD_LIMIT);
    return Math.max(WORLD_LIMIT, halfExtent - 1);
  }

  getMapIdForMode(mode = this.activeMatchMode) {
    return mode === "online" ? this.onlineMapId ?? ONLINE_MAP_ID : TRAINING_MAP_ID;
  }

  getOnlineConnectionUiState() {
    const connected = !!this.chat?.isConnected?.();
    const connecting = !!this.chat?.isConnecting?.();
    const retrying = Boolean(this.chat?.notifiedOffline);
    return {
      connected,
      connecting,
      retrying
    };
  }

  syncOnlineHubSummary() {
    const { connected, connecting, retrying } = this.getOnlineConnectionUiState();
    const inRoom = !!this.lobbyState.roomCode;
    const roomCount = Math.max(
      0,
      Math.trunc(
        Number(inRoom ? this.lobbyState.players.length : this.onlineRoomCount) || 0
      )
    );
    const roomName = inRoom ? this.lobbyState.roomCode : ONLINE_ROOM_CODE;
    const mapMeta = this.getCurrentMapDisplayMeta();

    if (this.mpActiveRoomNameEl) {
      this.mpActiveRoomNameEl.textContent = roomName || ONLINE_ROOM_CODE;
    }
    if (this.mpActiveRoomStateEl) {
      let text = "오프라인";
      let state = "offline";
      if (connected && inRoom) {
        text = `${roomCount}/${ONLINE_MAX_PLAYERS} 활성`;
        state = "online";
      } else if (connected) {
        text = "자동 참가 중";
        state = "online";
      } else if (connecting) {
        text = retrying ? "재시도 중" : "연결 중";
        state = "offline";
      }
      this.mpActiveRoomStateEl.textContent = text;
      this.mpActiveRoomStateEl.dataset.state = state;
    }
    if (this.mpActiveMapNameEl) {
      this.mpActiveMapNameEl.textContent = mapMeta.name;
    }
    if (this.mpActiveMapDescEl) {
      this.mpActiveMapDescEl.textContent = connected
        ? `${mapMeta.description} · ${roomCount}/${ONLINE_MAX_PLAYERS} 접속`
        : connecting && retrying
          ? `${mapMeta.description} · 서버 재연결 시도 중`
          : connecting
            ? `${mapMeta.description} · 서버 연결 중`
            : `${mapMeta.description} · 서버 오프라인`;
    }
  }

  syncWeaponSelectionUi() {
    const selected = getWeaponDefinition(this.selectedWeaponId);
    if (this.mpWeaponSummaryEl) {
      this.mpWeaponSummaryEl.textContent = `${selected.name} · ${selected.category}`;
    }
    for (const button of this.mpWeaponButtons) {
      const weaponId = sanitizeWeaponId(button.dataset.weaponId);
      button.classList.toggle("is-active", weaponId === selected.id);
    }
  }

  disposeWeaponView(group = null) {
    if (!group) {
      return;
    }
    group.traverse((child) => {
      if (!child?.isMesh) {
        return;
      }
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) {
        for (const material of child.material) {
          material?.dispose?.();
        }
      } else {
        child.material?.dispose?.();
      }
    });
  }

  rebuildWeaponViewModel() {
    const previousView = this.weaponView ?? null;
    if (previousView) {
      previousView.visible = false;
    }
    this.weaponView = this.getWeaponViewFromCache(this.selectedWeaponId);
    if (this.weaponView.parent !== this.camera) {
      this.camera.add(this.weaponView);
    }
    this.weaponView.visible = false;
    this.bindWeaponViewEffects(this.weaponView);
  }

  prewarmWeaponViewCache() {
    if (!this.camera) {
      return;
    }
    for (const weapon of WEAPON_CATALOG) {
      const view = this.getWeaponViewFromCache(weapon.id);
      view.visible = false;
      if (view.parent !== this.camera) {
        this.camera.add(view);
      }
    }
  }

  bindWeaponViewEffects(group = null) {
    this.weaponFlash = group?.userData?.weaponFlash ?? null;
    this.weaponFlashLight = group?.userData?.weaponFlashLight ?? null;
    if (this.weaponFlash) {
      this.weaponFlash.material.opacity = 0;
    }
    if (this.weaponFlashLight) {
      this.weaponFlashLight.intensity = 0;
    }
  }

  applySelectedWeapon(
    weaponId,
    { persist = true, syncToServer = false, resetAmmo = false, announce = false } = {}
  ) {
    const nextWeapon = getWeaponDefinition(weaponId);
    const changed = this.selectedWeaponId !== nextWeapon.id;
    this.selectedWeaponId = nextWeapon.id;
    this.selectedWeaponDef = nextWeapon;

    if (persist && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SELECTED_WEAPON_STORAGE_KEY, nextWeapon.id);
      } catch {
        // Ignore persistence failures.
      }
    }

    this.weapon?.configure(nextWeapon, { resetAmmo });
    this.syncWeaponSelectionUi();
    if (changed) {
      this.rebuildWeaponViewModel();
    }
    if (syncToServer) {
      this.pushSelectedWeaponToServer(nextWeapon.id, { quiet: !announce });
    }
    if (announce) {
      this.hud.setStatus(`주무기 선택: ${nextWeapon.name}`, false, 0.8);
    }
  }

  showOnlineHub({ statusText = "", isAlert = false, duration = 0.75 } = {}) {
    if (this.isRunning) {
      return;
    }

    this.setStartMenuMode("online");
    this.setLobby3DActive(false, { reposition: false });
    this.chat?.close?.();
    this.updateVisualMode(this.buildSystem.getToolMode());
    this.hud.showStartOverlay(true);
    this.optionsMenuOpen = false;
    this.mouseLookEnabled = false;
    if (
      this.pointerLockSupported &&
      document.pointerLockElement === this.renderer.domElement
    ) {
      document.exitPointerLock();
    }
    this.refreshOnlineStatus();
    this.syncCursorVisibility();
    if (statusText) {
      this.hud.setStatus(statusText, isAlert, duration);
    }
  }

  loadGraphics() {
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const configureColorTexture = (url, repeatX = 1, repeatY = 1) => {
      const texture = this.textureLoader.load(url);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      return texture;
    };

    const configureSpriteTexture = (url) => {
      const texture = this.textureLoader.load(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    return {
      groundMap: configureColorTexture("/assets/graphics/world/textures/ground.svg", 26, 26),
      concreteMap: configureColorTexture("/assets/graphics/world/textures/concrete.svg", 1.4, 1.4),
      metalMap: configureColorTexture("/assets/graphics/world/textures/metal.svg", 1.2, 1.2),
      enemyMap: configureColorTexture("/assets/graphics/world/textures/metal.svg", 1, 1),
      muzzleFlashMap: configureSpriteTexture("/assets/graphics/world/sprites/muzzleflash.svg"),
      sparkMap: configureSpriteTexture("/assets/graphics/world/sprites/spark.svg")
    };
  }

  setupWorld() {
    this.setupSky();

    const hemiLight = new THREE.HemisphereLight(0xbfe7ff, 0x33522a, 1.04);
    this.scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfff5d3, 1.28);
    sun.position.set(58, 68, 32);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE_DEFAULT, SHADOW_MAP_SIZE_DEFAULT);
    sun.shadow.camera.left = -SHADOW_CAMERA_EXTENT_DEFAULT;
    sun.shadow.camera.right = SHADOW_CAMERA_EXTENT_DEFAULT;
    sun.shadow.camera.top = SHADOW_CAMERA_EXTENT_DEFAULT;
    sun.shadow.camera.bottom = -SHADOW_CAMERA_EXTENT_DEFAULT;
    sun.shadow.bias = -0.00026;
    sun.shadow.normalBias = 0.018;
    this.sunLight = sun;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8bc8ff, 0.42);
    fill.position.set(-42, 34, -22);
    this.scene.add(fill);

    this.rebuildArenaWorld({ preserveLobbyGeometry: false });
    this.setupLobby3D();
  }

  rebuildArenaWorld({ preserveLobbyGeometry = false } = {}) {
    this.voxelWorld.generateTerrain({ mapId: this.mapId });
    if (preserveLobbyGeometry) {
      this.stampLobby3DVoxelLayout();
    }
    this.setupObjectives();
  }

  isLobby3DActive() {
    return Boolean(this.lobby3d?.active) && !this.isRunning && !this.isGameOver;
  }

  isUiInputFocused() {
    if (this.chat?.isExpanded?.()) {
      return true;
    }
    if (this.mobileEnabled && this.chat?.isMobileInputOpen?.()) {
      return true;
    }
    if (this.chat?.isInputFocused) {
      return true;
    }
    if (typeof document === "undefined") {
      return false;
    }
    const activeEl = document.activeElement;
    if (!activeEl || activeEl === document.body) {
      return false;
    }
    if (activeEl === this.mpNameInput || activeEl === this.lobbyQuickNameInput) {
      return true;
    }
    const tag = String(activeEl.tagName ?? "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      return true;
    }
    return Boolean(activeEl.isContentEditable);
  }

  clearUiInputFocus() {
    if (typeof document === "undefined") {
      return;
    }
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement && activeEl !== document.body) {
      activeEl.blur?.();
    }
    this.chat?.inputEl?.blur?.();
    this.mpNameInput?.blur?.();
    this.lobbyQuickNameInput?.blur?.();
  }

  resetLineBuildDrag() {
    this.lineBuildDragActive = false;
    this.lineBuildDragMoved = false;
    this.lineBuildDragMotion = 0;
    this.buildSystem?.clearLineAnchor?.();
  }

  setupLobby3D() {
    if (!this.lobby3d) {
      return;
    }

    const centerX = this.lobby3d.centerX;
    const centerZ = this.lobby3d.centerZ;
    const floorY = this.lobby3d.floorY;
    const minX = centerX - LOBBY3D_HALF_X;
    const maxX = centerX + LOBBY3D_HALF_X;
    const minZ = centerZ - LOBBY3D_HALF_Z;
    const maxZ = centerZ + LOBBY3D_HALF_Z;
    const wallTopY = floorY + LOBBY3D_WALL_HEIGHT;

    this.stampLobby3DVoxelLayout();

    const lobbyGroup = new THREE.Group();
    lobbyGroup.visible = false;

    const roomFrame = new THREE.Mesh(
      new THREE.BoxGeometry(LOBBY3D_HALF_X * 2 + 0.7, LOBBY3D_WALL_HEIGHT + 0.6, LOBBY3D_HALF_Z * 2 + 0.7),
      new THREE.MeshStandardMaterial({
        color: LOBBY_METAL_DARK,
        roughness: 0.54,
        metalness: 0.34,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      })
    );
    roomFrame.position.set(centerX, floorY + LOBBY3D_WALL_HEIGHT * 0.5 - 0.02, centerZ);
    lobbyGroup.add(roomFrame);
    const shooterSetPieces = this.createLobbyShooterSetPieces({
      centerX,
      centerZ,
      floorY,
      minX,
      maxX,
      minZ,
      maxZ
    });
    lobbyGroup.add(shooterSetPieces);

    this.lobby3d.rankBoard = this.createLobbyRankBoardMesh({
      x: maxX - 1.05,
      y: floorY + 3.12,
      z: centerZ - 0.8,
      yaw: -Math.PI * 0.5
    });
    lobbyGroup.add(this.lobby3d.rankBoard.group);

    const portalOffsetX = Math.max(7.2, LOBBY3D_HALF_X - 4.2);
    const portalOffsetZ = Math.max(6.2, LOBBY3D_HALF_Z - 3.6);

    const specs = [
      {
        id: "training",
        label: "훈련장",
        action: "training",
        color: 0xb6c0ca,
        x: centerX - portalOffsetX,
        z: centerZ + 0.1
      },
      {
        id: "online",
        label: "온라인 허브",
        action: "online",
        color: 0xc7d0d2,
        x: centerX + portalOffsetX,
        z: centerZ + 0.1
      },
      {
        id: "exit",
        label: "시뮬라크 월드",
        action: "exit",
        color: 0xd8cbbe,
        x: centerX,
        z: centerZ - portalOffsetZ
      }
    ];

    this.lobby3d.portals = specs.map((spec) => {
      const portal = new THREE.Group();
      portal.position.set(spec.x, floorY + 1.85, spec.z);
      portal.lookAt(centerX, floorY + 1.85, centerZ);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.18, 24, 52),
        new THREE.MeshStandardMaterial({
          color: spec.color,
          roughness: 0.18,
          metalness: 0.54,
          emissive: spec.color,
          emissiveIntensity: 0.44,
          transparent: true,
          opacity: 0.78
        })
      );

      const core = new THREE.Mesh(
        new THREE.CircleGeometry(1.22, 36),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      core.renderOrder = 10;

      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(1.02, 36),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.38,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      glow.renderOrder = 11;

      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(1.22, 1.38, 0.42, 16),
        new THREE.MeshStandardMaterial({
          color: LOBBY_METAL_DARK,
          roughness: 0.58,
          metalness: 0.22,
          emissive: 0x373d45,
          emissiveIntensity: 0.18
        })
      );
      pedestal.position.y = -1.55;

      const label = this.createLobbyPortalLabelSprite(spec.label, spec.color);
      label.position.set(0, 2.14, 0);

      portal.add(pedestal, ring, core, glow, label);
      if (spec.id === "exit") {
        const billboard = this.createLobbyPortalBillboard({
          imageUrl: LOBBY_CITY_BILLBOARD_URL,
          title: "CITY"
        });
        billboard.position.set(0, 4.85, -0.14);
        portal.add(billboard);
      }
      lobbyGroup.add(portal);

      return {
        ...spec,
        group: portal,
        ring,
        core,
        glow
      };
    });

    if (this.lobby3d.group) {
      this.scene.remove(this.lobby3d.group);
    }
    this.lobby3d.group = lobbyGroup;
    this.lobby3d.activePortalId = "";
    this.lobby3d.portalCooldownUntil = 0;
    this.lobby3d.pendingPortalId = "";
    this.lobby3d.pendingPortalSince = 0;
    this.lobby3d.enteredAt = 0;
    this.lobby3d.portalActivationArmed = false;
    this.lobby3d.remotePreviewSignature = "";
    this.lobby3d.pulseClock = 0;
    this.scene.add(lobbyGroup);
    this.syncLobby3DPortalState();
    this.renderLobbyRankBoard(true);
  }

  isLobby3DProtectedBlockCoord(x = 0, y = 0, z = 0) {
    const floorY = Number(this.lobby3d?.floorY ?? LOBBY3D_FLOOR_Y);
    const centerX = Number(this.lobby3d?.centerX ?? LOBBY3D_CENTER_X);
    const centerZ = Number(this.lobby3d?.centerZ ?? LOBBY3D_CENTER_Z);
    const minX = centerX - LOBBY3D_HALF_X;
    const maxX = centerX + LOBBY3D_HALF_X;
    const minZ = centerZ - LOBBY3D_HALF_Z;
    const maxZ = centerZ + LOBBY3D_HALF_Z;
    const wallTopY = floorY + LOBBY3D_WALL_HEIGHT;
    const bx = Math.trunc(Number(x));
    const by = Math.trunc(Number(y));
    const bz = Math.trunc(Number(z));
    if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) {
      return false;
    }
    if (bx < minX || bx > maxX || bz < minZ || bz > maxZ) {
      return false;
    }
    return by >= floorY - 1 && by <= wallTopY;
  }

  stampLobby3DVoxelLayout() {
    if (!this.lobby3d) {
      return;
    }

    const centerX = this.lobby3d.centerX;
    const centerZ = this.lobby3d.centerZ;
    const floorY = this.lobby3d.floorY;
    const minX = centerX - LOBBY3D_HALF_X;
    const maxX = centerX + LOBBY3D_HALF_X;
    const minZ = centerZ - LOBBY3D_HALF_Z;
    const maxZ = centerZ + LOBBY3D_HALF_Z;
    const wallTopY = floorY + LOBBY3D_WALL_HEIGHT;

    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        this.voxelWorld.setBlock(x, floorY - 1, z, 8);
        for (let y = floorY; y <= wallTopY; y += 1) {
          this.voxelWorld.removeBlock(x, y, z);
        }
      }
    }

    for (let y = floorY; y <= wallTopY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        this.voxelWorld.setBlock(x, y, minZ, 3);
        this.voxelWorld.setBlock(x, y, maxZ, 3);
      }
      for (let z = minZ; z <= maxZ; z += 1) {
        this.voxelWorld.setBlock(minX, y, z, 3);
        this.voxelWorld.setBlock(maxX, y, z, 3);
      }
    }

    for (let x = minX + 1; x <= maxX - 1; x += 1) {
      this.voxelWorld.setBlock(x, wallTopY, minZ + 1, 8);
      this.voxelWorld.setBlock(x, wallTopY, maxZ - 1, 8);
    }
    for (let z = minZ + 1; z <= maxZ - 1; z += 1) {
      this.voxelWorld.setBlock(minX + 1, wallTopY, z, 8);
      this.voxelWorld.setBlock(maxX - 1, wallTopY, z, 8);
    }
  }

  createLobbyPortalLabelSprite(text, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      const hex = Number(color) || 0x89d3ff;
      const r = (hex >> 16) & 0xff;
      const g = (hex >> 8) & 0xff;
      const b = hex & 0xff;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(24, 28, 34, 0.84)";
      context.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.88)`;
      context.lineWidth = 4;
      context.fillRect(16, 22, canvas.width - 32, 84);
      context.strokeRect(16, 22, canvas.width - 32, 84);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "700 46px Segoe UI, Arial, sans-serif";
      context.fillStyle = "rgba(238, 241, 245, 0.98)";
      context.fillText(String(text ?? "").slice(0, 20), canvas.width * 0.5, canvas.height * 0.54);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false
      })
    );
    sprite.scale.set(2.8, 0.66, 1);
    sprite.renderOrder = 12;
    return sprite;
  }

  createLobbyPortalBillboard({ imageUrl = "", title = "CITY" } = {}) {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.2, 12),
      new THREE.MeshStandardMaterial({
        color: LOBBY_METAL_MID,
        roughness: 0.46,
        metalness: 0.46
      })
    );
    pole.position.set(0, -1.1, -0.08);
    pole.castShadow = true;
    group.add(pole);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(5.5, 2.95, 0.14),
      new THREE.MeshStandardMaterial({
        color: LOBBY_METAL_DARK,
        roughness: 0.42,
        metalness: 0.34,
        emissive: 0x3a4047,
        emissiveIntensity: 0.16
      })
    );
    frame.castShadow = true;
    frame.receiveShadow = true;
    group.add(frame);

    const inset = new THREE.Mesh(
      new THREE.BoxGeometry(5.18, 2.62, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x111418,
        roughness: 0.64,
        metalness: 0.08
      })
    );
    inset.position.z = 0.05;
    group.add(inset);

    const texture = this.textureLoader.load(imageUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1;

    const image = new THREE.Mesh(
      new THREE.PlaneGeometry(4.98, 2.38),
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide
      })
    );
    image.position.z = 0.09;
    image.renderOrder = 14;
    group.add(image);

    const titleSprite = this.createLobbyPortalLabelSprite(title, LOBBY_ACCENT_SOFT);
    titleSprite.scale.set(1.92, 0.46, 1);
    titleSprite.position.set(0, 1.9, 0.1);
    group.add(titleSprite);

    return group;
  }

  createLobbyAmmoCrate({ x = 0, y = 0, z = 0, yaw = 0, stack = 1 } = {}) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = yaw;

    const crateMat = new THREE.MeshStandardMaterial({
      color: 0x3a2f25,
      roughness: 0.72,
      metalness: 0.06
    });
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0x768498,
      roughness: 0.28,
      metalness: 0.58
    });
    const roundMat = new THREE.MeshStandardMaterial({
      color: 0xb7c9df,
      roughness: 0.24,
      metalness: 0.72,
      emissive: 0x213246,
      emissiveIntensity: 0.24
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xd9b36b,
      roughness: 0.34,
      metalness: 0.62
    });

    for (let i = 0; i < Math.max(1, stack); i += 1) {
      const layerY = i * 0.52;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.46, 0.86), crateMat);
      crate.position.set(0, layerY + 0.23, 0);
      crate.castShadow = true;
      crate.receiveShadow = true;
      group.add(crate);

      const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.9), bandMat);
      band.position.set(0, layerY + 0.25, 0);
      band.castShadow = true;
      group.add(band);
    }

    for (let i = 0; i < 6; i += 1) {
      const round = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 12), roundMat);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.1, 12), tipMat);
      const row = Math.floor(i / 3);
      const col = i % 3;
      const px = -0.24 + col * 0.24;
      const pz = -0.16 + row * 0.28;
      const py = 0.28 + Math.max(1, stack) * 0.52;

      round.rotation.z = Math.PI * 0.5;
      tip.rotation.z = Math.PI * 0.5;
      round.position.set(px, py, pz);
      tip.position.set(px + 0.2, py, pz);
      round.castShadow = true;
      tip.castShadow = true;
      group.add(round, tip);
    }

    return group;
  }

  createLobbyWeaponRack({ x = 0, y = 0, z = 0, yaw = 0 } = {}) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = yaw;

    const frameMat = new THREE.MeshStandardMaterial({
      color: LOBBY_METAL_DARK,
      roughness: 0.52,
      metalness: 0.34
    });
    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x34393f,
      roughness: 0.36,
      metalness: 0.54
    });
    const stockMat = new THREE.MeshStandardMaterial({
      color: 0x595149,
      roughness: 0.62,
      metalness: 0.08
    });

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.2), frameMat);
    base.position.set(0, 0.09, 0);
    base.receiveShadow = true;
    group.add(base);

    const railTop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.2), frameMat);
    railTop.position.set(0, 1.32, -0.36);
    railTop.castShadow = true;
    group.add(railTop);

    const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.36, 0.14), frameMat);
    const rightPost = leftPost.clone();
    leftPost.position.set(-1.5, 0.68, -0.4);
    rightPost.position.set(1.5, 0.68, -0.4);
    leftPost.castShadow = true;
    rightPost.castShadow = true;
    group.add(leftPost, rightPost);

    const createRifle = (offsetX) => {
      const rifle = new THREE.Group();
      rifle.position.set(offsetX, 0.94, 0.02);
      rifle.rotation.z = -0.24;

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.92), gunMat);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.64), gunMat);
      barrel.position.set(0, 0.02, 0.74);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.2, 0.34), stockMat);
      stock.position.set(0, -0.04, -0.58);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.18), stockMat);
      mag.position.set(0, -0.18, 0.08);

      body.castShadow = true;
      barrel.castShadow = true;
      stock.castShadow = true;
      mag.castShadow = true;
      rifle.add(body, barrel, stock, mag);
      return rifle;
    };

    group.add(createRifle(-0.88), createRifle(0), createRifle(0.88));
    return group;
  }

  createLobbyDeskSignSprite(text = "안내 데스크") {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 176;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(25, 29, 35, 0.88)";
      context.strokeStyle = "rgba(215, 221, 227, 0.92)";
      context.lineWidth = 5;
      context.fillRect(20, 26, canvas.width - 40, canvas.height - 52);
      context.strokeRect(20, 26, canvas.width - 40, canvas.height - 52);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "700 58px Segoe UI, Arial, sans-serif";
      context.fillStyle = "rgba(241, 243, 245, 0.98)";
      context.fillText(String(text).slice(0, 20), canvas.width * 0.5, canvas.height * 0.5 + 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false
      })
    );
    sprite.scale.set(3.5, 0.96, 1);
    sprite.renderOrder = 16;
    return sprite;
  }

  createLobbyInfoDesk({ x = 0, y = 0, z = 0, yaw = 0 } = {}) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = yaw;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2c3138,
      roughness: 0.56,
      metalness: 0.26
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: LOBBY_METAL_LIGHT,
      roughness: 0.3,
      metalness: 0.42,
      emissive: 0x555d66,
      emissiveIntensity: 0.14
    });
    const monitorFrameMat = new THREE.MeshStandardMaterial({
      color: LOBBY_METAL_DARK,
      roughness: 0.46,
      metalness: 0.34
    });
    const monitorScreenMat = new THREE.MeshBasicMaterial({
      color: 0xdde3ea,
      transparent: true,
      opacity: 0.76
    });
    const ropeMat = new THREE.MeshStandardMaterial({
      color: LOBBY_METAL_MID,
      roughness: 0.52,
      metalness: 0.18
    });

    const counterBase = new THREE.Mesh(new THREE.BoxGeometry(4.9, 1.05, 1.5), bodyMat);
    counterBase.position.set(0, 0.52, 0);
    counterBase.castShadow = true;
    counterBase.receiveShadow = true;
    group.add(counterBase);

    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.12, 1.66), trimMat);
    counterTop.position.set(0, 1.08, 0);
    counterTop.castShadow = true;
    counterTop.receiveShadow = true;
    group.add(counterTop);

    const accentStrip = new THREE.Mesh(new THREE.BoxGeometry(4.75, 0.16, 0.1), trimMat);
    accentStrip.position.set(0, 0.36, 0.76);
    group.add(accentStrip);

    const makeMonitor = (offsetX) => {
      const monitorGroup = new THREE.Group();
      monitorGroup.position.set(offsetX, 1.23, -0.08);

      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), monitorFrameMat);
      stand.position.set(0, 0.07, -0.02);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.66, 0.08), monitorFrameMat);
      frame.position.set(0, 0.44, 0);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.5), monitorScreenMat);
      screen.position.set(0, 0.44, 0.046);
      screen.renderOrder = 16;

      stand.castShadow = true;
      frame.castShadow = true;
      monitorGroup.add(stand, frame, screen);
      return monitorGroup;
    };

    group.add(makeMonitor(-1.12), makeMonitor(1.12));

    const deskSign = this.createLobbyDeskSignSprite("안내 데스크");
    deskSign.position.set(0, 2.28, -0.28);
    group.add(deskSign);

    const createPost = (px, pz) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.1, 0.96, 14),
        new THREE.MeshStandardMaterial({
          color: LOBBY_METAL_MID,
          roughness: 0.34,
          metalness: 0.44
        })
      );
      post.position.set(px, 0.48, pz);
      post.castShadow = true;
      post.receiveShadow = true;
      return post;
    };

    const queuePosts = [
      createPost(-1.7, 2.2),
      createPost(1.7, 2.2),
      createPost(-1.7, 3.3),
      createPost(1.7, 3.3)
    ];
    group.add(...queuePosts);

    const ropeFront = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.4, 12), ropeMat);
    ropeFront.rotation.z = Math.PI * 0.5;
    ropeFront.position.set(0, 0.88, 2.2);
    const ropeBack = ropeFront.clone();
    ropeBack.position.set(0, 0.88, 3.3);
    const ropeLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 12), ropeMat);
    ropeLeft.rotation.x = Math.PI * 0.5;
    ropeLeft.position.set(-1.7, 0.88, 2.75);
    const ropeRight = ropeLeft.clone();
    ropeRight.position.set(1.7, 0.88, 2.75);
    group.add(ropeFront, ropeBack, ropeLeft, ropeRight);

    return group;
  }

  createLobbyShooterSetPieces({ centerX, centerZ, floorY, minX, maxX, minZ, maxZ } = {}) {
    const group = new THREE.Group();

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(8.6, 8.6, 0.24, 56),
      new THREE.MeshStandardMaterial({
        color: 0x353b42,
        roughness: 0.56,
        metalness: 0.22,
        emissive: 0x424950,
        emissiveIntensity: 0.1
      })
    );
    platform.position.set(centerX, floorY + 0.12, centerZ);
    platform.receiveShadow = true;
    group.add(platform);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(7.2, 0.12, 16, 84),
      new THREE.MeshStandardMaterial({
        color: LOBBY_ACCENT_SOFT,
        roughness: 0.3,
        metalness: 0.38,
        emissive: 0x707a85,
        emissiveIntensity: 0.16
      })
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.position.set(centerX, floorY + 0.2, centerZ);
    group.add(ring);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(9.8, 0.1, 16, 96),
      new THREE.MeshStandardMaterial({
        color: 0x606870,
        roughness: 0.42,
        metalness: 0.28,
        emissive: 0x434a52,
        emissiveIntensity: 0.08
      })
    );
    outerRing.rotation.x = Math.PI * 0.5;
    outerRing.position.set(centerX, floorY + 0.15, centerZ);
    group.add(outerRing);

    const laneMat = new THREE.MeshBasicMaterial({
      color: 0xd7dde3,
      transparent: true,
      opacity: 0.12
    });
    const laneA = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 18.4), laneMat);
    laneA.rotation.x = -Math.PI * 0.5;
    laneA.position.set(centerX - 5.4, floorY + 0.03, centerZ);
    const laneB = laneA.clone();
    laneB.position.set(centerX + 5.4, floorY + 0.03, centerZ);
    const laneC = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 22), laneMat);
    laneC.rotation.x = -Math.PI * 0.5;
    laneC.position.set(centerX, floorY + 0.03, centerZ - 1.1);
    const laneD = laneC.clone();
    laneD.position.set(centerX, floorY + 0.03, centerZ + 1.1);
    group.add(laneA, laneB, laneC, laneD);

    const rackOffsetX = Math.max(10.6, LOBBY3D_HALF_X - 10.4);
    const rackDepthZ = Math.max(6.4, LOBBY3D_HALF_Z - 12.2);
    group.add(
      this.createLobbyWeaponRack({
        x: centerX - rackOffsetX,
        y: floorY,
        z: centerZ - rackDepthZ,
        yaw: Math.PI * 0.5
      })
    );
    group.add(
      this.createLobbyWeaponRack({
        x: centerX + rackOffsetX,
        y: floorY,
        z: centerZ - rackDepthZ,
        yaw: -Math.PI * 0.5
      })
    );
    group.add(
      this.createLobbyWeaponRack({
        x: centerX - rackOffsetX,
        y: floorY,
        z: centerZ + rackDepthZ - 1.8,
        yaw: Math.PI * 0.5
      })
    );
    group.add(
      this.createLobbyWeaponRack({
        x: centerX + rackOffsetX,
        y: floorY,
        z: centerZ + rackDepthZ - 1.8,
        yaw: -Math.PI * 0.5
      })
    );
    const flankRackX = rackOffsetX * 0.62;
    const flankRackZ = Math.max(3.2, rackDepthZ - 6.2);
    group.add(
      this.createLobbyWeaponRack({
        x: centerX - flankRackX,
        y: floorY,
        z: centerZ - flankRackZ,
        yaw: Math.PI * 0.5
      })
    );
    group.add(
      this.createLobbyWeaponRack({
        x: centerX + flankRackX,
        y: floorY,
        z: centerZ - flankRackZ,
        yaw: -Math.PI * 0.5
      })
    );
    group.add(
      this.createLobbyWeaponRack({
        x: centerX - flankRackX,
        y: floorY,
        z: centerZ + flankRackZ,
        yaw: Math.PI * 0.5
      })
    );
    group.add(
      this.createLobbyWeaponRack({
        x: centerX + flankRackX,
        y: floorY,
        z: centerZ + flankRackZ,
        yaw: -Math.PI * 0.5
      })
    );

    const crateX = Math.max(9.2, LOBBY3D_HALF_X - 12.4);
    const crateZ = Math.max(6.8, LOBBY3D_HALF_Z - 11.2);
    group.add(
      this.createLobbyAmmoCrate({
        x: centerX - crateX,
        y: floorY,
        z: centerZ + crateZ,
        yaw: Math.PI * 0.2,
        stack: 2
      })
    );
    group.add(
      this.createLobbyAmmoCrate({
        x: centerX + crateX,
        y: floorY,
        z: centerZ + crateZ,
        yaw: -Math.PI * 0.2,
        stack: 2
      })
    );
    group.add(
      this.createLobbyAmmoCrate({
        x: centerX - crateX,
        y: floorY,
        z: centerZ - crateZ,
        yaw: Math.PI * 0.12,
        stack: 1
      })
    );
    group.add(
      this.createLobbyAmmoCrate({
        x: centerX + crateX,
        y: floorY,
        z: centerZ - crateZ,
        yaw: -Math.PI * 0.12,
        stack: 1
      })
    );
    group.add(
      this.createLobbyAmmoCrate({
        x: centerX - crateX * 0.44,
        y: floorY,
        z: centerZ - crateZ - 1.3,
        yaw: -Math.PI * 0.06,
        stack: 1
      })
    );
    group.add(
      this.createLobbyAmmoCrate({
        x: centerX + crateX * 0.44,
        y: floorY,
        z: centerZ - crateZ - 1.3,
        yaw: Math.PI * 0.06,
        stack: 1
      })
    );
    const ammoLineZ = centerZ - Math.max(12.2, LOBBY3D_HALF_Z - 4.8);
    const ammoLineOffsets = [-0.72, -0.36, 0, 0.36, 0.72];
    for (let i = 0; i < ammoLineOffsets.length; i += 1) {
      const offset = ammoLineOffsets[i];
      group.add(
        this.createLobbyAmmoCrate({
          x: centerX + crateX * offset,
          y: floorY,
          z: ammoLineZ + (i % 2 === 0 ? 0 : 1.2),
          yaw: (i - 2) * 0.08,
          stack: i % 2 === 0 ? 2 : 1
        })
      );
    }

    const deskZ = centerZ + Math.max(6.2, LOBBY3D_HALF_Z - 3.6);
    this.lobby3d.infoDesk = {
      x: centerX,
      z: deskZ,
      radius: LOBBY3D_INFO_DESK_INTERACT_RADIUS
    };
    group.add(this.createLobbyInfoDesk({ x: centerX, y: floorY, z: deskZ, yaw: Math.PI }));

    const trussMat = new THREE.MeshStandardMaterial({
      color: 0x555d67,
      roughness: 0.42,
      metalness: 0.32
    });
    const trussWidth = LOBBY3D_HALF_X * 2 - 7.6;
    const trussFront = new THREE.Mesh(new THREE.BoxGeometry(trussWidth, 0.2, 0.2), trussMat);
    trussFront.position.set(centerX, floorY + 4.55, centerZ + Math.max(5.8, LOBBY3D_HALF_Z - 9.4));
    trussFront.castShadow = true;
    const trussBack = trussFront.clone();
    trussBack.position.z = centerZ - Math.max(5.8, LOBBY3D_HALF_Z - 9.4);
    group.add(trussFront, trussBack);
    const makeTargetStand = (tx, tz) => {
      const target = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.62, 12),
        new THREE.MeshStandardMaterial({
          color: 0x79818a,
          roughness: 0.38,
          metalness: 0.34
        })
      );
      pole.position.set(0, 0.81, 0);
      pole.castShadow = true;
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.54, 0.54, 0.08, 26),
        new THREE.MeshStandardMaterial({
          color: 0xdce2e8,
          roughness: 0.28,
          metalness: 0.12,
          emissive: 0x4f5861,
          emissiveIntensity: 0.1
        })
      );
      plate.position.set(0, 1.65, 0);
      plate.rotation.x = Math.PI * 0.5;
      target.add(pole, plate);
      target.position.set(tx, floorY, tz);
      return target;
    };
    group.add(
      makeTargetStand(centerX - 4.8, centerZ - Math.max(10.8, LOBBY3D_HALF_Z - 7.4)),
      makeTargetStand(centerX + 4.8, centerZ - Math.max(10.8, LOBBY3D_HALF_Z - 7.4))
    );

    const lightMat = new THREE.MeshBasicMaterial({
      color: 0xe5eaee,
      transparent: true,
      opacity: 0.34
    });
    const wallInsetX = Math.max(2.2, LOBBY3D_HALF_X - 2.4);
    const wallInsetZ = Math.max(2.2, LOBBY3D_HALF_Z - 2.4);
    const lights = [
      [centerX - wallInsetX, floorY + 2.8, centerZ],
      [centerX + wallInsetX, floorY + 2.8, centerZ],
      [centerX, floorY + 2.8, centerZ - wallInsetZ],
      [centerX, floorY + 2.8, centerZ + wallInsetZ],
      [centerX - wallInsetX * 0.5, floorY + 3.2, centerZ - wallInsetZ * 0.72],
      [centerX + wallInsetX * 0.5, floorY + 3.2, centerZ - wallInsetZ * 0.72],
      [centerX - wallInsetX * 0.5, floorY + 3.2, centerZ + wallInsetZ * 0.72],
      [centerX + wallInsetX * 0.5, floorY + 3.2, centerZ + wallInsetZ * 0.72]
    ];
    for (const [lx, ly, lz] of lights) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.45, 0.08), lightMat);
      strip.position.set(lx, ly, lz);
      group.add(strip);
    }

    const corners = [
      [minX + 2.6, floorY + 0.28, minZ + 2.2],
      [maxX - 2.6, floorY + 0.28, minZ + 2.2],
      [minX + 2.6, floorY + 0.28, maxZ - 2.2],
      [maxX - 2.6, floorY + 0.28, maxZ - 2.2]
    ];
    const bollardMat = new THREE.MeshStandardMaterial({
      color: 0x5e6670,
      roughness: 0.42,
      metalness: 0.3
    });
    for (const [bx, by, bz] of corners) {
      const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.56, 16), bollardMat);
      bollard.position.set(bx, by, bz);
      bollard.castShadow = true;
      bollard.receiveShadow = true;
      group.add(bollard);
    }

    return group;
  }

  createLobbyRankBoardMesh({ x = 0, y = 0, z = 0, yaw = 0 } = {}) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 2.6),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    panel.position.set(x, y, z);
    panel.rotation.y = yaw;
    panel.renderOrder = 15;

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(5.34, 2.74, 0.08),
      new THREE.MeshStandardMaterial({
        color: LOBBY_METAL_DARK,
        roughness: 0.5,
        metalness: 0.28,
        emissive: 0x3b424a,
        emissiveIntensity: 0.14
      })
    );
    frame.position.set(x, y, z - Math.cos(yaw) * 0.04);
    frame.rotation.y = yaw;

    const group = new THREE.Group();
    group.add(frame, panel);

    return {
      group,
      canvas,
      texture,
      panel,
      frame,
      lastSignature: "",
      lastRenderedSecond: -1
    };
  }

  renderLobbyRankBoard(force = false) {
    const rankBoard = this.lobby3d?.rankBoard;
    if (!rankBoard?.canvas || !rankBoard?.texture) {
      return;
    }

    const now = Date.now();
    const renderSecond = Math.floor(now / 1000);
    if (!force && rankBoard.lastRenderedSecond === renderSecond) {
      return;
    }
    const countdownSec = Math.max(0, Math.ceil((Number(this.dailyLeaderboard?.resetAt ?? 0) - now) / 1000));
    const hour = Math.floor(countdownSec / 3600);
    const min = Math.floor((countdownSec % 3600) / 60);
    const sec = countdownSec % 60;
    const countdownText = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    const rows = this.getDailyLeaderboardRows(7);
    const signature = `${String(this.dailyLeaderboard?.dateKey ?? "")}|${countdownText}|${rows
      .map((entry) => `${entry.rank}:${entry.name}:${entry.captures}:${entry.kills}:${entry.deaths}`)
      .join("|")}`;

    rankBoard.lastSignature = signature;
    rankBoard.lastRenderedSecond = renderSecond;

    const context = rankBoard.canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, rankBoard.canvas.width, rankBoard.canvas.height);
    const gradient = context.createLinearGradient(0, 0, rankBoard.canvas.width, rankBoard.canvas.height);
    gradient.addColorStop(0, "rgba(32, 36, 42, 0.96)");
    gradient.addColorStop(1, "rgba(21, 24, 28, 0.92)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, rankBoard.canvas.width, rankBoard.canvas.height);

    context.strokeStyle = "rgba(218, 224, 230, 0.9)";
    context.lineWidth = 6;
    context.strokeRect(14, 14, rankBoard.canvas.width - 28, rankBoard.canvas.height - 28);

    context.fillStyle = "rgba(240, 242, 244, 0.98)";
    context.font = "700 54px Segoe UI, Arial, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText("일일 실시간 랭킹", 46, 64);

    context.font = "600 28px Segoe UI, Arial, sans-serif";
    const dateKey = String(this.dailyLeaderboard?.dateKey ?? "");
    const resetPrefix = dateKey ? `${dateKey} KST` : "KST";
    context.fillStyle = "rgba(193, 200, 207, 0.92)";
    context.fillText(`${resetPrefix} · 리셋까지 ${countdownText}`, 46, 108);

    const baseY = 162;
    const lineHeight = 46;
    if (rows.length === 0) {
      context.font = "600 34px Segoe UI, Arial, sans-serif";
      context.fillStyle = "rgba(215, 221, 227, 0.94)";
      context.fillText("순위 데이터 수집 중...", 64, baseY + 46);
    } else {
      rows.forEach((entry, index) => {
        const y = baseY + index * lineHeight;
        context.fillStyle = index < 3 ? "rgba(232, 219, 178, 0.98)" : "rgba(228, 232, 236, 0.95)";
        context.font = "700 32px Segoe UI, Arial, sans-serif";
        context.fillText(`${String(entry.rank).padStart(2, "0")}`, 52, y);

        context.fillStyle = "rgba(242, 244, 246, 0.98)";
        context.font = "600 30px Segoe UI, Arial, sans-serif";
        context.fillText(entry.name, 116, y);

        context.fillStyle = "rgba(188, 195, 204, 0.95)";
        context.font = "600 24px Consolas, monospace";
        context.fillText(`C${entry.captures}  K${entry.kills}  D${entry.deaths}`, 642, y);
      });
    }

    rankBoard.texture.needsUpdate = true;
  }

  setLobby3DActive(active, { reposition = true } = {}) {
    if (!this.lobby3d) {
      return;
    }

    const next = Boolean(active);
    this.lobby3d.active = next;
    document.body.classList.toggle("ui-lobby", next);
    if (this.lobby3d.group) {
      this.lobby3d.group.visible = next;
    }
    if (!next) {
      this.lobby3d.activePortalId = "";
      this.lobby3d.portalCooldownUntil = 0;
      this.lobby3d.pendingPortalId = "";
      this.lobby3d.pendingPortalSince = 0;
      this.lobby3d.enteredAt = 0;
      this.lobby3d.portalActivationArmed = false;
      this.lobby3d.lastDeskHintAt = 0;
      this.lobby3d.remotePreviewSignature = "";
      this.lobby3d.animationAccumulator = 0;
      this.lobbyRemotePreviewAccumulator = 0;
      this.clearPortalTransitionFx();
      this.syncRuntimePerformanceBudget(false);
      this.updateVisualMode(this.buildSystem.getToolMode());
      this.updateLobbyQuickPanel();
      return;
    }

    this.lobby3d.activePortalId = "";
    this.lobby3d.portalCooldownUntil = 0;
    this.lobby3d.pendingPortalId = "";
    this.lobby3d.pendingPortalSince = 0;
    this.lobby3d.enteredAt = Date.now();
    this.stampLobby3DVoxelLayout();
    this.lobby3d.portalActivationArmed = false;
    this.lobby3d.lastDeskHintAt = 0;
    this.lobby3d.remotePreviewSignature = "";
    this.lobby3d.animationAccumulator = 0;
    this.lobbyRemotePreviewAccumulator = 0;
    this.activeMatchMode = "online";
    this.buildSystem.setInventoryOpen(false);
    this.buildSystem.setToolMode("gun", { silentStatus: true });
    if (reposition) {
      this.playerPosition.copy(this.lobby3d.spawn);
      this.verticalVelocity = 0;
      this.onGround = true;
      this.fallStartY = this.playerPosition.y;
      this.yaw = 0;
      this.pitch = 0;
      this.camera.position.copy(this.playerPosition);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.rotation.z = 0;
    }
    this.state.objectiveText = "목표: 포탈 선택 · TAB 순위";
    this.hud.setStatus("3D 로비 활성화: 포탈 이동 가능", false, 1.15);
    this.syncRuntimePerformanceBudget(true);
    this.syncLobby3DPortalState();
    this.updateVisualMode(this.buildSystem.getToolMode());
    this.updateLobbyQuickPanel();
  }

  enterOnlineLobby3D() {
    if (this.isRunning) {
      return;
    }
    this.menuMode = "online";
    this.applyLobbyNickname();
    this.joinDefaultRoom({ force: true });
    this.hud.showStartOverlay(false);
    this.optionsMenuOpen = false;
    this.clearUiInputFocus();
    this.mouseLookEnabled = this.mobileEnabled || this.pointerLocked;
    this.setLobby3DActive(true, { reposition: true });
    this.updateLobbyControls();
    this.restoreGameplayLookState({ preferPointerLock: true });
    this.syncCursorVisibility();
  }

  leaveOnlineLobby3DToMenu() {
    if (this.isRunning) {
      return;
    }
    this.showOnlineHub();
  }

  autoEnterOnlineLobby3DOnce() {
    if (this._autoEnteredLobby3D || this.isRunning) {
      return;
    }
    this._autoEnteredLobby3D = true;
    this.enterOnlineLobby3D();
  }

  getActiveLobbyPortal() {
    if (!this.isLobby3DActive()) {
      return null;
    }
    const portals = Array.isArray(this.lobby3d?.portals) ? this.lobby3d.portals : [];
    let nearest = null;
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (const portal of portals) {
      const dx = this.playerPosition.x - portal.x;
      const dz = this.playerPosition.z - portal.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > LOBBY3D_PORTAL_TRIGGER_RADIUS * LOBBY3D_PORTAL_TRIGGER_RADIUS) {
        continue;
      }
      const dy = Math.abs(this.playerPosition.y - (this.lobby3d.floorY + PLAYER_HEIGHT));
      if (dy > 2.2) {
        continue;
      }
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        nearest = portal;
      }
    }
    return nearest;
  }

  getLobbyInfoDeskDistanceSq() {
    if (!this.isLobby3DActive()) {
      return Number.POSITIVE_INFINITY;
    }
    const desk = this.lobby3d?.infoDesk;
    if (!desk) {
      return Number.POSITIVE_INFINITY;
    }
    const dx = this.playerPosition.x - Number(desk.x ?? 0);
    const dz = this.playerPosition.z - Number(desk.z ?? 0);
    return dx * dx + dz * dz;
  }

  isNearLobbyInfoDesk() {
    if (!this.isLobby3DActive()) {
      return false;
    }
    const desk = this.lobby3d?.infoDesk;
    if (!desk) {
      return false;
    }
    const radius = Math.max(1.8, Number(desk.radius) || LOBBY3D_INFO_DESK_INTERACT_RADIUS);
    const nearByDistance = this.getLobbyInfoDeskDistanceSq() <= radius * radius;
    const nearByHeight = Math.abs(this.playerPosition.y - (this.lobby3d.floorY + PLAYER_HEIGHT)) <= 2.2;
    return nearByDistance && nearByHeight;
  }

  moveToLobbyShootingRange({ announce = true } = {}) {
    if (!this.isLobby3DActive()) {
      return false;
    }

    const floorY = Number(this.lobby3d?.floorY ?? LOBBY3D_FLOOR_Y);
    const centerX = Number(this.lobby3d?.centerX ?? LOBBY3D_CENTER_X);
    const centerZ = Number(this.lobby3d?.centerZ ?? LOBBY3D_CENTER_Z);
    const rangeZ = centerZ - Math.max(8.8, LOBBY3D_HALF_Z - 9.8);
    this.playerPosition.set(centerX, floorY + PLAYER_HEIGHT, rangeZ);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.fallStartY = this.playerPosition.y;
    this.yaw = 0;
    this.pitch = 0;
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
    this.lobby3d.pendingPortalId = "";
    this.lobby3d.pendingPortalSince = 0;
    this.lobby3d.portalCooldownUntil = Date.now() + LOBBY3D_PORTAL_COOLDOWN_MS;
    this.syncCursorVisibility();
    if (announce) {
      this.hud.setStatus("사격장으로 이동했습니다.", false, 0.82);
    }
    return true;
  }

  requestLobbyDeskNicknameChange({ source = "key" } = {}) {
    if (!this.isLobby3DActive()) {
      return false;
    }
    if (typeof window === "undefined" || typeof window.prompt !== "function") {
      this.hud.setStatus("현재 환경에서는 닉네임 입력창을 열 수 없습니다.", true, 1);
      return false;
    }

    this.keys.clear();
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.handlePrimaryActionUp();
    this.mouseLookEnabled = false;
    if (
      this.pointerLockSupported &&
      document.pointerLockElement === this.renderer.domElement
    ) {
      document.exitPointerLock();
    }
    this.syncCursorVisibility();

    const currentName = String(this.chat?.playerName ?? "")
      .trim()
      .slice(0, 16);
    const raw = window.prompt("새 닉네임 입력 (최대 16자)", currentName);
    if (raw !== null) {
      this.applyLobbyNickname({
        source: "prompt",
        syncToServer: true,
        value: raw
      });
    } else if (source === "key") {
      this.hud.setStatus("닉네임 변경을 취소했습니다.", false, 0.65);
    }

    if (this.mobileEnabled) {
      this.mouseLookEnabled = true;
      this.syncCursorVisibility();
      return true;
    }
    if (this.isLobby3DActive() && !this.optionsMenuOpen && !this.isUiInputFocused()) {
      this.clearUiInputFocus();
      this.restoreGameplayLookState({ preferPointerLock: true });
    }
    this.syncCursorVisibility();
    return true;
  }

  clearPortalTransitionFx() {
    this.portalFx.active = false;
    this.portalFx.timer = 0;
    this.portalFx.phase = 0;
    this.portalFx.fovBoost = 0;
    if (!this.portalTransitionEl) {
      return;
    }
    this.portalTransitionEl.classList.remove(
      "show",
      "is-alpha",
      "is-bravo",
      "is-deploy"
    );
  }

  triggerLobbyPortalFx(
    { portalId = "alpha", intensity = 1, silent = false, statusText = "", statusDuration = 0 } = {}
  ) {
    const rawId = String(portalId ?? "")
      .trim()
      .toLowerCase();
    const id =
      rawId === "training" || rawId === "entry"
        ? "alpha"
        : rawId === "exit"
          ? "bravo"
          : rawId === "online"
            ? "deploy"
            : rawId;
    if (id !== "alpha" && id !== "bravo" && id !== "deploy") {
      return;
    }

    const weight = THREE.MathUtils.clamp(Number(intensity) || 1, 0.35, 1.6);
    const baseFovBoost = id === "deploy" ? PORTAL_FX_DEPLOY_FOV_BOOST : PORTAL_FX_TEAM_FOV_BOOST;

    this.portalFx.active = true;
    this.portalFx.timer = 0;
    this.portalFx.phase = Math.random() * Math.PI * 2;
    this.portalFx.seed = Math.random() * 1000;
    this.portalFx.type = id;
    this.portalFx.fovBoost = baseFovBoost * weight;

    if (this.portalTransitionEl) {
      this.portalTransitionEl.classList.remove(
        "show",
        "is-alpha",
        "is-bravo",
        "is-deploy"
      );
      this.portalTransitionEl.offsetWidth;
      this.portalTransitionEl.classList.add("show", `is-${id}`);
    }

    if (!silent) {
      const gain = id === "deploy" ? 0.76 : 0.56;
      const rateJitter = id === "deploy" ? 0.18 : 0.12;
      this.sound.play("portal", { gain, rateJitter });
      this.hud.pulseCrosshair();
    }

    if (statusText) {
      this.hud.setStatus(statusText, false, Math.max(0.25, Number(statusDuration) || 0.5));
    }
  }

  updatePortalFx(delta) {
    if (!this.portalFx.active) {
      return;
    }

    this.portalFx.timer += Math.max(0, Number(delta) || 0);
    if (this.portalFx.timer < this.portalFx.duration) {
      return;
    }

    this.clearPortalTransitionFx();
  }

  getPortalFxFovBoost() {
    if (!this.portalFx.active || this.portalFx.duration <= 0) {
      return 0;
    }

    const t = THREE.MathUtils.clamp(this.portalFx.timer / this.portalFx.duration, 0, 1);
    const envelope = Math.sin(t * Math.PI);
    const pulse = 0.68 + 0.32 * Math.sin((t * 9 + this.portalFx.seed) * Math.PI);
    return Math.max(0, this.portalFx.fovBoost * envelope * Math.max(0.2, pulse));
  }

  getPortalFxCameraRoll() {
    if (!this.portalFx.active || this.portalFx.duration <= 0) {
      return 0;
    }

    const t = THREE.MathUtils.clamp(this.portalFx.timer / this.portalFx.duration, 0, 1);
    const envelope = Math.sin(t * Math.PI);
    return Math.sin(this.portalFx.phase + t * Math.PI * 4.4) * envelope * 0.024;
  }

  requestLobbyPortalEntry(portal) {
    if (!portal) {
      return;
    }

    const fallback = () => {
      if (portal.action === "training") {
        this.triggerLobbyPortalFx({
          portalId: "training",
          intensity: 1.04,
          statusText: "훈련장으로 이동합니다.",
          statusDuration: 0.8
        });
        this.start({ mode: "single" });
        return;
      }
      if (portal.action === "online") {
        if (!this.lobbyState.roomCode) {
          this.joinDefaultRoom({ force: true });
          this.showOnlineHub({
            statusText: "온라인 활성화방을 불러오는 중입니다.",
            isAlert: false,
            duration: 0.9
          });
          return;
        }
        this.triggerLobbyPortalFx({
          portalId: "online",
          intensity: 0.82,
          statusText: "온라인 활성화방을 엽니다.",
          statusDuration: 0.72
        });
        this.showOnlineHub();
        return;
      }
      if (portal.action === "entry") {
        this.triggerLobbyPortalFx({
          portalId: "entry",
          intensity: 0.66,
          statusText: "사격장으로 이동합니다.",
          statusDuration: 0.8
        });
        this.moveToLobbyShootingRange({ announce: false });
        return;
      }
      if (portal.action === "exit") {
        this.tryOpenLobbyExitPath();
        return;
      }
    };

    const socket = this.chat?.socket;
    const portalId = String(portal.id ?? "")
      .trim()
      .toLowerCase();
    if (!portalId) {
      return;
    }
    if (!socket || !socket.connected || !this.lobbyState.roomCode) {
      fallback();
      return;
    }

    let handled = false;
    const portalAckTimer = window.setTimeout(() => {
      if (handled) {
        return;
      }
      handled = true;
      this.hud.setStatus("포탈 응답 지연: 로컬 이동으로 처리합니다.", true, 0.9);
      fallback();
    }, 1000);

    socket.emit("portal:enter", { portalId }, (response = {}) => {
      if (handled) {
        return;
      }
      handled = true;
      window.clearTimeout(portalAckTimer);

      if (!response.ok) {
        this.hud.setStatus(response.error ?? "포탈 동기화에 실패했습니다.", true, 1);
        return;
      }

      const action = String(response.action ?? "")
        .trim()
        .toLowerCase();
      if (action === "training") {
        this.triggerLobbyPortalFx({
          portalId: "training",
          intensity: 1.04,
          statusText: "훈련장으로 이동합니다.",
          statusDuration: 0.8
        });
        this.start({ mode: "single" });
        return;
      }

      if (action === "entry") {
        this.triggerLobbyPortalFx({
          portalId: "entry",
          intensity: 0.66,
          statusText: "사격장으로 이동합니다.",
          statusDuration: 0.9
        });
        this.moveToLobbyShootingRange({ announce: false });
        return;
      }

      if (action === "exit") {
        const openedByServer = Boolean(response.opened);
        const openedByClient = this.tryOpenLobbyExitPath({ silent: true });
        if (!openedByServer && !openedByClient) {
          this.hud.setStatus(`시뮬라크 월드 포탈 대상: ${this.resolveLobbyExitTargetUrl()}`, false, 1.3);
        }
        return;
      }

      if (action === "hub") {
        this.triggerLobbyPortalFx({
          portalId: "online",
          intensity: 0.82,
          statusText: "온라인 활성화방을 엽니다.",
          statusDuration: 0.75
        });
        this.showOnlineHub();
        return;
      }

      if (action === "start") {
        this.triggerLobbyPortalFx({
          portalId: "online",
          intensity: 0.82,
          statusText: "온라인 활성화방을 엽니다.",
          statusDuration: 0.72
        });
        this.showOnlineHub();
      }
    });
  }

  resolveLobbyExitTargetUrl() {
    let targetUrl = LOBBY_EXIT_TARGET_URL;
    try {
      const query = new URLSearchParams(window.location.search);
      const fromQuery = String(query.get("returnUrl") ?? query.get("return") ?? "").trim();
      if (fromQuery) {
        const parsedFromQuery = new URL(fromQuery, window.location.href);
        if (parsedFromQuery.protocol === "http:" || parsedFromQuery.protocol === "https:") {
          targetUrl = parsedFromQuery.toString();
        }
      }
    } catch {
      // keep fallback target
    }

    try {
      const parsedTarget = new URL(targetUrl, window.location.href);
      if (!parsedTarget.searchParams.has("returnPortal")) {
        parsedTarget.searchParams.set("returnPortal", "fps");
      }
      if (!parsedTarget.searchParams.has("from")) {
        parsedTarget.searchParams.set("from", "fps");
      }
      return parsedTarget.toString();
    } catch {
      return LOBBY_EXIT_TARGET_URL;
    }
  }

  openSimulacWorld() {
    const targetUrl = this.resolveLobbyExitTargetUrl();

    try {
      window.location.assign(targetUrl);
      return true;
    } catch {
      const copied = this.tryCopyLobbyExitTarget();
      if (!copied) {
        this.hud.setStatus(`시뮬라크 월드 주소: ${targetUrl}`, false, 1.3);
      }
      return false;
    }
  }

  tryOpenLobbyExitPath({ silent = false } = {}) {
    const targetUrl = this.resolveLobbyExitTargetUrl();
    let opened = false;

    try {
      window.location.assign(targetUrl);
      opened = true;
    } catch {
      opened = false;
    }

    if (!silent) {
      if (opened) {
        this.triggerLobbyPortalFx({
          portalId: "exit",
          intensity: 1.06,
          statusText: "시뮬라크 월드로 이동합니다.",
          statusDuration: 0.85
        });
      } else {
        const copied = this.tryCopyLobbyExitTarget();
        if (!copied) {
          this.hud.setStatus(`시뮬라크 월드 포탈 대상: ${targetUrl}`, false, 1.3);
        }
      }
    }

    return opened;
  }

  tryCopyLobbyExitTarget() {
    const targetUrl = this.resolveLobbyExitTargetUrl();
    const clipboard = navigator?.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") {
      return false;
    }

    clipboard
      .writeText(targetUrl)
      .then(() => {
        this.hud.setStatus(`링크 열기 제한: 시뮬라크 월드 링크 복사 완료 (${targetUrl})`, false, 1.5);
      })
      .catch(() => {
        this.hud.setStatus(`시뮬라크 월드 포탈 대상: ${targetUrl}`, false, 1.3);
      });
    return true;
  }

  handleLobbyPortalEntry(portal) {
    if (!portal) {
      return;
    }
    this.requestLobbyPortalEntry(portal);
  }

  handleLobbyPortalEntered(payload = {}) {
    if (!this.isLobby3DActive()) {
      return;
    }

    const playerId = String(payload.playerId ?? "").trim();
    const isSelfEvent = playerId && playerId === this.getMySocketId();

    const playerName = String(payload.playerName ?? "플레이어")
      .trim()
      .slice(0, 16) || "플레이어";
    const portalId = String(payload.portalId ?? "")
      .trim()
      .toLowerCase();
    const action = String(payload.action ?? "")
      .trim()
      .toLowerCase();

    if (isSelfEvent && (portalId === "entry" || action === "entry")) {
      this.moveToLobbyShootingRange({ announce: false });
      return;
    }
    if (isSelfEvent) {
      return;
    }

    if (portalId === "training" || action === "training") {
      this.hud.setStatus(`${playerName}: 훈련장 포탈 진입`, false, 0.65);
      return;
    }
    if (portalId === "entry" || action === "entry") {
      this.hud.setStatus(`${playerName}: 사격장 포탈 진입`, false, 0.62);
      return;
    }
    if (portalId === "exit" || action === "exit") {
      this.hud.setStatus(`${playerName}: 시뮬라크 월드 포탈 진입`, false, 0.62);
      return;
    }
    if (portalId !== "online") {
      return;
    }

    if (action === "hub") {
      this.triggerLobbyPortalFx({
        portalId: "online",
        intensity: 0.46,
        silent: true
      });
      this.hud.setStatus(`${playerName}: 온라인 허브 포탈 진입`, false, 0.75);
      return;
    }

    this.hud.setStatus(`${playerName}: 온라인 포탈 진입`, false, 0.65);
  }

  clampLobby3DPlayerBounds() {
    if (!this.isLobby3DActive()) {
      return;
    }
    const bounds = this.lobby3d?.bounds;
    if (!bounds) {
      return;
    }
    this.playerPosition.x = THREE.MathUtils.clamp(this.playerPosition.x, bounds.minX, bounds.maxX);
    this.playerPosition.z = THREE.MathUtils.clamp(this.playerPosition.z, bounds.minZ, bounds.maxZ);
  }

  updateLobby3D(delta) {
    if (!this.isLobby3DActive()) {
      return;
    }
    const portals = Array.isArray(this.lobby3d?.portals) ? this.lobby3d.portals : [];
    this.lobby3d.animationAccumulator += Math.max(0, Number(delta) || 0);
    if (this.lobby3d.animationAccumulator >= LOBBY_PORTAL_ANIMATION_STEP) {
      const animDelta = this.lobby3d.animationAccumulator;
      this.lobby3d.animationAccumulator = 0;
      this.lobby3d.pulseClock += animDelta;
      const pulseBase = this.lobby3d.pulseClock;

      for (let i = 0; i < portals.length; i += 1) {
        const portal = portals[i];
        const pulse = 0.5 + 0.5 * Math.sin(pulseBase * 3.8 + i * 1.6);
        portal.group.position.y = this.lobby3d.floorY + 1.85 + pulse * 0.08;
        portal.ring.rotation.z += animDelta * (0.6 + i * 0.08);
        const visualState = portal.visualState ?? "idle";
        const coreBase = visualState === "locked" ? 0.06 : visualState === "active" ? 0.24 : 0.16;
        const glowBase = visualState === "locked" ? 0.1 : visualState === "active" ? 0.34 : 0.2;
        portal.core.material.opacity = coreBase + pulse * 0.14;
        portal.glow.material.opacity = glowBase + pulse * 0.18;
      }
    }
    this.renderLobbyRankBoard(false);

    const now = Date.now();
    if (!this.lobby3d.portalActivationArmed) {
      const dxFromSpawn = this.playerPosition.x - this.lobby3d.spawn.x;
      const dzFromSpawn = this.playerPosition.z - this.lobby3d.spawn.z;
      const movedSq = dxFromSpawn * dxFromSpawn + dzFromSpawn * dzFromSpawn;
      if (movedSq < LOBBY3D_PORTAL_ARM_DISTANCE * LOBBY3D_PORTAL_ARM_DISTANCE) {
        return;
      }
      this.lobby3d.portalActivationArmed = true;
    }

    const activePortal = this.getActiveLobbyPortal();
    if (!activePortal) {
      this.lobby3d.activePortalId = "";
      this.lobby3d.pendingPortalId = "";
      this.lobby3d.pendingPortalSince = 0;
      return;
    }

    if (this.lobby3d.pendingPortalId !== activePortal.id) {
      this.lobby3d.pendingPortalId = activePortal.id;
      this.lobby3d.pendingPortalSince = now;
      return;
    }

    const enteredAt = Number(this.lobby3d.enteredAt) || 0;
    if (now < enteredAt + LOBBY3D_PORTAL_WARMUP_MS) {
      return;
    }

    const holdElapsed = now - (Number(this.lobby3d.pendingPortalSince) || 0);
    if (holdElapsed < LOBBY3D_PORTAL_HOLD_MS) {
      return;
    }
    if (this.lobby3d.activePortalId === activePortal.id) {
      return;
    }
    if (now < this.lobby3d.portalCooldownUntil) {
      return;
    }

    this.lobby3d.activePortalId = activePortal.id;
    this.lobby3d.portalCooldownUntil = now + LOBBY3D_PORTAL_COOLDOWN_MS;
    this.handleLobbyPortalEntry(activePortal);
  }

  syncLobby3DPortalState() {
    const portals = Array.isArray(this.lobby3d?.portals) ? this.lobby3d.portals : [];
    if (portals.length === 0) {
      return;
    }

    const inRoom = Boolean(this.lobbyState.roomCode);

    for (const portal of portals) {
      const locked = portal.action === "online" && !inRoom;
      const active = portal.action === "online" ? inRoom : true;
      const colorHex = Number(portal.color) || 0x89d3ff;
      const ringMaterial = portal.ring?.material;
      const coreMaterial = portal.core?.material;
      const glowMaterial = portal.glow?.material;
      if (!ringMaterial || !coreMaterial || !glowMaterial) {
        continue;
      }

      ringMaterial.color.setHex(colorHex);
      ringMaterial.emissive.setHex(colorHex);
      if (locked) {
        ringMaterial.emissiveIntensity = 0.06;
        ringMaterial.opacity = 0.26;
        portal.visualState = "locked";
      } else if (active) {
        ringMaterial.emissiveIntensity = 1.08;
        ringMaterial.opacity = 0.93;
        portal.visualState = "active";
      } else {
        ringMaterial.emissiveIntensity = 0.34;
        ringMaterial.opacity = 0.7;
        portal.visualState = "idle";
      }
      if (locked) {
        coreMaterial.opacity = 0.08;
        glowMaterial.opacity = 0.12;
      }
    }

    if (!this.mpPortalHintEl) {
      return;
    }

    if (!inRoom) {
      this.mpPortalHintEl.textContent = "온라인 포탈은 서버 연결 후 활성화됩니다.";
      return;
    }
    this.mpPortalHintEl.textContent =
      "온라인 포탈: 2D 온라인 허브 | 훈련장: 즉시 이동 | 안내데스크: 전면 안내 구역 | 나가기: 도시 이동";
  }

  createSkyCloudTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 6; i += 1) {
        const cx = 34 + Math.random() * (canvas.width - 68);
        const cy = 30 + Math.random() * (canvas.height - 44);
        const rx = 30 + Math.random() * 44;
        const ry = 14 + Math.random() * 20;
        const grad = ctx.createRadialGradient(cx, cy, ry * 0.1, cx, cy, rx);
        grad.addColorStop(0, "rgba(255, 255, 255, 0.88)");
        grad.addColorStop(0.72, "rgba(255, 255, 255, 0.46)");
        grad.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  createSkyGradientTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#4f88c7");
    grad.addColorStop(0.24, "#7db7ea");
    grad.addColorStop(0.62, "#a9dafc");
    grad.addColorStop(1, "#dff4ff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  createSkySunTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    const center = canvas.width * 0.5;
    const grad = ctx.createRadialGradient(center, center, 8, center, center, center);
    grad.addColorStop(0, "rgba(255, 249, 214, 0.98)");
    grad.addColorStop(0.18, "rgba(255, 238, 170, 0.9)");
    grad.addColorStop(0.42, "rgba(255, 214, 130, 0.36)");
    grad.addColorStop(0.72, "rgba(255, 198, 108, 0.12)");
    grad.addColorStop(1, "rgba(255, 198, 108, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  setupSky() {
    const profile = this.getRenderQualityProfile();
    if (this.skyDome) {
      this.removeSceneObject(this.skyDome, { dispose: true });
      this.skyDome = null;
    }
    if (this.skySunSprite) {
      this.removeSceneObject(this.skySunSprite, { dispose: true });
      this.skySunSprite = null;
    }

    for (const cloud of this.skyCloudSprites) {
      this.removeSceneObject(cloud, { dispose: true });
    }
    this.skyCloudSprites.length = 0;
    this.skyCloudTexture?.dispose?.();
    this.skyGradientTexture?.dispose?.();
    this.skySunTexture?.dispose?.();
    this.skyCloudTexture = this.createSkyCloudTexture();
    this.skyGradientTexture = this.createSkyGradientTexture();
    this.skySunTexture = this.createSkySunTexture();

    const skyMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: this.skyGradientTexture,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(460, profile.skyWidthSegments, profile.skyHeightSegments),
      skyMaterial
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.skyDome = sky;
    this.scene.add(sky);

    if (this.skySunTexture) {
      const sunSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.skySunTexture,
          color: 0xfff0bd,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
          fog: false,
          blending: THREE.AdditiveBlending
        })
      );
      sunSprite.scale.set(120, 120, 1);
      sunSprite.renderOrder = -8;
      this.skySunSprite = sunSprite;
      this.scene.add(sunSprite);
    }

    for (let i = 0; i < profile.skyCloudCount; i += 1) {
      const radius = 90 + Math.random() * 240;
      const theta = Math.random() * Math.PI * 2;
      const x = this.playerPosition.x + Math.cos(theta) * radius;
      const z = this.playerPosition.z + Math.sin(theta) * radius;
      const y = 78 + Math.random() * 72;
      const width = 18 + Math.random() * 52;
      const height = width * (0.34 + Math.random() * 0.22);

      const cloudMaterial = new THREE.SpriteMaterial({
        map: this.skyCloudTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.28 + Math.random() * 0.24,
        depthWrite: false,
        fog: false
      });
      const cloud = new THREE.Sprite(cloudMaterial);
      cloud.position.set(x, y, z);
      cloud.scale.set(width, height, 1);
      cloud.userData = {
        driftX: (Math.random() * 2 - 1) * 0.8,
        driftZ: (Math.random() * 2 - 1) * 0.8
      };
      this.skyCloudSprites.push(cloud);
      this.scene.add(cloud);
    }
  }

  updateSky(delta) {
    if (this.skyDome) {
      this.skyDome.position.copy(this.playerPosition);
    }
    if (this.skySunSprite && this.sunLight) {
      this.skySunDir.copy(this.sunLight.position).normalize();
      this.skySunSprite.position.copy(this.playerPosition).addScaledVector(this.skySunDir, 320);
      this.skySunSprite.position.y = this.playerPosition.y + 170;
    }
    if (!this.skyCloudSprites.length) {
      return;
    }

    const centerX = this.playerPosition.x;
    const centerZ = this.playerPosition.z;
    const maxRadius = 360;
    for (const cloud of this.skyCloudSprites) {
      const driftX = Number(cloud.userData?.driftX) || 0;
      const driftZ = Number(cloud.userData?.driftZ) || 0;
      cloud.position.x += driftX * delta;
      cloud.position.z += driftZ * delta;

      const dx = cloud.position.x - centerX;
      const dz = cloud.position.z - centerZ;
      if (dx * dx + dz * dz <= maxRadius * maxRadius) {
        continue;
      }

      const respawnAngle = Math.random() * Math.PI * 2;
      const respawnRadius = 100 + Math.random() * 220;
      cloud.position.x = centerX + Math.cos(respawnAngle) * respawnRadius;
      cloud.position.z = centerZ + Math.sin(respawnAngle) * respawnRadius;
      cloud.position.y = 84 + Math.random() * 58;
    }
  }

  removeSceneObject(object, { dispose = false } = {}) {
    if (!object) {
      return;
    }

    this.scene.remove(object);
    if (!dispose) {
      return;
    }

    object.traverse((child) => {
      if (!child?.isMesh && !child?.isSprite) {
        return;
      }
      child.geometry?.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material?.dispose?.();
      }
    });
  }

  setupObjectives() {
    for (const marker of this.objectiveMarkers) {
      this.removeSceneObject(marker, { dispose: true });
    }
    this.objectiveMarkers.length = 0;
    this.controlBeacon = null;
    this.controlRing = null;
    this.controlCore = null;

    if (this.alphaFlag) {
      this.removeSceneObject(this.alphaFlag, { dispose: true });
    }
    if (this.bravoFlag) {
      this.removeSceneObject(this.bravoFlag, { dispose: true });
    }
    if (this.onlineCenterFlag) {
      this.removeSceneObject(this.onlineCenterFlag, { dispose: true });
    }
    this.alphaFlag = null;
    this.bravoFlag = null;
    this.onlineCenterFlag = null;
    this.onlineCenterFlagCloth = null;

    const arena = this.voxelWorld.getArenaMeta?.() ?? {
      alphaBase: { x: -42, z: 0 },
      bravoBase: { x: 42, z: 0 },
      alphaFlag: { x: -42, z: 0 },
      bravoFlag: { x: 42, z: 0 },
      trainingSpawn: { x: -42, z: 0 },
      mid: { x: 0, z: 0 }
    };

    const alphaY = this.voxelWorld.getSurfaceYAt(arena.alphaBase.x, arena.alphaBase.z) ?? 0;
    const bravoY = this.voxelWorld.getSurfaceYAt(arena.bravoBase.x, arena.bravoBase.z) ?? 0;
    const trainingSpawnRef = arena.trainingSpawn ?? arena.alphaBase;
    const trainingY = this.voxelWorld.getSurfaceYAt(trainingSpawnRef.x, trainingSpawnRef.z) ?? alphaY;
    const midY = this.voxelWorld.getSurfaceYAt(arena.mid.x, arena.mid.z) ?? 0;

    this.objective.alphaBase.set(arena.alphaBase.x, alphaY, arena.alphaBase.z);
    this.objective.bravoBase.set(arena.bravoBase.x, bravoY, arena.bravoBase.z);
    this.objective.trainingSpawn.set(trainingSpawnRef.x, trainingY, trainingSpawnRef.z);
    this.objective.alphaFlagHome.set(arena.alphaFlag.x, alphaY, arena.alphaFlag.z);
    this.objective.bravoFlagHome.set(arena.bravoFlag.x, bravoY, arena.bravoFlag.z);
    this.objective.controlPoint.set(arena.mid.x, midY, arena.mid.z);
    this.objective.centerFlagHome.set(arena.mid.x, midY, arena.mid.z);
    this.objective.playerHasEnemyFlag = false;
    this.objective.controlProgress = 0;
    this.objective.controlOwner = "neutral";
    this.objective.controlBonusTimer = 0;
    this.objective.controlStatusCooldown = 0;
    this.objective.controlPulse = 0;
    this.state.controlPercent = 0;
    this.state.controlOwner = "neutral";

    this.alphaFlag = this.createFlagMesh(0x6fbeff, 0xb7e9ff);
    this.alphaFlag.position.copy(this.objective.alphaFlagHome);
    this.scene.add(this.alphaFlag);

    this.bravoFlag = this.createFlagMesh(0xff7d6a, 0xffc8ba);
    this.bravoFlag.position.copy(this.objective.bravoFlagHome);
    this.scene.add(this.bravoFlag);

    const centerFlagMesh = this.createFlagMesh(0xdde6f4, 0x4bd965);
    centerFlagMesh.position.copy(this.objective.centerFlagHome);
    centerFlagMesh.visible = false;
    this.onlineCenterFlag = centerFlagMesh;
    this.onlineCenterFlagCloth = centerFlagMesh.userData?.cloth ?? null;
    this.scene.add(centerFlagMesh);

    if (this.activeMatchMode !== "online") {
      const controlBeacon = this.createControlBeacon(this.objective.controlPoint);
      this.controlBeacon = controlBeacon;
      this.controlRing = controlBeacon.userData.ring ?? null;
      this.controlCore = controlBeacon.userData.core ?? null;
      this.objectiveMarkers.push(controlBeacon);
      this.scene.add(controlBeacon);
    }
    this.applyControlVisual(0);
    this.resetOnlineCtfFromArena();
    this.state.objectiveText = this.getObjectiveText();
    this.updateTeamScoreHud();
  }

  resetOnlineCtfFromArena() {
    this.onlineCtf.mode = DEFAULT_GAME_MODE;
    this.onlineCtf.revision = 0;
    this.onlineCtf.flags.alpha.home.copy(this.objective.alphaFlagHome);
    this.onlineCtf.flags.alpha.at.copy(this.objective.alphaFlagHome);
    this.onlineCtf.flags.alpha.carrierId = null;
    this.onlineCtf.flags.bravo.home.copy(this.objective.bravoFlagHome);
    this.onlineCtf.flags.bravo.at.copy(this.objective.bravoFlagHome);
    this.onlineCtf.flags.bravo.carrierId = null;
    this.onlineCtf.score.alpha = 0;
    this.onlineCtf.score.bravo = 0;
    this.onlineCtf.captures.alpha = 0;
    this.onlineCtf.captures.bravo = 0;
    this.onlineTargetScore = CTF_WIN_SCORE;
    this.onlineRoundEnded = false;
    this.onlineRoundWinnerTeam = null;
    this.onlineRoundRestartAt = 0;
    this.onlineRoundLastSecond = -1;
    this.syncOnlineFlagMeshes();
    this.updateTeamScoreHud();
  }

  repairUiLabels() {
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = text;
      }
    };
    const setHtml = (id, html) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = html;
      }
    };

    setText("mode-online", "온라인");
    setText("mode-single", "훈련");
    setText("start-button", "훈련 시작");
    setText("mp-start", "온라인 바로 입장");
    setText("mp-enter-lobby", "대기방 입장");
    setText("mp-open-training", "AI훈련소 입장");
    setText("mp-open-simulac", "시뮬라크 월드 접속");
    setText("mp-refresh", "새로고침");
    setText("mp-room-subtitle", "온라인 대기방 현황");
    setText("lobby-quick-name-save", "적용");
    setText("lobby-quick-count", "대기 인원 0/50");
    setText("lobby-quick-guide", "");
    const quickRankTitle = document.querySelector(".lobby-quick-rank-title");
    if (quickRankTitle) {
      quickRankTitle.textContent = "실시간 순위";
    }
    if (this.mpNameInput) {
      this.mpNameInput.setAttribute("placeholder", "닉네임 입력");
    }
    if (this.lobbyQuickNameInput) {
      this.lobbyQuickNameInput.setAttribute("placeholder", "닉네임 입력");
    }
    this.mobileModePlaceBtn?.setAttribute("aria-label", "블록");
    this.mobileModeDigBtn?.setAttribute("aria-label", "삽");
    this.mobileModeGunBtn?.setAttribute("aria-label", "총");
    this.mobileBagBtn?.setAttribute("aria-label", "가방");
    this.mobileAimBtn?.setAttribute("aria-label", "조준");
    setText("mobile-jump", "점프");
    setText("mobile-crouch", "웅크");
    setText("mobile-reload", "장전");
    setText("mobile-tab", "탭");
    setText("mobile-options", "옵션");
    setText("mobile-chat", "채팅");
    setText("flag-interact-btn", "깃발 탈취");
    setText("chat-title", "채팅");
    setText("chat-toggle-btn", "닫기");
    setText("chat-expand-btn", "펼치기");
    const chatInputEl = document.getElementById("chat-input");
    if (chatInputEl) {
      chatInputEl.setAttribute("placeholder", "T 또는 Enter로 채팅");
    }
    setText("chat-send", "전송");
    setText("options-title", "옵션");
    setText("quick-settings-btn", "옵션");
    setText("quick-settings-title", "옵션");
    setText("quick-fullscreen", "전체화면");
    setText("quick-open-options", "옵션");
    const onlineDesc = document.querySelector("#online-panel .start-desc");
    if (onlineDesc) {
      onlineDesc.textContent = "온라인 활성화방에서 현재 전장을 확인하고 원하는 목적지로 바로 이동하세요.";
    }
    const portalGuideRows = Array.from(document.querySelectorAll(".mp-portal-guide-row span:last-child"));
    if (portalGuideRows[0]) {
      portalGuideRows[0].textContent = "훈련장 포탈: 즉시 훈련 모드로 이동";
    }
    if (portalGuideRows[1]) {
      portalGuideRows[1].textContent = "온라인 허브 포탈: 2D 온라인 활성화방 열기";
    }
    if (portalGuideRows[2]) {
      portalGuideRows[2].textContent = "안내데스크: 전면 안내 구역 장식";
    }
    if (portalGuideRows[3]) {
      portalGuideRows[3].textContent = "시뮬라크 월드 포탈: 외부 월드로 이동";
    }
    setText("mp-portal-hint", "포탈로 이동하세요.");
    const subtitle = document.querySelector(".options-subtitle");
    if (subtitle) {
      subtitle.textContent = "왼쪽에서 항목을 고르고 오른쪽에서 값을 조절하세요.";
    }
    setText("options-sfx-label", "효과음 볼륨");
    setText("options-sfx-mute", "효과음 끄기");
    setText("options-mobile-look-label", "모바일 감도");
    setText("options-mobile-chat-header-label", "모바일 채팅 상단 버튼");
    setText("options-mobile-chat-header-value", "숨김");
    setText("options-mobile-chat-header-toggle", "상단 버튼 보이기");
    setText("options-continue", "계속하기");
    setHtml("mp-team-alpha", '블루팀 <span id="mp-team-alpha-count" class="team-count">0</span>');
    setHtml("mp-team-bravo", '레드팀 <span id="mp-team-bravo-count" class="team-count">0</span>');
    this.mpTeamAlphaCountEl = document.getElementById("mp-team-alpha-count");
    this.mpTeamBravoCountEl = document.getElementById("mp-team-bravo-count");
    this.optionsContinueBtn = document.getElementById("options-continue");
    this.optionsExitBtn = document.getElementById("options-exit");
    this.updateOptionsExitUi();
    this.optionsSfxMuteBtn = document.getElementById("options-sfx-mute");
    this.optionsSfxVolumeEl = document.getElementById("options-sfx-volume");
    this.optionsSfxValueEl = document.getElementById("options-sfx-value");
    this.optionsMobileLookEl = document.getElementById("options-mobile-look");
    this.optionsMobileLookValueEl = document.getElementById("options-mobile-look-value");
    this.optionsMobileChatHeaderLabelEl = document.getElementById("options-mobile-chat-header-label");
    this.optionsMobileChatHeaderValueEl = document.getElementById("options-mobile-chat-header-value");
    this.optionsMobileChatHeaderToggleBtn = document.getElementById("options-mobile-chat-header-toggle");
    this.optionsNavButtons = Array.from(document.querySelectorAll(".options-nav-btn"));
    this.mobileChatBtn = document.getElementById("mobile-chat");
    this.quickSettingsBtnEl = document.getElementById("quick-settings-btn");
    this.quickSettingsPanelEl = document.getElementById("quick-settings-panel");
    this.quickQualityButtons = Array.from(document.querySelectorAll(".quick-quality-btn"));
    this.quickFullscreenBtnEl = document.getElementById("quick-fullscreen");
    this.quickOpenOptionsBtnEl = document.getElementById("quick-open-options");
    for (const button of this.quickQualityButtons) {
      const mode = normalizeRenderQuality(button?.dataset?.quality);
      if (mode === "low") {
        button.textContent = "낮음";
      } else if (mode === "high") {
        button.textContent = "높음";
      } else {
        button.textContent = "보통";
      }
    }
    const quickLabelEl = this.quickSettingsPanelEl?.querySelector(".quick-settings-label");
    if (quickLabelEl) {
      quickLabelEl.textContent = "그래픽";
    }
    this.bindOptionsNavButtons();
    this.syncQuickSettingsQualityUi();
    this.syncQuickSettingsVisibility();
    this.refreshOptionsAudioUi();
  }

  setEffectsVolumeScale(nextValue, { persist = true } = {}) {
    const raw = Number(nextValue);
    const value = Number.isFinite(raw) ? THREE.MathUtils.clamp(raw, 0, 1) : this.effectsVolumeScale;
    this.effectsVolumeScale = value;
    if (value > 0.001) {
      this.effectsVolumeBeforeMute = value;
    }
    this.sound.setEffectsVolumeScale(value);
    if (persist && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(EFFECTS_VOLUME_STORAGE_KEY, value.toFixed(3));
      } catch {}
    }
    this.refreshOptionsAudioUi();
  }

  setMobileLookSensitivityScale(nextValue, { persist = true } = {}) {
    const raw = Number(nextValue);
    const value = Number.isFinite(raw)
      ? THREE.MathUtils.clamp(
          raw,
          MOBILE_LOOK_SENSITIVITY_MIN_SCALE,
          MOBILE_LOOK_SENSITIVITY_MAX_SCALE
        )
      : this.mobileLookSensitivityScale;
    this.mobileLookSensitivityScale = value;
    if (persist && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(MOBILE_LOOK_SENSITIVITY_STORAGE_KEY, value.toFixed(3));
      } catch {}
    }
    this.refreshOptionsAudioUi();
  }

  setMobileChatHeaderToggleVisible(nextVisible, { persist = true } = {}) {
    const visible = Boolean(nextVisible);
    this.mobileChatHeaderToggleVisible = visible;
    this.chat?.setMobileHeaderToggleVisible?.(visible);
    if (persist && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(MOBILE_CHAT_HEADER_TOGGLE_STORAGE_KEY, visible ? "1" : "0");
      } catch {}
    }
    this.refreshOptionsAudioUi();
    this.syncCursorVisibility();
  }

  bindOptionsNavButtons() {
    if (this._optionsNavBound || !Array.isArray(this.optionsNavButtons)) {
      return;
    }
    this._optionsNavBound = true;

    for (const button of this.optionsNavButtons) {
      button?.addEventListener("click", () => {
        const targetId = String(button?.dataset?.target ?? "");
        if (!targetId) {
          return;
        }
        for (const entry of this.optionsNavButtons) {
          entry?.classList.toggle("is-active", entry === button);
        }
        const target = document.getElementById(targetId);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  refreshOptionsAudioUi() {
    const sfxPercent = Math.round(THREE.MathUtils.clamp(this.effectsVolumeScale, 0, 1) * 100);
    const mobileLookPercent = Math.round(
      THREE.MathUtils.clamp(this.mobileLookSensitivityScale, 0, MOBILE_LOOK_SENSITIVITY_MAX_SCALE) *
        100
    );
    if (this.optionsSfxVolumeEl) {
      this.optionsSfxVolumeEl.value = String(sfxPercent);
    }
    if (this.optionsSfxValueEl) {
      this.optionsSfxValueEl.textContent = `${sfxPercent}%`;
    }
    if (this.optionsSfxMuteBtn) {
      this.optionsSfxMuteBtn.textContent = sfxPercent <= 0 ? "효과음 켜기" : "효과음 끄기";
    }
    if (this.optionsMobileLookEl) {
      this.optionsMobileLookEl.value = String(mobileLookPercent);
    }
    if (this.optionsMobileLookValueEl) {
      this.optionsMobileLookValueEl.textContent = `${mobileLookPercent}%`;
    }
    if (this.optionsMobileChatHeaderValueEl) {
      this.optionsMobileChatHeaderValueEl.textContent = this.mobileChatHeaderToggleVisible
        ? "표시"
        : "숨김";
    }
    if (this.optionsMobileChatHeaderToggleBtn) {
      this.optionsMobileChatHeaderToggleBtn.textContent = this.mobileChatHeaderToggleVisible
        ? "상단 버튼 숨기기"
        : "상단 버튼 보이기";
      this.optionsMobileChatHeaderToggleBtn.setAttribute(
        "aria-pressed",
        this.mobileChatHeaderToggleVisible ? "true" : "false"
      );
    }
  }

  toggleEffectsMute() {
    if (this.effectsVolumeScale <= 0.001) {
      this.setEffectsVolumeScale(Math.max(0.1, this.effectsVolumeBeforeMute));
      return;
    }
    this.effectsVolumeBeforeMute = Math.max(0.1, this.effectsVolumeScale);
    this.setEffectsVolumeScale(0);
  }

  syncQuickSettingsQualityUi() {
    if (!Array.isArray(this.quickQualityButtons)) {
      return;
    }
    for (const button of this.quickQualityButtons) {
      const mode = normalizeRenderQuality(button?.dataset?.quality);
      const active = mode === this.renderQualityMode;
      button?.classList.toggle("is-active", active);
      button?.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  getRenderQualityProfile(mode = this.renderQualityMode) {
    const nextMode = normalizeRenderQuality(mode);
    const mobile = this.mobileEnabled;
    const maxAnisotropy = Math.max(1, Math.trunc(this.renderer?.capabilities?.getMaxAnisotropy?.() ?? 1));

    if (nextMode === "low") {
      return {
        mode: nextMode,
        pixelRatioCap: mobile ? MOBILE_RENDER_PIXEL_RATIO_LOW_CAP : RENDER_PIXEL_RATIO_LOW_CAP,
        shadowsEnabled: false,
        shadowType: THREE.BasicShadowMap,
        shadowMapSize: SHADOW_MAP_SIZE_LOW,
        shadowExtent: SHADOW_CAMERA_EXTENT_LOW,
        skyWidthSegments: SKY_WIDTH_SEGMENTS_LOW,
        skyHeightSegments: SKY_HEIGHT_SEGMENTS_LOW,
        skyCloudCount: mobile ? SKY_CLOUD_COUNT_MOBILE_LOW : SKY_CLOUD_COUNT_LOW,
        skyUpdateStep: SKY_UPDATE_STEP_LOW,
        maxTextureAnisotropy: Math.min(maxAnisotropy, mobile ? 1 : TEXTURE_ANISOTROPY_LOW_CAP)
      };
    }

    if (nextMode === "high") {
      return {
        mode: nextMode,
        pixelRatioCap: mobile ? MOBILE_RENDER_PIXEL_RATIO_HIGH_CAP : RENDER_PIXEL_RATIO_HIGH_CAP,
        shadowsEnabled: true,
        shadowType: mobile ? THREE.BasicShadowMap : THREE.PCFShadowMap,
        shadowMapSize: mobile ? SHADOW_MAP_SIZE_DEFAULT : SHADOW_MAP_SIZE_HIGH,
        shadowExtent: mobile ? SHADOW_CAMERA_EXTENT_DEFAULT : SHADOW_CAMERA_EXTENT_HIGH,
        skyWidthSegments: mobile ? SKY_WIDTH_SEGMENTS_MEDIUM : SKY_WIDTH_SEGMENTS_HIGH,
        skyHeightSegments: mobile ? SKY_HEIGHT_SEGMENTS_MEDIUM : SKY_HEIGHT_SEGMENTS_HIGH,
        skyCloudCount: mobile ? SKY_CLOUD_COUNT_MOBILE_HIGH : SKY_CLOUD_COUNT_HIGH,
        skyUpdateStep: mobile ? SKY_UPDATE_STEP_MEDIUM : SKY_UPDATE_STEP_HIGH,
        maxTextureAnisotropy: mobile ? Math.min(maxAnisotropy, TEXTURE_ANISOTROPY_MEDIUM_CAP) : maxAnisotropy
      };
    }

    return {
      mode: nextMode,
      pixelRatioCap: mobile ? MOBILE_RENDER_PIXEL_RATIO_CAP : RENDER_PIXEL_RATIO_CAP,
      shadowsEnabled: true,
      shadowType: mobile ? THREE.BasicShadowMap : THREE.PCFShadowMap,
      shadowMapSize: mobile ? SHADOW_MAP_SIZE_LOW : SHADOW_MAP_SIZE_DEFAULT,
      shadowExtent: mobile ? SHADOW_CAMERA_EXTENT_LOW : SHADOW_CAMERA_EXTENT_DEFAULT,
      skyWidthSegments: SKY_WIDTH_SEGMENTS_MEDIUM,
      skyHeightSegments: SKY_HEIGHT_SEGMENTS_MEDIUM,
      skyCloudCount: mobile ? SKY_CLOUD_COUNT_MOBILE_MEDIUM : SKY_CLOUD_COUNT_MEDIUM,
      skyUpdateStep: SKY_UPDATE_STEP_MEDIUM,
      maxTextureAnisotropy: Math.min(maxAnisotropy, TEXTURE_ANISOTROPY_MEDIUM_CAP)
    };
  }

  applyGraphicsTextureQuality(profile = this.getRenderQualityProfile()) {
    if (!this.graphics || typeof this.graphics !== "object") {
      return;
    }
    const anisotropy = Math.max(1, Math.trunc(Number(profile?.maxTextureAnisotropy) || 1));
    for (const texture of Object.values(this.graphics)) {
      if (!texture || typeof texture !== "object" || !("anisotropy" in texture)) {
        continue;
      }
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    }
  }

  syncRenderLightingQuality(lobbyBudgetActive = this.isLobby3DActive(), profile = this.getRenderQualityProfile()) {
    const enableShadows = Boolean(profile?.shadowsEnabled) && !lobbyBudgetActive;
    const shadowType = profile?.shadowType ?? THREE.PCFShadowMap;
    if (this.renderer.shadowMap.type !== shadowType) {
      this.renderer.shadowMap.type = shadowType;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.renderer.shadowMap.enabled = enableShadows;
    this.renderer.shadowMap.needsUpdate = true;

    if (this.sunLight) {
      this.sunLight.castShadow = enableShadows;
      if (this.sunLight.shadow) {
        this.sunLight.shadow.autoUpdate = enableShadows;
        this.sunLight.shadow.needsUpdate = true;
      }
    }
  }

  getEffectivePixelRatioCap(lobbyBudgetActive = this._lobbyPerfBudgetActive) {
    if (lobbyBudgetActive) {
      return Math.min(this.pixelRatioCap, LOBBY_RUNTIME_PIXEL_RATIO_CAP);
    }
    return this.pixelRatioCap;
  }

  syncRuntimePerformanceBudget(lobbyBudgetActive) {
    const inLobbyBudget = Boolean(lobbyBudgetActive);
    const profile = this.getRenderQualityProfile();
    const effectiveCap = this.getEffectivePixelRatioCap(inLobbyBudget);
    if (this._lastAppliedPixelRatioCap !== effectiveCap) {
      this._lastAppliedPixelRatioCap = effectiveCap;
      if (typeof window !== "undefined") {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, effectiveCap));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    }

    if (this._lobbyPerfBudgetActive === inLobbyBudget) {
      return;
    }
    this._lobbyPerfBudgetActive = inLobbyBudget;
    this.syncRenderLightingQuality(inLobbyBudget, profile);
  }

  applyRenderQualityMode(mode, { persist = true, announce = true } = {}) {
    const profile = this.getRenderQualityProfile(mode);
    const nextMode = profile.mode;
    this.renderQualityMode = nextMode;
    this.lowSpecModeApplied = nextMode === "low";

    if (persist && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(RENDER_QUALITY_STORAGE_KEY, nextMode);
      } catch {}
    }

    this.pixelRatioCap = profile.pixelRatioCap;

    const lobbyBudgetActive = this.isLobby3DActive();
    const effectiveCap = this.getEffectivePixelRatioCap(lobbyBudgetActive);
    if (typeof window !== "undefined") {
      this._lastAppliedPixelRatioCap = effectiveCap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, effectiveCap));
    }

    if (this.sunLight?.shadow) {
      this.sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      this.sunLight.shadow.camera.left = -profile.shadowExtent;
      this.sunLight.shadow.camera.right = profile.shadowExtent;
      this.sunLight.shadow.camera.top = profile.shadowExtent;
      this.sunLight.shadow.camera.bottom = -profile.shadowExtent;
      this.sunLight.shadow.camera.updateProjectionMatrix();
      this.sunLight.shadow.needsUpdate = true;
    }

    this.applyGraphicsTextureQuality(profile);
    this.setupSky();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.syncRenderLightingQuality(lobbyBudgetActive, profile);
    this.syncRuntimePerformanceBudget(lobbyBudgetActive);
    this.syncQuickSettingsQualityUi();

    if (announce && this.hud) {
      const label = nextMode === "low" ? "낮음" : nextMode === "high" ? "높음" : "보통";
      const status =
        this.mobileEnabled && nextMode === "low"
          ? "그래픽 품질: 낮음 · 모바일 최적화"
          : `그래픽 품질: ${label}`;
      this.hud.setStatus(status, false, 0.9);
    }
  }

  syncQuickSettingsVisibility() {
    if (!this.quickSettingsBtnEl || !this.quickSettingsPanelEl) {
      return;
    }
    const controlActive = this.isRunning || this.isLobby3DActive();
    const chatBlocking =
      Boolean(this.chat?.isExpanded?.()) || (this.mobileEnabled && Boolean(this.chat?.isOpen?.()));
    const visible =
      this.mobileEnabled &&
      controlActive &&
      !this.isGameOver &&
      !this.optionsMenuOpen &&
      !chatBlocking;
    this.quickSettingsBtnEl.classList.toggle("hidden", !visible);
    if (!visible) {
      this.quickSettingsOpen = false;
      this.quickSettingsPanelEl.classList.add("hidden");
    }
    this.quickSettingsBtnEl.setAttribute("aria-expanded", this.quickSettingsOpen ? "true" : "false");
  }

  toggleQuickSettingsPanel(forceOpen = null) {
    if (!this.quickSettingsBtnEl || !this.quickSettingsPanelEl) {
      return;
    }
    const controlActive = this.isRunning || this.isLobby3DActive();
    if (!controlActive || this.isGameOver || this.optionsMenuOpen) {
      this.quickSettingsOpen = false;
      this.quickSettingsPanelEl.classList.add("hidden");
      this.quickSettingsBtnEl.setAttribute("aria-expanded", "false");
      return;
    }

    const nextOpen = forceOpen === null ? !this.quickSettingsOpen : Boolean(forceOpen);
    if (nextOpen) {
      this.buildSystem.setInventoryOpen(false);
    }
    this.quickSettingsOpen = nextOpen;
    this.quickSettingsPanelEl.classList.toggle("hidden", !nextOpen);
    this.quickSettingsBtnEl.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  }

  toggleFullscreenFromQuickSettings() {
    if (typeof document === "undefined") {
      return;
    }
    const doc = document;
    const active = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;
    if (active) {
      const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (typeof exit === "function") {
        try {
          const maybe = exit.call(doc);
          if (maybe && typeof maybe.catch === "function") {
            maybe.catch(() => {});
          }
        } catch {}
      }
      return;
    }

    const target = doc.documentElement;
    const request =
      target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen;
    if (typeof request !== "function") {
      return;
    }
    try {
      const maybe = request.call(target);
      if (maybe && typeof maybe.catch === "function") {
        maybe.catch(() => {});
      }
    } catch {}
  }

  bindQuickSettingsControls() {
    if (this._quickSettingsBound) {
      return;
    }
    this._quickSettingsBound = true;

    this.quickSettingsBtnEl?.addEventListener("click", () => {
      this.toggleQuickSettingsPanel();
    });

    this.quickFullscreenBtnEl?.addEventListener("click", () => {
      this.toggleFullscreenFromQuickSettings();
    });

    this.quickOpenOptionsBtnEl?.addEventListener("click", () => {
      this.toggleQuickSettingsPanel(false);
      if (!this.isRunning || this.isGameOver) {
        return;
      }
      this.openOptionsMenu();
    });

    for (const button of this.quickQualityButtons) {
      button?.addEventListener("click", () => {
        const mode = normalizeRenderQuality(button?.dataset?.quality);
        this.applyRenderQualityMode(mode, { persist: true, announce: true });
      });
    }

    document.addEventListener("pointerdown", (event) => {
      if (!this.quickSettingsOpen || !this.quickSettingsPanelEl || !this.quickSettingsBtnEl) {
        return;
      }
      const target = event.target;
      if (
        this.quickSettingsPanelEl.contains(target) ||
        this.quickSettingsBtnEl.contains(target)
      ) {
        return;
      }
      this.toggleQuickSettingsPanel(false);
    });

    this.syncQuickSettingsQualityUi();
    this.syncQuickSettingsVisibility();
  }

  updateOptionsExitUi() {
    if (!this.optionsExitBtn) {
      return;
    }
    const returnToLobby = this.activeMatchMode === "online" && this.isRunning && !this.isGameOver;
    const returnToHub = !this.isGameOver && (this.isRunning || this.isLobby3DActive());
    if (returnToLobby) {
      this.optionsExitBtn.textContent = "3D 로비 복귀";
      this.optionsExitBtn.dataset.action = "return-lobby";
      return;
    }
    if (returnToHub) {
      this.optionsExitBtn.textContent = "온라인 허브";
      this.optionsExitBtn.dataset.action = "open-hub";
      return;
    }
    this.optionsExitBtn.textContent = "게임 종료";
    this.optionsExitBtn.dataset.action = "exit-game";
  }

  handleOptionsExitAction() {
    const returnToLobby = this.activeMatchMode === "online" && this.isRunning && !this.isGameOver;
    if (returnToLobby) {
      this.exitOnlineMatchToLobby3D();
      return;
    }
    if (!this.isGameOver && (this.isRunning || this.isLobby3DActive())) {
      this.showOnlineHub({ statusText: "온라인 허브로 복귀했습니다.", isAlert: false, duration: 0.75 });
      return;
    }
    this.exitToStartMenu();
  }

  openOptionsMenu() {
    if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver) {
      return;
    }
    this.updateOptionsExitUi();
    if (this.optionsMenuOpen) {
      this.hud.showPauseOverlay(true);
      this.syncCursorVisibility();
      return;
    }
    this.optionsMenuOpen = true;
    this.keys.clear();
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.handlePrimaryActionUp();
    this.resetMobileStick();
    this.mobileState.lookPointerId = null;
    this.mobileState.aimPointerId = null;
    this.mobileState.firePointerId = null;
    this.chat?.close?.();
    this.buildSystem.setInventoryOpen(false);
    this.toggleQuickSettingsPanel(false);
    this.mouseLookEnabled = false;
    this.hud.showPauseOverlay(true);
    this.hud.pauseOverlayEl?.setAttribute("aria-hidden", "false");
    if (
      this.pointerLockSupported &&
      document.pointerLockElement === this.renderer.domElement
    ) {
      document.exitPointerLock();
    }
    this.refreshOptionsAudioUi();
    this.syncCursorVisibility();
  }

  closeOptionsMenu({ resume = true } = {}) {
    if (!this.optionsMenuOpen) {
      return;
    }
    this.optionsMenuOpen = false;
    this.hud.showPauseOverlay(false);
    this.hud.pauseOverlayEl?.setAttribute("aria-hidden", "true");
    this.updateOptionsExitUi();

    if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver) {
      this.syncCursorVisibility();
      return;
    }
    if (this.isUiInputFocused()) {
      this.syncCursorVisibility();
      return;
    }

    if (resume && this.isLobby3DActive()) {
      this.restoreGameplayLookState({ preferPointerLock: true });
      this.syncCursorVisibility();
      return;
    }

    if (resume) {
      if (this.mobileEnabled || this.allowUnlockedLook) {
        this.mouseLookEnabled = true;
        this.syncCursorVisibility();
        return;
      }

      this.mouseLookEnabled = false;
      this.syncCursorVisibility();
      this.tryPointerLock({ fallbackUnlockedLook: true });
      return;
    }

    if (this.mobileEnabled || this.pointerLocked || this.allowUnlockedLook) {
      this.mouseLookEnabled = true;
      this.syncCursorVisibility();
      return;
    }

    this.mouseLookEnabled = false;
    this.syncCursorVisibility();
  }

  exitOnlineMatchToLobby3D() {
    if (this.activeMatchMode !== "online" || !this.isRunning) {
      this.exitToStartMenu();
      return;
    }

    this.optionsMenuOpen = false;
    this.hud.showPauseOverlay(false);
    this.hud.pauseOverlayEl?.setAttribute("aria-hidden", "true");
    this.isRunning = false;
    this.isGameOver = false;
    this.keys.clear();
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.handlePrimaryActionUp();
    this.resetMobileStick();
    this.mobileState.lookPointerId = null;
    this.mobileState.aimPointerId = null;
    this.mobileState.firePointerId = null;
    this.chat?.close?.();
    this.setRespawnBanner("", false);
    this.setTabScoreboardVisible(false);
    this.hud.hideGameOver();
    this.mouseLookEnabled = false;

    this.setLobby3DActive(true, { reposition: true });
    this.updateTeamScoreHud();
    this.updateFlagInteractUi();
    this.refreshOnlineStatus();
    this.updateOptionsExitUi();
    this.clearUiInputFocus();
    this.restoreGameplayLookState({ preferPointerLock: true });
    this.syncCursorVisibility();
  }

  exitToStartMenu() {
    this.optionsMenuOpen = false;
    this.hud.showPauseOverlay(false);
    this.hud.pauseOverlayEl?.setAttribute("aria-hidden", "true");
    this.isRunning = false;
    this.isGameOver = false;
    this.keys.clear();
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.handlePrimaryActionUp();
    this.resetMobileStick();
    this.chat?.close?.();
    this.mapId = this.onlineMapId ?? ONLINE_MAP_ID;
    this.setRespawnBanner("", false);
    this.setTabScoreboardVisible(false);
    this.mouseLookEnabled = false;
    this.hud.hideGameOver();
    this.hud.showStartOverlay(true);
    this.setStartMenuMode("online");
    this.setLobby3DActive(false, { reposition: false });
    if (
      this.pointerLockSupported &&
      document.pointerLockElement === this.renderer.domElement
    ) {
      document.exitPointerLock();
    }
    this.refreshOnlineStatus();
    this.updateOptionsExitUi();
    this.syncCursorVisibility();
  }

  setOnlineRoundState({
    ended = false,
    winnerTeam = null,
    restartAt = 0,
    targetScore = this.onlineTargetScore,
    announce = false
  } = {}) {
    const normalizedWinner = normalizeTeamId(winnerTeam);
    const nextEnded = Boolean(ended);
    const nextRestartAt =
      Number.isFinite(Number(restartAt)) && Number(restartAt) > 0 ? Math.trunc(Number(restartAt)) : 0;

    if (Number.isFinite(Number(targetScore)) && Number(targetScore) > 0) {
      this.onlineTargetScore = Math.trunc(Number(targetScore));
    }

    const changed =
      this.onlineRoundEnded !== nextEnded ||
      this.onlineRoundWinnerTeam !== normalizedWinner ||
      this.onlineRoundRestartAt !== nextRestartAt;

    this.onlineRoundEnded = nextEnded;
    this.onlineRoundWinnerTeam = normalizedWinner;
    this.onlineRoundRestartAt = nextRestartAt;
    if (!nextEnded) {
      this.onlineRoundLastSecond = -1;
      return;
    }

    if (changed || announce) {
      const winnerLabel = formatTeamLabel(normalizedWinner);
      const remainSec =
        nextRestartAt > Date.now() ? Math.max(1, Math.ceil((nextRestartAt - Date.now()) / 1000)) : 1;
      const nextMapMeta = this.getNextOnlineMapDisplayMeta();
      const statusText = `${winnerLabel} 승리! ${remainSec}초 후 ${nextMapMeta.name} 전장으로 이동합니다`;
      this.hud.setStatus(statusText, false, 1.0);
      if (announce) {
        this.chat?.addSystemMessage(statusText, "system");
      }
      this.onlineRoundLastSecond = remainSec;
    }
  }

  updateOnlineRoundCountdown() {
    if (!this.onlineRoundEnded) {
      return;
    }
    const remainMs = this.onlineRoundRestartAt - Date.now();
    const remainSec = remainMs > 0 ? Math.max(1, Math.ceil(remainMs / 1000)) : 0;
    if (remainSec === this.onlineRoundLastSecond) {
      return;
    }
    this.onlineRoundLastSecond = remainSec;
    const winnerLabel = formatTeamLabel(this.onlineRoundWinnerTeam);
    const nextMapMeta = this.getNextOnlineMapDisplayMeta();
    const statusText =
      remainSec > 0
        ? `${winnerLabel} 승리! ${remainSec}초 후 ${nextMapMeta.name} 전장으로 이동합니다`
        : `${nextMapMeta.name} 전장으로 이동 중...`;
    this.hud.setStatus(statusText, false, 0.95);
  }

  getPlayerNameById(id) {
    const key = String(id ?? "");
    if (!key) {
      return "PLAYER";
    }
    const player = this.lobbyState.players.find((entry) => String(entry?.id ?? "") === key);
    return String(player?.name ?? "PLAYER");
  }

  getPlayerTeamById(id) {
    const key = String(id ?? "");
    if (!key) {
      return null;
    }
    const player = this.lobbyState.players.find((entry) => String(entry?.id ?? "") === key);
    return normalizeTeamId(player?.team);
  }

  getOnlineObjectiveText() {
    return "";
  }

  announceGameplayEvent(
    text,
    {
      alert = false,
      duration = 2.4,
      statusText = null,
      statusDuration = 0.95,
      logText = null,
      logLevel = "system"
    } = {}
  ) {
    const message = String(text ?? "").trim();
    if (!message) {
      return;
    }

    this.hud.setAnnouncement(message, {
      isAlert: Boolean(alert),
      duration
    });

    const statusMessage = String(statusText ?? message).trim();
    if (statusMessage) {
      this.hud.setStatus(statusMessage, Boolean(alert), statusDuration);
    }

    const chatMessage = String(logText ?? message).trim();
    if (chatMessage) {
      this.chat?.addSystemMessage(chatMessage, logLevel);
    }
  }

  showOnlineCtfEvent(event = {}) {
    const type = String(event.type ?? "").trim();
    if (!type) {
      return;
    }

    const byPlayerId = String(event.byPlayerId ?? "");
    const byName = this.getPlayerNameById(byPlayerId);
    const byTeam = normalizeTeamId(event.byTeam);
    const flagTeam = normalizeTeamId(event.flagTeam);
    const myTeam = normalizeTeamId(this.getMyTeam());
    const isMine = byPlayerId && byPlayerId === this.getMySocketId();

    if (type === "pickup") {
      const flagLabel = formatTeamLabel(flagTeam);
      const isFriendlyCarrier = myTeam && byTeam && myTeam === byTeam;
      const isFriendlyFlagLost = myTeam && flagTeam && myTeam === flagTeam && byTeam !== myTeam;
      if (isMine) {
        this.announceGameplayEvent("적 깃발 확보", {
          alert: false,
          duration: 2.5,
          statusText: "적 깃발 탈취 성공! 아군 거점으로 복귀하세요"
        });
      } else if (isFriendlyFlagLost) {
        this.announceGameplayEvent(`${flagLabel} 깃발 탈취당함`, {
          alert: true,
          duration: 2.7,
          statusText: `${byName}이(가) ${flagLabel} 깃발을 탈취했습니다`
        });
      } else if (isFriendlyCarrier) {
        this.announceGameplayEvent(`${byName}이(가) 적 깃발 확보`, {
          alert: false,
          duration: 2.4,
          statusText: `${byName}이(가) ${flagLabel} 깃발을 탈취했습니다`
        });
      } else {
        this.announceGameplayEvent(`${byName}이(가) ${flagLabel} 깃발 탈취`, {
          alert: false,
          duration: 2.2
        });
      }
      return;
    }

    if (type === "capture") {
      const isFriendlyScore = myTeam && byTeam && myTeam === byTeam;
      const teamScore = Number(event.teamScore);
      const scoreSuffix = Number.isFinite(teamScore) && teamScore > 0 ? ` (${teamScore}점)` : "";
      if (isMine) {
        this.announceGameplayEvent(`깃발 반납 성공${scoreSuffix}`, {
          alert: false,
          duration: 2.6,
          statusText: `깃발 점수 +1 획득${scoreSuffix}`
        });
      } else if (isFriendlyScore) {
        this.announceGameplayEvent(`${byName}이(가) 점수 +1 확보`, {
          alert: false,
          duration: 2.5,
          statusText: `${byName}이(가) 아군 기지에 깃발을 가져왔습니다${scoreSuffix}`
        });
      } else {
        this.announceGameplayEvent("적 팀이 깃발 점수를 획득했습니다", {
          alert: true,
          duration: 2.7,
          statusText: `${byName}이(가) 깃발 점수 +1 획득${scoreSuffix}`
        });
      }
      return;
    }

    if (type === "reset") {
      const isFriendlyFlag = myTeam && flagTeam && myTeam === flagTeam;
      const text = isFriendlyFlag
        ? `${formatTeamLabel(flagTeam)} 깃발이 기지로 복귀했습니다`
        : "깃발이 원래 위치로 복귀했습니다";
      this.announceGameplayEvent(text, {
        alert: false,
        duration: 1.8,
        statusDuration: 0.85
      });
      return;
    }

    if (type === "start") {
      this.announceGameplayEvent("깃발전 시작", {
        alert: false,
        duration: 1.9,
        statusText: "깃발전 시작: 적 기지 깃발을 탈취하세요"
      });
      return;
    }

    if (type === "match_end") {
      const winner = formatTeamLabel(normalizeTeamId(event.winnerTeam));
      this.announceGameplayEvent(`${winner} 팀 승리`, {
        alert: false,
        duration: 2.3,
        statusDuration: 1.1
      });
    }
  }

  applyOnlineStatePayload(payload = {}, { showEvent = false } = {}) {
    this.onlineCtf.mode = normalizeGameMode(payload?.mode ?? this.onlineCtf.mode ?? DEFAULT_GAME_MODE);
    if (Number.isFinite(Number(payload?.targetScore)) && Number(payload.targetScore) > 0) {
      this.onlineTargetScore = Math.trunc(Number(payload.targetScore));
    }

    const revision = Number(payload.revision);
    if (Number.isFinite(revision)) {
      this.onlineCtf.revision = Math.max(this.onlineCtf.revision, Math.trunc(revision));
    }

    const readCoord = (value, fallback) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };

    const flagsPayload =
      payload?.flags && typeof payload.flags === "object" ? payload.flags : null;
    const legacyCenterFlagPayload =
      !flagsPayload && payload?.flag && typeof payload.flag === "object" ? payload.flag : null;
    const readFlagPayload = (team) => {
      if (flagsPayload) {
        return flagsPayload[team] ?? null;
      }
      return legacyCenterFlagPayload;
    };

    for (const team of ["alpha", "bravo"]) {
      const target = this.onlineCtf.flags[team];
      const homeFallback = team === "alpha" ? this.objective.alphaFlagHome : this.objective.bravoFlagHome;
      const flagPayload = readFlagPayload(team);

      if (flagPayload?.home) {
        target.home.set(
          readCoord(flagPayload.home.x, homeFallback.x),
          readCoord(flagPayload.home.y, homeFallback.y),
          readCoord(flagPayload.home.z, homeFallback.z)
        );
      } else {
        target.home.copy(homeFallback);
      }

      if (flagPayload?.at) {
        target.at.set(
          readCoord(flagPayload.at.x, target.home.x),
          readCoord(flagPayload.at.y, target.home.y),
          readCoord(flagPayload.at.z, target.home.z)
        );
      } else {
        target.at.copy(target.home);
      }

      const carrierId = String(flagPayload?.carrierId ?? "").trim();
      target.carrierId = carrierId || null;
    }

    const scoreAlpha = Number(payload?.score?.alpha);
    const scoreBravo = Number(payload?.score?.bravo);
    if (Number.isFinite(scoreAlpha)) {
      this.onlineCtf.score.alpha = Math.trunc(scoreAlpha);
    }
    if (Number.isFinite(scoreBravo)) {
      this.onlineCtf.score.bravo = Math.trunc(scoreBravo);
    }

    const capAlpha = Number(payload?.captures?.alpha);
    const capBravo = Number(payload?.captures?.bravo);
    if (Number.isFinite(capAlpha)) {
      this.onlineCtf.captures.alpha = Math.trunc(capAlpha);
    }
    if (Number.isFinite(capBravo)) {
      this.onlineCtf.captures.bravo = Math.trunc(capBravo);
    }

    const roundPayload = payload?.round ?? null;
    this.setOnlineRoundState({
      ended: Boolean(roundPayload?.ended),
      winnerTeam: roundPayload?.winnerTeam ?? null,
      restartAt: roundPayload?.restartAt ?? 0,
      targetScore: payload?.targetScore ?? this.onlineTargetScore,
      announce: false
    });

    if (this.activeMatchMode === "online") {
      const myTeam = normalizeTeamId(this.getMyTeam());
      if (myTeam) {
        this.state.captures = Number(this.onlineCtf.captures[myTeam] ?? 0);
      }
      this.state.objectiveText = this.getOnlineObjectiveText();
    }

    this.syncOnlineFlagMeshes();
    this.updateTeamScoreHud();
    if (this.tabBoardVisible) {
      this.renderTabScoreboard();
    }

    if (showEvent) {
      this.showOnlineCtfEvent(payload?.event ?? null);
    }

  }

  syncOnlineFlagMeshes() {
    if (this.activeMatchMode !== "online") {
      if (this.onlineCenterFlag) {
        this.onlineCenterFlag.visible = false;
      }
      return;
    }
    if (this.onlineCenterFlag) {
      this.onlineCenterFlag.visible = false;
    }

    if (normalizeGameMode(this.onlineCtf.mode) !== GAME_MODE.CTF) {
      if (this.alphaFlag) {
        this.alphaFlag.visible = false;
      }
      if (this.bravoFlag) {
        this.bravoFlag.visible = false;
      }
      return;
    }

    const myId = this.getMySocketId();
    const syncFlagMesh = (team, mesh) => {
      if (!mesh) {
        return;
      }
      const flag = this.onlineCtf.flags?.[team];
      if (!flag) {
        mesh.visible = false;
        return;
      }
      if (!flag.carrierId) {
        mesh.visible = true;
        mesh.position.copy(flag.at);
        mesh.rotation.set(0, 0, 0);
        return;
      }
      if (flag.carrierId === myId) {
        mesh.visible = false;
        return;
      }
      const carrier = this.remotePlayers.get(flag.carrierId);
      if (!carrier) {
        mesh.visible = false;
        return;
      }

      const carrierYaw = Number.isFinite(carrier.yaw) ? carrier.yaw : carrier.group.rotation.y;
      const backX = Math.sin(carrierYaw) * REMOTE_CARRIER_FLAG_BACK_OFFSET;
      const backZ = Math.cos(carrierYaw) * REMOTE_CARRIER_FLAG_BACK_OFFSET;
      const sideX = Math.cos(carrierYaw) * REMOTE_CARRIER_FLAG_SIDE_OFFSET;
      const sideZ = -Math.sin(carrierYaw) * REMOTE_CARRIER_FLAG_SIDE_OFFSET;

      mesh.visible = true;
      mesh.position.set(
        carrier.group.position.x + backX + sideX,
        carrier.group.position.y + REMOTE_CARRIER_FLAG_HEIGHT_OFFSET,
        carrier.group.position.z + backZ + sideZ
      );
      mesh.rotation.set(-0.16, carrierYaw - Math.PI * 0.5, 0.14);
    };

    syncFlagMesh("alpha", this.alphaFlag);
    syncFlagMesh("bravo", this.bravoFlag);
  }

  applyRoomSnapshot(payload = {}) {
    this.applyDailyLeaderboardPayload(payload.dailyLeaderboard ?? null);
    const incomingMapId = normalizeOnlineMapId(
      payload.mapId ?? payload.state?.mapId ?? this.lobbyState.state?.mapId ?? this.onlineMapId
    );
    this.onlineMapId = incomingMapId;
    if (!this.isRunning || this.activeMatchMode === "online") {
      this.mapId = incomingMapId;
    }
    const roundStartedAt = Math.max(0, Number(payload.round?.startedAt ?? 0) || 0);
    const roundEnded = Boolean(payload.round?.ended);
    const snapshotRevision = Math.max(0, Math.trunc(Number(payload.revision) || 0));
    const snapshotUpdatedAt = Math.max(0, Math.trunc(Number(payload.updatedAt) || 0));
    const blocks = Array.isArray(payload.blocks) ? payload.blocks : null;
    const snapshotKey = `${incomingMapId}|${snapshotRevision}|${snapshotUpdatedAt}|${roundStartedAt}|${blocks?.length ?? -1}`;
    if (roundStartedAt > 0) {
      this.lastRoomStartedAt = Math.max(this.lastRoomStartedAt, roundStartedAt);
    }
    if (
      roundStartedAt > 0 &&
      !roundEnded &&
      (!this.isRunning || this.activeMatchMode !== "online")
    ) {
      this.start({ mode: "online" });
      return;
    }
    if (payload.weaponId) {
      this.applySelectedWeapon(payload.weaponId, {
        persist: true,
        syncToServer: false,
        resetAmmo: false,
        announce: false
      });
    }
    if (snapshotKey === this.lastAppliedRoomSnapshotKey) {
      this.latestRoomSnapshot = payload;
      this.applyInventorySnapshot(payload.stock, { quiet: true });
      this.applyOnlineStatePayload(payload, { showEvent: false });
      return;
    }
    this.lastAppliedRoomSnapshotKey = snapshotKey;
    this.latestRoomSnapshot = payload;
    this.resetDynamicBlockState(blocks ?? []);
    if (!blocks) {
      return;
    }
    const shouldApplyOnlineWorld = this.activeMatchMode === "online" && this.isRunning;
    if (!shouldApplyOnlineWorld) {
      return;
    }
    this.applyInventorySnapshot(payload.stock, { quiet: true });

    this.mapId = incomingMapId;
    this.voxelWorld.generateTerrain({ mapId: this.mapId });
    for (const entry of blocks) {
      const update = this.normalizeDynamicBlockUpdate(entry);
      if (!update) {
        continue;
      }
      if (update.action === "place") {
        this.voxelWorld.setBlock(update.x, update.y, update.z, update.typeId);
      } else {
        this.voxelWorld.removeBlock(update.x, update.y, update.z);
      }
    }
    this.pendingRemoteBlocks.clear();
    this.setupObjectives();
    this.applyOnlineStatePayload(payload, { showEvent: false });

    if (this.activeMatchMode === "online" && this.isRunning) {
      if (
        this.isPlayerCollidingAt(this.playerPosition.x, this.playerPosition.y, this.playerPosition.z)
      ) {
        this.setOnlineSpawnFromLobby();
      }
      this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
    }
  }

  applyInventorySnapshot(stockPayload = null, { quiet = true } = {}) {
    const changed = this.buildSystem?.applyStockSnapshot?.(stockPayload) === true;
    if (changed && !quiet) {
      this.hud.setStatus("블록 수량 동기화", false, 0.45);
    }
    return changed;
  }

  normalizeDynamicBlockUpdate(entry = {}) {
    const action = entry.action === "place" ? "place" : entry.action === "remove" ? "remove" : null;
    if (!action) {
      return null;
    }

    const rawX = Number(entry.x);
    const rawY = Number(entry.y);
    const rawZ = Number(entry.z);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawZ)) {
      return null;
    }

    const normalized = {
      action,
      x: Math.trunc(rawX),
      y: Math.trunc(rawY),
      z: Math.trunc(rawZ)
    };
    if (this.isLobby3DProtectedBlockCoord(normalized.x, normalized.y, normalized.z)) {
      return null;
    }

    if (action === "place") {
      const typeId = Number(entry.typeId);
      if (!Number.isFinite(typeId)) {
        return null;
      }
      normalized.typeId = Math.trunc(typeId);
    } else if (Number.isFinite(Number(entry.typeId))) {
      normalized.typeId = Math.trunc(Number(entry.typeId));
    }

    return normalized;
  }

  getDynamicBlockEntry(x, y, z) {
    return this.dynamicBlockState.get(toBlockKey(Math.trunc(x), Math.trunc(y), Math.trunc(z))) ?? null;
  }

  clearShotBlockDamageState(x, y, z) {
    this.shotBlockDamageState.delete(toBlockKey(Math.trunc(x), Math.trunc(y), Math.trunc(z)));
  }

  getShotBlockHealth(typeId) {
    const normalizedTypeId = Math.trunc(Number(typeId) || 0);
    return SHOT_BLOCK_HEALTH_BY_TYPE_ID.get(normalizedTypeId) ?? 6;
  }

  getShotBlockImpactPower(weaponDef = this.selectedWeaponDef) {
    const weaponId = String(weaponDef?.id ?? "").trim().toLowerCase();
    if (weaponId === "awp") {
      return 2.4;
    }
    if (weaponId === "spas12") {
      return 0.65;
    }
    return 1;
  }

  setDynamicBlockEntry(key, entry = null) {
    if (!key) {
      return;
    }
    if (!entry) {
      this.dynamicBlockState.delete(key);
      return;
    }
    this.dynamicBlockState.set(key, { ...entry });
  }

  applyDynamicBlockUpdate(update = {}) {
    const normalized = this.normalizeDynamicBlockUpdate(update);
    if (!normalized) {
      return null;
    }
    const key = toBlockKey(normalized.x, normalized.y, normalized.z);
    this.shotBlockDamageState.delete(key);
    this.voxelWorld.setBlockDamageTint(normalized.x, normalized.y, normalized.z, 0);
    if (normalized.action === "remove") {
      this.dynamicBlockState.set(key, {
        action: "remove",
        x: normalized.x,
        y: normalized.y,
        z: normalized.z,
        typeId: Number.isFinite(Number(normalized.typeId)) ? Math.trunc(Number(normalized.typeId)) : null
      });
      return normalized;
    }
    this.dynamicBlockState.set(key, normalized);
    return normalized;
  }

  resetDynamicBlockState(blocks = []) {
    this.dynamicBlockState.clear();
    this.shotBlockDamageState.clear();
    for (const entry of blocks) {
      this.applyDynamicBlockUpdate(entry);
    }
  }

  createBaseMarker(position, color) {
    const group = new THREE.Group();

    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(2.7, 2.7, 0.08, 24),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.32,
        roughness: 0.52,
        metalness: 0.24,
        transparent: true,
        opacity: 0.9
      })
    );
    ring.position.set(position.x, position.y + 0.04, position.z);
    ring.receiveShadow = true;

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.3, 10),
      new THREE.MeshStandardMaterial({
        color: 0xd8e8ff,
        roughness: 0.3,
        metalness: 0.7
      })
    );
    pole.position.set(position.x, position.y + 1.15, position.z);
    pole.castShadow = true;

    group.add(ring, pole);
    return group;
  }

  createFlagMesh(poleColor, flagColor) {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 3.8, 12),
      new THREE.MeshStandardMaterial({
        color: poleColor,
        roughness: 0.35,
        metalness: 0.58
      })
    );
    pole.position.y = 1.9;
    pole.castShadow = true;

    const cloth = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.52, 0.05),
      new THREE.MeshStandardMaterial({
        color: flagColor,
        emissive: flagColor,
        emissiveIntensity: 0.16,
        roughness: 0.48,
        metalness: 0.1
      })
    );
    cloth.position.set(0.5, 3.05, 0);
    cloth.castShadow = true;

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 10),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xaad9ff,
        emissiveIntensity: 0.22
      })
    );
    tip.position.y = 3.84;
    tip.castShadow = true;

    group.add(pole, cloth, tip);
    group.userData.cloth = cloth;
    return group;
  }

  createControlBeacon(position) {
    const group = new THREE.Group();
    group.position.set(position.x, position.y, position.z);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.14, 16, 36),
      new THREE.MeshStandardMaterial({
        color: 0x96deff,
        emissive: 0x96deff,
        emissiveIntensity: 0.26,
        roughness: 0.34,
        metalness: 0.62,
        transparent: true,
        opacity: 0.74
      })
    );
    ring.rotation.x = Math.PI * 0.5;
    ring.position.y = 0.2;
    ring.castShadow = false;
    ring.receiveShadow = true;

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.42, 3.0, 18),
      new THREE.MeshStandardMaterial({
        color: 0xbceaff,
        emissive: 0x9ad7ff,
        emissiveIntensity: 0.28,
        roughness: 0.2,
        metalness: 0.72
      })
    );
    core.position.y = 1.5;
    core.castShadow = true;

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xc7ecff,
        emissiveIntensity: 0.35
      })
    );
    cap.position.y = 3.06;
    cap.castShadow = true;

    group.add(ring, core, cap);
    group.userData.ring = ring;
    group.userData.core = core;
    return group;
  }

  applyControlVisual(pulse = 0) {
    if (!this.controlRing || !this.controlCore) {
      return;
    }

    const owner = this.objective.controlOwner;
    const progress = this.objective.controlProgress;
    const isAlpha = owner === "alpha";
    const baseColor = isAlpha ? 0x62b7ff : 0x96deff;
    const coreColor = isAlpha ? 0xc4e9ff : 0xbceaff;

    this.controlRing.material.color.setHex(baseColor);
    this.controlRing.material.emissive.setHex(baseColor);
    this.controlRing.material.opacity = THREE.MathUtils.clamp(
      0.52 + progress * 0.32 + pulse * 0.12,
      0.42,
      0.96
    );
    this.controlRing.material.emissiveIntensity = 0.2 + progress * 0.34 + pulse * 0.14;
    this.controlRing.scale.setScalar(1 + progress * 0.22 + pulse * 0.05);

    this.controlCore.material.color.setHex(coreColor);
    this.controlCore.material.emissive.setHex(baseColor);
    this.controlCore.material.emissiveIntensity = 0.2 + progress * 0.26 + pulse * 0.22;
    this.controlCore.scale.y = 0.86 + progress * 0.42;
  }

  getObjectiveText() {
    return this.activeMatchMode === "online" ? this.getOnlineObjectiveText() : "";
  }

  resetObjectives() {
    this.objective.playerHasEnemyFlag = false;
    this.objective.controlProgress = 0;
    this.objective.controlOwner = "neutral";
    this.objective.controlBonusTimer = 0;
    this.objective.controlStatusCooldown = 0;
    this.objective.controlPulse = 0;
    this.state.controlPercent = 0;
    this.state.controlOwner = "neutral";
    this.state.objectiveText = this.getObjectiveText();
    this.applyControlVisual(0);

    if (this.alphaFlag) {
      this.alphaFlag.visible = true;
      this.alphaFlag.position.copy(this.objective.alphaFlagHome);
    }
    if (this.bravoFlag) {
      this.bravoFlag.visible = true;
      this.bravoFlag.position.copy(this.objective.bravoFlagHome);
    }

    this.resetOnlineCtfFromArena();
  }

  distanceXZ(from, to) {
    const dx = from.x - to.x;
    const dz = from.z - to.z;
    return Math.hypot(dx, dz);
  }

  getWeaponDamageAtDistance(weaponDef, baseDamage, distance = 0) {
    const parsedBaseDamage = Math.max(1, Number(baseDamage) || 1);
    const falloffStart = Math.max(0, Number(weaponDef?.damageFalloffStart) || 0);
    const falloffEnd = Math.max(falloffStart, Number(weaponDef?.damageFalloffEnd) || falloffStart);
    if (falloffEnd <= falloffStart) {
      return Math.round(parsedBaseDamage);
    }
    const minDamageScale = THREE.MathUtils.clamp(
      Number(weaponDef?.minDamageScale ?? 1) || 1,
      0.05,
      1
    );
    const normalizedDistance = THREE.MathUtils.clamp(
      (Number(distance) - falloffStart) / (falloffEnd - falloffStart),
      0,
      1
    );
    const easedDistance = normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance);
    return Math.max(
      1,
      Math.round(THREE.MathUtils.lerp(parsedBaseDamage, parsedBaseDamage * minDamageScale, easedDistance))
    );
  }

  getWeaponHitDamage(weaponDef, baseDamage, distance = 0, hitZone = "body") {
    const distanceDamage = this.getWeaponDamageAtDistance(weaponDef, baseDamage, distance);
    const normalizedHitZone = String(hitZone ?? "body").trim().toLowerCase();
    const hitMultiplier =
      normalizedHitZone === "head"
        ? Math.max(1, Number(weaponDef?.headshotMultiplier ?? 1) || 1)
        : 1;
    return Math.max(1, Math.round(distanceDamage * hitMultiplier));
  }

  promoteHitZone(currentZone = "", nextZone = "") {
    const current = String(currentZone ?? "").trim().toLowerCase();
    const next = String(nextZone ?? "").trim().toLowerCase();
    if (next === "head") {
      return "head";
    }
    return current || next || "body";
  }

  getLocalSupportBasePoint() {
    if (this.activeMatchMode === "online") {
      const myTeam = normalizeTeamId(this.getMyTeam());
      if (myTeam === "alpha") {
        return this.objective.alphaBase;
      }
      if (myTeam === "bravo") {
        return this.objective.bravoBase;
      }
      return null;
    }
    return this.objective.trainingSpawn ?? this.objective.alphaBase;
  }

  updateLocalBaseSupport(delta) {
    if (!this.isRunning || this.isGameOver) {
      return;
    }

    const basePoint = this.getLocalSupportBasePoint();
    if (!basePoint) {
      this.baseSupport.healPool = 0;
      this.baseSupport.ammoPool = 0;
      return;
    }

    const dx = this.playerPosition.x - basePoint.x;
    const dz = this.playerPosition.z - basePoint.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > BASE_SUPPORT_RADIUS_SQ) {
      this.baseSupport.healPool = 0;
      this.baseSupport.ammoPool = 0;
      return;
    }

    const safeDelta = Math.max(0, Number(delta) || 0);
    this.baseSupport.healPool += safeDelta * BASE_SUPPORT_HEAL_PER_SEC;
    while (this.baseSupport.healPool >= 1 && this.state.health < 100) {
      this.state.health = Math.min(100, this.state.health + 1);
      this.baseSupport.healPool -= 1;
    }
    if (this.state.health >= 100) {
      this.baseSupport.healPool = Math.min(this.baseSupport.healPool, 0.99);
    }

    this.baseSupport.ammoPool += safeDelta * BASE_SUPPORT_AMMO_PER_SEC;
    while (this.baseSupport.ammoPool >= 1) {
      const restored = this.weapon.refill(1);
      if (!restored) {
        this.baseSupport.ammoPool = Math.min(this.baseSupport.ammoPool, 0.99);
        break;
      }
      this.baseSupport.ammoPool -= restored;
    }
  }

  syncMinimapVisibility() {
    if (!this.minimapShellEl) {
      return;
    }
    const visible = this.isRunning && !this.isGameOver && !this.optionsMenuOpen && !this.mobileEnabled;
    this.minimapShellEl.classList.toggle("hidden", !visible);
    this.minimapShellEl.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  updateMinimap(force = false) {
    this.syncMinimapVisibility();
    if (
      !this.minimapShellEl ||
      !this.minimapCanvasEl ||
      !this.minimapCtx ||
      this.minimapShellEl.classList.contains("hidden")
    ) {
      return;
    }

    const now = getNowMs();
    if (!force && now - this.lastMinimapDrawAt < MINIMAP_REDRAW_INTERVAL_MS) {
      return;
    }
    this.lastMinimapDrawAt = now;
    drawMinimap({
      ctx: this.minimapCtx,
      canvas: this.minimapCanvasEl,
      arena: this.voxelWorld.getArenaMeta?.() ?? {},
      alphaBase: this.objective.alphaBase,
      bravoBase: this.objective.bravoBase,
      controlPoint: this.objective.controlPoint,
      activeMatchMode: this.activeMatchMode,
      onlineCtf: this.onlineCtf,
      remotePlayers: this.remotePlayers.values(),
      enemies: this.enemyManager.enemies,
      playerPosition: this.playerPosition,
      yaw: this.yaw,
      supportBase: this.getLocalSupportBasePoint(),
      myTeam: normalizeTeamId(this.getMyTeam()),
      minimapPadding: MINIMAP_PADDING,
      playerRadius: MINIMAP_PLAYER_RADIUS,
      baseSupportRadius: BASE_SUPPORT_RADIUS
    });
  }

  updateObjectives(delta) {
    if (!this.isRunning || this.isGameOver) {
      return;
    }

    if (this.activeMatchMode === "online") {
      if (this.onlineCenterFlagCloth) {
        this.onlineCenterFlagPulse += delta * 4.1;
        this.onlineCenterFlagCloth.rotation.y = Math.sin(this.onlineCenterFlagPulse) * 0.17;
      }
      this.state.objectiveText = this.getOnlineObjectiveText();
      this.updateFlagInteractUi();
      return;
    }

    if (this.flagInteractVisible) {
      this.flagInteractVisible = false;
      this.flagInteractMode = "none";
      this.flagInteractBtnEl?.classList.remove("show");
      this.flagInteractBtnEl?.setAttribute("aria-hidden", "true");
    }

    if (!this.bravoFlag) {
      return;
    }

    if (!this.objective.playerHasEnemyFlag) {
      const nearEnemyFlag = this.distanceXZ(this.playerPosition, this.objective.bravoFlagHome) <= 2.25;
      if (nearEnemyFlag) {
        this.objective.playerHasEnemyFlag = true;
        this.bravoFlag.visible = false;
        this.state.objectiveText = this.getObjectiveText();
        this.hud.setStatus(
          "\uC801 \uAE43\uBC1C \uD655\uBCF4! \uC544\uAD70 \uAC70\uC810\uC73C\uB85C \uBCF5\uADC0",
          false,
          1.2
        );
        this.addChatMessage(
          "\uC801 \uAE43\uBC1C\uC744 \uD655\uBCF4\uD588\uC2B5\uB2C8\uB2E4.",
          "info"
        );
      }
    } else {
      const reachedHome = this.distanceXZ(this.playerPosition, this.objective.alphaBase) <= 3.1;
      if (reachedHome) {
        this.objective.playerHasEnemyFlag = false;
        this.state.captures += 1;
        this.state.score += 1;
        this.state.health = Math.min(100, this.state.health + 20);

        this.bravoFlag.visible = true;
        this.bravoFlag.position.copy(this.objective.bravoFlagHome);

        this.enemyManager.maxEnemies = Math.min(36, this.enemyManager.maxEnemies + 1);
        this.hud.setStatus(
          "\uAE43\uBC1C \uD0C8\uCDE8 \uC131\uACF5 +1 (\uCD1D " + this.state.captures + "\uD68C)",
          false,
          1.3
        );
        this.addChatMessage(
          "\uAE43\uBC1C \uD0C8\uCDE8 \uC131\uACF5 (" + this.state.captures + "\uD68C)",
          "kill"
        );
      }
    }

    this.objective.controlStatusCooldown = Math.max(0, this.objective.controlStatusCooldown - delta);

    const controlRadius = this.objective.controlRadius;
    const playerInControl = this.distanceXZ(this.playerPosition, this.objective.controlPoint) <= controlRadius;
    const enemiesInControl = this.enemyManager.countEnemiesNear(
      this.objective.controlPoint,
      controlRadius + 1.25
    );

    let controlProgress = this.objective.controlProgress;
    if (playerInControl && enemiesInControl === 0) {
      controlProgress = Math.min(1, controlProgress + delta / 5.4);
    } else if (!playerInControl && enemiesInControl > 0) {
      const pressure = Math.min(0.5, enemiesInControl * 0.07);
      controlProgress = Math.max(0, controlProgress - delta * (0.22 + pressure));
    } else if (playerInControl && enemiesInControl > 0) {
      controlProgress = Math.max(0, controlProgress - delta * Math.min(0.2, enemiesInControl * 0.04));
      if (this.objective.controlStatusCooldown <= 0) {
        this.hud.setStatus("\uC911\uC559 \uAC70\uC810 \uAD50\uC804 \uC911", true, 0.42);
        this.objective.controlStatusCooldown = 1.8;
      }
    } else if (this.objective.controlOwner === "alpha") {
      controlProgress = Math.max(0.68, controlProgress - delta * 0.014);
    } else {
      controlProgress = Math.max(0, controlProgress - delta * 0.05);
    }

    const prevOwner = this.objective.controlOwner;
    if (controlProgress >= 1 && prevOwner !== "alpha") {
      this.objective.controlOwner = "alpha";
      this.objective.controlBonusTimer = 0;
      this.state.score += 150;
      this.state.health = Math.min(100, this.state.health + 8);
      this.hud.setStatus("\uC911\uC559 \uAC70\uC810 \uD655\uBCF4 +150", false, 1.1);
      this.addChatMessage("\uC911\uC559 \uAC70\uC810\uC744 \uD655\uBCF4\uD588\uC2B5\uB2C8\uB2E4.", "info");
    } else if (
      controlProgress <= 0.02 &&
      prevOwner === "alpha" &&
      !playerInControl &&
      enemiesInControl > 0
    ) {
      this.objective.controlOwner = "neutral";
      this.objective.controlBonusTimer = 0;
      this.hud.setStatus("\uC911\uC559 \uAC70\uC810 \uC0C1\uC2E4", true, 1);
      this.addChatMessage("중앙 거점을 잃었습니다. 탈환이 필요합니다.", "warning");
    }

    this.objective.controlProgress = controlProgress;
    this.state.controlPercent = Math.round(controlProgress * 100);
    this.state.controlOwner = this.objective.controlOwner;

    if (this.objective.controlOwner === "alpha") {
      this.objective.controlBonusTimer += delta;
      while (this.objective.controlBonusTimer >= 8) {
        this.objective.controlBonusTimer -= 8;
        this.state.score += 40;
        this.weapon.reserve = Math.min(this.weapon.defaultReserve * 4, this.weapon.reserve + 6);
        if (playerInControl) {
          this.state.health = Math.min(100, this.state.health + 2);
        }
      }
    } else {
      this.objective.controlBonusTimer = 0;
    }

    this.objective.controlPulse += delta * (2.4 + controlProgress * 2);
    const pulse = (Math.sin(this.objective.controlPulse) + 1) * 0.5;
    if (this.controlBeacon) {
      this.controlBeacon.rotation.y += delta * 0.4;
    }

    this.applyControlVisual(pulse);
    this.state.objectiveText = this.getObjectiveText();
  }

  createWeaponView(weaponId = this.selectedWeaponId) {
    const safeWeaponId = sanitizeWeaponId(weaponId);
    const weaponDef = getWeaponDefinition(safeWeaponId);
    const { group, muzzleFlash, muzzleLight } = createWeaponViewModel(safeWeaponId, {
      muzzleFlashMap: this.graphics.muzzleFlashMap
    });
    group.scale.setScalar(Math.max(0.001, Number(weaponDef.viewScale ?? 1)));
    const hipOffset = weaponDef.hipOffset ?? { x: 0.38, y: -0.38, z: -0.76 };
    const hipRotation = weaponDef.hipRotation ?? { x: -0.22, y: -0.06, z: 0.02 };
    group.position.set(hipOffset.x, hipOffset.y, hipOffset.z);
    group.rotation.set(hipRotation.x, hipRotation.y, hipRotation.z);
    group.visible = false;
    group.userData.weaponId = safeWeaponId;
    group.userData.weaponFlash = muzzleFlash ?? null;
    group.userData.weaponFlashLight = muzzleLight ?? null;
    return group;
  }

  getWeaponViewFromCache(weaponId = this.selectedWeaponId) {
    const safeWeaponId = sanitizeWeaponId(weaponId);
    let group = this.weaponViewCache.get(safeWeaponId);
    if (!group) {
      group = this.createWeaponView(safeWeaponId);
      this.weaponViewCache.set(safeWeaponId, group);
    }
    return group;
  }

  createShovelView() {
    return createShovelViewModel();
  }

  createBlockView() {
    return createBlockViewModel();
  }

  updateBlockViewAppearance() {
    if (!this.blockView || !this.buildSystem?.getSelectedType) {
      return;
    }

    const type = this.buildSystem.getSelectedType();
    if (!type) {
      return;
    }
    const typeId = String(type.id ?? "");
    if (typeId && this.lastBlockViewTypeId === typeId) {
      return;
    }
    this.lastBlockViewTypeId = typeId;
    applyBlockViewColor(this.blockView, type.color);
  }

  getMySocketId() {
    return this.chat?.socket?.id ?? "";
  }

  getMyTeam() {
    const myId = this.getMySocketId();
    const fromLobby = this.lobbyState.players.find((player) => String(player?.id ?? "") === myId);
    const team = fromLobby?.team ?? this.lobbyState.selectedTeam ?? null;
    return normalizeTeamId(team);
  }

  getProtectedBaseCenters() {
    const centers = [];
    const addCenter = (point) => {
      const x = Number(point?.x);
      const z = Number(point?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return;
      }
      centers.push({ x, z });
    };

    addCenter(this.objective?.alphaBase);
    addCenter(this.objective?.bravoBase);

    if (centers.length === 0) {
      centers.push({ x: -35, z: 0 }, { x: 35, z: 0 });
    }

    return centers;
  }

  isInsideProtectedBaseRadius(x, z, radiusSq) {
    const bx = Number(x);
    const bz = Number(z);
    if (!Number.isFinite(bx) || !Number.isFinite(bz)) {
      return false;
    }

    for (const center of this.getProtectedBaseCenters()) {
      const dx = bx - center.x;
      const dz = bz - center.z;
      if (dx * dx + dz * dz <= radiusSq) {
        return true;
      }
    }
    return false;
  }

  isSpawnCoreProtectedCoord(x, y, z) {
    const by = Number(y);
    if (!Number.isFinite(by) || by < SPAWN_CORE_PROTECT_MIN_Y || by > SPAWN_CORE_PROTECT_MAX_Y) {
      return false;
    }
    return this.isInsideProtectedBaseRadius(x, z, SPAWN_CORE_PROTECT_RADIUS_SQ);
  }

  isBaseFloorProtectedCoord(x, y, z) {
    const by = Number(y);
    if (!Number.isFinite(by) || by > BASE_FLOOR_PROTECT_MAX_Y) {
      return false;
    }
    return this.isInsideProtectedBaseRadius(x, z, BASE_FLOOR_PROTECT_RADIUS_SQ);
  }

  canModifyWorldBlock(x, y, z, { mode = "dig", typeId = null } = {}) {
    if (mode === "shot") {
      return SHOT_BREAKABLE_TYPE_IDS.has(Math.trunc(Number(typeId) || 0));
    }

    return true;
  }

  setTabScoreboardVisible(visible) {
    const show = Boolean(
      visible &&
        this.tabScoreboardEl &&
        this.activeMatchMode === "online" &&
        (this.isRunning || this.isLobby3DActive()) &&
        !this.isGameOver
    );
    this.tabBoardVisible = show;
    if (this.mobileTabBtn) {
      this.mobileTabBtn.classList.toggle("is-active", show);
      this.mobileTabBtn.setAttribute("aria-pressed", show ? "true" : "false");
    }
    if (!this.tabScoreboardEl) {
      return;
    }
    this.tabScoreboardEl.classList.toggle("show", show);
    this.tabScoreboardEl.setAttribute("aria-hidden", show ? "false" : "true");
    if (show) {
      this.renderTabScoreboard();
    }
  }

  renderTabScoreboard() {
    if (!this.tabAlphaListEl || !this.tabBravoListEl) {
      return;
    }

    const players = Array.isArray(this.lobbyState.players) ? this.lobbyState.players : [];
    const myId = this.getMySocketId();
    const teamOrder = ["alpha", "bravo"];
    const teamScore = this.onlineCtf?.score ?? { alpha: 0, bravo: 0 };

    for (const team of teamOrder) {
      const listEl = team === "alpha" ? this.tabAlphaListEl : this.tabBravoListEl;
      const countEl = team === "alpha" ? this.tabAlphaCountEl : this.tabBravoCountEl;
      const scoreValue = Number(teamScore?.[team] ?? 0);
      const teamPlayers = players
        .filter((player) => normalizeTeamId(player?.team) === team)
        .sort((a, b) => {
          const capturesA = Number(a?.captures ?? 0);
          const capturesB = Number(b?.captures ?? 0);
          if (capturesA !== capturesB) {
            return capturesB - capturesA;
          }
          const killsA = Number(a?.kills ?? 0);
          const killsB = Number(b?.kills ?? 0);
          if (killsA !== killsB) {
            return killsB - killsA;
          }
          const deathsA = Number(a?.deaths ?? 0);
          const deathsB = Number(b?.deaths ?? 0);
          if (deathsA !== deathsB) {
            return deathsA - deathsB;
          }
          return String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
        });

      if (countEl) {
        countEl.textContent = `${Number.isFinite(scoreValue) ? Math.trunc(scoreValue) : 0}점 · ${teamPlayers.length}명`;
      }

      listEl.innerHTML = "";
      if (teamPlayers.length === 0) {
        const empty = document.createElement("div");
        empty.className = "tab-player-empty";
        empty.textContent = "대기 중";
        listEl.appendChild(empty);
        continue;
      }

      for (const player of teamPlayers) {
        const row = document.createElement("div");
        row.className = "tab-player-row";
        if (String(player?.id ?? "") === myId) {
          row.classList.add("is-self");
        }

        const name = document.createElement("span");
        name.className = "tab-player-name";
        name.textContent = String(player?.name ?? "PLAYER");
        row.appendChild(name);

        const meta = document.createElement("span");
        meta.className = "tab-player-meta";
        const kills = Math.max(0, Math.trunc(Number(player?.kills ?? 0)));
        const deaths = Math.max(0, Math.trunc(Number(player?.deaths ?? 0)));
        const captures = Math.max(0, Math.trunc(Number(player?.captures ?? 0)));
        meta.textContent =
          String(player?.id ?? "") === myId
            ? `K ${kills} / D ${deaths} / C ${captures} | YOU`
            : `K ${kills} / D ${deaths} / C ${captures}`;
        row.appendChild(meta);

        listEl.appendChild(row);
      }
    }
  }

  updateTeamScoreHud() {
    if (!this.ctfScoreboardEl || !this.ctfScoreAlphaEl || !this.ctfScoreBravoEl) {
      return;
    }

    const show = this.activeMatchMode === "online" && this.isRunning && !this.isGameOver;
    if (this.scoreHudState.show !== show) {
      this.ctfScoreboardEl.classList.toggle("show", show);
      this.ctfScoreboardEl.setAttribute("aria-hidden", show ? "false" : "true");
      this.scoreHudState.show = show;
    }
    if (!show) {
      return;
    }

    const alpha = Math.max(0, Math.trunc(Number(this.onlineCtf?.score?.alpha ?? 0)));
    const bravo = Math.max(0, Math.trunc(Number(this.onlineCtf?.score?.bravo ?? 0)));
    if (this.scoreHudState.alpha !== alpha) {
      this.ctfScoreAlphaEl.textContent = String(alpha);
      this.scoreHudState.alpha = alpha;
    }
    if (this.scoreHudState.bravo !== bravo) {
      this.ctfScoreBravoEl.textContent = String(bravo);
      this.scoreHudState.bravo = bravo;
    }
  }

  canLocalPickupCenterFlag() {
    if (
      this.activeMatchMode !== "online" ||
      !this.isRunning ||
      this.isGameOver ||
      this.isRespawning ||
      this.onlineRoundEnded
    ) {
      return false;
    }
    if (normalizeGameMode(this.onlineCtf.mode) !== GAME_MODE.CTF) {
      return false;
    }

    const myTeam = normalizeTeamId(this.getMyTeam());
    if (!myTeam) {
      return false;
    }
    const enemyTeam = getEnemyTeamId(myTeam);
    if (!enemyTeam) {
      return false;
    }

    const enemyFlag = this.onlineCtf.flags?.[enemyTeam];
    if (!enemyFlag || enemyFlag.carrierId) {
      return false;
    }

    return this.distanceXZ(this.playerPosition, enemyFlag.at) <= CTF_PICKUP_RADIUS;
  }

  isLocalFlagCarrier() {
    if (this.activeMatchMode === "online") {
      const myId = this.getMySocketId();
      if (!myId) {
        return false;
      }
      const flags = this.onlineCtf?.flags ?? null;
      if (!flags || typeof flags !== "object") {
        return false;
      }
      return (
        String(flags.alpha?.carrierId ?? "") === myId ||
        String(flags.bravo?.carrierId ?? "") === myId
      );
    }
    return Boolean(this.objective.playerHasEnemyFlag);
  }

  updateFlagInteractUi() {
    if (!this.flagInteractBtnEl) {
      return;
    }

    const showFlagInteractButton = this.canLocalPickupCenterFlag();
    const show = showFlagInteractButton;
    const nextMode = showFlagInteractButton ? "flag" : "none";
    if (show === this.flagInteractVisible && nextMode === this.flagInteractMode) {
      return;
    }

    this.flagInteractVisible = show;
    this.flagInteractMode = nextMode;
    this.flagInteractBtnEl.textContent = "깃발 탈취";
    this.flagInteractBtnEl.classList.toggle("show", show);
    this.flagInteractBtnEl.setAttribute("aria-hidden", show ? "false" : "true");
  }

  requestCenterFlagInteract({ source = "key" } = {}) {
    if (this.activeMatchMode !== "online" || !this.isRunning || this.isGameOver) {
      return;
    }

    if (Date.now() < this.flagInteractCooldownUntil) {
      return;
    }

    if (!this.canLocalPickupCenterFlag()) {
      if (source === "key") {
        const text = this.onlineRoundEnded
          ? "라운드 종료: 자동 재시작 대기 중입니다."
          : "적 기지 깃발 근처에서 상호작용하세요.";
        this.hud.setStatus(text, true, 0.45);
      }
      return;
    }

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      this.hud.setStatus("서버 연결 상태를 확인하세요.", true, 0.6);
      return;
    }

    // Ensure server-side player position is up-to-date right before interact validation.
    this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
    this.flagInteractCooldownUntil = Date.now() + CTF_INTERACT_COOLDOWN_MS;
    socket.emit("ctf:interact", (response = {}) => {
      if (!response.ok) {
        const errorText = String(response.error ?? "깃발 상호작용에 실패했습니다.");
        this.hud.setStatus(errorText, true, 0.8);
        return;
      }
      if (response.alreadyCarrying) {
        this.hud.setStatus("이미 깃발을 운반 중입니다.", false, 0.6);
      }
    });
  }

  handleOnlineMatchEnd(payload = {}) {
    if (this.activeMatchMode !== "online") {
      return;
    }

    const winnerTeam = normalizeTeamId(payload?.winnerTeam);
    const restartAt = Number(payload?.restartAt);
    const targetScore = Number(payload?.targetScore);
    this.setOnlineRoundState({
      ended: true,
      winnerTeam,
      restartAt,
      targetScore,
      announce: true
    });
    this.leftMouseDown = false;
    this.rightMouseAiming = false;
    this.isAiming = false;
    this.handlePrimaryActionUp();
  }

  setRespawnBanner(message = "", visible = false) {
    if (!this.respawnBannerEl) {
      return;
    }

    if (!visible) {
      this.respawnBannerEl.classList.remove("show");
      this.respawnBannerEl.setAttribute("aria-hidden", "true");
      this.respawnBannerEl.textContent = "";
      return;
    }

    this.respawnBannerEl.textContent = message;
    this.respawnBannerEl.classList.add("show");
    this.respawnBannerEl.setAttribute("aria-hidden", "false");
  }

  beginRespawnCountdown(respawnAtRaw = null) {
    const parsedRespawnAt = Number(respawnAtRaw);
    this.isRespawning = true;
    this.respawnEndAt =
      Number.isFinite(parsedRespawnAt) && parsedRespawnAt > Date.now()
        ? parsedRespawnAt
        : Date.now() + PVP_RESPAWN_MS;
    this.respawnLastSecond = -1;
    this.localDeathAnimStartAt = Date.now();
    this.localDeathAnimBlend = 0;
    this.leftMouseDown = false;
    this.rightMouseAiming = false;
    this.isAiming = false;
    this.handlePrimaryActionUp();

    const initialSeconds = Math.max(1, Math.ceil((this.respawnEndAt - Date.now()) / 1000));
    const message = `사망 - ${initialSeconds}초 후 부활합니다`;
    this.setRespawnBanner(message, true);
    this.hud.setStatus(message, true, 1.0);
  }

  updateRespawnCountdown() {
    if (!this.isRespawning) {
      this.setRespawnBanner("", false);
      return;
    }

    const remainingMs = this.respawnEndAt - Date.now();
    if (remainingMs <= 0) {
      if (this.respawnLastSecond !== 0) {
        this.respawnLastSecond = 0;
        this.setRespawnBanner("곧 부활합니다...", true);
        this.hud.setStatus("부활 중...", true, 0.5);
      }
      return;
    }

    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    if (seconds === this.respawnLastSecond) {
      return;
    }
    this.respawnLastSecond = seconds;
    const message = `사망 - ${seconds}초 후 부활합니다`;
    this.setRespawnBanner(message, true);
    this.hud.setStatus(message, true, 1.0);
  }

  handlePlayerRespawn(payload = {}) {
    if (this.activeMatchMode !== "online") {
      return;
    }

    const id = String(payload.id ?? "").trim();
    if (!id) {
      return;
    }

    const hpRaw = Number(payload.hp);
    const hp = Number.isFinite(hpRaw) ? Math.max(0, Math.min(100, Math.trunc(hpRaw))) : 100;
    const spawnShieldUntil = Number(payload.spawnShieldUntil);
    const state = payload?.state ?? null;
    const myId = this.getMySocketId();

    this.syncLobbyPlayerStateFromPayload(id, {
      state,
      hp,
      respawnAt: 0,
      spawnShieldUntil
    });

    if (id === myId) {
      this.state.health = hp;
      this.state.killStreak = 0;
      this.hud.setKillStreak(0);
      this.isRespawning = false;
      this.respawnEndAt = 0;
      this.respawnLastSecond = -1;
      this.localDeathAnimStartAt = 0;
      this.localDeathAnimBlend = 0;
      this.setRespawnBanner("", false);

      const x = Number(state?.x);
      const y = Number(state?.y);
      const z = Number(state?.z);
      const yaw = Number(state?.yaw);
      const pitch = Number(state?.pitch);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        const safeSpawn = this.findSafeSpawnPlacement(x, z, y);
        if (safeSpawn) {
          this.applySpawnPlacement(safeSpawn, {
            yaw: Number.isFinite(yaw) ? yaw : this.yaw,
            pitch: Number.isFinite(pitch) ? pitch : 0
          });
        } else {
          this.applySpawnPlacement(
            { x, y, z },
            {
              yaw: Number.isFinite(yaw) ? yaw : this.yaw,
              pitch: Number.isFinite(pitch) ? pitch : 0
            }
          );
        }
        if (this.isPlayerCollidingAt(this.playerPosition.x, this.playerPosition.y, this.playerPosition.z)) {
          this.setOnlineSpawnFromLobby();
        }
      } else {
        this.setOnlineSpawnFromLobby();
      }
      if (Number.isFinite(spawnShieldUntil) && spawnShieldUntil > Date.now()) {
        const shieldSeconds = Math.max(1, Math.ceil((spawnShieldUntil - Date.now()) / 1000));
        this.hud.setStatus(`부활 완료 - ${shieldSeconds}초 보호`, false, 1.1);
      } else {
        this.hud.setStatus("부활 완료", false, 0.8);
      }
      this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
      return;
    }

    const lobbyPlayer =
      this.lobbyState.players.find((player) => String(player?.id ?? "") === id) ?? {
        id,
        name: "PLAYER",
        team: null
      };
    const remote = this.ensureRemotePlayer(lobbyPlayer);
    if (remote && state) {
      this.applyRemoteState(remote, state, true);
      this.clearRemoteDowned(remote);
    }
  }

  isEnemyTeam(team) {
    const myTeam = this.getMyTeam();
    return Boolean(myTeam && team && team !== myTeam);
  }

  getTeamColor(team) {
    if (team === "alpha") {
      return 0x63b9ff;
    }
    if (team === "bravo") {
      return 0xff7d67;
    }
    return 0x88a3b8;
  }

  getTeamUniformColor(team) {
    if (team === "alpha") {
      return 0x3f6fae;
    }
    if (team === "bravo") {
      return 0xad4f44;
    }
    return 0x556148;
  }

  createRemoteWeaponModel(weaponId, detailMaterial, darkMaterial) {
    const id = sanitizeWeaponId(weaponId);
    const group = new THREE.Group();
    group.position.set(0.02, 1.28, -0.5);

    const makePart = (w, h, d, material, x, y, z) => {
      const mesh = new THREE.Mesh(this.getSharedRemoteBoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    if (id === "spas12") {
      group.add(
        makePart(0.12, 0.16, 0.76, detailMaterial, 0, 0, -0.02),
        makePart(0.06, 0.06, 0.54, detailMaterial, 0, 0.02, -0.58),
        makePart(0.05, 0.05, 0.52, darkMaterial, 0, -0.04, -0.46),
        makePart(0.12, 0.1, 0.24, darkMaterial, 0, -0.01, -0.34),
        makePart(0.1, 0.22, 0.16, darkMaterial, 0, -0.18, -0.02),
        makePart(0.08, 0.14, 0.36, darkMaterial, 0, -0.03, 0.34)
      );
      return group;
    }

    if (id === "awp") {
      group.add(
        makePart(0.1, 0.14, 0.86, detailMaterial, 0, 0, 0),
        makePart(0.045, 0.045, 0.72, detailMaterial, 0, 0.02, -0.8),
        makePart(0.07, 0.08, 0.42, darkMaterial, 0, 0.16, -0.2),
        makePart(0.08, 0.16, 0.34, darkMaterial, 0, -0.04, 0.44),
        makePart(0.08, 0.2, 0.12, detailMaterial, 0, -0.14, 0.02),
        makePart(0.09, 0.22, 0.12, darkMaterial, 0, -0.18, 0.18)
      );
      return group;
    }

    group.add(
      makePart(0.1, 0.14, 0.74, detailMaterial, 0, 0, 0),
      makePart(0.055, 0.055, 0.42, detailMaterial, 0, 0.02, -0.56),
      makePart(0.1, 0.26, 0.18, detailMaterial, 0, -0.18, -0.08),
      makePart(0.1, 0.18, 0.28, darkMaterial, 0, -0.04, 0.42),
      makePart(0.08, 0.04, 0.18, darkMaterial, 0, 0.08, -0.08)
    );
    return group;
  }

  createRemoteNameTag(name, team) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const safeName = String(name ?? "PLAYER").slice(0, 16);
    const teamLabel = formatTeamLabel(team);
    const displayName = `[${teamLabel}] ${safeName}`;

    if (ctx) {
      const teamColor = this.getTeamColor(team);
      const r = (teamColor >> 16) & 0xff;
      const g = (teamColor >> 8) & 0xff;
      const b = teamColor & 0xff;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(8, 14, 23, 0.72)";
      ctx.fillRect(12, 24, canvas.width - 24, 80);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 24, canvas.width - 24, 80);
      ctx.font = "700 46px Segoe UI, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(225, 242, 255, 0.98)";
      ctx.fillText(displayName, canvas.width * 0.5, canvas.height * 0.5 + 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.9, 0.72, 1);
    sprite.renderOrder = 6;
    return sprite;
  }

  getSharedRemoteBoxGeometry(width, height, depth) {
    const key = `${width}|${height}|${depth}`;
    const cached = this.remoteBoxGeometryCache.get(key);
    if (cached) {
      return cached;
    }
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.userData.sharedRemote = true;
    this.remoteBoxGeometryCache.set(key, geometry);
    return geometry;
  }

  createRemotePlayer(player = {}) {
    const team = player.team ?? null;
    const weaponId = sanitizeWeaponId(player.weaponId);
    const uniformColor = this.getTeamUniformColor(team);
    const patchColor = this.getTeamColor(team);
    const group = new THREE.Group();
    group.visible = false;

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: uniformColor,
      roughness: 0.58,
      metalness: 0.12
    });
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc29f,
      roughness: 0.6,
      metalness: 0.05
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b3013,
      roughness: 0.52,
      metalness: 0.12
    });
    const detailMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b2a38,
      roughness: 0.4,
      metalness: 0.56
    });
    const patchMaterial = new THREE.MeshStandardMaterial({
      color: patchColor,
      emissive: patchColor,
      emissiveIntensity: 0.34,
      roughness: 0.34,
      metalness: 0.28
    });

    const makePart = (w, h, d, material, x, y, z) => {
      const mesh = new THREE.Mesh(this.getSharedRemoteBoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    const legL = makePart(0.22, 0.78, 0.22, bodyMaterial, -0.17, 0.46, 0);
    const legR = makePart(0.22, 0.78, 0.22, bodyMaterial, 0.17, 0.46, 0);
    const shoeL = makePart(0.28, 0.14, 0.34, detailMaterial, -0.17, 0.1, 0.03);
    const shoeR = makePart(0.28, 0.14, 0.34, detailMaterial, 0.17, 0.1, 0.03);

    const torso = makePart(0.64, 0.9, 0.38, bodyMaterial, 0, 1.26, 0);
    const chestRig = makePart(0.56, 0.24, 0.4, darkMaterial, 0, 1.44, -0.06);
    const backpack = makePart(0.48, 0.66, 0.24, darkMaterial, 0, 1.28, 0.31);
    const shoulderPatchL = makePart(0.2, 0.14, 0.03, patchMaterial, -0.35, 1.58, -0.2);
    const shoulderPatchR = makePart(0.2, 0.14, 0.03, patchMaterial, 0.35, 1.58, -0.2);
    const chestPatch = makePart(0.34, 0.1, 0.03, patchMaterial, 0, 1.38, -0.22);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.95, 0);
    const head = makePart(0.36, 0.36, 0.36, headMaterial, 0, 0, 0);
    const helmet = makePart(0.42, 0.22, 0.42, darkMaterial, 0, 0.2, 0);
    const helmetBrim = makePart(0.46, 0.06, 0.48, darkMaterial, 0, 0.1, -0.03);
    const eyeL = makePart(0.055, 0.055, 0.055, detailMaterial, -0.09, 0.04, -0.19);
    eyeL.castShadow = false;
    const eyeR = makePart(0.055, 0.055, 0.055, detailMaterial, 0.09, 0.04, -0.19);
    eyeR.castShadow = false;
    headPivot.add(head, helmet, helmetBrim, eyeL, eyeR);

    const armR = makePart(0.18, 0.68, 0.18, bodyMaterial, 0.32, 1.47, -0.08);
    armR.rotation.x = -1.04;
    armR.rotation.z = -0.22;
    const armL = makePart(0.18, 0.68, 0.18, bodyMaterial, -0.28, 1.45, -0.02);
    armL.rotation.x = -0.9;
    armL.rotation.z = 0.18;

    const handR = makePart(0.14, 0.14, 0.14, headMaterial, 0.16, 1.14, -0.57);
    const handL = makePart(0.14, 0.14, 0.14, headMaterial, -0.14, 1.27, -0.46);

    const weaponAnchor = this.createRemoteWeaponModel(weaponId, detailMaterial, darkMaterial);

    const nameTag = this.createRemoteNameTag(player.name, team);
    nameTag.position.set(0, 2.72, 0);

    group.add(
      legL,
      legR,
      shoeL,
      shoeR,
      torso,
      chestRig,
      backpack,
      shoulderPatchL,
      shoulderPatchR,
      chestPatch,
      headPivot,
      armL,
      armR,
      handL,
      handR,
      weaponAnchor,
      nameTag
    );
    this.scene.add(group);

    return {
      id: String(player.id ?? ""),
      name: String(player.name ?? "PLAYER"),
      team,
      weaponId,
      group,
      nameTag,
      bodyMaterial,
      headMaterial,
      darkMaterial,
      detailMaterial,
      patchMaterial,
      shoulderPatchL,
      shoulderPatchR,
      chestPatch,
      backpack,
      torso,
      chestRig,
      backpackBaseY: backpack.position.y,
      headPivot,
      headPivotBaseY: headPivot.position.y,
      torsoBaseY: torso.position.y,
      chestRigBaseY: chestRig.position.y,
      armL,
      armR,
      armLBaseX: armL.rotation.x,
      armRBaseX: armR.rotation.x,
      armLBaseY: armL.position.y,
      armRBaseY: armR.position.y,
      handL,
      handR,
      handLBaseY: handL.position.y,
      handRBaseY: handR.position.y,
      weaponAnchor,
      legL,
      legR,
      legLBaseY: legL.position.y,
      legRBaseY: legR.position.y,
      shoeL,
      shoeR,
      shoeLBaseY: shoeL.position.y,
      shoeRBaseY: shoeR.position.y,
      targetPosition: new THREE.Vector3(),
      targetYaw: 0,
      yaw: 0,
      hasValidState: false,
      crouched: false,
      prevPosition: new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN),
      walkPhase: 0,
      isDowned: false,
      downedStartAt: 0,
      downedBlend: 0
    };
  }

  updateRemoteVisual(remote, { name, team, weaponId }) {
    const nextName = String(name ?? remote.name ?? "PLAYER");
    const nextTeam = team ?? null;
    const nextWeaponId = sanitizeWeaponId(weaponId ?? remote.weaponId);
    const teamChanged = remote.team !== nextTeam;
    const nameChanged = remote.name !== nextName;
    const weaponChanged = remote.weaponId !== nextWeaponId;
    if (!teamChanged && !nameChanged && !weaponChanged) {
      return;
    }

    remote.name = nextName;
    remote.team = nextTeam;
    remote.weaponId = nextWeaponId;
    const teamColor = this.getTeamColor(nextTeam);
    remote.bodyMaterial.color.setHex(this.getTeamUniformColor(nextTeam));
    remote.patchMaterial?.color?.setHex(teamColor);
    remote.patchMaterial?.emissive?.setHex(teamColor);
    if (weaponChanged) {
      if (remote.weaponAnchor) {
        remote.group.remove(remote.weaponAnchor);
      }
      remote.weaponAnchor = this.createRemoteWeaponModel(
        remote.weaponId,
        remote.detailMaterial,
        remote.darkMaterial
      );
      remote.group.add(remote.weaponAnchor);
    }

    if (remote.nameTag) {
      remote.group.remove(remote.nameTag);
      remote.nameTag.material.map?.dispose();
      remote.nameTag.material.dispose();
    }
    remote.nameTag = this.createRemoteNameTag(remote.name, remote.team);
    remote.nameTag.position.set(0, 2.72, 0);
    remote.group.add(remote.nameTag);
  }

  ensureRemotePlayer(player) {
    const id = String(player?.id ?? "");
    if (!id) {
      return null;
    }

    let remote = this.remotePlayers.get(id);
    if (!remote) {
      remote = this.createRemotePlayer(player);
      this.remotePlayers.set(id, remote);
    } else {
      this.updateRemoteVisual(remote, player);
    }
    return remote;
  }

  removeRemotePlayer(id) {
    const key = String(id ?? "");
    if (!key) {
      return;
    }

    const remote = this.remotePlayers.get(key);
    if (!remote) {
      return;
    }

    this.scene.remove(remote.group);
    remote.group.traverse((child) => {
      if (child.isMesh) {
        if (!child.geometry?.userData?.sharedRemote) {
          child.geometry?.dispose?.();
        }
      }
    });
    remote.nameTag?.material?.map?.dispose?.();
    remote.nameTag?.material?.dispose?.();
    remote.bodyMaterial.dispose();
    remote.headMaterial.dispose();
    remote.darkMaterial?.dispose?.();
    remote.detailMaterial.dispose();
    remote.patchMaterial?.dispose?.();
    this.remotePlayers.delete(key);
  }

  clearRemotePlayers() {
    for (const id of this.remotePlayers.keys()) {
      this.removeRemotePlayer(id);
    }
  }

  getSupportedPlayerY(
    x,
    z,
    referenceY = Number.NaN,
    { maxDrop = 4.5, maxRise = 1.25, fallbackToGlobalSurface = true, playerHeight = this.currentPlayerHeight ?? PLAYER_HEIGHT } = {}
  ) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return Number.NaN;
    }

    const feetY = Number.isFinite(referenceY) ? referenceY - playerHeight : Number.NaN;
    const minBlockY = Number.isFinite(feetY)
      ? Math.floor(feetY - Math.max(0.5, maxDrop))
      : -32;
    const maxBlockY = Number.isFinite(feetY)
      ? Math.ceil(feetY + Math.max(0.25, maxRise))
      : 48;
    let bestSupportY = Number.NaN;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let blockY = maxBlockY; blockY >= minBlockY; blockY -= 1) {
      if (!this.voxelWorld.hasBlockAtWorld(x, blockY, z)) {
        continue;
      }

      const candidateSupportY = blockY + 1 + playerHeight;
      if (Number.isFinite(referenceY)) {
        const offset = candidateSupportY - referenceY;
        if (offset < -maxDrop - 0.001 || offset > maxRise + 0.001) {
          continue;
        }
      }

      if (this.isPlayerCollidingAt(x, candidateSupportY, z)) {
        continue;
      }

      const distance = Number.isFinite(referenceY)
        ? Math.abs(candidateSupportY - referenceY)
        : Math.abs(candidateSupportY);
      if (
        distance < bestDistance - 0.0001 ||
        (Math.abs(distance - bestDistance) <= 0.0001 &&
          candidateSupportY < bestSupportY)
      ) {
        bestSupportY = candidateSupportY;
        bestDistance = distance;
      }
    }

    if (Number.isFinite(bestSupportY)) {
      return bestSupportY;
    }

    if (!fallbackToGlobalSurface) {
      return Number.NaN;
    }

    const surfaceY = this.voxelWorld.getSurfaceYAt(x, z);
    if (!Number.isFinite(surfaceY)) {
      return Number.NaN;
    }
    const fallbackSupportY = surfaceY + playerHeight;
    return this.isPlayerCollidingAt(x, fallbackSupportY, z, { playerHeight }) ? Number.NaN : fallbackSupportY;
  }

  syncLobbyPlayerStateFromPayload(id, patch = {}) {
    const key = String(id ?? "").trim();
    if (!key || !Array.isArray(this.lobbyState.players)) {
      return;
    }

    const lobbyPlayer = this.lobbyState.players.find((entry) => String(entry?.id ?? "") === key);
    if (!lobbyPlayer) {
      return;
    }

    if (patch.team !== undefined) {
      lobbyPlayer.team = patch.team ?? null;
    }
    if (patch.weaponId !== undefined) {
      lobbyPlayer.weaponId = sanitizeWeaponId(patch.weaponId);
    }
    if (patch.state !== undefined) {
      lobbyPlayer.state = patch.state ?? null;
    }
    if (patch.hp !== undefined) {
      lobbyPlayer.hp = Number(patch.hp ?? lobbyPlayer.hp ?? 100);
    }
    if (patch.respawnAt !== undefined) {
      lobbyPlayer.respawnAt = Number(patch.respawnAt ?? 0);
    }
    if (patch.spawnShieldUntil !== undefined) {
      lobbyPlayer.spawnShieldUntil = Number(patch.spawnShieldUntil ?? 0);
    }
  }

  applyRemoteState(remote, state, snap = false) {
    if (!remote || !state) {
      return;
    }
    if (this.isLobby3DActive() && !this.isRunning) {
      return;
    }

    const x = Number(state.x);
    const y = Number(state.y);
    const z = Number(state.z);
    const yaw = Number(state.yaw);
    const crouched = Boolean(state.crouched);
    const remotePlayerHeight = crouched ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return;
    }

    const supportedPlayerY = this.getSupportedPlayerY(x, z, y, {
      maxDrop: snap ? 5 : 2.25,
      maxRise: snap ? 1.4 : 0.7,
      fallbackToGlobalSurface: true,
      playerHeight: remotePlayerHeight
    });
    let resolvedY = y;
    if (Number.isFinite(supportedPlayerY)) {
      if (resolvedY < supportedPlayerY - 0.08) {
        resolvedY = supportedPlayerY;
      } else if (snap && resolvedY <= supportedPlayerY + 1.1) {
        resolvedY = supportedPlayerY;
      } else if (Math.abs(resolvedY - supportedPlayerY) <= 0.2) {
        resolvedY = supportedPlayerY;
      }
    }

    remote.targetPosition.set(x, resolvedY - remotePlayerHeight, z);
    remote.targetYaw = Number.isFinite(yaw) ? yaw : 0;
    remote.crouched = crouched;
    this.applyRemoteCrouchPose(remote, crouched);
    remote.hasValidState = true;
    remote.group.visible = true;

    const driftSq = remote.group.position.distanceToSquared(remote.targetPosition);
    if (snap || !Number.isFinite(remote.prevPosition.x) || driftSq >= 18 * 18) {
      remote.group.position.copy(remote.targetPosition);
      remote.yaw = remote.targetYaw;
      remote.group.rotation.y = remote.yaw;
      remote.prevPosition.copy(remote.group.position);
      remote.group.updateMatrixWorld(true);
    }
  }

  applyRemoteCrouchPose(remote, crouched = false) {
    if (!remote) {
      return;
    }
    const crouchBlend = crouched ? 1 : 0;
    if (remote.torso) {
      remote.torso.position.y = (remote.torsoBaseY ?? remote.torso.position.y) - 0.28 * crouchBlend;
    }
    if (remote.chestRig) {
      remote.chestRig.position.y = (remote.chestRigBaseY ?? remote.chestRig.position.y) - 0.24 * crouchBlend;
    }
    if (remote.backpack) {
      remote.backpack.position.y = (remote.backpackBaseY ?? remote.backpack.position.y) - 0.26 * crouchBlend;
    }
    if (remote.headPivot) {
      remote.headPivot.position.y = (remote.headPivotBaseY ?? remote.headPivot.position.y) - 0.36 * crouchBlend;
    }
    if (remote.armL) {
      remote.armL.position.y = (remote.armLBaseY ?? remote.armL.position.y) - 0.22 * crouchBlend;
    }
    if (remote.armR) {
      remote.armR.position.y = (remote.armRBaseY ?? remote.armR.position.y) - 0.22 * crouchBlend;
    }
    if (remote.handL) {
      remote.handL.position.y = (remote.handLBaseY ?? remote.handL.position.y) - 0.2 * crouchBlend;
    }
    if (remote.handR) {
      remote.handR.position.y = (remote.handRBaseY ?? remote.handR.position.y) - 0.2 * crouchBlend;
    }
    if (remote.legL) {
      remote.legL.position.y = (remote.legLBaseY ?? remote.legL.position.y) - 0.04 * crouchBlend;
      remote.legL.rotation.x = crouched ? -0.88 : 0;
    }
    if (remote.legR) {
      remote.legR.position.y = (remote.legRBaseY ?? remote.legR.position.y) - 0.04 * crouchBlend;
      remote.legR.rotation.x = crouched ? 0.88 : 0;
    }
    if (remote.shoeL) {
      remote.shoeL.position.y = (remote.shoeLBaseY ?? remote.shoeL.position.y) + 0.04 * crouchBlend;
    }
    if (remote.shoeR) {
      remote.shoeR.position.y = (remote.shoeRBaseY ?? remote.shoeR.position.y) + 0.04 * crouchBlend;
    }
    if (remote.nameTag) {
      remote.nameTag.position.y = crouched ? 2.36 : 2.72;
    }
  }

  setRemoteDowned(remote, respawnAtRaw = 0) {
    if (!remote) {
      return;
    }
    if (!remote.isDowned) {
      remote.downedStartAt = Date.now();
    }
    remote.isDowned = true;
    remote.downedBlend = Math.max(remote.downedBlend, 0.02);
    const respawnAt = Number(respawnAtRaw);
    if (Number.isFinite(respawnAt) && respawnAt > 0) {
      // Keep for potential future countdown UI per remote player.
      remote.respawnAt = Math.trunc(respawnAt);
    } else {
      remote.respawnAt = 0;
    }
  }

  clearRemoteDowned(remote) {
    if (!remote) {
      return;
    }
    remote.isDowned = false;
    remote.downedStartAt = 0;
    remote.downedBlend = 0;
    remote.respawnAt = 0;
    if (remote.group) {
      remote.group.rotation.z = 0;
    }
    this.applyRemoteCrouchPose(remote, remote.crouched);
    if (remote.shoeL && remote.shoeR) {
      remote.shoeL.rotation.x = 0;
      remote.shoeR.rotation.x = 0;
    }
    if (remote.armL && remote.armR) {
      remote.armL.rotation.x = Number.isFinite(remote.armLBaseX) ? remote.armLBaseX : -1.02;
      remote.armR.rotation.x = Number.isFinite(remote.armRBaseX) ? remote.armRBaseX : -0.96;
    }
    if (remote.handL && remote.handR) {
      remote.handL.rotation.x = 0;
      remote.handR.rotation.x = 0;
    }
  }

  getLobbyRemotePreviewTransform(index = 0) {
    const safeIndex = Math.max(0, Math.trunc(index));
    let remaining = safeIndex;
    let ring = 0;
    let slots = LOBBY3D_REMOTE_RING_BASE_SLOTS;
    while (remaining >= slots) {
      remaining -= slots;
      ring += 1;
      slots += 2;
    }

    const angle = (Math.PI * 2 * remaining) / Math.max(1, slots) + ring * 0.28;
    const radius = LOBBY3D_REMOTE_RING_BASE_RADIUS + ring * LOBBY3D_REMOTE_RING_STEP_RADIUS;
    const x = this.lobby3d.centerX + Math.cos(angle) * radius;
    const z = this.lobby3d.centerZ + Math.sin(angle) * radius;
    const y = this.lobby3d.floorY + PLAYER_HEIGHT + 0.92 + ring * 0.06;
    const yaw = Math.atan2(this.lobby3d.centerX - x, this.lobby3d.centerZ - z);

    return { x, y, z, yaw };
  }

  applyLobbyRemotePreviewTargets() {
    if (!this.isLobby3DActive()) {
      return;
    }

    const myId = this.getMySocketId();
    const players = Array.isArray(this.lobbyState.players) ? this.lobbyState.players : [];
    const remoteIds = [];
    for (const player of players) {
      const id = String(player?.id ?? "");
      if (!id || id === myId) {
        continue;
      }
      if (!this.remotePlayers.has(id)) {
        continue;
      }
      remoteIds.push(id);
    }

    const signature = remoteIds.join("|");
    if (signature === this.lobby3d.remotePreviewSignature) {
      return;
    }
    this.lobby3d.remotePreviewSignature = signature;

    let previewIndex = 0;
    for (const id of remoteIds) {
      const remote = this.remotePlayers.get(id);
      if (!remote) {
        continue;
      }
      const pose = this.getLobbyRemotePreviewTransform(previewIndex);
      remote.hasValidState = true;
      remote.group.visible = true;
      remote.targetPosition.set(pose.x, pose.y - PLAYER_HEIGHT, pose.z);
      remote.targetYaw = pose.yaw;
      this.clearRemoteDowned(remote);
      previewIndex += 1;
    }
  }

  syncRemotePlayersFromLobby() {
    if (this.activeMatchMode !== "online") {
      this.clearRemotePlayers();
      return;
    }

    const myId = this.getMySocketId();
    const players = Array.isArray(this.lobbyState.players) ? this.lobbyState.players : [];
    const liveIds = new Set();

    for (const player of players) {
      const id = String(player?.id ?? "");
      if (!id || id === myId) {
        continue;
      }

      liveIds.add(id);
      const hadRemote = this.remotePlayers.has(id);
      const remote = this.ensureRemotePlayer(player);
      if (!remote) {
        continue;
      }
      if (player.state) {
        this.applyRemoteState(remote, player.state, !hadRemote);
      } else if (!this.isLobby3DActive()) {
        remote.hasValidState = false;
        remote.group.visible = false;
      }
      const hp = Number(player?.hp);
      if (Number.isFinite(hp) && hp <= 0) {
        this.setRemoteDowned(remote, player?.respawnAt ?? 0);
      } else {
        this.clearRemoteDowned(remote);
      }
    }

    for (const id of this.remotePlayers.keys()) {
      if (!liveIds.has(id)) {
        this.removeRemotePlayer(id);
      }
    }
  }

  handleRemotePlayerSync(payload = {}) {
    const id = String(payload.id ?? "");
    if (!id || id === this.getMySocketId()) {
      return;
    }

    this.syncLobbyPlayerStateFromPayload(id, {
      team: payload.team ?? null,
      weaponId: payload.weaponId ?? null,
      state: payload.state ?? null
    });

    const remote = this.ensureRemotePlayer({
      id,
      name: payload.name ?? "PLAYER",
      team: payload.team ?? null,
      weaponId: payload.weaponId ?? null
    });
    if (!remote) {
      return;
    }

    this.applyRemoteState(remote, payload.state, false);
  }

  updateRemotePlayers(delta) {
    if (this.activeMatchMode !== "online") {
      return;
    }
    if (this.remotePlayers.size === 0) {
      this.syncOnlineFlagMeshes();
      return;
    }
    const lobbyPreviewActive = this.isLobby3DActive() && !this.isRunning;
    if (lobbyPreviewActive) {
      this.applyLobbyRemotePreviewTargets();
    }

    let effectiveDelta = Math.max(0, Number(delta) || 0);
    if (lobbyPreviewActive) {
      this.lobbyRemotePreviewAccumulator += effectiveDelta;
      if (this.lobbyRemotePreviewAccumulator < LOBBY_REMOTE_PREVIEW_STEP) {
        this.syncOnlineFlagMeshes();
        return;
      }
      effectiveDelta = this.lobbyRemotePreviewAccumulator;
      this.lobbyRemotePreviewAccumulator = 0;
    } else {
      this.lobbyRemotePreviewAccumulator = 0;
    }

    const smooth = THREE.MathUtils.clamp(effectiveDelta * 11, 0.08, 0.92);

    for (const remote of this.remotePlayers.values()) {
      if (!remote.hasValidState) {
        remote.group.visible = false;
        continue;
      }
      remote.group.visible = true;
      if (!Number.isFinite(remote.prevPosition.x)) {
        remote.prevPosition.copy(remote.group.position);
      }
      const prevX = remote.group.position.x;
      const prevZ = remote.group.position.z;
      remote.group.position.lerp(remote.targetPosition, smooth);
      const yawDiff = Math.atan2(
        Math.sin(remote.targetYaw - remote.yaw),
        Math.cos(remote.targetYaw - remote.yaw)
      );
      remote.yaw += yawDiff * smooth;
      remote.group.rotation.y = remote.yaw;
      remote.group.rotation.x = 0;
      if (lobbyPreviewActive) {
        remote.group.rotation.z = 0;
        remote.prevPosition.set(remote.group.position.x, remote.group.position.y, remote.group.position.z);
        if (remote.nameTag) {
          remote.nameTag.visible = true;
        }
        continue;
      }

      if (remote.isDowned) {
        const elapsed = Math.max(0, Date.now() - remote.downedStartAt);
        const t = THREE.MathUtils.clamp(elapsed / REMOTE_DEATH_FALL_MS, 0, 1);
        remote.downedBlend = Math.max(remote.downedBlend, t);
      } else if (remote.downedBlend > 0) {
        remote.downedBlend = Math.max(0, remote.downedBlend - effectiveDelta * 4.8);
      }

      if (remote.downedBlend > 0) {
        remote.group.position.y -= REMOTE_DEATH_OFFSET_Y * remote.downedBlend;
      }
      remote.group.rotation.z = REMOTE_DEATH_ROLL * remote.downedBlend;

      const moveSpeed =
        Math.hypot(remote.group.position.x - prevX, remote.group.position.z - prevZ) /
        Math.max(effectiveDelta, 1e-5);
      const moveRatio = THREE.MathUtils.clamp(moveSpeed / PLAYER_SPRINT, 0, 1);
      if (remote.isDowned || remote.downedBlend > 0.2) {
        remote.walkPhase = 0;
      } else {
        remote.walkPhase += effectiveDelta * (6 + moveRatio * 8);
      }
      const swing = Math.sin(remote.walkPhase) * 0.55 * moveRatio;
      const crouchBlend = remote.crouched ? 1 : 0;
      if (remote.legL && remote.legR) {
        const crouchLegBase = 0.88 * crouchBlend;
        remote.legL.rotation.x = crouchLegBase + swing * (1 - crouchBlend * 0.7);
        remote.legR.rotation.x = -crouchLegBase - swing * (1 - crouchBlend * 0.7);
      }
      if (remote.shoeL && remote.shoeR) {
        remote.shoeL.rotation.x = swing * 0.45;
        remote.shoeR.rotation.x = -swing * 0.45;
      }
      if (remote.armL && remote.armR) {
        const armSwing = swing * 0.2;
        remote.armL.rotation.x = (remote.armLBaseX ?? -1.02) + armSwing;
        remote.armR.rotation.x = (remote.armRBaseX ?? -0.96) - armSwing;
      }
      if (remote.handL && remote.handR) {
        remote.handL.rotation.x = swing * 0.1;
        remote.handR.rotation.x = -swing * 0.1;
      }
      if (remote.headPivot) {
        const breath = Math.sin(remote.walkPhase * 0.5 + remote.yaw) * 0.018;
        const baseY = remote.headPivotBaseY ?? remote.headPivot.position.y;
        remote.headPivot.position.y =
          baseY - 0.36 * crouchBlend + breath * (0.55 + moveRatio * 0.45);
      }
      if (remote.backpack) {
        const breath = Math.sin(remote.walkPhase * 0.5 + remote.yaw + 0.3) * 0.012;
        const baseY = remote.backpackBaseY ?? remote.backpack.position.y;
        remote.backpack.position.y =
          baseY - 0.26 * crouchBlend + breath * (0.5 + moveRatio * 0.4);
      }
      remote.prevPosition.set(remote.group.position.x, remote.group.position.y, remote.group.position.z);

      this._remoteHead.copy(remote.group.position);
      this._remoteHead.y += (remote.crouched ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT) + 0.72;
      this._toRemote.copy(this._remoteHead).sub(this.camera.position);
      const distance = this._toRemote.length();

      if (remote.nameTag) {
        const hideEnemyName = !lobbyPreviewActive && this.isEnemyTeam(remote.team);
        const hideForDeath = remote.isDowned || remote.downedBlend > 0.2;
        remote.nameTag.visible =
          !hideForDeath && !hideEnemyName && distance <= REMOTE_NAME_TAG_DISTANCE;
      }
    }

    if (this.activeMatchMode === "online") {
      this.syncOnlineFlagMeshes();
    }
  }

  setSingleSpawnFromTraining() {
    if (this.activeMatchMode !== "single") {
      return;
    }

    const anchorX = Number.isFinite(this.objective?.trainingSpawn?.x)
      ? this.objective.trainingSpawn.x
      : Number.isFinite(this.objective?.alphaBase?.x)
        ? this.objective.alphaBase.x
        : 0;
    const anchorZ = Number.isFinite(this.objective?.trainingSpawn?.z)
      ? this.objective.trainingSpawn.z
      : Number.isFinite(this.objective?.alphaBase?.z)
        ? this.objective.alphaBase.z
        : 0;

    const fallbackY = (this.voxelWorld.getSurfaceYAt(anchorX, anchorZ) ?? 0) + PLAYER_HEIGHT;
    const spawnPoint = this.findSafeSpawnPlacement(anchorX, anchorZ, fallbackY) ?? {
      x: anchorX,
      y: fallbackY,
      z: anchorZ
    };

    const lookTarget = this.objective?.controlPoint ?? this.objective?.bravoBase;
    this.applySpawnPlacement(spawnPoint, {
      yaw: lookTarget ? Math.atan2(lookTarget.x - spawnPoint.x, lookTarget.z - spawnPoint.z) : 0,
      pitch: 0
    });
  }

  setOnlineSpawnFromLobby() {
    if (this.activeMatchMode !== "online") {
      return;
    }

    const myId = this.getMySocketId();
    const players = Array.isArray(this.lobbyState.players) ? this.lobbyState.players : [];
    const me = players.find((player) => String(player?.id ?? "") === myId) ?? null;
    const team = me?.team ?? null;

    let seed = 0;
    for (const ch of String(myId || "offline")) {
      seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    }

    let anchorX = 0;
    let anchorZ = 0;
    let faceYaw = 0;

    if (team === "alpha") {
      anchorX = this.objective.alphaBase.x;
      anchorZ = this.objective.alphaBase.z;
      faceYaw = Math.PI * 0.5;
    } else if (team === "bravo") {
      anchorX = this.objective.bravoBase.x;
      anchorZ = this.objective.bravoBase.z;
      faceYaw = -Math.PI * 0.5;
    } else {
      const leftSide = (seed & 1) === 0;
      anchorX = leftSide ? this.objective.alphaBase.x + 4 : this.objective.bravoBase.x - 4;
      anchorZ = 0;
      faceYaw = leftSide ? Math.PI * 0.4 : -Math.PI * 0.4;
    }

    let spawnPoint = null;
    const randomStart = Math.floor(Math.random() * ONLINE_TEAM_SPAWN_OFFSETS.length);
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < ONLINE_TEAM_SPAWN_OFFSETS.length; i += 1) {
        const [offsetX, offsetZ] =
          ONLINE_TEAM_SPAWN_OFFSETS[(randomStart + i) % ONLINE_TEAM_SPAWN_OFFSETS.length];
        const jitter = pass === 0 ? 0.22 : 0;
        const tryX = anchorX + offsetX + (Math.random() - 0.5) * jitter;
        const tryZ = anchorZ + offsetZ + (Math.random() - 0.5) * jitter;
        spawnPoint = this.findSafeSpawnPlacement(tryX, tryZ);
        if (spawnPoint) {
          break;
        }
      }
      if (spawnPoint) {
        break;
      }
    }

    if (!spawnPoint) {
      const fallbackY = (this.voxelWorld.getSurfaceYAt(anchorX, anchorZ) ?? 0) + PLAYER_HEIGHT;
      spawnPoint = this.findSafeSpawnPlacement(anchorX, anchorZ, fallbackY) ?? {
        x: anchorX,
        y: fallbackY,
        z: anchorZ
      };
    }

    this.applySpawnPlacement(spawnPoint, { yaw: faceYaw, pitch: 0 });
  }

  findSafeSpawnPlacement(originX, originZ, preferredY = Number.NaN) {
    if (!Number.isFinite(originX) || !Number.isFinite(originZ)) {
      return null;
    }

    const offsets = [
      [0, 0],
      [0.42, 0],
      [-0.42, 0],
      [0, 0.42],
      [0, -0.42],
      [0.35, 0.35],
      [0.35, -0.35],
      [-0.35, 0.35],
      [-0.35, -0.35],
      [1.2, 0],
      [-1.2, 0],
      [0, 1.2],
      [0, -1.2],
      [2.2, 0],
      [-2.2, 0],
      [0, 2.2],
      [0, -2.2]
    ];
    const supportedOriginY = this.getSupportedPlayerY(originX, originZ, preferredY, {
      maxDrop: 5,
      maxRise: 1.4,
      fallbackToGlobalSurface: true
    });
    const baseY = Number.isFinite(supportedOriginY)
      ? supportedOriginY
      : Number.isFinite(preferredY)
        ? preferredY
        : PLAYER_HEIGHT;
    const verticalOffsets = [0, 0.12, 0.24, 0.4, 0.62, 0.86, 1.1];

    for (const [offsetX, offsetZ] of offsets) {
      const x = originX + offsetX;
      const z = originZ + offsetZ;
      const supportedPlayerY = this.getSupportedPlayerY(x, z, preferredY, {
        maxDrop: 5,
        maxRise: 1.4,
        fallbackToGlobalSurface: true
      });
      const candidateBaseY = Number.isFinite(supportedPlayerY) ? supportedPlayerY : baseY;
      const baseCandidates = [candidateBaseY];
      if (
        Number.isFinite(preferredY) &&
        Math.abs(preferredY - candidateBaseY) > 0.18
      ) {
        baseCandidates.push(preferredY);
      }

      for (const baseCandidate of baseCandidates) {
        for (const lift of verticalOffsets) {
          const y = baseCandidate + lift;
          if (!this.isPlayerCollidingAt(x, y, z)) {
            return {
              x,
              y,
              z
            };
          }
        }
      }
    }

    return null;
  }

  applySpawnPlacement(spawnPoint, { yaw = 0, pitch = 0 } = {}) {
    if (!spawnPoint) {
      return;
    }

    const x = Number(spawnPoint.x);
    const z = Number(spawnPoint.z);
    let y = Number(spawnPoint.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return;
    }

    let groundedY = this.getSupportedPlayerY(x, z, y, {
      maxDrop: 6,
      maxRise: 1.5,
      fallbackToGlobalSurface: true
    });
    if (Number.isFinite(groundedY) && y < groundedY - 0.08) {
      y = groundedY;
    } else if (
      Number.isFinite(groundedY) &&
      Math.abs(y - groundedY) <= 1.25 &&
      !this.isPlayerCollidingAt(x, groundedY, z)
    ) {
      y = groundedY;
    }

    if (this.isPlayerCollidingAt(x, y, z)) {
      const emergencySpawn = this.findSafeSpawnPlacement(x, z, Number.isFinite(groundedY) ? groundedY : y);
      if (emergencySpawn) {
        y = Number(emergencySpawn.y);
        groundedY = this.getSupportedPlayerY(x, z, y, {
          maxDrop: 6,
          maxRise: 1.5,
          fallbackToGlobalSurface: true
        });
      }
    }

    this.handlePrimaryActionUp();
    this.pendingMouseLookX = 0;
    this.pendingMouseLookY = 0;
    this.unlockedLookLastClientX = null;
    this.unlockedLookLastClientY = null;
    this.rightMouseAiming = false;
    if (!this.mobileEnabled) {
      this.isAiming = false;
    }

    this.playerPosition.set(x, y, z);
    this.verticalVelocity = 0;
    this.onGround = Number.isFinite(groundedY) && Math.abs(y - groundedY) <= 0.08;
    this.fallStartY = this.playerPosition.y;
    this.yaw = Number.isFinite(yaw) ? yaw : 0;
    this.pitch = Number.isFinite(pitch) ? THREE.MathUtils.clamp(pitch, -1.45, 1.45) : 0;
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.syncCursorVisibility();
  }

  emitLocalPlayerSync(delta, force = false) {
    if (this.activeMatchMode !== "online" || !this.isRunning || this.isGameOver) {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      return;
    }

    this.remoteSyncClock += delta;
    if (!force && this.remoteSyncClock < REMOTE_SYNC_INTERVAL) {
      return;
    }
    this.remoteSyncClock = 0;

    socket.emit("player:sync", {
      x: Number(this.playerPosition.x.toFixed(3)),
      y: Number(this.playerPosition.y.toFixed(3)),
      z: Number(this.playerPosition.z.toFixed(3)),
      yaw: Number(this.yaw.toFixed(4)),
      pitch: Number(this.pitch.toFixed(4)),
      crouched: this.isCrouching
    });
  }

  findOnlineShotTarget(maxDistance, raycaster = this.raycaster) {
    if (this.activeMatchMode !== "online" || this.remotePlayers.size === 0) {
      return null;
    }

    const myTeam = this.getMyTeam();
    if (!myTeam) {
      return null;
    }

    let best = null;
    let bestDistance = Number.isFinite(maxDistance) ? maxDistance : Infinity;

    for (const remote of this.remotePlayers.values()) {
      if (remote.isDowned || remote.downedBlend > 0.65) {
        continue;
      }
      if (!this.isEnemyTeam(remote.team)) {
        continue;
      }

      const base = remote.group.position;
      const bodyTopOffset = remote.crouched ? PVP_REMOTE_CROUCH_BODY_TOP_OFFSET : PVP_REMOTE_BODY_TOP_OFFSET;
      const headMinOffset = remote.crouched ? PVP_REMOTE_CROUCH_HEAD_MIN_OFFSET : PVP_REMOTE_HEAD_MIN_OFFSET;
      const headMaxOffset = remote.crouched ? PVP_REMOTE_CROUCH_HEAD_MAX_OFFSET : PVP_REMOTE_HEAD_MAX_OFFSET;
      let candidate = null;

      this._pvpBoxMin.set(
        base.x - PVP_REMOTE_HEAD_HALF_WIDTH,
        base.y + headMinOffset,
        base.z - PVP_REMOTE_HEAD_HALF_WIDTH
      );
      this._pvpBoxMax.set(
        base.x + PVP_REMOTE_HEAD_HALF_WIDTH,
        base.y + headMaxOffset,
        base.z + PVP_REMOTE_HEAD_HALF_WIDTH
      );
      this._pvpBox.set(this._pvpBoxMin, this._pvpBoxMax);
      const headHitPoint = raycaster.ray.intersectBox(this._pvpBox, this._pvpHeadHitPoint);
      if (headHitPoint && this.voxelWorld.hasLineOfSight(this.camera.position, headHitPoint, 0.16)) {
        candidate = {
          id: remote.id,
          distance: headHitPoint.distanceTo(this.camera.position),
          point: headHitPoint.clone(),
          hitZone: "head"
        };
      } else {
        this._pvpBoxMin.set(
          base.x - PVP_REMOTE_HITBOX_HALF_WIDTH,
          base.y + PVP_REMOTE_HITBOX_FOOT_OFFSET,
          base.z - PVP_REMOTE_HITBOX_HALF_WIDTH
        );
        this._pvpBoxMax.set(
          base.x + PVP_REMOTE_HITBOX_HALF_WIDTH,
          base.y + bodyTopOffset,
          base.z + PVP_REMOTE_HITBOX_HALF_WIDTH
        );
        this._pvpBox.set(this._pvpBoxMin, this._pvpBoxMax);
        const bodyHitPoint = raycaster.ray.intersectBox(this._pvpBox, this._pvpBodyHitPoint);
        if (bodyHitPoint && this.voxelWorld.hasLineOfSight(this.camera.position, bodyHitPoint, 0.16)) {
          candidate = {
            id: remote.id,
            distance: bodyHitPoint.distanceTo(this.camera.position),
            point: bodyHitPoint.clone(),
            hitZone: "body"
          };
        }
      }

      if (!candidate || candidate.distance > bestDistance) {
        continue;
      }

      bestDistance = candidate.distance;
      best = candidate;
    }

    return best;
  }

  emitPvpShot(targetId, damage = null) {
    if (!targetId || this.activeMatchMode !== "online") {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      return;
    }

    const payload = { targetId };
    const parsedDamage = Math.trunc(Number(damage));
    if (Number.isFinite(parsedDamage) && parsedDamage > 0) {
      payload.damage = parsedDamage;
    }
    socket.emit("pvp:shoot", payload);
  }

  handlePvpImmune(payload = {}) {
    if (this.activeMatchMode !== "online" || !this.isRunning || this.isGameOver) {
      return;
    }

    const targetId = String(payload?.targetId ?? "");
    if (!targetId) {
      return;
    }

    const now = Date.now();
    if (now < this.pvpImmuneHintUntil) {
      return;
    }
    this.pvpImmuneHintUntil = now + PVP_IMMUNE_HINT_COOLDOWN_MS;
    this.hud.setStatus("대상이 리스폰 보호 중입니다.", true, 0.55);
  }

  handlePvpDamage(payload = {}) {
    if (this.activeMatchMode !== "online") {
      return;
    }

    const attackerId = String(payload.attackerId ?? "");
    const victimId = String(payload.victimId ?? "");
    const damage = Math.max(0, Number(payload.damage ?? 0));
    const killed = Boolean(payload.killed);
    const victimHealth = Number(payload.victimHealth);
    const respawnAt = Number(payload.respawnAt);
    const hazardReason = String(payload.hazardReason ?? "").trim();
    const attackerStreak = Math.max(0, Math.trunc(Number(payload.attackerStreak) || 0));
    const victimStreakLost = Math.max(0, Math.trunc(Number(payload.victimStreakLost) || 0));
    const myId = this.getMySocketId();
    const teamScore = payload?.teamScore ?? null;
    const teamCaptures = payload?.teamCaptures ?? null;
    let lobbyChanged = false;

    if (!myId) {
      return;
    }

    const updateLobbyPlayer = (playerId, updater) => {
      const id = String(playerId ?? "").trim();
      if (!id) {
        return;
      }
      const player = this.lobbyState.players.find((entry) => String(entry?.id ?? "") === id);
      if (!player) {
        return;
      }
      updater(player);
      lobbyChanged = true;
    };

    if (teamScore) {
      const alpha = Number(teamScore.alpha);
      const bravo = Number(teamScore.bravo);
      if (Number.isFinite(alpha)) {
        this.onlineCtf.score.alpha = Math.trunc(alpha);
      }
      if (Number.isFinite(bravo)) {
        this.onlineCtf.score.bravo = Math.trunc(bravo);
      }
    }

    if (teamCaptures) {
      const alpha = Number(teamCaptures.alpha);
      const bravo = Number(teamCaptures.bravo);
      if (Number.isFinite(alpha)) {
        this.onlineCtf.captures.alpha = Math.trunc(alpha);
      }
      if (Number.isFinite(bravo)) {
        this.onlineCtf.captures.bravo = Math.trunc(bravo);
      }
    }

    const attackerKills = Number(payload.attackerKills);
    if (Number.isFinite(attackerKills)) {
      updateLobbyPlayer(attackerId, (player) => {
        player.kills = Math.max(0, Math.trunc(attackerKills));
      });
    }

    if (attackerId && Number.isFinite(attackerStreak)) {
      updateLobbyPlayer(attackerId, (player) => {
        player.killStreak = Math.max(0, Math.trunc(attackerStreak));
      });
    }

    const victimDeaths = Number(payload.victimDeaths);
    if (Number.isFinite(victimDeaths)) {
      updateLobbyPlayer(victimId, (player) => {
        player.deaths = Math.max(0, Math.trunc(victimDeaths));
      });
    }

    updateLobbyPlayer(victimId, (player) => {
      if (killed) {
        player.hp = 0;
        player.respawnAt = Number.isFinite(respawnAt) ? Math.max(0, Math.trunc(respawnAt)) : 0;
        player.killStreak = 0;
        return;
      }

      if (Number.isFinite(victimHealth)) {
        const nextHp = Math.max(0, Math.min(100, Math.trunc(victimHealth)));
        const currentHp = Number.isFinite(player.hp) ? Math.trunc(player.hp) : nextHp;
        player.hp = Math.min(currentHp, nextHp);
      }
      player.respawnAt = 0;
    });

    if (victimId && victimId !== myId) {
      const remoteVictim = this.remotePlayers.get(victimId);
      if (remoteVictim) {
        if (killed) {
          this.setRemoteDowned(remoteVictim, respawnAt);
        } else if (Number.isFinite(victimHealth) && victimHealth > 0) {
          this.clearRemoteDowned(remoteVictim);
        }
      }
    }

    if (attackerId === myId) {
      if (killed) {
        this.state.kills += 1;
        this.state.score += PVP_KILL_SCORE;
        this.hud.pulseHitmarker();
        this.hud.setStatus(`+${PVP_KILL_SCORE} 처치`, false, 0.55);

        this.state.killStreak = Math.max(1, attackerStreak || 1);
        this.state.lastKillTime = this.clock.getElapsedTime();
        this.hud.setKillStreak(this.state.killStreak);
      } else if (damage > 0) {
        this.state.score += PVP_HIT_SCORE;
        this.hud.pulseHitmarker();
      }
    }

    if (victimId === myId) {
      this.hud.flashDamage();

      if (killed) {
        this.state.health = 0;
        this.state.killStreak = 0;
        this.hud.setKillStreak(0);
        this.beginRespawnCountdown(respawnAt);
      } else {
        const fallbackHealth = Math.max(0, this.state.health - damage);
        const nextHealth = Number.isFinite(victimHealth) ? victimHealth : fallbackHealth;
        const clampedServerHealth = Math.max(0, Math.min(100, nextHealth));
        // Never allow local health to increase on damage packets.
        this.state.health = Math.min(this.state.health, clampedServerHealth);
        if (hazardReason === "fall") {
          this.hud.setStatus(`낙하 피해 -${damage}`, true, 0.45);
        } else if (hazardReason === "void") {
          this.hud.setStatus("낙사 피해", true, 0.7);
        } else {
          this.hud.setStatus(`피해 -${damage}`, true, 0.35);
        }
      }
    }

    if (killed) {
      const attackerName = attackerId ? this.getPlayerNameById(attackerId) : "환경";
      const victimName = victimId ? this.getPlayerNameById(victimId) : "플레이어";

      if (attackerId === myId) {
        this.addChatMessage(`${victimName} 처치`, "kill");
        if (attackerStreak >= 3) {
          this.announceGameplayEvent(`${attackerStreak}연속 처치`, {
            alert: false,
            duration: 2.1,
            statusText: `${victimName} 처치. ${attackerStreak}연속 처치 중`,
            logText: `${attackerStreak}연속 처치`,
            statusDuration: 0.75
          });
        }
        if (victimStreakLost >= 3) {
          this.chat?.addSystemMessage(`${victimName}의 ${victimStreakLost}연속 처치를 끊었습니다`, "system");
        }
      } else if (victimId === myId) {
        const deathText =
          hazardReason === "fall" || hazardReason === "void"
            ? "환경 피해로 쓰러졌습니다"
            : `${attackerName}에게 처치당했습니다`;
        this.announceGameplayEvent(deathText, {
          alert: true,
          duration: 2.1,
          statusDuration: 0.72
        });
        if (attackerStreak >= 3 && attackerId) {
          this.announceGameplayEvent(`${attackerName} ${attackerStreak}연속 처치`, {
            alert: true,
            duration: 2.5,
            statusText: `${attackerName}이(가) ${attackerStreak}연속 처치 중입니다`,
            logText: `${attackerName}이(가) ${attackerStreak}연속 처치 중입니다`,
            statusDuration: 0.85
          });
        }
      } else if (attackerStreak >= 3 && attackerId) {
        this.announceGameplayEvent(`${attackerName} ${attackerStreak}연속 처치`, {
          alert: false,
          duration: 1.9,
          statusText: `${attackerName}이(가) ${victimName} 처치`,
          logText: `${attackerName}이(가) ${attackerStreak}연속 처치 중입니다`,
          statusDuration: 0.7
        });
      } else if (victimStreakLost >= 3 && attackerId) {
        this.chat?.addSystemMessage(
          `${attackerName}이(가) ${victimName}의 ${victimStreakLost}연속 처치를 저지했습니다`,
          "system"
        );
      }
    }

    if (lobbyChanged && this.tabBoardVisible) {
      this.renderTabScoreboard();
    }
  }

  computeFallDamage(dropHeight) {
    const drop = Number(dropHeight);
    if (!Number.isFinite(drop) || drop <= FALL_DAMAGE_SAFE_DROP) {
      return 0;
    }
    const overflow = drop - FALL_DAMAGE_SAFE_DROP;
    return Math.max(
      1,
      Math.min(FALL_DAMAGE_MAX, Math.round(overflow * FALL_DAMAGE_PER_BLOCK))
    );
  }

  applyLocalHazardDamage(damage, reason = "hazard") {
    const amount = Math.max(0, Math.trunc(Number(damage) || 0));
    if (
      amount <= 0 ||
      !this.isRunning ||
      this.isGameOver ||
      this.isRespawning ||
      this.activeMatchMode === "online"
    ) {
      return false;
    }

    this.state.health = Math.max(0, this.state.health - amount);
    this.hud.flashDamage();
    if (reason === "void") {
      this.hud.setStatus("맵 아래로 추락했습니다", true, 0.85);
      this.addChatMessage("낙사!", "warning");
    } else if (reason === "fall") {
      this.hud.setStatus(`낙하 피해 -${amount}`, true, 0.45);
    } else {
      this.hud.setStatus(`피해 -${amount}`, true, 0.35);
    }
    return true;
  }

  reportHazardDamage(damage, reason = "hazard") {
    const amount = Math.max(0, Math.trunc(Number(damage) || 0));
    if (amount <= 0 || !this.isRunning || this.isGameOver || this.isRespawning) {
      return;
    }

    if (this.activeMatchMode !== "online") {
      this.applyLocalHazardDamage(amount, reason);
      return;
    }

    const now = Date.now();
    if (now - this.lastHazardEmitAt < HAZARD_EMIT_COOLDOWN_MS) {
      return;
    }
    this.lastHazardEmitAt = now;

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      return;
    }

    socket.emit("player:hazard", { damage: amount, reason });
  }

  rollbackLocalBlockUpdate(payload, previousEntry) {
    const key = toBlockKey(payload.x, payload.y, payload.z);
    this.setDynamicBlockEntry(key, previousEntry);

    if (payload.action === "place") {
      this.voxelWorld.removeBlock(payload.x, payload.y, payload.z);
      return;
    }

    const rollbackTypeId = Number(previousEntry?.typeId ?? payload.typeId);
    if (
      Number.isFinite(rollbackTypeId) &&
      !this.isPlayerIntersectingBlock(payload.x, payload.y, payload.z)
    ) {
      this.voxelWorld.setBlock(payload.x, payload.y, payload.z, Math.trunc(rollbackTypeId));
    }
  }

  syncLocalBlockUpdateToServer(payload, previousEntry, { onSuccess = null } = {}) {
    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      return false;
    }

    socket.emit("block:update", payload, (response = {}) => {
      this.applyInventorySnapshot(response?.stock, { quiet: true });
      if (response?.ok === true) {
        onSuccess?.(response);
        return;
      }

      this.rollbackLocalBlockUpdate(payload, previousEntry);
      const text = String(response?.error ?? "블록 동기화에 실패했습니다.");
      this.hud.setStatus(text, true, 0.9);
    });
    return true;
  }

  isCollapseAnchorBlock(block) {
    if (!block) {
      return true;
    }
    if (this.isLobby3DProtectedBlockCoord(block.x, block.y, block.z)) {
      return true;
    }
    if (block.y <= COLLAPSE_ANCHOR_MAX_Y) {
      return true;
    }
    if (
      block.y <= COLLAPSE_ANCHOR_MAX_Y + 1 &&
      COLLAPSE_ANCHOR_TYPE_IDS.has(Math.trunc(Number(block.typeId) || 0))
    ) {
      return true;
    }
    return false;
  }

  collectCollapseGroupFrom(startBlock, visited) {
    if (!startBlock) {
      return null;
    }

    const startKey = toBlockKey(startBlock.x, startBlock.y, startBlock.z);
    if (visited.has(startKey)) {
      return null;
    }

    const queue = [startBlock];
    const group = [];
    let anchored = false;
    visited.add(startKey);

    while (queue.length > 0) {
      const current = queue.pop();
      if (!current) {
        continue;
      }
      group.push(current);

      if (this.isCollapseAnchorBlock(current)) {
        anchored = true;
        break;
      }
      if (group.length > COLLAPSE_GROUP_OVERFLOW_LIMIT) {
        anchored = true;
        break;
      }

      for (const [offsetX, offsetY, offsetZ] of COLLAPSE_NEIGHBOR_OFFSETS) {
        const nextX = current.x + offsetX;
        const nextY = current.y + offsetY;
        const nextZ = current.z + offsetZ;
        const nextKey = toBlockKey(nextX, nextY, nextZ);
        if (visited.has(nextKey)) {
          continue;
        }
        const nextBlock = this.voxelWorld.getBlock(nextX, nextY, nextZ);
        if (!nextBlock) {
          continue;
        }
        visited.add(nextKey);
        queue.push(nextBlock);
      }
    }

    if (anchored || group.length === 0 || group.length > COLLAPSE_GROUP_MAX_BLOCKS) {
      return null;
    }

    return group;
  }

  collectCollapsibleGroups(x, y, z) {
    const baseX = Math.trunc(Number(x));
    const baseY = Math.trunc(Number(y));
    const baseZ = Math.trunc(Number(z));
    if (!Number.isFinite(baseX) || !Number.isFinite(baseY) || !Number.isFinite(baseZ)) {
      return [];
    }

    const visited = new Set();
    const groups = [];

    for (const [offsetX, offsetY, offsetZ] of COLLAPSE_NEIGHBOR_OFFSETS) {
      const startBlock = this.voxelWorld.getBlock(baseX + offsetX, baseY + offsetY, baseZ + offsetZ);
      if (!startBlock) {
        continue;
      }
      const group = this.collectCollapseGroupFrom(startBlock, visited);
      if (!group || group.length === 0) {
        continue;
      }
      groups.push(group);
    }

    return groups;
  }

  collapseGroupsAround(x, y, z, { syncToServer = false } = {}) {
    const groups = this.collectCollapsibleGroups(x, y, z);
    if (groups.length === 0) {
      return 0;
    }

    let collapsedCount = 0;
    for (const group of groups) {
      const visualBlocks = [];
      for (const block of group) {
        const previousEntry = this.getDynamicBlockEntry(block.x, block.y, block.z);
        const removed = this.voxelWorld.removeBlock(block.x, block.y, block.z);
        if (!removed) {
          continue;
        }

        const payload = {
          action: "remove",
          x: block.x,
          y: block.y,
          z: block.z,
          typeId: block.typeId
        };
        this.applyDynamicBlockUpdate(payload);
        visualBlocks.push(block);
        collapsedCount += 1;
        if (syncToServer) {
          this.syncLocalBlockUpdateToServer(payload, previousEntry);
        }
      }

      if (visualBlocks.length > 0) {
        this.collapseSystem?.spawnColumn?.(visualBlocks, this.voxelWorld);
      }
    }

    return collapsedCount;
  }

  handleLocalBlockChanged(change, { collapseColumn = true } = {}) {
    const payload = this.normalizeDynamicBlockUpdate(change);
    if (!payload) {
      return;
    }

    const previousEntry = this.getDynamicBlockEntry(payload.x, payload.y, payload.z);
    this.applyDynamicBlockUpdate(payload);
    const shouldCollapseColumn = collapseColumn && payload.action === "remove";

    if (this.activeMatchMode !== "online") {
      if (shouldCollapseColumn) {
        this.collapseGroupsAround(payload.x, payload.y, payload.z);
      }
      return;
    }

    const synced = this.syncLocalBlockUpdateToServer(payload, previousEntry, {
      onSuccess: () => {
        if (shouldCollapseColumn) {
          this.collapseGroupsAround(payload.x, payload.y, payload.z, { syncToServer: true });
        }
      }
    });
    if (!synced) {
      return;
    }
  }

  normalizeRemoteBlockUpdate(payload = {}) {
    return this.normalizeDynamicBlockUpdate(payload);
  }

  tryDestroyShotBlock(hit = null) {
    if (!hit) {
      return false;
    }

    const x = Math.trunc(Number(hit.x));
    const y = Math.trunc(Number(hit.y));
    const z = Math.trunc(Number(hit.z));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return false;
    }

    const tracked = this.getDynamicBlockEntry(x, y, z);
    const trackedPlaced = tracked?.action === "place";
    const hitTypeId = Number.isFinite(Number(hit.typeId)) ? Math.trunc(Number(hit.typeId)) : null;
    const typeId = Number.isFinite(Number(tracked?.typeId))
      ? Math.trunc(Number(tracked.typeId))
      : hitTypeId;

    if (!trackedPlaced && !this.canModifyWorldBlock(x, y, z, { mode: "shot", typeId })) {
      return false;
    }

    const key = toBlockKey(x, y, z);
    const impactPower = this.getShotBlockImpactPower(this.selectedWeaponDef);
    const requiredHealth = this.getShotBlockHealth(typeId);
    const nextDamage = Math.max(0, Number(this.shotBlockDamageState.get(key) ?? 0)) + impactPower;
    const damageRatio = THREE.MathUtils.clamp(nextDamage / Math.max(1, requiredHealth), 0, 1);
    this.shotBlockDamageState.set(key, nextDamage);
    this.voxelWorld.setBlockDamageTint(x, y, z, damageRatio);

    const blockKind =
      typeId === 8 ? "metal" : typeId === 3 ? "stone" : typeId === 6 ? "brick" : "default";
    this.sound.playBlockImpactCue(blockKind, 0.7 + damageRatio * 0.35);

    if (nextDamage < requiredHealth) {
      if (hit.point) {
        this.spawnHitSpark(hit.point, {
          color: 0xcfc3b7,
          scale: 0.56 + damageRatio * 0.18,
          lift: 0.12,
          ttl: 0.1 + damageRatio * 0.05
        });
      }
      return false;
    }

    this.shotBlockDamageState.delete(key);

    if (this.activeMatchMode === "online") {
      this.voxelWorld.removeBlock(x, y, z);
      this.handleLocalBlockChanged({
        action: "remove",
        x,
        y,
        z,
        typeId
      });
    } else {
      const removed = this.voxelWorld.removeFromHit(hit);
      if (!removed) {
        return false;
      }
      this.handleLocalBlockChanged({
        action: "remove",
        x,
        y,
        z,
        typeId
      });
    }

    if (hit.point) {
      this.spawnHitSpark(hit.point, {
        color: 0xffe1b6,
        scale: 1.08,
        lift: 0.22,
        ttl: 0.2
      });
      this.spawnHitSpark(hit.point, {
        color: 0xcfa670,
        scale: 0.72,
        lift: 0.14,
        ttl: 0.16
      });
    }
    this.sound.playBlockBreakCue(blockKind);
    return true;
  }

  queuePendingRemoteBlock(update) {
    if (!update) {
      return;
    }

    const key = toBlockKey(update.x, update.y, update.z);
    this.pendingRemoteBlocks.set(key, {
      ...update,
      retries: MAX_PENDING_REMOTE_BLOCK_RETRIES
    });
  }

  getRemotePlacementBudget(delta) {
    const frameMs = Math.max(1, Number(delta) * 1000);
    let budget = MAX_PENDING_REMOTE_BLOCK_PLACEMENTS_PER_FRAME;

    if (frameMs >= 28) {
      budget = 12;
    } else if (frameMs >= 22) {
      budget = 20;
    } else if (frameMs >= 17) {
      budget = 32;
    } else {
      budget = 48;
    }

    if (this.pendingRemoteBlocks.size > 300 && frameMs < 20) {
      budget += 14;
    }

    return Math.max(
      MIN_PENDING_REMOTE_BLOCK_PLACEMENTS_PER_FRAME,
      Math.min(MAX_PENDING_REMOTE_BLOCK_PLACEMENTS_PER_FRAME, Math.trunc(budget))
    );
  }

  processPendingRemoteBlocks(delta = 1 / 60) {
    if (this.pendingRemoteBlocks.size === 0 || this.activeMatchMode !== "online") {
      return;
    }

    // Always prioritize removals to prevent lingering ghost blocks.
    for (const [key, update] of this.pendingRemoteBlocks.entries()) {
      if (update.action === "remove") {
        this.voxelWorld.removeBlock(update.x, update.y, update.z);
        this.pendingRemoteBlocks.delete(key);
      }
    }

    const placementBatch = [];
    const placementBudget = this.getRemotePlacementBudget(delta);
    for (const [key, update] of this.pendingRemoteBlocks.entries()) {
      if (update.action !== "place") {
        continue;
      }
      placementBatch.push([key, update]);
      if (placementBatch.length >= placementBudget) {
        break;
      }
    }

    for (const [key, update] of placementBatch) {
      if (!this.pendingRemoteBlocks.has(key)) {
        continue;
      }

      if (!this.isPlayerIntersectingBlock(update.x, update.y, update.z)) {
        this.voxelWorld.setBlock(update.x, update.y, update.z, update.typeId);
        this.pendingRemoteBlocks.delete(key);
        continue;
      }

      update.retries -= 1;
      this.pendingRemoteBlocks.delete(key);
      if (update.retries <= 0) {
        continue;
      }
      // Move blocked placement to the tail for fair round-robin processing.
      this.pendingRemoteBlocks.set(key, update);
    }
  }

  applyRemoteBlockUpdate(payload = {}, { allowQueue = true } = {}) {
    if (this.activeMatchMode !== "online") {
      return false;
    }

    const sourceId = String(payload.id ?? "");
    if (sourceId && sourceId === this.getMySocketId()) {
      return false;
    }

    const update = this.normalizeRemoteBlockUpdate(payload);
    if (!update) {
      return false;
    }

    const key = toBlockKey(update.x, update.y, update.z);
    this.applyDynamicBlockUpdate(update);

    if (update.action === "remove") {
      this.pendingRemoteBlocks.delete(key);
      this.voxelWorld.removeBlock(update.x, update.y, update.z);
      return true;
    }

    if (this.isPlayerIntersectingBlock(update.x, update.y, update.z)) {
      if (allowQueue) {
        this.queuePendingRemoteBlock(update);
      }
      return false;
    }

    this.pendingRemoteBlocks.delete(key);
    this.voxelWorld.setBlock(update.x, update.y, update.z, update.typeId);
    return true;
  }

  updateMobileControlsVisibility() {
    if (!this.mobileControlsEl) {
      return;
    }

    this.syncMobileUtilityButtons();
    const controlActive = this.isRunning || this.isLobby3DActive();
    const chatPanelOpen = this.mobileEnabled && Boolean(this.chat?.isOpen?.());
    const visible =
      this.mobileEnabled &&
      controlActive &&
      !this.isGameOver &&
      (!this.isUiInputFocused() || chatPanelOpen) &&
      !this.optionsMenuOpen;
    this.mobileControlsEl.classList.toggle("is-active", visible);
    this.mobileControlsEl.classList.toggle("chat-open", visible && chatPanelOpen);

    if (!visible || chatPanelOpen) {
      this.mobileState.moveForward = 0;
      this.mobileState.moveStrafe = 0;
      this.mobileState.stickPointerId = null;
      this.mobileState.lookPointerId = null;
      this.mobileState.aimPointerId = null;
      this.mobileState.firePointerId = null;
      this.handlePrimaryActionUp();
      this.buildSystem.setInventoryOpen(false);
      if (this.mobileEnabled) {
        this.isAiming = false;
        if (this.tabBoardVisible) {
          this.setTabScoreboardVisible(false);
        }
      }
      if (this.mobileJoystickKnobEl) {
        this.mobileJoystickKnobEl.style.transform = "translate(-50%, -50%)";
      }
      this.syncMobileUtilityButtons();
    }
  }

  updateMobileStickFromClient(clientX, clientY) {
    const dx = clientX - this.mobileState.stickCenterX;
    const dy = clientY - this.mobileState.stickCenterY;
    const maxRadius = this.mobileState.stickRadius;
    const distance = Math.hypot(dx, dy);
    const ratio = distance > maxRadius ? maxRadius / distance : 1;
    const clampedX = dx * ratio;
    const clampedY = dy * ratio;

    const clampedDistance = Math.hypot(clampedX, clampedY);
    const normDistance = maxRadius > 0 ? Math.min(1, clampedDistance / maxRadius) : 0;
    const deadZone = 0.08;
    const activeDistance =
      normDistance <= deadZone ? 0 : (normDistance - deadZone) / (1 - deadZone);
    const easedDistance = Math.pow(activeDistance, 1.08);
    const dirX = clampedDistance > 0.0001 ? clampedX / clampedDistance : 0;
    const dirY = clampedDistance > 0.0001 ? clampedY / clampedDistance : 0;

    this.mobileState.moveStrafe = dirX * easedDistance;
    this.mobileState.moveForward = -dirY * easedDistance;
    if (this.mobileJoystickKnobEl) {
      this.mobileJoystickKnobEl.style.transform =
        `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
    }
  }

  resetMobileStick() {
    this.mobileState.moveForward = 0;
    this.mobileState.moveStrafe = 0;
    if (this.mobileJoystickKnobEl) {
      this.mobileJoystickKnobEl.style.transform = "translate(-50%, -50%)";
    }
  }

  handlePrimaryActionDown() {
    if (!this.isRunning || this.isGameOver || this.optionsMenuOpen || this.isUiInputFocused()) {
      return;
    }

    this.leftMouseDown = true;
    this.primaryActionRepeatTimer = 0;

    if (this.buildSystem.isBuildMode()) {
      this.buildSystem.handlePointerAction(0, (x, y, z) => !this.isPlayerIntersectingBlock(x, y, z));
      if (this.buildSystem.isDigMode()) {
        this.primaryActionRepeatTimer = DIG_HOLD_REPEAT_INTERVAL;
      }
      return;
    }

    this.fire();
  }

  handlePrimaryActionUp() {
    this.leftMouseDown = false;
    this.primaryActionRepeatTimer = 0;
  }

  toggleToolInventory(forceOpen = null) {
    if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver || this.optionsMenuOpen) {
      return false;
    }

    const nextOpen =
      forceOpen === null ? !this.buildSystem.isInventoryOpen() : Boolean(forceOpen);
    const open = this.buildSystem.setInventoryOpen(nextOpen);
    if (this.mobileEnabled) {
      return open;
    }

    if (open) {
      this.keys.clear();
      this.isAiming = false;
      this.rightMouseAiming = false;
      this.handlePrimaryActionUp();
      this.mouseLookEnabled = false;
      if (
        this.pointerLockSupported &&
        document.pointerLockElement === this.renderer.domElement
      ) {
        document.exitPointerLock();
      }
      return open;
    }

    return open;
  }

  syncMobileUtilityButtons() {
    const mode = this.buildSystem?.getToolMode?.() ?? "gun";
    const inventoryOpen = Boolean(this.buildSystem?.isInventoryOpen?.());
    const chatOpen = Boolean(this.chat?.isOpen?.());
    const lobbyActive = this.isLobby3DActive();
    const hideCombatButtons = lobbyActive && !this.isRunning;
    const placePanelOpen = inventoryOpen && mode === "place";
    const showToolTray = inventoryOpen && !hideCombatButtons && !placePanelOpen;
    const showGunControls = !hideCombatButtons && !inventoryOpen && mode === "gun";
    this.mobileFireButtonEl?.classList.toggle("hidden", hideCombatButtons || inventoryOpen);
    this.mobileUtilityEl?.classList.toggle("hidden", !showToolTray);
    this.mobileBagBtn?.classList.toggle("hidden", hideCombatButtons);
    this.mobileModePlaceBtn?.classList.toggle("hidden", !showToolTray);
    this.mobileModeDigBtn?.classList.toggle("hidden", !showToolTray);
    this.mobileModeGunBtn?.classList.toggle("hidden", !showToolTray);
    this.mobileAimBtn?.classList.toggle("hidden", !showGunControls);
    this.mobileReloadBtn?.classList.toggle("hidden", !showGunControls);
    this.mobileFireButtonEl && (this.mobileFireButtonEl.disabled = hideCombatButtons || inventoryOpen);
    this.mobileBagBtn && (this.mobileBagBtn.disabled = hideCombatButtons);
    this.mobileModePlaceBtn && (this.mobileModePlaceBtn.disabled = !showToolTray);
    this.mobileModeDigBtn && (this.mobileModeDigBtn.disabled = !showToolTray);
    this.mobileModeGunBtn && (this.mobileModeGunBtn.disabled = !showToolTray);
    this.mobileAimBtn && (this.mobileAimBtn.disabled = !showGunControls);
    this.mobileCrouchBtn && (this.mobileCrouchBtn.disabled = hideCombatButtons);
    this.mobileReloadBtn && (this.mobileReloadBtn.disabled = !showGunControls);
    if (hideCombatButtons) {
      this.handlePrimaryActionUp();
      this.isAiming = false;
      this.rightMouseAiming = false;
    }
    this.mobileModePlaceBtn?.classList.toggle("is-active", mode === "place");
    this.mobileModeDigBtn?.classList.toggle("is-active", mode === "dig");
    this.mobileModeGunBtn?.classList.toggle("is-active", mode === "gun");
    this.mobileBagBtn?.classList.toggle("is-active", inventoryOpen);
    this.mobileBagBtn?.setAttribute("aria-pressed", inventoryOpen ? "true" : "false");
    this.mobileAimBtn?.classList.toggle(
      "is-active",
      mode === "gun" && (this.isAiming || this.rightMouseAiming)
    );
    this.mobileCrouchBtn?.classList.toggle("is-active", this.isCrouching);
    this.mobileChatBtn?.classList.toggle("is-active", chatOpen);
    this.mobileChatBtn?.setAttribute("aria-pressed", chatOpen ? "true" : "false");
  }

  setupMobileControls() {
    if (
      this._mobileBound ||
      !this.mobileEnabled ||
      !this.mobileControlsEl ||
      !this.mobileJoystickEl ||
      !this.mobileJoystickKnobEl ||
      !this.mobileFireButtonEl ||
      !this.mobileBagBtn ||
      !this.mobileModePlaceBtn ||
      !this.mobileModeDigBtn ||
      !this.mobileModeGunBtn ||
      !this.mobileAimBtn ||
      !this.mobileJumpBtn ||
      !this.mobileCrouchBtn ||
      !this.mobileReloadBtn ||
      !this.mobileTabBtn ||
      !this.mobileOptionsBtn
    ) {
      this.updateMobileControlsVisibility();
      return;
    }

    this._mobileBound = true;
    const acceptPointer = (event) => {
      if (!event) {
        return false;
      }
      const pointerType = String(event.pointerType ?? "").toLowerCase();
      if (pointerType === "touch" || pointerType === "pen") {
        return true;
      }
      // Some mobile browsers/webviews may report touch as "mouse" or empty.
      return this.mobileEnabled && (pointerType === "mouse" || pointerType.length === 0);
    };

    this.mobileJoystickEl.addEventListener("pointerdown", (event) => {
      if (!acceptPointer(event)) {
        return;
      }

      event.preventDefault();
      this.sound.unlock();
      this.mobileState.stickPointerId = event.pointerId;
      const rect = this.mobileJoystickEl.getBoundingClientRect();
      const knobRect = this.mobileJoystickKnobEl.getBoundingClientRect();
      this.mobileState.stickCenterX = rect.left + rect.width / 2;
      this.mobileState.stickCenterY = rect.top + rect.height / 2;
      this.mobileState.stickRadius = Math.max(24, rect.width * 0.5 - knobRect.width * 0.5);
      this.mobileJoystickEl.setPointerCapture(event.pointerId);
      this.updateMobileStickFromClient(event.clientX, event.clientY);
    });

    this.mobileJoystickEl.addEventListener("pointermove", (event) => {
      if (!acceptPointer(event) || event.pointerId !== this.mobileState.stickPointerId) {
        return;
      }
      event.preventDefault();
      this.updateMobileStickFromClient(event.clientX, event.clientY);
    });

    const endStick = (event) => {
      if (event.pointerId !== this.mobileState.stickPointerId) {
        return;
      }
      this.mobileState.stickPointerId = null;
      this.resetMobileStick();
      if (this.mobileJoystickEl.hasPointerCapture?.(event.pointerId)) {
        this.mobileJoystickEl.releasePointerCapture(event.pointerId);
      }
    };

    this.mobileJoystickEl.addEventListener("pointerup", endStick);
    this.mobileJoystickEl.addEventListener("pointercancel", endStick);

    this.mobileFireButtonEl.addEventListener("pointerdown", (event) => {
      if (!acceptPointer(event)) {
        return;
      }
      if (this.mobileState.firePointerId !== null) {
        return;
      }
      event.preventDefault();
      this.sound.unlock();
      this.mobileState.firePointerId = event.pointerId;
      this.handlePrimaryActionDown();
      this.mobileFireButtonEl.setPointerCapture(event.pointerId);
    });

    const endFire = (event) => {
      if (!acceptPointer(event) || event.pointerId !== this.mobileState.firePointerId) {
        return;
      }
      this.mobileState.firePointerId = null;
      this.handlePrimaryActionUp();
      if (this.mobileFireButtonEl.hasPointerCapture?.(event.pointerId)) {
        this.mobileFireButtonEl.releasePointerCapture(event.pointerId);
      }
    };
    this.mobileFireButtonEl.addEventListener("pointerup", endFire);
    this.mobileFireButtonEl.addEventListener("pointercancel", endFire);

    const bindUtilityTap = (button, action) => {
      button.addEventListener("pointerdown", (event) => {
        if (!acceptPointer(event)) {
          return;
        }
        event.preventDefault();
        this.sound.unlock();
        action();
      });
    };

    bindUtilityTap(this.mobileModePlaceBtn, () => {
      if (this.isLobby3DActive() && !this.isRunning) {
        return;
      }
      this.buildSystem.setToolMode("place");
      this.buildSystem.setInventoryOpen(true);
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileModeDigBtn, () => {
      if (this.isLobby3DActive() && !this.isRunning) {
        return;
      }
      this.buildSystem.setToolMode("dig");
      this.buildSystem.setInventoryOpen(false);
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileModeGunBtn, () => {
      if (this.isLobby3DActive() && !this.isRunning) {
        return;
      }
      this.buildSystem.setToolMode("gun");
      this.buildSystem.setInventoryOpen(false);
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileBagBtn, () => {
      if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver || this.optionsMenuOpen) {
        return;
      }
      this.toggleToolInventory();
    });
    bindUtilityTap(this.mobileAimBtn, () => {
      if (this.isLobby3DActive() && !this.isRunning) {
        return;
      }
      if (!this.isRunning || this.isGameOver || this.optionsMenuOpen || this.isUiInputFocused()) {
        return;
      }
      if (!this.buildSystem.isGunMode()) {
        this.buildSystem.setToolMode("gun");
      }
      this.mobileState.aimPointerId = null;
      this.rightMouseAiming = false;
      this.isAiming = !this.isAiming;
      this.syncMobileUtilityButtons();
    });

    bindUtilityTap(this.mobileJumpBtn, () => {
      if (this.onGround && this.isRunning && !this.isGameOver) {
        this.verticalVelocity = JUMP_FORCE;
        this.onGround = false;
      }
    });
    bindUtilityTap(this.mobileCrouchBtn, () => {
      if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver || this.optionsMenuOpen) {
        return;
      }
      this.mobileCrouchToggle = !this.mobileCrouchToggle;
      this.updateCrouchState();
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileReloadBtn, () => {
      if (this.isLobby3DActive() && !this.isRunning) {
        return;
      }
      if (!this.buildSystem.isGunMode()) {
        this.hud.setStatus("장전하려면 총 모드로 전환하세요.", true, 0.75);
        return;
      }
      if (this.weapon.startReload()) {
        this.hud.setStatus("장전 중...", true, 0.55);
      }
    });
    bindUtilityTap(this.mobileTabBtn, () => {
      this.setTabScoreboardVisible(!this.tabBoardVisible);
    });
    bindUtilityTap(this.mobileOptionsBtn, () => {
      if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver) {
        return;
      }
      this.toggleQuickSettingsPanel();
    });
    if (this.mobileChatBtn) {
      bindUtilityTap(this.mobileChatBtn, () => {
        if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver || this.optionsMenuOpen) {
          return;
        }
        if (this.chat?.isOpen?.()) {
          this.chat.close();
        } else {
          this.chat?.open?.({ focusInput: true });
          this.chat?.setExpandedState?.(true, { focusInput: true });
        }
        this.syncCursorVisibility();
      });
    }

    if (this.flagInteractBtnEl) {
      this.flagInteractBtnEl.addEventListener("pointerdown", (event) => {
        if (!acceptPointer(event)) {
          return;
        }
        event.preventDefault();
        this.sound.unlock();
        this.requestCenterFlagInteract({ source: "mobile" });
      });
    }

    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      const controlActive = this.isRunning || this.isLobby3DActive();
      if (
        !acceptPointer(event) ||
        !this.mobileEnabled ||
        !controlActive ||
        this.isGameOver ||
        this.optionsMenuOpen ||
        this.isUiInputFocused()
      ) {
        return;
      }

      const minLookStartX = this.isLobby3DActive() && !this.isRunning ? 0 : window.innerWidth * 0.38;
      if (event.clientX < minLookStartX) {
        return;
      }

      this.mobileState.lookPointerId = event.pointerId;
      this.mobileState.lookLastX = event.clientX;
      this.mobileState.lookLastY = event.clientY;
      this.mouseLookEnabled = true;
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
    });

    document.addEventListener("pointermove", (event) => {
      const controlActive = this.isRunning || this.isLobby3DActive();
      if (
        !acceptPointer(event) ||
        event.pointerId !== this.mobileState.lookPointerId ||
        !controlActive ||
        this.isGameOver ||
        this.optionsMenuOpen ||
        this.isUiInputFocused()
      ) {
        return;
      }

      event.preventDefault();
      const deltaX = event.clientX - this.mobileState.lookLastX;
      const deltaY = event.clientY - this.mobileState.lookLastY;
      this.mobileState.lookLastX = event.clientX;
      this.mobileState.lookLastY = event.clientY;

      const currentAim = this.isAiming || this.rightMouseAiming;
      const lookScale = currentAim ? MOBILE_AIM_LOOK_SCALE : 1;
      const sensitivity = this.mobileLookSensitivityScale;
      this.yaw -= deltaX * MOBILE_LOOK_SENSITIVITY_X * lookScale * sensitivity;
      this.pitch -= deltaY * MOBILE_LOOK_SENSITIVITY_Y * lookScale * sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    });

    const endLook = (event) => {
      if (event.pointerId !== this.mobileState.lookPointerId) {
        return;
      }
      this.mobileState.lookPointerId = null;
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
    };
    document.addEventListener("pointerup", endLook);
    document.addEventListener("pointercancel", endLook);

    this.syncMobileUtilityButtons();
    this.updateMobileControlsVisibility();
  }

  requestMobileFullscreen() {
    if (!this.mobileEnabled || typeof document === "undefined") {
      return;
    }
    const doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement) {
      return;
    }
    const target = doc.documentElement;
    const request =
      target.requestFullscreen ||
      target.webkitRequestFullscreen ||
      target.msRequestFullscreen;
    if (typeof request !== "function") {
      return;
    }
    try {
      const maybePromise = request.call(target);
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {});
      }
    } catch {}
  }

  bindEvents() {
    window.addEventListener("resize", () => this.onResize());
    window.addEventListener(
      "pointerdown",
      (event) => {
        const pointerType = String(event?.pointerType ?? "").toLowerCase();
        if (pointerType !== "touch" && pointerType !== "pen") {
          return;
        }
        if (this.mobileEnabled && this._mobileBound) {
          return;
        }
        this.mobileEnabled = true;
        this.mobileModeLocked = true;
        this.allowUnlockedLook = true;
        this.mouseLookEnabled = true;
        this.setupMobileControls();
        this.updateMobileControlsVisibility();
      },
      { passive: true }
    );
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.isAiming = false;
      this.rightMouseAiming = false;
      this.handlePrimaryActionUp();
      this.updateCrouchState();
      this.resetLineBuildDrag();
      this.setTabScoreboardVisible(false);
      this.mobileState.lookPointerId = null;
      this.mobileState.aimPointerId = null;
      this.mobileState.firePointerId = null;
      this.resetMobileStick();
      this.syncMobileUtilityButtons();
    });

    const controlKeys = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyE",
      "KeyF",
      "KeyQ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "ControlLeft",
      "ControlRight",
      "ShiftLeft",
      "ShiftRight",
      "KeyR",
      "Digit1",
      "Digit2",
      "Digit3",
      "Digit4",
      "Digit5",
      "Digit6",
      "Digit7",
      "Digit8",
      "Numpad1",
      "Numpad2",
      "Numpad3",
      "Numpad4",
      "Numpad5",
      "Numpad6",
      "Numpad7",
      "Numpad8"
    ]);

    document.addEventListener("keydown", (event) => {
      const uiInputFocused = this.isUiInputFocused();
      const lobbyActive = this.isLobby3DActive();
      if (event.code === "Tab") {
        event.preventDefault();
        if (!uiInputFocused) {
          this.setTabScoreboardVisible(true);
        }
        return;
      }

      if (event.code === "Escape") {
        event.preventDefault();
        if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver || uiInputFocused) {
          return;
        }
        if (this.optionsMenuOpen) {
          this.closeOptionsMenu({ resume: true });
        } else {
          this.openOptionsMenu();
        }
        return;
      }

      if (
        (this.isRunning || this.isLobby3DActive()) &&
        !this.optionsMenuOpen &&
        this.chat &&
        !uiInputFocused &&
        (event.code === "KeyT" || event.code === "Enter")
      ) {
        event.preventDefault();
        this.keys.clear();
        this.isAiming = false;
        this.rightMouseAiming = false;
        this.handlePrimaryActionUp();
        this.mobileState.lookPointerId = null;
        this.mobileState.aimPointerId = null;
        this.mobileState.firePointerId = null;
        this.resetMobileStick();
        this.mouseLookEnabled = false;

        if (
          this.pointerLockSupported &&
          document.pointerLockElement === this.renderer.domElement
        ) {
          document.exitPointerLock();
        }

        this.chat.open();
        this.syncCursorVisibility();
        return;
      }

      if (uiInputFocused) {
        return;
      }

      if (event.code === "KeyE" && lobbyActive) {
        event.preventDefault();
        const activePortal = this.getActiveLobbyPortal();
        if (activePortal) {
          this.handleLobbyPortalEntry(activePortal);
          return;
        }
        this.hud.setStatus("포탈 근처에서 E 키를 사용하세요.", true, 0.72);
        return;
      }

      if (event.code === "KeyE" && this.isRunning && !lobbyActive) {
        event.preventDefault();
        this.toggleToolInventory();
        return;
      }

      if (!lobbyActive && this.buildSystem.handleKeyDown(event)) {
        event.preventDefault();
        return;
      }

      if (controlKeys.has(event.code)) {
        event.preventDefault();
      }
      this.keys.add(event.code);

      if (event.code === "KeyR") {
        if (!this.buildSystem.isGunMode()) {
          this.hud.setStatus("3번 키로 총 모드로 전환하세요.", true, 0.9);
        } else if (this.weapon.startReload()) {
          this.hud.setStatus("장전 중...", true, 0.6);
        }
      }

      if (event.code === "Space" && this.onGround && (this.isRunning || this.isLobby3DActive()) && !this.isGameOver) {
        this.verticalVelocity = JUMP_FORCE;
        this.onGround = false;
      }

      if (event.code === "ControlLeft" || event.code === "ControlRight") {
        this.updateCrouchState();
        this.syncMobileUtilityButtons();
      }

      if (event.code === "KeyF") {
        this.requestCenterFlagInteract({ source: "key" });
      }

      if (event.code === "ArrowRight") {
        this.isAiming = true;
      }
    });

    document.addEventListener("keyup", (event) => {
      const uiInputFocused = this.isUiInputFocused();
      if (event.code === "Tab") {
        event.preventDefault();
        this.setTabScoreboardVisible(false);
        return;
      }

      if (uiInputFocused) {
        return;
      }
      if (this.optionsMenuOpen) {
        this.keys.delete(event.code);
        return;
      }

      if (controlKeys.has(event.code)) {
        event.preventDefault();
      }
      this.keys.delete(event.code);

      if (event.code === "ArrowRight") {
        this.isAiming = false;
      }
      if (event.code === "ControlLeft" || event.code === "ControlRight") {
        this.updateCrouchState();
        this.syncMobileUtilityButtons();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      const wasPointerLocked = this.pointerLocked;
      const active = document.pointerLockElement === this.renderer.domElement;
      this.pointerLocked = active;
      this.unlockedLookLastClientX = null;
      this.unlockedLookLastClientY = null;
      if (!active) {
        this.leftMouseDown = false;
        this.rightMouseAiming = false;
      }

      if (!this.pointerLockSupported) {
        this.mouseLookEnabled = !this.optionsMenuOpen;
        if (!this.optionsMenuOpen) {
          this.hud.showPauseOverlay(false);
        }
        this.syncCursorVisibility();
        return;
      }

      if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver) {
        this.mouseLookEnabled = active || this.allowUnlockedLook;
        if (!this.optionsMenuOpen) {
          this.hud.showPauseOverlay(false);
        }
        this.syncCursorVisibility();
        return;
      }

      if (this.isUiInputFocused()) {
        this.mouseLookEnabled = false;
        if (!this.optionsMenuOpen) {
          this.hud.showPauseOverlay(false);
        }
        this.syncCursorVisibility();
        return;
      }

      if (this.optionsMenuOpen) {
        this.mouseLookEnabled = false;
        this.hud.showPauseOverlay(true);
        this.syncCursorVisibility();
        return;
      }

      if (active) {
        this.allowUnlockedLook = false;
        this.unlockLookOnNextPointerLockFailure = false;
        this.mouseLookEnabled = true;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      if (this.allowUnlockedLook) {
        this.mouseLookEnabled = true;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!wasPointerLocked || now < this.pointerLockAutoMenuUntil) {
        this.mouseLookEnabled = false;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      this.openOptionsMenu();
    });

    document.addEventListener("pointerlockerror", () => {
      if ((!this.isRunning && !this.isLobby3DActive()) || this.isGameOver || this.optionsMenuOpen) {
        return;
      }
      if (this.unlockLookOnNextPointerLockFailure) {
        this.unlockLookOnNextPointerLockFailure = false;
        this.allowUnlockedLook = true;
        this.mouseLookEnabled = true;
        this.hud.showPauseOverlay(false);
        this.hud.setStatus("화면 클릭 시 포인터 락으로 전환됩니다.", false, 1.1);
        this.syncCursorVisibility();
        return;
      }
      this.mouseLookEnabled = this.allowUnlockedLook;
      this.hud.showPauseOverlay(false);
      if (!this.allowUnlockedLook) {
        this.hud.setStatus("화면 클릭 후 다시 시도하세요.", true, 0.9);
      }
      this.syncCursorVisibility();
    });

    document.addEventListener("mousemove", (event) => {
      if (this.lineBuildDragActive) {
        this.lineBuildDragMotion +=
          Math.abs(Number(event.movementX) || 0) + Math.abs(Number(event.movementY) || 0);
        if (!this.lineBuildDragMoved && this.lineBuildDragMotion >= 6) {
          this.lineBuildDragMoved = true;
        }
      }

      const controlActive = this.isRunning || this.isLobby3DActive();
      if (
        !controlActive ||
        this.isGameOver ||
        this.optionsMenuOpen ||
        !this.mouseLookEnabled ||
        (!this.mobileEnabled && !this.pointerLocked && !this.allowUnlockedLook) ||
        this.isUiInputFocused()
      ) {
        this.unlockedLookLastClientX = null;
        this.unlockedLookLastClientY = null;
        return;
      }

      const usingUnlockedDesktopLook =
        !this.mobileEnabled && !this.pointerLocked && this.allowUnlockedLook;

      let deltaX = Number(event.movementX) || 0;
      let deltaY = Number(event.movementY) || 0;

      if (usingUnlockedDesktopLook) {
        if (event.target !== this.renderer.domElement) {
          this.unlockedLookLastClientX = null;
          this.unlockedLookLastClientY = null;
          return;
        }
        const clientX = Number(event.clientX);
        const clientY = Number(event.clientY);
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
          return;
        }
        if (
          this.unlockedLookLastClientX === null ||
          this.unlockedLookLastClientY === null
        ) {
          this.unlockedLookLastClientX = clientX;
          this.unlockedLookLastClientY = clientY;
          return;
        }
        deltaX = clientX - this.unlockedLookLastClientX;
        deltaY = clientY - this.unlockedLookLastClientY;
        this.unlockedLookLastClientX = clientX;
        this.unlockedLookLastClientY = clientY;
      }

      this.pendingMouseLookX += deltaX;
      this.pendingMouseLookY += deltaY;
    });

    document.addEventListener(
      "wheel",
      (event) => {
        if (this.isUiInputFocused() || !this.isRunning || this.isGameOver || this.optionsMenuOpen) {
          return;
        }
        if (this.buildSystem.handleWheel(event)) {
          event.preventDefault();
        }
      },
      { passive: false }
    );

    const isGameplayMouseEvent = (event) =>
      this.pointerLocked || event.target === this.renderer.domElement;
    const isNonGameplayUiTarget = (target) => {
      if (!(target instanceof Element)) {
        return false;
      }
      if (target === this.renderer.domElement) {
        return false;
      }
      if (
        target.closest(
          "#start-overlay.show, #pause-overlay.show, #gameover-overlay.show, #chat-panel, #quick-settings-panel, #quick-settings-btn, #mobile-controls"
        )
      ) {
        return true;
      }
      const tag = String(target.tagName ?? "").toUpperCase();
      return (
        tag === "BUTTON" ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "LABEL" ||
        tag === "A" ||
        tag === "SUMMARY"
      );
    };

    document.addEventListener("contextmenu", (event) => {
      if (
        this.isRunning &&
        !this.isGameOver &&
        (this.pointerLocked || event.target === this.renderer.domElement)
      ) {
        event.preventDefault();
      }
    });

    document.addEventListener("mousedown", (event) => {
      const controlActive = this.isRunning || this.isLobby3DActive();
      if (!controlActive || this.isGameOver || this.optionsMenuOpen) {
        return;
      }

      if (this.buildSystem.isInventoryOpen()) {
        if (!isNonGameplayUiTarget(event.target)) {
          event.preventDefault();
          this.toggleToolInventory(false);
        }
        return;
      }

      const shouldTryPointerLockFromUi =
        event.button === 0 &&
        this.pointerLockSupported &&
        !this.pointerLocked &&
        (!this.mouseLookEnabled || this.allowUnlockedLook) &&
        !this.isUiInputFocused() &&
        !isNonGameplayUiTarget(event.target);
      if (shouldTryPointerLockFromUi) {
        this.tryPointerLock();
      }

      if (!isGameplayMouseEvent(event)) {
        return;
      }
      event.preventDefault();

      const lobbyActive = this.isLobby3DActive();
      this.sound.unlock();
      const shouldTryPointerLock =
        this.pointerLockSupported &&
        !this.pointerLocked &&
        (!this.mouseLookEnabled || this.allowUnlockedLook) &&
        !this.isUiInputFocused();

      if (lobbyActive) {
        if (shouldTryPointerLock) {
          this.tryPointerLock();
        }
        return;
      }

      if (this.buildSystem.isBuildMode()) {
        if (event.button === 0 || event.button === 2) {
          const wantsLineDrag =
            event.button === 0 && this.buildSystem.isPlaceMode() && event.shiftKey;
          if (wantsLineDrag) {
            const anchor = this.buildSystem.captureLineAnchor(
              (x, y, z) => !this.isPlayerIntersectingBlock(x, y, z)
            );
            if (!anchor?.valid) {
              this.resetLineBuildDrag();
              return;
            }
            this.lineBuildDragActive = true;
            this.lineBuildDragMoved = false;
            this.lineBuildDragMotion = 0;
            return;
          }
          this.resetLineBuildDrag();
          if (event.button === 0 && this.buildSystem.isDigMode()) {
            this.handlePrimaryActionDown();
            return;
          }
          this.buildSystem.handlePointerAction(event.button, (x, y, z) => !this.isPlayerIntersectingBlock(x, y, z), {
            lineMode: false
          });
          return;
        }
      }

      if (event.button === 2) {
        this.rightMouseAiming = true;
        if (shouldTryPointerLock) {
          this.tryPointerLock();
        }
        return;
      }

      if (event.button !== 0) {
        return;
      }

      this.handlePrimaryActionDown();
      if (shouldTryPointerLock) {
        this.tryPointerLock();
      }
    });

    document.addEventListener("mouseup", (event) => {
      if (event.button === 0) {
        if (this.lineBuildDragActive) {
          this.buildSystem.handlePointerAction(
            0,
            (x, y, z) => !this.isPlayerIntersectingBlock(x, y, z),
            { lineMode: this.lineBuildDragMoved }
          );
          this.resetLineBuildDrag();
        }
        this.handlePrimaryActionUp();
      }
      if (this.buildSystem.isBuildMode()) {
        return;
      }

      if (event.button === 2) {
        this.rightMouseAiming = false;
      }
    });

    const btnSingle = document.getElementById("mode-single");
    const btnOnline = document.getElementById("mode-online");

    btnSingle?.addEventListener("click", () => {
      this.setStartMenuMode("single");
      this.updateLobbyControls();
    });

    btnOnline?.addEventListener("click", () => {
      this.setStartMenuMode("online");
      this.refreshOnlineStatus();
      this.requestRoomList();
    });

    this.setStartMenuMode("online");

    this.startButton?.addEventListener("click", () => {
      this.applyLobbyNickname({ source: "menu", syncToServer: false });
      this.start({ mode: "single" });
    });

    this.mpCreateBtn?.addEventListener("click", () => {
      this.applyLobbyNickname({ source: "menu", syncToServer: false });
      this.createRoom();
    });
    this.mpJoinBtn?.addEventListener("click", () => {
      this.applyLobbyNickname({ source: "menu", syncToServer: false });
      this.joinRoomByInputCode();
    });
    this.mpStartBtn?.addEventListener("click", () => {
      this.startOnlineMatch();
    });
    this.mpRefreshBtn?.addEventListener("click", () => {
      this.refreshOnlineStatus();
      this.requestRoomList();
    });
    this.mpEnterLobbyBtn?.addEventListener("click", () => {
      if (!this.isLobby3DActive()) {
        this.enterOnlineLobby3D();
      } else {
        this.hud.setStatus("이미 3D 로비에 있습니다.", false, 0.65);
      }
    });
    this.mpOpenTrainingBtn?.addEventListener("click", () => {
      this.applyLobbyNickname({ source: "menu", syncToServer: false });
      this.start({ mode: "single" });
    });
    this.mpOpenSimulacBtn?.addEventListener("click", () => {
      this.openSimulacWorld();
    });
    this.hostStartForestBtn?.addEventListener("click", () => {
      if (!this.canUseHostControls()) {
        this.hud.setStatus("방장만 사용할 수 있습니다.", true, 0.8);
        return;
      }
      this.startOnlineMatch("forest_frontline");
    });
    this.hostStartCityBtn?.addEventListener("click", () => {
      if (!this.canUseHostControls()) {
        this.hud.setStatus("방장만 사용할 수 있습니다.", true, 0.8);
        return;
      }
      this.startOnlineMatch("city_frontline");
    });
    this.hostOpenLobbyBtn?.addEventListener("click", () => {
      if (!this.canUseHostControls()) {
        this.hud.setStatus("방장만 사용할 수 있습니다.", true, 0.8);
        return;
      }
      this.enterOnlineLobby3D();
    });
    this.hostOpenTrainingBtn?.addEventListener("click", () => {
      if (!this.canUseHostControls()) {
        this.hud.setStatus("방장만 사용할 수 있습니다.", true, 0.8);
        return;
      }
      this.applyLobbyNickname({ source: "menu", syncToServer: false });
      this.start({ mode: "single" });
    });
    this.hostOpenSimulacBtn?.addEventListener("click", () => {
      if (!this.canUseHostControls()) {
        this.hud.setStatus("방장만 사용할 수 있습니다.", true, 0.8);
        return;
      }
      this.openSimulacWorld();
    });
    for (const button of this.mpWeaponButtons) {
      button.addEventListener("click", () => {
        const weaponId = sanitizeWeaponId(button.dataset.weaponId);
        this.applySelectedWeapon(weaponId, {
          persist: true,
          syncToServer: true,
          resetAmmo: false,
          announce: true
        });
      });
    }

    const bindUiInputFocus = (inputEl) => {
      if (!inputEl) {
        return;
      }
      inputEl.addEventListener("focus", () => {
        this.keys.clear();
        this.handlePrimaryActionUp();
        this.rightMouseAiming = false;
        this.isAiming = false;
        this.mouseLookEnabled = false;
        if (
          this.pointerLockSupported &&
          document.pointerLockElement === this.renderer.domElement
        ) {
          document.exitPointerLock();
        }
        this.syncCursorVisibility();
      });
      inputEl.addEventListener("blur", () => {
        this.syncCursorVisibility();
      });
    };

    bindUiInputFocus(this.mpNameInput);
    bindUiInputFocus(this.lobbyQuickNameInput);

    const commitLobbyNicknameFrom = (source, inputEl) => {
      if (!inputEl) {
        return;
      }
      this.applyLobbyNickname({
        source,
        syncToServer: true,
        value: inputEl.value
      });
    };
    this.mpNameInput?.addEventListener("change", () => {
      commitLobbyNicknameFrom("menu-input", this.mpNameInput);
    });
    this.mpNameInput?.addEventListener("keydown", (event) => {
      if (event.code !== "Enter") {
        return;
      }
      event.preventDefault();
      commitLobbyNicknameFrom("menu-input", this.mpNameInput);
      this.mpNameInput?.blur();
    });
    this.lobbyQuickNameSaveBtn?.addEventListener("click", () => {
      commitLobbyNicknameFrom("quick", this.lobbyQuickNameInput);
    });
    this.lobbyQuickNameInput?.addEventListener("keydown", (event) => {
      if (event.code !== "Enter") {
        return;
      }
      event.preventDefault();
      commitLobbyNicknameFrom("quick", this.lobbyQuickNameInput);
      this.lobbyQuickNameInput?.blur();
    });

    this.mpCodeInput?.addEventListener("input", () => {
      this.mpCodeInput.value = this.mpCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });

    this.mpLeaveBtn?.addEventListener("click", () => {
      this.leaveRoom();
    });
    this.mpCopyCodeBtn?.addEventListener("click", () => {
      this.copyCurrentRoomCode();
    });
    this.mpTeamAlphaBtn?.addEventListener("click", () => {
      this.setTeam("alpha");
    });
    this.mpTeamBravoBtn?.addEventListener("click", () => {
      this.setTeam("bravo");
    });

    this.restartButton?.addEventListener("click", () => {
      this.start({ mode: this.activeMatchMode });
    });

    this.optionsContinueBtn?.addEventListener("click", () => {
      this.closeOptionsMenu({ resume: true });
    });
    this.optionsExitBtn?.addEventListener("click", () => {
      this.handleOptionsExitAction();
    });
    this.optionsSfxMuteBtn?.addEventListener("click", () => {
      this.toggleEffectsMute();
    });
    this.optionsSfxVolumeEl?.addEventListener("input", (event) => {
      const slider = event.target;
      const percent = Number(slider?.value);
      const scale = Number.isFinite(percent) ? percent / 100 : this.effectsVolumeScale;
      this.setEffectsVolumeScale(scale, { persist: true });
    });
    this.optionsMobileLookEl?.addEventListener("input", (event) => {
      const slider = event.target;
      const percent = Number(slider?.value);
      const scale = Number.isFinite(percent)
        ? percent / 100
        : this.mobileLookSensitivityScale;
      this.setMobileLookSensitivityScale(scale, { persist: true });
    });
    this.optionsMobileChatHeaderToggleBtn?.addEventListener("click", () => {
      this.setMobileChatHeaderToggleVisible(!this.mobileChatHeaderToggleVisible, {
        persist: true
      });
    });
  }

  onChatFocusChanged(focused) {
    const controlActive = this.isRunning || this.isLobby3DActive();
    if (!controlActive || this.isGameOver) {
      this.syncCursorVisibility();
      return;
    }

    if (focused) {
      this.keys.clear();
      this.isAiming = false;
      this.rightMouseAiming = false;
      this.handlePrimaryActionUp();
      this.buildSystem.setInventoryOpen(false);
      this.mobileState.lookPointerId = null;
      this.mobileState.aimPointerId = null;
      this.mobileState.firePointerId = null;
      this.resetMobileStick();
      this.mouseLookEnabled = false;
      if (!this.optionsMenuOpen) {
        this.hud.showPauseOverlay(false);
      }

      if (
        this.pointerLockSupported &&
        document.pointerLockElement === this.renderer.domElement
      ) {
        document.exitPointerLock();
      }

      this.syncCursorVisibility();
      return;
    }

    if (this.optionsMenuOpen) {
      this.mouseLookEnabled = false;
      this.hud.showPauseOverlay(true);
      this.syncCursorVisibility();
      return;
    }

    this.hud.showPauseOverlay(false);
    if (this.isLobby3DActive()) {
      this.restoreGameplayLookState({ preferPointerLock: true });
      this.syncCursorVisibility();
      return;
    }

    if (this.pointerLocked || this.allowUnlockedLook) {
      this.mouseLookEnabled = true;
      this.syncCursorVisibility();
      return;
    }

    this.tryPointerLock({ fallbackUnlockedLook: true });
  }

  start(options = {}) {
    const mode = options.mode ?? this.menuMode;
    this.activeMatchMode = mode === "online" ? "online" : "single";
    this.mapId = this.getMapIdForMode(this.activeMatchMode);
    this.clearUiInputFocus();
    this.setLobby3DActive(false, { reposition: false });
    this.resetState();
    this.setTabScoreboardVisible(false);
    this.hud.showStartOverlay(false);
    this.hud.showPauseOverlay(false);
    this.hud.pauseOverlayEl?.setAttribute("aria-hidden", "true");
    this.optionsMenuOpen = false;
    this.hud.hideGameOver();
    this.isRunning = true;
    this.mobileEnabled = this.mobileModeLocked || isLikelyTouchDevice();
    if (!this.mobileEnabled) {
      // Desktop should remain playable even when pointer lock is denied.
      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
    }
    if (this.mobileEnabled) {
      this.mobileModeLocked = true;
      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
    }
    if (this.mobileEnabled && !this._mobileBound) {
      this.setupMobileControls();
    }
    this.updateMobileControlsVisibility();
    this.chat?.close?.();
    this.requestMobileFullscreen();
    this.sound.unlock();
    this.isGameOver = false;
    this.pointerLockAutoMenuUntil =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) + 1200;
    this.mouseLookEnabled = true;
    this.updateVisualMode(this.buildSystem.getToolMode());
    this.syncCursorVisibility();
    this.clock.start();
    if (!this.mobileEnabled) {
      this.tryPointerLock({ fallbackUnlockedLook: true });
    }

    if (!this.pointerLockSupported) {
      this.hud.setStatus("포인터 락을 사용할 수 없어 자유 시점 모드로 전환합니다.", true, 1.2);
    }

    if (this.activeMatchMode === "online") {
      this.rebuildArenaWorld({ preserveLobbyGeometry: false });
      this.hud.setStatus("온라인 매치 시작: AI 비활성화", false, 0.9);
      this.requestRoomSnapshot();
      this.setOnlineSpawnFromLobby();
      this.syncRemotePlayersFromLobby();
      this.state.objectiveText = this.getOnlineObjectiveText();
      this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
    } else {
      this.rebuildArenaWorld({ preserveLobbyGeometry: false });
      this.setSingleSpawnFromTraining();
      this.state.objectiveText = this.getObjectiveText();
    }
    if (!this.isLobby3DActive()) {
      this.updateTeamScoreHud();
      this.updateFlagInteractUi();
    }
    this.updateCamera(0);
    this.refreshOnlineStatus();
  }

  schedulePointerLockFallback() {
    if (this.pointerLockFallbackTimer !== null) {
      window.clearTimeout(this.pointerLockFallbackTimer);
      this.pointerLockFallbackTimer = null;
    }

    if (
      !this.pointerLockSupported ||
      this.mobileEnabled ||
      (this.allowUnlockedLook && !this.unlockLookOnNextPointerLockFailure)
    ) {
      return;
    }

    this.pointerLockFallbackTimer = window.setTimeout(() => {
      this.pointerLockFallbackTimer = null;

      const controlActive = this.isRunning || this.isLobby3DActive();
      if (!controlActive || this.isGameOver || this.pointerLocked || this.isUiInputFocused()) {
        return;
      }

      if (this.unlockLookOnNextPointerLockFailure) {
        this.unlockLookOnNextPointerLockFailure = false;
        this.allowUnlockedLook = true;
        this.mouseLookEnabled = true;
        this.hud.showPauseOverlay(false);
        this.hud.setStatus("화면 클릭 시 포인터 락으로 전환됩니다.", false, 1.1);
        this.syncCursorVisibility();
        return;
      }

      if (this.allowUnlockedLook) {
        return;
      }

      this.mouseLookEnabled = false;
      this.hud.showPauseOverlay(false);
      this.hud.setStatus("화면 클릭으로 시점을 고정하세요.", true, 0.9);
      this.syncCursorVisibility();
    }, POINTER_LOCK_FALLBACK_MS);
  }

  resetState() {
    this.clearPortalTransitionFx();
    if (this.pointerLockFallbackTimer !== null) {
      window.clearTimeout(this.pointerLockFallbackTimer);
      this.pointerLockFallbackTimer = null;
    }
    this.pointerLockAutoMenuUntil = 0;
    this.unlockedLookLastClientX = null;
    this.unlockedLookLastClientY = null;

    this.keys.clear();
    this.remoteSyncClock = 0;
    this.pendingRemoteBlocks.clear();
    this.perfStats.frameCount = 0;
    this.perfStats.totalMs = 0;
    this.perfStats.slowFrames = 0;
    this.perfStats.worstMs = 0;
    this.perfStats.lastReportAt = getNowMs();
    this.lowFpsStrikes = 0;
    this.mobileState.lookPointerId = null;
    this.mobileState.stickPointerId = null;
    this.mobileState.aimPointerId = null;
    this.mobileState.firePointerId = null;
    this.resetMobileStick();
    this.handlePrimaryActionUp();
    this.isRespawning = false;
    this.respawnEndAt = 0;
    this.respawnLastSecond = -1;
    this.localDeathAnimStartAt = 0;
    this.localDeathAnimBlend = 0;
    this.lastHazardEmitAt = 0;
    this.setRespawnBanner("", false);
    this.setTabScoreboardVisible(false);
    this.flagInteractVisible = false;
    this.flagInteractMode = "none";
    this.flagInteractBtnEl?.classList.remove("show");
    this.flagInteractBtnEl?.setAttribute("aria-hidden", "true");
    this.pvpImmuneHintUntil = 0;
    this.flagShootBlockedHintUntil = 0;
    this.optionsMenuOpen = false;
    this.hud.pauseOverlayEl?.setAttribute("aria-hidden", "true");
    this.scoreHudState.show = null;
    this.scoreHudState.alpha = null;
    this.scoreHudState.bravo = null;
    this.weapon.reset();
    this.enemyManager.reset();
    this.playerPosition.set(0, PLAYER_HEIGHT, 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.fallStartY = this.playerPosition.y;
    this.yaw = 0;
    this.pitch = 0;
    this.weaponRecoil = 0;
    this.weaponBobClock = 0;
    this.shovelSwingTimer = 0;
    this.currentPlayerHeight = PLAYER_HEIGHT;
    this.isCrouching = false;
    this.mobileCrouchToggle = false;
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.leftMouseDown = false;
    this.resetLineBuildDrag();
    this.aimBlend = 0;
    this.buildSystem.setInventoryOpen(false);
    this.buildSystem.setToolMode("gun", { silentStatus: true });
    if (this.activeMatchMode === "single") {
      this.buildSystem.resetStockToDefault();
    }
    this.updateVisualMode(this.buildSystem.getToolMode());
    this.camera.fov = DEFAULT_FOV;
    this.camera.updateProjectionMatrix();
    this.lastAppliedFov = DEFAULT_FOV;

    for (const spark of this.hitSparks) {
      this.scene.remove(spark.sprite);
      spark.sprite.material.dispose();
    }
    this.hitSparks.length = 0;

    this.state.health = 100;
    this.state.score = 0;
    this.state.kills = 0;
    this.state.captures = 0;
    this.state.controlPercent = 0;
    this.state.controlOwner = "neutral";
    this.state.objectiveText = this.getObjectiveText();
    this.state.killStreak = 0;
    this.state.lastKillTime = 0;
    this.baseSupport.healPool = 0;
    this.baseSupport.ammoPool = 0;
    this._wasReloading = false;
    this.lastDryFireAt = -10;
    this.chatIntroShown = false;
    this.resetObjectives();
    this.clearRemotePlayers();
    this.clearChatMessages();
    this.collapseSystem?.reset?.();
    this.hud.setKillStreak(0);
    this.hud.clearAnnouncement();
    this.dynamicBlockState.clear();
    this.shotBlockDamageState.clear();
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(0, 0, 0);
    this.syncCursorVisibility();
    this.updateTeamScoreHud();

    this.hud.update(0, { ...this.state, ...this.weapon.getState() });
    this.hud.setScopeOverlayVisible(false);
    if (this.weaponFlashLight) {
      this.weaponFlashLight.intensity = 0;
    }
  }

  fire() {
    if (
      !this.isRunning ||
      this.isGameOver ||
      this.optionsMenuOpen ||
      this.isRespawning ||
      (this.activeMatchMode === "online" && this.onlineRoundEnded) ||
      this.isUiInputFocused() ||
      !this.buildSystem.isGunMode()
    ) {
      return;
    }
    if (this.activeMatchMode === "online" && this.isLocalFlagCarrier()) {
      const now = Date.now();
      if (now >= this.flagShootBlockedHintUntil) {
        this.flagShootBlockedHintUntil = now + 420;
        this.hud.setStatus("깃발 운반 중에는 사격할 수 없습니다.", true, 0.55);
      }
      return;
    }
    if (this.activeMatchMode === "online" && !this.getMyTeam()) {
      this.hud.setStatus("공격 전에 팀을 먼저 선택하세요.", true, 0.7);
      return;
    }

    const shot = this.weapon.tryShoot();
    if (!shot.success) {
      if (shot.reason === "empty") {
        const now = this.clock.getElapsedTime();
        if (now - this.lastDryFireAt > 0.22) {
          this.lastDryFireAt = now;
          this.hud.setStatus("탄약 없음", true, 0.55);
          this.sound.play("dry", { rateJitter: 0.08 });
        }
      }
      return;
    }

    const weaponDef = this.selectedWeaponDef ?? getWeaponDefinition(this.selectedWeaponId);
    this.weaponRecoil = Number(weaponDef.recoilKick ?? 1);
    this.sound.play(weaponDef.shotSound ?? "shot", {
      gain: weaponDef.shotGain ?? 1,
      rateJitter: weaponDef.shotRateJitter ?? 0.035,
      minIntervalMs: weaponDef.soundMinIntervalMs ?? 0
    });
    this.hud.pulseCrosshair();
    const hipSpread = Math.max(0, Number(weaponDef.hipSpread ?? 0));
    const aimSpread = Math.max(0, Number(weaponDef.aimSpread ?? hipSpread));
    const shotSpread = THREE.MathUtils.lerp(hipSpread, aimSpread, this.aimBlend);
    const pelletCount = Math.max(1, Math.trunc(Number(weaponDef.pelletCount ?? 1) || 1));
    const pelletDamage = Math.max(
      1,
      Math.trunc(Number(weaponDef.pelletDamage ?? weaponDef.damage) || weaponDef.damage || 1)
    );
    const spreadPattern = String(weaponDef.spreadPattern ?? "").trim().toLowerCase();
    const spreadRadiusScale = Math.max(0.1, Number(weaponDef.spreadRadiusScale ?? 1) || 1);
    const pelletHitPoints = [];
    const onlineDamageByTarget = new Map();
    const singleHitTargets = new Map();
    let strongestHitZone = "";

    for (let pelletIndex = 0; pelletIndex < pelletCount; pelletIndex += 1) {
      let spreadX = 0;
      let spreadY = 0;
      if (shotSpread > 0) {
        if (spreadPattern === "circle") {
          const angle = Math.random() * Math.PI * 2;
          const radius = shotSpread * spreadRadiusScale * Math.sqrt(Math.random());
          spreadX = Math.cos(angle) * radius;
          spreadY = Math.sin(angle) * radius;
        } else {
          spreadX = THREE.MathUtils.randFloatSpread(shotSpread * 2);
          spreadY = THREE.MathUtils.randFloatSpread(shotSpread * 2);
        }
      }
      const pelletRaycaster = pelletIndex === 0 ? this.raycaster : new THREE.Raycaster();
      pelletRaycaster.setFromCamera(new THREE.Vector2(spreadX, spreadY), this.camera);
      const blockHit = this.voxelWorld.raycast(pelletRaycaster, 120);
      const maxEnemyDistance = blockHit ? Math.max(0, blockHit.distance - 0.001) : Infinity;

      if (this.activeMatchMode === "online") {
        const remoteHit = this.findOnlineShotTarget(maxEnemyDistance, pelletRaycaster);
        if (remoteHit) {
          const appliedPelletDamage = this.getWeaponHitDamage(
            weaponDef,
            pelletDamage,
            remoteHit.distance,
            remoteHit.hitZone
          );
          strongestHitZone = this.promoteHitZone(strongestHitZone, remoteHit.hitZone);
          pelletHitPoints.push({
            point: remoteHit.point,
            color: 0xffd58a,
            scale: 0.9,
            lift: 0.28,
            ttl: 0.2
          });
          onlineDamageByTarget.set(
            remoteHit.id,
            (onlineDamageByTarget.get(remoteHit.id) ?? 0) + appliedPelletDamage
          );
          continue;
        }

        const destroyed = this.tryDestroyShotBlock(blockHit);
        if (!destroyed && blockHit?.point) {
          pelletHitPoints.push({
            point: blockHit.point.clone(),
            color: 0xd6eeff,
            scale: 0.66,
            lift: 0.18,
            ttl: 0.14
          });
        }
        continue;
      }

      const result = this.enemyManager.handleShot(
        pelletRaycaster,
        maxEnemyDistance,
        pelletDamage,
        (baseDamage, hitDistance, hit, hitZone) =>
          this.getWeaponHitDamage(weaponDef, baseDamage, hitDistance, hitZone)
      );
      if (result.didHit && result.target) {
        strongestHitZone = this.promoteHitZone(strongestHitZone, result.hitZone);
        const previous = singleHitTargets.get(result.target) ?? {
          didKill: false,
          hitPoint: null
        };
        previous.didKill = previous.didKill || result.didKill;
        previous.hitPoint = previous.hitPoint ?? result.hitPoint ?? null;
        singleHitTargets.set(result.target, previous);
        if (result.hitPoint) {
          pelletHitPoints.push({
            point: result.hitPoint,
            color: 0xd6eeff,
            scale: 0.72,
            lift: 0.24,
            ttl: 0.16
          });
        }
        continue;
      }

      const destroyed = this.tryDestroyShotBlock(blockHit);
      if (!destroyed && blockHit?.point) {
        pelletHitPoints.push({
          point: blockHit.point.clone(),
          color: 0xd6eeff,
          scale: 0.62,
          lift: 0.18,
          ttl: 0.13
        });
      }
    }

    if (this.activeMatchMode === "online") {
      if (onlineDamageByTarget.size > 0) {
        this.hud.pulseHitmarker();
        this.sound.playHitCue(strongestHitZone);
        for (const [targetId, totalDamage] of onlineDamageByTarget.entries()) {
          this.emitPvpShot(targetId, totalDamage);
        }
      }

      for (const spark of pelletHitPoints) {
        this.spawnHitSpark(spark.point, spark);
      }
      return;
    }

    if (singleHitTargets.size === 0) {
      for (const spark of pelletHitPoints) {
        this.spawnHitSpark(spark.point, spark);
      }
      return;
    }

    this.hud.pulseHitmarker();
    this.sound.playHitCue(strongestHitZone);
    for (const spark of pelletHitPoints) {
      this.spawnHitSpark(spark.point, spark);
    }

    let pointGain = 0;
    let killCount = 0;
    for (const result of singleHitTargets.values()) {
      if (result.didKill) {
        killCount += 1;
        pointGain += 100;
      } else {
        pointGain += 20;
      }
    }
    this.state.score += pointGain;

    if (killCount > 0) {
      this.state.kills += killCount;
      const now = this.clock.getElapsedTime();
      this.state.killStreak =
        now - this.state.lastKillTime < 4.0 ? this.state.killStreak + killCount : killCount;
      this.state.lastKillTime = now;
      this.hud.setStatus(
        killCount > 1 ? `${killCount}명 처치 +${killCount * 100}` : "+100 처치",
        false,
        0.5
      );
      this.hud.setKillStreak(this.state.killStreak);

      if (this.state.killStreak >= 3) {
        this.addChatMessage(
          `${this.state.killStreak}연속 처치! 처치 보너스 +${this.state.kills * 10}`,
          "streak"
        );
      } else {
        this.addChatMessage(
          killCount > 1
            ? `${killCount}명 처치 +${killCount * 100} (총 처치 ${this.state.kills})`
            : `적 처치 +100 (총 처치 ${this.state.kills})`,
          "kill"
        );
      }
    }
  }

  applyMovement(delta) {
    if (
      this.optionsMenuOpen ||
      ((this.activeMatchMode === "online" && this.onlineRoundEnded) && !this.isLobby3DActive())
    ) {
      return;
    }
    this.updateCrouchState();
    const wasOnGround = this.onGround;
    if (wasOnGround) {
      this.fallStartY = this.playerPosition.y;
    }

    const mobileForward = this.mobileEnabled ? this.mobileState.moveForward : 0;
    const mobileStrafe = this.mobileEnabled ? this.mobileState.moveStrafe : 0;
    const mobileMoveMagnitude = this.mobileEnabled ? Math.hypot(mobileForward, mobileStrafe) : 0;
    const keyForward =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const keyStrafe =
      (this.keys.has("KeyD") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const forward = THREE.MathUtils.clamp(keyForward + mobileForward, -1, 1);
    const strafe = THREE.MathUtils.clamp(keyStrafe + mobileStrafe, -1, 1);
    const sprinting =
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight") ||
      (this.mobileEnabled && mobileMoveMagnitude >= MOBILE_SPRINT_THRESHOLD);
    let speed = sprinting ? PLAYER_SPRINT : PLAYER_SPEED;
    if (this.isLocalFlagCarrier()) {
      speed *= FLAG_CARRIER_SPEED_MULTIPLIER;
    }
    if (this.isCrouching) {
      speed *= PLAYER_CROUCH_SPEED_MULTIPLIER;
    }

    if (forward !== 0 || strafe !== 0) {
      const sinYaw = Math.sin(this.yaw);
      const cosYaw = Math.cos(this.yaw);

      this.moveForwardVec.set(-sinYaw, 0, -cosYaw);
      this.moveRightVec.set(cosYaw, 0, -sinYaw);
      this.moveVec
        .set(0, 0, 0)
        .addScaledVector(this.moveForwardVec, forward)
        .addScaledVector(this.moveRightVec, strafe);
      const moveMagnitude = Math.min(1, this.moveVec.length());
      if (moveMagnitude > 0.0001) {
        this.moveVec.normalize();
      }

      const usingMobileAnalog = this.mobileEnabled && mobileMoveMagnitude > 0.0001;
      const moveScale = usingMobileAnalog ? moveMagnitude : Math.max(0.36, moveMagnitude);
      const moveStep = speed * delta * moveScale;
      const totalMoveX = this.moveVec.x * moveStep;
      const totalMoveZ = this.moveVec.z * moveStep;
      const horizontalDistance = Math.hypot(totalMoveX, totalMoveZ);
      const horizontalSteps = Math.max(1, Math.ceil(horizontalDistance / 0.18));
      const stepX = totalMoveX / horizontalSteps;
      const stepZ = totalMoveZ / horizontalSteps;
      const jumpingIntoLedge = this.verticalVelocity > 0.01;
      const stepUpLimit = jumpingIntoLedge
        ? PLAYER_JUMP_LEDGE_CLIMB_HEIGHT
        : PLAYER_STEP_UP_HEIGHT;

      for (let i = 0; i < horizontalSteps; i += 1) {
        if (stepX !== 0) {
          const worldLimit = this.getWorldLimit();
          const nextX = THREE.MathUtils.clamp(this.playerPosition.x + stepX, -worldLimit, worldLimit);
          if (this.isCrouching && wasOnGround && !this.canCrouchHoldPosition(nextX, this.playerPosition.z)) {
            continue;
          }
          if (!this.isPlayerCollidingAt(nextX, this.playerPosition.y, this.playerPosition.z)) {
            this.playerPosition.x = nextX;
          } else if (
            (wasOnGround || jumpingIntoLedge) &&
            this.tryStepUpMovement(nextX, this.playerPosition.z, stepUpLimit)
          ) {
            this.fallStartY = this.playerPosition.y;
          }
        }

        if (stepZ !== 0) {
          const worldLimit = this.getWorldLimit();
          const nextZ = THREE.MathUtils.clamp(this.playerPosition.z + stepZ, -worldLimit, worldLimit);
          if (this.isCrouching && wasOnGround && !this.canCrouchHoldPosition(this.playerPosition.x, nextZ)) {
            continue;
          }
          if (!this.isPlayerCollidingAt(this.playerPosition.x, this.playerPosition.y, nextZ)) {
            this.playerPosition.z = nextZ;
          } else if (
            (wasOnGround || jumpingIntoLedge) &&
            this.tryStepUpMovement(this.playerPosition.x, nextZ, stepUpLimit)
          ) {
            this.fallStartY = this.playerPosition.y;
          }
        }
      }
    }

    this.verticalVelocity += PLAYER_GRAVITY * delta;
    const verticalMove = this.verticalVelocity * delta;
    const verticalSteps = Math.max(1, Math.ceil(Math.abs(verticalMove) / 0.2));
    const verticalStep = verticalMove / verticalSteps;

    for (let i = 0; i < verticalSteps; i += 1) {
      const nextY = this.playerPosition.y + verticalStep;
      if (!this.isPlayerCollidingAt(this.playerPosition.x, nextY, this.playerPosition.z)) {
        this.playerPosition.y = nextY;
      } else {
        if (this.verticalVelocity > 0) {
          this.playerPosition.y = Math.floor(this.playerPosition.y) + 0.999;
        }
        this.verticalVelocity = 0;
        break;
      }
    }

    if (this.playerPosition.y < VOID_DEATH_Y) {
      this.onGround = false;
      this.reportHazardDamage(VOID_FATAL_DAMAGE, "void");
      return;
    }

    const supportedY = this.getSupportedPlayerY(
      this.playerPosition.x,
      this.playerPosition.z,
      this.playerPosition.y,
      {
        maxDrop: Math.max(1.2, PLAYER_GROUND_SNAP_DOWN + 0.18),
        maxRise: PLAYER_STEP_UP_HEIGHT,
        fallbackToGlobalSurface: false
      }
    );
    if (!Number.isFinite(supportedY)) {
      this.onGround = false;
      return;
    }

    const floorY = supportedY;
    const toFloor = floorY - this.playerPosition.y;

    // Avoid full-block instant snap-up that causes visible camera hitching.
    if (toFloor > 0) {
      if (toFloor <= PLAYER_STEP_UP_HEIGHT && this.verticalVelocity <= 0.01) {
        const lift = Math.min(toFloor, PLAYER_STEP_UP_SPEED * delta);
        const liftedY = this.playerPosition.y + lift;
        if (!this.isPlayerCollidingAt(this.playerPosition.x, liftedY, this.playerPosition.z)) {
          this.playerPosition.y = liftedY;
        }
        if (floorY - this.playerPosition.y <= 0.02) {
          this.playerPosition.y = floorY;
          this.verticalVelocity = 0;
          this.onGround = true;
          this.fallStartY = this.playerPosition.y;
        } else {
          this.onGround = false;
        }
      } else {
        this.onGround = false;
      }
      return;
    }

    const fallDistance = this.playerPosition.y - floorY;
    if (fallDistance <= PLAYER_GROUND_SNAP_DOWN && this.verticalVelocity <= 0) {
      const landingY = floorY;
      const dropHeight = this.fallStartY - landingY;
      this.playerPosition.y = floorY;
      this.verticalVelocity = 0;
      this.onGround = true;
      this.fallStartY = this.playerPosition.y;
      if (!wasOnGround) {
        const damage = this.computeFallDamage(dropHeight);
        if (damage > 0) {
          this.reportHazardDamage(damage, "fall");
        }
      }
      return;
    }

    this.onGround = false;
  }

  tryStepUpMovement(nextX, nextZ, maxLift) {
    const targetY = this.getSupportedPlayerY(nextX, nextZ, this.playerPosition.y, {
      maxDrop: 0.28,
      maxRise: maxLift,
      fallbackToGlobalSurface: false
    });
    if (!Number.isFinite(targetY)) {
      return false;
    }
    const liftNeeded = targetY - this.playerPosition.y;
    if (liftNeeded <= 0.001 || liftNeeded > maxLift) {
      return false;
    }

    if (this.isPlayerCollidingAt(nextX, targetY, nextZ)) {
      return false;
    }

    this.playerPosition.x = nextX;
    this.playerPosition.z = nextZ;
    this.playerPosition.y = targetY;
    this.verticalVelocity = 0;
    this.onGround = true;
    return true;
  }

  updateCamera(delta) {
    const gunMode = this.buildSystem.isGunMode();
    const digMode = this.buildSystem.isDigMode();
    const placeMode = this.buildSystem.isPlaceMode();
    const weaponDef = this.selectedWeaponDef ?? getWeaponDefinition(this.selectedWeaponId);
    const mobileMoveMagnitude = this.mobileEnabled
      ? Math.hypot(this.mobileState.moveForward, this.mobileState.moveStrafe)
      : 0;
    const isMoving =
      this.keys.has("KeyW") ||
      this.keys.has("KeyA") ||
      this.keys.has("KeyS") ||
      this.keys.has("KeyD") ||
      this.keys.has("ArrowUp") ||
      this.keys.has("ArrowDown") ||
      this.keys.has("ArrowLeft") ||
      mobileMoveMagnitude > 0.06;
    const sprinting =
      this.keys.has("ShiftLeft") ||
      this.keys.has("ShiftRight") ||
      (this.mobileEnabled && mobileMoveMagnitude >= MOBILE_SPRINT_THRESHOLD);
    const aiming =
      gunMode &&
      (this.isAiming || this.rightMouseAiming) &&
      this.isRunning &&
      !this.isGameOver &&
      !this.isUiInputFocused();
    this.aimBlend = THREE.MathUtils.damp(this.aimBlend, aiming ? 1 : 0, 12, delta);

    const bobSpeed = sprinting ? 13 : 9;
    this.weaponBobClock += delta * (isMoving ? bobSpeed : 3);

    const bobScale = Number(weaponDef.bobScale ?? 1);
    const bobAmount = ((isMoving ? 1 : 0.2) * bobScale) * (1 - this.aimBlend * 0.85);
    const bobX = Math.sin(this.weaponBobClock) * 0.012 * bobAmount;
    const bobY = Math.abs(Math.cos(this.weaponBobClock * 2)) * 0.012 * bobAmount;

    const recoilRecover = Number(weaponDef.recoilRecover ?? 8.5);
    const recoilDistance = Number(weaponDef.recoilDistance ?? 0.07);
    const recoilPitch = Number(weaponDef.recoilPitch ?? 0.18);
    this.weaponRecoil = Math.max(0, this.weaponRecoil - delta * recoilRecover);
    this.shovelSwingTimer = Math.max(0, this.shovelSwingTimer - delta);
    const recoil = this.weaponRecoil * recoilDistance * (1 - this.aimBlend * 0.6);

    const hipOffset = weaponDef.hipOffset ?? { x: 0.38, y: -0.38, z: -0.76 };
    const aimOffset = weaponDef.aimOffset ?? { x: 0, y: -0.24, z: -0.36 };
    const hipRotation = weaponDef.hipRotation ?? { x: -0.22, y: -0.06, z: 0.02 };
    const aimRotation = weaponDef.aimRotation ?? { x: -0.05, y: 0, z: 0 };
    let effectiveAimOffsetX = aimOffset.x;
    let effectiveAimOffsetY = aimOffset.y;
    let effectiveAimOffsetZ = aimOffset.z;
    const aimReference = this.weaponView?.userData?.aimReference ?? null;
    if (aimReference) {
      const aimTarget = weaponDef.aimReferenceTarget ?? { x: 0, y: 0, z: -0.18 };
      const viewScale = Math.max(0.001, Number(this.weaponView?.scale?.x ?? weaponDef.viewScale ?? 1));
      this.weaponAimEuler.set(aimRotation.x, aimRotation.y, aimRotation.z, "XYZ");
      this.weaponAimReferenceVec.copy(aimReference).multiplyScalar(viewScale);
      this.weaponAimRotatedVec.copy(this.weaponAimReferenceVec).applyEuler(this.weaponAimEuler);
      effectiveAimOffsetX = aimTarget.x - this.weaponAimRotatedVec.x;
      effectiveAimOffsetY = aimTarget.y - this.weaponAimRotatedVec.y;
    }
    const targetWeaponX = THREE.MathUtils.lerp(hipOffset.x, effectiveAimOffsetX, this.aimBlend);
    const targetWeaponY = THREE.MathUtils.lerp(hipOffset.y, effectiveAimOffsetY, this.aimBlend);
    const targetWeaponZ = THREE.MathUtils.lerp(hipOffset.z, effectiveAimOffsetZ, this.aimBlend);
    const aimBobSuppression = 1 - this.aimBlend * 0.96;
    const stabilizedBobX = bobX * aimBobSuppression;
    const stabilizedBobY = bobY * aimBobSuppression;
    this.weaponView.position.set(
      targetWeaponX + stabilizedBobX,
      targetWeaponY - stabilizedBobY,
      targetWeaponZ + recoil
    );
    this.weaponView.rotation.set(
      THREE.MathUtils.lerp(hipRotation.x, aimRotation.x, this.aimBlend) -
        this.weaponRecoil * recoilPitch +
        stabilizedBobY * 0.18,
      THREE.MathUtils.lerp(hipRotation.y, aimRotation.y, this.aimBlend) + stabilizedBobX * 0.26,
      THREE.MathUtils.lerp(hipRotation.z, aimRotation.z, this.aimBlend)
    );
    if (this.shovelView) {
      const shovelSwingPhase =
        this.shovelSwingTimer > 0 ? 1 - this.shovelSwingTimer / SHOVEL_SWING_DURATION : 0;
      const shovelSwing = this.shovelSwingTimer > 0 ? Math.sin(shovelSwingPhase * Math.PI) : 0;
      this.shovelView.position.set(
        0.28 + bobX * 0.11 - shovelSwing * 0.014,
        -0.26 - bobY * 0.11 - shovelSwing * 0.016,
        -0.48 + recoil * 0.02 - shovelSwing * 0.09
      );
      this.shovelView.rotation.set(
        0.1 + bobY * 0.03 - shovelSwing * 0.42,
        -0.3 + bobX * 0.04 + shovelSwing * 0.04,
        0.5 + bobX * 0.05 + shovelSwing * 0.07
      );
    }
    if (this.blockView) {
      this.updateBlockViewAppearance();
      this.blockView.position.set(
        0.3 + bobX * 0.32,
        -0.42 - bobY * 0.24,
        -0.56 + recoil * 0.05
      );
      this.blockView.rotation.set(
        -0.18 + bobY * 0.18,
        -0.42 + bobX * 0.7,
        0.08 + bobX * 0.14
      );
    }

    if (this.weaponFlash) {
      this.weaponFlash.material.opacity = gunMode
        ? Math.max(0, (this.weaponRecoil - 0.62) * 2.6)
        : 0;
    }
    if (this.weaponFlashLight) {
      if (gunMode) {
        const flare = Math.max(0, (this.weaponRecoil - 0.56) * 8.2);
        this.weaponFlashLight.intensity = flare * THREE.MathUtils.randFloat(1.2, 1.7);
      } else {
        this.weaponFlashLight.intensity = 0;
      }
    }

    const hideViewModel = this.isLobby3DActive() || this.isRespawning || this.localDeathAnimBlend > 0.04;
    const showScopeOverlay =
      gunMode &&
      weaponDef.id === "awp" &&
      !hideViewModel &&
      this.aimBlend >= 0.72;
    this.weaponView.visible =
      gunMode && !hideViewModel && !(weaponDef.id === "awp" && showScopeOverlay);
    if (this.shovelView) {
      this.shovelView.visible = digMode && !hideViewModel;
    }
    if (this.blockView) {
      this.blockView.visible = placeMode && !hideViewModel;
    }
    const showViewLighting = !hideViewModel && (gunMode || digMode || placeMode);
    this.weaponViewKeyLight.visible = showViewLighting;
    this.weaponViewFillLight.visible = showViewLighting;
    const movementSpread = isMoving ? 0.16 * bobScale : 0.04;
    const recoilSpread = this.weaponRecoil * 0.22;
    const aimTighten = this.aimBlend * (weaponDef.id === "awp" ? 0.48 : 0.28);
    this.hud.setCrosshairState({
      scale: Math.max(0.76, 1 + movementSpread + recoilSpread - aimTighten),
      opacity: gunMode
        ? THREE.MathUtils.lerp(
            0.95,
            weaponDef.id === "awp" ? 0 : 0.12,
            this.aimBlend
          )
        : 0.6
    });
    this.hud.setScopeOverlayVisible(showScopeOverlay);
    const weaponAimFov = Number(weaponDef.aimFov ?? AIM_FOV);
    const baseFov = gunMode
      ? THREE.MathUtils.lerp(DEFAULT_FOV, weaponAimFov, this.aimBlend)
      : DEFAULT_FOV;
    const nextFov = THREE.MathUtils.clamp(
      baseFov + this.getPortalFxFovBoost(),
      weaponAimFov - 4,
      DEFAULT_FOV + PORTAL_FX_DEPLOY_FOV_BOOST + 8
    );
    if (Math.abs(nextFov - this.lastAppliedFov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
      this.lastAppliedFov = nextFov;
    }
    if (this.isRespawning) {
      if (this.localDeathAnimStartAt <= 0) {
        this.localDeathAnimStartAt = Date.now();
      }
      const elapsedMs = Math.max(0, Date.now() - this.localDeathAnimStartAt);
      const targetBlend = THREE.MathUtils.clamp(elapsedMs / LOCAL_DEATH_FALL_MS, 0, 1);
      this.localDeathAnimBlend = Math.max(this.localDeathAnimBlend, targetBlend);
    } else if (this.localDeathAnimBlend > 0) {
      this.localDeathAnimBlend = Math.max(0, this.localDeathAnimBlend - delta * 5.5);
    }

    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
    if (this.localDeathAnimBlend > 0) {
      this.camera.position.y -= LOCAL_DEATH_OFFSET_Y * this.localDeathAnimBlend;
      this.camera.rotation.x += LOCAL_DEATH_PITCH * this.localDeathAnimBlend;
      this.camera.rotation.z = LOCAL_DEATH_ROLL * this.localDeathAnimBlend;
    } else {
      this.camera.rotation.z += this.getPortalFxCameraRoll();
    }
  }

  applyBufferedLookInput(isUiTyping = false) {
    if (this.pendingMouseLookX === 0 && this.pendingMouseLookY === 0) {
      return;
    }

    const controlActive = this.isRunning || this.isLobby3DActive();
    if (
      this.mobileEnabled ||
      !controlActive ||
      this.isGameOver ||
      this.optionsMenuOpen ||
      !this.mouseLookEnabled ||
      isUiTyping
    ) {
      this.pendingMouseLookX = 0;
      this.pendingMouseLookY = 0;
      return;
    }

    const currentAim = this.isRunning && (this.isAiming || this.rightMouseAiming);
    const lookScale = currentAim ? 0.58 : 1;
    const deltaX = THREE.MathUtils.clamp(this.pendingMouseLookX, -320, 320);
    const deltaY = THREE.MathUtils.clamp(this.pendingMouseLookY, -240, 240);

    this.yaw -= deltaX * 0.0022 * lookScale;
    this.pitch -= deltaY * 0.002 * lookScale;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);

    this.pendingMouseLookX = 0;
    this.pendingMouseLookY = 0;
  }

  tick(delta) {
    const lobbyActive = this.isLobby3DActive();
    this.syncRuntimePerformanceBudget(lobbyActive);

    this._bucketOptimizeCooldown -= delta;
    if (this._bucketOptimizeCooldown <= 0) {
      this._bucketOptimizeCooldown = BUCKET_OPTIMIZE_INTERVAL;
      if (this.voxelWorld.bucketOptimizeDirty) {
        this.voxelWorld.optimizeBucketRendering();
      }
    }

    this.updateTeamScoreHud();
    this.updateFlagInteractUi();

    this.updateSparks(delta);
    this.collapseSystem?.update?.(delta);
    this.updatePortalFx(delta);
    if (!lobbyActive) {
      const skyUpdateStep = Number(this.getRenderQualityProfile().skyUpdateStep) || 0;
      if (skyUpdateStep > 0) {
        this.skyUpdateAccumulator += delta;
        if (this.skyUpdateAccumulator >= skyUpdateStep) {
          this.updateSky(this.skyUpdateAccumulator);
          this.skyUpdateAccumulator = 0;
        }
      } else {
        this.skyUpdateAccumulator = 0;
        this.updateSky(delta);
      }
    } else {
      this.skyUpdateAccumulator = 0;
    }
    const isUiTyping = this.isUiInputFocused();
    this.applyBufferedLookInput(isUiTyping);
    if (!isUiTyping && !this.mouseLookEnabled) {
      this.restoreGameplayLookState({ preferPointerLock: false });
    }
    const gunMode = this.buildSystem.isGunMode();
    const digMode = this.buildSystem.isDigMode();
    const aiEnabled = this.activeMatchMode !== "online";
    this.buildSystem.updatePlacementPreview(
      (x, y, z) => !this.isPlayerIntersectingBlock(x, y, z),
      {
        lineMode: this.buildSystem.isPlaceMode() && this.lineBuildDragActive && this.lineBuildDragMoved,
        anchor: this.lineBuildDragActive ? this.buildSystem.getLineAnchor?.() ?? null : null
      }
    );

    if (gunMode && this.isRunning) {
      this.weapon.update(delta);
    }

    if (this.activeMatchMode === "online") {
      this.updateRemotePlayers(delta);
      if (!lobbyActive) {
        this.processPendingRemoteBlocks(delta);
      }
      this.emitLocalPlayerSync(delta);
    }

    this.updateOnlineRoundCountdown();
    this.updateRespawnCountdown();

    if (lobbyActive) {
      const canMoveInLobby = !this.optionsMenuOpen && !isUiTyping;
      if (canMoveInLobby) {
        this.applyMovement(delta);
        this.clampLobby3DPlayerBounds();
        this.updateCamera(delta);
      }
      this.updateLobby3D(delta);
      this.updateMinimap();
      this.hud.update(delta, {
        ...this.state,
        ...this.weapon.getState(),
        enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
      });
      return;
    }

    const inventoryOpen = this.buildSystem.isInventoryOpen();
    const requiresLockedLook =
      !inventoryOpen &&
      !this.mobileEnabled &&
      !this.mouseLookEnabled &&
      !isUiTyping &&
      !this.isRespawning;
    if (!this.isRunning || this.isGameOver) {
      this.updateMinimap();
      this.hud.update(delta, {
        ...this.state,
        ...this.weapon.getState(),
        enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
      });
      return;
    }
    if (requiresLockedLook) {
      this.updateCamera(delta);
      this.updateMinimap();
      this.hud.update(delta, {
        ...this.state,
        ...this.weapon.getState(),
        enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
      });
      return;
    }
    if (this.isRespawning) {
      this.leftMouseDown = false;
      this.rightMouseAiming = false;
      this.isAiming = false;
      this.verticalVelocity = 0;
      this.updateCamera(delta);
      this.updateMinimap();
      this.hud.update(delta, {
        ...this.state,
        ...this.weapon.getState(),
        enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
      });
      return;
    }

    if (gunMode && this.leftMouseDown) {
      this.fire();
    } else if (digMode && this.leftMouseDown && !this.buildSystem.isInventoryOpen()) {
      this.primaryActionRepeatTimer = Math.max(0, this.primaryActionRepeatTimer - delta);
      if (this.primaryActionRepeatTimer <= 0) {
        this.buildSystem.handlePointerAction(0, (x, y, z) => !this.isPlayerIntersectingBlock(x, y, z));
        this.primaryActionRepeatTimer = DIG_HOLD_REPEAT_INTERVAL;
      }
    }

    this.applyMovement(delta);
    this.updateCamera(delta);
    this.updateObjectives(delta);
    this.updateLocalBaseSupport(delta);

    const weapState = this.weapon.getState();
    if (gunMode && !this._wasReloading && weapState.reloading) {
      this.sound.play("reload", { gain: 0.9, rateJitter: 0.03 });
    }
    this._wasReloading = gunMode ? weapState.reloading : false;

    if (aiEnabled) {
      const arenaHalfExtent = Number(this.voxelWorld?.getArenaMeta?.()?.halfExtent ?? WORLD_LIMIT);
      const combatResult = this.enemyManager.update(delta, this.playerPosition, {
        alphaBase: this.objective.alphaBase,
        bravoBase: this.objective.bravoBase,
        controlPoint: this.objective.controlPoint,
        controlRadius: this.objective.controlRadius,
        controlOwner: this.objective.controlOwner,
        playerHasEnemyFlag: this.objective.playerHasEnemyFlag,
        playerCrouched: this.isCrouching,
        halfExtent: arenaHalfExtent
      });

      const damage = combatResult.damage ?? 0;
      if (damage > 0) {
        this.state.health = Math.max(0, this.state.health - damage);
        this.hud.flashDamage();
        this.hud.setStatus(`피해 -${damage}`, true, 0.35);
        this.addChatMessage(`피해 -${damage} HP`, "damage");
        if (this.state.health <= 25 && this.state.health > 0) {
          this.addChatMessage("체력이 낮습니다", "warning");
        }
      } else if (combatResult.firedShots > 0) {
        this.hud.setStatus("아쉽습니다! 탄환이 빗나갔습니다", true, 0.16);
      }
    }

    if (this.state.health <= 0) {
      this.isGameOver = true;
      this.isRunning = false;
      this.leftMouseDown = false;
      this.rightMouseAiming = false;
      if (this.objective.playerHasEnemyFlag) {
        this.objective.playerHasEnemyFlag = false;
        if (this.bravoFlag) {
          this.bravoFlag.visible = true;
          this.bravoFlag.position.copy(this.objective.bravoFlagHome);
        }
      }
      this.addChatMessage("작전 실패. 다시 배치 후 전선을 회복하세요.", "warning");
      this.hud.showGameOver(this.state.score);
      this.syncCursorVisibility();
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    }

    this.updateMinimap();
    this.hud.update(delta, {
      ...this.state,
      ...weapState,
      enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
    });
  }

  applyLowSpecMode() {
    if (!ADAPTIVE_QUALITY_ENABLED) {
      return;
    }
    if (this.lowSpecModeApplied) {
      return;
    }
    this.applyRenderQualityMode("low", { persist: true, announce: false });
    this.hud.setStatus("저사양 최적화 모드를 자동 적용했습니다.", false, 1.1);
  }

  trackFrameTiming(delta) {
    const frameMs = Math.max(0, delta * 1000);
    const stats = this.perfStats;
    stats.frameCount += 1;
    stats.totalMs += frameMs;
    if (frameMs >= PERF_SLOW_FRAME_MS) {
      stats.slowFrames += 1;
    }
    stats.worstMs = Math.max(stats.worstMs, frameMs);

    const now = getNowMs();
    if (now - stats.lastReportAt < PERF_REPORT_INTERVAL_MS) {
      return;
    }

    const avgMs = stats.frameCount > 0 ? stats.totalMs / stats.frameCount : 0;
    if (ADAPTIVE_QUALITY_ENABLED && !this.lowSpecModeApplied && this.isRunning) {
      if (avgMs >= ADAPTIVE_QUALITY_LOW_FPS_MS) {
        this.lowFpsStrikes += 1;
        if (this.lowFpsStrikes >= ADAPTIVE_QUALITY_STRIKE_LIMIT) {
          this.applyLowSpecMode();
          this.lowFpsStrikes = 0;
        }
      } else {
        this.lowFpsStrikes = 0;
      }
    }

    if (this.perfDebugEnabled && (stats.slowFrames > 0 || stats.worstMs >= PERF_SLOW_FRAME_MS)) {
      console.warn(
        `[perf] avg=${avgMs.toFixed(2)}ms slow=${stats.slowFrames}/${stats.frameCount} ` +
          `worst=${stats.worstMs.toFixed(2)}ms pendingBlocks=${this.pendingRemoteBlocks.size}`
      );
    }

    stats.frameCount = 0;
    stats.totalMs = 0;
    stats.slowFrames = 0;
    stats.worstMs = 0;
    stats.lastReportAt = now;
  }

  loop() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.trackFrameTiming(delta);
    this.tick(delta);
    this.voxelWorld.flushDirtyBounds();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }

  onResize() {
    this.mobileEnabled = this.mobileModeLocked || isLikelyTouchDevice();
    if (this.mobileEnabled) {
      this.mobileModeLocked = true;
      this.allowUnlockedLook = true;
    }
    if (this.mobileEnabled && !this._mobileBound) {
      this.setupMobileControls();
    }
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.lastAppliedFov = this.camera.fov;
    const effectiveCap = this.getEffectivePixelRatioCap(this.isLobby3DActive());
    this._lastAppliedPixelRatioCap = effectiveCap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, effectiveCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.syncRuntimePerformanceBudget(this.isLobby3DActive());
    this.updateMobileControlsVisibility();
    this.syncMinimapVisibility();
    this.updateMinimap(true);
  }

  tryPointerLock(options = {}) {
    const fallbackUnlockedLook = Boolean(options?.fallbackUnlockedLook);
    if (this.mobileEnabled) {
      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
      this.hud.showPauseOverlay(false);
      this.syncCursorVisibility();
      return;
    }
    if (
      !this.pointerLockSupported ||
      this.pointerLocked ||
      this.optionsMenuOpen ||
      this.buildSystem.isInventoryOpen() ||
      this.isUiInputFocused()
    ) {
      return;
    }

    this.unlockLookOnNextPointerLockFailure = fallbackUnlockedLook;
    const maybePromise = this.renderer.domElement.requestPointerLock();
    this.schedulePointerLockFallback();
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {
        const controlActive = this.isRunning || this.isLobby3DActive();
        if (!controlActive || this.isGameOver) {
          return;
        }
        if (fallbackUnlockedLook) {
          this.unlockLookOnNextPointerLockFailure = false;
          this.allowUnlockedLook = true;
          this.mouseLookEnabled = true;
          this.hud.showPauseOverlay(false);
          this.hud.setStatus("화면 클릭 시 포인터 락으로 전환됩니다.", false, 1.1);
          this.syncCursorVisibility();
          return;
        }
        this.mouseLookEnabled = this.allowUnlockedLook;
        this.hud.showPauseOverlay(false);
        if (!this.allowUnlockedLook) {
          this.hud.setStatus("화면 클릭 후 다시 시도하세요.", true, 0.9);
        }
        this.syncCursorVisibility();
      });
    }
  }

  syncCursorVisibility() {
    this.updateMobileControlsVisibility();
    this.syncQuickSettingsVisibility();
    this.syncMinimapVisibility();
    if (this.mobileEnabled) {
      document.body.style.cursor = "";
      this.renderer.domElement.style.cursor = "";
      return;
    }

    const controlActive = this.isRunning || this.isLobby3DActive();
    const desktopLocked = this.pointerLocked && !this.mobileEnabled;
    const hideCursor =
      controlActive &&
      !this.isGameOver &&
      !this.optionsMenuOpen &&
      !this.buildSystem.isInventoryOpen() &&
      desktopLocked &&
      (this.mouseLookEnabled || this.rightMouseAiming || this.isAiming) &&
      !this.isUiInputFocused();
    const cursor = hideCursor ? "none" : "";
    document.body.style.cursor = cursor;
    this.renderer.domElement.style.cursor = cursor;
  }

  restoreGameplayLookState({ preferPointerLock = false } = {}) {
    const controlActive = this.isRunning || this.isLobby3DActive();
    const shouldPreferPointerLock =
      Boolean(preferPointerLock) && !this.mobileEnabled && this.pointerLockSupported;
    if (
      !controlActive ||
      this.isGameOver ||
      this.optionsMenuOpen ||
      this.buildSystem.isInventoryOpen() ||
      this.isUiInputFocused()
    ) {
      return false;
    }

    if (this.mobileEnabled) {
      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
      return true;
    }

    if (this.pointerLocked) {
      this.mouseLookEnabled = true;
      return true;
    }

    if (shouldPreferPointerLock) {
      this.tryPointerLock({ fallbackUnlockedLook: true });
      return true;
    }

    if (this.allowUnlockedLook) {
      this.mouseLookEnabled = true;
      return true;
    }

    this.allowUnlockedLook = true;
    this.mouseLookEnabled = true;
    return true;
  }

  updateVisualMode(mode) {
    const lobbyActive = this.isLobby3DActive();
    const startMenuActive = !this.isRunning && !lobbyActive;
    const build = !lobbyActive && mode !== "gun" && mode !== "weapon";
    document.body.classList.toggle("ui-mode-build", build);
    document.body.classList.toggle("ui-mode-combat", !build);
    document.body.classList.toggle("ui-lobby", lobbyActive);
    document.body.classList.toggle("ui-start-menu", startMenuActive);
    this.syncMinimapVisibility();
  }

  getDesiredCrouchState() {
    return (
      this.mobileCrouchToggle ||
      this.keys.has("ControlLeft") ||
      this.keys.has("ControlRight")
    );
  }

  getPlayerHeight(crouched = this.isCrouching) {
    return crouched ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
  }

  setCrouchState(nextCrouched, { force = false } = {}) {
    const crouched = Boolean(nextCrouched);
    const currentHeight = this.getPlayerHeight(this.isCrouching);
    const nextHeight = this.getPlayerHeight(crouched);
    if (!force && crouched === this.isCrouching) {
      return crouched;
    }

    const feetY = this.playerPosition.y - currentHeight;
    const nextPlayerY = feetY + nextHeight;
    if (!force && !crouched && this.isPlayerCollidingAt(this.playerPosition.x, nextPlayerY, this.playerPosition.z, { playerHeight: nextHeight })) {
      return this.isCrouching;
    }

    this.isCrouching = crouched;
    this.currentPlayerHeight = nextHeight;
    this.playerPosition.y = nextPlayerY;
    return this.isCrouching;
  }

  updateCrouchState() {
    const wantsCrouch = this.getDesiredCrouchState();
    this.setCrouchState(wantsCrouch);
  }

  canCrouchHoldPosition(nextX, nextZ) {
    const supportedY = this.getSupportedPlayerY(nextX, nextZ, this.playerPosition.y, {
      maxDrop: 0.32,
      maxRise: PLAYER_STEP_UP_HEIGHT,
      fallbackToGlobalSurface: false
    });
    if (!Number.isFinite(supportedY)) {
      return false;
    }
    const drop = this.playerPosition.y - supportedY;
    return drop <= PLAYER_CROUCH_EDGE_LOCK_DROP;
  }

  isPlayerCollidingAt(positionX, positionY, positionZ, { playerHeight = this.currentPlayerHeight ?? PLAYER_HEIGHT } = {}) {
    const feetY = positionY - playerHeight;
    const headY = positionY;
    const minX = Math.floor(positionX - PLAYER_RADIUS);
    const maxX = Math.floor(positionX + PLAYER_RADIUS);
    const minY = Math.floor(feetY);
    const maxY = Math.floor(headY - 0.0001);
    const minZ = Math.floor(positionZ - PLAYER_RADIUS);
    const maxZ = Math.floor(positionZ + PLAYER_RADIUS);

    const playerMinX = positionX - PLAYER_RADIUS;
    const playerMaxX = positionX + PLAYER_RADIUS;
    const playerMinY = feetY;
    const playerMaxY = headY;
    const playerMinZ = positionZ - PLAYER_RADIUS;
    const playerMaxZ = positionZ + PLAYER_RADIUS;

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          if (!this.voxelWorld.hasBlock(x, y, z)) {
            continue;
          }

          const blockMinX = x;
          const blockMaxX = x + 1;
          const blockMinY = y;
          const blockMaxY = y + 1;
          const blockMinZ = z;
          const blockMaxZ = z + 1;

          const separated =
            playerMaxX <= blockMinX ||
            playerMinX >= blockMaxX ||
            playerMaxY <= blockMinY ||
            playerMinY >= blockMaxY ||
            playerMaxZ <= blockMinZ ||
            playerMinZ >= blockMaxZ;

          if (!separated) {
            return true;
          }
        }
      }
    }

    return false;
  }

  isPlayerIntersectingBlock(blockX, blockY, blockZ) {
    const feetY = this.playerPosition.y - this.getPlayerHeight();
    const headY = this.playerPosition.y;

    const playerMinX = this.playerPosition.x - PLAYER_RADIUS;
    const playerMaxX = this.playerPosition.x + PLAYER_RADIUS;
    const playerMinY = feetY;
    const playerMaxY = headY;
    const playerMinZ = this.playerPosition.z - PLAYER_RADIUS;
    const playerMaxZ = this.playerPosition.z + PLAYER_RADIUS;

    const blockMinX = blockX;
    const blockMaxX = blockX + 1;
    const blockMinY = blockY;
    const blockMaxY = blockY + 1;
    const blockMinZ = blockZ;
    const blockMaxZ = blockZ + 1;

    return !(
      playerMaxX <= blockMinX ||
      playerMinX >= blockMaxX ||
      playerMaxY <= blockMinY ||
      playerMinY >= blockMaxY ||
      playerMaxZ <= blockMinZ ||
      playerMinZ >= blockMaxZ
    );
  }

  spawnHitSpark(position, { color = 0xd6eeff, scale = 0.75, lift = 0.35, ttl = 0.18 } = {}) {
    if (!position) {
      return;
    }

    if (this.hitSparks.length >= MAX_ACTIVE_HIT_SPARKS) {
      const overflowCount = this.hitSparks.length - MAX_ACTIVE_HIT_SPARKS + 1;
      for (let i = 0; i < overflowCount; i += 1) {
        const oldest = this.hitSparks.shift();
        if (!oldest) {
          break;
        }
        this.scene.remove(oldest.sprite);
        oldest.sprite.material.dispose();
      }
    }

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.graphics.sparkMap,
        color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    sprite.scale.setScalar(scale);
    sprite.position.copy(position);
    sprite.position.y += lift;
    this.scene.add(sprite);
    this.hitSparks.push({
      sprite,
      life: ttl,
      ttl
    });
  }

  updateSparks(delta) {
    for (let i = this.hitSparks.length - 1; i >= 0; i -= 1) {
      const spark = this.hitSparks[i];
      spark.life -= delta;
      const t = Math.max(0, spark.life / spark.ttl);
      spark.sprite.material.opacity = t;
      spark.sprite.scale.setScalar(0.75 + (1 - t) * 0.6);

      if (spark.life <= 0) {
        this.scene.remove(spark.sprite);
        spark.sprite.material.dispose();
        this.hitSparks.splice(i, 1);
      }
    }
  }

  addChatMessage(text, type = "info") {
    if (!this.chat) {
      return;
    }
    const level = type === "warning" || type === "damage" ? "system-err" : "system";
    this.chat.addSystemMessage(text, level);
  }

  clearChatMessages() {
    this.chat?.clear();
  }

  setupLobbySocket() {
    const socket = this.chat?.socket;
    if (!socket || this._lobbySocketBound) {
      return;
    }

    this._lobbySocketBound = true;

    socket.on("connect", () => {
      this.syncLobbyNicknameInputs(this.chat?.playerName ?? "", { force: false });
      this.refreshOnlineStatus();
      this.requestRoomList();
      this.joinDefaultRoom();
    });

    socket.on("disconnect", () => {
      this._joiningDefaultRoom = false;
      this.refreshOnlineStatus();
      this.setLobbyState(null);
      this.renderRoomList([]);
      this.clearRemotePlayers();
    });

    socket.on("room:list", (rooms) => {
      this.renderRoomList(rooms);
    });

    socket.on("room:update", (room) => {
      this.setLobbyState(room);
      this.requestRoomList();
    });

    socket.on("leaderboard:daily", (payload = {}) => {
      this.applyDailyLeaderboardPayload(payload);
    });

    socket.on("room:snapshot", (payload) => {
      this.applyRoomSnapshot(payload);
    });

    socket.on("portal:entered", (payload = {}) => {
      this.handleLobbyPortalEntered(payload);
    });

    socket.on("inventory:update", (payload = {}) => {
      this.applyInventorySnapshot(payload.stock, { quiet: true });
    });

    socket.on("player:sync", (payload) => {
      this.handleRemotePlayerSync(payload);
    });

    socket.on("block:update", (payload) => {
      this.applyRemoteBlockUpdate(payload);
    });

    socket.on("pvp:damage", (payload) => {
      this.handlePvpDamage(payload);
    });

    socket.on("pvp:immune", (payload) => {
      this.handlePvpImmune(payload);
    });

    socket.on("player:respawn", (payload) => {
      this.handlePlayerRespawn(payload);
    });

    socket.on("ctf:update", (payload) => {
      this.applyOnlineStatePayload(payload, { showEvent: true });
    });

    socket.on("match:end", (payload) => {
      this.handleOnlineMatchEnd(payload);
    });

    socket.on("room:started", ({ code, startedAt, mapId }) => {
      if (!code || this.lobbyState.roomCode !== code) {
        return;
      }
      const roundMapId = normalizeOnlineMapId(mapId ?? this.onlineMapId);
      this.onlineMapId = roundMapId;
      if (!this.isRunning || this.activeMatchMode === "online") {
        this.mapId = roundMapId;
      }
      const startedAtNum = Number(startedAt);
      const roundStartedAt = Number.isFinite(startedAtNum) ? Math.max(0, Math.trunc(startedAtNum)) : 0;
      if (roundStartedAt > 0 && this.lastRoomStartedAt > 0 && roundStartedAt <= this.lastRoomStartedAt) {
        return;
      }
      if (roundStartedAt > 0) {
        this.lastRoomStartedAt = roundStartedAt;
      }

      const alreadyRunningOnline =
        this.activeMatchMode === "online" && this.isRunning && !this.onlineRoundEnded;
      this.setOnlineRoundState({
        ended: false,
        winnerTeam: null,
        restartAt: 0,
        targetScore: this.onlineTargetScore,
        announce: false
      });
      if (alreadyRunningOnline) {
        this.hud.setStatus(`온라인 라운드 갱신 (${code})`, false, 0.8);
        this.requestRoomSnapshot();
        return;
      }
      const mapMeta = MAP_DISPLAY_META[roundMapId] ?? this.getCurrentMapDisplayMeta();
      this.hud.setStatus(`온라인 매치 시작: ${mapMeta.name}`, false, 1);
      this.start({ mode: "online" });
    });

    socket.on("room:error", (message) => {
      const text = String(message ?? "로비 오류");
      this.hud.setStatus(text, true, 1.2);
      if (this.mpStatusEl) {
        this.mpStatusEl.textContent = `로비 오류: ${text}`;
        this.mpStatusEl.dataset.state = "error";
      }
    });

    this.requestRoomList();
    this.joinDefaultRoom();
  }

  requestRoomList() {
    const socket = this.chat?.socket;
    if (!socket || !socket.connected) {
      this.renderRoomList([]);
      return;
    }
    socket.emit("room:list");
  }

  requestRoomSnapshot() {
    const socket = this.chat?.socket;
    if (!socket || !socket.connected || !this.lobbyState.roomCode) {
      return;
    }

    socket.emit("room:request-snapshot", (response = {}) => {
      if (!response.ok) {
        return;
      }
      const snapshot = response.snapshot ?? null;
      if (snapshot) {
        this.applyRoomSnapshot(snapshot);
      }
    });
  }

  joinDefaultRoom({ force = false } = {}) {
    const socket = this.chat?.socket;
    if (!socket || !socket.connected) {
      return;
    }

    if (this.lobbyState.roomCode === ONLINE_ROOM_CODE) {
      return;
    }

    const now = Date.now();
    if (!force && now < this._nextAutoJoinAt) {
      return;
    }
    if (this._joiningDefaultRoom) {
      return;
    }

    this._joiningDefaultRoom = true;
    socket.emit("room:quick-join", {
      name: this.chat?.playerName,
      role: this.onlineEntryRole
    }, (response = {}) => {
      this._joiningDefaultRoom = false;
      if (!response.ok) {
        this._nextAutoJoinAt = Date.now() + 1800;
        this.hud.setStatus(response.error ?? "온라인 방 참가에 실패했습니다.", true, 1);
        this.refreshOnlineStatus();
        return;
      }
      this._nextAutoJoinAt = 0;
      this.setLobbyState(response.room ?? null);
      this.pushSelectedWeaponToServer(this.selectedWeaponId, { quiet: true });
      this.refreshOnlineStatus();
    });
  }

  renderRoomList(rooms) {
    if (!this.mpRoomListEl) {
      this.syncOnlineHubSummary();
      return;
    }

    const list = Array.isArray(rooms) ? rooms : [];
    const connected = !!this.chat?.isConnected?.();
    if (!connected) {
      this.onlineRoomCount = 0;
      this.mpRoomListEl.innerHTML =
        '<div class="mp-empty">서버 연결을 시도 중입니다. 잠시 후 다시 시도해 주세요.</div>';
      this.syncOnlineHubSummary();
      return;
    }

    const globalRoom =
      list.find((room) => String(room.code ?? "").toUpperCase() === ONLINE_ROOM_CODE) ??
      list[0] ??
      null;
    if (!globalRoom) {
      this.onlineRoomCount = 0;
      this.mpRoomListEl.innerHTML = '<div class="mp-empty">GLOBAL 방 정보를 불러오지 못했습니다.</div>';
      this.syncOnlineHubSummary();
      return;
    }

    const playerCount = Number(globalRoom.count ?? this.lobbyState.players.length ?? 0);
    this.onlineRoomCount = Math.max(0, Math.trunc(playerCount));
    this.mpRoomListEl.innerHTML =
      `<div class="mp-room-row is-single">` +
      `<div class="mp-room-label">${ONLINE_ROOM_CODE}  ${playerCount}/${ONLINE_MAX_PLAYERS}` +
      `<span class="mp-room-host">24시간 운영</span>` +
      `</div>` +
      `</div>`;
    this.syncOnlineHubSummary();
  }

  syncLobbyNicknameInputs(name, { force = false } = {}) {
    const safeName = String(name ?? "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 16);
    if (!safeName) {
      return;
    }

    const menuFocused = document.activeElement === this.mpNameInput;
    const quickFocused = document.activeElement === this.lobbyQuickNameInput;

    if (this.mpNameInput && (force || !menuFocused)) {
      this.mpNameInput.value = safeName;
    }
    if (this.lobbyQuickNameInput && (force || !quickFocused)) {
      this.lobbyQuickNameInput.value = safeName;
    }
  }

  normalizeDailyLeaderboardPayload(payload = null) {
    const source = payload && typeof payload === "object" ? payload : {};
    const dateKey = String(source.dateKey ?? "").trim();
    const resetAtRaw = Number(source.resetAt);
    const updatedAtRaw = Number(source.updatedAt);
    const playersRaw = Array.isArray(source.players) ? source.players : [];

    const players = playersRaw
      .map((entry) => {
        const name = String(entry?.name ?? "PLAYER")
          .trim()
          .replace(/\s+/g, "_")
          .slice(0, 16) || "PLAYER";
        const captures = Math.max(0, Math.trunc(Number(entry?.captures ?? 0)));
        const kills = Math.max(0, Math.trunc(Number(entry?.kills ?? 0)));
        const deaths = Math.max(0, Math.trunc(Number(entry?.deaths ?? 0)));
        const rankRaw = Number(entry?.rank);
        const rank = Number.isFinite(rankRaw) ? Math.max(1, Math.trunc(rankRaw)) : null;
        return {
          rank,
          name,
          captures,
          kills,
          deaths,
          key: String(entry?.key ?? "").trim()
        };
      })
      .filter((entry) => entry.name)
      .slice(0, 16);

    return {
      dateKey,
      resetAt: Number.isFinite(resetAtRaw) ? Math.max(0, Math.trunc(resetAtRaw)) : 0,
      updatedAt: Number.isFinite(updatedAtRaw) ? Math.max(0, Math.trunc(updatedAtRaw)) : 0,
      players
    };
  }

  getDailyLeaderboardRows(limit = 6) {
    const maxCount = Math.max(1, Math.trunc(Number(limit) || 6));
    const fromServer = Array.isArray(this.dailyLeaderboard?.players) ? this.dailyLeaderboard.players : [];
    if (fromServer.length > 0) {
      return fromServer.slice(0, maxCount).map((entry, index) => ({
        rank: Number.isFinite(entry.rank) ? entry.rank : index + 1,
        name: entry.name,
        captures: Math.max(0, Math.trunc(Number(entry.captures ?? 0))),
        kills: Math.max(0, Math.trunc(Number(entry.kills ?? 0))),
        deaths: Math.max(0, Math.trunc(Number(entry.deaths ?? 0)))
      }));
    }

    const players = Array.isArray(this.lobbyState.players) ? this.lobbyState.players : [];
    return players
      .slice()
      .sort((a, b) => {
        const capturesA = Math.max(0, Math.trunc(Number(a?.captures ?? 0)));
        const capturesB = Math.max(0, Math.trunc(Number(b?.captures ?? 0)));
        if (capturesA !== capturesB) {
          return capturesB - capturesA;
        }
        const killsA = Math.max(0, Math.trunc(Number(a?.kills ?? 0)));
        const killsB = Math.max(0, Math.trunc(Number(b?.kills ?? 0)));
        if (killsA !== killsB) {
          return killsB - killsA;
        }
        const deathsA = Math.max(0, Math.trunc(Number(a?.deaths ?? 0)));
        const deathsB = Math.max(0, Math.trunc(Number(b?.deaths ?? 0)));
        if (deathsA !== deathsB) {
          return deathsA - deathsB;
        }
        return String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
      })
      .slice(0, maxCount)
      .map((player, index) => ({
        rank: index + 1,
        name: String(player?.name ?? "PLAYER"),
        captures: Math.max(0, Math.trunc(Number(player?.captures ?? 0))),
        kills: Math.max(0, Math.trunc(Number(player?.kills ?? 0))),
        deaths: Math.max(0, Math.trunc(Number(player?.deaths ?? 0)))
      }));
  }

  applyDailyLeaderboardPayload(payload = null) {
    const normalized = this.normalizeDailyLeaderboardPayload(payload);
    const signature = `${normalized.dateKey}|${normalized.resetAt}|${normalized.players
      .map((entry) => `${entry.rank ?? "-"}:${entry.name}:${entry.captures}:${entry.kills}:${entry.deaths}`)
      .join("|")}`;
    if (signature === this._dailyLeaderboardSignature) {
      return;
    }

    this.dailyLeaderboard = normalized;
    this._dailyLeaderboardSignature = signature;
    this._lastLobbyQuickRankSignature = "";
    this.renderLobbyRankBoard(true);
    this.updateLobbyQuickPanel();
  }

  updateLobbyQuickPanel() {
    if (!this.lobbyQuickPanelEl) {
      return;
    }
    const show = false;
    if (this._lastLobbyQuickPanelVisible !== show) {
      this.lobbyQuickPanelEl.classList.toggle("show", show);
      this.lobbyQuickPanelEl.setAttribute("aria-hidden", show ? "false" : "true");
      this._lastLobbyQuickPanelVisible = show;
    }
    if (!show) {
      return;
    }

    const connected = !!this.chat?.isConnected?.();
    const inRoom = Boolean(this.lobbyState.roomCode);
    const players = Array.isArray(this.lobbyState.players) ? this.lobbyState.players : [];
    const count = players.length;
    const alphaCount = players.filter((player) => player?.team === "alpha").length;
    const bravoCount = players.filter((player) => player?.team === "bravo").length;

    if (this.lobbyQuickCountEl) {
      let nextText = "";
      if (!connected) {
        nextText = "서버 연결 중...";
      } else if (!inRoom) {
        nextText = "GLOBAL 자동 참가 중...";
      } else {
        nextText =
          `대기 인원 ${count}/${ONLINE_MAX_PLAYERS} | 블루 ${alphaCount} 레드 ${bravoCount} | TAB 순위`;
      }
      if (nextText !== this._lastLobbyQuickCountText) {
        this.lobbyQuickCountEl.textContent = nextText;
        this._lastLobbyQuickCountText = nextText;
      }
    }

    if (this.lobbyQuickGuideEl) {
      let guideText = "";
      if (!connected) {
        guideText = "연결 후 포탈(훈련장/온라인 허브/시뮬라크 월드) 사용 가능";
      } else if (!inRoom) {
        guideText = "GLOBAL 참가 대기 중 · 이동 WASD · 순위 TAB · 채팅 T/Enter";
      } else {
        guideText = "포탈 4개 사용 가능 · 닉네임 변경 가능 · 순위 TAB";
      }
      if (guideText !== this._lastLobbyQuickGuideText) {
        this.lobbyQuickGuideEl.textContent = guideText;
        this._lastLobbyQuickGuideText = guideText;
      }
    }

    if (this.lobbyQuickRankListEl) {
      const myName = String(this.chat?.playerName ?? "")
        .trim()
        .toLowerCase();
      const rankMode = connected && inRoom ? "live" : connected ? "queue" : "offline";
      const ranked = this.getDailyLeaderboardRows(6);
      const rankPayload = ranked
        .map((entry) => {
          const name = String(entry?.name ?? "PLAYER");
          const captures = Math.max(0, Math.trunc(Number(entry?.captures ?? 0)));
          const kills = Math.max(0, Math.trunc(Number(entry?.kills ?? 0)));
          const deaths = Math.max(0, Math.trunc(Number(entry?.deaths ?? 0)));
          const rank = Math.max(1, Math.trunc(Number(entry?.rank ?? 0) || 0));
          return `${rank}:${name}:${captures}:${kills}:${deaths}`;
        })
        .join("|");
      const rankSignature = `${rankMode}|${rankPayload}`;
      if (rankSignature !== this._lastLobbyQuickRankSignature) {
        this.lobbyQuickRankListEl.innerHTML = "";
        if (rankMode !== "live") {
          const emptyEl = document.createElement("div");
          emptyEl.className = "lobby-quick-rank-empty";
          emptyEl.textContent =
            rankMode === "offline" ? "서버 연결 후 순위가 표시됩니다." : "GLOBAL 참가 후 순위가 표시됩니다.";
          this.lobbyQuickRankListEl.appendChild(emptyEl);
        } else if (ranked.length === 0) {
          const emptyEl = document.createElement("div");
          emptyEl.className = "lobby-quick-rank-empty";
          emptyEl.textContent = "순위 데이터 대기 중...";
          this.lobbyQuickRankListEl.appendChild(emptyEl);
        } else {
          ranked.forEach((entry, index) => {
            const row = document.createElement("div");
            row.className = "lobby-quick-rank-row";
            const rowName = String(entry?.name ?? "")
              .trim()
              .toLowerCase();
            if (rowName && myName && rowName === myName) {
              row.classList.add("is-self");
            }

            const posEl = document.createElement("span");
            posEl.className = "rank-pos";
            const rank = Math.max(1, Math.trunc(Number(entry?.rank ?? index + 1)));
            posEl.textContent = `${rank}.`;
            row.appendChild(posEl);

            const nameEl = document.createElement("span");
            nameEl.className = "rank-name";
            nameEl.textContent = String(entry?.name ?? "PLAYER");
            row.appendChild(nameEl);

            const captures = Math.max(0, Math.trunc(Number(entry?.captures ?? 0)));
            const kills = Math.max(0, Math.trunc(Number(entry?.kills ?? 0)));
            const deaths = Math.max(0, Math.trunc(Number(entry?.deaths ?? 0)));
            const metaEl = document.createElement("span");
            metaEl.className = "rank-meta";
            metaEl.textContent = `C${captures} K${kills} D${deaths}`;
            row.appendChild(metaEl);

            this.lobbyQuickRankListEl.appendChild(row);
          });
        }
        this._lastLobbyQuickRankSignature = rankSignature;
      }
    }
  }

  pushLobbyNicknameToServer(name) {
    const safeName = String(name ?? "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 16);
    if (!safeName) {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket || !socket.connected) {
      this.hud.setStatus("닉네임 저장: 서버 연결 후 자동 반영됩니다.", true, 0.95);
      return;
    }

    socket.emit("player:set-name", { name: safeName }, (response = {}) => {
      if (!response.ok) {
        this.hud.setStatus(response.error ?? "닉네임 변경에 실패했습니다.", true, 1);
        return;
      }

      const syncedName = String(response.name ?? safeName)
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 16);
      this.chat?.setPlayerName?.(syncedName);
      this.syncLobbyNicknameInputs(syncedName, { force: true });
      this.hud.setStatus(`닉네임 변경: ${syncedName}`, false, 0.8);

      if (response.room) {
        this.setLobbyState(response.room);
      }
    });
  }

  pushSelectedWeaponToServer(weaponId = this.selectedWeaponId, { quiet = true } = {}) {
    const safeWeaponId = sanitizeWeaponId(weaponId);
    const socket = this.chat?.socket;
    if (!socket || !socket.connected || !this.lobbyState.roomCode) {
      return;
    }

    socket.emit("player:set-weapon", { weaponId: safeWeaponId }, (response = {}) => {
      if (!response.ok) {
        if (!quiet) {
          this.hud.setStatus(response.error ?? "총기 선택 반영에 실패했습니다.", true, 1);
        }
        return;
      }

      this.applySelectedWeapon(response.weaponId ?? safeWeaponId, {
        persist: true,
        syncToServer: false,
        resetAmmo: false,
        announce: false
      });
      if (response.room) {
        this.setLobbyState(response.room);
      }
      if (!quiet) {
        const weapon = getWeaponDefinition(response.weaponId ?? safeWeaponId);
        this.hud.setStatus(`허브 총기 선택: ${weapon.name}`, false, 0.8);
      }
    });
  }

  setLobbyState(room) {
    if (!room) {
      this.applyDailyLeaderboardPayload(null);
      this.lobbyState.roomCode = null;
      this.lobbyState.hostId = null;
      this.lobbyState.players = [];
      this.lobbyState.selectedTeam = null;
      this.lobbyState.state = null;
      this.onlineRoomCount = 0;
      this.lastRoomStartedAt = 0;
      this.latestRoomSnapshot = null;
      this.lastAppliedRoomSnapshotKey = "";
      this.onlineMapId = ONLINE_MAP_ID;
      this.pendingRemoteBlocks.clear();
      this.clearRemotePlayers();
      this.setOnlineRoundState({
        ended: false,
        winnerTeam: null,
        restartAt: 0,
        targetScore: CTF_WIN_SCORE,
        announce: false
      });
      this.setTabScoreboardVisible(false);
      this.mpLobbyEl?.classList.add("hidden");
      if (this.mpRoomTitleEl) {
        this.mpRoomTitleEl.textContent = "로비";
      }
      if (this.mpRoomSubtitleEl) {
        this.mpRoomSubtitleEl.textContent = "미접속 상태";
      }
      if (this.mpPlayerListEl) {
        this.mpPlayerListEl.innerHTML = '<div class="mp-empty">플레이어를 기다리는 중...</div>';
      }
      this.mpTeamAlphaBtn?.classList.remove("is-active");
      this.mpTeamBravoBtn?.classList.remove("is-active");
      if (this.mpTeamAlphaCountEl) {
        this.mpTeamAlphaCountEl.textContent = "0";
      }
      if (this.mpTeamBravoCountEl) {
        this.mpTeamBravoCountEl.textContent = "0";
      }
      this.refreshOnlineStatus();
      this.updateTeamScoreHud();
      this.updateFlagInteractUi();
      this.syncLobby3DPortalState();
      this.syncLobbyNicknameInputs(this.chat?.playerName ?? "", { force: false });
      this.updateLobbyQuickPanel();
      this.syncOnlineHubSummary();
      return;
    }

    this.lobbyState.roomCode = String(room.code ?? "");
    this.lobbyState.hostId = String(room.hostId ?? "");
    this.lobbyState.players = Array.isArray(room.players) ? room.players : [];
    this.lobbyState.state = room?.state ?? null;
    this.onlineRoomCount = this.lobbyState.players.length;
    const roomMapId = normalizeOnlineMapId(room?.state?.mapId ?? this.onlineMapId);
    this.onlineMapId = roomMapId;
    if (!this.isRunning || this.activeMatchMode === "online") {
      this.mapId = roomMapId;
    }
    this.applyDailyLeaderboardPayload(room.dailyLeaderboard ?? null);

    const myId = this.chat?.socket?.id ?? "";
    const me = this.lobbyState.players.find((player) => player.id === myId) ?? null;
    this.lobbyState.selectedTeam = me?.team ?? null;
    this.applyInventorySnapshot(me?.stock ?? null, { quiet: true });
    if (me?.weaponId) {
      this.applySelectedWeapon(me.weaponId, {
        persist: true,
        syncToServer: false,
        resetAmmo: false,
        announce: false
      });
    }
    if (me?.name) {
      this.chat?.setPlayerName?.(me.name);
      this.syncLobbyNicknameInputs(me.name, { force: false });
    }

    if (this.mpRoomTitleEl) {
      this.mpRoomTitleEl.textContent = `${this.lobbyState.roomCode} (${this.lobbyState.players.length}/${ONLINE_MAX_PLAYERS})`;
    }

    if (this.mpPlayerListEl) {
      this.mpPlayerListEl.innerHTML = "";
      for (const player of this.lobbyState.players) {
        const line = document.createElement("div");
        line.className = "mp-player-row";
        if (player.id === myId) {
          line.classList.add("is-self");
        }

        const name = document.createElement("span");
        name.className = "mp-player-name";
        name.textContent = player.name;
        line.appendChild(name);

        if (player.id === myId) {
          const selfTag = document.createElement("span");
          selfTag.className = "mp-tag self-tag";
          selfTag.textContent = "나";
          line.appendChild(selfTag);
        }

        if (player.team) {
          const teamTag = document.createElement("span");
          teamTag.className = `mp-tag team-${String(player.team).toLowerCase()}`;
          teamTag.textContent = formatTeamLabel(player.team);
          line.appendChild(teamTag);
        }

        const weaponTag = document.createElement("span");
        weaponTag.className = "mp-tag weapon-tag";
        weaponTag.textContent = getWeaponDefinition(player.weaponId).name;
        line.appendChild(weaponTag);

        if (player.id === this.lobbyState.hostId) {
          const hostTag = document.createElement("span");
          hostTag.className = "mp-tag host-tag";
          hostTag.textContent = "방장";
          line.appendChild(hostTag);
        }

        this.mpPlayerListEl.appendChild(line);
      }

      if (this.lobbyState.players.length === 0) {
        this.mpPlayerListEl.innerHTML = '<div class="mp-empty">플레이어를 기다리는 중...</div>';
      }
    }

    const alphaCount = this.lobbyState.players.filter((player) => player.team === "alpha").length;
    const bravoCount = this.lobbyState.players.filter((player) => player.team === "bravo").length;
    if (this.mpTeamAlphaCountEl) {
      this.mpTeamAlphaCountEl.textContent = `${alphaCount}`;
    }
    if (this.mpTeamBravoCountEl) {
      this.mpTeamBravoCountEl.textContent = `${bravoCount}`;
    }

    if (this.mpRoomSubtitleEl) {
      const mapMeta = this.getCurrentMapDisplayMeta();
      this.mpRoomSubtitleEl.textContent = `${mapMeta.name} | ${this.lobbyState.players.length}/${ONLINE_MAX_PLAYERS}`;
    }

    this.mpTeamAlphaBtn?.classList.toggle("is-active", this.lobbyState.selectedTeam === "alpha");
    this.mpTeamBravoBtn?.classList.toggle("is-active", this.lobbyState.selectedTeam === "bravo");
    this.mpLobbyEl?.classList.remove("hidden");
    this.applyOnlineStatePayload(room?.state ?? {}, {
      showEvent: false
    });
    this.syncRemotePlayersFromLobby();
    if (this.isLobby3DActive() && !this.isRunning) {
      this.applyLobbyRemotePreviewTargets();
    }
    if (this.tabBoardVisible) {
      this.renderTabScoreboard();
    }
    if (this.activeMatchMode === "online" && this.isRunning) {
      this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
    }
    this.updateTeamScoreHud();
    this.updateFlagInteractUi();
    this.refreshOnlineStatus();
    this.syncLobby3DPortalState();
    this.updateLobbyQuickPanel();
    this.syncOnlineHubSummary();
  }

  applyLobbyNickname({ source = "menu", syncToServer = false, value = "" } = {}) {
    if (!this.chat?.setPlayerName) {
      return;
    }
    const sourceTag = String(source ?? "")
      .trim()
      .toLowerCase();
    const pickFirstNonEmpty = (...candidates) => {
      for (const candidate of candidates) {
        const text = String(candidate ?? "").trim();
        if (text) {
          return text;
        }
      }
      return "";
    };

    const rawName =
      sourceTag === "quick"
        ? pickFirstNonEmpty(value, this.lobbyQuickNameInput?.value, this.mpNameInput?.value, this.chat?.playerName)
        : sourceTag === "menu" || sourceTag === "menu-input"
          ? pickFirstNonEmpty(value, this.mpNameInput?.value, this.lobbyQuickNameInput?.value, this.chat?.playerName)
          : pickFirstNonEmpty(value, this.mpNameInput?.value, this.lobbyQuickNameInput?.value, this.chat?.playerName);

    this.chat.setPlayerName(rawName);
    const safeName = String(this.chat.playerName ?? "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 16);
    if (!safeName) {
      this.syncLobbyNicknameInputs(this.chat?.playerName ?? "", { force: true });
      return;
    }

    this.syncLobbyNicknameInputs(safeName, { force: true });
    if (syncToServer) {
      this.pushLobbyNicknameToServer(safeName);
    }
  }

  createRoom() {
    this.applyLobbyNickname({ source: "menu", syncToServer: false });
    this.joinDefaultRoom();
  }

  joinRoomByInputCode() {
    this.applyLobbyNickname({ source: "menu", syncToServer: false });
    this.joinDefaultRoom();
  }

  joinRoom(_code) {
    this.applyLobbyNickname({ source: "menu", syncToServer: false });
    this.joinDefaultRoom();
  }

  leaveRoom() {
    const socket = this.chat?.socket;
    if (!socket || !socket.connected) {
      this.setLobbyState(null);
      this.refreshOnlineStatus();
      return;
    }

    socket.emit("room:leave", (response = {}) => {
      if (!response.ok) {
        this.hud.setStatus(response.error ?? "방 정보 갱신에 실패했습니다.", true, 1);
        return;
      }

      this.setLobbyState(response.room ?? null);
      this.requestRoomList();
      this.hud.setStatus("로비 상태를 새로고침했습니다.", false, 0.75);
    });
  }

  setTeam(team) {
    if (team !== "alpha" && team !== "bravo") {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket || !socket.connected || !this.lobbyState.roomCode) {
      this.hud.setStatus("팀 선택 전에 먼저 방에 참가하세요.", true, 0.8);
      return;
    }

    socket.emit("room:set-team", { team }, (response = {}) => {
      if (!response.ok) {
        this.hud.setStatus(response.error ?? "팀 선택에 실패했습니다.", true, 1);
        return;
      }

      this.lobbyState.selectedTeam = team;
      this.mpTeamAlphaBtn?.classList.toggle("is-active", team === "alpha");
      this.mpTeamBravoBtn?.classList.toggle("is-active", team === "bravo");
      this.hud.setStatus(`팀 선택 완료: ${formatTeamLabel(team)}`, false, 0.7);
    });
  }

  startOnlineMatch(mapId = null) {
    const socket = this.chat?.socket;
    const requestedMapId = normalizeOnlineMapId(mapId ?? this.onlineMapId);
    if (!socket || !socket.connected) {
      this.hud.setStatus("서버가 오프라인입니다.", true, 1);
      return;
    }

    if (!this.lobbyState.roomCode) {
      this.joinDefaultRoom({ force: true });
      this.hud.setStatus("온라인 방으로 자동 참가 중...", false, 0.8);
      return;
    }

    if (!this.canUseHostControls()) {
      if (this.activeMatchMode === "online" && this.isRunning && !this.isGameOver) {
        this.hud.setStatus("이미 온라인 매치에 참가 중입니다.", false, 0.8);
        return;
      }
      this.hud.setStatus("온라인 매치에 참가합니다.", false, 0.8);
      this.start({ mode: "online" });
      return;
    }

    socket.emit("room:start", { mapId: requestedMapId }, (response = {}) => {
      if (!response.ok) {
        this.hud.setStatus(response.error ?? "온라인 매치 시작에 실패했습니다.", true, 1);
        return;
      }
      this.onlineMapId = normalizeOnlineMapId(response.mapId ?? requestedMapId);
      const mapMeta = MAP_DISPLAY_META[this.onlineMapId] ?? this.getCurrentMapDisplayMeta();
      this.hud.setStatus(`호스트 이동: ${mapMeta.name}`, false, 0.8);
    });
  }

  async copyCurrentRoomCode() {
    const code = this.lobbyState.roomCode;
    if (!code) {
      this.hud.setStatus("복사할 방 코드가 없습니다.", true, 0.9);
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const temp = document.createElement("textarea");
        temp.value = code;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
      }
      this.hud.setStatus(`방 코드 복사 완료: ${code}`, false, 0.8);
    } catch {
      this.hud.setStatus("복사에 실패했습니다.", true, 0.9);
    }
  }

  isCurrentRoomHost() {
    const myId = this.getMySocketId();
    const hostId = String(this.lobbyState.hostId ?? "");
    return Boolean(this.lobbyState.roomCode) && !!myId && !!hostId && myId === hostId;
  }

  isUsingHostLink() {
    return this.onlineEntryRole === "host";
  }

  canUseHostControls() {
    return this.isUsingHostLink() && this.isCurrentRoomHost();
  }

  updateLobbyControls() {
    const { connected, connecting, retrying } = this.getOnlineConnectionUiState();
    const inRoom = !!this.lobbyState.roomCode;
    const in3dLobby = this.isLobby3DActive();
    const isHost = this.isCurrentRoomHost();
    const canUseHostControls = this.canUseHostControls();
    const canStart = connected && inRoom;
    const hostPanelVisible = canUseHostControls && this.menuMode === "online";
    this.syncOnlineHubSummary();

    if (this.mpCreateBtn) {
      this.mpCreateBtn.disabled = true;
      this.mpCreateBtn.classList.add("hidden");
    }
    if (this.mpNameInput) {
      this.mpNameInput.disabled = false;
      this.mpNameInput.readOnly = false;
      this.mpNameInput.title = "";
    }
    if (this.lobbyQuickNameInput) {
      this.lobbyQuickNameInput.disabled = false;
      this.lobbyQuickNameInput.readOnly = false;
    }
    if (this.lobbyQuickNameSaveBtn) {
      this.lobbyQuickNameSaveBtn.disabled = false;
    }
    if (this.mpJoinBtn) {
      this.mpJoinBtn.disabled = true;
      this.mpJoinBtn.classList.add("hidden");
    }
    if (this.mpCodeInput) {
      this.mpCodeInput.disabled = true;
      this.mpCodeInput.classList.add("hidden");
    }
    if (this.mpStartBtn) {
      this.mpStartBtn.disabled = !canStart;
      if (!connected && connecting) {
        this.mpStartBtn.textContent = retrying ? "서버 재시도 중..." : "서버 연결 중...";
      } else if (!connected) {
        this.mpStartBtn.textContent = "서버 오프라인";
      } else if (!inRoom) {
        this.mpStartBtn.textContent = "방 자동 참가 중...";
      } else if (canUseHostControls) {
        this.mpStartBtn.textContent = "온라인 라운드 시작";
      } else {
        this.mpStartBtn.textContent = "온라인 바로 입장";
      }
    }
    if (this.mpLeaveBtn) {
      this.mpLeaveBtn.disabled = true;
      this.mpLeaveBtn.classList.add("hidden");
    }
    if (this.mpCopyCodeBtn) {
      this.mpCopyCodeBtn.disabled = true;
      this.mpCopyCodeBtn.classList.add("hidden");
    }
    if (this.mpTeamAlphaBtn) {
      this.mpTeamAlphaBtn.disabled = !inRoom;
      this.mpTeamAlphaBtn.classList.add("hidden");
    }
    if (this.mpTeamBravoBtn) {
      this.mpTeamBravoBtn.disabled = !inRoom;
      this.mpTeamBravoBtn.classList.add("hidden");
    }
    if (this.mpRefreshBtn) {
      this.mpRefreshBtn.disabled = !connected;
    }
    if (this.mpEnterLobbyBtn) {
      if (in3dLobby) {
        this.mpEnterLobbyBtn.textContent = "대기방 접속 중";
      } else if (!connected && connecting) {
        this.mpEnterLobbyBtn.textContent = retrying ? "서버 재시도 중..." : "서버 연결 중...";
      } else if (!connected) {
        this.mpEnterLobbyBtn.textContent = "서버 오프라인";
      } else if (!inRoom) {
        this.mpEnterLobbyBtn.textContent = "대기방 자동 준비 중...";
      } else {
        this.mpEnterLobbyBtn.textContent = "대기방 입장";
      }
      this.mpEnterLobbyBtn.disabled = !connected && !in3dLobby;
    }
    if (this.mpOpenTrainingBtn) {
      this.mpOpenTrainingBtn.disabled = false;
    }
    if (this.mpOpenSimulacBtn) {
      this.mpOpenSimulacBtn.disabled = false;
    }
    if (this.hostCommandPanelEl) {
      this.hostCommandPanelEl.classList.toggle("hidden", !hostPanelVisible);
      this.hostCommandPanelEl.toggleAttribute("hidden", !hostPanelVisible);
      this.hostCommandPanelEl.setAttribute("aria-hidden", hostPanelVisible ? "false" : "true");
    }
    this.startLayoutEl?.classList.toggle("host-panel-hidden", !hostPanelVisible);
    if (this.hostCommandStateEl) {
      if (!inRoom) {
        this.hostCommandStateEl.textContent = "방 자동 참가 중";
      } else if (!canUseHostControls) {
        this.hostCommandStateEl.textContent = "방장 전용";
      } else if (!connected && connecting) {
        this.hostCommandStateEl.textContent = retrying ? "재연결 중" : "연결 중";
      } else if (!connected) {
        this.hostCommandStateEl.textContent = "오프라인";
      } else {
        const mapMeta = MAP_DISPLAY_META[this.onlineMapId] ?? this.getCurrentMapDisplayMeta();
        this.hostCommandStateEl.textContent = `현재 ${mapMeta.name}`;
      }
    }
    if (this.hostStartForestBtn) {
      this.hostStartForestBtn.disabled = !connected || !inRoom || !canUseHostControls;
    }
    if (this.hostStartCityBtn) {
      this.hostStartCityBtn.disabled = !connected || !inRoom || !canUseHostControls;
    }
    if (this.hostOpenLobbyBtn) {
      this.hostOpenLobbyBtn.disabled = !canUseHostControls || (!connected && !in3dLobby);
    }
    if (this.hostOpenTrainingBtn) {
      this.hostOpenTrainingBtn.disabled = !canUseHostControls;
    }
    if (this.hostOpenSimulacBtn) {
      this.hostOpenSimulacBtn.disabled = !canUseHostControls;
    }
    this.syncLobby3DPortalState();
    this.updateLobbyQuickPanel();
  }

  refreshOnlineStatus() {
    if (!this.mpStatusEl) {
      this.updateLobbyControls();
      return;
    }

    if (!this.chat) {
      this.mpStatusEl.textContent = "서버: 채팅 모듈 없음";
      this.mpStatusEl.dataset.state = "offline";
      this.updateLobbyControls();
      return;
    }

    const { connected, connecting, retrying } = this.getOnlineConnectionUiState();

    if (connecting) {
      this.mpStatusEl.textContent = retrying ? "서버: 오프라인 · 재시도 중..." : "서버: 연결 중...";
      this.mpStatusEl.dataset.state = "offline";
      this.updateLobbyControls();
      return;
    }

    if (!connected) {
      this.mpStatusEl.textContent = "서버: 오프라인";
      this.mpStatusEl.dataset.state = "offline";
      this.updateLobbyControls();
      return;
    }

    if (this.lobbyState.roomCode) {
      this.mpStatusEl.textContent = `서버: 온라인 | ${this.lobbyState.roomCode} (${this.lobbyState.players.length}/${ONLINE_MAX_PLAYERS})`;
      this.mpStatusEl.dataset.state = "online";
      this.updateLobbyControls();
      return;
    }

    this.mpStatusEl.textContent = "서버: 온라인 | 방 자동 참가 중...";
    this.mpStatusEl.dataset.state = "online";
    this.joinDefaultRoom();
    this.updateLobbyControls();
  }
}


