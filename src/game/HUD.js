const THREAT_LABELS = ["", "낮음", "주의", "높음", "위험", "극한"];

function setText(el, value) {
  if (el) {
    el.textContent = value;
  }
}

function toggleClass(el, className, enabled) {
  if (el) {
    el.classList.toggle(className, enabled);
  }
}

export class HUD {
  constructor() {
    this.healthEl = document.getElementById("hud-health");
    this.scoreEl = document.getElementById("hud-score");
    this.ammoEl = document.getElementById("hud-ammo");
    this.reserveEl = document.getElementById("hud-reserve");
    this.statusEl = document.getElementById("hud-status");

    this.healthBarEl = document.getElementById("hud-health-bar");
    this.killsEl = document.getElementById("hud-kills");
    this.enemiesEl = document.getElementById("hud-enemies");
    this.capturesEl = document.getElementById("hud-captures");
    this.controlEl = document.getElementById("hud-control");
    this.objectiveEl = document.getElementById("hud-objective");
    this.threatEl = document.getElementById("hud-threat");
    this.streakEl = document.getElementById("hud-streak");
    this.announcementEl = document.getElementById("hud-announcement");

    this.crosshairEl = document.getElementById("crosshair");
    this.scopeOverlayEl = document.getElementById("scope-overlay");
    this.hitmarkerEl = document.getElementById("hitmarker");
    this.damageOverlayEl = document.getElementById("damage-overlay");

    this.startOverlayEl = document.getElementById("start-overlay");
    this.pauseOverlayEl = document.getElementById("pause-overlay");
    this.gameOverOverlayEl = document.getElementById("gameover-overlay");
    this.finalScoreEl = document.getElementById("final-score");

    this.statusTimer = 0;
    this.announcementTimer = 0;
    this.damageOverlayTimeout = null;
    this.hitmarkerTimeout = null;
  }

  update(delta, state) {
    setText(this.healthEl, `${Math.round(Number(state.health ?? 0))}`);
    setText(this.scoreEl, `${state.score}`);
    setText(this.ammoEl, `${state.ammo}`);
    setText(this.reserveEl, `${state.reserve}`);
    setText(this.killsEl, `${state.kills ?? 0}`);
    setText(this.enemiesEl, `${state.enemyCount ?? 0}`);
    setText(this.capturesEl, `${state.captures ?? 0}`);

    const controlPercent = Math.max(0, Math.min(100, Number(state.controlPercent ?? 0)));
    const controlOwner = state.controlOwner ?? "neutral";
    const controlText = controlOwner === "alpha" ? `확보 ${controlPercent}%` : `${controlPercent}%`;
    setText(this.controlEl, controlText);

    setText(this.objectiveEl, "");

    const hp = Math.max(0, Math.min(100, state.health));
    if (this.healthBarEl) {
      this.healthBarEl.style.width = `${hp}%`;
      if (hp <= 25) {
        this.healthBarEl.style.background = "#ff4444";
      } else if (hp <= 50) {
        this.healthBarEl.style.background = "var(--ui-alert)";
      } else {
        this.healthBarEl.style.background = "var(--ui-ok)";
      }
    }

    const threat = Math.min(5, Math.floor((state.score ?? 0) / 500) + 1);
    setText(this.threatEl, `위협 단계 ${THREAT_LABELS[threat]}`);

    if (state.reloading) {
      setText(this.statusEl, "재장전 중...");
      this.statusEl?.classList.add("is-alert");
    } else if (this.statusTimer <= 0) {
      setText(this.statusEl, "");
      this.statusEl?.classList.remove("is-alert");
    }

    this.statusTimer = Math.max(0, this.statusTimer - delta);
    if (this.announcementTimer > 0) {
      this.announcementTimer = Math.max(0, this.announcementTimer - delta);
      if (this.announcementTimer <= 0) {
        this.clearAnnouncement();
      }
    }
  }

