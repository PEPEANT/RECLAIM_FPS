import { CTF_WIN_SCORE } from "../../shared/matchConfig.js";
import { normalizeOnlineMapId } from "../../shared/onlineMapRotation.js";
import { getWeaponDefinition } from "../../shared/weaponCatalog.js";

export function setupLobbySocket(game, config) {
  const socket = game.chat?.socket;
  if (!socket || game._lobbySocketBound) {
    return;
  }

  game._lobbySocketBound = true;

  socket.on("connect", () => {
    game.syncLobbyNicknameInputs(game.chat?.playerName ?? "", { force: false });
    game.refreshOnlineStatus();
    requestRoomList(game);
    joinDefaultRoom(game, {}, config);
  });

  socket.on("disconnect", () => {
    game._joiningDefaultRoom = false;
    game.refreshOnlineStatus();
    setLobbyState(game, null, config);
    game.renderRoomList([]);
    game.clearRemotePlayers();
  });

  socket.on("room:list", (rooms) => {
    renderRoomList(game, rooms, config);
  });

  socket.on("room:update", (room) => {
    setLobbyState(game, room, config);
    requestRoomList(game);
  });

  socket.on("leaderboard:daily", (payload = {}) => {
    game.applyDailyLeaderboardPayload(payload);
  });

  socket.on("room:snapshot", (payload) => {
    applyRoomSnapshot(game, payload, config);
  });

  socket.on("portal:entered", (payload = {}) => {
    game.handleLobbyPortalEntered(payload);
  });

  socket.on("inventory:update", (payload = {}) => {
    game.applyInventorySnapshot(payload.stock, { quiet: true });
    game.applyNetworkWeaponState(payload.weaponState);
  });

  socket.on("player:sync", (payload) => {
    game.handleRemotePlayerSync(payload);
  });

  socket.on("block:update", (payload) => {
    game.applyRemoteBlockUpdate(payload);
  });

  socket.on("pvp:damage", (payload) => {
    game.handlePvpDamage(payload);
  });

  socket.on("pvp:immune", (payload) => {
    game.handlePvpImmune(payload);
  });

  socket.on("player:correction", (payload) => {
    game.handlePlayerCorrection(payload);
  });

  socket.on("player:respawn", (payload) => {
    game.handlePlayerRespawn(payload);
  });

  socket.on("ctf:update", (payload) => {
    game.applyOnlineStatePayload(payload, { showEvent: true });
  });

  socket.on("match:end", (payload) => {
    game.handleOnlineMatchEnd(payload);
  });

  socket.on("room:started", ({ code, startedAt, mapId }) => {
    if (!code || game.lobbyState.roomCode !== code) {
      return;
    }
    const roundMapId = normalizeOnlineMapId(mapId ?? game.onlineMapId);
    game.onlineMapId = roundMapId;
    if (!game.isRunning || game.activeMatchMode === "online") {
      game.mapId = roundMapId;
    }
    const startedAtNum = Number(startedAt);
    const roundStartedAt = Number.isFinite(startedAtNum) ? Math.max(0, Math.trunc(startedAtNum)) : 0;
    if (roundStartedAt > 0 && game.lastRoomStartedAt > 0 && roundStartedAt <= game.lastRoomStartedAt) {
      return;
    }
    if (roundStartedAt > 0) {
      game.lastRoomStartedAt = roundStartedAt;
    }

    const alreadyRunningOnline =
      game.activeMatchMode === "online" && game.isRunning && !game.onlineRoundEnded;
    game.setOnlineRoundState({
      ended: false,
      winnerTeam: null,
      restartAt: 0,
      targetScore: game.onlineTargetScore,
      announce: false
    });
    if (alreadyRunningOnline) {
      game.hud.setStatus(`온라인 라운드 갱신 (${code})`, false, 0.8);
      requestRoomSnapshot(game, config);
      return;
    }
    const mapMeta = game.getCurrentMapDisplayMeta();
    game.hud.setStatus(`온라인 매치 시작: ${mapMeta.name}`, false, 1);
    game.start({ mode: "online" });
  });

  socket.on("room:error", (message) => {
    const text = String(message ?? "로비 오류");
    game.hud.setStatus(text, true, 1.2);
    if (game.mpStatusEl) {
      game.mpStatusEl.textContent = `로비 오류: ${text}`;
      game.mpStatusEl.dataset.state = "error";
    }
  });

  requestRoomList(game);
  joinDefaultRoom(game, {}, config);
}

