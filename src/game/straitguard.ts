// StraitGuard - modular game logic, structured for easy Unity port.
import { audio } from "./audio";
import { Haptics } from "./haptics";
import { getValue, loadUpgrades } from "./upgrades";


export type Vec2 = { x: number; y: number };

export interface GameConfig {
  width: number;
  height: number;
  level: 1 | 2 | 3;
}

export type EnemyKind = "basic" | "fast" | "heavy";

export type WeaponKind = "cannon" | "mg" | "plasma" | "shell";

export class Bullet {
  alive = true;
  constructor(
    public pos: Vec2,
    public vel: Vec2,
    public damage: number,
    public from: "player" | "enemy",
    public radius = 4,
    public weapon: WeaponKind = "cannon",
  ) {}
  update(dt: number) {
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
  }
}

// Sea landmine — floating naval mine. Damages ships on contact; destructible by player fire.
export class Mine {
  alive = true;
  hp = 20;
  radius = 16;
  bob: number;
  constructor(public pos: Vec2) {
    this.bob = Math.random() * Math.PI * 2;
  }
  hitsBullet(b: Bullet) {
    const dx = b.pos.x - this.pos.x, dy = b.pos.y - this.pos.y;
    return dx * dx + dy * dy < (this.radius + b.radius) * (this.radius + b.radius);
  }
  hitsShip(s: Ship) {
    return (
      Math.abs(s.pos.x - this.pos.x) < s.size.x / 2 + this.radius * 0.7 &&
      Math.abs(s.pos.y - this.pos.y) < s.size.y / 2 + this.radius * 0.7
    );
  }
  damage(d: number) { this.hp = Math.max(0, this.hp - d); if (this.hp <= 0) this.alive = false; }
}


export class Ship {
  hp: number;
  maxHp: number;
  constructor(
    public pos: Vec2,
    public size: Vec2,
    hp: number,
  ) {
    this.hp = hp;
    this.maxHp = hp;
  }
  get alive() {
    return this.hp > 0;
  }
  damage(d: number) {
    this.hp = Math.max(0, this.hp - d);
  }
  hits(b: Bullet) {
    return (
      b.pos.x > this.pos.x - this.size.x / 2 &&
      b.pos.x < this.pos.x + this.size.x / 2 &&
      b.pos.y > this.pos.y - this.size.y / 2 &&
      b.pos.y < this.pos.y + this.size.y / 2
    );
  }
}

export class PlayerShipController extends Ship {
  fireCooldown = 0;
  fireRate = 0.18;
  target: Vec2 | null = null;
  speed = 380;
  tripleTimer = 0; // seconds remaining of triple-shot
  tripleDuration = 10; // for HUD ratio display
  constructor(pos: Vec2, hp = 100, speed = 380) {
    super(pos, { x: 34, y: 46 }, hp);
    this.speed = speed;
  }
  setTarget(p: Vec2 | null) { this.target = p; }
  update(dt: number, bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
    if (this.target) {
      const dx = this.target.x - this.pos.x;
      const dy = this.target.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const step = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.y += (dy / d) * step;
      }
    }
    this.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.pos.x));
    this.pos.y = Math.max(bounds.minY, Math.min(bounds.maxY, this.pos.y));
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.tripleTimer = Math.max(0, this.tripleTimer - dt);
  }
  activateTriple(seconds = 10) {
    this.tripleDuration = seconds;
    this.tripleTimer = seconds;
  }
  tryFire(): Bullet[] {
    if (this.fireCooldown > 0) return [];
    this.fireCooldown = this.fireRate;
    audio.play("fire");
    const originY = this.pos.y - this.size.y / 2;
    if (this.tripleTimer > 0) {
      // Spread cone: straight + ±14° left/right.
      const speed = 560;
      const ang = 14 * Math.PI / 180;
      return [
        new Bullet({ x: this.pos.x, y: originY }, { x: 0, y: -speed }, 10, "player", 4, "cannon"),
        new Bullet({ x: this.pos.x, y: originY }, { x: -Math.sin(ang) * speed, y: -Math.cos(ang) * speed }, 9, "player", 4, "cannon"),
        new Bullet({ x: this.pos.x, y: originY }, { x:  Math.sin(ang) * speed, y: -Math.cos(ang) * speed }, 9, "player", 4, "cannon"),
      ];
    }
    return [new Bullet({ x: this.pos.x, y: originY }, { x: 0, y: -560 }, 10, "player", 4, "cannon")];
  }
}

