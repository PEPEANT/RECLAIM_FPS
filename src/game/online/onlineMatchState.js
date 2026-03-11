import { DEFAULT_GAME_MODE, GAME_MODE, normalizeGameMode } from "../../shared/gameModes.js";
import { PVP_RESPAWN_MS } from "../../shared/matchConfig.js";

export function setOnlineRoundState(
  game,
  {
    ended = false,
    winnerTeam = null,
    restartAt = 0,
    targetScore = game.onlineTargetScore,
    announce = false
  } = {},
  config
) {
  const normalizedWinner = config.normalizeTeamId(winnerTeam);
  const nextEnded = Boolean(ended);
  const nextRestartAt =
    Number.isFinite(Number(restartAt)) && Number(restartAt) > 0 ? Math.trunc(Number(restartAt)) : 0;

  if (Number.isFinite(Number(targetScore)) && Number(targetScore) > 0) {
    game.onlineTargetScore = Math.trunc(Number(targetScore));
  }

  const changed =
    game.onlineRoundEnded !== nextEnded ||
    game.onlineRoundWinnerTeam !== normalizedWinner ||
    game.onlineRoundRestartAt !== nextRestartAt;

  game.onlineRoundEnded = nextEnded;
  game.onlineRoundWinnerTeam = normalizedWinner;
  game.onlineRoundRestartAt = nextRestartAt;
  if (!nextEnded) {
    game.onlineRoundLastSecond = -1;
    return;
  }

  if (changed || announce) {
    const winnerLabel = config.formatTeamLabel(normalizedWinner);
    const remainSec =
      nextRestartAt > Date.now() ? Math.max(1, Math.ceil((nextRestartAt - Date.now()) / 1000)) : 1;
    const nextMapMeta = game.getNextOnlineMapDisplayMeta();
    const statusText = `${winnerLabel} 승리! ${remainSec}초 후 ${nextMapMeta.name} 전장으로 이동합니다`;
    game.hud.setStatus(statusText, false, 1.0);
    if (announce) {
      game.chat?.addSystemMessage(statusText, "system");
    }
    game.onlineRoundLastSecond = remainSec;
  }
}

export function updateOnlineRoundCountdown(game, config) {
  if (!game.onlineRoundEnded) {
    return;
  }
  const remainMs = game.onlineRoundRestartAt - Date.now();
  const remainSec = remainMs > 0 ? Math.max(1, Math.ceil(remainMs / 1000)) : 0;
  if (remainSec === game.onlineRoundLastSecond) {
    return;
  }
  game.onlineRoundLastSecond = remainSec;
  const winnerLabel = config.formatTeamLabel(game.onlineRoundWinnerTeam);
  const nextMapMeta = game.getNextOnlineMapDisplayMeta();
  const statusText =
    remainSec > 0
      ? `${winnerLabel} 승리! ${remainSec}초 후 ${nextMapMeta.name} 전장으로 이동합니다`
      : `${nextMapMeta.name} 전장으로 이동 중...`;
  game.hud.setStatus(statusText, false, 0.95);
}

export function showOnlineCtfEvent(game, event = {}, config) {
  const type = String(event.type ?? "").trim();
  if (!type) {
    return;
  }

  const byPlayerId = String(event.byPlayerId ?? "");
  const byName = game.getPlayerNameById(byPlayerId);
  const byTeam = config.normalizeTeamId(event.byTeam);
  const flagTeam = config.normalizeTeamId(event.flagTeam);
  const myTeam = config.normalizeTeamId(game.getMyTeam());
  const isMine = byPlayerId && byPlayerId === game.getMySocketId();

  if (type === "pickup") {
    const flagLabel = config.formatTeamLabel(flagTeam);
    const isFriendlyCarrier = myTeam && byTeam && myTeam === byTeam;
    const isFriendlyFlagLost = myTeam && flagTeam && myTeam === flagTeam && byTeam !== myTeam;
    if (isMine) {
      game.announceGameplayEvent("적 깃발 확보", {
        alert: false,
        duration: 2.5,
        statusText: "적 깃발 탈취 성공! 아군 거점으로 복귀하세요"
      });
    } else if (isFriendlyFlagLost) {
      game.announceGameplayEvent(`${flagLabel} 깃발 탈취당함`, {
        alert: true,
        duration: 2.7,
        statusText: `${byName}이(가) ${flagLabel} 깃발을 탈취했습니다`
      });
    } else if (isFriendlyCarrier) {
      game.announceGameplayEvent(`${byName}이(가) 적 깃발 확보`, {
        alert: false,
        duration: 2.4,
        statusText: `${byName}이(가) ${flagLabel} 깃발을 탈취했습니다`
      });
    } else {
      game.announceGameplayEvent(`${byName}이(가) ${flagLabel} 깃발 탈취`, {
        alert: false,
        duration: 2.2
      });
    }
    return;
  }

  if (type === "capture") {
    const isFriendlyScore = myTeam && byTeam && myTeam === byTeam;
    const teamScore = Number(event.teamScore);
    const scoreSuffix = Number.isFinite(teamScore) && teamScore > 0 ? ` (${teamScore}점)` : "";
    if (isMine) {
      game.announceGameplayEvent(`깃발 반납 성공${scoreSuffix}`, {
        alert: false,
        duration: 2.6,
        statusText: `깃발 점수 +1 획득${scoreSuffix}`
      });
    } else if (isFriendlyScore) {
      game.announceGameplayEvent(`${byName}이(가) 점수 +1 확보`, {
        alert: false,
        duration: 2.5,
        statusText: `${byName}이(가) 아군 기지에 깃발을 가져왔습니다${scoreSuffix}`
      });
    } else {
      game.announceGameplayEvent("적 팀이 깃발 점수를 획득했습니다", {
        alert: true,
        duration: 2.7,
        statusText: `${byName}이(가) 깃발 점수 +1 획득${scoreSuffix}`
      });
    }
    return;
  }

  if (type === "reset") {
    const isFriendlyFlag = myTeam && flagTeam && myTeam === flagTeam;
    const text = isFriendlyFlag
      ? `${config.formatTeamLabel(flagTeam)} 깃발이 기지로 복귀했습니다`
      : "깃발이 원래 위치로 복귀했습니다";
    game.announceGameplayEvent(text, {
      alert: false,
      duration: 1.8,
      statusDuration: 0.85
    });
    return;
  }

  if (type === "start") {
    game.announceGameplayEvent("깃발전 시작", {
      alert: false,
      duration: 1.9,
      statusText: "깃발전 시작: 적 기지 깃발을 탈취하세요"
    });
    return;
  }

  if (type === "match_end") {
    const winner = config.formatTeamLabel(config.normalizeTeamId(event.winnerTeam));
    game.announceGameplayEvent(`${winner} 팀 승리`, {
      alert: false,
      duration: 2.3,
      statusDuration: 1.1
    });
  }
}

