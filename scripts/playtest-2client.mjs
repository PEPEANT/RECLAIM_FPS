import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { io } from "socket.io-client";
import { CTF_WIN_SCORE } from "../src/shared/matchConfig.js";
import { getNextOnlineMapId, getOnlineMapConfig } from "../src/shared/onlineMapRotation.js";

const HOST = "127.0.0.1";
const START_PORT = 3301;
const END_PORT = 5300;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function waitFor(predicate, timeoutMs = 6000, stepMs = 25) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        if (predicate()) {
          resolve();
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("condition timeout"));
        return;
      }
      setTimeout(tick, stepMs);
    };
    tick();
  });
}

function emitAck(socket, event, payload = undefined) {
  return new Promise((resolve) => {
    if (payload === undefined) {
      socket.emit(event, (response = {}) => resolve(response));
      return;
    }
    socket.emit(event, payload, (response = {}) => resolve(response));
  });
}

function hasPlacedBlock(snapshotPayload, x, y, z) {
  const list = Array.isArray(snapshotPayload?.snapshot?.blocks) ? snapshotPayload.snapshot.blocks : [];
  return list.some(
    (entry) =>
      entry?.action === "place" &&
      Number(entry?.x) === Number(x) &&
      Number(entry?.y) === Number(y) &&
      Number(entry?.z) === Number(z)
  );
}

function readMyTeam(room, socketId) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const me = players.find((player) => String(player?.id ?? "") === String(socketId));
  return me?.team ?? null;
}

function readPlayerState(room, socketId) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const me = players.find((player) => String(player?.id ?? "") === String(socketId));
  return me?.state && typeof me.state === "object" ? me.state : null;
}

function readStockValue(stockPayload, typeId) {
  const parsedTypeId = Math.trunc(Number(typeId) || 0);
  if (!parsedTypeId) {
    return 0;
  }
  const value = Number(stockPayload?.[parsedTypeId] ?? stockPayload?.[String(parsedTypeId)] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function getYawPitchTowards(from, to) {
  const dx = Number(to?.x ?? 0) - Number(from?.x ?? 0);
  const dy = Number(to?.y ?? 0) - Number(from?.y ?? 0);
  const dz = Number(to?.z ?? 0) - Number(from?.z ?? 0);
  const horizontal = Math.hypot(dx, dz);
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.max(0.0001, horizontal))
  };
}

async function movePlayerTowards(socket, fromState, toState, { stepDistance = 2.4, delayMs = 240 } = {}) {
  let current = {
    x: Number(fromState?.x ?? 0),
    y: Number(fromState?.y ?? 1.75),
    z: Number(fromState?.z ?? 0)
  };
  const target = {
    x: Number(toState?.x ?? current.x),
    y: Number(toState?.y ?? current.y),
    z: Number(toState?.z ?? current.z)
  };
  let distance = Math.hypot(target.x - current.x, target.y - current.y, target.z - current.z);

  while (distance > stepDistance) {
    const scale = stepDistance / Math.max(0.0001, distance);
    const next = {
      x: current.x + (target.x - current.x) * scale,
      y: current.y + (target.y - current.y) * scale,
      z: current.z + (target.z - current.z) * scale
    };
    const aim = getYawPitchTowards(current, next);
    socket.emit("player:sync", { ...next, ...aim });
    current = next;
    await sleep(delayMs);
    distance = Math.hypot(target.x - current.x, target.y - current.y, target.z - current.z);
  }

  const finalAim = getYawPitchTowards(current, target);
  socket.emit("player:sync", { ...target, ...finalAim });
  await sleep(delayMs);
  return { ...target, ...finalAim };
}

function getReachableBlockFromState(state, { dx = 2, dz = 2, dy = 2, typeId = 6 } = {}) {
  return {
    x: Math.round(Number(state?.x ?? 0)) + Math.trunc(dx),
    y: Math.max(4, Math.round(Number(state?.y ?? 1.75)) + Math.trunc(dy)),
    z: Math.round(Number(state?.z ?? 0)) + Math.trunc(dz),
    typeId
  };
}

function getSharedReachableBlock(stateA, stateB, { dy = 2, typeId = 2 } = {}) {
  return {
    x: Math.round((Number(stateA?.x ?? 0) + Number(stateB?.x ?? 0)) / 2),
    y: Math.max(
      4,
      Math.round((Number(stateA?.y ?? 1.75) + Number(stateB?.y ?? 1.75)) / 2) + Math.trunc(dy)
    ),
    z: Math.round((Number(stateA?.z ?? 0) + Number(stateB?.z ?? 0)) / 2),
    typeId
  };
}

