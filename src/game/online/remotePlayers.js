import * as THREE from "three";
import { sanitizeWeaponId } from "../../shared/weaponCatalog.js";

export function createRemoteNameTag(game, name, team, config) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const safeName = String(name ?? "PLAYER").slice(0, 16);
  const teamLabel = config.formatTeamLabel(team);
  const displayName = `[${teamLabel}] ${safeName}`;

  if (ctx) {
    const teamColor = game.getTeamColor(team);
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

export function getSharedRemoteBoxGeometry(game, width, height, depth) {
  const key = `${width}|${height}|${depth}`;
  const cached = game.remoteBoxGeometryCache.get(key);
  if (cached) {
    return cached;
  }
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.userData.sharedRemote = true;
  game.remoteBoxGeometryCache.set(key, geometry);
  return geometry;
}

export function createRemotePlayer(game, player = {}, config) {
  const team = player.team ?? null;
  const weaponId = sanitizeWeaponId(player.weaponId);
  const uniformColor = game.getTeamUniformColor(team);
  const patchColor = game.getTeamColor(team);
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
    const mesh = new THREE.Mesh(getSharedRemoteBoxGeometry(game, w, h, d), material);
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

  const weaponAnchor = game.createRemoteWeaponModel(weaponId, detailMaterial, darkMaterial);
  const nameTag = createRemoteNameTag(game, player.name, team, config);
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
  game.scene.add(group);

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

export function updateRemoteVisual(game, remote, { name, team, weaponId }, config) {
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
  const teamColor = game.getTeamColor(nextTeam);
  remote.bodyMaterial.color.setHex(game.getTeamUniformColor(nextTeam));
  remote.patchMaterial?.color?.setHex(teamColor);
  remote.patchMaterial?.emissive?.setHex(teamColor);
  if (weaponChanged) {
    if (remote.weaponAnchor) {
      remote.group.remove(remote.weaponAnchor);
    }
    remote.weaponAnchor = game.createRemoteWeaponModel(remote.weaponId, remote.detailMaterial, remote.darkMaterial);
    remote.group.add(remote.weaponAnchor);
  }

  if (remote.nameTag) {
    remote.group.remove(remote.nameTag);
    remote.nameTag.material.map?.dispose();
    remote.nameTag.material.dispose();
  }
  remote.nameTag = createRemoteNameTag(game, remote.name, remote.team, config);
  remote.nameTag.position.set(0, 2.72, 0);
  remote.group.add(remote.nameTag);
}

export function ensureRemotePlayer(game, player, config) {
  const id = String(player?.id ?? "");
  if (!id) {
    return null;
  }

  let remote = game.remotePlayers.get(id);
  if (!remote) {
    remote = createRemotePlayer(game, player, config);
    game.remotePlayers.set(id, remote);
  } else {
    updateRemoteVisual(game, remote, player, config);
  }
  return remote;
}

export function removeRemotePlayer(game, id) {
  const key = String(id ?? "");
  if (!key) {
    return;
  }

  const remote = game.remotePlayers.get(key);
  if (!remote) {
    return;
  }

  game.scene.remove(remote.group);
  remote.group.traverse((child) => {
    if (child.isMesh && !child.geometry?.userData?.sharedRemote) {
      child.geometry?.dispose?.();
    }
  });
  remote.nameTag?.material?.map?.dispose?.();
  remote.nameTag?.material?.dispose?.();
  remote.bodyMaterial.dispose();
  remote.headMaterial.dispose();
  remote.darkMaterial?.dispose?.();
  remote.detailMaterial.dispose();
  remote.patchMaterial?.dispose?.();
  game.remotePlayers.delete(key);
}

export function clearRemotePlayers(game) {
  for (const id of game.remotePlayers.keys()) {
    removeRemotePlayer(game, id);
  }
}

export function syncLobbyPlayerStateFromPayload(game, id, patch = {}) {
  const key = String(id ?? "").trim();
  if (!key || !Array.isArray(game.lobbyState.players)) {
    return;
  }

  const lobbyPlayer = game.lobbyState.players.find((entry) => String(entry?.id ?? "") === key);
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

export function applyRemoteState(game, remote, state, snap = false, config) {
  if (!remote || !state) {
    return;
  }
  if (game.isLobby3DActive() && !game.isRunning) {
    return;
  }

  const x = Number(state.x);
  const y = Number(state.y);
  const z = Number(state.z);
  const yaw = Number(state.yaw);
  const crouched = Boolean(state.crouched);
  const remotePlayerHeight = crouched ? config.playerCrouchHeight : config.playerHeight;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return;
  }

  const supportedPlayerY = game.getSupportedPlayerY(x, z, y, {
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
  applyRemoteCrouchPose(remote, crouched);
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

export function applyRemoteCrouchPose(remote, crouched = false) {
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

export function setRemoteDowned(remote, respawnAtRaw = 0) {
  if (!remote) {
    return;
  }
  if (!remote.isDowned) {
    remote.downedStartAt = Date.now();
  }
  remote.isDowned = true;
  remote.downedBlend = Math.max(remote.downedBlend, 0.02);
  const respawnAt = Number(respawnAtRaw);
  remote.respawnAt = Number.isFinite(respawnAt) && respawnAt > 0 ? Math.trunc(respawnAt) : 0;
}

export function clearRemoteDowned(remote) {
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
  applyRemoteCrouchPose(remote, remote.crouched);
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

export function getLobbyRemotePreviewTransform(game, index = 0, config) {
  const safeIndex = Math.max(0, Math.trunc(index));
  let remaining = safeIndex;
  let ring = 0;
  let slots = config.lobbyRemoteRingBaseSlots;
  while (remaining >= slots) {
    remaining -= slots;
    ring += 1;
    slots += 2;
  }

  const angle = (Math.PI * 2 * remaining) / Math.max(1, slots) + ring * 0.28;
  const radius = config.lobbyRemoteRingBaseRadius + ring * config.lobbyRemoteRingStepRadius;
  const x = game.lobby3d.centerX + Math.cos(angle) * radius;
  const z = game.lobby3d.centerZ + Math.sin(angle) * radius;
  const y = game.lobby3d.floorY + config.playerHeight + 0.92 + ring * 0.06;
  const yaw = Math.atan2(game.lobby3d.centerX - x, game.lobby3d.centerZ - z);

  return { x, y, z, yaw };
}

export function applyLobbyRemotePreviewTargets(game, config) {
  if (!game.isLobby3DActive()) {
    return;
  }

  const myId = game.getMySocketId();
  const players = Array.isArray(game.lobbyState.players) ? game.lobbyState.players : [];
  const remoteIds = [];
  for (const player of players) {
    const id = String(player?.id ?? "");
    if (!id || id === myId || !game.remotePlayers.has(id)) {
      continue;
    }
    remoteIds.push(id);
  }

  const signature = remoteIds.join("|");
  if (signature === game.lobby3d.remotePreviewSignature) {
    return;
  }
  game.lobby3d.remotePreviewSignature = signature;

  let previewIndex = 0;
  for (const id of remoteIds) {
    const remote = game.remotePlayers.get(id);
    if (!remote) {
      continue;
    }
    const pose = getLobbyRemotePreviewTransform(game, previewIndex, config);
    remote.hasValidState = true;
    remote.group.visible = true;
    remote.targetPosition.set(pose.x, pose.y - config.playerHeight, pose.z);
    remote.targetYaw = pose.yaw;
    clearRemoteDowned(remote);
    previewIndex += 1;
  }
}

export function syncRemotePlayersFromLobby(game, config) {
  if (game.activeMatchMode !== "online") {
    clearRemotePlayers(game);
    return;
  }

  const myId = game.getMySocketId();
  const players = Array.isArray(game.lobbyState.players) ? game.lobbyState.players : [];
  const liveIds = new Set();

  for (const player of players) {
    const id = String(player?.id ?? "");
    if (!id || id === myId) {
      continue;
    }

    liveIds.add(id);
    const hadRemote = game.remotePlayers.has(id);
    const remote = ensureRemotePlayer(game, player, config);
    if (!remote) {
      continue;
    }
    if (player.state) {
      applyRemoteState(game, remote, player.state, !hadRemote, config);
    } else if (!game.isLobby3DActive()) {
      remote.hasValidState = false;
      remote.group.visible = false;
    }
    const hp = Number(player?.hp);
    if (Number.isFinite(hp) && hp <= 0) {
      setRemoteDowned(remote, player?.respawnAt ?? 0);
    } else {
      clearRemoteDowned(remote);
    }
  }

  for (const id of game.remotePlayers.keys()) {
    if (!liveIds.has(id)) {
      removeRemotePlayer(game, id);
    }
  }
}

export function handleRemotePlayerSync(game, payload = {}, config) {
  const id = String(payload.id ?? "");
  if (!id || id === game.getMySocketId()) {
    return;
  }

  syncLobbyPlayerStateFromPayload(game, id, {
    team: payload.team ?? null,
    weaponId: payload.weaponId ?? null,
    state: payload.state ?? null
  });

  const remote = ensureRemotePlayer(
    game,
    {
      id,
      name: payload.name ?? "PLAYER",
      team: payload.team ?? null,
      weaponId: payload.weaponId ?? null
    },
    config
  );
  if (!remote) {
    return;
  }

  applyRemoteState(game, remote, payload.state, false, config);
}

export function updateRemotePlayers(game, delta, config) {
  if (game.activeMatchMode !== "online") {
    return;
  }
  if (game.remotePlayers.size === 0) {
    game.syncOnlineFlagMeshes();
    return;
  }
  const lobbyPreviewActive = game.isLobby3DActive() && !game.isRunning;
  if (lobbyPreviewActive) {
    applyLobbyRemotePreviewTargets(game, config);
  }

  let effectiveDelta = Math.max(0, Number(delta) || 0);
  if (lobbyPreviewActive) {
    game.lobbyRemotePreviewAccumulator += effectiveDelta;
    if (game.lobbyRemotePreviewAccumulator < config.lobbyRemotePreviewStep) {
      game.syncOnlineFlagMeshes();
      return;
    }
    effectiveDelta = game.lobbyRemotePreviewAccumulator;
    game.lobbyRemotePreviewAccumulator = 0;
  } else {
    game.lobbyRemotePreviewAccumulator = 0;
  }

  const smooth = THREE.MathUtils.clamp(effectiveDelta * 11, 0.08, 0.92);

  for (const remote of game.remotePlayers.values()) {
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
    const yawDiff = Math.atan2(Math.sin(remote.targetYaw - remote.yaw), Math.cos(remote.targetYaw - remote.yaw));
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
      const t = THREE.MathUtils.clamp(elapsed / config.remoteDeathFallMs, 0, 1);
      remote.downedBlend = Math.max(remote.downedBlend, t);
    } else if (remote.downedBlend > 0) {
      remote.downedBlend = Math.max(0, remote.downedBlend - effectiveDelta * 4.8);
    }

    if (remote.downedBlend > 0) {
      remote.group.position.y -= config.remoteDeathOffsetY * remote.downedBlend;
    }
    remote.group.rotation.z = config.remoteDeathRoll * remote.downedBlend;

    const moveSpeed = Math.hypot(remote.group.position.x - prevX, remote.group.position.z - prevZ) / Math.max(effectiveDelta, 1e-5);
    const moveRatio = THREE.MathUtils.clamp(moveSpeed / config.playerSprint, 0, 1);
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
      remote.headPivot.position.y = baseY - 0.36 * crouchBlend + breath * (0.55 + moveRatio * 0.45);
    }
    if (remote.backpack) {
      const breath = Math.sin(remote.walkPhase * 0.5 + remote.yaw + 0.3) * 0.012;
      const baseY = remote.backpackBaseY ?? remote.backpack.position.y;
      remote.backpack.position.y = baseY - 0.26 * crouchBlend + breath * (0.5 + moveRatio * 0.4);
    }
    remote.prevPosition.set(remote.group.position.x, remote.group.position.y, remote.group.position.z);

    game._remoteHead.copy(remote.group.position);
    game._remoteHead.y += (remote.crouched ? config.playerCrouchHeight : config.playerHeight) + 0.72;
    game._toRemote.copy(game._remoteHead).sub(game.camera.position);
    const distance = game._toRemote.length();

    if (remote.nameTag) {
      const hideEnemyName = !lobbyPreviewActive && game.isEnemyTeam(remote.team);
      const hideForDeath = remote.isDowned || remote.downedBlend > 0.2;
      remote.nameTag.visible = !hideForDeath && !hideEnemyName && distance <= config.remoteNameTagDistance;
    }
  }

  if (game.activeMatchMode === "online") {
    game.syncOnlineFlagMeshes();
  }
}