export function applyOnlineStatePayload(game, payload = {}, { showEvent = false } = {}, config) {
  game.onlineCtf.mode = normalizeGameMode(payload?.mode ?? game.onlineCtf.mode ?? DEFAULT_GAME_MODE);
  if (Number.isFinite(Number(payload?.targetScore)) && Number(payload.targetScore) > 0) {
    game.onlineTargetScore = Math.trunc(Number(payload.targetScore));
  }

  const revision = Number(payload.revision);
  if (Number.isFinite(revision)) {
    game.onlineCtf.revision = Math.max(game.onlineCtf.revision, Math.trunc(revision));
  }

  const readCoord = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const flagsPayload = payload?.flags && typeof payload.flags === "object" ? payload.flags : null;
  const legacyCenterFlagPayload = !flagsPayload && payload?.flag && typeof payload.flag === "object" ? payload.flag : null;
  const readFlagPayload = (team) => {
    if (flagsPayload) {
      return flagsPayload[team] ?? null;
    }
    return legacyCenterFlagPayload;
  };

  for (const team of ["alpha", "bravo"]) {
    const target = game.onlineCtf.flags[team];
    const homeFallback = team === "alpha" ? game.objective.alphaFlagHome : game.objective.bravoFlagHome;
    const flagPayload = readFlagPayload(team);

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
  }

  const scoreAlpha = Number(payload?.score?.alpha);
  const scoreBravo = Number(payload?.score?.bravo);
  if (Number.isFinite(scoreAlpha)) {
    game.onlineCtf.score.alpha = Math.trunc(scoreAlpha);
  }
  if (Number.isFinite(scoreBravo)) {
    game.onlineCtf.score.bravo = Math.trunc(scoreBravo);
  }

  const capAlpha = Number(payload?.captures?.alpha);
  const capBravo = Number(payload?.captures?.bravo);
  if (Number.isFinite(capAlpha)) {
    game.onlineCtf.captures.alpha = Math.trunc(capAlpha);
  }
  if (Number.isFinite(capBravo)) {
    game.onlineCtf.captures.bravo = Math.trunc(capBravo);
  }

  const roundPayload = payload?.round ?? null;
  setOnlineRoundState(
    game,
    {
      ended: Boolean(roundPayload?.ended),
      winnerTeam: roundPayload?.winnerTeam ?? null,
      restartAt: roundPayload?.restartAt ?? 0,
      targetScore: payload?.targetScore ?? game.onlineTargetScore,
      announce: false
    },
    config
  );

  if (game.activeMatchMode === "online") {
    const myTeam = config.normalizeTeamId(game.getMyTeam());
    if (myTeam) {
      game.state.captures = Number(game.onlineCtf.captures[myTeam] ?? 0);
    }
    game.state.objectiveText = game.getOnlineObjectiveText();
  }

  game.syncOnlineFlagMeshes();
  game.updateTeamScoreHud();
  if (game.tabBoardVisible) {
    game.renderTabScoreboard();
  }

  if (showEvent) {
    showOnlineCtfEvent(game, payload?.event ?? null, config);
  }
}

