import { createServer } from "http";
import { Server } from "socket.io";

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
const PVP_RESPAWN_MS = 5000;
const BLOCK_KEY_SEPARATOR = "|";
const BLOCK_TYPE_MIN = 1;
const BLOCK_TYPE_MAX = 8;
const DEFAULT_BLOCK_STOCK = 32;
const MAX_BLOCK_STOCK = 999;
const FLAG_TEAMS = ["alpha", "bravo"];
const FLAG_PICKUP_RADIUS = 2.25;
const FLAG_CAPTURE_RADIUS = 3.1;
const DEFAULT_FLAG_HOME = Object.freeze({
  alpha: Object.freeze({ x: -42, y: 0, z: 0 }),
  bravo: Object.freeze({ x: 42, y: 0, z: 0 })
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

function createDefaultFlags() {
  return {
    alpha: {
      home: clonePoint(DEFAULT_FLAG_HOME.alpha),
      at: clonePoint(DEFAULT_FLAG_HOME.alpha),
      carrierId: null
    },
    bravo: {
      home: clonePoint(DEFAULT_FLAG_HOME.bravo),
      at: clonePoint(DEFAULT_FLAG_HOME.bravo),
      carrierId: null
    }
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
    flags: createDefaultFlags(),
    score: { alpha: 0, bravo: 0 },
    captures: { alpha: 0, bravo: 0 },
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
    if (typeof player.respawnTimer === "undefined") {
      player.respawnTimer = null;
    }
  }

  if (!(room.state.blocks instanceof Map)) {
    room.state.blocks = new Map();
  }

  if (!room.state.flags || typeof room.state.flags !== "object") {
    room.state.flags = createDefaultFlags();
  }

  if (!room.state.score || typeof room.state.score !== "object") {
    room.state.score = { alpha: 0, bravo: 0 };
  }

  if (!room.state.captures || typeof room.state.captures !== "object") {
    room.state.captures = { alpha: 0, bravo: 0 };
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

function getSpawnStateForTeam(team) {
  const normalized = normalizeTeam(team);
  const home = normalized ? DEFAULT_FLAG_HOME[normalized] : { x: 0, y: 0, z: 0 };
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
    current.state = getSpawnStateForTeam(current.team);

    const roomState = touchRoomState(room);
    io.to(room.code).emit("player:respawn", {
      id: current.id,
      hp: current.hp,
      state: current.state,
      roomStateRevision: roomState.revision
    });
    emitRoomUpdate(room);
  }, PVP_RESPAWN_MS);

  return respawnAt;
}

function cloneFlagState(flags = null) {
  const source = flags && typeof flags === "object" ? flags : {};
  const next = {};

  for (const team of FLAG_TEAMS) {
    const fallbackHome = DEFAULT_FLAG_HOME[team];
    const flag = source[team] ?? {};
    const home = clonePoint(flag.home ?? fallbackHome);
    next[team] = {
      home,
      at: clonePoint(flag.at ?? home),
      carrierId: flag.carrierId ? String(flag.carrierId) : null
    };
  }

  return next;
}

function serializeRoomState(room) {
  const state = getRoomState(room);
  return {
    revision: state.revision,
    updatedAt: state.updatedAt,
    blockCount: state.blocks.size,
    flags: cloneFlagState(state.flags),
    score: {
      alpha: Number(state.score.alpha ?? 0),
      bravo: Number(state.score.bravo ?? 0)
    },
    captures: {
      alpha: Number(state.captures.alpha ?? 0),
      bravo: Number(state.captures.bravo ?? 0)
    }
  };
}

function resetFlagsForPlayer(room, playerId) {
  const id = String(playerId ?? "").trim();
  if (!id) {
    return [];
  }

  const state = getRoomState(room);
  const resetFlagTeams = [];

  for (const team of FLAG_TEAMS) {
    const flag = state.flags?.[team];
    if (!flag || flag.carrierId !== id) {
      continue;
    }

    flag.carrierId = null;
    flag.at = clonePoint(flag.home ?? DEFAULT_FLAG_HOME[team]);
    resetFlagTeams.push(team);
  }

  if (resetFlagTeams.length > 0) {
    touchRoomState(room);
  }

  return resetFlagTeams;
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

  const team = normalizeTeam(player.team);
  const enemyTeam = getEnemyTeam(team);
  if (!team || !enemyTeam) {
    return null;
  }

  const state = getRoomState(room);
  const ownFlag = state.flags?.[team];
  const enemyFlag = state.flags?.[enemyTeam];
  if (!ownFlag || !enemyFlag) {
    return null;
  }

  const playerPos = player.state;
  let changed = false;
  let event = null;

  if (enemyFlag.carrierId === player.id) {
    enemyFlag.at = {
      x: Number(playerPos.x ?? enemyFlag.at?.x ?? enemyFlag.home.x),
      y: Number(enemyFlag.home?.y ?? 0),
      z: Number(playerPos.z ?? enemyFlag.at?.z ?? enemyFlag.home.z)
    };
    changed = true;
  } else if (!enemyFlag.carrierId && distanceXZ(playerPos, enemyFlag.at) <= FLAG_PICKUP_RADIUS) {
    enemyFlag.carrierId = player.id;
    enemyFlag.at = {
      x: Number(playerPos.x ?? enemyFlag.at?.x ?? enemyFlag.home.x),
      y: Number(enemyFlag.home?.y ?? 0),
      z: Number(playerPos.z ?? enemyFlag.at?.z ?? enemyFlag.home.z)
    };
    changed = true;
    event = {
      type: "pickup",
      byPlayerId: player.id,
      byTeam: team,
      flagTeam: enemyTeam
    };
  }

  if (enemyFlag.carrierId === player.id) {
    const nearHome = distanceXZ(playerPos, ownFlag.home) <= FLAG_CAPTURE_RADIUS;
    const ownFlagAtHome = !ownFlag.carrierId && distanceXZ(ownFlag.at, ownFlag.home) <= 0.25;
    if (nearHome && ownFlagAtHome) {
      enemyFlag.carrierId = null;
      enemyFlag.at = clonePoint(enemyFlag.home);
      state.captures[team] = (Number(state.captures[team]) || 0) + 1;
      state.score[team] = (Number(state.score[team]) || 0) + 500;
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

function getEnemyTeam(team) {
  if (team === "alpha") {
    return "bravo";
  }
  if (team === "bravo") {
    return "alpha";
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
    revision: state.revision,
    updatedAt: state.updatedAt,
    flags: state.flags,
    score: state.score,
    captures: state.captures,
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
    revision: state.revision,
    updatedAt: state.updatedAt,
    blocks: serializeBlocksSnapshot(room),
    flags: state.flags,
    score: state.score,
    captures: state.captures,
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

function serializeRoom(room) {
  pruneRoomPlayers(room);
  const state = getRoomState(room);
  return {
    code: room.code,
    hostId: room.hostId,
    players: Array.from(state.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team ?? null,
      state: player.state ?? null,
      hp: Number(player.hp ?? 100),
      respawnAt: Number(player.respawnAt ?? 0),
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
      const resetTeams = resetFlagsForPlayer(room, socketId);
      if (resetTeams.length > 0) {
        ctfChanged = true;
      }
    }
    touchRoomState(room);
    updateHost(room);
    if (ctfChanged) {
      emitCtfUpdate(room, {
        type: "reset",
        reason: "disconnect"
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
  const resetTeams = resetFlagsForPlayer(room, socket.id);
  pruneRoomPlayers(room);
  updateHost(room);
  touchRoomState(room);
  if (resetTeams.length > 0) {
    emitCtfUpdate(room, {
      type: "reset",
      reason: "leave",
      byPlayerId: socket.id
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
    respawnTimer: null,
    kills: 0,
    deaths: 0
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
    }
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

    const nextHp = Math.max(0, currentHp - PVP_DAMAGE);
    const killed = nextHp <= 0;
    let respawnAt = 0;

    target.hp = nextHp;
    let ctfEvent = null;
    if (killed) {
      shooter.kills = (Number(shooter.kills) || 0) + 1;
      target.deaths = (Number(target.deaths) || 0) + 1;
      if (shooterTeam === "alpha" || shooterTeam === "bravo") {
        state.score[shooterTeam] = (Number(state.score[shooterTeam]) || 0) + 1;
      }
      respawnAt = schedulePlayerRespawn(room, target);

      const resetTeams = resetFlagsForPlayer(room, target.id);
      if (resetTeams.length > 0) {
        ctfEvent = {
          type: "reset",
          reason: "carrier_eliminated",
          byPlayerId: target.id,
          flagTeams: resetTeams
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

    const state = getRoomState(room);
    if (ensurePlayerTeamsBalanced(state.players)) {
      touchRoomState(room);
      emitRoomUpdate(room);
    }

    io.to(room.code).emit("room:started", { code: room.code, startedAt: Date.now() });
    emitCtfUpdate(room, {
      type: "start",
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
