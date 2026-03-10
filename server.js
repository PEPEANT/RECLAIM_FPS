import { createServer } from "http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { Server } from "socket.io";
import { DEFAULT_GAME_MODE, GAME_MODE, normalizeGameMode } from "./src/shared/gameModes.js";
import {
  CTF_CAPTURE_RADIUS,
  CTF_PICKUP_RADIUS,
  CTF_WIN_SCORE,
  PVP_RESPAWN_MS,
  ROUND_RESTART_DELAY_MS
} from "./src/shared/matchConfig.js";
import {
  DEFAULT_WEAPON_ID,
  getWeaponDefinition,
  sanitizeWeaponId
} from "./src/shared/weaponCatalog.js";
import {
  getInitialOnlineMapId,
  getNextOnlineMapId,
  getOnlineMapConfig,
  normalizeOnlineMapId
} from "./src/shared/onlineMapRotation.js";

function parseCorsOrigins(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value === "*") {
    return "*";
  }

  const list = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return list.length > 0 ? list : "*";
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

const DIST_DIR = resolve(process.cwd(), "dist");
const DIST_INDEX_PATH = resolve(DIST_DIR, "index.html");
const HAS_STATIC_DIST = existsSync(DIST_INDEX_PATH);

const MIME_TYPE_BY_EXT = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".mp4", "video/mp4"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function getMimeType(filePath) {
  return MIME_TYPE_BY_EXT.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function parsePathname(urlRaw = "/") {
  try {
    return new URL(urlRaw, "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function streamFile(res, filePath, { cacheControl = "no-store" } = {}) {
  try {
    const stats = statSync(filePath);
    res.writeHead(200, {
      "content-type": getMimeType(filePath),
      "content-length": String(stats.size),
      "cache-control": cacheControl
    });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function tryServeStatic(req, res) {
  if (!HAS_STATIC_DIST) {
    return false;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return false;
  }

  const pathname = parsePathname(req.url);
  if (pathname.startsWith("/socket.io/")) {
    return false;
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const absoluteRequested = resolve(DIST_DIR, `.${requestedPath}`);
  if (!absoluteRequested.startsWith(DIST_DIR)) {
    return false;
  }

  if (existsSync(absoluteRequested)) {
    const isHtml = extname(absoluteRequested).toLowerCase() === ".html";
    return streamFile(res, absoluteRequested, {
      cacheControl: isHtml ? "no-store" : "public, max-age=31536000, immutable"
    });
  }

  const hasExplicitExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
  if (hasExplicitExtension) {
    return false;
  }

  return streamFile(res, DIST_INDEX_PATH, { cacheControl: "no-store" });
}

async function probeExistingServer(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" }
    });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json().catch(() => null);
    return Boolean(payload?.ok && payload?.service === "reclaim-fps-chat");
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

const DEFAULT_ROOM_CODE = "GLOBAL";
const MAX_ROOM_PLAYERS = 50;
const EXIT_PORTAL_TARGET_PATH = "C:\\Users\\rneet\\OneDrive\\Desktop\\Emptines";
const PVP_DEFAULT_DAMAGE = getWeaponDefinition(DEFAULT_WEAPON_ID).damage;
const HAZARD_DAMAGE_MIN = 1;
const HAZARD_DAMAGE_MAX = 2000;
const VOID_HAZARD_MIN_DAMAGE = 100;
const RESPAWN_SHIELD_MS = 1800;
const BLOCK_KEY_SEPARATOR = "|";
const BLOCK_TYPE_MIN = 1;
const BLOCK_TYPE_MAX = 8;
const DEFAULT_BLOCK_STOCK = 32;
const MAX_BLOCK_STOCK = 999;
const ENABLE_PERSISTENT_WORLD_STATE = true;
const PERSISTENT_WORLD_STATE_VERSION = 1;
const PERSISTENT_WORLD_SAVE_DEBOUNCE_MS = 700;
const PERSISTENT_WORLD_MAX_BLOCKS = 300_000;
const PERSISTENT_WORLD_STATE_PATH = resolve(
  process.cwd(),
  "storage",
  "global-world-state.json"
);
const PERSISTENT_WORLD_MAP_ID = getInitialOnlineMapId();
const DAILY_LEADERBOARD_VERSION = 1;
const DAILY_LEADERBOARD_MAX_ENTRIES = 200;
const DAILY_LEADERBOARD_PATH = resolve(process.cwd(), "storage", "daily-leaderboard.json");
const DAILY_LEADERBOARD_TIMEZONE_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAILY_LEADERBOARD_RESET_CHECK_MS = 15_000;
const DEFAULT_TEAM_HOME = Object.freeze({
  alpha: Object.freeze({ ...getOnlineMapConfig(PERSISTENT_WORLD_MAP_ID).alphaBase }),
  bravo: Object.freeze({ ...getOnlineMapConfig(PERSISTENT_WORLD_MAP_ID).bravoBase })
});
const DEFAULT_TEAM_FLAG_HOME = Object.freeze({
  alpha: Object.freeze({ ...getOnlineMapConfig(PERSISTENT_WORLD_MAP_ID).alphaFlag }),
  bravo: Object.freeze({ ...getOnlineMapConfig(PERSISTENT_WORLD_MAP_ID).bravoFlag })
});
const SPAWN_PROTECT_RADIUS = 4;
const SPAWN_PROTECT_RADIUS_SQ = SPAWN_PROTECT_RADIUS * SPAWN_PROTECT_RADIUS;
const SPAWN_PROTECT_MIN_Y = -1;
const SPAWN_PROTECT_MAX_Y = 6;
const BASE_FLOOR_PROTECT_RADIUS = 8;
const BASE_FLOOR_PROTECT_RADIUS_SQ = BASE_FLOOR_PROTECT_RADIUS * BASE_FLOOR_PROTECT_RADIUS;
const BASE_FLOOR_PROTECT_MAX_Y = -4;
const SPAWN_PROTECT_CENTERS = Object.freeze([
  Object.freeze({ x: DEFAULT_TEAM_HOME.alpha.x, z: DEFAULT_TEAM_HOME.alpha.z }),
  Object.freeze({ x: DEFAULT_TEAM_HOME.bravo.x, z: DEFAULT_TEAM_HOME.bravo.z })
]);
const LOBBY3D_CENTER_X = 0;
const LOBBY3D_CENTER_Z = -22;
const LOBBY3D_HALF_X = 34;
const LOBBY3D_HALF_Z = 24;
const LOBBY3D_FLOOR_Y = 18;
const LOBBY3D_WALL_HEIGHT = 10;
const LOBBY3D_MIN_X = LOBBY3D_CENTER_X - LOBBY3D_HALF_X;
const LOBBY3D_MAX_X = LOBBY3D_CENTER_X + LOBBY3D_HALF_X;
const LOBBY3D_MIN_Z = LOBBY3D_CENTER_Z - LOBBY3D_HALF_Z;
const LOBBY3D_MAX_Z = LOBBY3D_CENTER_Z + LOBBY3D_HALF_Z;
const LOBBY3D_MIN_Y = LOBBY3D_FLOOR_Y - 1;
const LOBBY3D_MAX_Y = LOBBY3D_FLOOR_Y + LOBBY3D_WALL_HEIGHT;

const rooms = new Map();
let playerCount = 0;
let persistentWorldSaveTimer = null;
let dailyLeaderboardSaveTimer = null;
let dailyLeaderboardState = null;
let dailyLeaderboardResetInterval = null;

function clonePoint(point = { x: 0, y: 0, z: 0 }) {
  return {
    x: Number(point.x ?? 0),
    y: Number(point.y ?? 0),
    z: Number(point.z ?? 0)
  };
}

function getRoomMapId(roomOrState = null) {
  const source =
    roomOrState && typeof roomOrState === "object" && "state" in roomOrState
      ? getRoomState(roomOrState)
      : roomOrState;
  return normalizeOnlineMapId(source?.mapId ?? PERSISTENT_WORLD_MAP_ID);
}

function getRoomMapConfig(roomOrState = null) {
  return getOnlineMapConfig(getRoomMapId(roomOrState));
}

function getTeamHomeForMap(mapId, team) {
  const config = getOnlineMapConfig(mapId);
  return clonePoint(team === "bravo" ? config.bravoBase : config.alphaBase);
}

function getTeamFlagHomeForMap(mapId, team) {
  const config = getOnlineMapConfig(mapId);
  return clonePoint(team === "bravo" ? config.bravoFlag : config.alphaFlag);
}

function getTeamHomeForRoom(roomOrState, team) {
  return getTeamHomeForMap(getRoomMapId(roomOrState), team);
}

function getTeamFlagHomeForRoom(roomOrState, team) {
  return getTeamFlagHomeForMap(getRoomMapId(roomOrState), team);
}

function getSpawnProtectCentersForRoom(roomOrState) {
  const config = getRoomMapConfig(roomOrState);
  return [
    {
      x: Number(config.alphaBase?.x ?? DEFAULT_TEAM_HOME.alpha.x),
      z: Number(config.alphaBase?.z ?? DEFAULT_TEAM_HOME.alpha.z)
    },
    {
      x: Number(config.bravoBase?.x ?? DEFAULT_TEAM_HOME.bravo.x),
      z: Number(config.bravoBase?.z ?? DEFAULT_TEAM_HOME.bravo.z)
    }
  ];
}

function createDefaultFlag(homePoint) {
  const home = clonePoint(homePoint);
  return {
    home,
    at: clonePoint(home),
    carrierId: null
  };
}

function createDefaultTeamFlags(mapId = PERSISTENT_WORLD_MAP_ID) {
  return {
    alpha: createDefaultFlag(getTeamFlagHomeForMap(mapId, "alpha")),
    bravo: createDefaultFlag(getTeamFlagHomeForMap(mapId, "bravo"))
  };
}

function cloneFlagState(flag = null, fallbackHome = { x: 0, y: 0, z: 0 }) {
  const source = flag && typeof flag === "object" ? flag : {};
  const home = clonePoint(source.home ?? fallbackHome);
  return {
    home,
    at: clonePoint(source.at ?? home),
    carrierId: source.carrierId ? String(source.carrierId) : null
  };
}

function cloneTeamFlagsState(flags = null, mapId = PERSISTENT_WORLD_MAP_ID) {
  const source = flags && typeof flags === "object" ? flags : {};
  return {
    alpha: cloneFlagState(source.alpha, getTeamFlagHomeForMap(mapId, "alpha")),
    bravo: cloneFlagState(source.bravo, getTeamFlagHomeForMap(mapId, "bravo"))
  };
}

function sanitizePersistedBlockEntry(entry = {}) {
  const action = entry.action === "place" ? "place" : entry.action === "remove" ? "remove" : null;
  if (!action) {
    return null;
  }

  const x = Number(entry.x);
  const y = Number(entry.y);
  const z = Number(entry.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  const normalized = {
    action,
    x: Math.trunc(x),
    y: Math.trunc(y),
    z: Math.trunc(z)
  };
  if (getProtectedBlockReason(normalized.action, normalized.x, normalized.y, normalized.z)) {
    return null;
  }

  if (action === "place") {
    const typeId = normalizeStockTypeId(entry.typeId);
    if (!typeId) {
      return null;
    }
    normalized.typeId = typeId;
  }

  return normalized;
}

function isLobbyProtectedBlockCoord(x, y, z) {
  const bx = Math.trunc(Number(x));
  const by = Math.trunc(Number(y));
  const bz = Math.trunc(Number(z));
  if (!Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)) {
    return false;
  }
  if (bx < LOBBY3D_MIN_X || bx > LOBBY3D_MAX_X || bz < LOBBY3D_MIN_Z || bz > LOBBY3D_MAX_Z) {
    return false;
  }
  return by >= LOBBY3D_MIN_Y && by <= LOBBY3D_MAX_Y;
}

function loadPersistentWorldSnapshot() {
  if (!ENABLE_PERSISTENT_WORLD_STATE) {
    return null;
  }

  try {
    if (!existsSync(PERSISTENT_WORLD_STATE_PATH)) {
      return null;
    }
    const raw = readFileSync(PERSISTENT_WORLD_STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const mapId = String(parsed.mapId ?? PERSISTENT_WORLD_MAP_ID);
    if (mapId !== PERSISTENT_WORLD_MAP_ID) {
      console.log(
        `[persist] snapshot mapId mismatch (${mapId}), expected ${PERSISTENT_WORLD_MAP_ID}. ignoring`
      );
      return null;
    }

    const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
    const sanitized = [];
    for (const entry of blocks) {
      const normalized = sanitizePersistedBlockEntry(entry);
      if (!normalized) {
        continue;
      }
      sanitized.push(normalized);
      if (sanitized.length >= PERSISTENT_WORLD_MAX_BLOCKS) {
        break;
      }
    }

    return {
      version: Number(parsed.version ?? 1),
      mapId,
      savedAt: Number(parsed.savedAt ?? 0),
      roomCode: String(parsed.roomCode ?? DEFAULT_ROOM_CODE),
      blocks: sanitized
    };
  } catch (error) {
    console.warn("[persist] failed to load world snapshot:", error?.message ?? error);
    return null;
  }
}

function applyPersistentWorldSnapshot(room) {
  if (!room?.persistent || !ENABLE_PERSISTENT_WORLD_STATE) {
    return;
  }

  const activeMapId = getRoomMapId(room);
  const snapshot = loadPersistentWorldSnapshot();
  if (!snapshot || !Array.isArray(snapshot.blocks) || snapshot.blocks.length === 0) {
    return;
  }
  if (normalizeOnlineMapId(snapshot.mapId) !== activeMapId) {
    return;
  }

  const state = getRoomState(room);
  state.blocks.clear();
  for (const block of snapshot.blocks) {
    const key = blockStateKey(block.x, block.y, block.z);
    if (block.action === "place") {
      state.blocks.set(key, {
        action: "place",
        x: block.x,
        y: block.y,
        z: block.z,
        typeId: block.typeId
      });
      continue;
    }

    state.blocks.set(key, {
      action: "remove",
      x: block.x,
      y: block.y,
      z: block.z
    });
  }

  state.updatedAt = Date.now();
  console.log(`[persist] loaded ${state.blocks.size} world block changes from disk`);
}

function savePersistentWorldSnapshot(room) {
  if (!room?.persistent || !ENABLE_PERSISTENT_WORLD_STATE) {
    return;
  }

  try {
    const activeMapId = getRoomMapId(room);
    const blocks = serializeBlocksSnapshot(room).slice(0, PERSISTENT_WORLD_MAX_BLOCKS);
    const payload = {
      version: PERSISTENT_WORLD_STATE_VERSION,
      mapId: activeMapId,
      roomCode: room.code,
      savedAt: Date.now(),
      blocks
    };

    mkdirSync(dirname(PERSISTENT_WORLD_STATE_PATH), { recursive: true });
    writeFileSync(PERSISTENT_WORLD_STATE_PATH, JSON.stringify(payload), "utf8");
  } catch (error) {
    console.warn("[persist] failed to save world snapshot:", error?.message ?? error);
  }
}

function schedulePersistentWorldSnapshotSave(room, { immediate = false } = {}) {
  if (!room?.persistent || !ENABLE_PERSISTENT_WORLD_STATE) {
    return;
  }

  if (persistentWorldSaveTimer) {
    clearTimeout(persistentWorldSaveTimer);
    persistentWorldSaveTimer = null;
  }

  if (immediate) {
    savePersistentWorldSnapshot(room);
    return;
  }

  persistentWorldSaveTimer = setTimeout(() => {
    persistentWorldSaveTimer = null;
    savePersistentWorldSnapshot(room);
  }, PERSISTENT_WORLD_SAVE_DEBOUNCE_MS);
}

function flushPersistentWorldSnapshot() {
  if (persistentWorldSaveTimer) {
    clearTimeout(persistentWorldSaveTimer);
    persistentWorldSaveTimer = null;
  }

  const room = rooms.get(DEFAULT_ROOM_CODE);
  if (!room) {
    return;
  }

  savePersistentWorldSnapshot(room);
}

function normalizeStockTypeId(typeId) {
  const parsed = Math.trunc(Number(typeId));
  if (!Number.isFinite(parsed) || parsed < BLOCK_TYPE_MIN || parsed > BLOCK_TYPE_MAX) {
    return null;
  }
  return parsed;
}

function createDefaultBlockStock() {
  const stock = {};
  for (let id = BLOCK_TYPE_MIN; id <= BLOCK_TYPE_MAX; id += 1) {
    stock[id] = DEFAULT_BLOCK_STOCK;
  }
  return stock;
}

function sanitizeBlockStock(raw = null) {
  const next = createDefaultBlockStock();
  if (!raw || typeof raw !== "object") {
    return next;
  }

  for (let id = BLOCK_TYPE_MIN; id <= BLOCK_TYPE_MAX; id += 1) {
    const value = Number(raw[id] ?? raw[String(id)]);
    if (!Number.isFinite(value)) {
      continue;
    }
    next[id] = Math.max(0, Math.min(MAX_BLOCK_STOCK, Math.trunc(value)));
  }

  return next;
}

function serializeBlockStock(raw = null) {
  return sanitizeBlockStock(raw);
}

function ensurePlayerStock(player) {
  if (!player || typeof player !== "object") {
    return createDefaultBlockStock();
  }
  player.stock = sanitizeBlockStock(player.stock);
  return player.stock;
}

function getStockCount(stock, typeId) {
  const normalizedTypeId = normalizeStockTypeId(typeId);
  if (!normalizedTypeId) {
    return 0;
  }
  const value = Number(stock?.[normalizedTypeId] ?? stock?.[String(normalizedTypeId)] ?? 0);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_BLOCK_STOCK, Math.trunc(value)));
}

function changeStockCount(stock, typeId, delta) {
  const normalizedTypeId = normalizeStockTypeId(typeId);
  if (!normalizedTypeId || !stock || typeof stock !== "object") {
    return -1;
  }
  const current = getStockCount(stock, normalizedTypeId);
  const next = Math.max(0, Math.min(MAX_BLOCK_STOCK, current + Math.trunc(Number(delta) || 0)));
  stock[normalizedTypeId] = next;
  return next;
}

function createRoomState(players = new Map()) {
  const initialMapId = getInitialOnlineMapId();
  return {
    players,
    blocks: new Map(),
    mapId: initialMapId,
    mode: DEFAULT_GAME_MODE,
    flags: createDefaultTeamFlags(initialMapId),
    score: { alpha: 0, bravo: 0 },
    captures: { alpha: 0, bravo: 0 },
    round: {
      ended: false,
      winnerTeam: null,
      restartAt: 0,
      startedAt: 0,
      restartTimer: null
    },
    revision: 0,
    updatedAt: Date.now()
  };
}

function getRoomState(room) {
  if (!room.players || !(room.players instanceof Map)) {
    room.players = new Map();
  }

  if (!room.state || typeof room.state !== "object") {
    room.state = createRoomState(room.players);
    return room.state;
  }

  if (!(room.state.players instanceof Map) || room.state.players !== room.players) {
    room.state.players = room.players;
  }

  for (const player of room.state.players.values()) {
    ensurePlayerStock(player);
    player.hp = Number.isFinite(player.hp) ? Math.max(0, Math.trunc(player.hp)) : 100;
    player.respawnAt = Number.isFinite(player.respawnAt) ? Math.max(0, Math.trunc(player.respawnAt)) : 0;
    player.spawnShieldUntil = Number.isFinite(player.spawnShieldUntil)
      ? Math.max(0, Math.trunc(player.spawnShieldUntil))
      : 0;
    player.kills = Number.isFinite(player.kills) ? Math.max(0, Math.trunc(player.kills)) : 0;
    player.deaths = Number.isFinite(player.deaths) ? Math.max(0, Math.trunc(player.deaths)) : 0;
    player.captures = Number.isFinite(player.captures) ? Math.max(0, Math.trunc(player.captures)) : 0;
    player.killStreak = Number.isFinite(player.killStreak)
      ? Math.max(0, Math.trunc(player.killStreak))
      : 0;
    if (typeof player.respawnTimer === "undefined") {
      player.respawnTimer = null;
    }
  }

  if (!(room.state.blocks instanceof Map)) {
    room.state.blocks = new Map();
  }

  room.state.mapId = getRoomMapId(room.state);

  room.state.mode = normalizeGameMode(room.state.mode);
  if (!room.state.flags || typeof room.state.flags !== "object") {
    room.state.flags = createDefaultTeamFlags(room.state.mapId);
  } else {
    room.state.flags = cloneTeamFlagsState(room.state.flags, room.state.mapId);
  }

  if (!room.state.score || typeof room.state.score !== "object") {
    room.state.score = { alpha: 0, bravo: 0 };
  }

  if (!room.state.captures || typeof room.state.captures !== "object") {
    room.state.captures = { alpha: 0, bravo: 0 };
  }

  if (!room.state.round || typeof room.state.round !== "object") {
    room.state.round = {
      ended: false,
      winnerTeam: null,
      restartAt: 0,
      startedAt: 0,
      restartTimer: null
    };
  } else {
    room.state.round.ended = Boolean(room.state.round.ended);
    room.state.round.winnerTeam = normalizeTeam(room.state.round.winnerTeam);
    room.state.round.restartAt = Number.isFinite(room.state.round.restartAt)
      ? Math.max(0, Math.trunc(room.state.round.restartAt))
      : 0;
    room.state.round.startedAt = Number.isFinite(room.state.round.startedAt)
      ? Math.max(0, Math.trunc(room.state.round.startedAt))
      : 0;
    if (typeof room.state.round.restartTimer === "undefined") {
      room.state.round.restartTimer = null;
    }
  }

  room.state.revision = Number.isFinite(room.state.revision) ? room.state.revision : 0;
  room.state.updatedAt = Number.isFinite(room.state.updatedAt)
    ? room.state.updatedAt
    : Date.now();

  return room.state;
}

function touchRoomState(room) {
  const state = getRoomState(room);
  state.revision += 1;
  state.updatedAt = Date.now();
  return state;
}

function clearPlayerRespawnTimer(player) {
  if (!player || typeof player !== "object") {
    return;
  }
  if (player.respawnTimer) {
    clearTimeout(player.respawnTimer);
    player.respawnTimer = null;
  }
}

function clearRoundRestartTimer(state) {
  if (!state?.round) {
    return;
  }
  if (state.round.restartTimer) {
    clearTimeout(state.round.restartTimer);
    state.round.restartTimer = null;
  }
}

function isRoundEnded(state) {
  return Boolean(state?.round?.ended);
}

function getSpawnStateForTeam(team, roomOrMapId = null) {
  const normalized = normalizeTeam(team);
  const mapId =
    typeof roomOrMapId === "string" ? normalizeOnlineMapId(roomOrMapId) : getRoomMapId(roomOrMapId);
  const home = normalized ? getTeamHomeForMap(mapId, normalized) : { x: 0, y: 0, z: 0 };
  const yaw = normalized === "alpha" ? Math.PI * 0.5 : normalized === "bravo" ? -Math.PI * 0.5 : 0;
  const spawnOffsets = [
    [0, 0],
    [2.5, 0],
    [-2.5, 0],
    [0, 2.5],
    [0, -2.5],
    [4.1, 1.9],
    [4.1, -1.9],
    [-4.1, 1.9],
    [-4.1, -1.9],
    [5.6, 0],
    [-5.6, 0],
    [0, 5.6],
    [0, -5.6]
  ];
  const randomOffset = spawnOffsets[Math.floor(Math.random() * spawnOffsets.length)] ?? [0, 0];
  const jitterX = (Math.random() - 0.5) * 0.35;
  const jitterZ = (Math.random() - 0.5) * 0.35;

  return sanitizePlayerState({
    x: home.x + randomOffset[0] + jitterX,
    y: 1.75,
    z: home.z + randomOffset[1] + jitterZ,
    yaw,
    pitch: 0
  });
}

function schedulePlayerRespawn(room, player) {
  if (!room || !player?.id) {
    return Date.now() + PVP_RESPAWN_MS;
  }

  clearPlayerRespawnTimer(player);
  const respawnAt = Date.now() + PVP_RESPAWN_MS;
  player.hp = 0;
  player.respawnAt = respawnAt;

  const playerId = String(player.id);
  player.respawnTimer = setTimeout(() => {
    const state = getRoomState(room);
    const current = state.players.get(playerId);
    if (!current) {
      return;
    }

    clearPlayerRespawnTimer(current);
    current.hp = 100;
    current.respawnAt = 0;
    current.killStreak = 0;
    current.lastShotAt = 0;
    current.spawnShieldUntil = Date.now() + RESPAWN_SHIELD_MS;
    current.state = getSpawnStateForTeam(current.team, room);

    const roomState = touchRoomState(room);
    io.to(room.code).emit("player:respawn", {
      id: current.id,
      hp: current.hp,
      spawnShieldUntil: Number(current.spawnShieldUntil ?? 0),
      state: current.state,
      roomStateRevision: roomState.revision
    });
    emitRoomUpdate(room);
  }, PVP_RESPAWN_MS);

  return respawnAt;
}

function resetRoomRoundState(room, { startedAt = Date.now(), byPlayerId = null, rotateMap = false } = {}) {
  if (!room) {
    return null;
  }

  const state = getRoomState(room);
  clearRoundRestartTimer(state);
  if (rotateMap) {
    state.mapId = getNextOnlineMapId(state.mapId);
  }
  state.mode = DEFAULT_GAME_MODE;
  state.flags = createDefaultTeamFlags(state.mapId);
  state.score.alpha = 0;
  state.score.bravo = 0;
  state.captures.alpha = 0;
  state.captures.bravo = 0;
  state.round.ended = false;
  state.round.winnerTeam = null;
  state.round.restartAt = 0;
  state.round.startedAt = Math.max(0, Math.trunc(Number(startedAt) || Date.now()));
  if (state.blocks instanceof Map && state.blocks.size > 0) {
    state.blocks.clear();
    schedulePersistentWorldSnapshotSave(room);
  }

  for (const player of state.players.values()) {
    player.kills = 0;
    player.deaths = 0;
    player.captures = 0;
    player.killStreak = 0;
    player.lastShotAt = 0;
    clearPlayerRespawnTimer(player);
    player.hp = 100;
    player.respawnAt = 0;
    player.spawnShieldUntil = Date.now() + RESPAWN_SHIELD_MS;
    player.state = getSpawnStateForTeam(player.team, state.mapId);
  }

  ensurePlayerTeamsBalanced(state.players);
  touchRoomState(room);
  emitRoomUpdate(room);
  io.to(room.code).emit("room:started", {
    code: room.code,
    startedAt,
    mapId: state.mapId
  });
  emitCtfUpdate(room, {
    type: "start",
    byPlayerId
  });
  return state;
}

function endRoundAndScheduleRestart(room, { winnerTeam, byPlayerId = null } = {}) {
  if (!room) {
    return false;
  }

  const state = getRoomState(room);
  const normalizedWinner = normalizeTeam(winnerTeam);
  if (!normalizedWinner || isRoundEnded(state)) {
    return false;
  }

  clearRoundRestartTimer(state);
  state.round.ended = true;
  state.round.winnerTeam = normalizedWinner;
  state.round.restartAt = Date.now() + ROUND_RESTART_DELAY_MS;
  touchRoomState(room);

  const matchEndPayload = {
    type: "match_end",
    byPlayerId,
    winnerTeam: normalizedWinner,
    restartAt: state.round.restartAt,
    targetScore: CTF_WIN_SCORE,
    score: {
      alpha: Number(state.score.alpha ?? 0),
      bravo: Number(state.score.bravo ?? 0)
    }
  };

  emitCtfUpdate(room, matchEndPayload);
  io.to(room.code).emit("match:end", matchEndPayload);
  emitRoomUpdate(room);

  state.round.restartTimer = setTimeout(() => {
    const liveState = getRoomState(room);
    liveState.round.restartTimer = null;
    resetRoomRoundState(room, {
      startedAt: Date.now(),
      byPlayerId: "auto_restart",
      rotateMap: true
    });
  }, ROUND_RESTART_DELAY_MS);

  return true;
}

function serializeRoomState(room) {
  const state = getRoomState(room);
  const teamFlags = cloneTeamFlagsState(state.flags, state.mapId);
  return {
    mapId: getRoomMapId(state),
    mode: normalizeGameMode(state.mode),
    revision: state.revision,
    updatedAt: state.updatedAt,
    targetScore: CTF_WIN_SCORE,
    blockCount: state.blocks.size,
    // Legacy compatibility for older clients/scripts expecting single `flag`.
    flag: cloneFlagState(teamFlags.bravo, getTeamFlagHomeForRoom(state, "bravo")),
    flags: teamFlags,
    score: {
      alpha: Number(state.score.alpha ?? 0),
      bravo: Number(state.score.bravo ?? 0)
    },
    captures: {
      alpha: Number(state.captures.alpha ?? 0),
      bravo: Number(state.captures.bravo ?? 0)
    },
    round: {
      ended: Boolean(state.round?.ended),
      winnerTeam: normalizeTeam(state.round?.winnerTeam),
      restartAt: Number(state.round?.restartAt ?? 0),
      startedAt: Number(state.round?.startedAt ?? 0)
    }
  };
}

function resetFlagForPlayer(room, playerId) {
  const id = String(playerId ?? "").trim();
  if (!id) {
    return null;
  }

  const state = getRoomState(room);
  const flags = state.flags;
  if (!flags || typeof flags !== "object") {
    return null;
  }

  for (const team of ["alpha", "bravo"]) {
    const flag = flags[team];
    if (!flag || flag.carrierId !== id) {
      continue;
    }
    flags[team] = createDefaultFlag(flag.home ?? getTeamFlagHomeForRoom(room, team));
    touchRoomState(room);
    return team;
  }

  return null;
}

function blockStateKey(x, y, z) {
  return `${x}${BLOCK_KEY_SEPARATOR}${y}${BLOCK_KEY_SEPARATOR}${z}`;
}

function applyBlockUpdateToRoomState(room, update) {
  const state = getRoomState(room);
  const key = blockStateKey(update.x, update.y, update.z);

  if (update.action === "place") {
    state.blocks.set(key, {
      action: "place",
      x: update.x,
      y: update.y,
      z: update.z,
      typeId: update.typeId
    });
  } else {
    state.blocks.set(key, {
      action: "remove",
      x: update.x,
      y: update.y,
      z: update.z
    });
  }

  const nextState = touchRoomState(room);
  schedulePersistentWorldSnapshotSave(room);
  return nextState;
}

function resolveRemovedBlockType(state, update) {
  const key = blockStateKey(update.x, update.y, update.z);
  const previous = state.blocks.get(key);
  if (previous?.action === "remove") {
    return { ok: false, reason: "already_removed", typeId: null };
  }

  if (previous?.action === "place") {
    return {
      ok: true,
      reason: "remove_placed",
      typeId: normalizeStockTypeId(previous.typeId) ?? BLOCK_TYPE_MIN
    };
  }

  return {
    ok: true,
    reason: "remove_base",
    typeId: normalizeStockTypeId(update.typeId) ?? BLOCK_TYPE_MIN
  };
}

function handleCtfPlayerSync(room, player) {
  if (!room || !player?.state) {
    return null;
  }

  const state = getRoomState(room);
  if (normalizeGameMode(state.mode) !== GAME_MODE.CTF) {
    return null;
  }
  if (isRoundEnded(state)) {
    return null;
  }

  const team = normalizeTeam(player.team);
  if (!team) {
    return null;
  }
  const enemyTeam = getEnemyTeam(team);
  if (!enemyTeam) {
    return null;
  }

  const teamHome = getTeamHomeForRoom(room, team);
  const teamFlags = state.flags;
  if (!teamFlags || typeof teamFlags !== "object") {
    return null;
  }
  const enemyFlag = teamFlags[enemyTeam];
  if (!enemyFlag) {
    return null;
  }

  const playerPos = player.state;
  let changed = false;
  let event = null;

  if (enemyFlag.carrierId === player.id) {
    const enemyFlagHome = getTeamFlagHomeForRoom(room, enemyTeam);
    enemyFlag.at = {
      x: Number(playerPos.x ?? enemyFlag.at?.x ?? enemyFlag.home?.x ?? enemyFlagHome.x),
      y: Number(enemyFlag.home?.y ?? enemyFlagHome.y),
      z: Number(playerPos.z ?? enemyFlag.at?.z ?? enemyFlag.home?.z ?? enemyFlagHome.z)
    };
    changed = true;
  }

  if (enemyFlag.carrierId === player.id) {
    const nearHome = distanceXZ(playerPos, teamHome) <= CTF_CAPTURE_RADIUS;
    if (nearHome) {
      state.flags[enemyTeam] = createDefaultFlag(enemyFlag.home ?? getTeamFlagHomeForRoom(room, enemyTeam));
      state.captures[team] = (Number(state.captures[team]) || 0) + 1;
      state.score[team] = (Number(state.score[team]) || 0) + 1;
      player.captures = (Number(player.captures) || 0) + 1;
      changed = true;
      event = {
        type: "capture",
        byPlayerId: player.id,
        byTeam: team,
        flagTeam: enemyTeam,
        captures: Number(state.captures[team]),
        teamScore: Number(state.score[team])
      };
    }
  }

  if (!changed) {
    return null;
  }

  touchRoomState(room);
  return event;
}

function normalizeTeam(team) {
  return team === "alpha" || team === "bravo" ? team : null;
}

function normalizeLobbyPortalId(rawPortalId) {
  const value = String(rawPortalId ?? "")
    .trim()
    .toLowerCase();
  if (value === "training" || value === "train" || value === "single" || value === "practice") {
    return "training";
  }
  if (value === "online" || value === "deploy" || value === "start") {
    return "online";
  }
  if (value === "entry" || value === "arrival" || value === "incoming") {
    return "entry";
  }
  if (value === "exit" || value === "leave" || value === "out") {
    return "exit";
  }
  return null;
}

function openExitPortalTarget() {
  if (process.platform !== "win32" || !existsSync(EXIT_PORTAL_TARGET_PATH)) {
    return false;
  }
  try {
    const child = spawn("explorer.exe", [EXIT_PORTAL_TARGET_PATH], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function getEnemyTeam(team) {
  if (team === "alpha") {
    return "bravo";
  }
  if (team === "bravo") {
    return "alpha";
  }
  return null;
}

function findCarriedFlagTeam(flags, playerId) {
  const id = String(playerId ?? "").trim();
  if (!id || !flags || typeof flags !== "object") {
    return null;
  }
  for (const team of ["alpha", "bravo"]) {
    const carrierId = String(flags[team]?.carrierId ?? "").trim();
    if (carrierId && carrierId === id) {
      return team;
    }
  }
  return null;
}

function countPlayersOnTeam(players, team) {
  let count = 0;
  for (const player of players.values()) {
    if (normalizeTeam(player?.team) === team) {
      count += 1;
    }
  }
  return count;
}

function pickBalancedTeam(players) {
  const alphaCount = countPlayersOnTeam(players, "alpha");
  const bravoCount = countPlayersOnTeam(players, "bravo");
  if (alphaCount < bravoCount) {
    return "alpha";
  }
  if (bravoCount < alphaCount) {
    return "bravo";
  }
  return Math.random() < 0.5 ? "alpha" : "bravo";
}

function ensurePlayerTeamsBalanced(players) {
  let changed = false;
  for (const player of players.values()) {
    if (!player || normalizeTeam(player.team)) {
      continue;
    }
    player.team = pickBalancedTeam(players);
    changed = true;
  }
  return changed;
}

function distanceXZ(a = null, b = null) {
  if (!a || !b) {
    return Infinity;
  }
  const dx = Number(a.x ?? 0) - Number(b.x ?? 0);
  const dz = Number(a.z ?? 0) - Number(b.z ?? 0);
  return Math.hypot(dx, dz);
}

function isInsideProtectedRadius(x, z, radiusSq) {
  const cx = Number(x);
  const cz = Number(z);
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) {
    return false;
  }

  for (const center of SPAWN_PROTECT_CENTERS) {
    const dx = cx - center.x;
    const dz = cz - center.z;
    if (dx * dx + dz * dz <= radiusSq) {
      return true;
    }
  }
  return false;
}

function isSpawnProtectedBlockCoord(x, y, z) {
  const cx = Number(x);
  const cy = Number(y);
  const cz = Number(z);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) {
    return false;
  }
  if (cy < SPAWN_PROTECT_MIN_Y || cy > SPAWN_PROTECT_MAX_Y) {
    return false;
  }
  return isInsideProtectedRadius(cx, cz, SPAWN_PROTECT_RADIUS_SQ);
}

function isBaseFloorProtectedBlockCoord(x, y, z) {
  const cx = Number(x);
  const cy = Number(y);
  const cz = Number(z);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) {
    return false;
  }
  if (cy > BASE_FLOOR_PROTECT_MAX_Y) {
    return false;
  }
  return isInsideProtectedRadius(cx, cz, BASE_FLOOR_PROTECT_RADIUS_SQ);
}

function getProtectedBlockReason(action, x, y, z) {
  if (isLobbyProtectedBlockCoord(x, y, z)) {
    return "lobby";
  }
  return null;
}

function pruneSpawnProtectedBlockChanges(room) {
  if (!room) {
    return false;
  }
  const state = getRoomState(room);
  if (!(state.blocks instanceof Map) || state.blocks.size === 0) {
    return false;
  }

  let changed = false;
  for (const [key, entry] of state.blocks.entries()) {
    if (!entry) {
      continue;
    }
    if (getProtectedBlockReason(entry.action, entry.x, entry.y, entry.z)) {
      state.blocks.delete(key);
      changed = true;
    }
  }

  if (changed) {
    touchRoomState(room);
    schedulePersistentWorldSnapshotSave(room);
  }
  return changed;
}

function serializeBlocksSnapshot(room) {
  const state = getRoomState(room);
  return Array.from(state.blocks.values()).map((entry) => {
    const base = {
      action: entry.action === "place" ? "place" : "remove",
      x: Number(entry.x ?? 0),
      y: Number(entry.y ?? 0),
      z: Number(entry.z ?? 0)
    };
    if (base.action === "place") {
      base.typeId = Number(entry.typeId ?? 1);
    }
    return base;
  });
}

function serializeCtfState(room, event = null) {
  const state = serializeRoomState(room);
  return {
    mode: state.mode,
    revision: state.revision,
    updatedAt: state.updatedAt,
    targetScore: state.targetScore,
    flag: state.flag,
    flags: state.flags,
    score: state.score,
    captures: state.captures,
    round: state.round,
    event
  };
}

function emitRoomSnapshot(socket, room, reason = "sync") {
  if (!socket || !room) {
    return;
  }

  const state = serializeRoomState(room);
  const roomState = getRoomState(room);
  const player = roomState.players.get(socket.id);
  socket.emit("room:snapshot", {
    reason,
    mapId: state.mapId,
    mode: state.mode,
    revision: state.revision,
    updatedAt: state.updatedAt,
    targetScore: state.targetScore,
    blocks: serializeBlocksSnapshot(room),
    flag: state.flag,
    flags: state.flags,
    score: state.score,
    captures: state.captures,
    round: state.round,
    dailyLeaderboard: serializeDailyLeaderboard(12),
    stock: serializeBlockStock(player?.stock),
    weaponId: sanitizeWeaponId(player?.weaponId)
  });
}

function emitCtfUpdate(room, event = null) {
  if (!room) {
    return;
  }
  io.to(room.code).emit("ctf:update", serializeCtfState(room, event));
}

function emitLobbyPortalEntered(
  room,
  { player = null, portalId = "", action = "", team = null, enteredAt = Date.now() } = {}
) {
  if (!room) {
    return;
  }

  const normalizedPortalId = normalizeLobbyPortalId(portalId);
  if (!normalizedPortalId) {
    return;
  }

  io.to(room.code).emit("portal:entered", {
    roomCode: room.code,
    portalId: normalizedPortalId,
    action: String(action || normalizedPortalId),
    playerId: String(player?.id ?? ""),
    playerName: String(player?.name ?? ""),
    team: normalizeTeam(team ?? player?.team),
    enteredAt: Math.max(0, Math.trunc(Number(enteredAt) || Date.now()))
  });
}

function createPersistentRoom() {
  const players = new Map();
  const room = {
    code: DEFAULT_ROOM_CODE,
    hostId: null,
    players,
    state: createRoomState(players),
    persistent: true,
    createdAt: Date.now()
  };
  applyPersistentWorldSnapshot(room);
  pruneSpawnProtectedBlockChanges(room);
  return room;
}

function getDefaultRoom() {
  let room = rooms.get(DEFAULT_ROOM_CODE);
  if (!room) {
    room = createPersistentRoom();
    rooms.set(DEFAULT_ROOM_CODE, room);
  }
  getRoomState(room);
  return room;
}

getDefaultRoom();
dailyLeaderboardState = loadDailyLeaderboardState();

function sanitizeName(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 16);
  return value || "PLAYER";
}

function getDailyLeaderboardDateKey(now = Date.now()) {
  const shifted = new Date(Number(now) + DAILY_LEADERBOARD_TIMEZONE_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextDailyLeaderboardResetAt(now = Date.now()) {
  const shifted = new Date(Number(now) + DAILY_LEADERBOARD_TIMEZONE_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  return Date.UTC(year, month, day + 1, 0, 0, 0, 0) - DAILY_LEADERBOARD_TIMEZONE_OFFSET_MS;
}

function createDailyLeaderboardState(now = Date.now()) {
  const safeNow = Math.max(0, Math.trunc(Number(now) || Date.now()));
  return {
    dateKey: getDailyLeaderboardDateKey(safeNow),
    resetAt: getNextDailyLeaderboardResetAt(safeNow),
    updatedAt: safeNow,
    entries: new Map()
  };
}

function getDailyLeaderboardEntryKey(name, fallbackId = "") {
  const safeName = sanitizeName(name);
  if (safeName) {
    return `name:${safeName.toLowerCase()}`;
  }
  const safeId = String(fallbackId ?? "").trim();
  return `id:${safeId || "anon"}`;
}

function cloneDailyLeaderboardEntry(raw = {}, fallbackName = "PLAYER") {
  const name = sanitizeName(raw.name ?? fallbackName);
  return {
    key: String(raw.key ?? getDailyLeaderboardEntryKey(name)),
    name,
    kills: Math.max(0, Math.trunc(Number(raw.kills ?? 0))),
    deaths: Math.max(0, Math.trunc(Number(raw.deaths ?? 0))),
    captures: Math.max(0, Math.trunc(Number(raw.captures ?? 0))),
    updatedAt: Math.max(0, Math.trunc(Number(raw.updatedAt ?? Date.now())))
  };
}

function loadDailyLeaderboardState() {
  const now = Date.now();
  const emptyState = createDailyLeaderboardState(now);

  try {
    if (!existsSync(DAILY_LEADERBOARD_PATH)) {
      return emptyState;
    }

    const raw = readFileSync(DAILY_LEADERBOARD_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return emptyState;
    }

    const dateKey = String(parsed.dateKey ?? "");
    const todayKey = getDailyLeaderboardDateKey(now);
    if (!dateKey || dateKey !== todayKey) {
      return emptyState;
    }

    const loaded = createDailyLeaderboardState(now);
    loaded.dateKey = dateKey;
    loaded.resetAt = Math.max(
      getNextDailyLeaderboardResetAt(now),
      Math.trunc(Number(parsed.resetAt ?? getNextDailyLeaderboardResetAt(now)))
    );
    loaded.updatedAt = Math.max(0, Math.trunc(Number(parsed.updatedAt ?? now)));

    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    for (const entry of entries) {
      const safeEntry = cloneDailyLeaderboardEntry(entry);
      loaded.entries.set(safeEntry.key, safeEntry);
      if (loaded.entries.size >= DAILY_LEADERBOARD_MAX_ENTRIES) {
        break;
      }
    }

    return loaded;
  } catch (error) {
    console.warn("[daily-rank] failed to load snapshot:", error?.message ?? error);
    return emptyState;
  }
}

function saveDailyLeaderboardState() {
  const state = dailyLeaderboardState ?? createDailyLeaderboardState(Date.now());
  try {
    const payload = {
      version: DAILY_LEADERBOARD_VERSION,
      dateKey: String(state.dateKey ?? getDailyLeaderboardDateKey(Date.now())),
      resetAt: Math.max(0, Math.trunc(Number(state.resetAt ?? 0))),
      updatedAt: Math.max(0, Math.trunc(Number(state.updatedAt ?? Date.now()))),
      entries: Array.from(state.entries.values()).slice(0, DAILY_LEADERBOARD_MAX_ENTRIES).map((entry) => ({
        key: String(entry.key ?? ""),
        name: sanitizeName(entry.name),
        kills: Math.max(0, Math.trunc(Number(entry.kills ?? 0))),
        deaths: Math.max(0, Math.trunc(Number(entry.deaths ?? 0))),
        captures: Math.max(0, Math.trunc(Number(entry.captures ?? 0))),
        updatedAt: Math.max(0, Math.trunc(Number(entry.updatedAt ?? Date.now())))
      }))
    };

    mkdirSync(dirname(DAILY_LEADERBOARD_PATH), { recursive: true });
    writeFileSync(DAILY_LEADERBOARD_PATH, JSON.stringify(payload), "utf8");
  } catch (error) {
    console.warn("[daily-rank] failed to save snapshot:", error?.message ?? error);
  }
}

function scheduleDailyLeaderboardSave({ immediate = false } = {}) {
  if (dailyLeaderboardSaveTimer) {
    clearTimeout(dailyLeaderboardSaveTimer);
    dailyLeaderboardSaveTimer = null;
  }

  if (immediate) {
    saveDailyLeaderboardState();
    return;
  }

  dailyLeaderboardSaveTimer = setTimeout(() => {
    dailyLeaderboardSaveTimer = null;
    saveDailyLeaderboardState();
  }, 600);
}

function flushDailyLeaderboardSnapshot() {
  if (dailyLeaderboardSaveTimer) {
    clearTimeout(dailyLeaderboardSaveTimer);
    dailyLeaderboardSaveTimer = null;
  }
  saveDailyLeaderboardState();
}

function ensureDailyLeaderboardFresh({ now = Date.now() } = {}) {
  if (!dailyLeaderboardState) {
    dailyLeaderboardState = loadDailyLeaderboardState();
  }

  const currentKey = getDailyLeaderboardDateKey(now);
  if (dailyLeaderboardState.dateKey === currentKey) {
    return false;
  }

  dailyLeaderboardState = createDailyLeaderboardState(now);
  scheduleDailyLeaderboardSave({ immediate: true });
  return true;
}

function sortDailyLeaderboardEntries(entries = []) {
  return entries.sort((a, b) => {
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
  });
}

function serializeDailyLeaderboard(limit = 10) {
  ensureDailyLeaderboardFresh();

  const maxCount = Math.max(1, Math.trunc(Number(limit) || 10));
  const ranked = sortDailyLeaderboardEntries(Array.from(dailyLeaderboardState.entries.values()))
    .slice(0, maxCount)
    .map((entry, index) => ({
      rank: index + 1,
      key: String(entry.key ?? ""),
      name: sanitizeName(entry.name),
      captures: Math.max(0, Math.trunc(Number(entry.captures ?? 0))),
      kills: Math.max(0, Math.trunc(Number(entry.kills ?? 0))),
      deaths: Math.max(0, Math.trunc(Number(entry.deaths ?? 0)))
    }));

  return {
    dateKey: String(dailyLeaderboardState.dateKey ?? getDailyLeaderboardDateKey(Date.now())),
    resetAt: Math.max(0, Math.trunc(Number(dailyLeaderboardState.resetAt ?? 0))),
    updatedAt: Math.max(0, Math.trunc(Number(dailyLeaderboardState.updatedAt ?? Date.now()))),
    players: ranked
  };
}

function emitDailyLeaderboard(target = io) {
  if (!target) {
    return;
  }
  target.emit("leaderboard:daily", serializeDailyLeaderboard(12));
}

function emitDailyLeaderboardToRoom(room) {
  if (!room) {
    return;
  }
  io.to(room.code).emit("leaderboard:daily", serializeDailyLeaderboard(12));
}

function touchDailyLeaderboardPlayer(player, { killsDelta = 0, deathsDelta = 0, capturesDelta = 0 } = {}) {
  if (!player) {
    return false;
  }

  ensureDailyLeaderboardFresh();

  const key = getDailyLeaderboardEntryKey(player.name, player.id);
  const name = sanitizeName(player.name);
  const current = dailyLeaderboardState.entries.get(key) ?? cloneDailyLeaderboardEntry({ key, name });

  const nextKills = Math.max(0, current.kills + Math.trunc(Number(killsDelta) || 0));
  const nextDeaths = Math.max(0, current.deaths + Math.trunc(Number(deathsDelta) || 0));
  const nextCaptures = Math.max(0, current.captures + Math.trunc(Number(capturesDelta) || 0));

  const changed =
    current.name !== name ||
    current.kills !== nextKills ||
    current.deaths !== nextDeaths ||
    current.captures !== nextCaptures ||
    !dailyLeaderboardState.entries.has(key);

  if (!changed) {
    return false;
  }

  dailyLeaderboardState.entries.set(key, {
    ...current,
    key,
    name,
    kills: nextKills,
    deaths: nextDeaths,
    captures: nextCaptures,
    updatedAt: Date.now()
  });
  if (dailyLeaderboardState.entries.size > DAILY_LEADERBOARD_MAX_ENTRIES) {
    const ranked = sortDailyLeaderboardEntries(Array.from(dailyLeaderboardState.entries.values()));
    const trimmed = ranked.slice(0, DAILY_LEADERBOARD_MAX_ENTRIES);
    dailyLeaderboardState.entries = new Map(trimmed.map((entry) => [entry.key, entry]));
  }
  dailyLeaderboardState.updatedAt = Date.now();
  scheduleDailyLeaderboardSave();
  return true;
}

function renameDailyLeaderboardEntry(previousName, nextName, fallbackId = "") {
  ensureDailyLeaderboardFresh();

  const prevKey = getDailyLeaderboardEntryKey(previousName, fallbackId);
  const nextKey = getDailyLeaderboardEntryKey(nextName, fallbackId);
  const safeNextName = sanitizeName(nextName);
  const prevEntry = dailyLeaderboardState.entries.get(prevKey);
  const nextEntry = dailyLeaderboardState.entries.get(nextKey);

  if (!prevEntry && !nextEntry) {
    return false;
  }

  if (prevKey === nextKey) {
    if (!prevEntry) {
      return false;
    }
    if (prevEntry.name === safeNextName) {
      return false;
    }
    prevEntry.name = safeNextName;
    prevEntry.updatedAt = Date.now();
    dailyLeaderboardState.entries.set(nextKey, prevEntry);
    dailyLeaderboardState.updatedAt = Date.now();
    scheduleDailyLeaderboardSave();
    return true;
  }

  const merged = cloneDailyLeaderboardEntry({
    key: nextKey,
    name: safeNextName,
    kills: Math.max(0, Math.trunc(Number(prevEntry?.kills ?? 0))) + Math.max(0, Math.trunc(Number(nextEntry?.kills ?? 0))),
    deaths:
      Math.max(0, Math.trunc(Number(prevEntry?.deaths ?? 0))) +
      Math.max(0, Math.trunc(Number(nextEntry?.deaths ?? 0))),
    captures:
      Math.max(0, Math.trunc(Number(prevEntry?.captures ?? 0))) +
      Math.max(0, Math.trunc(Number(nextEntry?.captures ?? 0))),
    updatedAt: Date.now()
  });

  dailyLeaderboardState.entries.delete(prevKey);
  dailyLeaderboardState.entries.set(nextKey, merged);
  dailyLeaderboardState.updatedAt = Date.now();
  scheduleDailyLeaderboardSave();
  return true;
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

function sanitizePlayerState(raw = {}) {
  return {
    x: clampNumber(raw.x, -256, 256, 0),
    y: clampNumber(raw.y, -64, 128, 1.75),
    z: clampNumber(raw.z, -256, 256, 0),
    yaw: clampNumber(raw.yaw, -Math.PI, Math.PI, 0),
    pitch: clampNumber(raw.pitch, -1.55, 1.55, 0),
    crouched: Boolean(raw.crouched),
    updatedAt: Date.now()
  };
}

function sanitizeBlockPayload(raw = {}) {
  const action = raw.action === "place" ? "place" : raw.action === "remove" ? "remove" : null;
  if (!action) {
    return null;
  }

  const x = clampNumber(raw.x, -256, 256, Number.NaN);
  const y = clampNumber(raw.y, -64, 192, Number.NaN);
  const z = clampNumber(raw.z, -256, 256, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  const payload = {
    action,
    x: Math.trunc(x),
    y: Math.trunc(y),
    z: Math.trunc(z)
  };

  if (action === "place") {
    const typeId = normalizeStockTypeId(raw.typeId);
    if (!typeId) {
      return null;
    }
    payload.typeId = typeId;
  } else if (raw.typeId !== undefined) {
    const typeId = normalizeStockTypeId(raw.typeId);
    if (typeId) {
      payload.typeId = typeId;
    }
  }

  return payload;
}

function sanitizeShootPayload(raw = {}) {
  const targetId = String(raw.targetId ?? "").trim();
  if (!targetId) {
    return null;
  }
  const parsedDamage = Math.trunc(Number(raw.damage));
  const damage = Number.isFinite(parsedDamage) && parsedDamage > 0 ? parsedDamage : null;
  return { targetId, damage };
}

function sanitizeHazardPayload(raw = {}) {
  const reasonRaw = String(raw.reason ?? "")
    .trim()
    .toLowerCase();
  const reason = reasonRaw === "void" ? "void" : reasonRaw === "fall" ? "fall" : "hazard";
  const parsedDamage = Math.trunc(Number(raw.damage));
  if (!Number.isFinite(parsedDamage)) {
    return null;
  }

  let damage = Math.max(HAZARD_DAMAGE_MIN, Math.min(HAZARD_DAMAGE_MAX, parsedDamage));
  if (reason === "void") {
    damage = Math.max(VOID_HAZARD_MIN_DAMAGE, damage);
  }

  return { reason, damage };
}

function serializeRoom(room) {
  pruneRoomPlayers(room);
  const state = getRoomState(room);
  return {
    code: room.code,
    mode: normalizeGameMode(state.mode),
    hostId: room.hostId,
    players: Array.from(state.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      weaponId: sanitizeWeaponId(player.weaponId),
      team: player.team ?? null,
      state: player.state ?? null,
      hp: Number(player.hp ?? 100),
      respawnAt: Number(player.respawnAt ?? 0),
      spawnShieldUntil: Number(player.spawnShieldUntil ?? 0),
      kills: Number(player.kills ?? 0),
      deaths: Number(player.deaths ?? 0),
      captures: Number(player.captures ?? 0),
      killStreak: Number(player.killStreak ?? 0),
      stock: serializeBlockStock(player.stock)
    })),
    state: serializeRoomState(room),
    dailyLeaderboard: serializeDailyLeaderboard(12)
  };
}

function summarizeRooms() {
  const room = getDefaultRoom();
  const state = getRoomState(room);
  pruneRoomPlayers(room);
  return [
    {
      code: room.code,
      count: state.players.size,
      capacity: MAX_ROOM_PLAYERS,
      hostName: state.players.get(room.hostId)?.name ?? "AUTO"
    }
  ];
}

function emitRoomList(target = io) {
  target.emit("room:list", summarizeRooms());
}

function emitRoomUpdate(room) {
  io.to(room.code).emit("room:update", serializeRoom(room));
}

function updateHost(room) {
  const state = getRoomState(room);
  if (room.hostId && state.players.has(room.hostId)) {
    return;
  }
  room.hostId = state.players.keys().next().value ?? null;
}

function pruneRoomPlayers(room) {
  if (!room || !io?.sockets?.sockets) {
    return false;
  }

  const state = getRoomState(room);
  let changed = false;
  const removedIds = [];
  let ctfChangedTeam = null;

  for (const socketId of state.players.keys()) {
    if (!io.sockets.sockets.has(socketId)) {
      const removedPlayer = state.players.get(socketId);
      clearPlayerRespawnTimer(removedPlayer);
      state.players.delete(socketId);
      removedIds.push(socketId);
      changed = true;
    }
  }

  if (changed) {
    for (const socketId of removedIds) {
      const resetTeam = resetFlagForPlayer(room, socketId);
      if (resetTeam) {
        ctfChangedTeam = resetTeam;
      }
    }
    touchRoomState(room);
    updateHost(room);
    if (state.players.size === 0) {
      clearRoundRestartTimer(state);
      state.round.ended = false;
      state.round.winnerTeam = null;
      state.round.restartAt = 0;
      state.round.startedAt = 0;
    }
    if (ctfChangedTeam) {
      emitCtfUpdate(room, {
        type: "reset",
        reason: "disconnect",
        flagTeam: ctfChangedTeam
      });
    }
  }
  return changed;
}

function ack(ackFn, payload) {
  if (typeof ackFn === "function") {
    ackFn(payload);
  }
}

function leaveCurrentRoom(socket) {
  const roomCode = socket.data.roomCode;
  if (!roomCode) {
    return;
  }

  const room = rooms.get(roomCode);
  socket.leave(roomCode);
  socket.data.roomCode = null;

  if (!room) {
    emitRoomList();
    return;
  }

  const state = getRoomState(room);
  const leavingPlayer = state.players.get(socket.id);
  clearPlayerRespawnTimer(leavingPlayer);
  state.players.delete(socket.id);
  room.players = state.players;
  const resetTeam = resetFlagForPlayer(room, socket.id);
  pruneRoomPlayers(room);
  updateHost(room);
  if (state.players.size === 0) {
    clearRoundRestartTimer(state);
    state.round.ended = false;
    state.round.winnerTeam = null;
    state.round.restartAt = 0;
    state.round.startedAt = 0;
  }
  touchRoomState(room);
  if (resetTeam) {
    emitCtfUpdate(room, {
      type: "reset",
      reason: "leave",
      byPlayerId: socket.id,
      flagTeam: resetTeam
    });
  }

  if (!room.persistent && room.players.size === 0) {
    rooms.delete(room.code);
  }

  emitRoomUpdate(room);
  emitRoomList();
}

function joinDefaultRoom(socket, nameOverride = null) {
  const room = getDefaultRoom();
  const state = getRoomState(room);
  ensureDailyLeaderboardFresh();
  pruneRoomPlayers(room);
  const name = sanitizeName(nameOverride ?? socket.data.playerName);
  const weaponId = sanitizeWeaponId(socket.data.playerWeaponId ?? DEFAULT_WEAPON_ID);
  socket.data.playerName = name;
  socket.data.playerWeaponId = weaponId;

  if (socket.data.roomCode === room.code && state.players.has(socket.id)) {
    const existing = state.players.get(socket.id);
    if (existing && existing.name !== name) {
      const previousName = existing.name;
      existing.name = name;
      const renamed = renameDailyLeaderboardEntry(previousName, name, existing.id);
      if (!renamed) {
        touchDailyLeaderboardPlayer(existing);
      }
      touchRoomState(room);
      emitRoomUpdate(room);
      emitRoomList();
      emitDailyLeaderboardToRoom(room);
    }
    if (existing && sanitizeWeaponId(existing.weaponId) !== weaponId) {
      existing.weaponId = weaponId;
      touchRoomState(room);
      emitRoomUpdate(room);
    }
    emitRoomSnapshot(socket, room, "resync");
    emitDailyLeaderboard(socket);
    return { ok: true, room: serializeRoom(room) };
  }

  leaveCurrentRoom(socket);

  if (state.players.size >= MAX_ROOM_PLAYERS) {
    return {
      ok: false,
      error: `GLOBAL 방이 가득 찼습니다 (${MAX_ROOM_PLAYERS}명)`
    };
  }

  const assignedTeam = pickBalancedTeam(state.players);
  state.players.set(socket.id, {
    id: socket.id,
    name,
    weaponId,
    team: assignedTeam,
    state: getSpawnStateForTeam(assignedTeam, room),
    stock: createDefaultBlockStock(),
    hp: 100,
    respawnAt: 0,
    spawnShieldUntil: Date.now() + RESPAWN_SHIELD_MS,
    lastShotAt: 0,
    respawnTimer: null,
    kills: 0,
    deaths: 0,
    captures: 0,
    killStreak: 0
  });
  touchDailyLeaderboardPlayer(state.players.get(socket.id));
  room.players = state.players;
  touchRoomState(room);

  updateHost(room);
  socket.join(room.code);
  socket.data.roomCode = room.code;
  emitRoomSnapshot(socket, room, "join");
  if (Number(state.round?.startedAt) > 0 && !Boolean(state.round?.ended)) {
    socket.emit("room:started", {
      code: room.code,
      startedAt: Number(state.round.startedAt),
      mapId: state.mapId
    });
  }

  emitRoomUpdate(room);
  emitRoomList();
  emitDailyLeaderboardToRoom(room);

  return { ok: true, room: serializeRoom(room) };
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    const globalRoom = getDefaultRoom();
    writeJson(res, 200, {
      ok: true,
      service: "reclaim-fps-chat",
      worldMapId: getRoomMapId(globalRoom),
      gitCommit:
        process.env.RENDER_GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? null,
      rooms: rooms.size,
      online: playerCount,
      globalPlayers: globalRoom.players.size,
      globalCapacity: MAX_ROOM_PLAYERS,
      globalState: serializeRoomState(globalRoom),
      now: Date.now()
    });
    return;
  }

  if (req.url === "/status") {
    writeJson(res, 200, {
      ok: true,
      message: "RECLAIM FPS socket server is running",
      room: DEFAULT_ROOM_CODE,
      capacity: MAX_ROOM_PLAYERS,
      health: "/health"
    });
    return;
  }

  if (tryServeStatic(req, res)) {
    return;
  }

  if (req.url === "/") {
    writeJson(res, 200, {
      ok: true,
      message: "RECLAIM FPS socket server is running (static build not found)",
      room: DEFAULT_ROOM_CODE,
      capacity: MAX_ROOM_PLAYERS,
      health: "/health"
    });
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

const corsOrigin = parseCorsOrigins(process.env.CORS_ORIGIN);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  pingInterval: 5000,
  pingTimeout: 5000
});

dailyLeaderboardResetInterval = setInterval(() => {
  const didReset = ensureDailyLeaderboardFresh();
  if (!didReset) {
    return;
  }
  const room = getDefaultRoom();
  emitRoomUpdate(room);
  emitDailyLeaderboardToRoom(room);
}, DAILY_LEADERBOARD_RESET_CHECK_MS);
if (typeof dailyLeaderboardResetInterval.unref === "function") {
  dailyLeaderboardResetInterval.unref();
}

io.on("connection", (socket) => {
  playerCount += 1;
  socket.data.playerName = `PLAYER_${Math.floor(Math.random() * 9000 + 1000)}`;
  socket.data.playerWeaponId = DEFAULT_WEAPON_ID;
  socket.data.roomCode = null;

  console.log(`[+] player connected (${playerCount}) ${socket.id}`);

  const joined = joinDefaultRoom(socket);
  if (joined.ok) {
    ack(null, joined);
  }
  emitRoomList(socket);
  emitDailyLeaderboard(socket);

  socket.on("chat:send", ({ name, text }) => {
    const safeName = sanitizeName(name ?? socket.data.playerName);
    const safeText = String(text ?? "").trim().slice(0, 200);
    if (!safeText) {
      return;
    }

    socket.data.playerName = safeName;
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    const state = room ? getRoomState(room) : null;
    const player = state?.players instanceof Map ? state.players.get(socket.id) : null;
    const team = normalizeTeam(player?.team);
    const payload = {
      id: socket.id,
      name: safeName,
      text: safeText,
      team
    };
    if (room) {
      io.to(room.code).emit("chat:message", payload);
    } else {
      socket.emit("chat:message", payload);
    }
  });

  socket.on("player:set-name", (payload = {}, ackFn) => {
    const safeName = sanitizeName(payload.name ?? socket.data.playerName);
    socket.data.playerName = safeName;
    ensureDailyLeaderboardFresh();

    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: true, name: safeName });
      return;
    }

    const state = getRoomState(room);
    const player = state.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    if (player.name !== safeName) {
      const previousName = player.name;
      player.name = safeName;
      const renamed = renameDailyLeaderboardEntry(previousName, safeName, player.id);
      if (!renamed) {
        touchDailyLeaderboardPlayer(player);
      }
      touchRoomState(room);
      emitRoomUpdate(room);
      emitRoomList();
      emitDailyLeaderboardToRoom(room);
    }

    ack(ackFn, { ok: true, name: safeName, room: serializeRoom(room) });
  });

  socket.on("player:set-weapon", (payload = {}, ackFn) => {
    const weaponId = sanitizeWeaponId(payload.weaponId ?? socket.data.playerWeaponId);
    socket.data.playerWeaponId = weaponId;

    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: true, weaponId });
      return;
    }

    const state = getRoomState(room);
    const player = state.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    if (sanitizeWeaponId(player.weaponId) !== weaponId) {
      player.weaponId = weaponId;
      touchRoomState(room);
      emitRoomUpdate(room);
    }

    ack(ackFn, { ok: true, weaponId, room: serializeRoom(room) });
  });

  socket.on("player:sync", (payload = {}) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      return;
    }

    const state = getRoomState(room);
    const player = state.players.get(socket.id);
    if (!player) {
      return;
    }
    if ((Number.isFinite(player.hp) ? player.hp : 100) <= 0) {
      return;
    }

    const nextState = sanitizePlayerState(payload);
    player.state = nextState;

    socket.to(room.code).emit("player:sync", {
      id: player.id,
      name: player.name,
      team: player.team ?? null,
      weaponId: sanitizeWeaponId(player.weaponId),
      state: nextState
    });

    const ctfEvent = handleCtfPlayerSync(room, player);
    if (ctfEvent) {
      if (ctfEvent.type === "capture") {
        touchDailyLeaderboardPlayer(player, { capturesDelta: 1 });
        emitDailyLeaderboardToRoom(room);
      }
      emitCtfUpdate(room, ctfEvent);
      const captureTeam = normalizeTeam(ctfEvent.byTeam);
      const teamScore = captureTeam ? Number(state.score[captureTeam] ?? 0) : 0;
      if (ctfEvent.type === "capture" && captureTeam && teamScore >= CTF_WIN_SCORE) {
        endRoundAndScheduleRestart(room, {
          winnerTeam: captureTeam,
          byPlayerId: ctfEvent.byPlayerId ?? player.id
        });
      } else {
        emitRoomUpdate(room);
      }
    }
  });

  socket.on("ctf:interact", (ackFn) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    const state = getRoomState(room);
    if (normalizeGameMode(state.mode) !== GAME_MODE.CTF) {
      ack(ackFn, { ok: false, error: "현재 모드에서는 깃발 상호작용을 사용할 수 없습니다" });
      return;
    }
    if (isRoundEnded(state)) {
      ack(ackFn, { ok: false, error: "라운드가 종료되어 재시작 대기 중입니다" });
      return;
    }

    const player = state.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "플레이어 정보를 찾을 수 없습니다" });
      return;
    }

    const team = normalizeTeam(player.team);
    if (!team) {
      ack(ackFn, { ok: false, error: "팀을 먼저 선택해 주세요" });
      return;
    }

    const playerHp = Number.isFinite(player.hp) ? player.hp : 100;
    if (playerHp <= 0) {
      ack(ackFn, { ok: false, error: "부활 후 다시 시도해 주세요" });
      return;
    }

    const playerPos = player.state;
    const flags = state.flags;
    if (!playerPos || !flags || typeof flags !== "object") {
      ack(ackFn, { ok: false, error: "깃발 상태를 확인할 수 없습니다" });
      return;
    }
    const enemyTeam = getEnemyTeam(team);
    const enemyFlag = enemyTeam ? flags[enemyTeam] : null;
    if (!enemyTeam || !enemyFlag) {
      ack(ackFn, { ok: false, error: "적 팀 깃발 상태를 확인할 수 없습니다" });
      return;
    }

    if (enemyFlag.carrierId) {
      const carrierId = String(enemyFlag.carrierId);
      const carrier = state.players.get(carrierId);
      const carrierHp = Number.isFinite(Number(carrier?.hp)) ? Number(carrier.hp) : 100;
      if (!carrier || carrierHp <= 0) {
        flags[enemyTeam] = createDefaultFlag(enemyFlag.home ?? getTeamFlagHomeForRoom(room, enemyTeam));
        touchRoomState(room);
        emitCtfUpdate(room, {
          type: "reset",
          reason: "invalid_carrier",
          flagTeam: enemyTeam
        });
      }
    }

    if (enemyFlag.carrierId) {
      if (String(enemyFlag.carrierId) === String(player.id)) {
        ack(ackFn, { ok: true, alreadyCarrying: true });
      } else {
        ack(ackFn, { ok: false, error: "이미 다른 플레이어가 깃발을 운반 중입니다" });
      }
      return;
    }

    const carriedTeam = findCarriedFlagTeam(flags, player.id);
    if (carriedTeam) {
      ack(ackFn, { ok: true, alreadyCarrying: true });
      return;
    }

    if (distanceXZ(playerPos, enemyFlag.at) > CTF_PICKUP_RADIUS) {
      ack(ackFn, { ok: false, error: "적 기지 깃발 근처에서 상호작용해 주세요" });
      return;
    }

    enemyFlag.carrierId = player.id;
    const enemyFlagHome = getTeamFlagHomeForRoom(room, enemyTeam);
    enemyFlag.at = {
      x: Number(playerPos.x ?? enemyFlag.at?.x ?? enemyFlag.home?.x ?? enemyFlagHome.x),
      y: Number(enemyFlag.home?.y ?? enemyFlagHome.y),
      z: Number(playerPos.z ?? enemyFlag.at?.z ?? enemyFlag.home?.z ?? enemyFlagHome.z)
    };
    touchRoomState(room);

    emitCtfUpdate(room, {
      type: "pickup",
      byPlayerId: player.id,
      byTeam: team,
      flagTeam: enemyTeam
    });
    emitRoomUpdate(room);
    ack(ackFn, { ok: true });
  });

  socket.on("block:update", (payload = {}, ackFn) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    const state = getRoomState(room);
    const player = state.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    const playerStock = ensurePlayerStock(player);
    const sanitized = sanitizeBlockPayload(payload);
    if (!sanitized) {
      ack(ackFn, { ok: false, error: "잘못된 블록 업데이트", stock: serializeBlockStock(playerStock) });
      return;
    }
    const protectedReason = getProtectedBlockReason(
      sanitized.action,
      sanitized.x,
      sanitized.y,
      sanitized.z
    );
    if (protectedReason === "lobby") {
      ack(ackFn, {
        ok: false,
        error: "3D 로비 보호 구역은 수정할 수 없습니다",
        roomStateRevision: state.revision,
        stock: serializeBlockStock(playerStock)
      });
      return;
    }

    const key = blockStateKey(sanitized.x, sanitized.y, sanitized.z);
    const previous = state.blocks.get(key);
    let collectedTypeId = null;

    if (sanitized.action === "place") {
      const samePlace =
        previous?.action === "place" &&
        Number(previous.x) === sanitized.x &&
        Number(previous.y) === sanitized.y &&
        Number(previous.z) === sanitized.z &&
        Number(previous.typeId) === sanitized.typeId;

      if (samePlace) {
        ack(ackFn, {
          ok: true,
          ignored: true,
          roomStateRevision: state.revision,
          stock: serializeBlockStock(playerStock)
        });
        return;
      }

      const currentStock = getStockCount(playerStock, sanitized.typeId);
      if (currentStock <= 0) {
        ack(ackFn, {
          ok: false,
          error: "보유한 블록이 부족합니다",
          roomStateRevision: state.revision,
          stock: serializeBlockStock(playerStock)
        });
        return;
      }
      changeStockCount(playerStock, sanitized.typeId, -1);
    } else {
      const removeResult = resolveRemovedBlockType(state, sanitized);
      if (!removeResult.ok) {
        ack(ackFn, {
          ok: false,
          error: "이미 제거된 블록입니다",
          roomStateRevision: state.revision,
          stock: serializeBlockStock(playerStock)
        });
        return;
      }
      collectedTypeId = removeResult.typeId;
      changeStockCount(playerStock, collectedTypeId, 1);
      sanitized.typeId = collectedTypeId;
    }

    const roomState = applyBlockUpdateToRoomState(room, sanitized);

    socket.to(room.code).emit("block:update", {
      id: socket.id,
      ...sanitized,
      roomStateRevision: roomState.revision
    });

    const serializedStock = serializeBlockStock(playerStock);
    socket.emit("inventory:update", {
      stock: serializedStock,
      roomStateRevision: roomState.revision
    });
    ack(ackFn, {
      ok: true,
      roomStateRevision: roomState.revision,
      stock: serializedStock,
      collectedTypeId
    });
  });

  socket.on("pvp:shoot", (payload = {}) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      return;
    }

    const state = getRoomState(room);
    if (isRoundEnded(state)) {
      return;
    }
    const shooter = state.players.get(socket.id);
    if (!shooter) {
      return;
    }
    if (findCarriedFlagTeam(state.flags, shooter.id)) {
      return;
    }

    const sanitized = sanitizeShootPayload(payload);
    if (!sanitized) {
      return;
    }

    const target = state.players.get(sanitized.targetId);
    if (!target || target.id === shooter.id) {
      return;
    }

    const shooterTeam = shooter.team ?? null;
    const targetTeam = target.team ?? null;
    const validTeamFight =
      (shooterTeam === "alpha" || shooterTeam === "bravo") &&
      (targetTeam === "alpha" || targetTeam === "bravo") &&
      shooterTeam !== targetTeam;

    if (!validTeamFight) {
      return;
    }

    const shooterHp = Number.isFinite(shooter.hp) ? shooter.hp : 100;
    const currentHp = Number.isFinite(target.hp) ? target.hp : 100;
    if (shooterHp <= 0 || currentHp <= 0) {
      return;
    }

    const now = Date.now();
    if ((Number(shooter.spawnShieldUntil) || 0) > now) {
      shooter.spawnShieldUntil = 0;
    }
    if ((Number(target.spawnShieldUntil) || 0) > now) {
      socket.emit("pvp:immune", {
        targetId: target.id,
        until: Number(target.spawnShieldUntil),
        reason: "respawn_shield"
      });
      return;
    }

    const weaponDef = getWeaponDefinition(shooter.weaponId ?? DEFAULT_WEAPON_ID);
    const cadenceSeconds = Math.max(
      Number(weaponDef.shotCooldown) || 0,
      Number(weaponDef.magazineSize) === 1 ? Number(weaponDef.reloadDuration) || 0 : 0
    );
    const minShotIntervalMs = Math.max(50, Math.round(cadenceSeconds * 1000 * 0.85));
    const previousShotAt = Number(shooter.lastShotAt) || 0;
    if (previousShotAt > 0 && now - previousShotAt < minShotIntervalMs) {
      return;
    }
    shooter.lastShotAt = now;
    const weaponBaseDamage = Math.max(1, Math.trunc(Number(weaponDef.damage) || PVP_DEFAULT_DAMAGE));
    const maxHitMultiplier = Math.max(1, Number(weaponDef.headshotMultiplier ?? 1) || 1);
    const weaponMaxDamage = Math.max(
      Math.round(weaponBaseDamage * maxHitMultiplier),
      Math.round(
        Math.trunc(Number(weaponDef.pelletDamage ?? weaponBaseDamage) || weaponBaseDamage) *
          Math.max(1, Math.trunc(Number(weaponDef.pelletCount ?? 1) || 1)) *
          maxHitMultiplier
      )
    );
    const requestedDamage = Math.trunc(Number(sanitized.damage ?? weaponBaseDamage) || weaponBaseDamage);
    const appliedDamage = Math.max(1, Math.min(weaponMaxDamage, requestedDamage));
    const nextHp = Math.max(0, currentHp - appliedDamage);
    const killed = nextHp <= 0;
    const shouldEmitRoomUpdate = killed;
    let respawnAt = 0;

    target.hp = nextHp;
    let ctfEvent = null;
    let dailyLeaderboardChanged = false;
    let victimStreakLost = 0;
    if (killed) {
      victimStreakLost = Math.max(0, Math.trunc(Number(target.killStreak) || 0));
      shooter.kills = (Number(shooter.kills) || 0) + 1;
      shooter.killStreak = (Number(shooter.killStreak) || 0) + 1;
      target.deaths = (Number(target.deaths) || 0) + 1;
      target.killStreak = 0;
      dailyLeaderboardChanged =
        touchDailyLeaderboardPlayer(shooter, { killsDelta: 1 }) ||
        touchDailyLeaderboardPlayer(target, { deathsDelta: 1 }) ||
        dailyLeaderboardChanged;
      respawnAt = schedulePlayerRespawn(room, target);

      const resetTeam = resetFlagForPlayer(room, target.id);
      if (resetTeam) {
        ctfEvent = {
          type: "reset",
          reason: "carrier_eliminated",
          byPlayerId: target.id,
          flagTeam: resetTeam
        };
      }
    } else {
      target.respawnAt = 0;
      clearPlayerRespawnTimer(target);
    }

    touchRoomState(room);
    if (ctfEvent) {
      emitCtfUpdate(room, ctfEvent);
    }
    if (dailyLeaderboardChanged) {
      emitDailyLeaderboardToRoom(room);
    }

    io.to(room.code).emit("pvp:damage", {
      attackerId: shooter.id,
      victimId: target.id,
      damage: appliedDamage,
      victimHealth: killed ? 0 : target.hp,
      killed,
      weaponId: sanitizeWeaponId(shooter.weaponId),
      respawnAt,
      attackerKills: shooter.kills ?? 0,
      attackerStreak: shooter.killStreak ?? 0,
      victimDeaths: target.deaths ?? 0,
      victimStreakLost,
      teamScore: {
        alpha: Number(state.score.alpha ?? 0),
        bravo: Number(state.score.bravo ?? 0)
      },
      teamCaptures: {
        alpha: Number(state.captures.alpha ?? 0),
        bravo: Number(state.captures.bravo ?? 0)
      },
      roomStateRevision: state.revision
    });
    if (shouldEmitRoomUpdate) {
      emitRoomUpdate(room);
    }
  });

  socket.on("player:hazard", (payload = {}, ackFn) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    const state = getRoomState(room);
    if (isRoundEnded(state)) {
      ack(ackFn, { ok: false, error: "라운드가 종료되었습니다" });
      return;
    }

    const player = state.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "플레이어를 찾을 수 없습니다" });
      return;
    }

    const playerHp = Number.isFinite(player.hp) ? player.hp : 100;
    if (playerHp <= 0) {
      ack(ackFn, { ok: false, error: "이미 사망 상태입니다" });
      return;
    }

    const sanitized = sanitizeHazardPayload(payload);
    if (!sanitized) {
      ack(ackFn, { ok: false, error: "잘못된 낙하 피해 데이터입니다" });
      return;
    }

    const nextHp = Math.max(0, playerHp - sanitized.damage);
    const killed = nextHp <= 0;
    let respawnAt = 0;
    let ctfEvent = null;
    let dailyLeaderboardChanged = false;
    let victimStreakLost = 0;

    player.hp = nextHp;
    if (killed) {
      victimStreakLost = Math.max(0, Math.trunc(Number(player.killStreak) || 0));
      player.deaths = (Number(player.deaths) || 0) + 1;
      player.killStreak = 0;
      dailyLeaderboardChanged = touchDailyLeaderboardPlayer(player, { deathsDelta: 1 });
      respawnAt = schedulePlayerRespawn(room, player);

      const resetTeam = resetFlagForPlayer(room, player.id);
      if (resetTeam) {
        ctfEvent = {
          type: "reset",
          reason: "carrier_eliminated",
          byPlayerId: player.id,
          flagTeam: resetTeam
        };
      }
    } else {
      player.respawnAt = 0;
      clearPlayerRespawnTimer(player);
    }

    touchRoomState(room);
    if (ctfEvent) {
      emitCtfUpdate(room, ctfEvent);
    }
    if (dailyLeaderboardChanged) {
      emitDailyLeaderboardToRoom(room);
    }

    io.to(room.code).emit("pvp:damage", {
      attackerId: null,
      victimId: player.id,
      damage: sanitized.damage,
      hazardReason: sanitized.reason,
      victimHealth: killed ? 0 : player.hp,
      killed,
      respawnAt,
      victimDeaths: player.deaths ?? 0,
      victimStreakLost,
      teamScore: {
        alpha: Number(state.score.alpha ?? 0),
        bravo: Number(state.score.bravo ?? 0)
      },
      teamCaptures: {
        alpha: Number(state.captures.alpha ?? 0),
        bravo: Number(state.captures.bravo ?? 0)
      },
      roomStateRevision: state.revision
    });

    if (killed) {
      emitRoomUpdate(room);
    }

    ack(ackFn, {
      ok: true,
      victimId: player.id,
      killed,
      hp: killed ? 0 : player.hp,
      respawnAt
    });
  });

  socket.on("portal:enter", (payload = {}, ackFn) => {
    const portalId = normalizeLobbyPortalId(payload.portalId ?? payload.id);
    if (!portalId) {
      ack(ackFn, { ok: false, error: "잘못된 포탈입니다" });
      return;
    }

    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    const state = getRoomState(room);
    const player = state.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    const enteredAt = Date.now();
    if (portalId === "training") {
      emitLobbyPortalEntered(room, {
        player,
        portalId,
        action: "training",
        team: normalizeTeam(player.team),
        enteredAt
      });
      ack(ackFn, {
        ok: true,
        portalId,
        action: "training",
        team: normalizeTeam(player.team),
        enteredAt
      });
      return;
    }

    if (portalId === "entry") {
      emitLobbyPortalEntered(room, {
        player,
        portalId,
        action: "entry",
        team: normalizeTeam(player.team),
        enteredAt
      });
      ack(ackFn, {
        ok: true,
        portalId,
        action: "entry",
        team: normalizeTeam(player.team),
        enteredAt
      });
      return;
    }

    if (portalId === "exit") {
      const opened = openExitPortalTarget();
      emitLobbyPortalEntered(room, {
        player,
        portalId,
        action: "exit",
        team: normalizeTeam(player.team),
        enteredAt
      });
      ack(ackFn, {
        ok: true,
        portalId,
        action: "exit",
        team: normalizeTeam(player.team),
        opened,
        enteredAt
      });
      return;
    }

    if (portalId !== "online") {
      ack(ackFn, { ok: false, error: "지원하지 않는 포탈입니다" });
      return;
    }

    if (state.round?.restartTimer) {
      ack(ackFn, { ok: false, error: "라운드 재시작 대기 중입니다" });
      return;
    }

    let team = normalizeTeam(player.team);
    if (!team) {
      team = pickBalancedTeam(state.players);
      player.team = team;
      touchRoomState(room);
      emitRoomUpdate(room);
    }

    emitLobbyPortalEntered(room, {
      player,
      portalId: "online",
      action: "hub",
      team,
      enteredAt
    });

    ack(ackFn, {
      ok: true,
      portalId: "online",
      action: "hub",
      team,
      enteredAt
    });
  });

  socket.on("room:list", () => {
    emitRoomList(socket);
  });

  socket.on("room:request-snapshot", (ackFn) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    ack(ackFn, {
      ok: true,
      snapshot: {
        ...serializeRoomState(room),
        blocks: serializeBlocksSnapshot(room),
        dailyLeaderboard: serializeDailyLeaderboard(12),
        stock: serializeBlockStock(getRoomState(room).players.get(socket.id)?.stock)
      }
    });
  });

  socket.on("room:quick-join", (payload = {}, ackFn) => {
    ack(ackFn, joinDefaultRoom(socket, payload.name));
  });

  socket.on("room:create", (payload = {}, ackFn) => {
    ack(ackFn, joinDefaultRoom(socket, payload.name));
  });

  socket.on("room:join", (payload = {}, ackFn) => {
    ack(ackFn, joinDefaultRoom(socket, payload.name));
  });

  socket.on("room:leave", (ackFn) => {
    ack(ackFn, joinDefaultRoom(socket));
  });

  socket.on("room:set-team", (payload = {}, ackFn) => {
    const team = payload.team === "alpha" || payload.team === "bravo" ? payload.team : null;
    if (!team) {
      ack(ackFn, { ok: false, error: "잘못된 팀입니다" });
      return;
    }

    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    const state = getRoomState(room);
    const player = state.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    player.team = team;
    touchRoomState(room);
    emitRoomUpdate(room);
    ack(ackFn, { ok: true });
  });

  socket.on("room:start", (payloadOrAck, maybeAckFn) => {
    const payload =
      payloadOrAck && typeof payloadOrAck === "object" && !Array.isArray(payloadOrAck)
        ? payloadOrAck
        : {};
    const ackFn = typeof payloadOrAck === "function" ? payloadOrAck : maybeAckFn;
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    const state = getRoomState(room);
    const player = state.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }
    if (room.hostId && room.hostId !== socket.id) {
      ack(ackFn, { ok: false, error: "방장만 매치를 시작할 수 있습니다" });
      return;
    }
    if (state.round?.restartTimer) {
      ack(ackFn, { ok: false, error: "라운드 재시작 대기 중입니다" });
      return;
    }

    const requestedMapId = normalizeOnlineMapId(payload.mapId ?? state.mapId);
    state.mapId = requestedMapId;
    const startedAt = Date.now();
    resetRoomRoundState(room, {
      startedAt,
      byPlayerId: socket.id
    });
    ack(ackFn, { ok: true, startedAt, mapId: requestedMapId });
  });

  socket.on("disconnecting", () => {
    leaveCurrentRoom(socket);
  });

  socket.on("disconnect", () => {
    playerCount = Math.max(0, playerCount - 1);
    console.log(`[-] player disconnected (${playerCount}) ${socket.id}`);
  });
});