export class CargoShipController extends Ship {
  speed = 28;
  constructor(pos: Vec2) {
    super(pos, { x: 60, y: 90 }, 300);
  }
  update(dt: number) {
    this.pos.y -= this.speed * dt;
  }
}

export class EnemyController extends Ship {
  fireCooldown: number;
  fireRate: number;
  speed: number;
  bulletDamage: number;
  color: string;
  constructor(public kind: EnemyKind, pos: Vec2, public fromSide: "left" | "right", damageMul = 1, speedMul = 1) {
    let hp = 20, size = { x: 30, y: 30 }, fireRate = 1.6, speed = 60, dmg = 6, color = "#c44";
    if (kind === "fast") { hp = 14; size = { x: 26, y: 26 }; fireRate = 1.4; speed = 130; dmg = 5; color = "#e8a"; }
    if (kind === "heavy") { hp = 60; size = { x: 42, y: 42 }; fireRate = 2.2; speed = 35; dmg = 14; color = "#933"; }
    super(pos, size, hp);
    this.fireRate = fireRate;
    this.fireCooldown = Math.random() * fireRate;
    this.speed = speed * speedMul;
    this.bulletDamage = dmg * damageMul;
    this.color = color;
  }
  update(dt: number, target: Vec2, maxY: number): Bullet | null {
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 160) {
      this.pos.x += (dx / d) * this.speed * dt;
      this.pos.y += (dy / d) * this.speed * dt;
    } else {
      this.pos.y += (dy / d) * this.speed * 0.4 * dt;
    }
    // Clamp: enemies must stay in front of (above) the player's firing line.
    if (this.pos.y > maxY) this.pos.y = maxY;
    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0) {
      this.fireCooldown = this.fireRate;
      const sp = this.kind === "fast" ? 320 : this.kind === "heavy" ? 200 : 240;
      const weapon: WeaponKind = this.kind === "fast" ? "plasma" : this.kind === "heavy" ? "shell" : "mg";
      const radius = this.kind === "heavy" ? 6 : this.kind === "fast" ? 3 : 4;
      return new Bullet(
        { x: this.pos.x, y: this.pos.y },
        { x: (dx / d) * sp, y: (dy / d) * sp },
        this.bulletDamage,
        "enemy",
        radius,
        weapon,
      );
    }
    return null;

  }
}

export interface LevelSettings {
  spawnInterval: [number, number];
  maxEnemies: number;
  weights: Record<EnemyKind, number>;
  cargoSpeed: number;
  durationPx: number;
  playerHp: number;
  enemyDamageMul: number;
  enemySpeedMul: number;
}

export const LEVELS: Record<1 | 2 | 3, LevelSettings> = {
  1: { spawnInterval: [2.8, 4.2], maxEnemies: 3, weights: { basic: 1, fast: 0, heavy: 0 }, cargoSpeed: 22, durationPx: 3600, playerHp: 150, enemyDamageMul: 0.7, enemySpeedMul: 0.8 },
  2: { spawnInterval: [1.2, 2.0], maxEnemies: 8, weights: { basic: 0.45, fast: 0.4, heavy: 0.15 }, cargoSpeed: 32, durationPx: 5400, playerHp: 115, enemyDamageMul: 1.1, enemySpeedMul: 1.05 },
  3: { spawnInterval: [0.7, 1.3], maxEnemies: 12, weights: { basic: 0.3, fast: 0.45, heavy: 0.25 }, cargoSpeed: 38, durationPx: 6800, playerHp: 105, enemyDamageMul: 1.25, enemySpeedMul: 1.2 },
};

export class EnemySpawner {
  timer = 1.0;
  constructor(public settings: LevelSettings) {}
  pickKind(): EnemyKind {
    const r = Math.random();
    let acc = 0;
    for (const k of ["basic", "fast", "heavy"] as EnemyKind[]) {
      acc += this.settings.weights[k];
      if (r <= acc) return k;
    }
    return "basic";
  }
  update(dt: number, current: number, width: number, cargoY: number): EnemyController | null {
    if (current >= this.settings.maxEnemies) return null;
    this.timer -= dt;
    if (this.timer > 0) return null;
    const [a, b] = this.settings.spawnInterval;
    this.timer = a + Math.random() * (b - a);
    const side: "left" | "right" = Math.random() < 0.5 ? "left" : "right";
    const x = side === "left" ? 20 : width - 20;
    // Spawn ABOVE the cargo so enemies approach from in front, never from behind.
    const y = cargoY - 200 - Math.random() * 400;
    return new EnemyController(this.pickKind(), { x, y }, side, this.settings.enemyDamageMul, this.settings.enemySpeedMul);
  }
}

