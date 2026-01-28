// game.js (REPLACE ENTIRE FILE)
//
// Requires:
//   Assets/StephenPixel.png
//   Assets/Stone.png

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const uiScore = document.getElementById("score") || { textContent: "" };
const uiBest = document.getElementById("best") || { textContent: "" };
const uiStatus = document.getElementById("status") || { textContent: "" };

const W = canvas.width;
const H = canvas.height;

// ===================== CORE TUNING =====================

// Ground anchor
const groundY = 315;

// Speed
const BASE_SPEED = 7.2;
const SPEED_GAIN = 1 / 950;
const MAX_SPEED_ADD = 8.2;

// Spawns
const SPAWN_BASE = 82;
const SPAWN_MIN = 40;

// Jump / physics
const gravity = 0.62;
const jumpPower = -17.2;

// Glide: short + cooldown
const GLIDE_ASSIST = -0.08;
const GLIDE_MAX_FRAMES = 7;
const GLIDE_COOLDOWN_FRAMES = 34;
const GLIDE_ONLY_WHILE_RISING = true;

// ====== STONES (fix height + size + damage) ======
const STONE_SIZE_MULT = 1.05;     // much smaller on screen
const STONE_RADIUS_MIN = 4;       // actual hit circle radius
const STONE_RADIUS_MAX = 6;
const STONE_HIT_MULT = 1.55;      // forgiving collision so they actually kill
const STONE_Y_ABOVE_GROUND_MIN = 10; // VERY LOW (so you jump over them)
const STONE_Y_ABOVE_GROUND_MAX = 22;

// Keep flight basically flat
const STONE_VY_RANGE = 0.03;

// ===================== STATE =====================
let score = 0;
let best = Number(localStorage.getItem("stephenBest") || 0);

let running = false;
let dead = false;

let speed = BASE_SPEED;
let spawnEvery = SPAWN_BASE;

let jumpHeld = false;
let jumpHoldFrames = 0;
let glideCooldown = 0;

// ===================== SPRITES =====================
const stephenImg = new Image();
stephenImg.src = "./Assets/StephenPixel.png";

let stephenImgReady = false;
const SHEET = { frames: 3, frameW: 0, frameH: 0, scale: 0.33 };

stephenImg.onload = () => {
  stephenImgReady = true;
  SHEET.frameW = stephenImg.width / SHEET.frames;
  SHEET.frameH = stephenImg.height;
};

const stoneImg = new Image();
stoneImg.src = "./Assets/Stone.png";
let stoneReady = false;
stoneImg.onload = () => { stoneReady = true; };

// ===================== PLAYER (ANCHOR RULE) =====================
const stephen = {
  x: 180,
  w: 34,
  h: 48,
  y: 0,
  vy: 0,
  onGround: true
};

// ===================== ENTITIES =====================
let throwers = [];
let throwerTimer = 0;

let stones = [];
let stoneId = 1;

// Small details: dust motes + ground dust
let dust = [];

// ===================== SPEECH =====================
const quotes = [
  "Jesus is Lord.",
  "My hope is in Christ.",
  "Truth stands.",
  "Father, forgive them.",
  "I see the heavens opened."
];
let bubble = { text: "", t: 0, fade: 26, nextAt: 170 };

// ===================== BACKGROUND =====================
const bg = { t: 0, dunes1: [], dunes2: [], temples: [] };

function rand(min, max) { return Math.random() * (max - min) + min; }
function randi(min, max) { return Math.floor(rand(min, max + 1)); }
function fmt(n){ return n.toLocaleString(); }

// ===================== BACKGROUND =====================
function initBackground() {
  bg.dunes1 = [];
  bg.dunes2 = [];
  for (let i = 0; i < 22; i++) bg.dunes2.push({ x: i * 90, h: rand(18, 62) });
  for (let i = 0; i < 26; i++) bg.dunes1.push({ x: i * 80, h: rand(10, 44) });

  bg.temples = [];
  for (let i = 0; i < 5; i++) spawnTemple(true);
}

function spawnTemple(initial = false) {
  const scale = rand(0.35, 0.70);
  const y = rand(90, 165);
  const w = 160 * scale;
  const h = 105 * scale;
  const x = initial ? rand(0, W) : rand(W + 80, W + 520);

  bg.temples.push({
    x, y, w, h,
    vx: rand(0.22, 0.55),
    phase: rand(0, 1)
  });
}

