import * as THREE from "three";

function normalizeTeamMode(rawMode = "ally") {
  const mode = String(rawMode ?? "")
    .trim()
    .toLowerCase();
  if (mode === "enemy" || mode === "all") {
    return mode;
  }
  return "ally";
}

function formatTeamModeLabel(teamMode) {
  if (teamMode === "enemy") {
    return "적군";
  }
  if (teamMode === "all") {
    return "전체";
  }
  return "아군";
}

function nameOrFallback(name) {
  const safe = String(name ?? "").trim();
  return safe || "PLAYER";
}

function ensureSpectatorState(game) {
  if (game?.spectatorMode && typeof game.spectatorMode === "object") {
    return game.spectatorMode;
  }

  const fallback = {
    active: false,
    teamMode: "ally",
    targetId: "",
    orbitAngle: 0,
    anchorPosition: new THREE.Vector3(),
    desiredPosition: new THREE.Vector3(),
    desiredLookAt: new THREE.Vector3(),
    initialized: false,
    lastHudKey: ""
  };
  if (game) {
    game.spectatorMode = fallback;
  }
  return fallback;
}

function getLobbyPlayers(game) {
  return Array.isArray(game?.lobbyState?.players) ? game.lobbyState.players : [];
}

function isCandidateAllowed(game, player, teamMode) {
  const myId = String(game?.getMySocketId?.() ?? "");
  const id = String(player?.id ?? "");
  if (!id || id === myId) {
    return false;
  }

  const hp = Number(player?.hp);
  if (Number.isFinite(hp) && hp <= 0) {
    return false;
  }

  const state = player?.state ?? null;
  if (!state || !Number.isFinite(Number(state.x)) || !Number.isFinite(Number(state.z))) {
    return false;
  }

  const myTeam = String(game?.getMyTeam?.() ?? "").trim().toLowerCase();
  const team = String(player?.team ?? "").trim().toLowerCase();
  if (teamMode === "all") {
    return true;
  }
  if (!myTeam || !team) {
    return teamMode === "ally";
  }
  if (teamMode === "enemy") {
    return team !== myTeam;
  }
  return team === myTeam;
}

function getSpectatorCandidates(game, teamMode) {
  const normalizedMode = normalizeTeamMode(teamMode);
  const candidates = getLobbyPlayers(game)
    .filter((player) => isCandidateAllowed(game, player, normalizedMode))
    .sort((a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? "")));

  if (candidates.length > 0 || normalizedMode !== "ally") {
    return candidates;
  }

  return getLobbyPlayers(game)
    .filter((player) => isCandidateAllowed(game, player, "all"))
    .sort((a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? "")));
}

function getSpectatorTargetPose(game, targetId, config) {
  const id = String(targetId ?? "").trim();
  if (!id) {
    return null;
  }

  const remote = game?.remotePlayers?.get?.(id) ?? null;
  if (remote?.hasValidState) {
    const crouched = Boolean(remote.crouched);
    const headHeight = (crouched ? config.playerCrouchHeight : config.playerHeight) + 0.72;
    return {
      found: true,
      position: remote.group.position,
      yaw: Number.isFinite(remote.group?.rotation?.y) ? remote.group.rotation.y : Number(remote.yaw) || 0,
      headHeight,
      crouched,
      player: getLobbyPlayers(game).find((player) => String(player?.id ?? "") === id) ?? null
    };
  }

  const player = getLobbyPlayers(game).find((entry) => String(entry?.id ?? "") === id) ?? null;
  if (!player?.state) {
    return null;
  }

  const state = player.state;
  const crouched = Boolean(state.crouched);
  const playerHeight = crouched ? config.playerCrouchHeight : config.playerHeight;
  return {
    found: true,
    position: new THREE.Vector3(Number(state.x) || 0, (Number(state.y) || 0) - playerHeight, Number(state.z) || 0),
    yaw: Number(state.yaw) || 0,
    headHeight: playerHeight + 0.72,
    crouched,
    player
  };
}

function getSpectatorAnchor(game) {
  const controlPoint = game?.objective?.controlPoint;
  if (controlPoint && Number.isFinite(Number(controlPoint.x)) && Number.isFinite(Number(controlPoint.z))) {
    return controlPoint;
  }

  const alphaBase = game?.objective?.alphaBase;
  const bravoBase = game?.objective?.bravoBase;
  if (alphaBase && bravoBase) {
    return {
      x: ((Number(alphaBase.x) || 0) + (Number(bravoBase.x) || 0)) * 0.5,
      y: ((Number(alphaBase.y) || 0) + (Number(bravoBase.y) || 0)) * 0.5,
      z: ((Number(alphaBase.z) || 0) + (Number(bravoBase.z) || 0)) * 0.5
    };
  }

  return { x: 0, y: 0, z: 0 };
}

function buildSpectatorHudKey(player, teamMode) {
  const name = nameOrFallback(player?.name);
  const team = String(player?.team ?? "").trim().toLowerCase();
  return `${name}|${team}|${teamMode}`;
}

function showSpectatorHud(game, player, teamMode, config) {
  const mode = ensureSpectatorState(game);
  const label = formatTeamModeLabel(teamMode);

  if (!player) {
    const hudKey = `overview|${label}`;
    if (mode.lastHudKey === hudKey) {
      return;
    }
    mode.lastHudKey = hudKey;
    game?.hud?.setStatus?.(`관전 중 | 필터 ${label}`, false, 0.8);
    return;
  }

  const nextKey = buildSpectatorHudKey(player, teamMode);
  if (mode.lastHudKey === nextKey) {
    return;
  }

  mode.lastHudKey = nextKey;
  const teamLabel = config.formatTeamLabel(player.team);
  game?.hud?.setStatus?.(`관전: ${nameOrFallback(player.name)} (${teamLabel}, ${label})`, false, 0.85);
}

