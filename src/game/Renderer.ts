import type { GameManager, EnemyController, Bullet, Mine, WeaponKind, Powerup, Kamikaze, Wreckage } from "./straitguard";

// ---- Per-weapon VFX palette ----
// Behavior unchanged; visuals only. Each weapon defines muzzle/tracer/head/glow/impact.
type WeaponFx = {
  head: string; glow: string; trail: string; // trail is an rgb triplet "r,g,b"
  muzzle: string; trailLen: number;
  impact: "spark" | "splash" | "shell" | "plasma";
};
const WEAPON_FX: Record<WeaponKind, WeaponFx> = {
  cannon:  { head: "#e8fff0", glow: "#7df2b0", trail: "180,255,210", muzzle: "#c9ffe0", trailLen: 8,  impact: "splash" },
  mg:      { head: "#ffe89a", glow: "#ffae3a", trail: "255,200,120", muzzle: "#ffd870", trailLen: 6,  impact: "spark"  },
  plasma:  { head: "#f5a8ff", glow: "#c33aff", trail: "230,150,255", muzzle: "#f0a0ff", trailLen: 10, impact: "plasma" },
  shell:   { head: "#ffd0a0", glow: "#ff5a1a", trail: "255,140,80",  muzzle: "#ffb060", trailLen: 12, impact: "shell"  },
};


// ============================================================================
// STRAITGUARD — Renderer (visual overhaul).
// Public API unchanged: render(ctx, g).
// All gameplay, damage, speeds, spawns, and controls remain in straitguard.ts.
// This module only adds visual variety + particle FX (muzzle flash, tracers,
// explosions, water splashes) tracked between frames via WeakSet/WeakMap.
// ============================================================================

// -------- Deterministic pseudo-random (stable per key) --------
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// -------- Frame-timing (for animations) --------
let _lastT = 0;
let _dt = 1 / 60;
let _t = 0;

// -------- Particle FX --------
type Particle = {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  size: number; color: string;
  kind: "spark" | "smoke" | "ring" | "debris" | "splash" | "flash";
  rot?: number; vr?: number;
};
const particles: Particle[] = [];

// -------- Change-detection state --------
const seenEnemies = new WeakSet<EnemyController>();
const seenBullets = new WeakSet<Bullet>();
const enemyMeta = new WeakMap<EnemyController, {
  variant: number;
  seed: number;
  hitFlash: number;
  lastHp: number;
  muzzle: number; // muzzle-flash timer
}>();
const bulletMeta = new WeakMap<Bullet, {
  trail: { x: number; y: number; a: number }[];
  seed: number;
}>();
const playerMeta = { muzzle: 0, lastFireCd: 0 };

function getEnemyMeta(e: EnemyController) {
  let m = enemyMeta.get(e);
  if (!m) {
    const seed = Math.random() * 1000;
    const variant = Math.floor(hash(seed) * 3); // 0,1,2 per kind
    m = { variant, seed, hitFlash: 0, lastHp: e.hp, muzzle: 0 };
    enemyMeta.set(e, m);
  }
  return m;
}

function getBulletMeta(b: Bullet) {
  let m = bulletMeta.get(b);
  if (!m) {
    m = { trail: [], seed: Math.random() * 1000 };
    bulletMeta.set(b, m);
  }
  return m;
}

// -------- Particle helpers --------
function emitExplosion(x: number, y: number, scale = 1) {
  // core flash
  particles.push({
    x, y, vx: 0, vy: 0, life: 0.18, maxLife: 0.18,
    size: 26 * scale, color: "#fff2b8", kind: "flash",
  });
  // sparks
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (60 + Math.random() * 160) * scale;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.35, maxLife: 0.85,
      size: 2 + Math.random() * 2,
      color: Math.random() < 0.5 ? "#ffcf5e" : "#ff7a3a",
      kind: "spark",
    });
  }
  // smoke puffs
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 20 + Math.random() * 40;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10,
      life: 0.9 + Math.random() * 0.6, maxLife: 1.5,
      size: (10 + Math.random() * 10) * scale,
      color: "rgba(60,55,50,0.55)",
      kind: "smoke",
    });
  }
  // shock ring
  particles.push({
    x, y, vx: 0, vy: 0, life: 0.35, maxLife: 0.35,
    size: 6 * scale, color: "rgba(255,220,140,0.9)", kind: "ring",
  });
  // debris
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (40 + Math.random() * 90) * scale;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.7, maxLife: 0.7,
      size: 2 + Math.random() * 2,
      color: "#2a2622", kind: "debris",
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 8,
    });
  }
}

function emitSplash(x: number, y: number) {
  particles.push({
    x, y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3,
    size: 4, color: "rgba(255,255,255,0.8)", kind: "ring",
  });
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const sp = 40 + Math.random() * 60;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.35, maxLife: 0.35,
      size: 1.5, color: "rgba(200,230,255,0.9)", kind: "splash",
    });
  }
}

function emitMuzzle(x: number, y: number, dir: number, color = "#fff2b8") {
  particles.push({
    x, y, vx: 0, vy: 0, life: 0.09, maxLife: 0.09,
    size: 10, color, kind: "flash", rot: dir,
  });
  for (let i = 0; i < 3; i++) {
    const spread = (Math.random() - 0.5) * 0.6;
    const sp = 120 + Math.random() * 60;
    particles.push({
      x, y,
      vx: Math.cos(dir + spread) * sp,
      vy: Math.sin(dir + spread) * sp,
      life: 0.18, maxLife: 0.18,
      size: 1.5, color: "#ffdb7a", kind: "spark",
    });
  }
}

function updateParticles(dt: number) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    if (p.rot !== undefined && p.vr !== undefined) p.rot += p.vr * dt;
    if (p.kind === "smoke") p.size += 12 * dt;
    if (p.kind === "ring") p.size += 120 * dt;
    p.life -= dt;
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life <= 0) particles.splice(i, 1);
  }
  // cap
  if (particles.length > 400) particles.splice(0, particles.length - 400);
}