export function requestRoomList(game) {
  const socket = game.chat?.socket;
  if (!socket || !socket.connected) {
    game.renderRoomList([]);
    return;
  }
  socket.emit("room:list");
}

export function requestRoomSnapshot(game, config) {
  const socket = game.chat?.socket;
  if (!socket || !socket.connected || !game.lobbyState.roomCode) {
    return;
  }

  socket.emit("room:request-snapshot", (response = {}) => {
    if (!response.ok) {
      return;
    }
    const snapshot = response.snapshot ?? null;
    if (snapshot) {
      applyRoomSnapshot(game, snapshot, config);
    }
  });
}

export function joinDefaultRoom(game, { force = false } = {}, config) {
  const socket = game.chat?.socket;
  if (!socket || !socket.connected) {
    return;
  }

  if (game.lobbyState.roomCode === config.onlineRoomCode) {
    return;
  }

  const now = Date.now();
  if (!force && now < game._nextAutoJoinAt) {
    return;
  }
  if (game._joiningDefaultRoom) {
    return;
  }

  game._joiningDefaultRoom = true;
  socket.emit(
    "room:quick-join",
    {
      name: game.chat?.playerName,
      role: game.onlineEntryRole
    },
    (response = {}) => {
      game._joiningDefaultRoom = false;
      if (!response.ok) {
        game._nextAutoJoinAt = Date.now() + 1800;
        game.hud.setStatus(response.error ?? "온라인 방 참가에 실패했습니다.", true, 1);
        game.refreshOnlineStatus();
        return;
      }
      game._nextAutoJoinAt = 0;
      setLobbyState(game, response.room ?? null, config);
      game.pushSelectedWeaponToServer(game.selectedWeaponId, { quiet: true });
      game.refreshOnlineStatus();
    }
  );
}

export function renderRoomList(game, rooms, config) {
  if (!game.mpRoomListEl) {
    game.syncOnlineHubSummary();
    return;
  }

  const list = Array.isArray(rooms) ? rooms : [];
  const connected = !!game.chat?.isConnected?.();
  if (!connected) {
    game.onlineRoomCount = 0;
    game.mpRoomListEl.innerHTML =
      '<div class="mp-empty">서버 연결을 시도 중입니다. 잠시 후 다시 시도해 주세요.</div>';
    game.syncOnlineHubSummary();
    return;
  }

  const globalRoom =
    list.find((room) => String(room.code ?? "").toUpperCase() === config.onlineRoomCode) ?? list[0] ?? null;
  if (!globalRoom) {
    game.onlineRoomCount = 0;
    game.mpRoomListEl.innerHTML = '<div class="mp-empty">GLOBAL 방 정보를 불러오지 못했습니다.</div>';
    game.syncOnlineHubSummary();
    return;
  }

  const playerCount = Number(globalRoom.count ?? game.lobbyState.players.length ?? 0);
  game.onlineRoomCount = Math.max(0, Math.trunc(playerCount));
  game.mpRoomListEl.innerHTML =
    `<div class="mp-room-row is-single">` +
    `<div class="mp-room-label">${config.onlineRoomCode}  ${playerCount}/${config.onlineMaxPlayers}` +
    `<span class="mp-room-host">24시간 운영</span>` +
    `</div>` +
    `</div>`;
  game.syncOnlineHubSummary();
}