function buildReachableBlockPositions(state, count, typeId = 6) {
  const positions = [];
  const baseX = Math.round(Number(state?.x ?? 0));
  const baseY = 8;
  const baseZ = Math.round(Number(state?.z ?? 0));
  const outwardSignX = baseX >= 0 ? 1 : -1;

  for (let radius = 4; positions.length < count && radius <= 8; radius += 1) {
    const x = baseX + outwardSignX * radius * 2;
    const dzOrder = [0];
    for (let offset = 1; offset <= radius; offset += 1) {
      dzOrder.push(offset, -offset);
    }
    for (const dz of dzOrder) {
      if (positions.length >= count) {
        break;
      }
      positions.push({
        x,
        y: baseY,
        z: baseZ + dz * 2,
        typeId
      });
    }
  }

  return positions;
}

async function createServerProcess() {
  const port = START_PORT + Math.floor(Math.random() * (END_PORT - START_PORT));
  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let bootLog = "";
  let ready = false;

  server.stdout?.on("data", (data) => {
    const line = String(data);
    bootLog += line;
    if (line.includes("Chat server running on")) {
      ready = true;
    }
  });
  server.stderr?.on("data", (data) => {
    bootLog += String(data);
  });

  await waitFor(() => ready || server.exitCode !== null, 7000);
  assert(server.exitCode === null && ready, `server boot failed\n${bootLog}`);

  return { server, port };
}

function connectClient(url) {
  return io(url, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 120,
    timeout: 5000
  });
}

async function waitConnected(socket, name) {
  await waitFor(() => socket.connected, 6000);
  assert(socket.connected, `${name} failed to connect`);
}

async function scenarioReconnectAndJoinInProgress(url) {
  const a = connectClient(url);
  const b = connectClient(url);
  const opened = [a, b];

  try {
    await Promise.all([waitConnected(a, "A"), waitConnected(b, "B")]);
    const [joinA, joinB] = await Promise.all([
      emitAck(a, "room:quick-join", { name: "PLAY_A" }),
      emitAck(b, "room:quick-join", { name: "PLAY_B" })
    ]);

    assert(joinA?.ok === true && joinB?.ok === true, "reconnect scenario join failed");
    assert(readMyTeam(joinA?.room, a.id), "A team assignment missing");
    assert(readMyTeam(joinB?.room, b.id), "B team assignment missing");

    const stateA = readPlayerState(joinA?.room, a.id);
    const stateB = readPlayerState(joinB?.room, b.id);
    assert(stateA && stateB, "quick-join player state missing");

    const movedStateA = await movePlayerTowards(a, stateA, {
      x: Number(stateA.x ?? 0) + (Number(stateA.x ?? 0) >= 0 ? 8 : -8),
      y: Number(stateA.y ?? 1.75),
      z: Number(stateA.z ?? 0)
    });

    const baseBlock = getReachableBlockFromState(movedStateA, {
      dx: Number(movedStateA.x ?? 0) >= 0 ? 4 : -4,
      dz: 2,
      typeId: 3
    });
    const movedStateB = await movePlayerTowards(b, stateB, {
      x: Number(stateB.x ?? 0) + (Number(stateB.x ?? 0) >= 0 ? 8 : -8),
      y: Number(stateB.y ?? 1.75),
      z: Number(stateB.z ?? 0)
    });
    const lateBlock = getReachableBlockFromState(movedStateB, {
      dx: Number(movedStateB.x ?? 0) >= 0 ? 4 : -4,
      dz: 2,
      typeId: 4
    });

    const basePlaceAck = await emitAck(a, "block:update", { action: "place", ...baseBlock });
    assert(basePlaceAck?.ok === true, `base block place failed: ${JSON.stringify(basePlaceAck)}`);

    a.disconnect();
    await sleep(120);

    const latePlaceAck = await emitAck(b, "block:update", { action: "place", ...lateBlock });
    assert(latePlaceAck?.ok === true, `late block place failed: ${JSON.stringify(latePlaceAck)}`);

    const aRe = connectClient(url);
    opened.push(aRe);
    await waitConnected(aRe, "A-reconnect");
    const joinRe = await emitAck(aRe, "room:quick-join", { name: "PLAY_A" });
    assert(joinRe?.ok === true, "A reconnect join failed");

    const snapRe = await emitAck(aRe, "room:request-snapshot");
    assert(snapRe?.ok === true, "A reconnect snapshot failed");
    assert(hasPlacedBlock(snapRe, baseBlock.x, baseBlock.y, baseBlock.z), "reconnect snapshot missing base block");
    assert(hasPlacedBlock(snapRe, lateBlock.x, lateBlock.y, lateBlock.z), "reconnect snapshot missing late block");

    const c = connectClient(url);
    opened.push(c);
    await waitConnected(c, "C-mid-join");
    const joinC = await emitAck(c, "room:quick-join", { name: "PLAY_C" });
    assert(joinC?.ok === true, "C mid-join failed");

    const snapC = await emitAck(c, "room:request-snapshot");
    assert(snapC?.ok === true, "C snapshot failed");
    assert(hasPlacedBlock(snapC, baseBlock.x, baseBlock.y, baseBlock.z), "mid-join snapshot missing base block");
    assert(hasPlacedBlock(snapC, lateBlock.x, lateBlock.y, lateBlock.z), "mid-join snapshot missing late block");
  } finally {
    for (const socket of opened) {
      socket.disconnect();
    }
    await sleep(100);
  }
}

