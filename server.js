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
const BLOCK_KEY_SEPARATOR = "|";
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
  socket.emit("room:snapshot", {
    reason,
    revision: state.revision,
    updatedAt: state.updatedAt,
    blocks: serializeBlocksSnapshot(room),
    flags: state.flags,
    score: state.score,
    captures: state.captures
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
    const typeId = clampNumber(raw.typeId, 1, 64, Number.NaN);
    if (!Number.isFinite(typeId)) {
      return null;
    }
    payload.typeId = Math.trunc(typeId);
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
      hp: Number(player.hp ?? 100)
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
      error: `GLOBAL room is full (${MAX_ROOM_PLAYERS})`
    };
  }

  state.players.set(socket.id, {
    id: socket.id,
    name,
    team: null,
    state: sanitizePlayerState(),
    hp: 100,
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

  socket.on("block:update", (payload = {}) => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      return;
    }

    const state = getRoomState(room);
    if (!state.players.has(socket.id)) {
      return;
    }

    const sanitized = sanitizeBlockPayload(payload);
    if (!sanitized) {
      return;
    }

    const roomState = applyBlockUpdateToRoomState(room, sanitized);

    socket.to(room.code).emit("block:update", {
      id: socket.id,
      ...sanitized,
      roomStateRevision: roomState.revision
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

    const currentHp = Number.isFinite(target.hp) ? target.hp : 100;
    const nextHp = Math.max(0, currentHp - PVP_DAMAGE);
    const killed = nextHp <= 0;

    target.hp = killed ? 100 : nextHp;
    let ctfEvent = null;
    if (killed) {
      shooter.kills = (Number(shooter.kills) || 0) + 1;
      target.deaths = (Number(target.deaths) || 0) + 1;
      if (shooterTeam === "alpha" || shooterTeam === "bravo") {
        state.score[shooterTeam] = (Number(state.score[shooterTeam]) || 0) + 1;
      }

      const resetTeams = resetFlagsForPlayer(room, target.id);
      if (resetTeams.length > 0) {
        ctfEvent = {
          type: "reset",
          reason: "carrier_eliminated",
          byPlayerId: target.id,
          flagTeams: resetTeams
        };
      }
    }

    touchRoomState(room);
    if (ctfEvent) {
      emitCtfUpdate(room, ctfEvent);
    }

    io.to(room.code).emit("pvp:damage", {
      attackerId: shooter.id,
      victimId: target.id,
      damage: PVP_DAMAGE,
      victimHealth: target.hp,
      killed,
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
      ack(ackFn, { ok: false, error: "Not in room" });
      return;
    }

    emitRoomSnapshot(socket, room, "manual");
    ack(ackFn, {
      ok: true,
      snapshot: {
        ...serializeRoomState(room),
        blocks: serializeBlocksSnapshot(room)
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
      ack(ackFn, { ok: false, error: "Invalid team" });
      return;
    }

    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) {
      ack(ackFn, { ok: false, error: "Not in room" });
      return;
    }

    const state = getRoomState(room);
    const player = state.players.get(socket.id);
    if (!player) {
      ack(ackFn, { ok: false, error: "Not in room" });
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
      ack(ackFn, { ok: false, error: "Not in room" });
      return;
    }

    const state = getRoomState(room);
    const players = Array.from(state.players.values());
    const starter = state.players.get(socket.id);
    const alphaCount = players.filter((player) => player.team === "alpha").length;
    const bravoCount = players.filter((player) => player.team === "bravo").length;

    if (!starter || !normalizeTeam(starter.team)) {
      ack(ackFn, { ok: false, error: "Select a team before starting" });
      return;
    }

    if (alphaCount <= 0 || bravoCount <= 0) {
      ack(ackFn, { ok: false, error: "Need at least one ALPHA and one BRAVO player" });
      return;
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
