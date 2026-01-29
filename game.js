// game.js (PASTE THIS WHOLE FILE — REPLACE ENTIRE game.js)
//
// Requires:
//   Assets/StephenPixel.png
//   Assets/Stone.png

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const uiScore = document.getElementById("score") || { textContent: "" };
const uiStatus = document.getElementById("status") || { textContent: "" };

const W = canvas.width;
const H = canvas.height;

// ===================== TUNING =====================

// Ground line (visual + collision reference)
const groundY = 250;

// Speed (game felt slow)
const BASE_SPEED = 6.2;          // was 4.0
const SPEED_GAIN = 1 / 850;      // how fast it ramps with score
const MAX_SPEED_ADD = 7.0;       // max extra speed

// Spawn
const SPAWN_BASE = 90;           // lower = more frequent
const SPAWN_MIN = 46;

// Jump + glide (glide was too strong)
// - bigger jump still
// - glide now: short, weak, and has cooldown
const gravity = 0.55;
const jumpPower = -15.8;

const GLIDE_ASSIST = -0.10;      // weaker upward assist
const GLIDE_MAX_FRAMES = 8;      // short glide duration
const GLIDE_COOLDOWN_FRAMES = 26; // must wait before gliding again
const GLIDE_ONLY_WHILE_RISING = true;

// Stephen visual alignment (he was floating)
const STEPHEN_DRAW_Y_OFFSET = 96; // increase until feet are on line
const STEPHEN_DRAW_X_OFFSET = 14;

// Stones: fly across longer + stay on-screen
const STONE_SIZE_MULT = 2.9;
const STONE_VY_RANGE = 0.10;     // almost flat

// Throw height
const THROW_Y_MIN = 95;
const THROW_Y_MAX = 140;

// ===================== STATE =====================
let score = 0;
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

// ===================== PLAYER (HITBOX) =====================
const stephen = {
  x: 160,
  y: groundY - 46,
  w: 32,
  h: 46,
  vy: 0,
  onGround: true
};

// ===================== ENTITIES =====================
let throwers = [];
let throwerTimer = 0;

let stones = [];
let stoneId = 1;

// ===================== SPEECH =====================
const quotes = [
  "Jesus is Lord.",
  "I see the heavens opened.",
  "Father, forgive them.",
  "Truth stands.",
  "My hope is in Christ.",
  "You cannot silence the truth."
];
let bubble = { text: "", t: 0, fade: 26, nextAt: 180 };

// ===================== BACKGROUND =====================
const bg = { t: 0, dunes1: [], dunes2: [], temples: [] };

function rand(min, max) { return Math.random() * (max - min) + min; }
function randi(min, max) { return Math.floor(rand(min, max + 1)); }

function initBackground() {
  bg.dunes1 = [];
  bg.dunes2 = [];
  for (let i = 0; i < 18; i++) bg.dunes2.push({ x: i * 80, h: rand(20, 60) });
  for (let i = 0; i < 22; i++) bg.dunes1.push({ x: i * 70, h: rand(10, 40) });

  bg.temples = [];
  for (let i = 0; i < 4; i++) spawnTemple(true);
}

function spawnTemple(initial = false) {
  const scale = rand(0.35, 0.65);
  const y = rand(95, 155);
  const w = 140 * scale;
  const h = 90 * scale;
  const x = initial ? rand(0, W) : rand(W + 80, W + 420);

  bg.temples.push({
    x, y, w, h,
    vx: rand(0.25, 0.55),
    phase: rand(0, 1)
  });
}

