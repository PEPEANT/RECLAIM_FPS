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

export class SoundSystem {
  constructor() {
    this.enabled = typeof Audio !== "undefined";
    this.unlocked = false;
    this.clips = new Map();
    this.effectsVolumeScale = 1;

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