async function scenarioConcurrentBuild(url) {
  const a = connectClient(url);
  const b = connectClient(url);

  try {
    await Promise.all([waitConnected(a, "A"), waitConnected(b, "B")]);
    const [joinA, joinB] = await Promise.all([
      emitAck(a, "room:quick-join", { name: "BUILD_A" }),
      emitAck(b, "room:quick-join", { name: "BUILD_B" })
    ]);
    assert(joinA?.ok === true && joinB?.ok === true, "concurrent build join failed");

    const stateA = readPlayerState(joinA?.room, a.id);
    const stateB = readPlayerState(joinB?.room, b.id);
    assert(stateA && stateB, "concurrent build state missing");

    const movedStateA = await movePlayerTowards(a, stateA, {
      x: Number(stateA.x ?? 0) + (Number(stateA.x ?? 0) >= 0 ? 8 : -8),
      y: Number(stateA.y ?? 1.75),
      z: Number(stateA.z ?? 0)
    });
    const movedStateB = await movePlayerTowards(b, stateB, {
      x: Number(movedStateA.x ?? 0) + 6,
      y: Number(movedStateA.y ?? 1.75),
      z: Number(movedStateA.z ?? 0)
    });

    const p1 = getReachableBlockFromState(movedStateA, {
      dx: Number(movedStateA.x ?? 0) >= 0 ? 4 : -4,
      dz: 2,
      typeId: 5
    });
    const p2 = getReachableBlockFromState(movedStateB, {
      dx: Number(movedStateB.x ?? 0) >= 0 ? 6 : -6,
      dz: 2,
      typeId: 6
    });
    const shared = getReachableBlockFromState(movedStateA, {
      dx: Number(movedStateA.x ?? 0) >= 0 ? 6 : -6,
      dz: 0,
      typeId: 2
    });

    const p1Ack = await emitAck(a, "block:update", { action: "place", ...p1 });
    const p2Ack = await emitAck(b, "block:update", { action: "place", ...p2 });
    assert(p1Ack?.ok === true, `p1 place failed: ${JSON.stringify(p1Ack)}`);
    assert(p2Ack?.ok === true, `p2 place failed: ${JSON.stringify(p2Ack)}`);

    const sharedPlaceAck = await emitAck(b, "block:update", { action: "place", ...shared });
    const sharedRemoveAck = await emitAck(a, "block:update", {
      action: "remove",
      x: shared.x,
      y: shared.y,
      z: shared.z
    });
    assert(sharedPlaceAck?.ok === true, `shared place failed: ${JSON.stringify(sharedPlaceAck)}`);
    assert(sharedRemoveAck?.ok === true, `shared remove failed: ${JSON.stringify(sharedRemoveAck)}`);

    const [snapA, snapB] = await Promise.all([
      emitAck(a, "room:request-snapshot"),
      emitAck(b, "room:request-snapshot")
    ]);
    assert(snapA?.ok === true && snapB?.ok === true, "concurrent build snapshot failed");

    const blocksA = Array.isArray(snapA?.snapshot?.blocks) ? snapA.snapshot.blocks : [];
    const blocksB = Array.isArray(snapB?.snapshot?.blocks) ? snapB.snapshot.blocks : [];
    const sortKey = (entry) =>
      `${entry?.action ?? ""}:${entry?.x ?? 0}:${entry?.y ?? 0}:${entry?.z ?? 0}:${entry?.typeId ?? 0}`;

    assert(
      blocksA.map(sortKey).sort().join("|") === blocksB.map(sortKey).sort().join("|"),
      "A/B snapshot mismatch after concurrent build"
    );
    assert(hasPlacedBlock(snapA, p1.x, p1.y, p1.z), "p1 missing from snapshot");
    assert(hasPlacedBlock(snapA, p2.x, p2.y, p2.z), "p2 missing from snapshot");
  } finally {
    a.disconnect();
    b.disconnect();
    await sleep(100);
  }
}