function updateBackground() {
  bg.t++;

  const backSpeed = speed * 0.16;
  const frontSpeed = speed * 0.34;

  for (const d of bg.dunes2) d.x -= backSpeed;
  for (const d of bg.dunes1) d.x -= frontSpeed;

  for (const d of bg.dunes2) {
    if (d.x < -90) { d.x += 90 * bg.dunes2.length; d.h = rand(18, 62); }
  }
  for (const d of bg.dunes1) {
    if (d.x < -80) { d.x += 80 * bg.dunes1.length; d.h = rand(10, 44); }
  }

  for (const tp of bg.temples) tp.x -= tp.vx;
  bg.temples = bg.temples.filter(tp => tp.x > -tp.w - 140);
  while (bg.temples.length < 5) spawnTemple(false);
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#26264a");
  g.addColorStop(0.50, "#6a4a3a");
  g.addColorStop(1, "#c49a66");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // subtle vignette
  const v = ctx.createRadialGradient(W*0.5, H*0.55, 120, W*0.5, H*0.55, 720);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = v;
  ctx.fillRect(0,0,W,H);
}

function drawSunHaze() {
  const cx = W * 0.79;
  const cy = H * 0.20;
  const r = 190;
  const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, r);
  g.addColorStop(0, "rgba(255,235,190,0.20)");
  g.addColorStop(1, "rgba(255,235,190,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawTemples() {
  for (const tp of bg.temples) {
    const fade = 0.06 + 0.14 * (0.5 + 0.5 * Math.sin((bg.t * 0.004) + tp.phase * Math.PI * 2));
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = "rgba(20,16,18,1)";

    const x = tp.x, y = tp.y, w = tp.w, h = tp.h;
    roundRect(x, y, w, h * 0.55, 10); ctx.fill();
    roundRect(x + w * 0.12, y - h * 0.18, w * 0.76, h * 0.35, 12); ctx.fill();
    roundRect(x + w * 0.28, y - h * 0.33, w * 0.44, h * 0.22, 12); ctx.fill();

    ctx.restore();
  }
}

function drawDunes() {
  // far dunes
  ctx.fillStyle = "#8a6242";
  ctx.beginPath();
  ctx.moveTo(0, groundY - 90);
  for (const d of bg.dunes2) {
    ctx.quadraticCurveTo(d.x + 45, groundY - 140 - d.h, d.x + 90, groundY - 90);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // near dunes
  ctx.fillStyle = "#a4764d";
  ctx.beginPath();
  ctx.moveTo(0, groundY - 28);
  for (const d of bg.dunes1) {
    ctx.quadraticCurveTo(d.x + 40, groundY - 78 - d.h, d.x + 80, groundY - 28);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // ground line
  ctx.strokeStyle = "rgba(30,20,18,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundY + 0.5);
  ctx.lineTo(W, groundY + 0.5);
  ctx.stroke();
}

// ===================== COLLISION =====================
function rectCircleHit(rx, ry, rw, rh, cx, cy, cr) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) <= (cr * cr);
}

// ===================== DIFFICULTY =====================
function updateDifficulty() {
  speed = BASE_SPEED + Math.min(MAX_SPEED_ADD, score * SPEED_GAIN * 1000);
  spawnEvery = Math.max(SPAWN_MIN, SPAWN_BASE - Math.floor(score / 700));
}

// ===================== RESET =====================
function reset() {
  score = 0;
  running = false;
  dead = false;

  speed = BASE_SPEED;
  spawnEvery = SPAWN_BASE;

  stones = [];
  throwers = [];
  throwerTimer = 0;
  stoneId = 1;

  dust = [];

  // anchored to ground
  stephen.y = groundY - stephen.h;
  stephen.vy = 0;
  stephen.onGround = true;

  jumpHeld = false;
  jumpHoldFrames = 0;
  glideCooldown = 0;

  bubble.text = "";
  bubble.t = 0;
  bubble.fade = 26;
  bubble.nextAt = randi(140, 240);

  uiScore.textContent = fmt(score);
  uiBest.textContent = best ? ` · Best: ${fmt(best)}` : "";
  uiStatus.textContent = " — press Space to begin";

  initBackground();
}

function jump() {
  if (dead) return;

  if (!running) {
    running = true;
    uiStatus.textContent = "";
  }

  if (!stephen.onGround) return;

  stephen.vy = jumpPower;
  stephen.onGround = false;
  jumpHoldFrames = 0;
  glideCooldown = 0;

  // dust pop on takeoff
  for (let i = 0; i < 6; i++) {
    dust.push({
      x: stephen.x + 18 + rand(-6, 6),
      y: groundY - 6 + rand(-2, 2),
      vx: -rand(0.6, 1.4),
      vy: -rand(0.2, 1.0),
      r: rand(1.4, 2.8),
      a: rand(0.20, 0.35),
      t: randi(18, 30)
    });
  }
}

