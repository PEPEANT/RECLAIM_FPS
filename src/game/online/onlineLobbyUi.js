export function syncOnlineHubSummary(game, config) {
  const { connected, connecting, retrying } = game.getOnlineConnectionUiState();
  const inRoom = !!game.lobbyState.roomCode;
  const roomCount = Math.max(
    0,
    Math.trunc(Number(inRoom ? game.lobbyState.players.length : game.onlineRoomCount) || 0)
  );
  const roomName = inRoom ? game.lobbyState.roomCode : config.onlineRoomCode;
  const mapMeta = game.getCurrentMapDisplayMeta();

  if (game.mpActiveRoomNameEl) {
    game.mpActiveRoomNameEl.textContent = roomName || config.onlineRoomCode;
  }
  if (game.mpActiveRoomStateEl) {
    let text = "오프라인";
    let state = "offline";
    if (connected && inRoom) {
      text = `${roomCount}/${config.onlineMaxPlayers} 활성`;
      state = "online";
    } else if (connected) {
      text = "자동 참가 중";
      state = "online";
    } else if (connecting) {
      text = retrying ? "재시도 중" : "연결 중";
      state = "offline";
    }
    game.mpActiveRoomStateEl.textContent = text;
    game.mpActiveRoomStateEl.dataset.state = state;
  }
  if (game.mpActiveMapNameEl) {
    game.mpActiveMapNameEl.textContent = mapMeta.name;
  }
  if (game.mpActiveMapDescEl) {
    game.mpActiveMapDescEl.textContent = connected
      ? `${mapMeta.description} · ${roomCount}/${config.onlineMaxPlayers} 접속`
      : connecting && retrying
        ? `${mapMeta.description} · 서버 재연결 시도 중`
        : connecting
          ? `${mapMeta.description} · 서버 연결 중`
          : `${mapMeta.description} · 서버 오프라인`;
  }
}

export function setTabScoreboardVisible(game, visible, config) {
  const show = Boolean(
    visible &&
      game.tabScoreboardEl &&
      game.activeMatchMode === "online" &&
      (game.isRunning || game.isLobby3DActive()) &&
      !game.isGameOver
  );
  game.tabBoardVisible = show;
  if (game.mobileTabBtn) {
    game.mobileTabBtn.classList.toggle("is-active", show);
    game.mobileTabBtn.setAttribute("aria-pressed", show ? "true" : "false");
  }
  if (!game.tabScoreboardEl) {
    return;
  }
  game.tabScoreboardEl.classList.toggle("show", show);
  game.tabScoreboardEl.setAttribute("aria-hidden", show ? "false" : "true");
  if (show) {
    renderTabScoreboard(game, config);
  }
}