async function scenarioCombatAndCtfInteraction(url) {
  const a = connectClient(url);
  const b = connectClient(url);
  let latestRoomA = null;
  let latestRoomB = null;

  try {
    a.on("room:update", (room = {}) => {
      latestRoomA = room;
    });
    b.on("room:update", (room = {}) => {
      latestRoomB = room;
    });

    await Promise.all([waitConnected(a, "A"), waitConnected(b, "B")]);
    const [joinA, joinB] = await Promise.all([
      emitAck(a, "room:quick-join", { name: "PVP_A" }),
      emitAck(b, "room:quick-join", { name: "PVP_B" })
    ]);
    assert(joinA?.ok === true && joinB?.ok === true, "combat scenario join failed");
    const weaponAck = await emitAck(a, "player:set-weapon", { weaponId: "spas12" });
    assert(weaponAck?.ok === true, `combat scenario weapon select failed: ${JSON.stringify(weaponAck)}`);

    const hostId = String(joinA?.room?.hostId ?? joinB?.room?.hostId ?? "");
    const starter = hostId && hostId === b.id ? b : a;
    const startAck = await emitAck(starter, "room:start");
    assert(startAck?.ok === true, "combat scenario room:start failed");

    const teamA = await emitAck(a, "room:set-team", { team: "alpha" });
    const teamB = await emitAck(b, "room:set-team", { team: "bravo" });
    assert(teamA?.ok === true && teamB?.ok === true, "combat scenario team select failed");

    let sawBlockSync = false;
    let pickupCount = 0;
    let captureCount = 0;
    let sawMatchEnd = false;
    let matchEndRestartAt = 0;
    let roomStartedCount = 0;
    let latestRestartMapId = "";
    let combatBlockPos = null;

    b.on("block:update", (payload = {}) => {
      if (
        String(payload.id ?? "") === String(a.id) &&
        payload.action === "place" &&
        Number(payload.x) === Number(combatBlockPos?.x) &&
        Number(payload.y) === Number(combatBlockPos?.y) &&
        Number(payload.z) === Number(combatBlockPos?.z)
      ) {
        sawBlockSync = true;
      }
    });
    a.on("ctf:update", (payload = {}) => {
      const type = String(payload?.event?.type ?? "");
      if (type === "pickup") {
        pickupCount += 1;
      } else if (type === "capture") {
        captureCount += 1;
      }
    });
    a.on("match:end", (payload = {}) => {
      if (String(payload?.winnerTeam ?? "") === "alpha") {
        sawMatchEnd = true;
        matchEndRestartAt = Math.max(0, Number(payload?.restartAt ?? 0));
      }
    });
    a.on("room:started", (payload = {}) => {
      roomStartedCount += 1;
      latestRestartMapId = String(payload?.mapId ?? "");
    });
    b.on("room:started", (payload = {}) => {
      roomStartedCount += 1;
      latestRestartMapId = String(payload?.mapId ?? "");
    });

    await waitFor(() => !!readPlayerState(latestRoomA, a.id) && !!readPlayerState(latestRoomB, b.id), 5000);
    let aState = readPlayerState(latestRoomA, a.id);
    let bState = readPlayerState(latestRoomB, b.id);
    assert(aState && bState, "combat player state missing");

    const ctfSnapshot = await emitAck(a, "room:request-snapshot");
    const roundMap = getOnlineMapConfig(ctfSnapshot?.snapshot?.mapId);
    const mid = roundMap?.mid ?? { x: 0, z: 0 };
    const alphaHome = roundMap.alphaBase ?? { x: -35, y: 0, z: 0 };
    const bravoFlagAt = ctfSnapshot?.snapshot?.flags?.bravo?.at ?? roundMap.bravoFlag ?? { x: 44, y: 0, z: 0 };
    const duelA = {
      x: Number(alphaHome.x ?? 0) + (Number(mid.x ?? 0) - Number(alphaHome.x ?? 0)) * 0.55,
      y: 1.75,
      z: Number(alphaHome.z ?? 0) + (Number(mid.z ?? 0) - Number(alphaHome.z ?? 0)) * 0.55
    };
    aState = await movePlayerTowards(a, aState, duelA);
    const duelB = {
      x: Number(aState.x ?? 0) + 6,
      y: Number(aState.y ?? 1.75),
      z: Number(aState.z ?? 0)
    };
    bState = await movePlayerTowards(b, bState, duelB);

    combatBlockPos = getReachableBlockFromState(aState, { dx: 10, dz: 2, typeId: 6 });
    const combatBlockAck = await emitAck(a, "block:update", { action: "place", ...combatBlockPos });
    assert(combatBlockAck?.ok === true, `combat block place failed: ${JSON.stringify(combatBlockAck)}`);
    await waitFor(() => sawBlockSync, 4000);

    const duelAim = getYawPitchTowards(aState, bState);
    a.emit("player:sync", { x: aState.x, y: aState.y, z: aState.z, ...duelAim });
    await sleep(260);
    console.log("[playtest-2client] combat: duel setup complete");
    await sleep(2000);
    let hitAck = null;
    for (let i = 0; i < 12; i += 1) {
      hitAck = await emitAck(a, "pvp:shoot", { targetId: b.id });
      if (hitAck?.hit) {
        break;
      }
      if (hitAck?.immune) {
        await sleep(400);
      }
      await sleep(220);
    }
    assert(hitAck?.hit === true, `expected baseline pvp hit: ${JSON.stringify(hitAck)}`);
    console.log("[playtest-2client] combat: pvp hit confirmed");

    const bSame = await emitAck(b, "room:set-team", { team: "alpha" });
    assert(bSame?.ok === true, "friendly-fire team swap failed");
    await sleep(900);
    a.emit("player:sync", { x: aState.x, y: aState.y, z: aState.z, ...duelAim });
    await sleep(260);
    const friendlyFireAck = await emitAck(a, "pvp:shoot", { targetId: b.id });
    assert(friendlyFireAck?.hit === false, `friendly-fire should not hit: ${JSON.stringify(friendlyFireAck)}`);
    console.log("[playtest-2client] combat: friendly fire blocked");

    const bBack = await emitAck(b, "room:set-team", { team: "bravo" });
    assert(bBack?.ok === true, "team restore failed");

    for (let i = 0; i < CTF_WIN_SCORE; i += 1) {
      aState = await movePlayerTowards(a, aState, { x: bravoFlagAt.x, y: 1.75, z: bravoFlagAt.z });
      const pickupAck = await emitAck(a, "ctf:interact");
      assert(pickupAck?.ok === true, `ctf interact failed (#${i + 1})`);
      await waitFor(() => pickupCount >= i + 1, 4500);
      console.log(`[playtest-2client] combat: pickup ${i + 1}/${CTF_WIN_SCORE}`);

      if (i === 0) {
        bState = await movePlayerTowards(b, bState, {
          x: bravoFlagAt.x - 7,
          y: 1.75,
          z: bravoFlagAt.z
        });
        const carryAim = getYawPitchTowards(aState, bState);
        a.emit("player:sync", { x: aState.x, y: aState.y, z: aState.z, ...carryAim });
        await sleep(220);
        let carrierShotAck = null;
        for (let shot = 0; shot < 4; shot += 1) {
          carrierShotAck = await emitAck(a, "pvp:shoot", { targetId: b.id });
          if (carrierShotAck?.ok === false) {
            break;
          }
          await sleep(120);
        }
        assert(
          carrierShotAck?.ok === false &&
            String(carrierShotAck?.error ?? "").includes("깃발 운반 중에는 사격할 수 없습니다"),
          `flag carrier shot should be rejected: ${JSON.stringify(carrierShotAck)}`
        );
        console.log("[playtest-2client] combat: carrier damage blocked");
      }

      aState = await movePlayerTowards(a, aState, { x: alphaHome.x, y: 1.75, z: alphaHome.z });
      await waitFor(() => captureCount >= i + 1, 4500);
      await sleep(80);
      console.log(`[playtest-2client] combat: capture ${i + 1}/${CTF_WIN_SCORE}`);
    }

    await waitFor(() => sawMatchEnd, 4500);
    console.log("[playtest-2client] combat: match end observed");
    const expectedNextMapId = getNextOnlineMapId(ctfSnapshot?.snapshot?.mapId);
    assert(matchEndRestartAt > Date.now(), "match:end restartAt missing or stale");
    await waitFor(() => roomStartedCount >= 2, 12000);
    assert(
      latestRestartMapId === expectedNextMapId,
      `expected next map ${expectedNextMapId}, got ${latestRestartMapId || "none"}`
    );

    const rotatedSnapshot = await emitAck(a, "room:request-snapshot");
    assert(
      rotatedSnapshot?.snapshot?.mapId === expectedNextMapId,
      `expected rotated snapshot map ${expectedNextMapId}, got ${JSON.stringify(rotatedSnapshot?.snapshot?.mapId)}`
    );
  } finally {
    a.disconnect();
    b.disconnect();
    await sleep(100);
  }
}

