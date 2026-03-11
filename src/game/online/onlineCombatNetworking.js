import { getWeaponDefinition, sanitizeWeaponId } from "../../shared/weaponCatalog.js";

const PVP_HIT_SCORE = 10;
const PVP_KILL_SCORE = 100;
const PVP_IMMUNE_HINT_COOLDOWN_MS = 420;

export function applyNetworkWeaponState(game, weaponState = null) {
  if (!weaponState || typeof weaponState !== "object" || !game?.weapon) {
    return false;
  }

  const nextWeaponId = sanitizeWeaponId(weaponState.weaponId ?? game.selectedWeaponId);
  if (nextWeaponId !== game.selectedWeaponId) {
    game.applySelectedWeapon(nextWeaponId, {
      persist: true,
      syncToServer: false,
      resetAmmo: false,
      announce: false
    });
  }

  return game.weapon.applyState({
    ...weaponState,
    weaponId: nextWeaponId
  });
}

export function emitPvpShot(game, damage = null) {
  if (game?.activeMatchMode !== "online") {
    return;
  }

  const socket = game.chat?.socket;
  if (!socket?.connected || !game.lobbyState.roomCode) {
    return;
  }

  const payload = {};
  const parsedDamage = Math.trunc(Number(damage));
  if (Number.isFinite(parsedDamage) && parsedDamage > 0) {
    payload.damage = parsedDamage;
  }
  socket.emit("pvp:shoot", payload, (response = {}) => {
    applyNetworkWeaponState(game, response.weaponState);
    if (response.ok !== false) {
      return;
    }
    const reason = String(response.reason ?? "");
    if (reason === "empty") {
      const now = game.clock.getElapsedTime();
      if (now - game.lastDryFireAt > 0.22) {
        game.lastDryFireAt = now;
        game.hud.setStatus("탄약 없음", true, 0.55);
        game.sound.play("dry", { rateJitter: 0.08 });
      }
      return;
    }
    if (reason === "reloading") {
      game.hud.setStatus("장전 중...", true, 0.55);
      return;
    }
    if (response.error) {
      game.hud.setStatus(String(response.error), true, 0.55);
    }
  });
}

export function requestWeaponReload(game) {
  if (!game?.buildSystem.isGunMode()) {
    game?.hud.setStatus("장전하려면 총 모드로 전환하세요.", true, 0.75);
    return false;
  }

  if (game.activeMatchMode !== "online") {
    if (game.weapon.startReload()) {
      game.hud.setStatus("장전 중...", true, 0.55);
      return true;
    }
    return false;
  }

  const predicted = game.weapon.startReload();
  if (predicted) {
    game.hud.setStatus("장전 중...", true, 0.55);
  }

  const socket = game.chat?.socket;
  if (!socket?.connected || !game.lobbyState.roomCode) {
    return predicted;
  }

  socket.emit("player:reload", (response = {}) => {
    applyNetworkWeaponState(game, response.weaponState);
    if (response.ok) {
      return;
    }
    if (response.error) {
      game.hud.setStatus(String(response.error), true, 0.55);
    }
  });
  return predicted;
}

export function handlePvpImmune(game, payload = {}) {
  if (game?.activeMatchMode !== "online" || !game.isRunning || game.isGameOver) {
    return;
  }

  const targetId = String(payload?.targetId ?? "");
  if (!targetId) {
    return;
  }

  const now = Date.now();
  if (now < game.pvpImmuneHintUntil) {
    return;
  }
  game.pvpImmuneHintUntil = now + PVP_IMMUNE_HINT_COOLDOWN_MS;
  game.hud.setStatus("대상이 리스폰 보호 중입니다.", true, 0.55);
}