export function renderTabScoreboard(game, config) {
  if (!game.tabAlphaListEl || !game.tabBravoListEl) {
    return;
  }

  const players = Array.isArray(game.lobbyState.players) ? game.lobbyState.players : [];
  const myId = game.getMySocketId();
  const teamOrder = ["alpha", "bravo"];
  const teamScore = game.onlineCtf?.score ?? { alpha: 0, bravo: 0 };

  for (const team of teamOrder) {
    const listEl = team === "alpha" ? game.tabAlphaListEl : game.tabBravoListEl;
    const countEl = team === "alpha" ? game.tabAlphaCountEl : game.tabBravoCountEl;
    const scoreValue = Number(teamScore?.[team] ?? 0);
    const teamPlayers = players
      .filter((player) => config.normalizeTeamId(player?.team) === team)
      .sort((a, b) => {
        const capturesA = Number(a?.captures ?? 0);
        const capturesB = Number(b?.captures ?? 0);
        if (capturesA !== capturesB) {
          return capturesB - capturesA;
        }
        const killsA = Number(a?.kills ?? 0);
        const killsB = Number(b?.kills ?? 0);
        if (killsA !== killsB) {
          return killsB - killsA;
        }
        const deathsA = Number(a?.deaths ?? 0);
        const deathsB = Number(b?.deaths ?? 0);
        if (deathsA !== deathsB) {
          return deathsA - deathsB;
        }
        return String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
      });

    if (countEl) {
      countEl.textContent = `${Number.isFinite(scoreValue) ? Math.trunc(scoreValue) : 0}점 · ${teamPlayers.length}명`;
    }

    listEl.innerHTML = "";
    if (teamPlayers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tab-player-empty";
      empty.textContent = "대기 중";
      listEl.appendChild(empty);
      continue;
    }

    for (const player of teamPlayers) {
      const row = document.createElement("div");
      row.className = "tab-player-row";
      if (String(player?.id ?? "") === myId) {
        row.classList.add("is-self");
      }

      const name = document.createElement("span");
      name.className = "tab-player-name";
      name.textContent = String(player?.name ?? "PLAYER");
      row.appendChild(name);

      const meta = document.createElement("span");
      meta.className = "tab-player-meta";
      const kills = Math.max(0, Math.trunc(Number(player?.kills ?? 0)));
      const deaths = Math.max(0, Math.trunc(Number(player?.deaths ?? 0)));
      const captures = Math.max(0, Math.trunc(Number(player?.captures ?? 0)));
      meta.textContent =
        String(player?.id ?? "") === myId
          ? `K ${kills} / D ${deaths} / C ${captures} | YOU`
          : `K ${kills} / D ${deaths} / C ${captures}`;
      row.appendChild(meta);

      listEl.appendChild(row);
    }
  }
}

export function updateTeamScoreHud(game) {
  if (!game.ctfScoreboardEl || !game.ctfScoreAlphaEl || !game.ctfScoreBravoEl) {
    return;
  }

  const show = game.activeMatchMode === "online" && game.isRunning && !game.isGameOver;
  if (game.scoreHudState.show !== show) {
    game.ctfScoreboardEl.classList.toggle("show", show);
    game.ctfScoreboardEl.setAttribute("aria-hidden", show ? "false" : "true");
    game.scoreHudState.show = show;
  }
  if (!show) {
    return;
  }

  const alpha = Math.max(0, Math.trunc(Number(game.onlineCtf?.score?.alpha ?? 0)));
  const bravo = Math.max(0, Math.trunc(Number(game.onlineCtf?.score?.bravo ?? 0)));
  if (game.scoreHudState.alpha !== alpha) {
    game.ctfScoreAlphaEl.textContent = String(alpha);
    game.scoreHudState.alpha = alpha;
  }
  if (game.scoreHudState.bravo !== bravo) {
    game.ctfScoreBravoEl.textContent = String(bravo);
    game.scoreHudState.bravo = bravo;
  }
}

export function updateFlagInteractUi(game) {
  if (!game.flagInteractBtnEl) {
    return;
  }

  const showFlagInteractButton = game.canLocalPickupCenterFlag();
  const show = showFlagInteractButton;
  const nextMode = showFlagInteractButton ? "flag" : "none";
  if (show === game.flagInteractVisible && nextMode === game.flagInteractMode) {
    return;
  }

  game.flagInteractVisible = show;
  game.flagInteractMode = nextMode;
  game.flagInteractBtnEl.textContent = "깃발 탈취";
  game.flagInteractBtnEl.classList.toggle("show", show);
  game.flagInteractBtnEl.setAttribute("aria-hidden", show ? "false" : "true");
}

