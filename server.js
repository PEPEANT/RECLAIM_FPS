import { createServer } from "http";
import { Server } from "socket.io";
import { DEFAULT_GAME_MODE, GAME_MODE, normalizeGameMode } from "./src/shared/gameModes.js";
import {
  CTF_CAPTURE_RADIUS,
  CTF_PICKUP_RADIUS,
  CTF_WIN_SCORE,
  PVP_RESPAWN_MS,
  ROUND_RESTART_DELAY_MS
} from "./src/shared/matchConfig.js";

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
const PVP_DAMAGE = 34;
const HAZARD_DAMAGE_MIN = 1;
const HAZARD_DAMAGE_MAX = 2000;
const VOID_HAZARD_MIN_DAMAGE = 100;
const RESPAWN_SHIELD_MS = 1800;
const BLOCK_KEY_SEPARATOR = "|";
const BLOCK_TYPE_MIN = 1;
const BLOCK_TYPE_MAX = 8;
const DEFAULT_BLOCK_STOCK = 32;
const MAX_BLOCK_STOCK = 999;
const DEFAULT_TEAM_HOME = Object.freeze({
  alpha: Object.freeze({ x: -35, y: 0, z: 0 }),
  bravo: Object.freeze({ x: 35, y: 0, z: 0 })
});
const DEFAULT_CENTER_FLAG_HOME = Object.freeze({
  x: 0,
  y: 0,
  z: 0
});

const rooms = new Map();
let playerCount = 0;

function clonePoint(point = { x: 0, y: 0, z: 0 }) {
  return {
    x: Number(point.x ?? 0),
    y: Number(point.y ?? 0),
    z: Number(point.z ?? 0)
  };
}

