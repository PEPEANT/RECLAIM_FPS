import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { io } from "socket.io-client";

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
  const list = Array.isArray(snapshotPayload?.snapshot?.blocks)
    ? snapshotPayload.snapshot.blocks
    : [];
  return list.some(
    (entry) =>
      entry?.action === "place" &&
      Number(entry?.x) === x &&
      Number(entry?.y) === y &&
      Number(entry?.z) === z
  );
}

function readMyTeam(room, socketId) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const me = players.find((player) => String(player?.id ?? "") === String(socketId));
  return me?.team ?? null;
}

function readStockValue(stockPayload, typeId) {
  const parsedTypeId = Math.trunc(Number(typeId) || 0);
  if (!parsedTypeId) {
    return 0;
  }
  const value = Number(stockPayload?.[parsedTypeId] ?? stockPayload?.[String(parsedTypeId)] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
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
  assert(server.exitCode === null && ready, `서버 기동 실패\n${bootLog}`);

  return { server, port };
}

function connectClient(url) {
  const socket = io(url, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 120,
    timeout: 5000
  });
  return socket;
}

async function waitConnected(socket, name) {
  await waitFor(() => socket.connected, 6000);
  assert(socket.connected, `${name} 연결 실패`);
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

    assert(joinA?.ok === true && joinB?.ok === true, "A/B room join 실패");
    assert(readMyTeam(joinA?.room, a.id), "A 자동 팀 배정 실패");
    assert(readMyTeam(joinB?.room, b.id), "B 자동 팀 배정 실패");

    const baseBlock = { x: 21, y: 5, z: 21, typeId: 3 };
    const lateBlock = { x: 22, y: 5, z: 21, typeId: 4 };

    a.emit("block:update", { action: "place", ...baseBlock });
    await sleep(120);

    a.disconnect();
    await sleep(120);
    b.emit("block:update", { action: "place", ...lateBlock });
    await sleep(120);

    const aRe = connectClient(url);
    opened.push(aRe);
    await waitConnected(aRe, "A-reconnect");
    const joinRe = await emitAck(aRe, "room:quick-join", { name: "PLAY_A" });
    assert(joinRe?.ok === true, "A 재접속 join 실패");

    const snapRe = await emitAck(aRe, "room:request-snapshot");
    assert(snapRe?.ok === true, "A 재접속 snapshot 실패");
    assert(
      hasPlacedBlock(snapRe, baseBlock.x, baseBlock.y, baseBlock.z),
      "재접속 스냅샷: 기존 블록 누락"
    );
    assert(
      hasPlacedBlock(snapRe, lateBlock.x, lateBlock.y, lateBlock.z),
      "재접속 스냅샷: 접속 중단 기간 블록 누락"
    );

    const c = connectClient(url);
    opened.push(c);
    await waitConnected(c, "C-mid-join");
    const joinC = await emitAck(c, "room:quick-join", { name: "PLAY_C" });
    assert(joinC?.ok === true, "C 중간합류 join 실패");

    const snapC = await emitAck(c, "room:request-snapshot");
    assert(snapC?.ok === true, "C 중간합류 snapshot 실패");
    assert(
      hasPlacedBlock(snapC, baseBlock.x, baseBlock.y, baseBlock.z),
      "중간합류 스냅샷: 기존 블록 누락"
    );
    assert(
      hasPlacedBlock(snapC, lateBlock.x, lateBlock.y, lateBlock.z),
      "중간합류 스냅샷: 최신 블록 누락"
    );
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
    assert(joinA?.ok === true && joinB?.ok === true, "동시건설 join 실패");

    const p1 = { x: 31, y: 5, z: 31, typeId: 5 };
    const p2 = { x: 32, y: 5, z: 31, typeId: 6 };
    const same = { x: 33, y: 5, z: 31, typeId: 2 };

    a.emit("block:update", { action: "place", ...p1 });
    b.emit("block:update", { action: "place", ...p2 });

    b.emit("block:update", { action: "place", ...same });
    a.emit("block:update", { action: "remove", x: same.x, y: same.y, z: same.z });
    await sleep(220);

    const [snapA, snapB] = await Promise.all([
      emitAck(a, "room:request-snapshot"),
      emitAck(b, "room:request-snapshot")
    ]);
    assert(snapA?.ok === true && snapB?.ok === true, "동시건설 snapshot 실패");

    const blocksA = Array.isArray(snapA?.snapshot?.blocks) ? snapA.snapshot.blocks : [];
    const blocksB = Array.isArray(snapB?.snapshot?.blocks) ? snapB.snapshot.blocks : [];

    const sortKey = (entry) =>
      `${entry?.action ?? ""}:${entry?.x ?? 0}:${entry?.y ?? 0}:${entry?.z ?? 0}:${entry?.typeId ?? 0}`;
    const normA = blocksA.map(sortKey).sort().join("|");
    const normB = blocksB.map(sortKey).sort().join("|");

    assert(normA === normB, "동시건설 후 A/B 스냅샷 불일치");
    assert(hasPlacedBlock(snapA, p1.x, p1.y, p1.z), "동시건설 결과: p1 누락");
    assert(hasPlacedBlock(snapA, p2.x, p2.y, p2.z), "동시건설 결과: p2 누락");
  } finally {
    a.disconnect();
    b.disconnect();
    await sleep(100);
  }
}

