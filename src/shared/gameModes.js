export const GAME_MODE = Object.freeze({
  CTF: "ctf",
  ELIMINATION: "elimination"
});

export const DEFAULT_GAME_MODE = GAME_MODE.CTF;

export function normalizeGameMode(value) {
  return value === GAME_MODE.ELIMINATION ? GAME_MODE.ELIMINATION : GAME_MODE.CTF;
}

