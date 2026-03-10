export const M4A1_FIRE_AUDIO_URL = new URL("../../MP3/M4A1.mp3", import.meta.url).href;
export const SPAS12_FIRE_AUDIO_URL = new URL("../../MP3/SPAS.mp3", import.meta.url).href;
export const AWP_FIRE_AUDIO_URL = new URL("../../MP3/AWP.mp3", import.meta.url).href;
export const LOAD_AUDIO_URL = new URL("../../MP3/load.mp3", import.meta.url).href;
export const SHOVEL_AUDIO_URL = new URL("../../MP3/shovel.mp3", import.meta.url).href;

export const LEGACY_FIRE_AUDIO_URL = "/assets/audio/weapons/gunshot_0.mp3";
export const RELOAD_AUDIO_URL = LOAD_AUDIO_URL;

export const PRELOAD_AUDIO_ASSET_URLS = Object.freeze([
  M4A1_FIRE_AUDIO_URL,
  SPAS12_FIRE_AUDIO_URL,
  AWP_FIRE_AUDIO_URL,
  RELOAD_AUDIO_URL,
  SHOVEL_AUDIO_URL
]);