export function updateLobbyQuickPanel(game, config) {
  if (!game.lobbyQuickPanelEl) {
    return;
  }
  const show = false;
  if (game._lastLobbyQuickPanelVisible !== show) {
    game.lobbyQuickPanelEl.classList.toggle("show", show);
    game.lobbyQuickPanelEl.setAttribute("aria-hidden", show ? "false" : "true");
    game._lastLobbyQuickPanelVisible = show;
  }
  if (!show) {
    return;
  }

  const connected = !!game.chat?.isConnected?.();
  const inRoom = Boolean(game.lobbyState.roomCode);
  const players = Array.isArray(game.lobbyState.players) ? game.lobbyState.players : [];
  const count = players.length;
  const alphaCount = players.filter((player) => player?.team === "alpha").length;
  const bravoCount = players.filter((player) => player?.team === "bravo").length;

  if (game.lobbyQuickCountEl) {
    let nextText = "";
    if (!connected) {
      nextText = "서버 연결 중...";
    } else if (!inRoom) {
      nextText = `${config.onlineRoomCode} 자동 참가 중...`;
    } else {
      nextText = `대기 인원 ${count}/${config.onlineMaxPlayers} | 블루 ${alphaCount} 레드 ${bravoCount} | TAB 순위`;
    }
    if (nextText !== game._lastLobbyQuickCountText) {
      game.lobbyQuickCountEl.textContent = nextText;
      game._lastLobbyQuickCountText = nextText;
    }
  }

  if (game.lobbyQuickGuideEl) {
    let guideText = "";
    if (!connected) {
      guideText = "연결 후 포탈(훈련장/온라인 허브/시뮬라크 월드) 사용 가능";
    } else if (!inRoom) {
      guideText = `${config.onlineRoomCode} 참가 대기 중 · 이동 WASD · 순위 TAB · 채팅 T/Enter`;
    } else {
      guideText = "포탈 4개 사용 가능 · 닉네임 변경 가능 · 순위 TAB";
    }
    if (guideText !== game._lastLobbyQuickGuideText) {
      game.lobbyQuickGuideEl.textContent = guideText;
      game._lastLobbyQuickGuideText = guideText;
    }
  }

  if (game.lobbyQuickRankListEl) {
    const myName = String(game.chat?.playerName ?? "").trim().toLowerCase();
    const rankMode = connected && inRoom ? "live" : connected ? "queue" : "offline";
    const ranked = game.getDailyLeaderboardRows(6);
    const rankPayload = ranked
      .map((entry) => {
        const name = String(entry?.name ?? "PLAYER");
        const captures = Math.max(0, Math.trunc(Number(entry?.captures ?? 0)));
        const kills = Math.max(0, Math.trunc(Number(entry?.kills ?? 0)));
        const deaths = Math.max(0, Math.trunc(Number(entry?.deaths ?? 0)));
        const rank = Math.max(1, Math.trunc(Number(entry?.rank ?? 0) || 0));
        return `${rank}:${name}:${captures}:${kills}:${deaths}`;
      })
      .join("|");
    const rankSignature = `${rankMode}|${rankPayload}`;
    if (rankSignature !== game._lastLobbyQuickRankSignature) {
      game.lobbyQuickRankListEl.innerHTML = "";
      if (rankMode !== "live") {
        const emptyEl = document.createElement("div");
        emptyEl.className = "lobby-quick-rank-empty";
        emptyEl.textContent =
          rankMode === "offline" ? "서버 연결 후 순위가 표시됩니다." : `${config.onlineRoomCode} 참가 후 순위가 표시됩니다.`;
        game.lobbyQuickRankListEl.appendChild(emptyEl);
      } else if (ranked.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "lobby-quick-rank-empty";
        emptyEl.textContent = "순위 데이터 대기 중...";
        game.lobbyQuickRankListEl.appendChild(emptyEl);
      } else {
        ranked.forEach((entry, index) => {
          const row = document.createElement("div");
          row.className = "lobby-quick-rank-row";
          const rowName = String(entry?.name ?? "").trim().toLowerCase();
          if (rowName && myName && rowName === myName) {
            row.classList.add("is-self");
          }

          const posEl = document.createElement("span");
          posEl.className = "rank-pos";
          const rank = Math.max(1, Math.trunc(Number(entry?.rank ?? index + 1)));
          posEl.textContent = `${rank}.`;
          row.appendChild(posEl);

          const nameEl = document.createElement("span");
          nameEl.className = "rank-name";
          nameEl.textContent = String(entry?.name ?? "PLAYER");
          row.appendChild(nameEl);

          const captures = Math.max(0, Math.trunc(Number(entry?.captures ?? 0)));
          const kills = Math.max(0, Math.trunc(Number(entry?.kills ?? 0)));
          const deaths = Math.max(0, Math.trunc(Number(entry?.deaths ?? 0)));
          const metaEl = document.createElement("span");
          metaEl.className = "rank-meta";
          metaEl.textContent = `C${captures} K${kills} D${deaths}`;
          row.appendChild(metaEl);

          game.lobbyQuickRankListEl.appendChild(row);
        });
      }
      game._lastLobbyQuickRankSignature = rankSignature;
    }
  }
}