// ===================== SPEECH =====================
function updateSpeech() {
  if (!running || dead) return;

  if (bubble.t > 0) {
    bubble.t--;
    if (bubble.t === 0) bubble.text = "";
    return;
  }

  bubble.nextAt--;
  if (bubble.nextAt <= 0) {
    bubble.text = quotes[randi(0, quotes.length - 1)];
    bubble.t = randi(95, 140);
    bubble.nextAt = randi(230, 380);
  }
}

// ===================== THROWERS + STONES =====================
function spawnThrower() {
  const x = W + randi(180, 360);
  throwers.push({ x, thrown: false });
}

function spawnStoneFrom(x, y) {
  const r = randi(STONE_RADIUS_MIN, STONE_RADIUS_MAX);

  // stone crosses the whole play area from right -> left
  const vx = -(speed + rand(0.4, 1.2));
  const vy = rand(-STONE_VY_RANGE, STONE_VY_RANGE);

  stones.push({
    id: stoneId++,
    x, y,
    r,
    vx, vy,
    rot: rand(0, Math.PI * 2),
    vr: rand(-0.10, 0.10)
  });
}

function updateThrowers() {
  throwerTimer++;

  if (throwerTimer >= spawnEvery) {
    throwerTimer = 0;
    spawnThrower();
  }

  for (const p of throwers) {
    p.x -= speed * 0.9;

    // throw once when visible
    if (!p.thrown && p.x < W * 0.84) {
      p.thrown = true;

      // STONE HEIGHT FIX: always near the ground
      const above = randi(STONE_Y_ABOVE_GROUND_MIN, STONE_Y_ABOVE_GROUND_MAX);
      const y = groundY - above;

      spawnStoneFrom(p.x + 12, y);
    }
  }

  throwers = throwers.filter(p => p.x > -140);
}

function updateStones() {
  for (const s of stones) {
    s.x += s.vx;
    s.y += s.vy;
    s.rot += s.vr;
  }

  // keep them long enough to reach Stephen
  stones = stones.filter(s => s.x > -420);
}

// ===================== SMALL DETAILS =====================
function updateDust() {
  for (const d of dust) {
    d.x += d.vx;
    d.y += d.vy;
    d.vx *= 0.98;
    d.vy *= 0.96;
    d.a *= 0.965;
    d.t--;
  }
  dust = dust.filter(d => d.t > 0 && d.a > 0.02);
}