export function handleOnlineMatchEnd(game, payload = {}, config) {
  if (game.activeMatchMode !== "online") {
    return;
  }

  const winnerTeam = config.normalizeTeamId(payload?.winnerTeam);
  const restartAt = Number(payload?.restartAt);
  const targetScore = Number(payload?.targetScore);
  setOnlineRoundState(
    game,
    {
      ended: true,
      winnerTeam,
      restartAt,
      targetScore,
      announce: true
    },
    config
  );
  game.leftMouseDown = false;
  game.rightMouseAiming = false;
  game.isAiming = false;
  game.handlePrimaryActionUp();
}

export function beginRespawnCountdown(game, respawnAtRaw = null) {
  const parsedRespawnAt = Number(respawnAtRaw);
  game.isRespawning = true;
  game.respawnEndAt =
    Number.isFinite(parsedRespawnAt) && parsedRespawnAt > Date.now()
      ? parsedRespawnAt
      : Date.now() + PVP_RESPAWN_MS;
  game.respawnLastSecond = -1;
  game.localDeathAnimStartAt = Date.now();
  game.localDeathAnimBlend = 0;
  game.leftMouseDown = false;
  game.rightMouseAiming = false;
  game.isAiming = false;
  game.handlePrimaryActionUp();

  const initialSeconds = Math.max(1, Math.ceil((game.respawnEndAt - Date.now()) / 1000));
  const message = `사망 - ${initialSeconds}초 후 부활합니다`;
  game.setRespawnBanner(message, true);
  game.hud.setStatus(message, true, 1.0);
}

export function updateRespawnCountdown(game) {
  if (!game.isRespawning) {
    game.setRespawnBanner("", false);
    return;
  }

  const remainingMs = game.respawnEndAt - Date.now();
  if (remainingMs <= 0) {
    if (game.respawnLastSecond !== 0) {
      game.respawnLastSecond = 0;
      game.setRespawnBanner("곧 부활합니다...", true);
      game.hud.setStatus("부활 중...", true, 0.5);
    }
    return;
  }

  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  if (seconds === game.respawnLastSecond) {
    return;
  }
  game.respawnLastSecond = seconds;
  const message = `사망 - ${seconds}초 후 부활합니다`;
  game.setRespawnBanner(message, true);
  game.hud.setStatus(message, true, 1.0);
}

export function handlePlayerRespawn(game, payload = {}, config) {
  if (game.activeMatchMode !== "online") {
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
  const myId = game.getMySocketId();

  game.syncLobbyPlayerStateFromPayload(id, {
    state,
    hp,
    respawnAt: 0,
    spawnShieldUntil
  });

  if (id === myId) {
    game.applyNetworkWeaponState(payload.weaponState);
    game.state.health = hp;
    game.state.killStreak = 0;
    game.hud.setKillStreak(0);
    game.isRespawning = false;
    game.respawnEndAt = 0;
    game.respawnLastSecond = -1;
    game.localDeathAnimStartAt = 0;
    game.localDeathAnimBlend = 0;
    game.setRespawnBanner("", false);

    const x = Number(state?.x);
    const y = Number(state?.y);
    const z = Number(state?.z);
    const yaw = Number(state?.yaw);
    const pitch = Number(state?.pitch);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      const safeSpawn = game.findSafeSpawnPlacement(x, z, y);
      if (safeSpawn) {
        game.applySpawnPlacement(safeSpawn, {
          yaw: Number.isFinite(yaw) ? yaw : game.yaw,
          pitch: Number.isFinite(pitch) ? pitch : 0
        });
      } else {
        game.applySpawnPlacement(
          { x, y, z },
          {
            yaw: Number.isFinite(yaw) ? yaw : game.yaw,
            pitch: Number.isFinite(pitch) ? pitch : 0
          }
        );
      }
      if (game.isPlayerCollidingAt(game.playerPosition.x, game.playerPosition.y, game.playerPosition.z)) {
        game.setOnlineSpawnFromLobby();
      }
    } else {
      game.setOnlineSpawnFromLobby();
    }
    if (Number.isFinite(spawnShieldUntil) && spawnShieldUntil > Date.now()) {
      const shieldSeconds = Math.max(1, Math.ceil((spawnShieldUntil - Date.now()) / 1000));
      game.hud.setStatus(`부활 완료 - ${shieldSeconds}초 보호`, false, 1.1);
    } else {
      game.hud.setStatus("부활 완료", false, 0.8);
    }
    game.emitLocalPlayerSync(config.remoteSyncInterval, true);
    return;
  }

  const lobbyPlayer =
    game.lobbyState.players.find((player) => String(player?.id ?? "") === id) ?? {
      id,
      name: "PLAYER",
      team: null
    };
  const remote = game.ensureRemotePlayer(lobbyPlayer);
  if (remote && state) {
    game.applyRemoteState(remote, state, true);
    game.clearRemoteDowned(remote);
  }
}

export function isOnlineCtfMode(game) {
  return normalizeGameMode(game.onlineCtf.mode) === GAME_MODE.CTF;
}
