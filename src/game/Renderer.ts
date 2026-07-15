import type { GameManager, EnemyController } from "./straitguard";

// Deterministic pseudo-random for scenery placement (stable per world-Y).
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function render(ctx: CanvasRenderingContext2D, g: GameManager) {
  const { width: W, height: H } = g;

  // water
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#062a44");
  grd.addColorStop(1, "#0d4666");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // animated water stripes
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  const stripeH = 22;
  const offset = (g.cameraY * 0.6) % stripeH;
  for (let y = -stripeH + offset; y < H; y += stripeH * 2) {
    ctx.fillRect(120, y, W - 240, stripeH);
  }

  // land left/right (sandy beach + grass)
  const landW = 110;
  // base earth
  ctx.fillStyle = "#3b2a1c";
  ctx.fillRect(0, 0, landW, H);
  ctx.fillRect(W - landW, 0, landW, H);
  // grass interior
  ctx.fillStyle = "#3a5a2a";
  ctx.fillRect(0, 0, landW - 22, H);
  ctx.fillRect(W - landW + 22, 0, landW - 22, H);
  // sandy beach strip near water
  ctx.fillStyle = "#c9b178";
  ctx.fillRect(landW - 22, 0, 14, H);
  ctx.fillRect(W - landW + 8, 0, 14, H);

  // jagged shoreline
  ctx.fillStyle = "#0d4666";
  for (let y = 0; y < H; y += 12) {
    const jL = ((Math.sin((y + g.cameraY) * 0.07) + 1) / 2) * 8;
    const jR = ((Math.cos((y + g.cameraY) * 0.07) + 1) / 2) * 8;
    ctx.fillRect(landW - 8, y, jL, 12);
    ctx.fillRect(W - landW + 8 - jR, y, jR, 12);
  }

  // scrolling scenery (trees, rocks, buildings) — keyed to world-Y so they scroll with the map
  drawScenery(ctx, g.cameraY, H, landW, W);

  // progress bar at top
  const prog = g.progress();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(landW, 14, W - landW * 2, 4);
  ctx.fillStyle = `rgba(255,200,60,0.95)`;
  ctx.fillRect(landW, 14, (W - landW * 2) * prog, 4);

  // FINISH LINE — safe harbor marker appears as cargo nears its destination
  if (prog > 0.82) {
    const finishWorldY = -200; // world-Y of finish line (above start)
    const finishScreenY = finishWorldY + g.cameraY;
    if (finishScreenY > -40 && finishScreenY < H) {
      drawFinishLine(ctx, finishScreenY, landW, W, Math.min(1, (prog - 0.82) / 0.18));
    }
  }

  // wake behind cargo
  drawWake(ctx, g.cargo.pos.x, g.cargo.pos.y + g.cargo.size.y / 2, g.cargo.size.x * 0.8, 80);

  // cargo (container ship, top-down)
  drawCargoShip(ctx, g.cargo.pos.x, g.cargo.pos.y, g.cargo.size.x, g.cargo.size.y);
  drawHpBar(ctx, g.cargo.pos.x, g.cargo.pos.y - g.cargo.size.y / 2 - 12, 70, g.cargo.hp / g.cargo.maxHp, "CARGO");

  // enemies
  for (const e of g.enemies) {
    drawEnemyBoat(ctx, e);
    drawHpBar(ctx, e.pos.x, e.pos.y - e.size.y / 2 - 10, e.size.x + 14, e.hp / e.maxHp);
  }

  // player frigate
  drawWake(ctx, g.player.pos.x, g.player.pos.y + g.player.size.y / 2, g.player.size.x * 0.7, 50);
  drawFrigate(ctx, g.player.pos.x, g.player.pos.y, g.player.size.x, g.player.size.y);
  drawHpBar(ctx, g.player.pos.x, g.player.pos.y - g.player.size.y / 2 - 12, 60, g.player.hp / g.player.maxHp, "FRIGATE");

  // bullets
  for (const b of g.bullets) {
    ctx.beginPath();
    ctx.fillStyle = b.from === "player" ? "#e8fff0" : "#ffd060";
    ctx.shadowColor = b.from === "player" ? "#7df2b0" : "#ffae3a";
    ctx.shadowBlur = 8;
    ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawScenery(ctx: CanvasRenderingContext2D, cameraY: number, H: number, landW: number, W: number) {
  // Tile scenery every 70px of world-Y; render only tiles visible on screen.
  const tile = 70;
  // World-Y of top of screen = -cameraY; we iterate world tiles in that range.
  const topWorld = -cameraY - tile;
  const botWorld = -cameraY + H + tile;
  const startTile = Math.floor(topWorld / tile);
  const endTile = Math.ceil(botWorld / tile);
  for (let i = startTile; i <= endTile; i++) {
    const worldY = i * tile + (hash(i) - 0.5) * 30;
    const screenY = worldY + cameraY;
    // LEFT side
    const lKind = hash(i * 2.13);
    const lx = 8 + hash(i * 7.7) * (landW - 50);
    drawSceneryItem(ctx, lx, screenY, lKind, i);
    // RIGHT side
    const rKind = hash(i * 3.31 + 0.5);
    const rx = W - landW + 28 + hash(i * 5.9) * (landW - 50);
    drawSceneryItem(ctx, rx, screenY, rKind, i + 1000);
  }
}

function drawSceneryItem(ctx: CanvasRenderingContext2D, x: number, y: number, kind: number, seed: number) {
  if (kind < 0.55) {
    // pine tree
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
  } else if (kind < 0.78) {
    // round bush / palm canopy
    const r = 6 + hash(seed * 2.3) * 5;
    ctx.fillStyle = "#244d1c";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a7a2a";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind < 0.9) {
    // rock
    const r = 5 + hash(seed * 4.1) * 6;
    ctx.fillStyle = "#6a6258";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9a948a";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.4, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // small bunker / building
    const w = 12 + hash(seed * 6.3) * 8;
    const h = 10 + hash(seed * 8.1) * 6;
    ctx.fillStyle = "#807665";
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = "#403830";
    ctx.fillRect(x - w / 2, y - h / 2, w, 2);
    ctx.fillStyle = "#2a2218";
    ctx.fillRect(x - 2, y - 1, 4, 4);
  }
}

function drawFinishLine(ctx: CanvasRenderingContext2D, screenY: number, landW: number, W: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // checker stripe across the strait
  const x0 = landW, x1 = W - landW;
  const step = 16;
  for (let x = x0, i = 0; x < x1; x += step, i++) {
    ctx.fillStyle = i % 2 === 0 ? "#fff" : "#111";
    ctx.fillRect(x, screenY - 6, Math.min(step, x1 - x), 12);
  }
  // harbor markers on each shore
  ctx.fillStyle = "#ffcc33";
  ctx.fillRect(x0 - 8, screenY - 14, 8, 28);
  ctx.fillRect(x1, screenY - 14, 8, 28);
  ctx.fillStyle = "#0b1620";
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

// Top-down container cargo ship — gray hull, bow at top, rows of colored containers
function drawCargoShip(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  const x = cx - w / 2, y = cy - h / 2;
  // hull (pointed bow on top, square stern on bottom — cargo moves UP)
  ctx.fillStyle = "#7a1f1a";
  ctx.strokeStyle = "#1a0a08";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, y);                 // bow tip
  ctx.lineTo(x + w, y + h * 0.18);
  ctx.lineTo(x + w, y + h * 0.95);
  ctx.quadraticCurveTo(cx, y + h, x, y + h * 0.95);
  ctx.lineTo(x, y + h * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // deck
  ctx.fillStyle = "#d6cfb8";
  ctx.fillRect(x + w * 0.16, y + h * 0.12, w * 0.68, h * 0.78);

  // bow superstructure (white bridge near front)
  ctx.fillStyle = "#f3f1ea";
  ctx.fillRect(cx - w * 0.18, y + h * 0.08, w * 0.36, h * 0.1);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w * 0.18, y + h * 0.08, w * 0.36, h * 0.1);

  // containers grid
  const colors = ["#c1392b", "#2c6fb8", "#e08a2a", "#3b8a4f", "#b03b6e", "#d9c24a"];
  const cols = 4, rows = 7;
  const gx = x + w * 0.2, gy = y + h * 0.22;
  const cw = (w * 0.6) / cols, chh = (h * 0.62) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * 7 + c * 3) % colors.length;
      ctx.fillStyle = colors[idx];
      ctx.fillRect(gx + c * cw + 1, gy + r * chh + 1, cw - 2, chh - 2);
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.strokeRect(gx + c * cw + 1, gy + r * chh + 1, cw - 2, chh - 2);
    }
  }

  // stern mast
  ctx.fillStyle = "#222";
  ctx.fillRect(cx - 1, y + h * 0.86, 2, h * 0.08);
}

