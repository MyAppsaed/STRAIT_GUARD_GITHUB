// StraitGuard - modular game logic, structured for easy Unity port.
import { audio } from "./audio";
import { Haptics } from "./haptics";


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
  constructor(pos: Vec2, hp = 100) {
    super(pos, { x: 34, y: 46 }, hp);
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
  }
  tryFire(): Bullet | null {
    if (this.fireCooldown > 0) return null;
    this.fireCooldown = this.fireRate;
    audio.play("fire");
    return new Bullet({ x: this.pos.x, y: this.pos.y - this.size.y / 2 }, { x: 0, y: -560 }, 10, "player");
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
      const sp = 240;
      return new Bullet(
        { x: this.pos.x, y: this.pos.y },
        { x: (dx / d) * sp, y: (dy / d) * sp },
        this.bulletDamage,
        "enemy",
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

export type GameStatus = "menu" | "playing" | "paused" | "win" | "lose";

export class GameManager {
  status: GameStatus = "menu";
  player!: PlayerShipController;
  cargo!: CargoShipController;
  enemies: EnemyController[] = [];
  bullets: Bullet[] = [];
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
    this.cargo = new CargoShipController({ x: this.width / 2, y: this.height - 120 });
    this.cargo.speed = settings.cargoSpeed;
    this.cargoStartY = this.cargo.pos.y;
    this.player = new PlayerShipController({ x: this.width / 2, y: this.height - 220 }, settings.playerHp);
    this.enemies = [];
    this.bullets = [];
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
      this.cameraY += shift;
      this.travelled += shift;
    }

    const sideMargin = Math.max(28, Math.min(60, this.width * 0.08));
    this.player.update(dt, {
      minX: sideMargin, maxX: this.width - sideMargin,
      minY: 40, maxY: this.height - 40,
    });
    const pb = this.player.tryFire();
    if (pb) this.bullets.push(pb);

    const ne = this.spawner.update(dt, this.enemies.length, this.width, this.cargo.pos.y);
    if (ne) this.enemies.push(ne);

    // Enemy firing line: never below the player's bow (turret).
    const enemyMaxY = this.player.pos.y - this.player.size.y / 2 - 10;

    for (const e of this.enemies) {
      const target = Math.random() < 0.4 ? this.player.pos : this.cargo.pos;
      const eb = e.update(dt, target, enemyMaxY);
      if (eb) this.bullets.push(eb);
    }

    for (const b of this.bullets) {
      b.update(dt);
      if (b.from === "player") {
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
}
