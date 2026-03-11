# Server Authority Regression Checklist

Run this after touching `server.js` combat, sync, block, or inventory rules.

## 1. Ammo / Reload

- Join an online room and empty the M4A1 magazine.
- Hold fire without reloading.
- Expected: server stops further shots, client receives `weaponState` with `ammo: 0`, and reload is required.

- Trigger reload, then fire before reload completes.
- Expected: server rejects with `reason: "reloading"` and ammo does not refill early.

## 2. Shotgun Server Pellets

- Use `SPAS-12` hip-fire and ADS at the same target from the same distance.
- Expected: ADS produces tighter damage clustering than hip-fire.

- Shoot near cover edges.
- Expected: pellet hits only apply when server LOS is clear; damage should drop when fewer pellets clear cover.

## 3. Block Reach

- Attempt block place/remove near the player.
- Expected: success inside reach.

- Attempt the same action far outside normal reach.
- Expected: server rejects with `블록 상호작용 가능 거리 밖입니다`.

## 4. Teleport / Sync Clamp

- Force a large local position jump and send `player:sync`.
- Expected: server emits `player:correction`, remote players do not see the teleported position, and CTF interactions use corrected position.

## 5. Static / Dynamic LOS

- Place a dynamic wall and shoot through it.
- Expected: no damage.

- Use a built-in map wall or building as cover and shoot through it.
- Expected: no damage.

## 6. First-Hit Resolution

- Line up two enemies on the same firing line.
- Expected: only the closest valid target takes damage; rear target is not hit through the front one.

## 7. Telemetry Sanity

- After several accepted and rejected actions, inspect server logs for the 60-second security telemetry window.
- Expected: `sync`, `shot`, and `los` counters move in the expected direction and reject reasons are populated.