export function setLobbyState(game, room, config) {
  if (!room) {
    game.applyDailyLeaderboardPayload(null);
    game.lobbyState.roomCode = null;
    game.lobbyState.hostId = null;
    game.lobbyState.players = [];
    game.lobbyState.selectedTeam = null;
    game.lobbyState.state = null;
    game.onlineRoomCount = 0;
    game.lastRoomStartedAt = 0;
    game.latestRoomSnapshot = null;
    game.lastAppliedRoomSnapshotKey = "";
    game.onlineMapId = config.onlineMapId;
    game.pendingRemoteBlocks.clear();
    game.clearRemotePlayers();
    game.setOnlineRoundState({
      ended: false,
      winnerTeam: null,
      restartAt: 0,
      targetScore: CTF_WIN_SCORE,
      announce: false
    });
    game.setTabScoreboardVisible(false);
    game.mpLobbyEl?.classList.add("hidden");
    if (game.mpRoomTitleEl) {
      game.mpRoomTitleEl.textContent = "로비";
    }
    if (game.mpRoomSubtitleEl) {
      game.mpRoomSubtitleEl.textContent = "미접속 상태";
    }
    if (game.mpPlayerListEl) {
      game.mpPlayerListEl.innerHTML = '<div class="mp-empty">플레이어를 기다리는 중...</div>';
    }
    game.mpTeamAlphaBtn?.classList.remove("is-active");
    game.mpTeamBravoBtn?.classList.remove("is-active");
    if (game.mpTeamAlphaCountEl) {
      game.mpTeamAlphaCountEl.textContent = "0";
    }
    if (game.mpTeamBravoCountEl) {
      game.mpTeamBravoCountEl.textContent = "0";
    }
    game.refreshOnlineStatus();
    game.updateTeamScoreHud();
    game.updateFlagInteractUi();
    game.syncLobby3DPortalState();
    game.syncLobbyNicknameInputs(game.chat?.playerName ?? "", { force: false });
    game.updateLobbyQuickPanel();
    game.syncOnlineHubSummary();
    return;
  }

  game.lobbyState.roomCode = String(room.code ?? "");
  game.lobbyState.hostId = String(room.hostId ?? "");
  game.lobbyState.players = Array.isArray(room.players) ? room.players : [];
  game.lobbyState.state = room?.state ?? null;
  game.onlineRoomCount = game.lobbyState.players.length;
  const roomMapId = normalizeOnlineMapId(room?.state?.mapId ?? game.onlineMapId);
  game.onlineMapId = roomMapId;
  if (!game.isRunning || game.activeMatchMode === "online") {
    game.mapId = roomMapId;
  }
  game.applyDailyLeaderboardPayload(room.dailyLeaderboard ?? null);

  const myId = game.chat?.socket?.id ?? "";
  const me = game.lobbyState.players.find((player) => player.id === myId) ?? null;
  game.lobbyState.selectedTeam = me?.team ?? null;
  game.applyInventorySnapshot(me?.stock ?? null, { quiet: true });
  if (me?.weaponId) {
    game.applySelectedWeapon(me.weaponId, {
      persist: true,
      syncToServer: false,
      resetAmmo: false,
      announce: false
    });
  }
  if (me?.name) {
    game.chat?.setPlayerName?.(me.name);
    game.syncLobbyNicknameInputs(me.name, { force: false });
  }

  if (game.mpRoomTitleEl) {
    game.mpRoomTitleEl.textContent = `${game.lobbyState.roomCode} (${game.lobbyState.players.length}/${config.onlineMaxPlayers})`;
  }

  if (game.mpPlayerListEl) {
    game.mpPlayerListEl.innerHTML = "";
    for (const player of game.lobbyState.players) {
      const line = document.createElement("div");
      line.className = "mp-player-row";
      if (player.id === myId) {
        line.classList.add("is-self");
      }

      const name = document.createElement("span");
      name.className = "mp-player-name";
      name.textContent = player.name;
      line.appendChild(name);

      if (player.id === myId) {
        const selfTag = document.createElement("span");
        selfTag.className = "mp-tag self-tag";
        selfTag.textContent = "나";
        line.appendChild(selfTag);
      }

      if (player.team) {
        const teamTag = document.createElement("span");
        teamTag.className = `mp-tag team-${String(player.team).toLowerCase()}`;
        teamTag.textContent = config.formatTeamLabel(player.team);
        line.appendChild(teamTag);
      }

      const weaponTag = document.createElement("span");
      weaponTag.className = "mp-tag weapon-tag";
      weaponTag.textContent = getWeaponDefinition(player.weaponId).name;
      line.appendChild(weaponTag);

      if (player.id === game.lobbyState.hostId) {
        const hostTag = document.createElement("span");
        hostTag.className = "mp-tag host-tag";
        hostTag.textContent = "방장";
        line.appendChild(hostTag);
      }

      game.mpPlayerListEl.appendChild(line);
    }

    if (game.lobbyState.players.length === 0) {
      game.mpPlayerListEl.innerHTML = '<div class="mp-empty">플레이어를 기다리는 중...</div>';
    }
  }

  const alphaCount = game.lobbyState.players.filter((player) => player.team === "alpha").length;
  const bravoCount = game.lobbyState.players.filter((player) => player.team === "bravo").length;
  if (game.mpTeamAlphaCountEl) {
    game.mpTeamAlphaCountEl.textContent = `${alphaCount}`;
  }
  if (game.mpTeamBravoCountEl) {
    game.mpTeamBravoCountEl.textContent = `${bravoCount}`;
  }

  if (game.mpRoomSubtitleEl) {
    const mapMeta = game.getCurrentMapDisplayMeta();
    game.mpRoomSubtitleEl.textContent = `${mapMeta.name} | ${game.lobbyState.players.length}/${config.onlineMaxPlayers}`;
  }

  game.mpTeamAlphaBtn?.classList.toggle("is-active", game.lobbyState.selectedTeam === "alpha");
  game.mpTeamBravoBtn?.classList.toggle("is-active", game.lobbyState.selectedTeam === "bravo");
  game.mpLobbyEl?.classList.remove("hidden");
  game.applyOnlineStatePayload(room?.state ?? {}, { showEvent: false });
  game.syncRemotePlayersFromLobby();
  if (game.isLobby3DActive() && !game.isRunning) {
    game.applyLobbyRemotePreviewTargets();
  }
  if (game.tabBoardVisible) {
    game.renderTabScoreboard();
  }
  if (game.activeMatchMode === "online" && game.isRunning) {
    game.emitLocalPlayerSync(config.remoteSyncInterval, true);
  }
  game.updateTeamScoreHud();
  game.updateFlagInteractUi();
  game.refreshOnlineStatus();
  game.syncLobby3DPortalState();
  game.updateLobbyQuickPanel();
  game.syncOnlineHubSummary();
}