export function updateLobbyControls(game, config) {
  const { connected, connecting, retrying } = game.getOnlineConnectionUiState();
  const inRoom = !!game.lobbyState.roomCode;
  const in3dLobby = game.isLobby3DActive();
  const canUseHostControls = game.canUseHostControls();
  const canStart = connected && inRoom;
  const hostPanelVisible = canUseHostControls && game.menuMode === "online";
  syncOnlineHubSummary(game, config);

  if (game.mpCreateBtn) {
    game.mpCreateBtn.disabled = true;
    game.mpCreateBtn.classList.add("hidden");
  }
  if (game.mpNameInput) {
    game.mpNameInput.disabled = false;
    game.mpNameInput.readOnly = false;
    game.mpNameInput.title = "";
  }
  if (game.lobbyQuickNameInput) {
    game.lobbyQuickNameInput.disabled = false;
    game.lobbyQuickNameInput.readOnly = false;
  }
  if (game.lobbyQuickNameSaveBtn) {
    game.lobbyQuickNameSaveBtn.disabled = false;
  }
  if (game.mpJoinBtn) {
    game.mpJoinBtn.disabled = true;
    game.mpJoinBtn.classList.add("hidden");
  }
  if (game.mpCodeInput) {
    game.mpCodeInput.disabled = true;
    game.mpCodeInput.classList.add("hidden");
  }
  if (game.mpStartBtn) {
    game.mpStartBtn.disabled = !canStart;
    if (!connected && connecting) {
      game.mpStartBtn.textContent = retrying ? "서버 재시도 중..." : "서버 연결 중...";
    } else if (!connected) {
      game.mpStartBtn.textContent = "서버 오프라인";
    } else if (!inRoom) {
      game.mpStartBtn.textContent = "방 자동 참가 중...";
    } else if (canUseHostControls) {
      game.mpStartBtn.textContent = "온라인 라운드 시작";
    } else {
      game.mpStartBtn.textContent = "온라인 바로 입장";
    }
  }
  if (game.mpLeaveBtn) {
    game.mpLeaveBtn.disabled = true;
    game.mpLeaveBtn.classList.add("hidden");
  }
  if (game.mpCopyCodeBtn) {
    game.mpCopyCodeBtn.disabled = true;
    game.mpCopyCodeBtn.classList.add("hidden");
  }
  if (game.mpTeamAlphaBtn) {
    game.mpTeamAlphaBtn.disabled = !inRoom;
    game.mpTeamAlphaBtn.classList.add("hidden");
  }
  if (game.mpTeamBravoBtn) {
    game.mpTeamBravoBtn.disabled = !inRoom;
    game.mpTeamBravoBtn.classList.add("hidden");
  }
  if (game.mpRefreshBtn) {
    game.mpRefreshBtn.disabled = !connected;
  }
  if (game.mpEnterLobbyBtn) {
    if (in3dLobby) {
      game.mpEnterLobbyBtn.textContent = "대기방 접속 중";
    } else if (!connected && connecting) {
      game.mpEnterLobbyBtn.textContent = retrying ? "서버 재시도 중..." : "서버 연결 중...";
    } else if (!connected) {
      game.mpEnterLobbyBtn.textContent = "서버 오프라인";
    } else if (!inRoom) {
      game.mpEnterLobbyBtn.textContent = "대기방 자동 준비 중...";
    } else {
      game.mpEnterLobbyBtn.textContent = "대기방 입장";
    }
    game.mpEnterLobbyBtn.disabled = !connected && !in3dLobby;
  }
  if (game.mpOpenTrainingBtn) {
    game.mpOpenTrainingBtn.disabled = false;
  }
  if (game.mpOpenSimulacBtn) {
    game.mpOpenSimulacBtn.disabled = false;
  }
  if (game.hostCommandPanelEl) {
    game.hostCommandPanelEl.classList.toggle("hidden", !hostPanelVisible);
    game.hostCommandPanelEl.toggleAttribute("hidden", !hostPanelVisible);
    game.hostCommandPanelEl.setAttribute("aria-hidden", hostPanelVisible ? "false" : "true");
  }
  game.startLayoutEl?.classList.toggle("host-panel-hidden", !hostPanelVisible);
  if (game.hostCommandStateEl) {
    if (!inRoom) {
      game.hostCommandStateEl.textContent = "방 자동 참가 중";
    } else if (!canUseHostControls) {
      game.hostCommandStateEl.textContent = "방장 전용";
    } else if (!connected && connecting) {
      game.hostCommandStateEl.textContent = retrying ? "재연결 중" : "연결 중";
    } else if (!connected) {
      game.hostCommandStateEl.textContent = "오프라인";
    } else {
      const mapMeta = game.getCurrentMapDisplayMeta();
      game.hostCommandStateEl.textContent = `현재 ${mapMeta.name}`;
    }
  }
  if (game.hostStartForestBtn) {
    game.hostStartForestBtn.disabled = !connected || !inRoom || !canUseHostControls;
  }
  if (game.hostStartCityBtn) {
    game.hostStartCityBtn.disabled = !connected || !inRoom || !canUseHostControls;
  }
  if (game.hostOpenLobbyBtn) {
    game.hostOpenLobbyBtn.disabled = !canUseHostControls || (!connected && !in3dLobby);
  }
  if (game.hostOpenTrainingBtn) {
    game.hostOpenTrainingBtn.disabled = !canUseHostControls;
  }
  if (game.hostOpenSimulacBtn) {
    game.hostOpenSimulacBtn.disabled = !canUseHostControls;
  }
  game.syncLobby3DPortalState();
  updateLobbyQuickPanel(game, config);
}

