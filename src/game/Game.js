import * as THREE from "three";
import { EnemyManager } from "./EnemyManager.js";
import { WeaponSystem } from "./WeaponSystem.js";
import { HUD } from "./HUD.js";
import { VoxelWorld } from "./build/VoxelWorld.js";
import { BuildSystem } from "./build/BuildSystem.js";
import { SoundSystem } from "./audio/SoundSystem.js";
import { DEFAULT_GAME_MODE, GAME_MODE, normalizeGameMode } from "../shared/gameModes.js";
import { CTF_PICKUP_RADIUS, CTF_WIN_SCORE, PVP_RESPAWN_MS } from "../shared/matchConfig.js";

const CENTER_AD_IMAGE_URL = new URL("../../PNG/AD.41415786.1.png", import.meta.url).href;
const PLAYER_HEIGHT = 1.75;
const DEFAULT_FOV = 75;
const AIM_FOV = 48;
const PLAYER_SPEED = 7.9;
const PLAYER_SPRINT = 11.9;
const PLAYER_GRAVITY = -22;
const JUMP_FORCE = 9.2;
const WORLD_LIMIT = 72;
const PLAYER_RADIUS = 0.34;
const POINTER_LOCK_FALLBACK_MS = 900;
const MOBILE_LOOK_SENSITIVITY_X = 0.0032;
const MOBILE_LOOK_SENSITIVITY_Y = 0.0028;
const ONLINE_ROOM_CODE = "GLOBAL";
const ONLINE_MAX_PLAYERS = 50;
const REMOTE_SYNC_INTERVAL = 1 / 12;
const REMOTE_NAME_TAG_DISTANCE = 72;
const MAX_PENDING_REMOTE_BLOCK_PLACEMENTS_PER_FRAME = 96;
const MIN_PENDING_REMOTE_BLOCK_PLACEMENTS_PER_FRAME = 12;
const MAX_PENDING_REMOTE_BLOCK_RETRIES = 120;
const PLAYER_STEP_UP_HEIGHT = 0.62;
const PLAYER_STEP_UP_SPEED = 10;
const PLAYER_GROUND_SNAP_DOWN = 0.14;
const BUCKET_OPTIMIZE_INTERVAL = 1.2;
const PERF_REPORT_INTERVAL_MS = 4000;
const PERF_SLOW_FRAME_MS = 24;
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
const REMOTE_DEATH_FALL_MS = 320;
const REMOTE_DEATH_OFFSET_Y = 0.56;
const REMOTE_DEATH_ROLL = -1.18;
const REMOTE_CARRIER_FLAG_BACK_OFFSET = 0.42;
const REMOTE_CARRIER_FLAG_SIDE_OFFSET = 0.13;
const REMOTE_CARRIER_FLAG_HEIGHT_OFFSET = 1.02;
const PVP_REMOTE_HITBOX_HALF_WIDTH = 0.46;
const PVP_REMOTE_HITBOX_FOOT_OFFSET = -0.06;
const PVP_REMOTE_HITBOX_TOP_OFFSET = 0.34;

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
    return "ALPHA";
  }
  if (team === "bravo") {
    return "BRAVO";
  }
  return "NEUTRAL";
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

  return coarse && (touchPoints > 0 || uaMobile);
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

export class Game {
  constructor(mount, options = {}) {
    this.mount = mount;
    this.clock = new THREE.Clock();
    this.chat = options.chat ?? null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87c9ff);
    this.scene.fog = new THREE.Fog(0x9ed2ff, 90, 420);

    this.camera = new THREE.PerspectiveCamera(
      DEFAULT_FOV,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.textureLoader = new THREE.TextureLoader();
    this.graphics = this.loadGraphics();
    this.sound = new SoundSystem();

    this.hud = new HUD();
    this.voxelWorld = new VoxelWorld(this.scene, this.textureLoader);
    this.weapon = new WeaponSystem();
    this.enemyManager = new EnemyManager(this.scene, {
      enemyMap: this.graphics.enemyMap,
      muzzleFlashMap: this.graphics.muzzleFlashMap,
      canHitTarget: (from, to) => this.voxelWorld.hasLineOfSight(from, to),
      isBlockedAt: (x, y, z) => this.voxelWorld.hasBlockAtWorld(x, y, z)
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
        this.updateVisualMode(mode);
        this.syncMobileUtilityButtons();
        this.syncCursorVisibility();
      },
      onBlockChanged: (change) => this.handleLocalBlockChanged(change),
      onStatus: (text, isAlert = false, duration = 0.5) =>
        this.hud.setStatus(text, isAlert, duration),
      canInteract: () =>
        this.isRunning &&
        !this.isGameOver &&
        !this.isRespawning &&
        !this.chat?.isInputFocused &&
        !this.hud.startOverlayEl?.classList.contains("show")
    });

    this.playerPosition = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this.moveForwardVec = new THREE.Vector3();
    this.moveRightVec = new THREE.Vector3();
    this.moveVec = new THREE.Vector3();

    this.weaponFlash = null;
    this.weaponFlashLight = null;
    this.weaponView = this.createWeaponView();
    this.shovelView = this.createShovelView();
    this.weaponRecoil = 0;
    this.weaponBobClock = 0;
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.leftMouseDown = false;
    this.aimBlend = 0;
    this.hitSparks = [];

    this.isRunning = false;
    this.isGameOver = false;
    this.pointerLocked = false;
    this.pointerLockFallbackTimer = null;

    this.state = {
      health: 100,
      score: 0,
      kills: 0,
      captures: 0,
      controlPercent: 0,
      controlOwner: "neutral",
      objectiveText: "목표: 적을 제압하고 깃발을 탈취하세요.",
      killStreak: 0,
      lastKillTime: 0
    };

    this._wasReloading = false;
    this.lastDryFireAt = -10;
    this.chatIntroShown = false;
    this.menuMode = "online";
    this.activeMatchMode = "single";

    this.pointerLockSupported =
      "pointerLockElement" in document &&
      typeof this.renderer.domElement.requestPointerLock === "function";
    this.allowUnlockedLook = !this.pointerLockSupported;
    this.mouseLookEnabled = this.allowUnlockedLook;
    this.mobileEnabled = isLikelyTouchDevice();
    if (this.mobileEnabled) {
      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
    }

    this.mobileControlsEl = document.getElementById("mobile-controls");
    this.mobileJoystickEl = document.getElementById("mobile-joystick");
    this.mobileJoystickKnobEl = document.getElementById("mobile-joystick-knob");
    this.mobileFireButtonEl = document.getElementById("mobile-fire");
    this.mobileModePlaceBtn = document.getElementById("mobile-mode-place");
    this.mobileModeDigBtn = document.getElementById("mobile-mode-dig");
    this.mobileModeGunBtn = document.getElementById("mobile-mode-gun");
    this.mobileAimBtn = document.getElementById("mobile-aim");
    this.mobileJumpBtn = document.getElementById("mobile-jump");
    this.mobileReloadBtn = document.getElementById("mobile-reload");
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
    this.mpStatusEl = document.getElementById("mp-status");
    this.mpCreateBtn = document.getElementById("mp-create");
    this.mpJoinBtn = document.getElementById("mp-join");
    this.mpStartBtn = document.getElementById("mp-start");
    this.mpRefreshBtn = document.getElementById("mp-refresh");
    this.mpNameInput = document.getElementById("mp-name");
    this.mpCodeInput = document.getElementById("mp-code");
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
    this.tabScoreboardEl = document.getElementById("tab-scoreboard");
    this.tabAlphaListEl = document.getElementById("tab-alpha-list");
    this.tabBravoListEl = document.getElementById("tab-bravo-list");
    this.tabAlphaCountEl = document.getElementById("tab-alpha-count");
    this.tabBravoCountEl = document.getElementById("tab-bravo-count");
    this.ctfScoreboardEl = document.getElementById("ctf-scoreboard");
    this.ctfScoreAlphaEl = document.getElementById("ctf-score-alpha");
    this.ctfScoreBravoEl = document.getElementById("ctf-score-bravo");
    this.flagInteractBtnEl = document.getElementById("flag-interact-btn");
    this.respawnBannerEl = document.getElementById("respawn-banner");
    this.lastAppliedFov = DEFAULT_FOV;
    this._lobbySocketBound = false;
    this._joiningDefaultRoom = false;
    this._nextAutoJoinAt = 0;
    this.tabBoardVisible = false;

    this.lobbyState = {
      roomCode: null,
      hostId: null,
      players: [],
      selectedTeam: null
    };
    this.remotePlayers = new Map();
    this.remoteSyncClock = 0;
    this._toRemote = new THREE.Vector3();
    this._remoteHead = new THREE.Vector3();
    this._pvpBox = new THREE.Box3();
    this._pvpBoxMin = new THREE.Vector3();
    this._pvpBoxMax = new THREE.Vector3();
    this._pvpHitPoint = new THREE.Vector3();
    this.pendingRemoteBlocks = new Map();
    this.latestRoomSnapshot = null;