async function scenarioBlockStockAuthoritative(url) {
  const a = connectClient(url);
  const b = connectClient(url);

  try {
    await Promise.all([waitConnected(a, "A"), waitConnected(b, "B")]);
    const [joinA, joinB] = await Promise.all([
      emitAck(a, "room:quick-join", { name: "STOCK_A" }),
      emitAck(b, "room:quick-join", { name: "STOCK_B" })
    ]);
    assert(joinA?.ok === true && joinB?.ok === true, "stock scenario join failed");

    const baseTypeId = 6;
    const baselineSnapshot = await emitAck(a, "room:request-snapshot");
    assert(baselineSnapshot?.ok === true, "stock baseline snapshot failed");
    const baselineStock = readStockValue(baselineSnapshot?.snapshot?.stock, baseTypeId);
    assert(baselineStock > 0, `initial stock is zero for type=${baseTypeId}`);

    const stateA = readPlayerState(joinA?.room, a.id);
    assert(stateA, "stock scenario player state missing");
    const blockPositions = buildReachableBlockPositions(stateA, baselineStock + 6, baseTypeId);
    assert(blockPositions.length >= baselineStock + 2, "not enough reachable stock positions generated");
    const firstBlock = blockPositions[0];

    const placeAck = await emitAck(a, "block:update", { action: "place", ...firstBlock });
    assert(placeAck?.ok === true, "stock place ack failed");
    assert(
      readStockValue(placeAck?.stock, baseTypeId) === baselineStock - 1,
      "stock did not decrease after place"
    );

    const removeAck = await emitAck(a, "block:update", {
      action: "remove",
      x: firstBlock.x,
      y: firstBlock.y,
      z: firstBlock.z,
      typeId: baseTypeId
    });
    assert(removeAck?.ok === true, "stock remove ack failed");
    assert(
      readStockValue(removeAck?.stock, baseTypeId) === baselineStock,
      "stock did not recover after remove"
    );

    let latestStock = baselineStock;
    for (let i = 0; i < baselineStock; i += 1) {
      const block = blockPositions[i + 1];
      const drainAck = await emitAck(a, "block:update", { action: "place", ...block });
      assert(drainAck?.ok === true, `stock drain place failed (#${i + 1})`);
      latestStock = readStockValue(drainAck?.stock, baseTypeId);
    }
    assert(latestStock === 0, `expected stock to reach zero, got ${latestStock}`);

    const deniedBlock = blockPositions[baselineStock + 2];
    const denied = await emitAck(a, "block:update", { action: "place", ...deniedBlock });
    assert(denied?.ok === false, "place should be denied after stock is exhausted");
    assert(readStockValue(denied?.stock, baseTypeId) === 0, "denied stock payload should stay at zero");
  } finally {
    a.disconnect();
    b.disconnect();
    await sleep(100);
  }
}

async function main() {
  console.log("[playtest-2client] starting");
  const { server, port } = await createServerProcess();
  const baseUrl = `http://${HOST}:${port}`;

  try {
    await scenarioReconnectAndJoinInProgress(baseUrl);
    console.log("[playtest-2client] reconnect/join-in-progress: PASS");

    await scenarioConcurrentBuild(baseUrl);
    console.log("[playtest-2client] concurrent-build: PASS");

    await scenarioCombatAndCtfInteraction(baseUrl);
    console.log("[playtest-2client] combat/ctf-interaction: PASS");

    await scenarioBlockStockAuthoritative(baseUrl);
    console.log("[playtest-2client] authoritative-stock: PASS");

    console.log("[playtest-2client] all scenarios passed");
  } finally {
    if (server.exitCode === null) {
      server.kill();
    }
    await sleep(120);
  }
}

main().catch((error) => {
  console.error("[playtest-2client] failed");
  console.error(String(error?.stack ?? error));
  process.exit(1);
});