function createDefaultCenterFlag() {
  return {
    home: clonePoint(DEFAULT_CENTER_FLAG_HOME),
    at: clonePoint(DEFAULT_CENTER_FLAG_HOME),
    carrierId: null
  };
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
  return {
    players,
    blocks: new Map(),
    mode: DEFAULT_GAME_MODE,
    flag: createDefaultCenterFlag(),
    score: { alpha: 0, bravo: 0 },
    captures: { alpha: 0, bravo: 0 },
    round: {
      ended: false,
      winnerTeam: null,
      restartAt: 0,
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
    if (typeof player.respawnTimer === "undefined") {
      player.respawnTimer = null;
    }
  }

  if (!(room.state.blocks instanceof Map)) {
    room.state.blocks = new Map();
  }

  room.state.mode = normalizeGameMode(room.state.mode);

  if (!room.state.flag || typeof room.state.flag !== "object") {
    room.state.flag = createDefaultCenterFlag();
  } else {
    const home = room.state.flag.home && typeof room.state.flag.home === "object"
      ? room.state.flag.home
      : DEFAULT_CENTER_FLAG_HOME;
    const at = room.state.flag.at && typeof room.state.flag.at === "object" ? room.state.flag.at : home;
    room.state.flag.home = clonePoint(home);
    room.state.flag.at = clonePoint(at);
    room.state.flag.carrierId = room.state.flag.carrierId ? String(room.state.flag.carrierId) : null;
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
      restartTimer: null
    };
  } else {
    room.state.round.ended = Boolean(room.state.round.ended);
    room.state.round.winnerTeam = normalizeTeam(room.state.round.winnerTeam);
    room.state.round.restartAt = Number.isFinite(room.state.round.restartAt)
      ? Math.max(0, Math.trunc(room.state.round.restartAt))
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

function getSpawnStateForTeam(team) {
  const normalized = normalizeTeam(team);
  const home = normalized ? DEFAULT_TEAM_HOME[normalized] : { x: 0, y: 0, z: 0 };
  const yaw = normalized === "alpha" ? -Math.PI * 0.5 : normalized === "bravo" ? Math.PI * 0.5 : 0;
  return sanitizePlayerState({
    x: home.x,
    y: 1.75,
    z: home.z,
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
    current.spawnShieldUntil = Date.now() + RESPAWN_SHIELD_MS;
    current.state = getSpawnStateForTeam(current.team);

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

function resetRoomRoundState(room, { startedAt = Date.now(), byPlayerId = null } = {}) {
  if (!room) {
    return null;
  }

  const state = getRoomState(room);
  clearRoundRestartTimer(state);
  state.mode = DEFAULT_GAME_MODE;
  state.flag = createDefaultCenterFlag();
  state.score.alpha = 0;
  state.score.bravo = 0;
  state.captures.alpha = 0;
  state.captures.bravo = 0;
  state.round.ended = false;
  state.round.winnerTeam = null;
  state.round.restartAt = 0;

  for (const player of state.players.values()) {
    player.kills = 0;
    player.deaths = 0;
    player.captures = 0;
    clearPlayerRespawnTimer(player);
    player.hp = 100;
    player.respawnAt = 0;
    player.spawnShieldUntil = Date.now() + RESPAWN_SHIELD_MS;
    player.state = getSpawnStateForTeam(player.team);
  }

  ensurePlayerTeamsBalanced(state.players);
  touchRoomState(room);
  emitRoomUpdate(room);
  io.to(room.code).emit("room:started", { code: room.code, startedAt });
  emitCtfUpdate(room, {
    type: "start",
    byPlayerId,
    flagTeam: "center"
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
      byPlayerId: "auto_restart"
    });
  }, ROUND_RESTART_DELAY_MS);

  return true;
}

function cloneCenterFlagState(flag = null) {
  const source = flag && typeof flag === "object" ? flag : {};
  const home = clonePoint(source.home ?? DEFAULT_CENTER_FLAG_HOME);
  return {
    home,
    at: clonePoint(source.at ?? home),
    carrierId: source.carrierId ? String(source.carrierId) : null
  };
}

function toLegacyTeamFlagsFromCenter(flag) {
  const snapshot = cloneCenterFlagState(flag);
  return {
    alpha: {
      home: clonePoint(snapshot.home),
      at: clonePoint(snapshot.at),
      carrierId: snapshot.carrierId
    },
    bravo: {
      home: clonePoint(snapshot.home),
      at: clonePoint(snapshot.at),
      carrierId: snapshot.carrierId
    }
  };
}

function serializeRoomState(room) {
  const state = getRoomState(room);
  const centerFlag = cloneCenterFlagState(state.flag);
  return {
    mode: normalizeGameMode(state.mode),
    revision: state.revision,
    updatedAt: state.updatedAt,
    targetScore: CTF_WIN_SCORE,
    blockCount: state.blocks.size,
    flag: centerFlag,
    // Legacy compatibility for older clients/scripts.
    flags: toLegacyTeamFlagsFromCenter(centerFlag),
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
      restartAt: Number(state.round?.restartAt ?? 0)
    }
  };
}

function resetFlagForPlayer(room, playerId) {
  const id = String(playerId ?? "").trim();
  if (!id) {
    return false;
  }

  const state = getRoomState(room);
  const flag = state.flag;
  if (!flag || flag.carrierId !== id) {
    return false;
  }

  flag.carrierId = null;
  flag.at = clonePoint(flag.home ?? DEFAULT_CENTER_FLAG_HOME);
  touchRoomState(room);
  return true;
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

  return touchRoomState(room);
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

  const teamHome = DEFAULT_TEAM_HOME[team] ?? { x: 0, y: 0, z: 0 };
  const centerFlag = state.flag;
  if (!centerFlag) {
    return null;
  }

  const playerPos = player.state;
  let changed = false;
  let event = null;

  if (centerFlag.carrierId === player.id) {
    centerFlag.at = {
      x: Number(playerPos.x ?? centerFlag.at?.x ?? centerFlag.home?.x ?? DEFAULT_CENTER_FLAG_HOME.x),
      y: Number(centerFlag.home?.y ?? DEFAULT_CENTER_FLAG_HOME.y),
      z: Number(playerPos.z ?? centerFlag.at?.z ?? centerFlag.home?.z ?? DEFAULT_CENTER_FLAG_HOME.z)
    };
    changed = true;
  }

  if (centerFlag.carrierId === player.id) {
    const nearHome = distanceXZ(playerPos, teamHome) <= CTF_CAPTURE_RADIUS;
    if (nearHome) {
      centerFlag.carrierId = null;
      centerFlag.at = clonePoint(centerFlag.home ?? DEFAULT_CENTER_FLAG_HOME);
      state.captures[team] = (Number(state.captures[team]) || 0) + 1;
      state.score[team] = (Number(state.score[team]) || 0) + 1;
      player.captures = (Number(player.captures) || 0) + 1;
      changed = true;
      event = {
        type: "capture",
        byPlayerId: player.id,
        byTeam: team,
        flagTeam: "center",
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
    stock: serializeBlockStock(player?.stock)
  });
}

function emitCtfUpdate(room, event = null) {
  if (!room) {
    return;
  }
  io.to(room.code).emit("ctf:update", serializeCtfState(room, event));
}

function createPersistentRoom() {
  const players = new Map();
  return {
    code: DEFAULT_ROOM_CODE,
    hostId: null,
    players,
    state: createRoomState(players),
    persistent: true,
    createdAt: Date.now()
  };
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

function sanitizeName(raw) {
  const value = String(raw ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 16);
  return value || "PLAYER";
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
    y: clampNumber(raw.y, 0, 128, 1.75),
    z: clampNumber(raw.z, -256, 256, 0),
    yaw: clampNumber(raw.yaw, -Math.PI, Math.PI, 0),
    pitch: clampNumber(raw.pitch, -1.55, 1.55, 0),
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
  return { targetId };
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
      team: player.team ?? null,
      state: player.state ?? null,
      hp: Number(player.hp ?? 100),
      respawnAt: Number(player.respawnAt ?? 0),
      spawnShieldUntil: Number(player.spawnShieldUntil ?? 0),
      kills: Number(player.kills ?? 0),
      deaths: Number(player.deaths ?? 0),
      captures: Number(player.captures ?? 0),
      stock: serializeBlockStock(player.stock)
    })),
    state: serializeRoomState(room)
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
  let ctfChanged = false;

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
      const reset = resetFlagForPlayer(room, socketId);
      if (reset) {
        ctfChanged = true;
      }
    }
    touchRoomState(room);
    updateHost(room);
    if (state.players.size === 0) {
      clearRoundRestartTimer(state);
      state.round.ended = false;
      state.round.winnerTeam = null;
      state.round.restartAt = 0;
    }
    if (ctfChanged) {
      emitCtfUpdate(room, {
        type: "reset",
        reason: "disconnect",
        flagTeam: "center"
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
  const reset = resetFlagForPlayer(room, socket.id);
  pruneRoomPlayers(room);
  updateHost(room);
  touchRoomState(room);
  if (reset) {
    emitCtfUpdate(room, {
      type: "reset",
      reason: "leave",
      byPlayerId: socket.id,
      flagTeam: "center"
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
  pruneRoomPlayers(room);
  const name = sanitizeName(nameOverride ?? socket.data.playerName);
  socket.data.playerName = name;

  if (socket.data.roomCode === room.code && state.players.has(socket.id)) {
    emitRoomSnapshot(socket, room, "resync");
    return { ok: true, room: serializeRoom(room) };
  }

  leaveCurrentRoom(socket);

  if (state.players.size >= MAX_ROOM_PLAYERS) {
    return {
      ok: false,
      error: `GLOBAL 방이 가득 찼습니다 (${MAX_ROOM_PLAYERS}명)`
    };
  }

  state.players.set(socket.id, {
    id: socket.id,
    name,
    team: pickBalancedTeam(state.players),
    state: sanitizePlayerState(),
    stock: createDefaultBlockStock(),
    hp: 100,
    respawnAt: 0,
    spawnShieldUntil: Date.now() + RESPAWN_SHIELD_MS,
    respawnTimer: null,
    kills: 0,
    deaths: 0,
    captures: 0
  });
  room.players = state.players;
  touchRoomState(room);

  updateHost(room);
  socket.join(room.code);
  socket.data.roomCode = room.code;
  emitRoomSnapshot(socket, room, "join");

  emitRoomUpdate(room);
  emitRoomList();

  return { ok: true, room: serializeRoom(room) };
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    const globalRoom = getDefaultRoom();
    writeJson(res, 200, {
      ok: true,
      service: "reclaim-fps-chat",
      rooms: rooms.size,
      online: playerCount,
      globalPlayers: globalRoom.players.size,
      globalCapacity: MAX_ROOM_PLAYERS,
      globalState: serializeRoomState(globalRoom),
      now: Date.now()
    });
    return;
  }

  if (req.url === "/" || req.url === "/status") {
    writeJson(res, 200, {
      ok: true,
      message: "RECLAIM FPS socket server is running",
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

io.on("connection", (socket) => {
  playerCount += 1;
  socket.data.playerName = `PLAYER_${Math.floor(Math.random() * 9000 + 1000)}`;
  socket.data.roomCode = null;

  console.log(`[+] player connected (${playerCount}) ${socket.id}`);

  const joined = joinDefaultRoom(socket);
  if (joined.ok) {
    ack(null, joined);
  }
  emitRoomList(socket);

  socket.on("chat:send", ({ name, text }) => {
    const safeName = sanitizeName(name ?? socket.data.playerName);
    const safeText = String(text ?? "").trim().slice(0, 200);
    if (!safeText) {
      return;
    }

    socket.data.playerName = safeName;
    io.emit("chat:message", { name: safeName, text: safeText });
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
      state: nextState
    });

    const ctfEvent = handleCtfPlayerSync(room, player);
    if (ctfEvent) {
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
    const flag = state.flag;
    if (!playerPos || !flag) {
      ack(ackFn, { ok: false, error: "깃발 상태를 확인할 수 없습니다" });
      return;
    }

    if (flag.carrierId) {
      const carrierId = String(flag.carrierId);
      const carrier = state.players.get(carrierId);
      const carrierHp = Number.isFinite(Number(carrier?.hp)) ? Number(carrier.hp) : 100;
      if (!carrier || carrierHp <= 0) {
        flag.carrierId = null;
        flag.at = clonePoint(flag.home ?? DEFAULT_CENTER_FLAG_HOME);
        touchRoomState(room);
        emitCtfUpdate(room, {
          type: "reset",
          reason: "invalid_carrier",
          flagTeam: "center"
        });
      }
    }

    if (flag.carrierId) {
      if (String(flag.carrierId) === String(player.id)) {
        ack(ackFn, { ok: true, alreadyCarrying: true });
      } else {
        ack(ackFn, { ok: false, error: "이미 다른 플레이어가 깃발을 운반 중입니다" });
      }
      return;
    }

    if (distanceXZ(playerPos, flag.at) > CTF_PICKUP_RADIUS) {
      ack(ackFn, { ok: false, error: "중앙 깃발 근처에서 상호작용해 주세요" });
      return;
    }

    flag.carrierId = player.id;
    flag.at = {
      x: Number(playerPos.x ?? flag.at?.x ?? flag.home?.x ?? DEFAULT_CENTER_FLAG_HOME.x),
      y: Number(flag.home?.y ?? DEFAULT_CENTER_FLAG_HOME.y),
      z: Number(playerPos.z ?? flag.at?.z ?? flag.home?.z ?? DEFAULT_CENTER_FLAG_HOME.z)
    };
    touchRoomState(room);

    emitCtfUpdate(room, {
      type: "pickup",
      byPlayerId: player.id,
      byTeam: team,
      flagTeam: "center"
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

    const nextHp = Math.max(0, currentHp - PVP_DAMAGE);
    const killed = nextHp <= 0;
    const shouldEmitRoomUpdate = killed;
    let respawnAt = 0;

    target.hp = nextHp;
    let ctfEvent = null;
    if (killed) {
      shooter.kills = (Number(shooter.kills) || 0) + 1;
      target.deaths = (Number(target.deaths) || 0) + 1;
      respawnAt = schedulePlayerRespawn(room, target);

      const reset = resetFlagForPlayer(room, target.id);
      if (reset) {
        ctfEvent = {
          type: "reset",
          reason: "carrier_eliminated",
          byPlayerId: target.id,
          flagTeam: "center"
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

    io.to(room.code).emit("pvp:damage", {
      attackerId: shooter.id,
      victimId: target.id,
      damage: PVP_DAMAGE,
      victimHealth: killed ? 0 : target.hp,
      killed,
      respawnAt,
      attackerKills: shooter.kills ?? 0,
      victimDeaths: target.deaths ?? 0,
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

    player.hp = nextHp;
    if (killed) {
      player.deaths = (Number(player.deaths) || 0) + 1;
      respawnAt = schedulePlayerRespawn(room, player);

      const reset = resetFlagForPlayer(room, player.id);
      if (reset) {
        ctfEvent = {
          type: "reset",
          reason: "carrier_eliminated",
          byPlayerId: player.id,
          flagTeam: "center"
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

    io.to(room.code).emit("pvp:damage", {
      attackerId: null,
      victimId: player.id,
      damage: sanitized.damage,
      hazardReason: sanitized.reason,
      victimHealth: killed ? 0 : player.hp,
      killed,
      respawnAt,
      victimDeaths: player.deaths ?? 0,
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

    emitRoomSnapshot(socket, room, "manual");
    ack(ackFn, {
      ok: true,
      snapshot: {
        ...serializeRoomState(room),
        blocks: serializeBlocksSnapshot(room),
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

  socket.on("room:start", (ackFn) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "방에 참가하지 않았습니다" });
      return;
    }

    resetRoomRoundState(room, {
      startedAt: Date.now(),
      byPlayerId: socket.id
    });
    ack(ackFn, { ok: true });
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

httpServer.listen(PORT, () => {
  console.log(`Chat server running on http://localhost:${PORT}`);
  console.log(`Persistent room: ${DEFAULT_ROOM_CODE} (capacity ${MAX_ROOM_PLAYERS})`);
});