function drawDust() {
  for (const d of dust) {
    ctx.save();
    ctx.globalAlpha = d.a;
    ctx.fillStyle = "rgba(245,235,210,1)";
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ===================== DRAW ENTITIES =====================
function drawThrowers() {
  for (const p of throwers) {
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = "rgba(25,18,16,1)";
    ctx.fillRect(p.x - 8, groundY - 44, 16, 32);
    ctx.beginPath();
    ctx.arc(p.x, groundY - 54, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawStones() {
  for (const s of stones) {
    const size = s.r * STONE_SIZE_MULT;

    // tiny shadow on ground to sell “near-ground flight”
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.beginPath();
    ctx.ellipse(s.x, groundY + 2, size * 0.75, size * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);

    if (stoneReady) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(stoneImg, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = "rgba(70,58,52,1)";
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawStephen() {
  let frame = 0;
  if (!stephen.onGround) frame = 2;
  else if (running) frame = (Math.floor(score / 7) % 2 === 0) ? 1 : 0;

  if (!stephenImgReady) {
    ctx.fillStyle = "#eaeaea";
    ctx.fillRect(stephen.x, stephen.y, stephen.w, stephen.h);
    return;
  }

  const sx = frame * SHEET.frameW;
  const sw = SHEET.frameW;
  const sh = SHEET.frameH;

  const dw = sw * SHEET.scale;
  const dh = sh * SHEET.scale;

  // Anchor sprite feet to hitbox bottom (no drift)
  const dx = stephen.x - 14;
  const dy = (stephen.y + stephen.h) - dh;

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(stephenImg, sx, 0, sw, sh, dx, dy, dw, dh);

  // subtle ground shadow
  ctx.save();
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.beginPath();
  ctx.ellipse(stephen.x + 18, groundY + 3, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpeechBubble() {
  if (!bubble.text || bubble.t <= 0 || dead) return;

  ctx.font = "16px system-ui,-apple-system,Segoe UI,Roboto,Arial";
  const textW = ctx.measureText(bubble.text).width;

  const padX = 10;
  const bw = textW + padX * 2;
  const bh = 28;

  let bx = stephen.x - 8;
  let by = stephen.y - 62;

  bx = Math.max(12, Math.min(W - bw - 12, bx));
  by = Math.max(12, by);

  const alpha = bubble.t < bubble.fade ? (bubble.t / bubble.fade) : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = "rgba(245,235,210,0.98)";
  roundRect(bx, by, bw, bh, 10);
  ctx.fill();

  ctx.beginPath();
  const tx = Math.max(bx + 16, Math.min(bx + bw - 20, stephen.x + 10));
  ctx.moveTo(tx, by + bh);
  ctx.lineTo(tx + 10, by + bh + 10);
  ctx.lineTo(tx + 22, by + bh);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(20,16,18,1)";
  ctx.fillText(bubble.text, bx + padX, by + 19);

  ctx.restore();
}

function drawOverlay() {
  if (!running && !dead) {
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f0e9db";
    ctx.font = "30px system-ui,-apple-system,Segoe UI,Roboto,Arial";
    ctx.fillText("Press Space to begin", 420, 170);

    ctx.font = "14px system-ui,-apple-system,Segoe UI,Roboto,Arial";
    ctx.fillStyle = "rgba(240,233,219,0.75)";
    ctx.fillText("Endure. Jump the stones. Speak the truth.", 438, 200);
  }

  if (dead) {
    ctx.fillStyle = "rgba(0,0,0,0.34)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f0e9db";
    ctx.font = "30px system-ui,-apple-system,Segoe UI,Roboto,Arial";
    ctx.fillText("You have been martyred.", 410, 170);

    ctx.font = "14px system-ui,-apple-system,Segoe UI,Roboto,Arial";
    ctx.fillStyle = "rgba(240,233,219,0.75)";
    ctx.fillText("Press R to restart", 530, 204);
  }
}

// ===================== UPDATE LOOP =====================
function update() {
  updateBackground();

  if (glideCooldown > 0) glideCooldown--;

  if (!running || dead) {
    updateSpeech();
    updateDust();
    return;
  }

  score++;
  uiScore.textContent = fmt(score);

  updateDifficulty();
  updateThrowers();
  updateStones();

  // ===== PLAYER PHYSICS (ANCHOR RULE) =====
  if (stephen.onGround) {
    stephen.y = groundY - stephen.h;
    stephen.vy = 0;

    // tiny running dust occasionally
    if (score % 9 === 0) {
      dust.push({
        x: stephen.x + 10,
        y: groundY - 4,
        vx: -rand(0.6, 1.4),
        vy: -rand(0.1, 0.6),
        r: rand(1.0, 2.2),
        a: rand(0.14, 0.26),
        t: randi(16, 26)
      });
    }
  } else {
    stephen.vy += gravity;

    const canGlide = (glideCooldown === 0) && (jumpHoldFrames < GLIDE_MAX_FRAMES);
    const risingOk = !GLIDE_ONLY_WHILE_RISING || (stephen.vy < 0);

    if (jumpHeld && canGlide && risingOk) {
      stephen.vy += GLIDE_ASSIST;
      jumpHoldFrames++;
      if (jumpHoldFrames >= GLIDE_MAX_FRAMES) glideCooldown = GLIDE_COOLDOWN_FRAMES;
    }

    stephen.y += stephen.vy;

    if (stephen.y >= groundY - stephen.h) {
      stephen.y = groundY - stephen.h;
      stephen.vy = 0;
      stephen.onGround = true;
      jumpHoldFrames = 0;
      glideCooldown = 0;

      // landing dust
      for (let i = 0; i < 6; i++) {
        dust.push({
          x: stephen.x + 18 + rand(-6, 6),
          y: groundY - 6 + rand(-2, 2),
          vx: -rand(0.4, 1.2),
          vy: -rand(0.2, 1.0),
          r: rand(1.4, 2.6),
          a: rand(0.16, 0.30),
          t: randi(16, 28)
        });
      }
    }
  }

  // ===== COLLISION (MAKE THEM KILL) =====
  for (const s of stones) {
    const hitR = s.r * STONE_HIT_MULT;
    if (rectCircleHit(stephen.x, stephen.y, stephen.w, stephen.h, s.x, s.y, hitR)) {
      dead = true;
      running = false;

      best = Math.max(best, score);
      localStorage.setItem("stephenBest", String(best));
      uiBest.textContent = best ? ` · Best: ${fmt(best)}` : "";

      uiStatus.textContent = " — You have been martyred.";
      break;
    }
  }

  updateSpeech();
  updateDust();
}

function draw() {
  drawSky();
  drawSunHaze();
  drawTemples();
  drawDunes();

  drawDust();
  drawThrowers();
  drawStones();
  drawStephen();
  drawSpeechBubble();
  drawOverlay();
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// ===================== INPUT =====================
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    jumpHeld = true;
    jump();
  }
  if (e.code === "KeyR") reset();
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") jumpHeld = false;
});

canvas.addEventListener("pointerdown", () => {
  if (dead) reset();
  else {
    jumpHeld = true;
    jump();
    setTimeout(() => { jumpHeld = false; }, 120);
  }
});

// Boot
uiBest.textContent = best ? ` · Best: ${fmt(best)}` : "";
reset();
loop();