function syncSpectatorTargetInternal(game, config, { forceStatus = false } = {}) {
  const mode = ensureSpectatorState(game);
  if (!mode.active) {
    return false;
  }

  const candidates = getSpectatorCandidates(game, mode.teamMode);
  const targetId = String(mode.targetId ?? "");
  const targetStillValid = candidates.some((player) => String(player?.id ?? "") === targetId);
  if (!targetStillValid) {
    mode.targetId = String(candidates[0]?.id ?? "");
    forceStatus = true;
  }

  const targetPlayer =
    candidates.find((player) => String(player?.id ?? "") === String(mode.targetId ?? "")) ?? null;
  if (forceStatus) {
    showSpectatorHud(game, targetPlayer, mode.teamMode, config);
  }
  return Boolean(targetPlayer);
}

export function beginSpectatorMode(game, options = {}, config) {
  const mode = ensureSpectatorState(game);
  mode.active = true;
  mode.teamMode = normalizeTeamMode(options.teamMode ?? mode.teamMode);
  if (options.resetTarget !== false) {
    mode.targetId = "";
  }
  mode.initialized = false;
  mode.orbitAngle = 0;
  syncSpectatorTargetInternal(game, config, { forceStatus: true });
}

export function endSpectatorMode(game) {
  const mode = ensureSpectatorState(game);
  mode.active = false;
  mode.targetId = "";
  mode.initialized = false;
  mode.lastHudKey = "";
}

export function isSpectatorModeActive(game) {
  return Boolean(ensureSpectatorState(game).active);
}

export function cycleSpectatorTarget(game, direction = 1, config) {
  const mode = ensureSpectatorState(game);
  if (!mode.active) {
    return false;
  }

  const candidates = getSpectatorCandidates(game, mode.teamMode);
  if (candidates.length === 0) {
    showSpectatorHud(game, null, mode.teamMode, config);
    return false;
  }

  const currentIndex = candidates.findIndex((player) => String(player?.id ?? "") === String(mode.targetId ?? ""));
  const safeDirection = direction < 0 ? -1 : 1;
  const nextIndex =
    currentIndex >= 0
      ? (currentIndex + safeDirection + candidates.length) % candidates.length
      : safeDirection > 0
        ? 0
        : candidates.length - 1;
  mode.targetId = String(candidates[nextIndex]?.id ?? "");
  showSpectatorHud(game, candidates[nextIndex] ?? null, mode.teamMode, config);
  return true;
}

export function toggleSpectatorTeamMode(game, config) {
  const mode = ensureSpectatorState(game);
  if (!mode.active) {
    return false;
  }

  mode.teamMode = mode.teamMode === "ally" ? "enemy" : mode.teamMode === "enemy" ? "all" : "ally";
  mode.targetId = "";
  syncSpectatorTargetInternal(game, config, { forceStatus: true });
  return true;
}

export function syncSpectatorStateFromLobby(game, config) {
  return syncSpectatorTargetInternal(game, config, { forceStatus: false });
}

export function updateSpectatorCamera(game, delta, config) {
  const mode = ensureSpectatorState(game);
  if (!mode.active) {
    return false;
  }

  syncSpectatorTargetInternal(game, config, { forceStatus: false });
  const targetPose = getSpectatorTargetPose(game, mode.targetId, config);
  if (targetPose?.found) {
    const targetPosition = targetPose.position;
    const yaw = Number(targetPose.yaw) || 0;
    const sideSign = Math.sin(Date.now() * 0.0012) >= 0 ? 1 : -1;
    const desiredY = targetPosition.y + config.followHeight + (targetPose.crouched ? -0.14 : 0);
    mode.desiredLookAt.set(
      targetPosition.x,
      targetPosition.y + targetPose.headHeight * 0.88,
      targetPosition.z
    );
    mode.desiredPosition.set(
      targetPosition.x - Math.sin(yaw) * config.followDistance + Math.cos(yaw) * config.sideOffset * sideSign,
      desiredY,
      targetPosition.z - Math.cos(yaw) * config.followDistance - Math.sin(yaw) * config.sideOffset * sideSign
    );
  } else {
    const anchor = getSpectatorAnchor(game);
    mode.orbitAngle += Math.max(0, Number(delta) || 0) * config.overviewOrbitSpeed;
    mode.anchorPosition.set(Number(anchor.x) || 0, Number(anchor.y) || 0, Number(anchor.z) || 0);
    mode.desiredLookAt.set(
      mode.anchorPosition.x,
      mode.anchorPosition.y + config.overviewLookHeight,
      mode.anchorPosition.z
    );
    mode.desiredPosition.set(
      mode.anchorPosition.x + Math.cos(mode.orbitAngle) * config.overviewRadius,
      mode.anchorPosition.y + config.overviewHeight,
      mode.anchorPosition.z + Math.sin(mode.orbitAngle) * config.overviewRadius * 0.72
    );
  }

  if (!mode.initialized) {
    game.camera.position.copy(mode.desiredPosition);
    mode.initialized = true;
  } else {
    const smooth = THREE.MathUtils.clamp(Math.max(0, Number(delta) || 0) * config.followLerp, 0.08, 0.32);
    game.camera.position.lerp(mode.desiredPosition, smooth);
  }

  game.camera.lookAt(mode.desiredLookAt);
  game.camera.rotation.z = 0;
  return true;
}