// Top-down naval frigate — gray hull, pointed bow, turret + bridge
function drawFrigate(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number) {
  const x = cx - w / 2, y = cy - h / 2;
  // hull
  ctx.fillStyle = "#4a5560";
  ctx.strokeStyle = "#0d1115";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, y);                       // bow tip
  ctx.lineTo(x + w * 0.92, y + h * 0.22);
  ctx.lineTo(x + w * 0.92, y + h * 0.92);
  ctx.lineTo(x + w * 0.08, y + h * 0.92);
  ctx.lineTo(x + w * 0.08, y + h * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // deck
  ctx.fillStyle = "#6b7884";
  ctx.fillRect(x + w * 0.18, y + h * 0.18, w * 0.64, h * 0.7);

  // forward turret (front gun)
  ctx.fillStyle = "#2a323a";
  ctx.beginPath();
  ctx.arc(cx, y + h * 0.28, w * 0.14, 0, Math.PI * 2);
  ctx.fill();
  // barrel pointing forward (up)
  ctx.fillRect(cx - 2, y + h * 0.08, 4, h * 0.22);

  // bridge / superstructure
  ctx.fillStyle = "#cfd6dc";
  ctx.fillRect(cx - w * 0.18, y + h * 0.42, w * 0.36, h * 0.22);
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w * 0.18, y + h * 0.42, w * 0.36, h * 0.22);

  // rear deck details
  ctx.fillStyle = "#2a323a";
  ctx.fillRect(cx - w * 0.1, y + h * 0.7, w * 0.2, h * 0.12);

  // mast
  ctx.fillStyle = "#111";
  ctx.fillRect(cx - 1, y + h * 0.35, 2, h * 0.18);
}

function drawEnemyBoat(ctx: CanvasRenderingContext2D, e: EnemyController) {
  const { x: cx, y: cy } = e.pos;
  const w = e.size.x, h = e.size.y;
  const x = cx - w / 2, y = cy - h / 2;
  // hull
  ctx.fillStyle = e.color;
  ctx.strokeStyle = "#1a0505";
  ctx.lineWidth = 2;
  ctx.beginPath();
  // pointed toward strait center
  ctx.moveTo(e.fromSide === "left" ? x + w : x, cy);
  ctx.lineTo(x + w * 0.85, y);
  ctx.lineTo(x + w * 0.15, y);
  ctx.lineTo(x, cy);
  ctx.lineTo(x + w * 0.15, y + h);
  ctx.lineTo(x + w * 0.85, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // turret
  ctx.fillStyle = "#1a0505";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawHpBar(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, frac: number, label?: string) {
  const h = 6;
  const x = cx - w / 2;
  // bg
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  // gradient fill orange→red like the reference
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