export type PowerupKind = "bomb" | "shield" | "triple";

export class Powerup {
  alive = true;
  radius = 18;
  bob: number;
  vy = 55;
  drift: number;
  age = 0;
  constructor(public kind: PowerupKind, public pos: Vec2) {
    this.bob = Math.random() * Math.PI * 2;
    this.drift = (Math.random() - 0.5) * 30;
  }
  update(dt: number) {
    this.age += dt;
    this.pos.y += this.vy * dt;
    this.pos.x += Math.sin(this.age * 1.5 + this.bob) * this.drift * dt;
  }
  hitsShip(s: Ship) {
    return (
      Math.abs(s.pos.x - this.pos.x) < s.size.x / 2 + this.radius * 0.8 &&
      Math.abs(s.pos.y - this.pos.y) < s.size.y / 2 + this.radius * 0.8
    );
  }
}

// Kamikaze suicide boat: fast small craft that homes on cargo and detonates on contact.
export class Kamikaze {
  alive = true;
  hp = 15;
  maxHp = 15;
  size = { x: 22, y: 28 };
  speed = 190;
  angle = 0;
  wobble: number;
  constructor(public pos: Vec2) {
    this.wobble = Math.random() * Math.PI * 2;
  }
  update(dt: number, target: Vec2) {
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    // slight wobble for menace
    this.wobble += dt * 6;
    const wob = Math.sin(this.wobble) * 0.4;
    const nx = dx / d, ny = dy / d;
    // perpendicular wobble
    const px = -ny * wob, py = nx * wob;
    this.pos.x += (nx + px) * this.speed * dt;
    this.pos.y += (ny + py) * this.speed * dt;
    this.angle = Math.atan2(ny + py, nx + px);
  }
  damage(d: number) { this.hp = Math.max(0, this.hp - d); if (this.hp <= 0) this.alive = false; }
  hitsBullet(b: Bullet) {
    return (
      Math.abs(b.pos.x - this.pos.x) < this.size.x / 2 + b.radius &&
      Math.abs(b.pos.y - this.pos.y) < this.size.y / 2 + b.radius
    );
  }
  hitsShip(s: Ship) {
    return (
      Math.abs(s.pos.x - this.pos.x) < s.size.x / 2 + this.size.x / 2 &&
      Math.abs(s.pos.y - this.pos.y) < s.size.y / 2 + this.size.y / 2
    );
  }
}

// Burning ship wreckage — decorative, drifts downward with the current.
// Non-interactive: no collisions with any gameplay entity.
export type WreckageVariant = "hull" | "crates" | "bow";
export class Wreckage {
  alive = true;
  vy: number;
  rot: number;
  vr: number;
  seed: number;
  age = 0;
  size: number;
  constructor(public pos: Vec2, public variant: WreckageVariant, cargoSpeed: number) {
    // Drift slightly faster than cargo for a parallax feel.
    this.vy = cargoSpeed * (1.05 + Math.random() * 0.25) + 8;
    this.rot = (Math.random() - 0.5) * 0.6;
    this.vr = (Math.random() - 0.5) * 0.15;
    this.seed = Math.random() * 1000;
    this.size = 34 + Math.random() * 22;
  }
  update(dt: number) {
    this.age += dt;
    this.pos.y += this.vy * dt;
    this.rot += this.vr * dt;
  }
}

export type GameStatus = "menu" | "playing" | "paused" | "win" | "lose";

export class GameManager {
  status: GameStatus = "menu";
  player!: PlayerShipController;
  cargo!: CargoShipController;
  enemies: EnemyController[] = [];
  bullets: Bullet[] = [];
  mines: Mine[] = [];
  mineTimer = 3;
  powerups: Powerup[] = [];
  powerupTimer = 6;
  bombs = 0;
  maxBombs = 3;
  kamikazes: Kamikaze[] = [];
  kamikazeTimer = 8;
  wreckages: Wreckage[] = [];
  wreckageTimer = 8;
  // Optional callback so UI can react to inventory/HP changes instantly.
  onEvent: ((ev: "pickup-bomb" | "pickup-shield" | "pickup-triple" | "bomb-used" | "kamikaze-hit") => void) | null = null;
  spawner!: EnemySpawner;
  level: 1 | 2 | 3 = 1;
  width: number;
  height: number;
  cargoStartY = 0;
  travelled = 0;
  cameraY = 0;
  score = 0;
  kills = 0;


