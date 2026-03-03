import { io } from "socket.io-client";

const PROD_CHAT_FALLBACK_URL = "https://reclaim-fps.onrender.com";

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
  const isDevPort = port === "5173" || port === "4173";

  if (isLocalHost || isPrivateIpv4 || isDevPort) {
    return `${protocol}//${hostname}:3001`;
  }

  if (hostname.endsWith(".netlify.app") || hostname.endsWith(".vercel.app")) {
    return PROD_CHAT_FALLBACK_URL;
  }

  return origin;
}

const SERVER_URL = import.meta.env.VITE_CHAT_SERVER ?? resolveDefaultServerUrl();
const MAX_MSGS = 80;
const MAX_LIVE_MSGS = 10;
const LIVE_LINE_TTL_MS = 7000;

function isLikelyMobileUi() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const maxTouch = Number(navigator.maxTouchPoints ?? 0);
  return coarse && maxTouch > 0;
}

export class Chat {
  constructor() {
    this.playerName = `USER_${Math.floor(Math.random() * 9000 + 1000)}`;
    this.isInputFocused = false;
    this.socket = null;
    this.focusChangeHandler = null;
    this.notifiedOffline = false;
    this._teardownBound = false;
    this._mobileUiBound = false;
    this.mobileUiEnabled = false;
    this.mobileCollapsed = false;
    this.chatOpen = true;
    this.teamResolver = null;

    this.panelEl = document.getElementById("chat-panel");
    this.titleEl = document.getElementById("chat-title");
    this.messagesEl = document.getElementById("chat-messages");
    this.liveFeedEl = document.getElementById("chat-live-feed");
    this.liveLogEl = document.getElementById("chat-live-log");
    this.inputEl = document.getElementById("chat-input");
    this.sendBtn = document.getElementById("chat-send");
    this.inputWrapEl = this.panelEl?.querySelector(".chat-input-wrap") ?? null;
    this.toggleBtnEl = document.getElementById("chat-toggle-btn");

    this.enabled = !!(this.messagesEl && this.inputEl && this.sendBtn && this.panelEl);
    if (!this.enabled) {
      return;
    }

    this.bindInput();
    this.setupMobileUi();
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
    return !!this.socket?.connected;
  }

  isConnecting() {
    return !!this.socket?.active && !this.socket?.connected;
  }

  isOpen() {
    return this.chatOpen;
  }

  notifyFocusChanged() {
    this.focusChangeHandler?.(this.isInputFocused);
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
      if (this.socket && this.socket.connected) {
        this.socket.disconnect();
      }
    };

    window.addEventListener("pagehide", disconnectNow);
    window.addEventListener("beforeunload", disconnectNow);
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
      }
      if (event.code === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    this.sendBtn.addEventListener("click", () => this.send());
  }

  setupMobileUi() {
    if (!this.enabled) {
      return;
    }

    const applyMode = () => {
      const isMobileNow = isLikelyMobileUi();
      if (isMobileNow !== this.mobileUiEnabled) {
        this.mobileUiEnabled = isMobileNow;
        this.chatOpen = !isMobileNow;
      }
      this.setOpenState(this.chatOpen, { focusInput: false, force: true });
    };

    if (this.toggleBtnEl) {
      this.toggleBtnEl.addEventListener("click", () => {
        this.toggle({ focusInput: !this.mobileUiEnabled });
      });
    }

    if (typeof window !== "undefined" && !this._mobileUiBound) {
      this._mobileUiBound = true;
      window.addEventListener("resize", applyMode);
    }

    this.mobileUiEnabled = isLikelyMobileUi();
    this.chatOpen = !this.mobileUiEnabled;
    this.setOpenState(this.chatOpen, { focusInput: false, force: true });
  }

  setOpenState(open, { focusInput = false, force = false } = {}) {
    if (!this.enabled) {
      return;
    }

    const nextOpen = Boolean(open);
    if (!force && this.chatOpen === nextOpen) {
      this.syncLiveFeedVisibility();
      return;
    }

    this.chatOpen = nextOpen;
    this.mobileCollapsed = this.mobileUiEnabled ? !nextOpen : false;

    this.panelEl?.classList.toggle("is-mobile", this.mobileUiEnabled);
    this.panelEl?.classList.toggle("mobile-collapsed", this.mobileUiEnabled && !nextOpen);
    this.panelEl?.classList.toggle("is-collapsed", !this.mobileUiEnabled && !nextOpen);

    if (this.titleEl) {
      this.titleEl.textContent = "채팅";
    }

    if (this.toggleBtnEl) {
      this.toggleBtnEl.classList.add("show");
      this.toggleBtnEl.textContent = nextOpen ? "닫기" : "채팅";
      this.toggleBtnEl.setAttribute("aria-expanded", nextOpen ? "true" : "false");
      this.toggleBtnEl.setAttribute("aria-pressed", nextOpen ? "true" : "false");
      this.toggleBtnEl.setAttribute("aria-label", nextOpen ? "채팅 닫기" : "채팅 열기");
      this.toggleBtnEl.setAttribute("aria-hidden", "false");
    }

    if (this.inputWrapEl) {
      this.inputWrapEl.setAttribute("aria-hidden", nextOpen ? "false" : "true");
    }

    if (!nextOpen) {
      this.inputEl?.blur();
    } else if (focusInput) {
      this.inputEl?.focus();
    }

    this.syncLiveFeedVisibility();
  }

  syncLiveFeedVisibility() {
    if (!this.liveFeedEl) {
      return;
    }
    const visible = !this.chatOpen;
    this.liveFeedEl.classList.toggle("hidden", !visible);
    this.liveFeedEl.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  isMobileInputOpen() {
    return this.mobileUiEnabled && this.chatOpen;
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
    this.setOpenState(false, { focusInput: false });
  }

  toggle(options = {}) {
    if (!this.enabled) {
      return;
    }
    const focusInput = options?.focusInput ?? !this.mobileUiEnabled;
    this.setOpenState(!this.chatOpen, { focusInput: Boolean(focusInput) });
  }

  send() {
    if (!this.enabled) {
      return;
    }

    const text = this.inputEl.value.trim();
    if (!text) {
      return;
    }

    if (!this.socket || !this.socket.connected) {
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

  clear() {
    if (!this.enabled) {
      return;
    }
    this.messagesEl.innerHTML = "";
    if (this.liveLogEl) {
      this.liveLogEl.innerHTML = "";
    }
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

    while (this.messagesEl.children.length > MAX_MSGS) {
      this.messagesEl.removeChild(this.messagesEl.firstChild);
    }

    if (nearBottom || !this.chatOpen || type === "system" || type === "system-err") {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    if (this.liveLogEl) {
      const liveLine = el.cloneNode(true);
      liveLine.classList.add("live");
      this.liveLogEl.appendChild(liveLine);
      while (this.liveLogEl.children.length > MAX_LIVE_MSGS) {
        this.liveLogEl.removeChild(this.liveLogEl.firstChild);
      }
      this.liveLogEl.scrollTop = this.liveLogEl.scrollHeight;

      window.setTimeout(() => {
        if (!liveLine.isConnected) {
          return;
        }
        liveLine.classList.add("fade-out");
        window.setTimeout(() => {
          liveLine.remove();
        }, 480);
      }, LIVE_LINE_TTL_MS);
    }
  }
}
