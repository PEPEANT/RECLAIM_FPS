import { DEFAULT_WEAPON_ID, getWeaponDefinition } from "../shared/weaponCatalog.js";

export class WeaponSystem {
  constructor(weaponConfig = null) {
    this.weaponId = DEFAULT_WEAPON_ID;
    this.magazineSize = 30;
    this.defaultReserve = 150;
    this.reloadDuration = 1.25;
    this.shotCooldown = 0.1;
    this.damage = 24;
    this.recoilKick = 1;
    this.configure(weaponConfig ?? getWeaponDefinition(DEFAULT_WEAPON_ID), { resetAmmo: true });
  }

  configure(weaponConfig = null, { resetAmmo = false } = {}) {
    const nextWeapon = getWeaponDefinition(weaponConfig?.id ?? weaponConfig ?? DEFAULT_WEAPON_ID);
    this.weaponId = nextWeapon.id;
    this.magazineSize = nextWeapon.magazineSize;
    this.defaultReserve = nextWeapon.reserve;
    this.reloadDuration = nextWeapon.reloadDuration;
    this.shotCooldown = nextWeapon.shotCooldown;
    this.damage = nextWeapon.damage;
    this.recoilKick = nextWeapon.recoilKick ?? 1;
    if (resetAmmo) {
      this.reset();
      return;
    }
    this.ammo = Math.min(this.magazineSize, Math.max(0, this.ammo ?? this.magazineSize));
    this.reserve = Math.min(this.defaultReserve, Math.max(0, this.reserve ?? this.defaultReserve));
    this.cooldownTimer = Math.max(0, Math.min(this.cooldownTimer ?? 0, this.shotCooldown));
    if (this.reloading) {
      this.reloadTimer = Math.max(0, Math.min(this.reloadTimer ?? 0, this.reloadDuration));
    }
  }

  reset() {
    this.ammo = this.magazineSize;
    this.reserve = this.defaultReserve;
    this.cooldownTimer = 0;
    this.reloadTimer = 0;
    this.reloading = false;
  }

  update(delta) {
    this.cooldownTimer = Math.max(0, this.cooldownTimer - delta);

    if (!this.reloading) {
      return;
    }

    this.reloadTimer -= delta;
    if (this.reloadTimer > 0) {
      return;
    }

    const needed = this.magazineSize - this.ammo;
    const loaded = Math.min(needed, this.reserve);
    this.ammo += loaded;
    this.reserve -= loaded;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  tryShoot() {
    if (this.reloading) {
      return { success: false, reason: "reloading" };
    }

    if (this.cooldownTimer > 0) {
      return { success: false, reason: "cooldown" };
    }

    if (this.ammo <= 0) {
      this.startReload();
      return { success: false, reason: "empty" };
    }

    this.ammo -= 1;
    this.cooldownTimer = this.shotCooldown;

    if (this.ammo === 0 && this.reserve > 0) {
      this.startReload();
    }

    return { success: true };
  }

  startReload() {
    if (this.reloading || this.ammo >= this.magazineSize || this.reserve <= 0) {
      return false;
    }

    this.reloading = true;
    this.reloadTimer = this.reloadDuration;
    return true;
  }

  refill(amount = 0) {
    let remaining = Math.max(0, Math.trunc(Number(amount) || 0));
    if (remaining <= 0) {
      return 0;
    }

    if (!this.reloading && this.ammo < this.magazineSize) {
      const ammoAdded = Math.min(remaining, this.magazineSize - this.ammo);
      this.ammo += ammoAdded;
      remaining -= ammoAdded;
    }

    if (remaining > 0 && this.reserve < this.defaultReserve) {
      const reserveAdded = Math.min(remaining, this.defaultReserve - this.reserve);
      this.reserve += reserveAdded;
      remaining -= reserveAdded;
    }

    return Math.max(0, Math.trunc(Number(amount) || 0) - remaining);
  }

  getState() {
    return {
      weaponId: this.weaponId,
      ammo: this.ammo,
      reserve: this.reserve,
      reloading: this.reloading
    };
  }
}