function drawParticles(ctx: CanvasRenderingContext2D) {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    if (p.kind === "flash") {
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "ring") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2 * a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "smoke") {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "debris") {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot ?? 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    } else {
      // spark / splash
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ============================================================================
// Main render
// ============================================================================
export function render(ctx: CanvasRenderingContext2D, g: GameManager) {
  const { width: W, height: H } = g;

  // dt
  const now = performance.now() / 1000;
  _dt = _lastT ? Math.min(0.05, now - _lastT) : 1 / 60;
  _lastT = now;
  _t += _dt;

  // ---------- WATER ----------
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#062a44");
  grd.addColorStop(0.55, "#0a3b5a");
  grd.addColorStop(1, "#0d4666");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // caustic sheen
  ctx.fillStyle = "rgba(120,190,220,0.05)";
  for (let i = 0; i < 30; i++) {
    const seed = i * 17.3;
    const x = 130 + hash(seed) * (W - 260);
    const y = ((hash(seed * 2.1) * (H + 120) + g.cameraY * 0.4) % (H + 120)) - 60;
    const w = 30 + hash(seed * 3.7) * 60;
    ctx.beginPath();
    ctx.ellipse(x, y, w, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // wave stripes
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  const stripeH = 22;
  const offset = (g.cameraY * 0.6) % stripeH;
  for (let y = -stripeH + offset; y < H; y += stripeH * 2) {
    ctx.fillRect(120, y, W - 240, stripeH);
  }

  // ---------- LAND ----------
  const landW = 110;
  ctx.fillStyle = "#3b2a1c";
  ctx.fillRect(0, 0, landW, H);
  ctx.fillRect(W - landW, 0, landW, H);
  ctx.fillStyle = "#3a5a2a";
  ctx.fillRect(0, 0, landW - 22, H);
  ctx.fillRect(W - landW + 22, 0, landW - 22, H);
  ctx.fillStyle = "#c9b178";
  ctx.fillRect(landW - 22, 0, 14, H);
  ctx.fillRect(W - landW + 8, 0, 14, H);
  // jagged shore
  ctx.fillStyle = "#0d4666";
  for (let y = 0; y < H; y += 12) {
    const jL = ((Math.sin((y + g.cameraY) * 0.07) + 1) / 2) * 8;
    const jR = ((Math.cos((y + g.cameraY) * 0.07) + 1) / 2) * 8;
    ctx.fillRect(landW - 8, y, jL, 12);
    ctx.fillRect(W - landW + 8 - jR, y, jR, 12);
  }

  drawScenery(ctx, g.cameraY, H, landW, W);

  // ---------- WRECKAGE (background parallax layer, below all gameplay) ----------
  drawWreckages(ctx, g.wreckages, _dt);

  // progress bar
  const prog = g.progress();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(landW, 14, W - landW * 2, 4);
  ctx.fillStyle = `rgba(255,200,60,0.95)`;
  ctx.fillRect(landW, 14, (W - landW * 2) * prog, 4);

  if (prog > 0.82) {
    const finishWorldY = -200;
    const finishScreenY = finishWorldY + g.cameraY;
    if (finishScreenY > -40 && finishScreenY < H) {
      drawFinishLine(ctx, finishScreenY, landW, W, Math.min(1, (prog - 0.82) / 0.18));
    }
  }

  // ---------- SHIPS ----------
  drawWake(ctx, g.cargo.pos.x, g.cargo.pos.y + g.cargo.size.y / 2, g.cargo.size.x * 0.8, 80);
  drawCargoShip(ctx, g.cargo.pos.x, g.cargo.pos.y, g.cargo.size.x, g.cargo.size.y);
  drawHpBar(ctx, g.cargo.pos.x, g.cargo.pos.y - g.cargo.size.y / 2 - 12, 70, g.cargo.hp / g.cargo.maxHp, "CARGO");

  // ---------- ENEMY tracking (spawn/hit/kill detection) ----------
  const aliveEnemies = new WeakSet<EnemyController>();
  for (const e of g.enemies) {
    aliveEnemies.add(e);
    const m = getEnemyMeta(e);
    if (!seenEnemies.has(e)) {
      seenEnemies.add(e);
      m.lastHp = e.hp;
    }
    if (e.hp < m.lastHp) m.hitFlash = 0.12;
    m.lastHp = e.hp;
    m.hitFlash = Math.max(0, m.hitFlash - _dt);
    m.muzzle = Math.max(0, m.muzzle - _dt);

    drawEnemyBoat(ctx, e, m);
    drawHpBar(ctx, e.pos.x, e.pos.y - e.size.y / 2 - 10, e.size.x + 14, e.hp / e.maxHp);
  }

  // ---------- Player (defender) ----------
  drawWake(ctx, g.player.pos.x, g.player.pos.y + g.player.size.y / 2, g.player.size.x * 0.7, 50);
  // detect player fire by cooldown reset
  if (g.player.fireCooldown > playerMeta.lastFireCd + 0.001) {
    playerMeta.muzzle = 0.09;
    emitMuzzle(g.player.pos.x, g.player.pos.y - g.player.size.y / 2 - 4, -Math.PI / 2, "#c9ffe0");
  }
  playerMeta.lastFireCd = g.player.fireCooldown;
  playerMeta.muzzle = Math.max(0, playerMeta.muzzle - _dt);
  drawFrigate(ctx, g.player.pos.x, g.player.pos.y, g.player.size.x, g.player.size.y, playerMeta.muzzle);
  // Triple-shot power-up countdown ring around the frigate.
  if (g.player.tripleTimer > 0 && g.player.tripleDuration > 0) {
    const frac = Math.max(0, Math.min(1, g.player.tripleTimer / g.player.tripleDuration));
    const rad = Math.max(g.player.size.x, g.player.size.y) * 0.75;
    ctx.save();
    ctx.strokeStyle = "rgba(20,30,40,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.player.pos.x, g.player.pos.y, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#7df2b0";
    ctx.shadowColor = "#7df2b0";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(g.player.pos.x, g.player.pos.y, rad, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  drawHpBar(ctx, g.player.pos.x, g.player.pos.y - g.player.size.y / 2 - 12, 60, g.player.hp / g.player.maxHp, "FRIGATE");

  // ---------- BULLETS: per-weapon tracer + muzzle flash on birth ----------
  const aliveBullets = new WeakSet<Bullet>();
  for (const b of g.bullets) {
    aliveBullets.add(b);
    const fx = WEAPON_FX[b.weapon] ?? WEAPON_FX.cannon;
    const bm = getBulletMeta(b);
    if (!seenBullets.has(b)) {
      seenBullets.add(b);
      if (b.from === "enemy") {
        const dir = Math.atan2(b.vel.y, b.vel.x);
        emitMuzzle(b.pos.x, b.pos.y, dir, fx.muzzle);
      }
    }
    bm.trail.push({ x: b.pos.x, y: b.pos.y, a: 1 });
    if (bm.trail.length > fx.trailLen) bm.trail.shift();

    // trail
    for (let i = 0; i < bm.trail.length; i++) {
      const t = bm.trail[i];
      const alpha = (i / bm.trail.length) * 0.75;
      ctx.beginPath();
      ctx.fillStyle = `rgba(${fx.trail},${alpha})`;
      ctx.arc(t.x, t.y, b.radius * (0.4 + i / bm.trail.length * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    // head glow
    ctx.save();
    ctx.shadowColor = fx.glow;
    ctx.shadowBlur = b.weapon === "shell" ? 16 : b.weapon === "plasma" ? 14 : 10;
    ctx.fillStyle = fx.head;
    ctx.beginPath();
    ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------- MINES ----------
  drawMines(ctx, g.mines);
  detectMineDeaths(g);

  // ---------- POWERUPS ----------
  drawPowerups(ctx, g.powerups);

  // ---------- KAMIKAZE boats ----------
  drawKamikazes(ctx, g.kamikazes);
  detectKamikazeDeaths(g);

  // ---------- Detect killed enemies/bullets (explosions, impacts) ----------
  detectEnemyDeaths(g, aliveEnemies);
  detectBulletDeaths(g, aliveBullets);


  // ---------- PARTICLES ----------
  updateParticles(_dt);
  drawParticles(ctx);

  // ---------- MEGA-BOMB screen-clear flash ----------
  if (g.megaBombFlash > 0) {
    const a = Math.min(1, g.megaBombFlash / 0.9);
    // White radial flash + expanding shockwave
    const rad = (1 - a) * Math.max(W, H) * 1.1;
    ctx.save();
    ctx.globalAlpha = a * 0.85;
    const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H));
    rg.addColorStop(0, "rgba(255,240,180,0.95)");
    rg.addColorStop(0.4, "rgba(255,160,60,0.55)");
    rg.addColorStop(1, "rgba(255,60,20,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    ctx.strokeStyle = "rgba(255,230,140,0.9)";
    ctx.lineWidth = 6 * a;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    g.megaBombFlash = Math.max(0, g.megaBombFlash - _dt);
  }
}

function drawPowerups(ctx: CanvasRenderingContext2D, powerups: Powerup[]) {
  for (const p of powerups) {
    const bob = Math.sin(_t * 3 + p.bob) * 3;
    const cx = p.pos.x, cy = p.pos.y + bob;
    const r = p.radius;
    const isBomb = p.kind === "bomb";
    const isTriple = p.kind === "triple";
    const accent = isBomb ? "#ffb84a" : isTriple ? "#7df2b0" : "#ff5a7a";
    const glow = isBomb ? "rgba(255,180,60,0.55)" : isTriple ? "rgba(120,255,180,0.55)" : "rgba(255,90,130,0.55)";

    // Outer glow halo
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Bubble body (translucent)
    const bg = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 2, cx, cy, r);
    bg.addColorStop(0, "rgba(220,245,255,0.85)");
    bg.addColorStop(0.6, "rgba(120,190,230,0.35)");
    bg.addColorStop(1, glow);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Bubble highlight
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.45, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // Icon
    ctx.save();
    ctx.translate(cx, cy);
    if (isBomb) {
      // bomb body
      ctx.fillStyle = "#101418";
      ctx.beginPath();
      ctx.arc(0, 2, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      // fuse
      ctx.strokeStyle = "#6a4a20";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r * 0.35, -r * 0.35);
      ctx.quadraticCurveTo(r * 0.6, -r * 0.7, r * 0.75, -r * 0.55);
      ctx.stroke();
      // spark
      const sp = (Math.sin(_t * 20) + 1) * 0.5;
      ctx.fillStyle = `rgba(255,${180 + 60 * sp},60,${0.7 + 0.3 * sp})`;
      ctx.shadowColor = "#ffb84a";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(r * 0.78, -r * 0.58, 2.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (isTriple) {
      // Triple-shot icon: three upward tracers.
      ctx.strokeStyle = "#eafff2";
      ctx.shadowColor = "#7df2b0";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      const len = r * 0.85;
      const spread = 12 * Math.PI / 180;
      for (const ang of [-spread, 0, spread]) {
        ctx.beginPath();
        ctx.moveTo(Math.sin(ang) * len * 0.15, len * 0.55);
        ctx.lineTo(Math.sin(ang) * len, -len * 0.6);
        ctx.stroke();
      }
      // bullet heads
      ctx.fillStyle = "#eafff2";
      for (const ang of [-spread, 0, spread]) {
        ctx.beginPath();
        ctx.arc(Math.sin(ang) * len, -len * 0.6, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // heart icon
      ctx.fillStyle = "#ff3a5a";
      ctx.shadowColor = "#ff6b8a";
      ctx.shadowBlur = 6;
      const s = r * 0.55;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.6);
      ctx.bezierCurveTo(s * 1.2, -s * 0.2, s * 0.6, -s * 1.1, 0, -s * 0.35);
      ctx.bezierCurveTo(-s * 0.6, -s * 1.1, -s * 1.2, -s * 0.2, 0, s * 0.6);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Track previous enemy list to detect deaths.
let _prevEnemies: EnemyController[] = [];
function detectEnemyDeaths(g: GameManager, alive: WeakSet<EnemyController>) {
  for (const e of _prevEnemies) {
    if (!alive.has(e)) {
      // Died (or off-screen). Only explode if hp<=0.
      if (!e.alive) {
        const scale = e.kind === "heavy" ? 1.4 : e.kind === "fast" ? 0.85 : 1;
        emitExplosion(e.pos.x, e.pos.y, scale);
      }
    }
  }
  _prevEnemies = g.enemies.slice();
}

let _prevBullets: Bullet[] = [];
function detectBulletDeaths(g: GameManager, alive: WeakSet<Bullet>) {
  for (const b of _prevBullets) {
    if (alive.has(b)) continue;
    const fx = WEAPON_FX[b.weapon] ?? WEAPON_FX.cannon;
    if (fx.impact === "splash") {
      emitSplash(b.pos.x, b.pos.y);
    } else if (fx.impact === "shell") {
      // small HE burst
      emitExplosion(b.pos.x, b.pos.y, 0.35);
    } else if (fx.impact === "plasma") {
      // magenta ring + bright flash
      particles.push({
        x: b.pos.x, y: b.pos.y, vx: 0, vy: 0,
        life: 0.25, maxLife: 0.25, size: 4,
        color: "rgba(230,150,255,0.9)", kind: "ring",
      });
      particles.push({
        x: b.pos.x, y: b.pos.y, vx: 0, vy: 0,
        life: 0.12, maxLife: 0.12, size: 8,
        color: fx.head, kind: "flash",
      });
    } else {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        particles.push({
          x: b.pos.x, y: b.pos.y,
          vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
          life: 0.25, maxLife: 0.25,
          size: 1.5, color: fx.glow, kind: "spark",
        });
      }
    }
  }
  _prevBullets = g.bullets.slice();
}

// ============================================================================
// Sea mines — floating spiked mines with chain, blinking pilot light.
// ============================================================================
const seenMines = new WeakSet<Mine>();
let _prevMines: Mine[] = [];

function drawMines(ctx: CanvasRenderingContext2D, mines: Mine[]) {
  for (const m of mines) {
    if (!seenMines.has(m)) seenMines.add(m);
    const bob = Math.sin(_t * 2 + m.bob) * 2;
    const cx = m.pos.x, cy = m.pos.y + bob;
    const r = m.radius;

    // subtle water ring under mine
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(180,220,240,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.75, r * 1.05, r * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // spikes
    ctx.fillStyle = "#1a1a1a";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sx = cx + Math.cos(a) * r;
      const sy = cy + Math.sin(a) * r;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(6, 0);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // body
    const grd = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 2, cx, cy, r);
    grd.addColorStop(0, "#5a5a62");
    grd.addColorStop(1, "#1a1c22");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // equator band
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.9, r * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();

    // rivets
    ctx.fillStyle = "#8a8f96";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // blinking red pilot light
    const blink = (Math.sin(_t * 6 + m.bob) + 1) * 0.5;
    ctx.save();
    ctx.shadowColor = "#ff2a2a";
    ctx.shadowBlur = 8 * blink;
    ctx.fillStyle = `rgba(255,${60 + 60 * blink},${60 * blink},${0.6 + 0.4 * blink})`;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.35, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // damage cracks when hp low
    const dmg = 1 - m.hp / 20;
    if (dmg > 0.3) {
      ctx.strokeStyle = `rgba(255,120,60,${dmg})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy - r * 0.2);
      ctx.lineTo(cx + r * 0.2, cy + r * 0.1);
      ctx.lineTo(cx + r * 0.6, cy - r * 0.3);
      ctx.stroke();
    }
  }
}

function detectMineDeaths(g: GameManager) {
  const alive = new Set(g.mines);
  for (const m of _prevMines) {
    if (!alive.has(m) && m.hp <= 0) {
      emitExplosion(m.pos.x, m.pos.y, 1.2);
    }
  }
  _prevMines = g.mines.slice();
}


// ============================================================================
// Scenery (unchanged behavior, richer palette)
// ============================================================================
function drawScenery(ctx: CanvasRenderingContext2D, cameraY: number, H: number, landW: number, W: number) {
  const tile = 70;
  const topWorld = -cameraY - tile;
  const botWorld = -cameraY + H + tile;
  const startTile = Math.floor(topWorld / tile);
  const endTile = Math.ceil(botWorld / tile);
  for (let i = startTile; i <= endTile; i++) {
    const worldY = i * tile + (hash(i) - 0.5) * 30;
    const screenY = worldY + cameraY;
    const lKind = hash(i * 2.13);
    const lx = 8 + hash(i * 7.7) * (landW - 50);
    drawSceneryItem(ctx, lx, screenY, lKind, i);
    const rKind = hash(i * 3.31 + 0.5);
    const rx = W - landW + 28 + hash(i * 5.9) * (landW - 50);
    drawSceneryItem(ctx, rx, screenY, rKind, i + 1000);
  }
}
function drawSceneryItem(ctx: CanvasRenderingContext2D, x: number, y: number, kind: number, seed: number) {
  if (kind < 0.5) {
    const s = 10 + hash(seed * 1.7) * 6;
    ctx.fillStyle = "#3a2615";
    ctx.fillRect(x - 1, y, 2, s * 0.4);
    ctx.fillStyle = "#1f5a2a";
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.7, y + s * 0.2);
    ctx.lineTo(x - s * 0.7, y + s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2a7a3a";
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.6);
    ctx.lineTo(x + s * 0.55, y);
    ctx.lineTo(x - s * 0.55, y);
    ctx.closePath();
    ctx.fill();
  } else if (kind < 0.72) {
    const r = 6 + hash(seed * 2.3) * 5;
    ctx.fillStyle = "#244d1c";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a7a2a";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind < 0.86) {
    const r = 5 + hash(seed * 4.1) * 6;
    ctx.fillStyle = "#6a6258";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9a948a";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.4, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind < 0.95) {
    // military bunker (camo)
    const w = 14 + hash(seed * 6.3) * 8;
    const h = 11 + hash(seed * 8.1) * 6;
    ctx.fillStyle = "#4a5240";
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = "#2f3628";
    ctx.fillRect(x - w / 2, y - h / 2, w, 3);
    ctx.fillStyle = "#1a1e14";
    ctx.fillRect(x - 3, y - 1, 6, 3);
    // sandbag row
    ctx.fillStyle = "#8a7a55";
    for (let k = 0; k < 3; k++) {
      ctx.fillRect(x - w / 2 + k * (w / 3), y + h / 2, w / 3 - 1, 2);
    }
  } else {
    // radar/watch tower
    ctx.fillStyle = "#3a4048";
    ctx.fillRect(x - 2, y - 8, 4, 12);
    ctx.fillStyle = "#c9d3dd";
    ctx.beginPath();
    ctx.arc(x, y - 10, 4, 0, Math.PI, true);
    ctx.fill();
    ctx.fillStyle = "#ff4040";
    ctx.fillRect(x - 1, y - 14, 2, 2);
  }
}

function drawFinishLine(ctx: CanvasRenderingContext2D, screenY: number, landW: number, W: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const x0 = landW, x1 = W - landW;
  const step = 16;
  for (let x = x0, i = 0; x < x1; x += step, i++) {
    ctx.fillStyle = i % 2 === 0 ? "#fff" : "#111";
    ctx.fillRect(x, screenY - 6, Math.min(step, x1 - x), 12);
  }
  ctx.fillStyle = "#ffcc33";
  ctx.fillRect(x0 - 8, screenY - 14, 8, 28);
  ctx.fillRect(x1, screenY - 14, 8, 28);
  ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText("◆ SAFE HARBOR ◆", (x0 + x1) / 2, screenY - 18);
  ctx.restore();
}

function drawWake(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w * 0.9, y + h);
  ctx.lineTo(x - w * 0.9, y + h);
  ctx.closePath();
  ctx.fill();
}

// ============================================================================
// Cargo ship (kept from prior redesign, minor polish)
// ============================================================================
function drawCargoShip(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  const x = cx - w / 2, y = cy - h / 2;
  ctx.fillStyle = "#a8221c";
  ctx.strokeStyle = "#1a0a08";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(x + w * 0.98, y + h * 0.16);
  ctx.lineTo(x + w * 0.98, y + h * 0.96);
  ctx.quadraticCurveTo(cx, y + h + 2, x + w * 0.02, y + h * 0.96);
  ctx.lineTo(x + w * 0.02, y + h * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const ix = x + w * 0.06, iy = y + h * 0.04;
  const iw = w * 0.88,     ih = h * 0.9;
  ctx.fillStyle = "#1f242b";
  ctx.beginPath();
  ctx.moveTo(cx, iy);
  ctx.lineTo(ix + iw, iy + ih * 0.16);
  ctx.lineTo(ix + iw, iy + ih * 0.94);
  ctx.quadraticCurveTo(cx, iy + ih, ix, iy + ih * 0.94);
  ctx.lineTo(ix, iy + ih * 0.16);
  ctx.closePath();
  ctx.fill();
  const dx = x + w * 0.16, dy = y + h * 0.14;
  const dw = w * 0.68,     dh = h * 0.6;
  ctx.fillStyle = "#c9b98a";
  ctx.fillRect(dx, dy, dw, dh);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(dx, dy, dw, dh);
  const colors = ["#c93a2b", "#2a6fb8", "#e0892a", "#3b8a4f", "#b03b6e", "#d9c24a", "#4aa9c9"];
  const cols = 4, blocks = 3;
  const gap = dh * 0.04;
  const blockH = (dh - gap * (blocks + 1)) / blocks;
  const cw = dw / cols;
  for (let b = 0; b < blocks; b++) {
    const by = dy + gap + b * (blockH + gap);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(dx, by + blockH - 1, dw, 1);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = (b * 11 + r * 5 + c * 3) % colors.length;
        const bx = dx + c * cw + 1;
        const rby = by + r * (blockH / 2) + 1;
        const rw = cw - 2;
        const rh = blockH / 2 - 2;
        ctx.fillStyle = colors[idx];
        ctx.fillRect(bx, rby, rw, rh);
        ctx.strokeStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        for (let k = 1; k < 4; k++) {
          const rx = bx + (rw * k) / 4;
          ctx.moveTo(rx, rby + 1);
          ctx.lineTo(rx, rby + rh - 1);
        }
        ctx.stroke();
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.strokeRect(bx, rby, rw, rh);
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(bx, rby, rw, Math.max(1, rh * 0.18));
      }
    }
  }
  const sW = w * 0.5, sH = h * 0.16;
  const sx = cx - sW / 2, sy = y + h * 0.76;
  ctx.fillStyle = "#eef1ee";
  ctx.strokeStyle = "#2a2f35";
  ctx.lineWidth = 1;
  ctx.fillRect(sx, sy, sW, sH);
  ctx.strokeRect(sx, sy, sW, sH);
  const s2W = sW * 0.72, s2H = sH * 0.55;
  const s2x = cx - s2W / 2, s2y = sy + sH * 0.18;
  ctx.fillStyle = "#f8faf7";
  ctx.fillRect(s2x, s2y, s2W, s2H);
  ctx.strokeRect(s2x, s2y, s2W, s2H);
  ctx.fillStyle = "#1a2732";
  ctx.fillRect(s2x + 2, s2y + 2, s2W - 4, Math.max(1, s2H * 0.28));
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  const winCount = 6;
  for (let i = 1; i < winCount; i++) {
    const wx = s2x + 2 + ((s2W - 4) * i) / winCount;
    ctx.beginPath();
    ctx.moveTo(wx, s2y + 2);
    ctx.lineTo(wx, s2y + 2 + s2H * 0.28);
    ctx.stroke();
  }
  const fW = w * 0.14, fH = sH * 0.55;
  const fx = cx - fW / 2, fy = sy + sH * 0.4;
  ctx.fillStyle = "#3a3f46";
  ctx.fillRect(fx, fy, fW, fH);
  ctx.fillStyle = "#c93a2b";
  ctx.fillRect(fx, fy + fH * 0.35, fW, fH * 0.22);
  ctx.strokeStyle = "#0d1115";
  ctx.strokeRect(fx, fy, fW, fH);
  ctx.fillStyle = "#1a1d21";
  ctx.fillRect(fx - 1, fy - 2, fW + 2, 2);
  ctx.fillStyle = "#111";
  ctx.fillRect(cx - 1, y + h * 0.93, 2, h * 0.06);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.moveTo(cx, y + 2);
  ctx.lineTo(cx + w * 0.42, y + h * 0.16);
  ctx.moveTo(cx, y + 2);
  ctx.lineTo(cx - w * 0.42, y + h * 0.16);
  ctx.stroke();
}

// ============================================================================
// Defender frigate — full upgrade: twin main guns, VLS cells, radar mast,
// bridge windows, side CIWS, helipad. Muzzle flash animates on fire.
// ============================================================================
function drawFrigate(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, muzzle: number) {
  const x = cx - w / 2, y = cy - h / 2;

  // hull silhouette
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "#3d4650");
  grad.addColorStop(0.5, "#5a6570");
  grad.addColorStop(1, "#3d4650");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#0d1115";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(x + w * 0.92, y + h * 0.20);
  ctx.lineTo(x + w * 0.96, y + h * 0.80);
  ctx.lineTo(x + w * 0.84, y + h * 0.96);
  ctx.lineTo(x + w * 0.16, y + h * 0.96);
  ctx.lineTo(x + w * 0.04, y + h * 0.80);
  ctx.lineTo(x + w * 0.08, y + h * 0.20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // deck plating
  ctx.fillStyle = "#6b7884";
  ctx.fillRect(x + w * 0.18, y + h * 0.18, w * 0.64, h * 0.72);

  // bow VLS cell block (missile silos, 3x4 grid)
  const vlsW = w * 0.36, vlsH = h * 0.12;
  const vlsX = cx - vlsW / 2, vlsY = y + h * 0.18;
  ctx.fillStyle = "#252b32";
  ctx.fillRect(vlsX, vlsY, vlsW, vlsH);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const cellW = vlsW / 4 - 1, cellH = vlsH / 3 - 1;
      const cxx = vlsX + c * (vlsW / 4) + 0.5;
      const cyy = vlsY + r * (vlsH / 3) + 0.5;
      ctx.fillStyle = "#0d1116";
      ctx.fillRect(cxx, cyy, cellW, cellH);
      ctx.strokeStyle = "#4a5560";
      ctx.strokeRect(cxx, cyy, cellW, cellH);
    }
  }

  // forward main gun turret (with muzzle flash)
  const t1x = cx, t1y = y + h * 0.36;
  ctx.fillStyle = "#2a323a";
  ctx.beginPath();
  ctx.arc(t1x, t1y, w * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0d1115";
  ctx.stroke();
  // barrel
  ctx.fillStyle = "#1a1f24";
  ctx.fillRect(t1x - 2.5, y + h * 0.14, 5, h * 0.24);
  ctx.fillStyle = "#8a95a0";
  ctx.fillRect(t1x - 1, y + h * 0.14, 2, h * 0.24);
  // muzzle brake
  ctx.fillStyle = "#0d1115";
  ctx.fillRect(t1x - 3, y + h * 0.14, 6, 2);
  // flash
  if (muzzle > 0) {
    const a = muzzle / 0.09;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = "#fff2b8";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#fff2b8";
    ctx.beginPath();
    ctx.arc(t1x, y + h * 0.10, 6 * a, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // bridge / superstructure
  ctx.fillStyle = "#cfd6dc";
  ctx.fillRect(cx - w * 0.2, y + h * 0.48, w * 0.4, h * 0.18);
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w * 0.2, y + h * 0.48, w * 0.4, h * 0.18);
  // bridge windows
  ctx.fillStyle = "#1a2732";
  ctx.fillRect(cx - w * 0.18, y + h * 0.50, w * 0.36, h * 0.04);

  // radar mast + spinning-effect dish (subtle bob)
  const mx = cx, my = y + h * 0.58;
  ctx.fillStyle = "#0d1115";
  ctx.fillRect(mx - 1, my, 2, h * 0.08);
  ctx.fillStyle = "#c9d3dd";
  const rW = 8 + Math.sin(_t * 4) * 0.5;
  ctx.beginPath();
  ctx.ellipse(mx, my + h * 0.02, rW, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // side CIWS pods
  ctx.fillStyle = "#2a323a";
  ctx.beginPath();
  ctx.arc(x + w * 0.14, y + h * 0.56, 3, 0, Math.PI * 2);
  ctx.arc(x + w * 0.86, y + h * 0.56, 3, 0, Math.PI * 2);
  ctx.fill();

  // aft main gun (smaller)
  ctx.fillStyle = "#2a323a";
  ctx.beginPath();
  ctx.arc(cx, y + h * 0.74, w * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1f24";
  ctx.fillRect(cx - 2, y + h * 0.74, 4, h * 0.12);

  // helipad (rear deck, H marking)
  ctx.fillStyle = "#3a4048";
  ctx.fillRect(cx - w * 0.14, y + h * 0.86, w * 0.28, h * 0.10);
  ctx.strokeStyle = "#ffcc33";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w * 0.14, y + h * 0.86, w * 0.28, h * 0.10);
  ctx.fillStyle = "#ffcc33";
  ctx.font = "bold 7px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("H", cx, y + h * 0.91);
}

// ============================================================================
// Enemy variants — 3 kinds × 3 visual variants = 9 distinct silhouettes.
// basic:  patrol boat / gunboat / stealth boat
// fast:   speedboat / hovercraft / jet boat
// heavy:  missile corvette / destroyer / assault carrier
// ============================================================================
function drawEnemyBoat(ctx: CanvasRenderingContext2D, e: EnemyController, m: { variant: number; seed: number; hitFlash: number; muzzle: number }) {
  const { x: cx, y: cy } = e.pos;
  const w = e.size.x, h = e.size.y;
  const bob = Math.sin(_t * 6 + m.seed) * 0.6;

  ctx.save();
  ctx.translate(cx, cy + bob);

  // hit flash tint overlay drawn last via composite
  const flash = m.hitFlash > 0 ? m.hitFlash / 0.12 : 0;

  if (e.kind === "basic") {
    if (m.variant === 0) drawPatrolBoat(ctx, w, h);
    else if (m.variant === 1) drawGunboat(ctx, w, h);
    else drawStealthBoat(ctx, w, h);
  } else if (e.kind === "fast") {
    if (m.variant === 0) drawSpeedboat(ctx, w, h);
    else if (m.variant === 1) drawHovercraft(ctx, w, h);
    else drawJetboat(ctx, w, h);
  } else {
    if (m.variant === 0) drawMissileCorvette(ctx, w, h);
    else if (m.variant === 1) drawDestroyer(ctx, w, h);
    else drawAssaultCarrier(ctx, w, h);
  }

  if (flash > 0) {
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(255,220,180,${flash * 0.6})`;
    ctx.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore();
}

// -------- BASIC-tier hulls --------
function drawPatrolBoat(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // olive-green patrol boat, single small turret
  ctx.fillStyle = "#4a5238";
  ctx.strokeStyle = "#1a1a10";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w * 0.42, -h * 0.30);
  ctx.lineTo(w * 0.42, h * 0.42);
  ctx.lineTo(w * 0.2, h / 2);
  ctx.lineTo(-w * 0.2, h / 2);
  ctx.lineTo(-w * 0.42, h * 0.42);
  ctx.lineTo(-w * 0.42, -h * 0.30);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // deck
  ctx.fillStyle = "#5c6440";
  ctx.fillRect(-w * 0.28, -h * 0.2, w * 0.56, h * 0.55);
  // cabin
  ctx.fillStyle = "#2f3626";
  ctx.fillRect(-w * 0.16, -h * 0.05, w * 0.32, h * 0.22);
  ctx.fillStyle = "#8ab0c9";
  ctx.fillRect(-w * 0.14, -h * 0.03, w * 0.28, h * 0.06);
  // turret + MG
  ctx.fillStyle = "#1a1a10";
  ctx.beginPath();
  ctx.arc(0, -h * 0.18, Math.min(w, h) * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-1.5, -h * 0.42, 3, h * 0.28);
}

function drawGunboat(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // red-brown gunboat, dual side MGs
  ctx.fillStyle = "#7a3020";
  ctx.strokeStyle = "#180806";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w * 0.48, -h * 0.15);
  ctx.lineTo(w * 0.38, h * 0.48);
  ctx.lineTo(-w * 0.38, h * 0.48);
  ctx.lineTo(-w * 0.48, -h * 0.15);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#a04530";
  ctx.fillRect(-w * 0.28, -h * 0.1, w * 0.56, h * 0.5);
  // central turret with long barrel
  ctx.fillStyle = "#0d0605";
  ctx.beginPath();
  ctx.arc(0, 0, Math.min(w, h) * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-2, -h * 0.5, 4, h * 0.45);
  // side MGs
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-w * 0.42, -h * 0.05, 6, 3);
  ctx.fillRect(w * 0.42 - 6, -h * 0.05, 6, 3);
}

function drawStealthBoat(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // dark angular stealth hull
  ctx.fillStyle = "#1a1e26";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w * 0.38, -h * 0.25);
  ctx.lineTo(w * 0.30, h * 0.4);
  ctx.lineTo(0, h / 2);
  ctx.lineTo(-w * 0.30, h * 0.4);
  ctx.lineTo(-w * 0.38, -h * 0.25);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // faceted panel highlights
  ctx.fillStyle = "#2a2f38";
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.35);
  ctx.lineTo(w * 0.24, -h * 0.05);
  ctx.lineTo(-w * 0.24, -h * 0.05);
  ctx.closePath();
  ctx.fill();
  // top turret slit
  ctx.fillStyle = "#c93a2b";
  ctx.fillRect(-w * 0.06, -h * 0.05, w * 0.12, 2);
  ctx.fillStyle = "#0a0d12";
  ctx.fillRect(-1.5, -h * 0.45, 3, h * 0.35);
}

// -------- FAST-tier hulls --------
function drawSpeedboat(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#c94770";
  ctx.strokeStyle = "#3a0e1c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w * 0.35, 0);
  ctx.lineTo(w * 0.28, h / 2);
  ctx.lineTo(-w * 0.28, h / 2);
  ctx.lineTo(-w * 0.35, 0);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // cockpit
  ctx.fillStyle = "#2a1015";
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.15, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // MG
  ctx.fillStyle = "#111";
  ctx.fillRect(-1.5, -h * 0.42, 3, h * 0.22);
}

function drawHovercraft(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // skirted hovercraft — wide rounded base
  ctx.fillStyle = "#3a3020";
  ctx.strokeStyle = "#0d0a05";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.45, h * 0.48, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // upper deck
  ctx.fillStyle = "#6a5a3a";
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.05, w * 0.30, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  // twin rear ducted fans
  ctx.fillStyle = "#1a1610";
  ctx.beginPath();
  ctx.arc(-w * 0.22, h * 0.28, w * 0.10, 0, Math.PI * 2);
  ctx.arc(w * 0.22, h * 0.28, w * 0.10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a7a55";
  ctx.beginPath();
  ctx.moveTo(-w * 0.30, h * 0.28); ctx.lineTo(-w * 0.14, h * 0.28);
  ctx.moveTo(w * 0.14, h * 0.28); ctx.lineTo(w * 0.30, h * 0.28);
  ctx.stroke();
  // front MG
  ctx.fillStyle = "#0d0a05";
  ctx.beginPath();
  ctx.arc(0, -h * 0.15, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-1.5, -h * 0.45, 3, h * 0.30);
}

function drawJetboat(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // sleek jet interceptor
  ctx.fillStyle = "#c98a2b";
  ctx.strokeStyle = "#3a2405";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w * 0.30, -h * 0.10);
  ctx.lineTo(w * 0.38, h * 0.30);
  ctx.lineTo(w * 0.20, h / 2);
  ctx.lineTo(-w * 0.20, h / 2);
  ctx.lineTo(-w * 0.38, h * 0.30);
  ctx.lineTo(-w * 0.30, -h * 0.10);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // canopy
  ctx.fillStyle = "#4a2a05";
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.05, w * 0.12, h * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  // jet exhausts (glow)
  ctx.fillStyle = "#ff6a2a";
  ctx.fillRect(-w * 0.20, h * 0.42, 6, 4);
  ctx.fillRect(w * 0.20 - 6, h * 0.42, 6, 4);
  // rockets
  ctx.fillStyle = "#1a1005";
  ctx.fillRect(-w * 0.35, 0, 3, h * 0.20);
  ctx.fillRect(w * 0.35 - 3, 0, 3, h * 0.20);
}

// -------- HEAVY-tier hulls --------
function drawMissileCorvette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#5a2828";
  ctx.strokeStyle = "#180505";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w * 0.45, -h * 0.25);
  ctx.lineTo(w * 0.45, h * 0.42);
  ctx.lineTo(w * 0.25, h / 2);
  ctx.lineTo(-w * 0.25, h / 2);
  ctx.lineTo(-w * 0.45, h * 0.42);
  ctx.lineTo(-w * 0.45, -h * 0.25);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#7a3838";
  ctx.fillRect(-w * 0.32, -h * 0.15, w * 0.64, h * 0.6);
  // main turret + long twin barrels
  ctx.fillStyle = "#180505";
  ctx.beginPath();
  ctx.arc(0, -h * 0.20, Math.min(w, h) * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-4, -h * 0.48, 3, h * 0.28);
  ctx.fillRect(1, -h * 0.48, 3, h * 0.28);
  // missile racks on sides (4 tubes each)
  ctx.fillStyle = "#c9c9c9";
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(-w * 0.42, h * 0.05 + i * 4, 5, 3);
    ctx.fillRect(w * 0.42 - 5, h * 0.05 + i * 4, 5, 3);
  }
  // bridge
  ctx.fillStyle = "#2a1010";
  ctx.fillRect(-w * 0.14, h * 0.02, w * 0.28, h * 0.14);
  ctx.fillStyle = "#c9d3dd";
  ctx.fillRect(-w * 0.12, h * 0.04, w * 0.24, 2);
}

function drawDestroyer(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // long dark-grey destroyer
  ctx.fillStyle = "#3a3f46";
  ctx.strokeStyle = "#0a0d10";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w * 0.35, -h * 0.30);
  ctx.lineTo(w * 0.40, h * 0.40);
  ctx.lineTo(w * 0.18, h / 2);
  ctx.lineTo(-w * 0.18, h / 2);
  ctx.lineTo(-w * 0.40, h * 0.40);
  ctx.lineTo(-w * 0.35, -h * 0.30);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#54606c";
  ctx.fillRect(-w * 0.25, -h * 0.2, w * 0.5, h * 0.65);
  // forward + aft turrets
  ctx.fillStyle = "#1a1f24";
  ctx.beginPath();
  ctx.arc(0, -h * 0.22, w * 0.12, 0, Math.PI * 2);
  ctx.arc(0, h * 0.30, w * 0.10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-1.5, -h * 0.48, 3, h * 0.28);
  ctx.fillRect(-1.5, h * 0.30, 3, h * 0.18);
  // bridge tower
  ctx.fillStyle = "#8a95a0";
  ctx.fillRect(-w * 0.10, -h * 0.02, w * 0.20, h * 0.16);
  ctx.fillStyle = "#1a2732";
  ctx.fillRect(-w * 0.08, 0, w * 0.16, 2);
  // funnel
  ctx.fillStyle = "#1a1f24";
  ctx.fillRect(-w * 0.06, h * 0.16, w * 0.12, h * 0.10);
  ctx.fillStyle = "#c93a2b";
  ctx.fillRect(-w * 0.06, h * 0.20, w * 0.12, 2);
}

function drawAssaultCarrier(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // wide flat-deck assault ship
  ctx.fillStyle = "#2f2820";
  ctx.strokeStyle = "#0a0805";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(w * 0.48, -h * 0.15);
  ctx.lineTo(w * 0.48, h * 0.42);
  ctx.lineTo(w * 0.30, h / 2);
  ctx.lineTo(-w * 0.30, h / 2);
  ctx.lineTo(-w * 0.48, h * 0.42);
  ctx.lineTo(-w * 0.48, -h * 0.15);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // flat flight deck
  ctx.fillStyle = "#4a4230";
  ctx.fillRect(-w * 0.42, -h * 0.10, w * 0.84, h * 0.85);
  // centerline stripe
  ctx.strokeStyle = "#e0c04a";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.05);
  ctx.lineTo(0, h * 0.40);
  ctx.stroke();
  ctx.setLineDash([]);
  // island (bridge on starboard)
  ctx.fillStyle = "#8a7a55";
  ctx.fillRect(w * 0.28, -h * 0.05, w * 0.14, h * 0.28);
  ctx.fillStyle = "#1a2732";
  ctx.fillRect(w * 0.30, -h * 0.03, w * 0.10, 3);
  // parked helicopters (silhouettes)
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(-w * 0.20, h * 0.05, 4, 0, Math.PI * 2);
  ctx.arc(-w * 0.10, h * 0.28, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, h * 0.05); ctx.lineTo(-w * 0.12, h * 0.05);
  ctx.moveTo(-w * 0.18, h * 0.28); ctx.lineTo(-w * 0.02, h * 0.28);
  ctx.stroke();
  // AA turret at bow
  ctx.fillStyle = "#0a0805";
  ctx.beginPath();
  ctx.arc(0, -h * 0.25, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-1, -h * 0.42, 2, h * 0.20);
}

// ============================================================================
function drawHpBar(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, frac: number, label?: string) {
  const h = 6;
  const x = cx - w / 2;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, "#ffb648");
  g.addColorStop(1, "#ff3a3a");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w * Math.max(0, frac), h);
  if (label) {
    ctx.font = "bold 9px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, cx, y - 2);
  }
}

// ============================================================================
// Kamikaze suicide boats — small, fast, aggressive silhouette with red warning
// stripe and warning-light blink. Trails a hot wake.
// ============================================================================
const seenKamikazes = new WeakSet<Kamikaze>();
let _prevKamikazes: Kamikaze[] = [];

function drawKamikazes(ctx: CanvasRenderingContext2D, boats: Kamikaze[]) {
  for (const k of boats) {
    if (!seenKamikazes.has(k)) seenKamikazes.add(k);
    // hot wake behind
    ctx.save();
    ctx.translate(k.pos.x, k.pos.y);
    ctx.rotate(k.angle + Math.PI / 2); // ship points along velocity
    const w = k.size.x, h = k.size.y;

    // wake plume
    ctx.fillStyle = "rgba(255,180,90,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, h * 0.75, w * 0.5, h * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // hull (dark red)
    ctx.fillStyle = "#3a0f10";
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.closePath();
    ctx.fill();

    // red warning stripe
    ctx.fillStyle = "#c8181c";
    ctx.fillRect(-w / 2 + 2, -h * 0.05, w - 4, h * 0.18);

    // yellow/black hazard chevrons on top
    ctx.fillStyle = "#f1c40f";
    ctx.fillRect(-w * 0.3, -h * 0.32, w * 0.6, h * 0.1);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1;
    ctx.strokeRect(-w * 0.3, -h * 0.32, w * 0.6, h * 0.1);

    // explosive payload dome
    ctx.fillStyle = "#8a1a1a";
    ctx.beginPath();
    ctx.arc(0, h * 0.05, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffdada";
    ctx.lineWidth = 1;
    ctx.stroke();

    // blinking warning light on the bow
    const blink = (Math.sin(_t * 12 + k.wobble) + 1) * 0.5;
    ctx.fillStyle = `rgba(255,${60 + 120 * blink},60,${0.7 + 0.3 * blink})`;
    ctx.shadowColor = "#ff5040";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, -h * 0.42, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // HP bar (only if damaged)
    if (k.hp < k.maxHp) {
      drawHpBar(ctx, k.pos.x, k.pos.y - k.size.y / 2 - 8, k.size.x + 10, k.hp / k.maxHp);
    }
  }
}

function detectKamikazeDeaths(g: GameManager) {
  const now = new Set(g.kamikazes);
  for (const k of _prevKamikazes) {
    if (!now.has(k) && !k.alive) {
      // larger, distinct explosion (multi-ring + shards)
      emitExplosion(k.pos.x, k.pos.y, 1.3);
      // extra red shockring
      particles.push({
        x: k.pos.x, y: k.pos.y, vx: 0, vy: 0,
        life: 0.4, maxLife: 0.4, size: 6,
        color: "rgba(255,80,40,0.9)", kind: "ring",
      });
    }
  }
  _prevKamikazes = g.kamikazes.slice();
}

// ---------- WRECKAGE (decorative burning ship debris) ----------
// Rendered above water/scenery but below all gameplay entities.
// Emits continuous fire sparks and smoke via the existing particle system.
const _wreckEmit = new WeakMap<Wreckage, number>();
function drawWreckages(ctx: CanvasRenderingContext2D, wrecks: Wreckage[], dt: number) {
  for (const w of wrecks) {
    // Emit fire + smoke particles at throttled rate.
    let acc = (_wreckEmit.get(w) ?? 0) + dt;
    while (acc > 0.06) {
      acc -= 0.06;
      // fire spark
      particles.push({
        x: w.pos.x + (Math.random() - 0.5) * w.size * 0.4,
        y: w.pos.y - 2 + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 20,
        vy: -30 - Math.random() * 40,
        life: 0.35 + Math.random() * 0.25, maxLife: 0.6,
        size: 2 + Math.random() * 2,
        color: Math.random() < 0.5 ? "#ffcf5e" : "#ff6a2a",
        kind: "spark",
      });
      // smoke plume
      particles.push({
        x: w.pos.x + (Math.random() - 0.5) * w.size * 0.5,
        y: w.pos.y - 6,
        vx: (Math.random() - 0.5) * 12,
        vy: -18 - Math.random() * 20,
        life: 1.2 + Math.random() * 0.8, maxLife: 2.0,
        size: 8 + Math.random() * 8,
        color: "rgba(45,40,38,0.55)",
        kind: "smoke",
      });
    }
    _wreckEmit.set(w, acc);

    ctx.save();
    ctx.translate(w.pos.x, w.pos.y);
    ctx.rotate(w.rot);
    const s = w.size;

    // Faint water ring / oil slick around wreck
    ctx.fillStyle = "rgba(20,15,10,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 4, s * 0.9, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    if (w.variant === "hull") {
      // Broken hull piece — dark charred plating
      ctx.fillStyle = "#1e1a17";
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, -s * 0.15);
      ctx.lineTo(s * 0.55, -s * 0.22);
      ctx.lineTo(s * 0.45, s * 0.18);
      ctx.lineTo(-s * 0.4, s * 0.2);
      ctx.closePath();
      ctx.fill();
      // rust streaks
      ctx.fillStyle = "#3a1f10";
      ctx.fillRect(-s * 0.35, -s * 0.05, s * 0.75, 3);
      // jagged break edge
      ctx.fillStyle = "#2a2320";
      ctx.beginPath();
      ctx.moveTo(s * 0.55, -s * 0.22);
      ctx.lineTo(s * 0.65, -s * 0.05);
      ctx.lineTo(s * 0.5, 0);
      ctx.lineTo(s * 0.45, s * 0.18);
      ctx.closePath();
      ctx.fill();
      // ember glow
      ctx.fillStyle = "rgba(255,120,40,0.55)";
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.05, s * 0.18, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (w.variant === "crates") {
      // Burning crate cluster
      const boxes: [number, number, number][] = [
        [-s * 0.32, 0, s * 0.28],
        [-s * 0.02, -s * 0.08, s * 0.3],
        [s * 0.28, 0.04, s * 0.24],
      ];
      for (const [bx, by, bs] of boxes) {
        ctx.fillStyle = "#3a2412";
        ctx.fillRect(bx - bs / 2, by - bs / 2, bs, bs);
        ctx.strokeStyle = "#1a0f08";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - bs / 2, by - bs / 2, bs, bs);
        // charred top
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(bx - bs / 2, by - bs / 2, bs, bs * 0.3);
      }
      // ember glow
      ctx.fillStyle = "rgba(255,140,50,0.5)";
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.05, s * 0.28, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Capsized bow — pointed prow sticking out of the water
      ctx.fillStyle = "#221a15";
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.15);
      ctx.lineTo(s * 0.55, -s * 0.05);
      ctx.lineTo(s * 0.35, s * 0.2);
      ctx.closePath();
      ctx.fill();
      // waterline highlight
      ctx.fillStyle = "rgba(180,210,230,0.25)";
      ctx.fillRect(-s * 0.5, s * 0.16, s, 2);
      // twisted metal
      ctx.strokeStyle = "#4a2a18";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, -s * 0.02);
      ctx.lineTo(-s * 0.05, -s * 0.2);
      ctx.lineTo(s * 0.05, -s * 0.1);
      ctx.stroke();
      // ember glow
      ctx.fillStyle = "rgba(255,110,40,0.5)";
      ctx.beginPath();
      ctx.ellipse(-s * 0.05, -s * 0.05, s * 0.14, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

