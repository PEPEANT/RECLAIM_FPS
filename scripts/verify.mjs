import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import * as THREE from "three";
import { io } from "socket.io-client";
import { WeaponSystem } from "../src/game/WeaponSystem.js";
import { VoxelWorld } from "../src/game/build/VoxelWorld.js";

const skipBuild = process.argv.includes("--skip-build");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: options.stdio ?? "pipe",
      env: options.env ?? process.env
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (data) => {
        stdout += String(data);
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (data) => {
        stderr += String(data);
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Command failed (${command} ${args.join(" ")}):\n${stderr || stdout || `exit ${code}`}`
          )
        );
      }
    });
  });
}

function runNpm(args) {
  if (process.platform === "win32") {
    return run("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`]);
  }
  return run("npm", args);
}

async function waitFor(fn, timeoutMs = 6000, stepMs = 30) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fn()) {
      return;
    }
    await sleep(stepMs);
  }
  throw new Error("Timed out waiting for condition");
}

function emitWithAck(socket, event, payload = undefined) {
  return new Promise((resolve) => {
    if (payload === undefined) {
      socket.emit(event, resolve);
      return;
    }
    socket.emit(event, payload, resolve);
  });
}

function readStockValue(stockPayload, typeId) {
  const parsedTypeId = Math.trunc(Number(typeId) || 0);
  if (!parsedTypeId) {
    return 0;
  }
  const value = Number(stockPayload?.[parsedTypeId] ?? stockPayload?.[String(parsedTypeId)] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

async function checkSyntax() {
  const files = [
    "src/main.js",
    "src/game/Chat.js",
    "src/game/HUD.js",
    "src/game/WeaponSystem.js",
    "src/game/EnemyManager.js",
    "src/game/Game.js",
    "src/game/audio/SoundSystem.js",
    "src/game/build/BuildSystem.js",
    "src/game/build/BlockPalette.js",
    "src/game/build/VoxelWorld.js",
    "src/shared/gameModes.js",
    "src/shared/matchConfig.js",
    "server.js"
  ];

  for (const file of files) {
    await run(process.execPath, ["--check", file]);
  }
}

function checkWeaponSystem() {
  const weapon = new WeaponSystem();
  let shots = 0;
  const dt = 1 / 120;
  for (let t = 0; t < 1.01; t += dt) {
    weapon.update(dt);
    if (weapon.tryShoot().success) {
      shots += 1;
    }
  }

  assert(shots >= 9 && shots <= 11, `Unexpected shots in 1s: ${shots}`);
}

function checkVoxelWorld() {
  const scene = new THREE.Scene();
  const textureLoader = {
    load() {
      return new THREE.Texture();
    }
  };
  const world = new VoxelWorld(scene, textureLoader);

  const basePlaced = world.setBlock(0, 0, 0, 1);
  const adjacentPlaced = world.placeAdjacent(
    { x: 0, y: 0, z: 0, normal: new THREE.Vector3(1, 0, 0) },
    2
  );
  const removed = world.removeFromHit({ x: 1, y: 0, z: 0 });

  assert(basePlaced === true, "Failed to place base block");
  assert(adjacentPlaced === true, "Failed to place adjacent block");
  assert(removed === true, "Failed to remove placed block");
  assert(world.hasBlock(1, 0, 0) === false, "Block still exists after remove");

  world.generateTerrain({ mapId: "forest_frontline", seed: 20260227 });
  const arenaMeta = world.getArenaMeta();
  assert(world.blockMap.size > 100000, `Unexpected terrain block count: ${world.blockMap.size}`);
  assert(
    arenaMeta?.halfExtent >= 50 && arenaMeta?.halfExtent <= 72,
    `Unexpected arena half extent: ${JSON.stringify(arenaMeta)}`
  );
  assert(
    Number.isFinite(arenaMeta?.alphaBase?.x) &&
      Number.isFinite(arenaMeta?.bravoBase?.x) &&
      Number.isFinite(arenaMeta?.mid?.x),
    `Invalid arena metadata: ${JSON.stringify(arenaMeta)}`
  );
}

async function checkSocketServer() {
  const port = 3101 + Math.floor(Math.random() * 2000);
  const server = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverReady = false;
  let serverFailed = false;
  let bootLog = "";

  if (server.stdout) {
    server.stdout.on("data", (data) => {
      const line = String(data);
      bootLog += line;
      if (line.includes("Chat server running on")) {
        serverReady = true;
      }
      if (line.includes("failed")) {
        serverFailed = true;
      }
    });
  }
  if (server.stderr) {
    server.stderr.on("data", (data) => {
      bootLog += String(data);
    });
  }

  let c1 = null;
  let c2 = null;

  try {
    await waitFor(() => serverReady || serverFailed, 6000);
    assert(serverReady, `Server failed to boot:\n${bootLog}`);

    c1 = io(`http://localhost:${port}`, {
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 120,
      timeout: 5000,
      transports: ["websocket"]
    });
    c2 = io(`http://localhost:${port}`, {
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 120,
      timeout: 5000,
      transports: ["websocket"]
    });

    await Promise.all([
      waitFor(() => c1.connected, 6000),
      waitFor(() => c2.connected, 6000)
    ]);

    let startedCount = 0;
    let receivedChatText = "";
    let latestRoomPlayers = [];
    let ctfPickupSeen = false;
    let ctfCaptureSeen = false;
    let hazardDamageSeen = false;
    let snapshotReceived = false;
    c1.on("room:started", () => {
      startedCount += 1;
    });
    c2.on("room:started", () => {
      startedCount += 1;
    });
    c1.on("room:update", (room) => {
      latestRoomPlayers = Array.isArray(room?.players) ? room.players : [];
    });
    c1.on("chat:message", (payload) => {
      receivedChatText = payload?.text ?? "";
    });
    c1.on("room:snapshot", (payload) => {
      snapshotReceived = Array.isArray(payload?.blocks);
    });
    c1.on("ctf:update", (payload) => {
      const eventType = payload?.event?.type ?? "";
      if (eventType === "pickup") {
        ctfPickupSeen = true;
      } else if (eventType === "capture") {
        ctfCaptureSeen = true;
      }
    });
    c1.on("pvp:damage", (payload) => {
      if (
        payload?.hazardReason === "fall" &&
        payload?.victimId === c1.id &&
        Number(payload?.damage) === 12
      ) {
        hazardDamageSeen = true;
      }
    });

    const created = await emitWithAck(c1, "room:create", { name: "CheckHost" });
    assert(created?.ok === true, `room:create failed: ${JSON.stringify(created)}`);
    const code = created.room?.code;
    assert(code === "GLOBAL", `Expected GLOBAL room code, got: ${String(code)}`);

    const joined = await emitWithAck(c2, "room:join", { code, name: "CheckGuest" });
    assert(joined?.ok === true, `room:join failed: ${JSON.stringify(joined)}`);
    assert(
      joined?.room?.code === "GLOBAL",
      `Expected GLOBAL room on join, got: ${JSON.stringify(joined)}`
    );

    const teamHost = await emitWithAck(c1, "room:set-team", { team: "alpha" });
    const teamGuest = await emitWithAck(c2, "room:set-team", { team: "bravo" });
    assert(teamHost?.ok === true, `host team select failed: ${JSON.stringify(teamHost)}`);
    assert(teamGuest?.ok === true, `guest team select failed: ${JSON.stringify(teamGuest)}`);

    const snapshotAck = await emitWithAck(c1, "room:request-snapshot");
    assert(snapshotAck?.ok === true, `room:request-snapshot failed: ${JSON.stringify(snapshotAck)}`);
    assert(
      Array.isArray(snapshotAck?.snapshot?.blocks),
      `snapshot blocks missing: ${JSON.stringify(snapshotAck)}`
    );
    assert(
      snapshotAck?.snapshot?.stock && typeof snapshotAck.snapshot.stock === "object",
      `snapshot stock missing: ${JSON.stringify(snapshotAck)}`
    );
    assert(
      Number(snapshotAck?.snapshot?.targetScore) >= 1 &&
        snapshotAck?.snapshot?.round &&
        typeof snapshotAck.snapshot.round === "object",
      `snapshot round metadata missing: ${JSON.stringify(snapshotAck)}`
    );
    await waitFor(() => snapshotReceived, 3000);

    const baselineTypeId = 6;
    const baselineStock = readStockValue(snapshotAck?.snapshot?.stock, baselineTypeId);
    assert(baselineStock > 0, `invalid baseline stock: ${baselineStock}`);

    const stockPlaceAck = await emitWithAck(c1, "block:update", {
      action: "place",
      x: 120,
      y: 5,
      z: 40,
      typeId: baselineTypeId
    });
    assert(stockPlaceAck?.ok === true, `block:update place ack failed: ${JSON.stringify(stockPlaceAck)}`);
    assert(
      readStockValue(stockPlaceAck?.stock, baselineTypeId) === baselineStock - 1,
      `stock did not decrease after place: ${JSON.stringify(stockPlaceAck)}`
    );

    const stockRemoveAck = await emitWithAck(c1, "block:update", {
      action: "remove",
      x: 120,
      y: 5,
      z: 40,
      typeId: baselineTypeId
    });
    assert(stockRemoveAck?.ok === true, `block:update remove ack failed: ${JSON.stringify(stockRemoveAck)}`);
    assert(
      readStockValue(stockRemoveAck?.stock, baselineTypeId) === baselineStock,
      `stock did not recover after remove: ${JSON.stringify(stockRemoveAck)}`
    );

    c1.emit("player:sync", { x: 44, y: 1.75, z: 0, yaw: 0, pitch: 0 });
    await sleep(80);
    const pickupAck = await emitWithAck(c1, "ctf:interact");
    assert(pickupAck?.ok === true, `ctf:interact failed: ${JSON.stringify(pickupAck)}`);
    await waitFor(() => ctfPickupSeen, 4000);
    c1.emit("player:sync", { x: -35, y: 1.75, z: 0, yaw: 0, pitch: 0 });
    await waitFor(() => ctfCaptureSeen, 4000);

    const left = await emitWithAck(c2, "room:leave");
    assert(left?.ok === true, `room:leave failed: ${JSON.stringify(left)}`);
    assert(left?.room?.code === "GLOBAL", `leave should keep GLOBAL room: ${JSON.stringify(left)}`);

    const started = await emitWithAck(c1, "room:start");
    assert(started?.ok === true, `room:start failed: ${JSON.stringify(started)}`);
    await waitFor(() => startedCount >= 2, 4000);

    const hazardAck = await emitWithAck(c1, "player:hazard", { reason: "fall", damage: 12 });
    assert(hazardAck?.ok === true, `player:hazard failed: ${JSON.stringify(hazardAck)}`);
    await waitFor(() => hazardDamageSeen, 4000);

    c2.emit("chat:send", { name: "CheckGuest", text: "smoke-test-chat" });
    await waitFor(() => receivedChatText === "smoke-test-chat", 4000);

    const guestId = c2.id;
    c2.disconnect();
    await waitFor(
      () => latestRoomPlayers.length === 0 || !latestRoomPlayers.some((player) => player.id === guestId),
      5000
    );
  } finally {
    c1?.disconnect();
    c2?.disconnect();
    if (!server.killed) {
      server.kill();
    }
    await sleep(120);
  }
}

async function main() {
  console.log("[verify] syntax checks...");
  await checkSyntax();

  if (!skipBuild) {
    console.log("[verify] production build...");
    const buildResult = await runNpm(["run", "build"]);
    if (buildResult.stdout) {
      process.stdout.write(buildResult.stdout);
    }
    if (buildResult.stderr) {
      process.stderr.write(buildResult.stderr);
    }
  }

  console.log("[verify] weapon smoke...");
  checkWeaponSystem();

  console.log("[verify] voxel smoke...");
  checkVoxelWorld();

  console.log("[verify] socket/lobby/chat smoke...");
  await checkSocketServer();

  console.log("[verify] all checks passed");
}

main().catch((error) => {
  console.error("[verify] failed");
  console.error(String(error?.stack ?? error));
  process.exit(1);
});