  constructor(cfg: GameConfig) {
    this.width = cfg.width;
    this.height = cfg.height;
    this.level = cfg.level;
  }

  start(level: 1 | 2 | 3) {
    this.level = level;
    const settings = { ...LEVELS[level] };
    this.spawner = new EnemySpawner(settings);
    // Apply persisted upgrades.
    const ups = loadUpgrades();
    const cargoHp = getValue("cargoArmor", ups);
    const frigateSpeed = getValue("frigateSpeed", ups);
    this.maxBombs = getValue("bombCapacity", ups);
    this.cargo = new CargoShipController({ x: this.width / 2, y: this.height - 120 });
    this.cargo.speed = settings.cargoSpeed;
    this.cargo.hp = cargoHp;
    this.cargo.maxHp = cargoHp;
    this.cargoStartY = this.cargo.pos.y;
    this.player = new PlayerShipController({ x: this.width / 2, y: this.height - 220 }, settings.playerHp, frigateSpeed);
    this.enemies = [];
    this.bullets = [];
    this.mines = [];
    this.mineTimer = level === 1 ? 6 : level === 2 ? 4 : 2.5;
    this.powerups = [];
    this.powerupTimer = 5 + Math.random() * 4;
    this.kamikazes = [];
    this.kamikazeTimer = level === 1 ? 14 : level === 2 ? 9 : 6;
    this.wreckages = [];
    this.wreckageTimer = 4 + Math.random() * 6;
    this.bombs = 0;
    this.travelled = 0;
    this.cameraY = 0;
    this.score = 0;
    this.kills = 0;
    this.status = "playing";
  }



  resize(w: number, h: number) {
    const prevW = this.width, prevH = this.height;
    this.width = w; this.height = h;
    if (this.player && prevW > 0 && prevH > 0) {
      const sx = w / prevW, sy = h / prevH;
      this.player.pos.x *= sx; this.player.pos.y *= sy;
      this.cargo.pos.x *= sx; this.cargo.pos.y *= sy;
      for (const e of this.enemies) { e.pos.x *= sx; e.pos.y *= sy; }
    }
  }
  pause() { if (this.status === "playing") this.status = "paused"; }
  resume() { if (this.status === "paused") this.status = "playing"; }