export function refreshOnlineStatus(game, config) {
  if (!game.mpStatusEl) {
    updateLobbyControls(game, config);
    return;
  }

  if (!game.chat) {
    game.mpStatusEl.textContent = "서버: 채팅 모듈 없음";
    game.mpStatusEl.dataset.state = "offline";
    updateLobbyControls(game, config);
    return;
  }

  const { connected, connecting, retrying } = game.getOnlineConnectionUiState();

  if (connecting) {
    game.mpStatusEl.textContent = retrying ? "서버: 오프라인 · 재시도 중..." : "서버: 연결 중...";
    game.mpStatusEl.dataset.state = "offline";
    updateLobbyControls(game, config);
    return;
  }

  if (!connected) {
    game.mpStatusEl.textContent = "서버: 오프라인";
    game.mpStatusEl.dataset.state = "offline";
    updateLobbyControls(game, config);
    return;
  }

  if (game.lobbyState.roomCode) {
    game.mpStatusEl.textContent = `서버: 온라인 | ${game.lobbyState.roomCode} (${game.lobbyState.players.length}/${config.onlineMaxPlayers})`;
    game.mpStatusEl.dataset.state = "online";
    updateLobbyControls(game, config);
    return;
  }

  game.mpStatusEl.textContent = `서버: 온라인 | 방 자동 참가 중...`;
  game.mpStatusEl.dataset.state = "online";
  game.joinDefaultRoom();
  updateLobbyControls(game, config);
}
