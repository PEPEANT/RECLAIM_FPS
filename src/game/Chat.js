import { io } from "socket.io-client";

const PROD_CHAT_FALLBACK_URL = "https://reclaim-fps.onrender.com";
const CHAT_GUARD_STATE_KEY = "reclaimChatGuard";
const CHAT_LIVE_FEED_ENABLED = false;
const MAX_LIVE_MSGS = 10;
const MAX_STORED_MSGS = 180;
const LIVE_LINE_TTL_MS = 7000;

function resolveDefaultServerUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3001";
  }

  const { protocol, hostname, port, origin } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const isPrivateIpv4 =
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  const localServerPortByClientPort = Object.freeze({
    "4174": "3001",
    "4173": "3001",
    "5173": "3001"
  });
  const resolvedLocalServerPort = localServerPortByClientPort[port] ?? "3001";
  const isDevPort = Object.hasOwn(localServerPortByClientPort, port);

  if (isLocalHost || isPrivateIpv4 || isDevPort) {
    return `${protocol}//${hostname}:${resolvedLocalServerPort}`;
  }

  if (hostname.endsWith(".netlify.app") || hostname.endsWith(".vercel.app")) {
    return PROD_CHAT_FALLBACK_URL;
  }

  return origin;
}

function isLikelyMobileUi() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const maxTouch = Number(navigator.maxTouchPoints ?? 0);
  return coarse && maxTouch > 0;
}

const SERVER_URL = String(import.meta.env.VITE_CHAT_SERVER ?? resolveDefaultServerUrl()).trim();

export class Chat {
  constructor() {
    this.playerName = `USER_${Math.floor(Math.random() * 9000 + 1000)}`;
    this.socket = null;
    this.teamResolver = null;
    this.focusChangeHandler = null;

    this.notifiedOffline = false;
    this.isInputFocused = false;
    this.mobileUiEnabled = false;
    this.mobileCollapsed = false;
    this.chatOpen = true;
    this.expanded = false;
    this.historyGuardArmed = false;
    this.mobileHeaderToggleVisible = false;

    this._teardownBound = false;
    this._mobileUiBound = false;
    this._historyBound = false;

    this.panelEl = document.getElementById("chat-panel");
    this.titleEl = document.getElementById("chat-title");
    this.messagesEl = document.getElementById("chat-messages");
    this.liveFeedEl = document.getElementById("chat-live-feed");
    this.liveLogEl = document.getElementById("chat-live-log");
    this.liveFeedEnabled = CHAT_LIVE_FEED_ENABLED && Boolean(this.liveFeedEl && this.liveLogEl);
    this.inputEl = document.getElementById("chat-input");
    this.sendBtn = document.getElementById("chat-send");
    this.inputWrapEl = this.panelEl?.querySelector(".chat-input-wrap") ?? null;
    this.toggleBtnEl = document.getElementById("chat-toggle-btn");
    this.expandBtnEl = document.getElementById("chat-expand-btn");

    this.enabled = Boolean(this.panelEl && this.messagesEl && this.inputEl && this.sendBtn);
    if (!this.enabled) {
      return;
    }

    this.bindInput();
    this.bindHistoryGuard();
    this.setupResponsiveUi();
    this.connect();
  }

  setFocusChangeHandler(handler) {
    this.focusChangeHandler = typeof handler === "function" ? handler : null;
  }

  setTeamResolver(resolver) {
    this.teamResolver = typeof resolver === "function" ? resolver : null;
  }