    this.objective = {
      alphaBase: new THREE.Vector3(),
      bravoBase: new THREE.Vector3(),
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
      flag: {
        home: new THREE.Vector3(),
        at: new THREE.Vector3(),
        carrierId: null
      },
      score: { alpha: 0, bravo: 0 },
      captures: { alpha: 0, bravo: 0 }
    };
    this.onlineTargetScore = CTF_WIN_SCORE;
    this.onlineRoundEnded = false;
    this.onlineRoundWinnerTeam = null;
    this.onlineRoundRestartAt = 0;
    this.onlineRoundLastSecond = -1;
    this.flagInteractVisible = false;
    this.flagInteractCooldownUntil = 0;
    this.scoreHudState = { show: null, alpha: null, bravo: null };
    this.pvpImmuneHintUntil = 0;

    this._initialized = false;
    this.mapId = "forest_frontline";
    this._bucketOptimizeCooldown = BUCKET_OPTIMIZE_INTERVAL;
    this.perfDebugEnabled = isPerfDebugEnabled();
    this.perfStats = {
      frameCount: 0,
      totalMs: 0,
      slowFrames: 0,
      worstMs: 0,
      lastReportAt: getNowMs()
    };
    this.isRespawning = false;
    this.respawnEndAt = 0;
    this.respawnLastSecond = -1;
    this.localDeathAnimStartAt = 0;
    this.localDeathAnimBlend = 0;
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
    this.camera.add(this.shovelView);
    this.setupWorld();
    this.repairUiLabels();
    this.bindEvents();
    this.setupMobileControls();
    this.resetState();
    this.updateVisualMode(this.buildSystem.getToolMode());

    if (this.chat?.setFocusChangeHandler) {
      this.chat.setFocusChangeHandler((focused) => this.onChatFocusChanged(focused));
    }
    this.setupLobbySocket();
    this.refreshOnlineStatus();