export function handlePvpDamage(game, payload = {}) {
  if (game?.activeMatchMode !== "online") {
    return;
  }

  const attackerId = String(payload.attackerId ?? "");
  const victimId = String(payload.victimId ?? "");
  const damage = Math.max(0, Number(payload.damage ?? 0));
  const killed = Boolean(payload.killed);
  const victimHealth = Number(payload.victimHealth);
  const respawnAt = Number(payload.respawnAt);
  const hazardReason = String(payload.hazardReason ?? "").trim();
  const attackerStreak = Math.max(0, Math.trunc(Number(payload.attackerStreak) || 0));
  const victimStreakLost = Math.max(0, Math.trunc(Number(payload.victimStreakLost) || 0));
  const myId = game.getMySocketId();
  const teamScore = payload?.teamScore ?? null;
  const teamCaptures = payload?.teamCaptures ?? null;
  let lobbyChanged = false;

  if (!myId) {
    return;
  }

  const updateLobbyPlayer = (playerId, updater) => {
    const id = String(playerId ?? "").trim();
    if (!id) {
      return;
    }
    const player = game.lobbyState.players.find((entry) => String(entry?.id ?? "") === id);
    if (!player) {
      return;
    }
    updater(player);
    lobbyChanged = true;
  };

  if (teamScore) {
    const alpha = Number(teamScore.alpha);
    const bravo = Number(teamScore.bravo);
    if (Number.isFinite(alpha)) {
      game.onlineCtf.score.alpha = Math.trunc(alpha);
    }
    if (Number.isFinite(bravo)) {
      game.onlineCtf.score.bravo = Math.trunc(bravo);
    }
  }

  if (teamCaptures) {
    const alpha = Number(teamCaptures.alpha);
    const bravo = Number(teamCaptures.bravo);
    if (Number.isFinite(alpha)) {
      game.onlineCtf.captures.alpha = Math.trunc(alpha);
    }
    if (Number.isFinite(bravo)) {
      game.onlineCtf.captures.bravo = Math.trunc(bravo);
    }
  }

  const attackerKills = Number(payload.attackerKills);
  if (Number.isFinite(attackerKills)) {
    updateLobbyPlayer(attackerId, (player) => {
      player.kills = Math.max(0, Math.trunc(attackerKills));
    });
  }

  if (attackerId && Number.isFinite(attackerStreak)) {
    updateLobbyPlayer(attackerId, (player) => {
      player.killStreak = Math.max(0, Math.trunc(attackerStreak));
    });
  }

  const victimDeaths = Number(payload.victimDeaths);
  if (Number.isFinite(victimDeaths)) {
    updateLobbyPlayer(victimId, (player) => {
      player.deaths = Math.max(0, Math.trunc(victimDeaths));
    });
  }

  updateLobbyPlayer(victimId, (player) => {
    if (killed) {
      player.hp = 0;
      player.respawnAt = Number.isFinite(respawnAt) ? Math.max(0, Math.trunc(respawnAt)) : 0;
      player.killStreak = 0;
      return;
    }

    if (Number.isFinite(victimHealth)) {
      const nextHp = Math.max(0, Math.min(100, Math.trunc(victimHealth)));
      const currentHp = Number.isFinite(player.hp) ? Math.trunc(player.hp) : nextHp;
      player.hp = Math.min(currentHp, nextHp);
    }
    player.respawnAt = 0;
  });

  if (victimId && victimId !== myId) {
    const remoteVictim = game.remotePlayers.get(victimId);
    if (remoteVictim) {
      if (killed) {
        game.setRemoteDowned(remoteVictim, respawnAt);
      } else if (Number.isFinite(victimHealth) && victimHealth > 0) {
        game.clearRemoteDowned(remoteVictim);
      }
    }
  }

  if (attackerId === myId) {
    if (killed) {
      game.state.kills += 1;
      game.state.score += PVP_KILL_SCORE;
      game.hud.pulseHitmarker();
      game.hud.setStatus(`+${PVP_KILL_SCORE} 처치`, false, 0.55);

      game.state.killStreak = Math.max(1, attackerStreak || 1);
      game.state.lastKillTime = game.clock.getElapsedTime();
      game.hud.setKillStreak(game.state.killStreak);
    } else if (damage > 0) {
      game.state.score += PVP_HIT_SCORE;
      game.hud.pulseHitmarker();
    }
  }

  if (victimId === myId) {
    game.hud.flashDamage();

    if (killed) {
      game.state.health = 0;
      game.state.killStreak = 0;
      game.hud.setKillStreak(0);
      game.beginRespawnCountdown(respawnAt);
    } else {
      const fallbackHealth = Math.max(0, game.state.health - damage);
      const nextHealth = Number.isFinite(victimHealth) ? victimHealth : fallbackHealth;
      const clampedServerHealth = Math.max(0, Math.min(100, nextHealth));
      game.state.health = Math.min(game.state.health, clampedServerHealth);
      if (hazardReason === "fall") {
        game.hud.setStatus(`낙하 피해 -${damage}`, true, 0.45);
      } else if (hazardReason === "void") {
        game.hud.setStatus("낙사 피해", true, 0.7);
      } else {
        game.hud.setStatus(`피해 -${damage}`, true, 0.35);
      }
    }
  }

  if (killed) {
    const attackerName = attackerId ? game.getPlayerNameById(attackerId) : "환경";
    const victimName = victimId ? game.getPlayerNameById(victimId) : "플레이어";

    if (attackerId === myId) {
      game.addChatMessage(`${victimName} 처치`, "kill");
      if (attackerStreak >= 3) {
        game.announceGameplayEvent(`${attackerStreak}연속 처치`, {
          alert: false,
          duration: 2.1,
          statusText: `${victimName} 처치. ${attackerStreak}연속 처치 중`,
          logText: `${attackerStreak}연속 처치`,
          statusDuration: 0.75
        });
      }
      if (victimStreakLost >= 3) {
        game.chat?.addSystemMessage(`${victimName}의 ${victimStreakLost}연속 처치를 끊었습니다`, "system");
      }
    } else if (victimId === myId) {
      const deathText =
        hazardReason === "fall" || hazardReason === "void"
          ? "환경 피해로 쓰러졌습니다"
          : `${attackerName}에게 처치당했습니다`;
      game.announceGameplayEvent(deathText, {
        alert: true,
        duration: 2.1,
        statusDuration: 0.72
      });
      if (attackerStreak >= 3 && attackerId) {
        game.announceGameplayEvent(`${attackerName} ${attackerStreak}연속 처치`, {
          alert: true,
          duration: 2.5,
          statusText: `${attackerName}이(가) ${attackerStreak}연속 처치 중입니다`,
          logText: `${attackerName}이(가) ${attackerStreak}연속 처치 중입니다`,
          statusDuration: 0.85
        });
      }
    } else if (attackerStreak >= 3 && attackerId) {
      game.announceGameplayEvent(`${attackerName} ${attackerStreak}연속 처치`, {
        alert: false,
        duration: 1.9,
        statusText: `${attackerName}이(가) ${victimName} 처치`,
        logText: `${attackerName}이(가) ${attackerStreak}연속 처치 중입니다`,
        statusDuration: 0.7
      });
    } else if (victimStreakLost >= 3 && attackerId) {
      game.chat?.addSystemMessage(
        `${attackerName}이(가) ${victimName}의 ${victimStreakLost}연속 처치를 저지했습니다`,
        "system"
      );
    }
  }

  if (lobbyChanged && game.tabBoardVisible) {
    game.renderTabScoreboard();
  }
}