  setStatus(text, isAlert = false, duration = 0.5) {
    setText(this.statusEl, text);
    toggleClass(this.statusEl, "is-alert", isAlert);
    this.statusTimer = duration;
  }

  setKillStreak(streak) {
    if (streak >= 3) {
      setText(this.streakEl, `${streak}연속 처치`);
    } else {
      setText(this.streakEl, "");
    }
  }

  setAnnouncement(text, { isAlert = false, duration = 2.4 } = {}) {
    if (!this.announcementEl) {
      return;
    }
    const message = String(text ?? "").trim();
    if (!message) {
      this.clearAnnouncement();
      return;
    }

    this.announcementEl.textContent = message;
    this.announcementEl.classList.add("show");
    this.announcementEl.classList.toggle("is-alert", Boolean(isAlert));
    this.announcementEl.setAttribute("aria-hidden", "false");
    this.announcementTimer = Math.max(0.2, Number(duration) || 2.4);
  }

  clearAnnouncement() {
    if (!this.announcementEl) {
      return;
    }
    this.announcementTimer = 0;
    this.announcementEl.classList.remove("show");
    this.announcementEl.classList.remove("is-alert");
    this.announcementEl.setAttribute("aria-hidden", "true");
    this.announcementEl.textContent = "";
  }

  showStartOverlay(visible) {
    toggleClass(this.startOverlayEl, "show", visible);
  }

  showPauseOverlay(visible) {
    toggleClass(this.pauseOverlayEl, "show", visible);
    if (this.pauseOverlayEl) {
      this.pauseOverlayEl.setAttribute("aria-hidden", visible ? "false" : "true");
    }
  }

  showGameOver(score) {
    setText(this.finalScoreEl, `${score}`);
    this.gameOverOverlayEl?.classList.add("show");
  }

  hideGameOver() {
    this.gameOverOverlayEl?.classList.remove("show");
  }

  pulseCrosshair() {
    if (!this.crosshairEl) {
      return;
    }
    this.crosshairEl.classList.remove("pulse");
    this.crosshairEl.offsetWidth;
    this.crosshairEl.classList.add("pulse");
  }

  setCrosshairState({ scale = 1, opacity = 1 } = {}) {
    if (!this.crosshairEl) {
      return;
    }
    const safeScale = Math.max(0.72, Math.min(2.4, Number(scale) || 1));
    const safeOpacity = Math.max(0, Math.min(1, Number(opacity) || 0));
    this.crosshairEl.style.setProperty("--crosshair-scale", `${safeScale}`);
    this.crosshairEl.style.setProperty("--crosshair-opacity", `${safeOpacity}`);
  }

  setScopeOverlayVisible(visible) {
    if (!this.scopeOverlayEl) {
      return;
    }
    this.scopeOverlayEl.classList.toggle("show", Boolean(visible));
    this.scopeOverlayEl.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  pulseHitmarker() {
    if (!this.hitmarkerEl) {
      return;
    }
    this.hitmarkerEl.classList.remove("show");
    this.hitmarkerEl.offsetWidth;
    this.hitmarkerEl.classList.add("show");

    if (this.hitmarkerTimeout !== null) {
      window.clearTimeout(this.hitmarkerTimeout);
    }
    this.hitmarkerTimeout = window.setTimeout(() => {
      this.hitmarkerEl?.classList.remove("show");
      this.hitmarkerTimeout = null;
    }, 160);
  }

  flashDamage() {
    if (!this.damageOverlayEl) {
      return;
    }
    this.damageOverlayEl.classList.remove("show");
    this.damageOverlayEl.offsetWidth;
    this.damageOverlayEl.classList.add("show");

    if (this.damageOverlayTimeout !== null) {
      window.clearTimeout(this.damageOverlayTimeout);
    }
    this.damageOverlayTimeout = window.setTimeout(() => {
      this.damageOverlayEl?.classList.remove("show");
      this.damageOverlayTimeout = null;
    }, 90);
  }
}