const PORT = Number(process.env.PORT ?? 3001);
httpServer.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    void (async () => {
      const existingChatServer = await probeExistingServer(PORT);
      if (existingChatServer) {
        console.log(`Port ${PORT} is already in use. Existing chat server is running.`);
        process.exit(0);
      }

      console.error(
        `Port ${PORT} is in use by another process. Free the port or set a different PORT.`
      );
      process.exit(1);
    })();
    return;
  }

  console.error("Chat server failed to start:", error);
  process.exit(1);
});

process.on("beforeExit", () => {
  flushPersistentWorldSnapshot();
  flushDailyLeaderboardSnapshot();
});

process.on("SIGINT", () => {
  if (dailyLeaderboardResetInterval) {
    clearInterval(dailyLeaderboardResetInterval);
    dailyLeaderboardResetInterval = null;
  }
  flushPersistentWorldSnapshot();
  flushDailyLeaderboardSnapshot();
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (dailyLeaderboardResetInterval) {
    clearInterval(dailyLeaderboardResetInterval);
    dailyLeaderboardResetInterval = null;
  }
  flushPersistentWorldSnapshot();
  flushDailyLeaderboardSnapshot();
  process.exit(0);
});
httpServer.listen(PORT, () => {
  console.log(`Chat server running on http://localhost:${PORT}`);
  console.log(`Persistent room: ${DEFAULT_ROOM_CODE} (capacity ${MAX_ROOM_PLAYERS})`);
});