  update(dt: number) {
    if (this.status !== "playing") return;
    const settings = LEVELS[this.level];

    this.cargo.update(dt);
    const desiredCargoScreenY = this.height - 140;
    const shift = desiredCargoScreenY - this.cargo.pos.y;
    if (shift > 0) {
      this.cargo.pos.y += shift;
      this.player.pos.y += shift;
      for (const e of this.enemies) e.pos.y += shift;
      for (const b of this.bullets) b.pos.y += shift;
      for (const m of this.mines) m.pos.y += shift;
      for (const p of this.powerups) p.pos.y += shift;
      for (const k of this.kamikazes) k.pos.y += shift;
      for (const w of this.wreckages) w.pos.y += shift;
      this.cameraY += shift;
      this.travelled += shift;
    }

    // --- Wreckage spawner (decorative, non-interactive) ---
    this.wreckageTimer -= dt;
    if (this.wreckageTimer <= 0) {
      this.wreckageTimer = 15 + Math.random() * 15;
      const laneMin = 130, laneMax = this.width - 130;
      if (laneMax > laneMin) {
        const wx = laneMin + Math.random() * (laneMax - laneMin);
        const variants: WreckageVariant[] = ["hull", "crates", "bow"];
        const v = variants[Math.floor(Math.random() * variants.length)];
        this.wreckages.push(new Wreckage({ x: wx, y: -60 }, v, settings.cargoSpeed));
      }
    }
    for (const w of this.wreckages) w.update(dt);
    this.wreckages = this.wreckages.filter((w) => w.alive && w.pos.y < this.height + 120);




    const sideMargin = Math.max(28, Math.min(60, this.width * 0.08));
    this.player.update(dt, {
      minX: sideMargin, maxX: this.width - sideMargin,
      minY: 40, maxY: this.height - 40,
    });
    const pbs = this.player.tryFire();
    for (const pb of pbs) this.bullets.push(pb);

    const ne = this.spawner.update(dt, this.enemies.length, this.width, this.cargo.pos.y);
    if (ne) this.enemies.push(ne);

    // Enemy firing line: never below the player's bow (turret).
    const enemyMaxY = this.player.pos.y - this.player.size.y / 2 - 10;

    for (const e of this.enemies) {
      const target = Math.random() < 0.4 ? this.player.pos : this.cargo.pos;
      const eb = e.update(dt, target, enemyMaxY);
      if (eb) this.bullets.push(eb);
    }

    // Spawn sea mines periodically ahead of the cargo, within the water lane.
    this.mineTimer -= dt;
    if (this.mineTimer <= 0) {
      const base = this.level === 1 ? 5.5 : this.level === 2 ? 3.5 : 2.2;
      this.mineTimer = base + Math.random() * base * 0.6;
      const laneMin = 130, laneMax = this.width - 130;
      if (laneMax > laneMin) {
        const mx = laneMin + Math.random() * (laneMax - laneMin);
        const my = this.cargo.pos.y - 260 - Math.random() * 340;
        this.mines.push(new Mine({ x: mx, y: my }));
      }
    }

    for (const b of this.bullets) {
      b.update(dt);
      if (b.from === "player") {
        // Player bullets can destroy mines.
        let consumed = false;
        for (const m of this.mines) {
          if (m.alive && m.hitsBullet(b)) {
            m.damage(b.damage); b.alive = false; consumed = true;
            if (!m.alive) {
              audio.play("explosion");
              this.score += 75;
              Haptics.pulse("light");
            } else {
              audio.play("hit");
            }
            break;
          }
        }
        if (consumed) continue;
        // Player bullets can destroy kamikaze boats.
        for (const k of this.kamikazes) {
          if (k.alive && k.hitsBullet(b)) {
            k.damage(b.damage); b.alive = false; consumed = true;
            if (!k.alive) {
              audio.play("explosion");
              this.score += 120;
              this.kills += 1;
              Haptics.pulse("light");
            } else {
              audio.play("hit");
              this.score += 3;
            }
            break;
          }
        }
        if (consumed) continue;
        for (const e of this.enemies) {
          if (e.alive && e.hits(b)) {
            e.damage(b.damage); b.alive = false;
            if (!e.alive) {
              audio.play("explosion");
              this.kills += 1;
              const bounty = e.kind === "heavy" ? 250 : e.kind === "fast" ? 150 : 100;
              this.score += bounty;
              Haptics.pulse("light"); // scored a point / destroyed enemy
            } else {
              audio.play("hit");
              this.score += 5;
            }
            break;
          }

        }
      } else {
        if (this.player.hits(b)) {
          this.player.damage(b.damage); b.alive = false; audio.play("hit");
          Haptics.pulse("hit"); // player got hit
        }
        else if (this.cargo.hits(b)) {
          this.cargo.damage(b.damage); b.alive = false; audio.play("hit");
          Haptics.pulse("hit"); // cargo (escorted vehicle) got hit
        }
      }
      if (b.pos.x < -20 || b.pos.x > this.width + 20 || b.pos.y < -40 || b.pos.y > this.height + 40) {
        b.alive = false;
      }
    }

    // Ship-vs-mine contact damage.
    for (const m of this.mines) {
      if (!m.alive) continue;
      if (m.hitsShip(this.cargo)) {
        this.cargo.damage(40); m.alive = false;
        audio.play("explosion"); Haptics.pulse("hit");
      } else if (m.hitsShip(this.player)) {
        this.player.damage(30); m.alive = false;
        audio.play("explosion"); Haptics.pulse("hit");
      }
    }
    this.mines = this.mines.filter((m) => m.alive && m.pos.y < this.height + 80);

    // --- Kamikaze boats ---
    this.kamikazeTimer -= dt;
    if (this.kamikazeTimer <= 0) {
      const base = this.level === 1 ? 16 : this.level === 2 ? 10 : 6.5;
      this.kamikazeTimer = base + Math.random() * base * 0.5;
      // Spawn from top-left or top-right corner region.
      const side = Math.random() < 0.5 ? "L" : "R";
      const kx = side === "L" ? 130 + Math.random() * 40 : this.width - 130 - Math.random() * 40;
      const ky = -30 - Math.random() * 40;
      this.kamikazes.push(new Kamikaze({ x: kx, y: ky }));
    }
    for (const k of this.kamikazes) {
      if (!k.alive) continue;
      k.update(dt, this.cargo.pos);
      if (k.hitsShip(this.cargo)) {
        this.cargo.damage(60); k.alive = false;
        audio.play("explosion"); Haptics.pulse("gameover");
        this.onEvent?.("kamikaze-hit");
      } else if (k.hitsShip(this.player)) {
        this.player.damage(40); k.alive = false;
        audio.play("explosion"); Haptics.pulse("hit");
      }
    }
    this.kamikazes = this.kamikazes.filter((k) => k.alive && k.pos.y < this.height + 80);

    // --- Powerup spawn (low probability, from top of screen) ---
    this.powerupTimer -= dt;
    if (this.powerupTimer <= 0) {
      const base = this.level === 1 ? 12 : this.level === 2 ? 14 : 16;
      this.powerupTimer = base + Math.random() * base * 0.7;
      const laneMin = 140, laneMax = this.width - 140;
      if (laneMax > laneMin) {
        const px = laneMin + Math.random() * (laneMax - laneMin);
        // Weighted: 45% shield, 30% triple-shot, 25% bomb.
        const r = Math.random();
        const kind: PowerupKind = r < 0.45 ? "shield" : r < 0.75 ? "triple" : "bomb";
        this.powerups.push(new Powerup(kind, { x: px, y: -30 }));
      }
    }
    for (const p of this.powerups) {
      p.update(dt);
      if (!p.alive) continue;
      if (p.hitsShip(this.player) || p.hitsShip(this.cargo)) {
        p.alive = false;
        audio.play("win");
        Haptics.pulse("light");
        if (p.kind === "bomb") {
          this.bombs = Math.min(this.maxBombs, this.bombs + 1);
          this.onEvent?.("pickup-bomb");
        } else if (p.kind === "triple") {
          this.player.activateTriple(10);
          this.onEvent?.("pickup-triple");
        } else {
          // Heal player: +40 HP, allow modest overheal above starting maxHp.
          const cap = Math.max(this.player.maxHp, this.player.hp + 40);
          this.player.hp = Math.min(cap, this.player.hp + 40);
          if (cap > this.player.maxHp) this.player.maxHp = cap;
          this.onEvent?.("pickup-shield");
        }
      }
    }
    this.powerups = this.powerups.filter((p) => p.alive && p.pos.y < this.height + 40);

    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemies = this.enemies.filter((e) => e.alive && e.pos.y < this.height + 80);

    if (!this.cargo.alive || !this.player.alive) {
      this.status = "lose"; audio.play("lose"); audio.stopMusic();
      Haptics.pulse("gameover");
    }
    else if (this.travelled >= settings.durationPx) {
      // Arrival bonuses: cargo & frigate HP + level multiplier.
      const hpBonus = Math.round(this.cargo.hp * 3 + this.player.hp * 2);
      const levelBonus = this.level * 500;
      this.score += hpBonus + levelBonus;
      this.status = "win"; audio.play("win"); audio.stopMusic();
      Haptics.pulse("medium");
    }
  }



  progress(): number {
    return Math.min(1, this.travelled / LEVELS[this.level].durationPx);
  }

  // Mega-Bomb: wipe all active enemies, award cumulative bounty, flag FX.
  megaBombFlash = 0; // seconds remaining of screen-clear flash (renderer reads this)
  useBomb(): boolean {
    if (this.status !== "playing" || this.bombs <= 0) return false;
    this.bombs -= 1;
    let bounty = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const b = e.kind === "heavy" ? 250 : e.kind === "fast" ? 150 : 100;
      bounty += b;
      this.kills += 1;
      e.hp = 0;
    }
    // Also detonate mines on screen.
    for (const m of this.mines) if (m.alive) { m.hp = 0; m.alive = false; bounty += 75; }
    this.score += bounty;
    this.megaBombFlash = 0.9;
    audio.play("explosion");
    audio.play("win");
    Haptics.pulse("gameover");
    this.onEvent?.("bomb-used");
    return true;
  }
}