    this.syncCursorVisibility();
    this.loop();
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
      skyMap: configureColorTexture("/assets/graphics/world/sky/sky.svg", 1, 1),
      muzzleFlashMap: configureSpriteTexture("/assets/graphics/world/sprites/muzzleflash.svg"),
      sparkMap: configureSpriteTexture("/assets/graphics/world/sprites/spark.svg"),
      centerAdMap: configureSpriteTexture(CENTER_AD_IMAGE_URL)
    };
  }

  setupWorld() {
    this.setupSky();

    const hemiLight = new THREE.HemisphereLight(0xbfe7ff, 0x33522a, 1.04);
    this.scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfff5d3, 1.28);
    sun.position.set(58, 68, 32);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -240;
    sun.shadow.camera.right = 240;
    sun.shadow.camera.top = 240;
    sun.shadow.camera.bottom = -240;
    sun.shadow.bias = -0.00026;
    sun.shadow.normalBias = 0.018;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8bc8ff, 0.42);
    fill.position.set(-42, 34, -22);
    this.scene.add(fill);

    this.voxelWorld.generateTerrain({ mapId: this.mapId });
    this.setupObjectives();
  }

  setupSky() {
    const skyMaterial = new THREE.MeshBasicMaterial({
      map: this.graphics.skyMap,
      color: 0xb7deff,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 18), skyMaterial);
    this.scene.add(sky);

    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false
    });
    for (let i = 0; i < 22; i += 1) {
      const radius = 120 + Math.random() * 210;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.16;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi) + 92;
      const z = radius * Math.sin(phi) * Math.sin(theta);
      const cloud = new THREE.Mesh(
        new THREE.SphereGeometry(10 + Math.random() * 14, 10, 7),
        cloudMaterial
      );
      cloud.position.set(x, y, z);
      cloud.scale.set(1.6 + Math.random() * 2.2, 0.52 + Math.random() * 0.28, 1.2 + Math.random());
      this.scene.add(cloud);
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
      mid: { x: 0, z: 0 }
    };

    const alphaY = this.voxelWorld.getSurfaceYAt(arena.alphaBase.x, arena.alphaBase.z) ?? 0;
    const bravoY = this.voxelWorld.getSurfaceYAt(arena.bravoBase.x, arena.bravoBase.z) ?? 0;
    const midY = this.voxelWorld.getSurfaceYAt(arena.mid.x, arena.mid.z) ?? 0;

    this.objective.alphaBase.set(arena.alphaBase.x, alphaY, arena.alphaBase.z);
    this.objective.bravoBase.set(arena.bravoBase.x, bravoY, arena.bravoBase.z);
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
    this.onlineCenterFlag = centerFlagMesh;
    this.onlineCenterFlagCloth = centerFlagMesh.userData?.cloth ?? null;
    this.scene.add(centerFlagMesh);

    const centerAdBillboard = this.createCenterAdBillboard(this.objective.centerFlagHome);
    this.objectiveMarkers.push(centerAdBillboard);
    this.scene.add(centerAdBillboard);

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
    this.onlineCtf.flag.home.copy(this.objective.centerFlagHome);
    this.onlineCtf.flag.at.copy(this.objective.centerFlagHome);
    this.onlineCtf.flag.carrierId = null;
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

    setText("mode-online", "온라인");
    setText("mode-single", "훈련");
    setText("start-button", "훈련 시작");
    setText("mp-start", "온라인 시작");
    setText("mp-refresh", "새로고침");
    setText("mobile-mode-place", "설치");
    setText("mobile-mode-dig", "파괴");
    setText("mobile-mode-gun", "총");
    setText("mobile-aim", "조준");
    setText("mobile-jump", "점프");
    setText("mobile-reload", "장전");
    setText("flag-interact-btn", "깃발 탈취");
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
      const statusText = `${winnerLabel} 승리! ${remainSec}초 후 재시작`;
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
    const statusText =
      remainSec > 0
        ? `${winnerLabel} 승리! ${remainSec}초 후 재시작`
        : "새 라운드를 시작합니다...";
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
    if (this.onlineRoundEnded) {
      const winnerLabel = formatTeamLabel(this.onlineRoundWinnerTeam);
      return `라운드 종료: ${winnerLabel} 승리`;
    }

    const mode = normalizeGameMode(this.onlineCtf.mode);
    if (mode === GAME_MODE.ELIMINATION) {
      return "목표: 적 팀을 제압하세요";
    }

    const myTeam = normalizeTeamId(this.getMyTeam());
    if (!myTeam) {
      return "목표: ALPHA 또는 BRAVO 팀을 먼저 선택하세요";
    }

    const myId = this.getMySocketId();
    const flag = this.onlineCtf.flag;

    if (flag?.carrierId === myId) {
      return "목표: 중앙 깃발을 아군 거점으로 운반하세요";
    }
    if (flag?.carrierId) {
      const carrierTeam = this.getPlayerTeamById(flag.carrierId);
      if (carrierTeam && carrierTeam === myTeam) {
        return "목표: 아군 깃발 운반자를 엄호하세요";
      }
      return "목표: 적 깃발 운반자를 저지하세요";
    }

    return `목표: 중앙 깃발 탈취 (승리 조건 ${this.onlineTargetScore}점)`;
  }

  showOnlineCtfEvent(event = {}) {
    const type = String(event.type ?? "").trim();
    if (!type) {
      return;
    }

    const byPlayerId = String(event.byPlayerId ?? "");
    const byName = this.getPlayerNameById(byPlayerId);
    const byTeam = normalizeTeamId(event.byTeam);
    const isMine = byPlayerId && byPlayerId === this.getMySocketId();

    if (type === "pickup") {
      const text = isMine
        ? "중앙 깃발 탈취 성공! 아군 거점으로 복귀하세요"
        : `${byName}이(가) 중앙 깃발을 탈취했습니다 (${formatTeamLabel(byTeam)})`;
      this.hud.setStatus(text, false, 1.1);
      this.chat?.addSystemMessage(text, "system");
      return;
    }

    if (type === "capture") {
      const text = isMine ? "깃발 점수 +1 획득" : `${byName}이(가) 깃발 점수 +1 획득`;
      this.hud.setStatus(text, false, 1.3);
      this.chat?.addSystemMessage(text, "system");
      return;
    }

    if (type === "reset") {
      const text = "깃발이 원래 위치로 복귀했습니다";
      this.hud.setStatus(text, true, 0.9);
      this.chat?.addSystemMessage(text, "system");
      return;
    }

    if (type === "start") {
      const text = "깃발전 시작: 적 깃발을 탈취하세요";
      this.hud.setStatus(text, false, 0.9);
      this.chat?.addSystemMessage(text, "system");
      return;
    }

    if (type === "match_end") {
      const winner = formatTeamLabel(normalizeTeamId(event.winnerTeam));
      const text = `${winner} 팀 승리`;
      this.hud.setStatus(text, false, 1.1);
      this.chat?.addSystemMessage(text, "system");
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

    const flagPayload = payload?.flag ?? payload?.flags?.alpha ?? null;
    const target = this.onlineCtf.flag;
    const homeFallback = this.objective.centerFlagHome;

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
    if (!this.onlineCenterFlag) {
      return;
    }

    if (this.activeMatchMode !== "online") {
      this.onlineCenterFlag.visible = false;
      return;
    }

    if (this.alphaFlag) {
      this.alphaFlag.visible = true;
      this.alphaFlag.position.copy(this.objective.alphaFlagHome);
    }
    if (this.bravoFlag) {
      this.bravoFlag.visible = true;
      this.bravoFlag.position.copy(this.objective.bravoFlagHome);
    }

    const myId = this.getMySocketId();
    const flag = this.onlineCtf.flag;
    if (!flag.carrierId) {
      this.onlineCenterFlag.visible = true;
      this.onlineCenterFlag.position.copy(flag.at);
      this.onlineCenterFlag.rotation.set(0, 0, 0);
      return;
    }

    if (flag.carrierId === myId) {
      this.onlineCenterFlag.visible = false;
      return;
    }

    const carrier = this.remotePlayers.get(flag.carrierId);
    if (!carrier) {
      this.onlineCenterFlag.visible = false;
      return;
    }

    const carrierYaw = Number.isFinite(carrier.yaw) ? carrier.yaw : carrier.group.rotation.y;
    const backX = Math.sin(carrierYaw) * REMOTE_CARRIER_FLAG_BACK_OFFSET;
    const backZ = Math.cos(carrierYaw) * REMOTE_CARRIER_FLAG_BACK_OFFSET;
    const sideX = Math.cos(carrierYaw) * REMOTE_CARRIER_FLAG_SIDE_OFFSET;
    const sideZ = -Math.sin(carrierYaw) * REMOTE_CARRIER_FLAG_SIDE_OFFSET;

    this.onlineCenterFlag.visible = true;
    this.onlineCenterFlag.position.set(
      carrier.group.position.x + backX + sideX,
      carrier.group.position.y + REMOTE_CARRIER_FLAG_HEIGHT_OFFSET,
      carrier.group.position.z + backZ + sideZ
    );
    this.onlineCenterFlag.rotation.set(-0.16, carrierYaw - Math.PI * 0.5, 0.14);
  }

  applyRoomSnapshot(payload = {}) {
    const blocks = Array.isArray(payload.blocks) ? payload.blocks : null;
    if (!blocks) {
      return;
    }

    this.latestRoomSnapshot = payload;
    this.applyInventorySnapshot(payload.stock, { quiet: true });
    if (this.activeMatchMode !== "online" && this.isRunning) {
      return;
    }

    const normalize = (entry = {}) => {
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

      if (action === "place") {
        const typeId = Number(entry.typeId);
        if (!Number.isFinite(typeId)) {
          return null;
        }
        normalized.typeId = Math.trunc(typeId);
      }

      return normalized;
    };

    this.voxelWorld.generateTerrain({ mapId: this.mapId });
    for (const entry of blocks) {
      const update = normalize(entry);
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

  createCenterAdBillboard(position) {
    const group = new THREE.Group();
    const adTexture = this.graphics.centerAdMap;
    if (!adTexture) {
      return group;
    }

    const adAspect = 480 / 330;
    const panelHeight = 1.45;
    const panelWidth = panelHeight * adAspect;
    const blockFaceOffset = 0.53;

    const createPanel = (zOffset, yaw) => {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(panelWidth, panelHeight),
        new THREE.MeshStandardMaterial({
          map: adTexture,
          color: 0xffffff,
          roughness: 0.9,
          metalness: 0.02
        })
      );
      panel.position.set(position.x, position.y + 1.02, position.z + zOffset);
      panel.rotation.y = yaw;
      panel.castShadow = false;
      panel.receiveShadow = true;
      group.add(panel);
    };

    createPanel(blockFaceOffset, 0);
    createPanel(-blockFaceOffset, Math.PI);
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
    if (this.activeMatchMode === "online") {
      return this.getOnlineObjectiveText();
    }

    if (this.objective.playerHasEnemyFlag) {
      return "\uBAA9\uD45C: \uC544\uAD70 \uAC70\uC810\uC73C\uB85C \uBCF5\uADC0\uD558\uC138\uC694";
    }

    if (this.objective.controlOwner === "alpha") {
      return "\uBAA9\uD45C: \uC801 \uAE43\uBC1C \uD0C8\uCDE8 (\uC911\uC559 \uAC70\uC810 \uD655\uBCF4)";
    }

    const controlPercent = Math.round(this.objective.controlProgress * 100);
    if (controlPercent > 0) {
      return "\uBAA9\uD45C: \uC801 \uAE43\uBC1C \uD0C8\uCDE8 \uB610\uB294 \uC911\uC559 \uAC70\uC810 \uC810\uB839 " + controlPercent + "%";
    }

    return "\uBAA9\uD45C: \uC801 \uAE43\uBC1C\uC744 \uD655\uBCF4\uD558\uAC70\uB098 \uC911\uC559 \uAC70\uC810\uC744 \uC810\uB839\uD558\uC138\uC694";
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

  createWeaponView() {
    const group = new THREE.Group();

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f8da6,
      roughness: 0.35,
      metalness: 0.7
    });
    const gripMaterial = new THREE.MeshStandardMaterial({
      color: 0x1c2f3d,
      roughness: 0.65,
      metalness: 0.18
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: 0xb4efff,
      roughness: 0.2,
      metalness: 0.58,
      emissive: 0x4af5f5,
      emissiveIntensity: 0.45
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.72), bodyMaterial);
    body.castShadow = true;
    body.position.set(0, 0, -0.1);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.62, 14),
      bodyMaterial
    );
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(0.02, 0.03, -0.52);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.24, 0.16), gripMaterial);
    grip.rotation.x = -0.28;
    grip.position.set(-0.02, -0.2, 0.08);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.2), accentMaterial);
    rail.position.set(0.01, 0.11, -0.12);

    const muzzleFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({
        map: this.graphics.muzzleFlashMap,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    muzzleFlash.rotation.y = Math.PI;
    muzzleFlash.position.set(0.02, 0.03, -0.84);

    const muzzleLight = new THREE.PointLight(0xffd8a8, 0, 4.4, 2.2);
    muzzleLight.position.set(0.02, 0.03, -0.78);

    group.add(body, barrel, grip, rail, muzzleFlash, muzzleLight);
    group.position.set(0.38, -0.38, -0.76);
    group.rotation.set(-0.22, -0.06, 0.02);

    this.weaponFlash = muzzleFlash;
    this.weaponFlashLight = muzzleLight;
    return group;
  }

  createShovelView() {
    const group = new THREE.Group();

    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0x6e5138,
      roughness: 0.82,
      metalness: 0.08
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a99ab,
      roughness: 0.35,
      metalness: 0.72
    });

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.032, 0.86, 12),
      handleMaterial
    );
    handle.rotation.x = Math.PI * 0.5;
    handle.castShadow = true;

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.27, 0.06), metalMaterial);
    blade.position.set(0, -0.16, -0.42);
    blade.castShadow = true;

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.1), metalMaterial);
    collar.position.set(0, -0.04, -0.31);
    collar.castShadow = true;

    group.add(handle, blade, collar);
    group.position.set(0.48, -0.44, -0.72);
    group.rotation.set(-0.28, -0.18, 0.34);
    group.visible = false;
    return group;
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

  setTabScoreboardVisible(visible) {
    const show = Boolean(
      visible &&
        this.tabScoreboardEl &&
        this.activeMatchMode === "online" &&
        this.isRunning &&
        !this.isGameOver
    );
    this.tabBoardVisible = show;
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

    const myTeam = normalizeTeamId(this.getMyTeam());
    if (!myTeam) {
      return false;
    }

    const flag = this.onlineCtf.flag;
    if (!flag || flag.carrierId) {
      return false;
    }

    return this.distanceXZ(this.playerPosition, flag.at) <= CTF_PICKUP_RADIUS;
  }

  isLocalFlagCarrier() {
    if (this.activeMatchMode === "online") {
      const myId = this.getMySocketId();
      if (!myId) {
        return false;
      }
      return String(this.onlineCtf?.flag?.carrierId ?? "") === myId;
    }
    return Boolean(this.objective.playerHasEnemyFlag);
  }

  updateFlagInteractUi() {
    if (!this.flagInteractBtnEl) {
      return;
    }

    const show = this.mobileEnabled && this.canLocalPickupCenterFlag();
    if (show === this.flagInteractVisible) {
      return;
    }

    this.flagInteractVisible = show;
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
          : "중앙 깃발 근처에서 상호작용하세요.";
        this.hud.setStatus(text, true, 0.45);
      }
      return;
    }

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      this.hud.setStatus("서버 연결 상태를 확인하세요.", true, 0.6);
      return;
    }

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
        this.playerPosition.set(x, y, z);
        this.yaw = Number.isFinite(yaw) ? yaw : this.yaw;
        this.pitch = Number.isFinite(pitch) ? pitch : 0;
      } else {
        this.setOnlineSpawnFromLobby();
      }
      this.verticalVelocity = 0;
      this.onGround = true;
      this.camera.position.copy(this.playerPosition);
      this.camera.rotation.order = "YXZ";
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
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

  createRemotePlayer(player = {}) {
    const team = player.team ?? null;
    const color = this.getTeamColor(team);
    const group = new THREE.Group();
    group.visible = true;

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.48,
      metalness: 0.26,
      emissive: 0x0f2030,
      emissiveIntensity: 0.35
    });
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffc29f,
      roughness: 0.6,
      metalness: 0.05
    });
    const detailMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b2a38,
      roughness: 0.4,
      metalness: 0.56
    });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.96, 0.34), bodyMaterial);
    torso.position.y = 1.15;
    torso.castShadow = true;
    torso.receiveShadow = true;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), headMaterial);
    head.position.y = 1.85;
    head.castShadow = true;
    head.receiveShadow = true;

    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.72), detailMaterial);
    gun.position.set(0, 1.42, -0.48);
    gun.castShadow = true;

    const nameTag = this.createRemoteNameTag(player.name, team);
    nameTag.position.set(0, 2.45, 0);

    group.add(torso, head, gun, nameTag);
    this.scene.add(group);

    return {
      id: String(player.id ?? ""),
      name: String(player.name ?? "PLAYER"),
      team,
      group,
      nameTag,
      bodyMaterial,
      headMaterial,
      detailMaterial,
      targetPosition: new THREE.Vector3(),
      targetYaw: 0,
      yaw: 0,
      isDowned: false,
      downedStartAt: 0,
      downedBlend: 0
    };
  }

  updateRemoteVisual(remote, { name, team }) {
    const nextName = String(name ?? remote.name ?? "PLAYER");
    const nextTeam = team ?? null;
    const teamChanged = remote.team !== nextTeam;
    const nameChanged = remote.name !== nextName;
    if (!teamChanged && !nameChanged) {
      return;
    }

    remote.name = nextName;
    remote.team = nextTeam;
    remote.bodyMaterial.color.setHex(this.getTeamColor(nextTeam));

    if (remote.nameTag) {
      remote.group.remove(remote.nameTag);
      remote.nameTag.material.map?.dispose();
      remote.nameTag.material.dispose();
    }
    remote.nameTag = this.createRemoteNameTag(remote.name, remote.team);
    remote.nameTag.position.set(0, 2.45, 0);
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
        child.geometry?.dispose?.();
      }
    });
    remote.nameTag?.material?.map?.dispose?.();
    remote.nameTag?.material?.dispose?.();
    remote.bodyMaterial.dispose();
    remote.headMaterial.dispose();
    remote.detailMaterial.dispose();
    this.remotePlayers.delete(key);
  }

  clearRemotePlayers() {
    for (const id of this.remotePlayers.keys()) {
      this.removeRemotePlayer(id);
    }
  }

  applyRemoteState(remote, state, snap = false) {
    if (!remote || !state) {
      return;
    }

    const x = Number(state.x);
    const y = Number(state.y);
    const z = Number(state.z);
    const yaw = Number(state.yaw);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return;
    }

    remote.targetPosition.set(x, y - PLAYER_HEIGHT, z);
    remote.targetYaw = Number.isFinite(yaw) ? yaw : 0;

    if (snap) {
      remote.group.position.copy(remote.targetPosition);
      remote.yaw = remote.targetYaw;
      remote.group.rotation.y = remote.yaw;
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
      const remote = this.ensureRemotePlayer(player);
      if (!remote) {
        continue;
      }
      if (player.state) {
        this.applyRemoteState(remote, player.state, true);
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

    const remote = this.ensureRemotePlayer({
      id,
      name: payload.name ?? "PLAYER",
      team: payload.team ?? null
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

    const smooth = THREE.MathUtils.clamp(delta * 11, 0.08, 0.92);

    for (const remote of this.remotePlayers.values()) {
      remote.group.position.lerp(remote.targetPosition, smooth);
      const yawDiff = Math.atan2(
        Math.sin(remote.targetYaw - remote.yaw),
        Math.cos(remote.targetYaw - remote.yaw)
      );
      remote.yaw += yawDiff * smooth;
      remote.group.rotation.y = remote.yaw;
      remote.group.rotation.x = 0;

      if (remote.isDowned) {
        const elapsed = Math.max(0, Date.now() - remote.downedStartAt);
        const t = THREE.MathUtils.clamp(elapsed / REMOTE_DEATH_FALL_MS, 0, 1);
        remote.downedBlend = Math.max(remote.downedBlend, t);
      } else if (remote.downedBlend > 0) {
        remote.downedBlend = Math.max(0, remote.downedBlend - delta * 4.8);
      }

      if (remote.downedBlend > 0) {
        remote.group.position.y -= REMOTE_DEATH_OFFSET_Y * remote.downedBlend;
      }
      remote.group.rotation.z = REMOTE_DEATH_ROLL * remote.downedBlend;

      this._remoteHead.copy(remote.group.position);
      this._remoteHead.y += PLAYER_HEIGHT + 0.72;
      this._toRemote.copy(this._remoteHead).sub(this.camera.position);
      const distance = this._toRemote.length();

      if (remote.nameTag) {
        const hideEnemyName = this.isEnemyTeam(remote.team);
        const hideForDeath = remote.isDowned || remote.downedBlend > 0.2;
        remote.nameTag.visible =
          !hideForDeath && !hideEnemyName && distance <= REMOTE_NAME_TAG_DISTANCE;
      }
    }

    if (this.activeMatchMode === "online") {
      this.syncOnlineFlagMeshes();
    }
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
    const angle = ((seed % 360) * Math.PI) / 180;
    const ring = 2.8 + ((seed >> 8) % 5) * 0.55;

    let anchorX = 0;
    let anchorZ = 0;
    let faceYaw = 0;

    if (team === "alpha") {
      anchorX = this.objective.alphaBase.x;
      anchorZ = this.objective.alphaBase.z;
      faceYaw = -Math.PI * 0.5;
    } else if (team === "bravo") {
      anchorX = this.objective.bravoBase.x;
      anchorZ = this.objective.bravoBase.z;
      faceYaw = Math.PI * 0.5;
    } else {
      const leftSide = (seed & 1) === 0;
      anchorX = leftSide ? this.objective.alphaBase.x + 4 : this.objective.bravoBase.x - 4;
      anchorZ = 0;
      faceYaw = leftSide ? -Math.PI * 0.4 : Math.PI * 0.4;
    }

    const spawnX = anchorX + Math.cos(angle) * ring;
    const spawnZ = anchorZ + Math.sin(angle) * ring;
    const spawnY = (this.voxelWorld.getSurfaceYAt(spawnX, spawnZ) ?? 0) + PLAYER_HEIGHT;

    this.playerPosition.set(spawnX, spawnY, spawnZ);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.yaw = faceYaw;
    this.pitch = 0;
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
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
      pitch: Number(this.pitch.toFixed(4))
    });
  }

  findOnlineShotTarget(maxDistance) {
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
      this._pvpBoxMin.set(
        base.x - PVP_REMOTE_HITBOX_HALF_WIDTH,
        base.y + PVP_REMOTE_HITBOX_FOOT_OFFSET,
        base.z - PVP_REMOTE_HITBOX_HALF_WIDTH
      );
      this._pvpBoxMax.set(
        base.x + PVP_REMOTE_HITBOX_HALF_WIDTH,
        base.y + PLAYER_HEIGHT + PVP_REMOTE_HITBOX_TOP_OFFSET,
        base.z + PVP_REMOTE_HITBOX_HALF_WIDTH
      );
      this._pvpBox.set(this._pvpBoxMin, this._pvpBoxMax);

      const hitPoint = this.raycaster.ray.intersectBox(this._pvpBox, this._pvpHitPoint);
      if (!hitPoint) {
        continue;
      }

      const distance = hitPoint.distanceTo(this.camera.position);
      if (distance > bestDistance) {
        continue;
      }

      bestDistance = distance;
      best = {
        id: remote.id,
        distance,
        point: hitPoint.clone()
      };
    }

    return best;
  }

  emitPvpShot(targetId) {
    if (!targetId || this.activeMatchMode !== "online") {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      return;
    }

    socket.emit("pvp:shoot", { targetId });
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

        const now = this.clock.getElapsedTime();
        if (now - this.state.lastKillTime < 4.0) {
          this.state.killStreak += 1;
        } else {
          this.state.killStreak = 1;
        }
        this.state.lastKillTime = now;
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
        this.hud.setStatus(`피해 -${damage}`, true, 0.35);
      }
    }

    if (lobbyChanged && this.tabBoardVisible) {
      this.renderTabScoreboard();
    }
  }

  handleLocalBlockChanged(change) {
    if (this.activeMatchMode !== "online") {
      return;
    }

    const socket = this.chat?.socket;
    if (!socket?.connected || !this.lobbyState.roomCode) {
      return;
    }

    const action = change?.action === "place" ? "place" : change?.action === "remove" ? "remove" : null;
    if (!action) {
      return;
    }

    const rawX = Number(change.x);
    const rawY = Number(change.y);
    const rawZ = Number(change.z);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawZ)) {
      return;
    }

    const payload = {
      action,
      x: Math.trunc(rawX),
      y: Math.trunc(rawY),
      z: Math.trunc(rawZ)
    };

    if (action === "place") {
      const typeId = Number(change.typeId);
      if (!Number.isFinite(typeId)) {
        return;
      }
      payload.typeId = Math.trunc(typeId);
    } else {
      const removedTypeId = Number(change.typeId);
      if (Number.isFinite(removedTypeId)) {
        payload.typeId = Math.trunc(removedTypeId);
      }
    }

    socket.emit("block:update", payload, (response = {}) => {
      this.applyInventorySnapshot(response?.stock, { quiet: true });
      if (response?.ok === true) {
        return;
      }

      if (action === "place") {
        this.voxelWorld.removeBlock(payload.x, payload.y, payload.z);
      } else {
        const rollbackTypeId = Number(payload.typeId);
        if (
          Number.isFinite(rollbackTypeId) &&
          !this.isPlayerIntersectingBlock(payload.x, payload.y, payload.z)
        ) {
          this.voxelWorld.setBlock(payload.x, payload.y, payload.z, Math.trunc(rollbackTypeId));
        }
      }

      const text = String(response?.error ?? "블록 동기화에 실패했습니다.");
      this.hud.setStatus(text, true, 0.9);
    });
  }

  normalizeRemoteBlockUpdate(payload = {}) {
    const action = payload.action === "place" ? "place" : payload.action === "remove" ? "remove" : null;
    if (!action) {
      return null;
    }

    const rawX = Number(payload.x);
    const rawY = Number(payload.y);
    const rawZ = Number(payload.z);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawZ)) {
      return null;
    }

    const normalized = {
      action,
      x: Math.trunc(rawX),
      y: Math.trunc(rawY),
      z: Math.trunc(rawZ)
    };

    if (action === "place") {
      const typeId = Number(payload.typeId);
      if (!Number.isFinite(typeId)) {
        return null;
      }
      normalized.typeId = Math.trunc(typeId);
    }

    return normalized;
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
    const visible =
      this.mobileEnabled &&
      this.isRunning &&
      !this.isGameOver &&
      !this.chat?.isInputFocused;
    this.mobileControlsEl.classList.toggle("is-active", visible);

    if (!visible) {
      this.mobileState.moveForward = 0;
      this.mobileState.moveStrafe = 0;
      this.mobileState.stickPointerId = null;
      this.mobileState.lookPointerId = null;
      this.mobileState.aimPointerId = null;
      this.mobileState.firePointerId = null;
      this.handlePrimaryActionUp();
      if (this.mobileEnabled) {
        this.isAiming = false;
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
    if (!this.isRunning || this.isGameOver || this.chat?.isInputFocused) {
      return;
    }

    if (this.buildSystem.isBuildMode()) {
      this.buildSystem.handlePointerAction(0, (x, y, z) =>
        !this.isPlayerIntersectingBlock(x, y, z)
      );
      return;
    }

    this.leftMouseDown = true;
    this.fire();
  }

  handlePrimaryActionUp() {
    this.leftMouseDown = false;
  }

  syncMobileUtilityButtons() {
    const mode = this.buildSystem?.getToolMode?.() ?? "gun";
    this.mobileModePlaceBtn?.classList.toggle("is-active", mode === "place");
    this.mobileModeDigBtn?.classList.toggle("is-active", mode === "dig");
    this.mobileModeGunBtn?.classList.toggle("is-active", mode === "gun");
    this.mobileAimBtn?.classList.toggle(
      "is-active",
      mode === "gun" && (this.isAiming || this.rightMouseAiming)
    );
  }

  setupMobileControls() {
    if (
      this._mobileBound ||
      !this.mobileEnabled ||
      !this.mobileControlsEl ||
      !this.mobileJoystickEl ||
      !this.mobileJoystickKnobEl ||
      !this.mobileFireButtonEl ||
      !this.mobileModePlaceBtn ||
      !this.mobileModeDigBtn ||
      !this.mobileModeGunBtn ||
      !this.mobileAimBtn ||
      !this.mobileJumpBtn ||
      !this.mobileReloadBtn
    ) {
      this.updateMobileControlsVisibility();
      return;
    }

    this._mobileBound = true;
    const acceptPointer = (event) => event.pointerType === "touch" || event.pointerType === "pen";

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
      this.buildSystem.setToolMode("place");
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileModeDigBtn, () => {
      this.buildSystem.setToolMode("dig");
      this.syncMobileUtilityButtons();
    });
    bindUtilityTap(this.mobileModeGunBtn, () => {
      this.buildSystem.setToolMode("gun");
      this.syncMobileUtilityButtons();
    });
    this.mobileAimBtn.addEventListener("pointerdown", (event) => {
      if (!acceptPointer(event)) {
        return;
      }
      event.preventDefault();
      this.sound.unlock();
      if (!this.isRunning || this.isGameOver || this.chat?.isInputFocused) {
        return;
      }
      if (!this.buildSystem.isGunMode()) {
        this.buildSystem.setToolMode("gun");
      }
      this.mobileState.aimPointerId = event.pointerId;
      this.isAiming = true;
      this.syncMobileUtilityButtons();
      this.mobileAimBtn.setPointerCapture?.(event.pointerId);
    });
    const endAim = (event) => {
      if (!acceptPointer(event) || event.pointerId !== this.mobileState.aimPointerId) {
        return;
      }
      this.mobileState.aimPointerId = null;
      this.isAiming = false;
      this.syncMobileUtilityButtons();
      this.mobileAimBtn.releasePointerCapture?.(event.pointerId);
    };
    this.mobileAimBtn.addEventListener("pointerup", endAim);
    this.mobileAimBtn.addEventListener("pointercancel", endAim);

    bindUtilityTap(this.mobileJumpBtn, () => {
      if (this.onGround && this.isRunning && !this.isGameOver) {
        this.verticalVelocity = JUMP_FORCE;
        this.onGround = false;
      }
    });
    bindUtilityTap(this.mobileReloadBtn, () => {
      if (!this.buildSystem.isGunMode()) {
        this.hud.setStatus("장전하려면 총 모드로 전환하세요.", true, 0.75);
        return;
      }
      if (this.weapon.startReload()) {
        this.hud.setStatus("장전 중...", true, 0.55);
      }
    });

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
      if (
        !acceptPointer(event) ||
        !this.mobileEnabled ||
        !this.isRunning ||
        this.isGameOver ||
        this.chat?.isInputFocused
      ) {
        return;
      }

      if (event.clientX < window.innerWidth * 0.38) {
        return;
      }

      this.mobileState.lookPointerId = event.pointerId;
      this.mobileState.lookLastX = event.clientX;
      this.mobileState.lookLastY = event.clientY;
      this.mouseLookEnabled = true;
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
    });

    document.addEventListener("pointermove", (event) => {
      if (
        !acceptPointer(event) ||
        event.pointerId !== this.mobileState.lookPointerId ||
        !this.isRunning ||
        this.isGameOver ||
        this.chat?.isInputFocused
      ) {
        return;
      }

      event.preventDefault();
      const deltaX = event.clientX - this.mobileState.lookLastX;
      const deltaY = event.clientY - this.mobileState.lookLastY;
      this.mobileState.lookLastX = event.clientX;
      this.mobileState.lookLastY = event.clientY;

      const currentAim = this.isAiming || this.rightMouseAiming;
      const lookScale = currentAim ? 0.58 : 1;
      this.yaw -= deltaX * MOBILE_LOOK_SENSITIVITY_X * lookScale;
      this.pitch -= deltaY * MOBILE_LOOK_SENSITIVITY_Y * lookScale;
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

  bindEvents() {
    window.addEventListener("resize", () => this.onResize());
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.isAiming = false;
      this.rightMouseAiming = false;
      this.handlePrimaryActionUp();
      this.setTabScoreboardVisible(false);
      this.mobileState.lookPointerId = null;
      this.mobileState.aimPointerId = null;
      this.mobileState.firePointerId = null;
      this.resetMobileStick();
    });

    const controlKeys = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyF",
      "KeyQ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
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
      if (event.code === "Tab") {
        event.preventDefault();
        if (!this.chat?.isInputFocused) {
          this.setTabScoreboardVisible(true);
        }
        return;
      }

      if (
        this.isRunning &&
        this.chat &&
        !this.chat.isInputFocused &&
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

      if (this.chat?.isInputFocused) {
        return;
      }

      if (this.buildSystem.handleKeyDown(event)) {
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

      if (event.code === "Space" && this.onGround && this.isRunning && !this.isGameOver) {
        this.verticalVelocity = JUMP_FORCE;
        this.onGround = false;
      }

      if (event.code === "KeyF") {
        this.requestCenterFlagInteract({ source: "key" });
      }

      if (event.code === "ArrowRight") {
        this.isAiming = true;
      }
    });

    document.addEventListener("keyup", (event) => {
      if (event.code === "Tab") {
        event.preventDefault();
        this.setTabScoreboardVisible(false);
        return;
      }

      if (this.chat?.isInputFocused) {
        return;
      }

      if (controlKeys.has(event.code)) {
        event.preventDefault();
      }
      this.keys.delete(event.code);

      if (event.code === "ArrowRight") {
        this.isAiming = false;
      }
    });

    document.addEventListener("pointerlockchange", () => {
      const active = document.pointerLockElement === this.renderer.domElement;
      this.pointerLocked = active;
      if (!active) {
        this.leftMouseDown = false;
        this.rightMouseAiming = false;
      }

      if (!this.pointerLockSupported) {
        this.mouseLookEnabled = true;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      if (!this.isRunning || this.isGameOver) {
        this.mouseLookEnabled = active || this.allowUnlockedLook;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      if (this.chat?.isInputFocused) {
        this.mouseLookEnabled = false;
        this.hud.showPauseOverlay(false);
        this.syncCursorVisibility();
        return;
      }

      if (active) {
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

      this.mouseLookEnabled = false;
      this.hud.showPauseOverlay(true);
      this.syncCursorVisibility();
    });

    document.addEventListener("pointerlockerror", () => {
      if (!this.isRunning || this.isGameOver) {
        return;
      }

      this.mouseLookEnabled = false;
      this.hud.showPauseOverlay(true);
      this.hud.setStatus("\uB9C8\uC6B0\uC2A4\uB97C \uB2E4\uC2DC \uD074\uB9AD\uD574 \uACE0\uC815\uD558\uC138\uC694", true, 1.1);
      this.syncCursorVisibility();
    });

    document.addEventListener("mousemove", (event) => {
      if (
        !this.isRunning ||
        this.isGameOver ||
        !this.mouseLookEnabled ||
        this.chat?.isInputFocused
      ) {
        return;
      }

      const currentAim = this.isAiming || this.rightMouseAiming;
      const lookScale = currentAim ? 0.58 : 1;
      this.yaw -= event.movementX * 0.0022 * lookScale;
      this.pitch -= event.movementY * 0.002 * lookScale;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    });

    document.addEventListener(
      "wheel",
      (event) => {
        if (this.chat?.isInputFocused || !this.isRunning || this.isGameOver) {
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
      if (!isGameplayMouseEvent(event)) {
        return;
      }
      event.preventDefault();

      if (!this.isRunning || this.isGameOver) {
        return;
      }
      this.sound.unlock();

      if (this.buildSystem.isBuildMode()) {
        if (event.button === 0 || event.button === 2) {
          this.buildSystem.handlePointerAction(event.button, (x, y, z) =>
            !this.isPlayerIntersectingBlock(x, y, z)
          );
          return;
        }
      }

      const shouldTryPointerLock =
        this.pointerLockSupported &&
        !this.pointerLocked &&
        !this.mouseLookEnabled &&
        !this.chat?.isInputFocused;

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
        this.handlePrimaryActionUp();
      }
      if (this.buildSystem.isBuildMode()) {
        return;
      }

      if (event.button === 2) {
        this.rightMouseAiming = false;
      }
    });

    const switchTab = (active, inactive, showPanel, hidePanel) => {
      if (!active || !inactive || !showPanel || !hidePanel) {
        return;
      }
      active.classList.add("is-active");
      active.setAttribute("aria-selected", "true");
      inactive.classList.remove("is-active");
      inactive.setAttribute("aria-selected", "false");
      showPanel.classList.remove("hidden");
      hidePanel.classList.add("hidden");
    };

    const btnSingle = document.getElementById("mode-single");
    const btnOnline = document.getElementById("mode-online");
    const panelSingle = document.getElementById("single-panel");
    const panelOnline = document.getElementById("online-panel");

    btnSingle?.addEventListener("click", () => {
      switchTab(btnSingle, btnOnline, panelSingle, panelOnline);
      this.menuMode = "single";
    });

    btnOnline?.addEventListener("click", () => {
      switchTab(btnOnline, btnSingle, panelOnline, panelSingle);
      this.menuMode = "online";
      this.refreshOnlineStatus();
      this.requestRoomList();
    });

    if (btnSingle && btnOnline && panelSingle && panelOnline) {
      switchTab(btnOnline, btnSingle, panelOnline, panelSingle);
      this.menuMode = "online";
    }

    this.startButton?.addEventListener("click", () => {
      this.applyLobbyNickname();
      this.start({ mode: "single" });
    });

    this.mpCreateBtn?.addEventListener("click", () => {
      this.applyLobbyNickname();
      this.createRoom();
    });
    this.mpJoinBtn?.addEventListener("click", () => {
      this.applyLobbyNickname();
      this.joinRoomByInputCode();
    });
    this.mpStartBtn?.addEventListener("click", () => {
      this.startOnlineMatch();
    });
    this.mpRefreshBtn?.addEventListener("click", () => {
      this.refreshOnlineStatus();
      this.requestRoomList();
    });

    this.mpNameInput?.addEventListener("change", () => {
      this.applyLobbyNickname();
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

    this.hud.pauseOverlayEl?.addEventListener("click", () => {
      if (this.isRunning && !this.isGameOver) {
        if (this.allowUnlockedLook) {
          this.mouseLookEnabled = true;
          this.hud.showPauseOverlay(false);
          this.syncCursorVisibility();
          return;
        }
        this.tryPointerLock();
      }
    });
  }

  onChatFocusChanged(focused) {
    if (!this.isRunning || this.isGameOver) {
      this.syncCursorVisibility();
      return;
    }

    if (focused) {
      this.keys.clear();
      this.isAiming = false;
      this.rightMouseAiming = false;
      this.handlePrimaryActionUp();
      this.mobileState.lookPointerId = null;
      this.mobileState.aimPointerId = null;
      this.mobileState.firePointerId = null;
      this.resetMobileStick();
      this.mouseLookEnabled = false;
      this.hud.showPauseOverlay(false);

      if (
        this.pointerLockSupported &&
        document.pointerLockElement === this.renderer.domElement
      ) {
        document.exitPointerLock();
      }

      this.syncCursorVisibility();
      return;
    }

    if (this.pointerLocked || this.allowUnlockedLook) {
      this.mouseLookEnabled = true;
      this.hud.showPauseOverlay(false);
      this.syncCursorVisibility();
      return;
    }

    this.tryPointerLock();
  }

  start(options = {}) {
    const mode = options.mode ?? this.menuMode;
    this.activeMatchMode = mode === "online" ? "online" : "single";
    this.resetState();
    this.setTabScoreboardVisible(false);
    this.hud.showStartOverlay(false);
    this.hud.showPauseOverlay(false);
    this.hud.hideGameOver();
    this.isRunning = true;
    this.isGameOver = false;
    this.mouseLookEnabled = this.allowUnlockedLook;
    this.syncCursorVisibility();
    this.clock.start();
    this.tryPointerLock();

    if (!this.pointerLockSupported) {
      this.hud.setStatus("포인터 락을 사용할 수 없어 자유 시점 모드로 전환합니다.", true, 1.2);
    }

    this.addChatMessage("작전 시작. 생존하면서 목표를 수행하세요.", "info");
    this.addChatMessage("목표: 적을 제압하고 중앙 깃발을 탈취하세요.", "info");
    this.addChatMessage("조작: WASD, SPACE, 1/2/3, R, NumPad1-8", "info");
    if (this.activeMatchMode === "online") {
      this.hud.setStatus("온라인 매치 시작: AI 비활성화", false, 0.9);
      if (this.latestRoomSnapshot) {
        this.applyRoomSnapshot(this.latestRoomSnapshot);
      } else {
        this.requestRoomSnapshot();
      }
      this.setOnlineSpawnFromLobby();
      this.syncRemotePlayersFromLobby();
      this.state.objectiveText = this.getOnlineObjectiveText();
      this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
    }
    this.updateTeamScoreHud();
    this.updateFlagInteractUi();
    this.refreshOnlineStatus();
  }

  schedulePointerLockFallback() {
    if (this.pointerLockFallbackTimer !== null) {
      window.clearTimeout(this.pointerLockFallbackTimer);
      this.pointerLockFallbackTimer = null;
    }

    if (!this.pointerLockSupported || this.allowUnlockedLook || !this.mobileEnabled) {
      return;
    }

    this.pointerLockFallbackTimer = window.setTimeout(() => {
      this.pointerLockFallbackTimer = null;

      if (
        !this.isRunning ||
        this.isGameOver ||
        this.pointerLocked ||
        this.allowUnlockedLook ||
        this.chat?.isInputFocused
      ) {
        return;
      }

      this.allowUnlockedLook = true;
      this.mouseLookEnabled = true;
      this.hud.showPauseOverlay(false);
      this.hud.setStatus("포인터 락 대체 모드를 활성화했습니다.", true, 1);
      this.syncCursorVisibility();
    }, POINTER_LOCK_FALLBACK_MS);
  }

  resetState() {
    if (this.pointerLockFallbackTimer !== null) {
      window.clearTimeout(this.pointerLockFallbackTimer);
      this.pointerLockFallbackTimer = null;
    }

    this.keys.clear();
    this.remoteSyncClock = 0;
    this.pendingRemoteBlocks.clear();
    this.perfStats.frameCount = 0;
    this.perfStats.totalMs = 0;
    this.perfStats.slowFrames = 0;
    this.perfStats.worstMs = 0;
    this.perfStats.lastReportAt = getNowMs();
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
    this.setRespawnBanner("", false);
    this.setTabScoreboardVisible(false);
    this.flagInteractVisible = false;
    this.flagInteractBtnEl?.classList.remove("show");
    this.flagInteractBtnEl?.setAttribute("aria-hidden", "true");
    this.pvpImmuneHintUntil = 0;
    this.scoreHudState.show = null;
    this.scoreHudState.alpha = null;
    this.scoreHudState.bravo = null;
    this.weapon.reset();
    this.enemyManager.reset();
    this.playerPosition.set(0, PLAYER_HEIGHT, 0);
    this.verticalVelocity = 0;
    this.onGround = true;
    this.yaw = 0;
    this.pitch = 0;
    this.weaponRecoil = 0;
    this.weaponBobClock = 0;
    this.isAiming = false;
    this.rightMouseAiming = false;
    this.leftMouseDown = false;
    this.aimBlend = 0;
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
    this._wasReloading = false;
    this.lastDryFireAt = -10;
    this.chatIntroShown = false;
    this.resetObjectives();
    this.clearRemotePlayers();
    this.clearChatMessages();
    this.hud.setKillStreak(0);
    this.camera.position.copy(this.playerPosition);
    this.camera.rotation.set(0, 0, 0);
    this.syncCursorVisibility();
    this.updateTeamScoreHud();

    this.hud.update(0, { ...this.state, ...this.weapon.getState() });
    if (this.weaponFlashLight) {
      this.weaponFlashLight.intensity = 0;
    }
  }

  fire() {
    if (
      !this.isRunning ||
      this.isGameOver ||
      this.isRespawning ||
      (this.activeMatchMode === "online" && this.onlineRoundEnded) ||
      this.chat?.isInputFocused ||
      !this.buildSystem.isGunMode()
    ) {
      return;
    }

    const shot = this.weapon.tryShoot();
    if (!shot.success) {
      if (shot.reason === "empty") {
        const now = this.clock.getElapsedTime();
        if (now - this.lastDryFireAt > 0.22) {
          this.lastDryFireAt = now;
          this.hud.setStatus("?꾩빟 ?놁쓬", true, 0.55);
          this.sound.play("dry", { rateJitter: 0.08 });
        }
      }
      return;
    }

    this.weaponRecoil = 1;
    this.sound.play("shot", { rateJitter: 0.035 });
    this.hud.pulseCrosshair();
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const blockHit = this.voxelWorld.raycast(this.raycaster, 120);
    const maxEnemyDistance = blockHit ? Math.max(0, blockHit.distance - 0.001) : Infinity;

    if (this.activeMatchMode === "online") {
      if (!this.getMyTeam()) {
        this.hud.setStatus("공격 전에 팀을 먼저 선택하세요.", true, 0.7);
        if (blockHit?.point) {
          this.spawnHitSpark(blockHit.point);
        }
        return;
      }

      const remoteHit = this.findOnlineShotTarget(maxEnemyDistance);
      if (!remoteHit) {
        if (blockHit?.point) {
          this.spawnHitSpark(blockHit.point);
        }
        return;
      }

      this.spawnHitSpark(remoteHit.point, {
        color: 0xffd58a,
        scale: 0.95,
        lift: 0.3,
        ttl: 0.22
      });
      this.emitPvpShot(remoteHit.id);
      return;
    }

    const result = this.enemyManager.handleShot(this.raycaster, maxEnemyDistance);

    if (!result.didHit) {
      if (blockHit?.point) {
        this.spawnHitSpark(blockHit.point);
      }
      return;
    }

    this.hud.pulseHitmarker();
    if (result.hitPoint) {
      this.spawnHitSpark(result.hitPoint);
    }
    this.state.score += result.points;

    if (result.didKill) {
      this.state.kills += 1;
      const now = this.clock.getElapsedTime();
      if (now - this.state.lastKillTime < 4.0) {
        this.state.killStreak += 1;
      } else {
        this.state.killStreak = 1;
      }
      this.state.lastKillTime = now;
      this.hud.setStatus("+100 처치", false, 0.45);
      this.hud.setKillStreak(this.state.killStreak);

      if (this.state.killStreak >= 3) {
        this.addChatMessage(
          `${this.state.killStreak}연속 처치! 처치 보너스 +${this.state.kills * 10}`,
          "streak"
        );
      } else {
        this.addChatMessage(`적 처치 +100 (총 처치 ${this.state.kills})`, "kill");
      }
    }
  }

  applyMovement(delta) {
    if (this.activeMatchMode === "online" && this.onlineRoundEnded) {
      return;
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

      for (let i = 0; i < horizontalSteps; i += 1) {
        if (stepX !== 0) {
          const nextX = THREE.MathUtils.clamp(
            this.playerPosition.x + stepX,
            -WORLD_LIMIT,
            WORLD_LIMIT
          );
          if (!this.isPlayerCollidingAt(nextX, this.playerPosition.y, this.playerPosition.z)) {
            this.playerPosition.x = nextX;
          }
        }

        if (stepZ !== 0) {
          const nextZ = THREE.MathUtils.clamp(
            this.playerPosition.z + stepZ,
            -WORLD_LIMIT,
            WORLD_LIMIT
          );
          if (!this.isPlayerCollidingAt(this.playerPosition.x, this.playerPosition.y, nextZ)) {
            this.playerPosition.z = nextZ;
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

    const surfaceY = this.voxelWorld.getSurfaceYAt(this.playerPosition.x, this.playerPosition.z);
    if (!Number.isFinite(surfaceY)) {
      this.onGround = false;
      return;
    }

    const floorY = surfaceY + PLAYER_HEIGHT;
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
      this.playerPosition.y = floorY;
      this.verticalVelocity = 0;
      this.onGround = true;
      return;
    }

    this.onGround = false;
  }

  updateCamera(delta) {
    const gunMode = this.buildSystem.isGunMode();
    const digMode = this.buildSystem.isDigMode();
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
      !this.chat?.isInputFocused;
    this.aimBlend = THREE.MathUtils.damp(this.aimBlend, aiming ? 1 : 0, 12, delta);

    const bobSpeed = sprinting ? 13 : 9;
    this.weaponBobClock += delta * (isMoving ? bobSpeed : 3);

    const bobAmount = (isMoving ? 1 : 0.2) * (1 - this.aimBlend * 0.85);
    const bobX = Math.sin(this.weaponBobClock) * 0.012 * bobAmount;
    const bobY = Math.abs(Math.cos(this.weaponBobClock * 2)) * 0.012 * bobAmount;

    this.weaponRecoil = Math.max(0, this.weaponRecoil - delta * 8.5);
    const recoil = this.weaponRecoil * 0.07 * (1 - this.aimBlend * 0.6);

    const targetWeaponX = THREE.MathUtils.lerp(0.38, 0.0, this.aimBlend);
    const targetWeaponY = THREE.MathUtils.lerp(-0.38, -0.24, this.aimBlend);
    const targetWeaponZ = THREE.MathUtils.lerp(-0.76, -0.36, this.aimBlend);
    this.weaponView.position.set(
      targetWeaponX + bobX,
      targetWeaponY - bobY,
      targetWeaponZ + recoil
    );
    this.weaponView.rotation.set(
      THREE.MathUtils.lerp(-0.22, -0.05, this.aimBlend) -
        this.weaponRecoil * 0.18 +
        bobY * 0.45,
      THREE.MathUtils.lerp(-0.06, 0, this.aimBlend) + bobX * 1.4,
      THREE.MathUtils.lerp(0.02, 0, this.aimBlend)
    );
    if (this.shovelView) {
      this.shovelView.position.set(0.48 + bobX * 0.85, -0.44 - bobY * 0.9, -0.72 + recoil * 0.2);
      this.shovelView.rotation.set(-0.28 + bobY * 0.4, -0.18 + bobX * 0.55, 0.34 + bobX * 0.9);
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

    const hideViewModel = this.isRespawning || this.localDeathAnimBlend > 0.04;
    this.weaponView.visible = gunMode && !hideViewModel;
    if (this.shovelView) {
      this.shovelView.visible = digMode && !hideViewModel;
    }
    const nextFov = gunMode
      ? THREE.MathUtils.lerp(DEFAULT_FOV, AIM_FOV, this.aimBlend)
      : DEFAULT_FOV;
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
    }
  }

  tick(delta) {
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
    const isChatting = !!this.chat?.isInputFocused;
    const gunMode = this.buildSystem.isGunMode();
    const aiEnabled = this.activeMatchMode !== "online";

    if (gunMode) {
      this.weapon.update(delta);
    }

    if (this.activeMatchMode === "online") {
      this.updateRemotePlayers(delta);
      this.processPendingRemoteBlocks(delta);
      this.emitLocalPlayerSync(delta);
    }

    this.updateOnlineRoundCountdown();
    this.updateRespawnCountdown();

    const requiresLockedLook = !this.mouseLookEnabled && !isChatting && !this.isRespawning;
    if (!this.isRunning || this.isGameOver || requiresLockedLook) {
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
      this.hud.update(delta, {
        ...this.state,
        ...this.weapon.getState(),
        enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
      });
      return;
    }

    if (gunMode && this.leftMouseDown) {
      this.fire();
    }

    this.applyMovement(delta);
    this.updateCamera(delta);
    this.updateObjectives(delta);

    const weapState = this.weapon.getState();
    if (gunMode && !this._wasReloading && weapState.reloading) {
      this.sound.play("reload", { gain: 0.9, rateJitter: 0.03 });
    }
    if (gunMode && this._wasReloading && !weapState.reloading) {
      this.addChatMessage("?ъ옣???꾨즺", "info");
    }
    this._wasReloading = gunMode ? weapState.reloading : false;

    if (aiEnabled) {
      const combatResult = this.enemyManager.update(delta, this.playerPosition, {
        alphaBase: this.objective.alphaBase,
        bravoBase: this.objective.bravoBase,
        controlPoint: this.objective.controlPoint,
        controlRadius: this.objective.controlRadius,
        controlOwner: this.objective.controlOwner,
        playerHasEnemyFlag: this.objective.playerHasEnemyFlag
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

    this.hud.update(delta, {
      ...this.state,
      ...weapState,
      enemyCount: aiEnabled ? this.enemyManager.enemies.length : 0
    });
  }

  trackFrameTiming(delta) {
    if (!this.perfDebugEnabled) {
      return;
    }

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
    if (stats.slowFrames > 0 || stats.worstMs >= PERF_SLOW_FRAME_MS) {
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
    this.mobileEnabled = isLikelyTouchDevice();
    if (this.mobileEnabled && !this._mobileBound) {
      this.setupMobileControls();
    }
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.lastAppliedFov = this.camera.fov;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.updateMobileControlsVisibility();
  }

  tryPointerLock() {
    if (!this.pointerLockSupported || this.pointerLocked || this.chat?.isInputFocused) {
      return;
    }

    const maybePromise = this.renderer.domElement.requestPointerLock();
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => {
        if (!this.isRunning || this.isGameOver) {
          return;
        }
        this.hud.showPauseOverlay(true);
        this.hud.setStatus("마우스를 다시 클릭하면 시점 고정이 활성화됩니다", true, 1);
        this.syncCursorVisibility();
      });
    }
  }

  syncCursorVisibility() {
    this.updateMobileControlsVisibility();
    if (this.mobileEnabled) {
      document.body.style.cursor = "";
      this.renderer.domElement.style.cursor = "";
      return;
    }

    const hideCursor =
      this.isRunning &&
      !this.isGameOver &&
      (this.mouseLookEnabled || this.rightMouseAiming || this.isAiming) &&
      !this.chat?.isInputFocused;
    const cursor = hideCursor ? "none" : "";
    document.body.style.cursor = cursor;
    this.renderer.domElement.style.cursor = cursor;
  }

  updateVisualMode(mode) {
    const build = mode !== "gun" && mode !== "weapon";
    document.body.classList.toggle("ui-mode-build", build);
    document.body.classList.toggle("ui-mode-combat", !build);
  }

  isPlayerCollidingAt(positionX, positionY, positionZ) {
    const feetY = positionY - PLAYER_HEIGHT;
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
    const feetY = this.playerPosition.y - PLAYER_HEIGHT;
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
    this.chat.addSystemMessage(text, "system");
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

    socket.on("room:snapshot", (payload) => {
      this.applyRoomSnapshot(payload);
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

    socket.on("room:started", ({ code }) => {
      if (!code || this.lobbyState.roomCode !== code) {
        return;
      }
      this.setOnlineRoundState({
        ended: false,
        winnerTeam: null,
        restartAt: 0,
        targetScore: this.onlineTargetScore,
        announce: false
      });
      this.hud.setStatus(`온라인 매치 시작 (${code})`, false, 1);
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
    socket.emit("room:quick-join", { name: this.chat?.playerName }, (response = {}) => {
      this._joiningDefaultRoom = false;
      if (!response.ok) {
        this._nextAutoJoinAt = Date.now() + 1800;
        this.hud.setStatus(response.error ?? "온라인 방 참가에 실패했습니다.", true, 1);
        this.refreshOnlineStatus();
        return;
      }
      this._nextAutoJoinAt = 0;
      this.setLobbyState(response.room ?? null);
      this.requestRoomSnapshot();
      this.refreshOnlineStatus();
    });
  }

  renderRoomList(rooms) {
    if (!this.mpRoomListEl) {
      return;
    }

    const list = Array.isArray(rooms) ? rooms : [];
    const connected = !!this.chat?.isConnected?.();
    if (!connected) {
      this.mpRoomListEl.innerHTML =
        '<div class="mp-empty">서버 연결을 시도 중입니다. 잠시 후 다시 시도해 주세요.</div>';
      return;
    }

    const globalRoom =
      list.find((room) => String(room.code ?? "").toUpperCase() === ONLINE_ROOM_CODE) ??
      list[0] ??
      null;
    if (!globalRoom) {
      this.mpRoomListEl.innerHTML = '<div class="mp-empty">GLOBAL 방 정보를 불러오지 못했습니다.</div>';
      return;
    }

    const playerCount = Number(globalRoom.count ?? this.lobbyState.players.length ?? 0);
    this.mpRoomListEl.innerHTML =
      `<div class="mp-room-row is-single">` +
      `<div class="mp-room-label">${ONLINE_ROOM_CODE}  ${playerCount}/${ONLINE_MAX_PLAYERS}` +
      `<span class="mp-room-host">24시간 운영</span>` +
      `</div>` +
      `</div>`;
  }

  setLobbyState(room) {
    if (!room) {
      this.lobbyState.roomCode = null;
      this.lobbyState.hostId = null;
      this.lobbyState.players = [];
      this.lobbyState.selectedTeam = null;
      this.latestRoomSnapshot = null;
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
      return;
    }

    this.lobbyState.roomCode = String(room.code ?? "");
    this.lobbyState.hostId = String(room.hostId ?? "");
    this.lobbyState.players = Array.isArray(room.players) ? room.players : [];

    const myId = this.chat?.socket?.id ?? "";
    const me = this.lobbyState.players.find((player) => player.id === myId) ?? null;
    this.lobbyState.selectedTeam = me?.team ?? null;
    this.applyInventorySnapshot(me?.stock ?? null, { quiet: true });

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
      this.mpRoomSubtitleEl.textContent = `24시간 GLOBAL 방 | ${this.lobbyState.players.length}/${ONLINE_MAX_PLAYERS}`;
    }

    this.mpTeamAlphaBtn?.classList.toggle("is-active", this.lobbyState.selectedTeam === "alpha");
    this.mpTeamBravoBtn?.classList.toggle("is-active", this.lobbyState.selectedTeam === "bravo");
    this.mpLobbyEl?.classList.remove("hidden");
    this.applyOnlineStatePayload(room?.state ?? {}, { showEvent: false });
    this.syncRemotePlayersFromLobby();
    if (this.tabBoardVisible) {
      this.renderTabScoreboard();
    }
    if (this.activeMatchMode === "online" && this.isRunning) {
      this.emitLocalPlayerSync(REMOTE_SYNC_INTERVAL, true);
    }
    this.updateTeamScoreHud();
    this.updateFlagInteractUi();
    this.refreshOnlineStatus();
  }

  applyLobbyNickname() {
    const raw = this.mpNameInput?.value;
    if (!raw || !this.chat?.setPlayerName) {
      return;
    }
    this.chat.setPlayerName(raw);
  }

  createRoom() {
    this.applyLobbyNickname();
    this.joinDefaultRoom();
  }

  joinRoomByInputCode() {
    this.applyLobbyNickname();
    this.joinDefaultRoom();
  }

  joinRoom(_code) {
    this.applyLobbyNickname();
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

  startOnlineMatch() {
    const socket = this.chat?.socket;
    if (!socket || !socket.connected) {
      this.hud.setStatus("서버가 오프라인입니다.", true, 1);
      return;
    }

    if (!this.lobbyState.roomCode) {
      this.joinDefaultRoom({ force: true });
      this.hud.setStatus("온라인 방으로 자동 참가 중...", false, 0.8);
      return;
    }

    socket.emit("room:start", (response = {}) => {
      if (!response.ok) {
        this.hud.setStatus(response.error ?? "온라인 매치 시작에 실패했습니다.", true, 1);
      }
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

  updateLobbyControls() {
    const connected = !!this.chat?.isConnected?.();
    const connecting = !!this.chat?.isConnecting?.();
    const inRoom = !!this.lobbyState.roomCode;
    const canStart = connected && inRoom;

    if (this.mpCreateBtn) {
      this.mpCreateBtn.disabled = true;
      this.mpCreateBtn.classList.add("hidden");
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
        this.mpStartBtn.textContent = "서버 연결 중...";
      } else if (!connected) {
        this.mpStartBtn.textContent = "서버 오프라인";
      } else if (!inRoom) {
        this.mpStartBtn.textContent = "방 자동 참가 중...";
      } else {
        this.mpStartBtn.textContent = "온라인 매치 시작";
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
    }
    if (this.mpTeamBravoBtn) {
      this.mpTeamBravoBtn.disabled = !inRoom;
    }
    if (this.mpRefreshBtn) {
      this.mpRefreshBtn.disabled = !connected;
    }
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

    if (this.chat.isConnecting()) {
      this.mpStatusEl.textContent = "서버: 연결 중(기동 대기)...";
      this.mpStatusEl.dataset.state = "offline";
      this.updateLobbyControls();
      return;
    }

    if (!this.chat.isConnected()) {
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