async function scenarioCombatAndCtfInteraction(url) {
  const a = connectClient(url);
  const b = connectClient(url);

  try {
    await Promise.all([waitConnected(a, "A"), waitConnected(b, "B")]);
    const [joinA, joinB] = await Promise.all([
      emitAck(a, "room:quick-join", { name: "PVP_A" }),
      emitAck(b, "room:quick-join", { name: "PVP_B" })
    ]);
    assert(joinA?.ok === true && joinB?.ok === true, "전투 시나리오 join 실패");

    const startAck = await emitAck(a, "room:start");
    assert(startAck?.ok === true, "전투 시나리오 room:start 실패");

    const teamA = await emitAck(a, "room:set-team", { team: "alpha" });
    const teamB = await emitAck(b, "room:set-team", { team: "bravo" });
    assert(teamA?.ok === true && teamB?.ok === true, "전투 시나리오 팀 배정 실패");

    let sawPvpDamage = false;
    let sawBlockSync = false;
    let pickupCount = 0;
    let captureCount = 0;
    let sawMatchEnd = false;

    a.on("pvp:damage", (payload = {}) => {
      if (String(payload.attackerId ?? "") === String(a.id) && String(payload.victimId ?? "") === String(b.id)) {
        sawPvpDamage = true;
      }
    });

    b.on("block:update", (payload = {}) => {
      if (
        String(payload.id ?? "") === String(a.id) &&
        payload.action === "place" &&
        Number(payload.x) === 12 &&
        Number(payload.y) === 5 &&
        Number(payload.z) === 12
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
      const winnerTeam = String(payload?.winnerTeam ?? "");
      if (winnerTeam === "alpha") {
        sawMatchEnd = true;
      }
    });

    a.emit("block:update", { action: "place", x: 12, y: 5, z: 12, typeId: 6 });
    await waitFor(() => sawBlockSync, 4000);

    for (let i = 0; i < 12 && !sawPvpDamage; i += 1) {
      a.emit("pvp:shoot", { targetId: b.id });
      await sleep(220);
    }
    await waitFor(() => sawPvpDamage, 4000);

    const bSame = await emitAck(b, "room:set-team", { team: "alpha" });
    assert(bSame?.ok === true, "동일 팀 전환 실패");
    sawPvpDamage = false;
    a.emit("pvp:shoot", { targetId: b.id });
    await sleep(500);
    assert(sawPvpDamage === false, "동일 팀에도 PvP 데미지 발생");

    const bBack = await emitAck(b, "room:set-team", { team: "bravo" });
    assert(bBack?.ok === true, "적 팀 복귀 실패");

    for (let i = 0; i < 3; i += 1) {
      a.emit("player:sync", { x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0 });
      await sleep(80);
      const pickupAck = await emitAck(a, "ctf:interact");
      assert(pickupAck?.ok === true, `ctf:interact 실패 (#${i + 1})`);
      await waitFor(() => pickupCount >= i + 1, 4500);
      a.emit("player:sync", { x: -35, y: 1.75, z: 0, yaw: 0, pitch: 0 });
      await waitFor(() => captureCount >= i + 1, 4500);
      await sleep(80);
    }
    await waitFor(() => sawMatchEnd, 4500);
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
    assert(joinA?.ok === true && joinB?.ok === true, "재고 시나리오 join 실패");

    const baseTypeId = 6;
    const baselineSnapshot = await emitAck(a, "room:request-snapshot");
    assert(baselineSnapshot?.ok === true, "재고 시나리오 baseline snapshot 실패");
    const baselineStock = readStockValue(baselineSnapshot?.snapshot?.stock, baseTypeId);
    assert(baselineStock > 0, `초기 재고가 0입니다 (type=${baseTypeId})`);

    const baseX = 110;
    const baseY = 5;
    const baseZ = 44;

    const placeAck = await emitAck(a, "block:update", {
      action: "place",
      x: baseX,
      y: baseY,
      z: baseZ,
      typeId: baseTypeId
    });
    assert(placeAck?.ok === true, "재고 시나리오 설치 ACK 실패");
    assert(
      readStockValue(placeAck?.stock, baseTypeId) === baselineStock - 1,
      "설치 후 재고 감소가 반영되지 않았습니다"
    );

    const removeAck = await emitAck(a, "block:update", {
      action: "remove",
      x: baseX,
      y: baseY,
      z: baseZ,
      typeId: baseTypeId
    });
    assert(removeAck?.ok === true, "재고 시나리오 제거 ACK 실패");
    assert(
      readStockValue(removeAck?.stock, baseTypeId) === baselineStock,
      "제거 후 재고 회수가 반영되지 않았습니다"
    );

    let latestStock = baselineStock;
    for (let i = 0; i < baselineStock; i += 1) {
      const drainAck = await emitAck(a, "block:update", {
        action: "place",
        x: baseX + 1 + i,
        y: baseY,
        z: baseZ,
        typeId: baseTypeId
      });
      assert(drainAck?.ok === true, `재고 소진 설치 실패 (#${i + 1})`);
      latestStock = readStockValue(drainAck?.stock, baseTypeId);
    }
    assert(latestStock === 0, `재고 소진 후 수량이 0이 아님 (${latestStock})`);

    const denied = await emitAck(a, "block:update", {
      action: "place",
      x: baseX + baselineStock + 4,
      y: baseY,
      z: baseZ,
      typeId: baseTypeId
    });
    assert(denied?.ok === false, "재고가 0인데 설치가 허용되었습니다");
    assert(readStockValue(denied?.stock, baseTypeId) === 0, "거부 후 재고 값이 잘못되었습니다");
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