export function applyRoomSnapshot(game, payload = {}, config) {
  game.applyDailyLeaderboardPayload(payload.dailyLeaderboard ?? null);
  const incomingMapId = normalizeOnlineMapId(
    payload.mapId ?? payload.state?.mapId ?? game.lobbyState.state?.mapId ?? game.onlineMapId
  );
  game.onlineMapId = incomingMapId;
  if (!game.isRunning || game.activeMatchMode === "online") {
    game.mapId = incomingMapId;
  }
  const roundStartedAt = Math.max(0, Number(payload.round?.startedAt ?? 0) || 0);
  const roundEnded = Boolean(payload.round?.ended);
  const snapshotRevision = Math.max(0, Math.trunc(Number(payload.revision) || 0));
  const snapshotUpdatedAt = Math.max(0, Math.trunc(Number(payload.updatedAt) || 0));
  const blocks = Array.isArray(payload.blocks) ? payload.blocks : null;
  const snapshotKey = `${incomingMapId}|${snapshotRevision}|${snapshotUpdatedAt}|${roundStartedAt}|${blocks?.length ?? -1}`;
  if (roundStartedAt > 0) {
    game.lastRoomStartedAt = Math.max(game.lastRoomStartedAt, roundStartedAt);
  }
  if (roundStartedAt > 0 && !roundEnded && (!game.isRunning || game.activeMatchMode !== "online")) {
    game.start({ mode: "online" });
    return;
  }
  if (payload.weaponId) {
    game.applySelectedWeapon(payload.weaponId, {
      persist: true,
      syncToServer: false,
      resetAmmo: false,
      announce: false
    });
  }
  if (payload.weaponState) {
    game.applyNetworkWeaponState(payload.weaponState);
  }
  if (snapshotKey === game.lastAppliedRoomSnapshotKey) {
    game.latestRoomSnapshot = payload;
    game.applyInventorySnapshot(payload.stock, { quiet: true });
    game.applyOnlineStatePayload(payload, { showEvent: false });
    return;
  }
  game.lastAppliedRoomSnapshotKey = snapshotKey;
  game.latestRoomSnapshot = payload;
  game.resetDynamicBlockState(blocks ?? []);
  if (!blocks) {
    return;
  }
  const shouldApplyOnlineWorld = game.activeMatchMode === "online" && game.isRunning;
  if (!shouldApplyOnlineWorld) {
    return;
  }
  game.applyInventorySnapshot(payload.stock, { quiet: true });
  game.applyNetworkWeaponState(payload.weaponState);

  game.mapId = incomingMapId;
  game.voxelWorld.generateTerrain({ mapId: game.mapId });
  for (const entry of blocks) {
    const update = game.normalizeDynamicBlockUpdate(entry);
    if (!update) {
      continue;
    }
    if (update.action === "place") {
      game.voxelWorld.setBlock(update.x, update.y, update.z, update.typeId);
    } else {
      game.voxelWorld.removeBlock(update.x, update.y, update.z);
    }
  }
  game.pendingRemoteBlocks.clear();
  game.setupObjectives();
  game.applyOnlineStatePayload(payload, { showEvent: false });

  if (game.activeMatchMode === "online" && game.isRunning) {
    if (game.isPlayerCollidingAt(game.playerPosition.x, game.playerPosition.y, game.playerPosition.z)) {
      game.setOnlineSpawnFromLobby();
    }
    game.emitLocalPlayerSync(config.remoteSyncInterval, true);
  }
}