function updateBackground() {
  bg.t++;

  const backSpeed = speed * 0.18;
  const frontSpeed = speed * 0.38;

  for (const d of bg.dunes2) d.x -= backSpeed;
  for (const d of bg.dunes1) d.x -= frontSpeed;

  for (const d of bg.dunes2) {
    if (d.x < -80) { d.x += 80 * bg.dunes2.length; d.h = rand(20, 60); }
  }
  for (const d of bg.dunes1) {
    if (d.x < -70) { d.x += 70 * bg.dunes1.length; d.h = rand(10, 40); }
  }

  for (const tp of bg.temples) tp.x -= tp.vx;
  bg.temples = bg.temples.filter(tp => tp.x > -tp.w - 100);
  while (bg.temples.length < 4) spawnTemple(false);
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
  g.addColorStop(0, "#2a2a4a");
  g.addColorStop(0.45, "#6c4a3a");
  g.addColorStop(0.9, "#b58a5a");
  g.addColorStop(1, "#c49a66");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawSunHaze() {
  const cx = W * 0.78;
  const cy = H * 0.22;
  const r = 160;
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
  g.addColorStop(0, "rgba(255,235,190,0.22)");
  g.addColorStop(1, "rgba(255,235,190,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawTemples() {
  for (const tp of bg.temples) {
    const fade = 0.08 + 0.16 * (0.5 + 0.5 * Math.sin((bg.t * 0.004) + tp.phase * Math.PI * 2));
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = "rgba(20,16,18,1)";

    const x = tp.x, y = tp.y, w = tp.w, h = tp.h;
    roundRect(x, y, w, h * 0.55, 8); ctx.fill();
    roundRect(x + w * 0.12, y - h * 0.18, w * 0.76, h * 0.35, 10); ctx.fill();
    roundRect(x + w * 0.28, y - h * 0.33, w * 0.44, h * 0.22, 10); ctx.fill();

    ctx.globalAlpha = fade * 0.9;
    ctx.fillRect(x + w * 0.08, y + h * 0.35, w * 0.08, h * 0.25);
    ctx.fillRect(x + w * 0.84, y + h * 0.35, w * 0.08, h * 0.25);

    ctx.restore();
  }
}

function drawDunes() {
  ctx.fillStyle = "#8a6242";
  ctx.beginPath();
  ctx.moveTo(0, groundY - 55);
  for (const d of bg.dunes2) {
    ctx.quadraticCurveTo(d.x + 40, groundY - 95 - d.h, d.x + 80, groundY - 55);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#a4764d";
  ctx.beginPath();
  ctx.moveTo(0, groundY - 15);
  for (const d of bg.dunes1) {
    ctx.quadraticCurveTo(d.x + 35, groundY - 55 - d.h, d.x + 70, groundY - 15);
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
  spawnEvery = Math.max(SPAWN_MIN, SPAWN_BASE - Math.floor(score / 650));
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

  stephen.y = groundY - stephen.h;
  stephen.vy = 0;
  stephen.onGround = true;

  jumpHeld = false;
  jumpHoldFrames = 0;
  glideCooldown = 0;

  bubble.text = "";
  bubble.t = 0;
  bubble.fade = 26;
  bubble.nextAt = randi(160, 260);

  uiScore.textContent = "0";
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

  // reset glide usage per jump
  jumpHoldFrames = 0;
  glideCooldown = 0;
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
  const x = W + randi(140, 300);
  throwers.push({ x, thrown: false });
}

function spawnStoneFrom(x, y) {
  const r = randi(12, 18);

  // IMPORTANT: stone must cross the whole play area before disappearing
  // so its leftward speed should be close to game speed (not huge)
  const vx = -(speed + rand(0.8, 1.8));

  // Flat flight (no gravity)
  const vy = rand(-STONE_VY_RANGE, STONE_VY_RANGE);

  stones.push({
    id: stoneId++,
    x, y,
    r,
    vx, vy,
    rot: rand(0, Math.PI * 2),
    vr: rand(-0.12, 0.12)
  });
}

function updateThrowers() {
  throwerTimer++;

  // more frequent spawns
  if (throwerTimer >= spawnEvery) {
    throwerTimer = 0;
    spawnThrower();
  }

  for (const p of throwers) {
    p.x -= speed * 0.9;

    // throw once when visible
    if (!p.thrown && p.x < W * 0.82) {
      p.thrown = true;
      const handX = p.x + 12;
      const handY = groundY - randi(THROW_Y_MIN, THROW_Y_MAX);
      spawnStoneFrom(handX, handY);
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

  // FIX: don't delete them early. keep until far left.
  stones = stones.filter(s => s.x > -260);
}

// ===================== DRAW ENTITIES =====================
function drawThrowers() {
  for (const p of throwers) {
    ctx.save();
    ctx.globalAlpha = 0.33;
    ctx.fillStyle = "rgba(25,18,16,1)";

    ctx.fillRect(p.x - 8, groundY - 44, 16, 32);
    ctx.beginPath();
    ctx.arc(p.x, groundY - 54, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.28;
    ctx.fillRect(p.x + 4, groundY - 38, 14, 6);

    ctx.restore();
  }
}

function drawStones() {
  for (const s of stones) {
    const size = s.r * STONE_SIZE_MULT;

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

  // Feet placement: put sprite feet on the ground line via offset
  const dx = stephen.x - STEPHEN_DRAW_X_OFFSET;
  const dy = groundY - dh + STEPHEN_DRAW_Y_OFFSET;

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(stephenImg, sx, 0, sw, sh, dx, dy, dw, dh);
}

function drawSpeechBubble() {
  if (!bubble.text || bubble.t <= 0 || dead) return;

  ctx.font = "16px system-ui,-apple-system,Segoe UI,Roboto,Arial";
  const textW = ctx.measureText(bubble.text).width;

  const padX = 10;
  const bw = textW + padX * 2;
  const bh = 28;

  let bx = stephen.x - 12;
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
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f0e9db";
    ctx.font = "28px system-ui,-apple-system,Segoe UI,Roboto,Arial";
    ctx.fillText("Press Space to begin", 310, 150);

    ctx.font = "14px system-ui,-apple-system,Segoe UI,Roboto,Arial";
    ctx.fillStyle = "rgba(240,233,219,0.75)";
    ctx.fillText("Endure. Jump the stones. Speak the truth.", 330, 178);
  }

  if (dead) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#f0e9db";
    ctx.font = "28px system-ui,-apple-system,Segoe UI,Roboto,Arial";
    ctx.fillText("You have been martyred.", 320, 150);

    ctx.font = "14px system-ui,-apple-system,Segoe UI,Roboto,Arial";
    ctx.fillStyle = "rgba(240,233,219,0.75)";
    ctx.fillText("Press R to restart", 405, 180);
  }
}

// ===================== UPDATE / DRAW LOOP =====================
function update() {
  updateBackground();

  // cooldown ticks even if not running
  if (glideCooldown > 0) glideCooldown--;

  if (!running || dead) {
    updateSpeech();
    return;
  }

  score++;
  uiScore.textContent = String(score);

  updateDifficulty();
  updateThrowers();
  updateStones();

  // Player physics
  stephen.vy += gravity;

  // Glide: short + only once per cooldown
  const canGlide = (glideCooldown === 0) && (jumpHoldFrames < GLIDE_MAX_FRAMES);
  const risingOk = !GLIDE_ONLY_WHILE_RISING || (stephen.vy < 0);

  if (!stephen.onGround && jumpHeld && canGlide && risingOk) {
    stephen.vy += GLIDE_ASSIST;
    jumpHoldFrames++;

    // when glide ends, force cooldown
    if (jumpHoldFrames >= GLIDE_MAX_FRAMES) {
      glideCooldown = GLIDE_COOLDOWN_FRAMES;
    }
  }

  stephen.y += stephen.vy;

  if (stephen.y >= groundY - stephen.h) {
    stephen.y = groundY - stephen.h;
    stephen.vy = 0;
    stephen.onGround = true;
    jumpHoldFrames = 0;
    glideCooldown = 0;
  }

  // Collision (stones only)
  for (const s of stones) {
    if (rectCircleHit(stephen.x, stephen.y, stephen.w, stephen.h, s.x, s.y, s.r)) {
      dead = true;
      running = false;
      uiStatus.textContent = " — You have been martyred.";
      break;
    }
  }

  updateSpeech();
}

function draw() {
  drawSky();
  drawSunHaze();
  drawTemples();
  drawDunes();

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
  if (e.code === "Space" || e.code === "ArrowUp") {
    jumpHeld = false;
    // do NOT reset jumpHoldFrames here; cooldown logic handles it
  }
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
reset();
loop();
