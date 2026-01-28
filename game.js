const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const uiScore = document.getElementById("score");
const uiStatus = document.getElementById("status");

const W = canvas.width;
const H = canvas.height;

const groundY = 210;
const gravity = 0.55;

// Stephen (simple silhouette block for now)
const stephen = {
  x: 110,
  y: groundY - 52,
  w: 26,
  h: 52,
  vy: 0,
  onGround: true,
};

// Obstacles = thrown stones
let stones = [];

// Game state
let score = 0;
let running = true;
let dead = false;

// Difficulty scaling
let speed = 4.2;
let spawnEvery = 110; // frames
let spawnTimer = 0;

// Speech bubble
const quotes = [
  "Jesus is Lord.",
  "I see the heavens opened.",
  "Father, forgive them.",
  "You cannot silence the truth.",
  "My hope is in Christ.",
  "Truth stands."
];

let bubble = {
  text: "",
  t: 0,      // frames remaining
  fade: 30,  // fade frames at end
  nextAt: 240, // next quote in frames
};

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function reset() {
  stones = [];
  score = 0;
  speed = 4.2;
  spawnEvery = 110;
  spawnTimer = 0;

  stephen.y = groundY - stephen.h;
  stephen.vy = 0;
  stephen.onGround = true;

  bubble.text = "";
  bubble.t = 0;
  bubble.nextAt = rand(220, 340);

  running = true;
  dead = false;

  uiStatus.textContent = "";
}

function jump() {
  if (!running) return;
  if (!stephen.onGround) return;
  stephen.vy = -11.2;
  stephen.onGround = false;
}

function spawnStone() {
  const r = rand(6, 10);
  stones.push({
    x: W + r + 10,
    y: groundY - 6,
    r,
  });
}

function rectCircleHit(rx, ry, rw, rh, cx, cy, cr) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) <= (cr * cr);
}

function updateDifficulty() {
  // score increases ~60 per second; scale gently
  speed = 4.2 + Math.min(6.5, score / 900);

  // spawn gets faster over time, but not insane
  spawnEvery = Math.max(55, 110 - Math.floor(score / 550));
}

function updateSpeech() {
  if (bubble.t > 0) {
    bubble.t--;
    return;
  }

  bubble.nextAt--;
  if (bubble.nextAt <= 0) {
    bubble.text = quotes[rand(0, quotes.length - 1)];
    bubble.t = rand(90, 140); // visible duration
    bubble.nextAt = rand(240, 360); // time until next quote
  }
}

function update() {
  if (!running) return;

  score += 1;
  uiScore.textContent = String(score);

  updateDifficulty();

  // Stephen physics
  stephen.vy += gravity;
  stephen.y += stephen.vy;

  if (stephen.y >= groundY - stephen.h) {
    stephen.y = groundY - stephen.h;
    stephen.vy = 0;
    stephen.onGround = true;
  }

  // Spawn stones
  spawnTimer++;
  if (spawnTimer >= spawnEvery) {
    spawnTimer = 0;
    spawnStone();
  }

  // Move stones
  for (const s of stones) s.x -= speed;
  stones = stones.filter(s => s.x > -50);

  // Collisions
  for (const s of stones) {
    if (rectCircleHit(stephen.x, stephen.y, stephen.w, stephen.h, s.x, s.y, s.r)) {
      running = false;
      dead = true;
      uiStatus.textContent = " — You have been martyred.";
      break;
    }
  }

  updateSpeech();
}

function drawGround() {
  ctx.beginPath();
  ctx.moveTo(0, groundY + 0.5);
  ctx.lineTo(W, groundY + 0.5);
  ctx.stroke();
}

function drawStephen() {
  // body
  ctx.fillRect(stephen.x, stephen.y, stephen.w, stephen.h);

  // head
  ctx.beginPath();
  ctx.arc(stephen.x + stephen.w / 2, stephen.y - 10, 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawStone(s) {
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpeechBubble() {
  if (!bubble.text) return;

  // Only show while active (bubble.t counts down)
  if (bubble.t <= 0) return;

  const paddingX = 10;
  const paddingY = 7;

  ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  const textW = ctx.measureText(bubble.text).width;

  const bw = textW + paddingX * 2;
  const bh = 28;

  // Position relative to Stephen, but keep inside canvas
  let bx = stephen.x - 8;
  let by = stephen.y - 64;

  bx = Math.max(10, Math.min(W - bw - 10, bx));
  by = Math.max(10, by);

  // Fade near end
  const alpha = bubble.t < bubble.fade ? (bubble.t / bubble.fade) : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  // bubble box
  roundRect(bx, by, bw, bh, 10);
  ctx.fill();

  // tail
  ctx.beginPath();
  const tx = Math.max(bx +
