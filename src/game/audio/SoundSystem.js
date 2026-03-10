import {
  AWP_FIRE_AUDIO_URL,
  LEGACY_FIRE_AUDIO_URL,
  M4A1_FIRE_AUDIO_URL,
  RELOAD_AUDIO_URL,
  SHOVEL_AUDIO_URL,
  SPAS12_FIRE_AUDIO_URL
} from "../../shared/audioAssets.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildClipPool({
  url,
  size,
  baseVolume,
  startTime = 0,
  endTime = null,
  minIntervalMs = 0
}) {
  const pool = [];
  for (let i = 0; i < size; i += 1) {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = baseVolume;
    pool.push(audio);
  }

  return {
    pool,
    index: 0,
    baseVolume,
    startTime,
    endTime,
    minIntervalMs,
    lastPlayedAt: 0
  };
}

function clearScheduledStop(audio) {
  const stopTimer = audio?.__reclaimStopTimer ?? null;
  if (stopTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(stopTimer);
  }
  if (audio) {
    audio.__reclaimStopTimer = null;
  }
}

function safeResetAudio(audio) {
  clearScheduledStop(audio);
  try {
    audio.pause();
  } catch {}
  try {
    audio.currentTime = 0;
  } catch {}
}

function safePlayAudio(audio) {
  try {
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

function getAudioContextClass() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.AudioContext ?? window.webkitAudioContext ?? null;
}

export class SoundSystem {
  constructor() {
    this.enabled = typeof Audio !== "undefined";
    this.unlocked = false;
    this.clips = new Map();
    this.effectsVolumeScale = 1;
    this.audioContext = null;
    this.lastHitCueAt = 0;
    this.lastBlockBreakCueAt = 0;
    this.lastBlockImpactCueAt = 0;

    if (!this.enabled) {
      return;
    }

    this.clips.set(
      "shot",
      buildClipPool({ url: LEGACY_FIRE_AUDIO_URL, size: 10, baseVolume: 0.42, endTime: 0.16 })
    );
    this.clips.set(
      "shot:m4a1",
      buildClipPool({
        url: M4A1_FIRE_AUDIO_URL,
        size: 10,
        baseVolume: 0.86,
        minIntervalMs: 96
      })
    );
    this.clips.set(
      "shot:spas12",
      buildClipPool({ url: SPAS12_FIRE_AUDIO_URL, size: 4, baseVolume: 0.88, endTime: 0.52 })
    );
    this.clips.set(
      "shot:awp",
      buildClipPool({ url: AWP_FIRE_AUDIO_URL, size: 3, baseVolume: 1, endTime: 0.96 })
    );
    this.clips.set(
      "reload",
      buildClipPool({ url: RELOAD_AUDIO_URL, size: 4, baseVolume: 0.5 })
    );
    this.clips.set(
      "dry",
      buildClipPool({ url: RELOAD_AUDIO_URL, size: 3, baseVolume: 0.24 })
    );
    this.clips.set(
      "portal",
      buildClipPool({ url: RELOAD_AUDIO_URL, size: 4, baseVolume: 0.34 })
    );
    this.clips.set(
      "shovel",
      buildClipPool({
        url: SHOVEL_AUDIO_URL,
        size: 4,
        baseVolume: 0.52,
        minIntervalMs: 90
      })
    );
  }

  unlock() {
    if (!this.enabled || this.unlocked) {
      return;
    }
    this.unlocked = true;
    this.audioContext?.resume?.().catch?.(() => {});

    for (const clip of this.clips.values()) {
      const audio = clip.pool[0];
      if (!audio) {
        continue;
      }

      const previousVolume = audio.volume;
      audio.volume = 0;
      safeResetAudio(audio);
      const playPromise = audio.play?.();

      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            safeResetAudio(audio);
            audio.volume = previousVolume;
          })
          .catch(() => {
            audio.volume = previousVolume;
          });
      } else {
        safeResetAudio(audio);
        audio.volume = previousVolume;
      }
    }
  }

  setEffectsVolumeScale(nextValue) {
    const raw = Number(nextValue);
    const value = Number.isFinite(raw) ? clamp(raw, 0, 1) : this.effectsVolumeScale;
    const prev = Math.max(0.0001, this.effectsVolumeScale);
    this.effectsVolumeScale = value;

    const ratio = value / prev;
    for (const clip of this.clips.values()) {
      for (const audio of clip.pool) {
        if (!audio || audio.paused) {
          continue;
        }
        audio.volume = clamp(audio.volume * ratio, 0, 1);
      }
    }
  }

  getEffectsVolumeScale() {
    return this.effectsVolumeScale;
  }

  getAudioContext() {
    if (!this.enabled || this.effectsVolumeScale <= 0) {
      return null;
    }
    if (!this.audioContext) {
      const AudioContextClass = getAudioContextClass();
      if (!AudioContextClass) {
        return null;
      }
      try {
        this.audioContext = new AudioContextClass();
      } catch {
        this.audioContext = null;
      }
    }
    this.audioContext?.resume?.().catch?.(() => {});
    return this.audioContext;
  }

  playHitCue(kind = "body") {
    const ctx = this.getAudioContext();
    if (!ctx) {
      return;
    }
    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    if (nowMs - this.lastHitCueAt < 28) {
      return;
    }
    this.lastHitCueAt = nowMs;

    const isHeadshot = String(kind ?? "").trim().toLowerCase() === "head";
    const startTime = ctx.currentTime + 0.004;
    const outputGain = ctx.createGain();
    outputGain.gain.value = Math.max(0.0001, this.effectsVolumeScale);
    outputGain.connect(ctx.destination);

    const playTone = (frequency, type, gainValue, delay, duration) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const toneStart = startTime + delay;
      const toneEnd = toneStart + duration;

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, toneStart);
      gainNode.gain.setValueAtTime(0.0001, toneStart);
      gainNode.gain.linearRampToValueAtTime(gainValue, toneStart + 0.008);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

      osc.connect(gainNode);
      gainNode.connect(outputGain);
      osc.start(toneStart);
      osc.stop(toneEnd + 0.01);
    };

    if (isHeadshot) {
      playTone(1240, "square", 0.12, 0, 0.05);
      playTone(1780, "triangle", 0.07, 0.028, 0.06);
    } else {
      playTone(760, "triangle", 0.09, 0, 0.06);
    }
  }

  playBlockBreakCue(kind = "default") {
    const ctx = this.getAudioContext();
    if (!ctx) {
      return;
    }
    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    if (nowMs - this.lastBlockBreakCueAt < 40) {
      return;
    }
    this.lastBlockBreakCueAt = nowMs;

    const normalizedKind = String(kind ?? "default").trim().toLowerCase();
    const startTime = ctx.currentTime + 0.003;
    const outputGain = ctx.createGain();
    outputGain.gain.value = Math.max(0.0001, this.effectsVolumeScale);
    outputGain.connect(ctx.destination);

    const tone = ctx.createOscillator();
    const toneGain = ctx.createGain();
    const baseFrequency =
      normalizedKind === "metal" ? 210 : normalizedKind === "stone" || normalizedKind === "brick" ? 168 : 122;
    tone.type = normalizedKind === "metal" ? "square" : "triangle";
    tone.frequency.setValueAtTime(baseFrequency, startTime);
    tone.frequency.exponentialRampToValueAtTime(baseFrequency * 0.72, startTime + 0.1);
    toneGain.gain.setValueAtTime(0.0001, startTime);
    toneGain.gain.linearRampToValueAtTime(0.12, startTime + 0.006);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);
    tone.connect(toneGain);
    toneGain.connect(outputGain);
    tone.start(startTime);
    tone.stop(startTime + 0.14);

    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.09));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      const decay = 1 - i / bufferSize;
      channel[i] = (Math.random() * 2 - 1) * decay;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = normalizedKind === "metal" ? "highpass" : "lowpass";
    filter.frequency.setValueAtTime(normalizedKind === "metal" ? 1400 : 900, startTime);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, startTime);
    noiseGain.gain.linearRampToValueAtTime(normalizedKind === "metal" ? 0.08 : 0.12, startTime + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(outputGain);
    noise.start(startTime);
    noise.stop(startTime + 0.09);
  }

  playBlockImpactCue(kind = "default", strength = 1) {
    const ctx = this.getAudioContext();
    if (!ctx) {
      return;
    }
    const nowMs =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    if (nowMs - this.lastBlockImpactCueAt < 24) {
      return;
    }
    this.lastBlockImpactCueAt = nowMs;

    const normalizedKind = String(kind ?? "default").trim().toLowerCase();
    const power = clamp(Number(strength) || 1, 0.35, 1.4);
    const startTime = ctx.currentTime + 0.002;
    const outputGain = ctx.createGain();
    outputGain.gain.value = Math.max(0.0001, this.effectsVolumeScale);
    outputGain.connect(ctx.destination);

    const tone = ctx.createOscillator();
    const toneGain = ctx.createGain();
    const baseFrequency =
      normalizedKind === "metal" ? 240 : normalizedKind === "stone" || normalizedKind === "brick" ? 178 : 136;
    tone.type = normalizedKind === "metal" ? "square" : "triangle";
    tone.frequency.setValueAtTime(baseFrequency, startTime);
    tone.frequency.exponentialRampToValueAtTime(baseFrequency * 0.82, startTime + 0.06);
    toneGain.gain.setValueAtTime(0.0001, startTime);
    toneGain.gain.linearRampToValueAtTime(0.05 * power, startTime + 0.004);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.075);
    tone.connect(toneGain);
    toneGain.connect(outputGain);
    tone.start(startTime);
    tone.stop(startTime + 0.09);

    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.05));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      const decay = 1 - i / bufferSize;
      channel[i] = (Math.random() * 2 - 1) * decay;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = normalizedKind === "metal" ? "bandpass" : "lowpass";
    filter.frequency.setValueAtTime(normalizedKind === "metal" ? 1700 : 1100, startTime);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, startTime);
    noiseGain.gain.linearRampToValueAtTime(0.06 * power, startTime + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.05);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(outputGain);
    noise.start(startTime);
    noise.stop(startTime + 0.055);
  }

  play(name, options = {}) {
    if (!this.enabled) {
      return;
    }

    const clip = this.clips.get(name) ?? this.clips.get("shot");
    if (!clip || clip.pool.length === 0) {
      return;
    }
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const minIntervalMs = Math.max(0, Number(options.minIntervalMs ?? clip.minIntervalMs) || 0);
    if (minIntervalMs > 0 && now - clip.lastPlayedAt < minIntervalMs) {
      return;
    }

    const audio = clip.pool[clip.index];
    clip.index = (clip.index + 1) % clip.pool.length;

    const gain = options.gain ?? 1;
    const rateJitter = Math.max(0, options.rateJitter ?? 0);
    const rate = 1 + (Math.random() * 2 - 1) * rateJitter;

    safeResetAudio(audio);
    try {
      audio.currentTime = Math.max(0, Number(clip.startTime) || 0);
    } catch {}
    audio.volume = clamp(clip.baseVolume * gain * this.effectsVolumeScale, 0, 1);
    audio.playbackRate = clamp(rate, 0.5, 2);
    const played = safePlayAudio(audio);
    if (!played) {
      return;
    }
    clip.lastPlayedAt = now;
    const stopAt = Number(clip.endTime);
    const startAt = Math.max(0, Number(clip.startTime) || 0);
    if (Number.isFinite(stopAt) && stopAt > startAt && typeof window !== "undefined") {
      const stopAfterMs = ((stopAt - startAt) / audio.playbackRate) * 1000;
      audio.__reclaimStopTimer = window.setTimeout(() => {
        safeResetAudio(audio);
      }, Math.max(24, stopAfterMs));
    }
  }
}