  setPlayerName(rawName) {
    const safe = String(rawName ?? "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 16);
    if (!safe) {
      return;
    }
    this.playerName = safe;
  }

  isConnected() {
    return Boolean(this.socket?.connected);
  }

  isConnecting() {
    return Boolean(this.socket?.active && !this.socket?.connected);
  }

  isOpen() {
    return this.chatOpen;
  }

  isExpanded() {
    return this.expanded;
  }

  isMobileInputOpen() {
    return this.mobileUiEnabled && this.chatOpen;
  }

  getInteractionBlockState() {
    return this.isInputFocused || this.expanded || this.isMobileInputOpen();
  }

  notifyFocusChanged() {
    this.focusChangeHandler?.(this.getInteractionBlockState());
  }

  connect() {
    if (!this.enabled) {
      return;
    }

    this.socket = io(SERVER_URL, {
      autoConnect: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Number.MAX_SAFE_INTEGER,
      reconnectionDelay: 900,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    this.socket.on("connect", () => {
      this.notifiedOffline = false;
    });

    this.socket.on("connect_error", () => {
      this.notifiedOffline = true;
    });

    this.socket.on("disconnect", () => {});

    this.socket.on("chat:message", ({ id, name, text, team }) => {
      this.append(name, text, "player", {
        senderId: id ?? null,
        team: team === "alpha" || team === "bravo" ? team : null
      });
    });

    this.socket.on("chat:system", (payload) => {
      const text =
        typeof payload === "string"
          ? payload
          : typeof payload?.text === "string"
            ? payload.text
            : "";
      if (!text) {
        return;
      }
      const level = payload?.level === "error" ? "system-err" : "system";
      this.append(null, text, level);
    });

    this.bindTeardown();
  }

  bindTeardown() {
    if (this._teardownBound || typeof window === "undefined") {
      return;
    }
    this._teardownBound = true;

    const disconnectNow = () => {
      if (this.socket?.connected) {
        this.socket.disconnect();
      }
    };

    window.addEventListener("pagehide", disconnectNow);
    window.addEventListener("beforeunload", disconnectNow);
  }

  bindHistoryGuard() {
    if (this._historyBound || typeof window === "undefined") {
      return;
    }
    this._historyBound = true;

    window.addEventListener("popstate", () => {
      if (!this.chatOpen && !this.expanded) {
        this.historyGuardArmed = false;
        return;
      }

      this.historyGuardArmed = false;
      this.armHistoryGuard();
      this.setOpenState(true, { focusInput: false, force: true });
      this.setExpandedState(this.expanded, { focusInput: false, force: true });
    });
  }

  armHistoryGuard() {
    if (this.historyGuardArmed || typeof window === "undefined") {
      return;
    }
    const historyApi = window.history;
    if (!historyApi || typeof historyApi.pushState !== "function") {
      return;
    }

    const baseState =
      historyApi.state && typeof historyApi.state === "object" ? historyApi.state : {};

    try {
      historyApi.pushState(
        {
          ...baseState,
          [CHAT_GUARD_STATE_KEY]: Date.now()
        },
        "",
        window.location.href
      );
      this.historyGuardArmed = true;
    } catch {
      this.historyGuardArmed = false;
    }
  }

  bindInput() {
    if (!this.enabled) {
      return;
    }

    this.inputEl.addEventListener("focus", () => {
      this.isInputFocused = true;
      this.setOpenState(true, { focusInput: false });
      this.notifyFocusChanged();
    });

    this.inputEl.addEventListener("blur", () => {
      this.isInputFocused = false;
      this.notifyFocusChanged();
    });

    this.inputEl.addEventListener("keydown", (event) => {
      event.stopPropagation();

      if (event.code === "Enter") {
        event.preventDefault();
        this.send();
        return;
      }

      if (event.code === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    this.sendBtn.addEventListener("click", () => this.send());
  }

  setupResponsiveUi() {
    if (!this.enabled) {
      return;
    }

    const applyMode = () => {
      const nextMobile = isLikelyMobileUi();
      if (nextMobile !== this.mobileUiEnabled) {
        this.mobileUiEnabled = nextMobile;
        if (!this.mobileUiEnabled) {
          this.mobileCollapsed = false;
        }
      }

      this.panelEl?.classList.toggle("is-mobile", this.mobileUiEnabled);
      this.setOpenState(this.chatOpen, { focusInput: false, force: true });
      this.setExpandedState(this.expanded, { focusInput: false, force: true });
    };

    this.toggleBtnEl?.addEventListener("click", () => {
      const focusInput = !this.mobileUiEnabled;
      this.toggle({ focusInput });
    });

    this.expandBtnEl?.addEventListener("click", () => {
      const focusInput = !this.mobileUiEnabled;
      this.toggleExpanded({ focusInput });
    });

    if (typeof window !== "undefined" && !this._mobileUiBound) {
      this._mobileUiBound = true;
      window.addEventListener("resize", applyMode);
    }

    this.mobileUiEnabled = isLikelyMobileUi();
    this.chatOpen = !this.mobileUiEnabled;
    this.panelEl?.classList.toggle("is-mobile", this.mobileUiEnabled);
    this.setOpenState(this.chatOpen, { focusInput: false, force: true });
    this.setExpandedState(false, { focusInput: false, force: true });
  }

  setMobileHeaderToggleVisible(visible) {
    this.mobileHeaderToggleVisible = Boolean(visible);
    this.refreshHeaderButtons();
  }

  refreshHeaderButtons() {
    if (this.titleEl) {
      this.titleEl.textContent = this.expanded
        ? "\uCC44\uD305 \uC804\uCCB4\uBCF4\uAE30"
        : "\uCC44\uD305";
    }

    const showMobileHeaderToggle = !this.mobileUiEnabled || this.mobileHeaderToggleVisible;
    this.panelEl?.classList.toggle(
      "hide-mobile-chat-toggle",
      this.mobileUiEnabled && !showMobileHeaderToggle
    );

    if (this.toggleBtnEl) {
      const openText = this.chatOpen ? "\uB2EB\uAE30" : "\uC5F4\uAE30";
      this.toggleBtnEl.classList.add("show");
      this.toggleBtnEl.textContent = openText;
      this.toggleBtnEl.setAttribute("aria-expanded", this.chatOpen ? "true" : "false");
      this.toggleBtnEl.setAttribute("aria-pressed", this.chatOpen ? "true" : "false");
      this.toggleBtnEl.setAttribute(
        "aria-label",
        this.chatOpen ? "\uCC44\uD305 \uB2EB\uAE30" : "\uCC44\uD305 \uC5F4\uAE30"
      );
      this.toggleBtnEl.setAttribute("aria-hidden", showMobileHeaderToggle ? "false" : "true");
      this.toggleBtnEl.disabled = !showMobileHeaderToggle;
      this.toggleBtnEl.tabIndex = showMobileHeaderToggle ? 0 : -1;
    }

    if (this.expandBtnEl) {
      const canExpand = this.chatOpen;
      this.expandBtnEl.classList.toggle("show", canExpand);
      this.expandBtnEl.textContent = this.expanded
        ? "\uC811\uAE30"
        : "\uD3BC\uCE58\uAE30";
      this.expandBtnEl.disabled = !canExpand;
      this.expandBtnEl.setAttribute("aria-expanded", this.expanded ? "true" : "false");
      this.expandBtnEl.setAttribute("aria-pressed", this.expanded ? "true" : "false");
      this.expandBtnEl.setAttribute(
        "aria-label",
        this.expanded
          ? "\uCC44\uD305 \uC804\uCCB4\uBCF4\uAE30 \uC811\uAE30"
          : "\uCC44\uD305 \uC804\uCCB4\uBCF4\uAE30 \uD3BC\uCE58\uAE30"
      );
      this.expandBtnEl.setAttribute("aria-hidden", canExpand ? "false" : "true");
    }
  }

  setOpenState(open, { focusInput = false, force = false } = {}) {
    if (!this.enabled) {
      return;
    }

    const nextOpen = Boolean(open);
    if (!nextOpen && this.expanded) {
      this.expanded = false;
    }

    if (!force && this.chatOpen === nextOpen) {
      this.refreshHeaderButtons();
      this.syncLiveFeedVisibility();
      return;
    }

    this.chatOpen = nextOpen;
    this.mobileCollapsed = this.mobileUiEnabled ? !nextOpen : false;

    if (nextOpen) {
      this.armHistoryGuard();
    } else if (this.isInputFocused) {
      this.isInputFocused = false;
      this.notifyFocusChanged();
    }
    if (!nextOpen) {
      this.historyGuardArmed = false;
    }

    this.panelEl?.classList.toggle("is-mobile", this.mobileUiEnabled);
    this.panelEl?.classList.toggle("mobile-collapsed", this.mobileUiEnabled && !nextOpen);
    this.panelEl?.classList.toggle("is-collapsed", !this.mobileUiEnabled && !nextOpen);
    this.panelEl?.classList.toggle("is-expanded", nextOpen && this.expanded);

    if (this.inputWrapEl) {
      this.inputWrapEl.setAttribute("aria-hidden", nextOpen ? "false" : "true");
    }

    if (!nextOpen) {
      this.inputEl?.blur();
    } else if (focusInput) {
      this.inputEl?.focus();
    }

    this.refreshHeaderButtons();
    this.syncLiveFeedVisibility();
    this.notifyFocusChanged();
  }

  setExpandedState(expanded, { focusInput = false, force = false } = {}) {
    if (!this.enabled) {
      return;
    }

    const nextExpanded = Boolean(expanded);
    if (nextExpanded && !this.chatOpen) {
      this.setOpenState(true, { focusInput: false, force: true });
    }

    if (!force && this.expanded === nextExpanded) {
      this.refreshHeaderButtons();
      this.syncLiveFeedVisibility();
      return;
    }

    this.expanded = nextExpanded;
    if (nextExpanded) {
      this.armHistoryGuard();
    }

    this.panelEl?.classList.toggle("is-expanded", this.chatOpen && nextExpanded);
    this.refreshHeaderButtons();
    this.syncLiveFeedVisibility();
    this.notifyFocusChanged();

    if (this.messagesEl && nextExpanded) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
    if (focusInput && this.chatOpen) {
      this.inputEl?.focus();
    }
  }

  syncLiveFeedVisibility() {
    if (!this.liveFeedEl) {
      return;
    }

    const visible = this.liveFeedEnabled && !this.chatOpen && !this.expanded;
    this.liveFeedEl.classList.toggle("hidden", !visible);
    this.liveFeedEl.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  open(options = {}) {
    if (!this.enabled) {
      return;
    }
    const focusInput = options?.focusInput ?? !this.mobileUiEnabled;
    this.setOpenState(true, { focusInput: Boolean(focusInput) });
  }

  close() {
    if (!this.enabled) {
      return;
    }
    this.setExpandedState(false, { focusInput: false, force: true });
    this.setOpenState(false, { focusInput: false });
  }

  toggle(options = {}) {
    if (!this.enabled) {
      return;
    }

    const focusInput = options?.focusInput ?? !this.mobileUiEnabled;
    const nextOpen = !this.chatOpen;
    if (!nextOpen) {
      this.setExpandedState(false, { focusInput: false, force: true });
    }
    this.setOpenState(nextOpen, { focusInput: Boolean(focusInput) });
  }

  toggleExpanded(options = {}) {
    if (!this.enabled) {
      return;
    }

    const focusInput = options?.focusInput ?? false;
    this.setExpandedState(!this.expanded, { focusInput: Boolean(focusInput) });
  }

  send() {
    if (!this.enabled) {
      return;
    }

    const text = this.inputEl.value.trim();
    if (!text) {
      return;
    }

    if (!this.socket?.connected) {
      this.append(this.playerName, text, "player");
      this.inputEl.value = "";
      return;
    }

    this.socket.emit("chat:send", { name: this.playerName, text });
    this.inputEl.value = "";
  }

  addSystemMessage(text, level = "system") {
    if (!this.enabled) {
      return;
    }
    this.append(null, text, level);
  }

  clear({ preserveHistory = true } = {}) {
    if (!this.enabled) {
      return;
    }

    if (!preserveHistory) {
      this.messagesEl.innerHTML = "";
    }
    if (this.liveLogEl) {
      this.liveLogEl.innerHTML = "";
    }
    this.syncLiveFeedVisibility();
  }

  createMessageElement(name, text, type, meta = {}) {
    const el = document.createElement("div");
    el.className = `chat-msg ${type}`;

    if (type === "player") {
      const msgTeam = meta?.team === "alpha" || meta?.team === "bravo" ? meta.team : null;
      const myTeamRaw = this.teamResolver?.();
      const myTeam = myTeamRaw === "alpha" || myTeamRaw === "bravo" ? myTeamRaw : null;
      if (msgTeam && myTeam) {
        el.classList.add(msgTeam === myTeam ? "ally" : "enemy");
      } else if (msgTeam) {
        el.classList.add(`team-${msgTeam}`);
      }

      const mySocketId = String(this.socket?.id ?? "");
      const senderId = String(meta?.senderId ?? "");
      if (mySocketId && senderId && mySocketId === senderId) {
        el.classList.add("self");
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "chat-name";
      nameSpan.textContent = `${name}: `;
      el.appendChild(nameSpan);
      el.appendChild(document.createTextNode(text));
      return el;
    }

    el.textContent = text;
    return el;
  }

  append(name, text, type, meta = {}) {
    if (!this.enabled) {
      return;
    }

    const messageText = String(text ?? "").trim();
    if (!messageText) {
      return;
    }

    const nearBottom =
      this.messagesEl.scrollHeight - this.messagesEl.scrollTop - this.messagesEl.clientHeight < 24;

    const el = this.createMessageElement(name, messageText, type, meta);
    this.messagesEl.appendChild(el);
    while (this.messagesEl.children.length > MAX_STORED_MSGS) {
      this.messagesEl.removeChild(this.messagesEl.firstChild);
    }

    if (nearBottom || !this.chatOpen || type === "system" || type === "system-err") {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    if (!this.liveFeedEnabled || !this.liveLogEl) {
      return;
    }

    const liveLine = el.cloneNode(true);
    liveLine.classList.add("live");
    this.liveLogEl.appendChild(liveLine);
    while (this.liveLogEl.children.length > MAX_LIVE_MSGS) {
      this.liveLogEl.removeChild(this.liveLogEl.firstChild);
    }
    this.liveLogEl.scrollTop = this.liveLogEl.scrollHeight;
    this.syncLiveFeedVisibility();

    window.setTimeout(() => {
      if (!liveLine.isConnected) {
        return;
      }
      liveLine.classList.add("fade-out");
      window.setTimeout(() => {
        liveLine.remove();
        this.syncLiveFeedVisibility();
      }, 480);
    }, LIVE_LINE_TTL_MS);
  }
}