export function pushSelectedWeaponToServer(game, weaponId = game?.selectedWeaponId, { quiet = true } = {}) {
  const safeWeaponId = sanitizeWeaponId(weaponId);
  const socket = game?.chat?.socket;
  if (!socket || !socket.connected || !game.lobbyState.roomCode) {
    return;
  }

  socket.emit("player:set-weapon", { weaponId: safeWeaponId }, (response = {}) => {
    if (!response.ok) {
      const myId = game.chat?.socket?.id ?? "";
      const authoritativeWeaponId = sanitizeWeaponId(
        game.lobbyState.players.find((player) => player.id === myId)?.weaponId ?? game.selectedWeaponId
      );
      game.applySelectedWeapon(authoritativeWeaponId, {
        persist: true,
        syncToServer: false,
        resetAmmo: false,
        announce: false
      });
      applyNetworkWeaponState(game, response.weaponState);
      if (!quiet) {
        game.hud.setStatus(response.error ?? "총기 선택 반영에 실패했습니다.", true, 1);
      }
      return;
    }

    game.applySelectedWeapon(response.weaponId ?? safeWeaponId, {
      persist: true,
      syncToServer: false,
      resetAmmo: false,
      announce: false
    });
    if (response.room) {
      game.setLobbyState(response.room);
    }
    applyNetworkWeaponState(game, response.weaponState);
    if (!quiet) {
      const weapon = getWeaponDefinition(response.weaponId ?? safeWeaponId);
      game.hud.setStatus(`허브 총기 선택: ${weapon.name}`, false, 0.8);
    }
  });
}
