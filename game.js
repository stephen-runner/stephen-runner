<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Stephen Runner</title>
  <style>
    :root { color-scheme: dark; }
    body{
      margin:0;
      background:#070709;
      min-height:100vh;
      display:grid;
      place-items:center;
      font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      color:#eaeaea;
    }
    .wrap{ width:min(1200px, 98vw); }
    .hud{
      display:flex;
      justify-content:space-between;
      align-items:baseline;
      gap:12px;
      margin:0 0 10px 0;
      user-select:none;
      opacity:.95;
      flex-wrap:wrap;
    }
    .hud small{ opacity:.7; }
    canvas{
      width:100%;
      height:auto;
      border-radius:18px;
      border:1px solid #2a2a33;
      background:#111;
      display:block;
      box-shadow: 0 20px 60px rgba(0,0,0,.45);
    }
    .hint{
      margin-top:10px;
      opacity:.7;
      user-select:none;
      font-size:14px;
    }
    kbd{ background:#14141a; border:1px solid #2a2a33; padding:2px 8px; border-radius:8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hud">
      <div><strong>Stephen Runner</strong> <small id="status">— press Space to begin</small></div>
      <div>
        Score: <strong id="score">0</strong>
        <small>• Best: <span id="best">0</span></small>
      </div>
    </div>

    <canvas id="game" width="1100" height="520"></canvas>

    <div class="hint">
      Jump: <kbd>Space</kbd> / <kbd>↑</kbd> • Restart: <kbd>R</kbd>
    </div>
  </div>

<script>
(() => {
  // =========================
  // ASSETS (GitHub Pages is case-sensitive)
  // Your repo shows:
  // Assets/StephenPixel.png
  // Assets/Stone.png
  // Assets/stonethrower.png   (lowercase)
  // =========================
  const BASE = new URL("./", location.href);
  const ASSET = {
    stephen: new URL("Assets/StephenPixel.png", BASE).href,
    stone:   new URL("Assets/Stone.png", BASE).href,
    thrower: new URL("Assets/stonethrower.png", BASE).href,
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width;
  const H = canvas.height;

  // Ground: visibly on ground, not floating
  const GROUND_Y = Math.floor(H * 0.80);

  // Speed / difficulty (fair, not impossible)
  let WORLD_SPEED = 480;          // px/sec (scroll)
  const WORLD_RAMP = 7;           // ramps slowly
  const WORLD_SPEED_CAP = 760;    // prevents "unfair late game"

  // Player physics (grounded)
  const GRAVITY = 2350;
  const JUMP_V = 980;
  const MAX_FALL = 1700;

  // Throwers / stones
  const THROWER_SPAWN_MIN = 1.25;
  const THROWER_SPAWN_MAX = 2.10;

  const STONE_SPEED = 520;        // additional speed beyond world scroll
  const STONE_SIZE = 18;          // visible but jumpable
  const STONE_THROW_Y = 22;       // relative to thrower top (kept low enough to jump)
  const STONE_HITBOX_PAD = 3;     // slightly forgiving

  // Sprites (your thrower sheet is 1 row, 4 frames)
  const StephenSprite = {
    frameW: 64,
    frameH: 64,
    frames: 6,     // adjust if your Stephen sheet differs
    row: 0,
    fps: 12
  };

  const ThrowerSprite = {
    frameW: 64,
    frameH: 64,
    frames: 4,     // 4 frames across
    variants: 1,   // 1 row ONLY (you requested this)
    fps: 10,
    throwFrame: 2  // stone releases on frame 2
  };

  // UI
  const scoreEl = document.getElementById("score");
  const bestEl  = document.getElementById("best");
  const statusEl= document.getElementById("status");

  // Best score
  const BEST_KEY = "stephenRunnerBest";
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = String(best);

  // State
  let running = false;
  let dead = false;
  let score = 0;

  const player = {
    x: Math.floor(W * 0.18),
    y: 0,
    w: 56,
    h: 56,
    vy: 0,
    grounded: true,
    animT: 0,
    animF: 0
  };

  const throwers = [];
  const stones = [];
  let nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);

  // =========================
  // Image loading
  // =========================
  function loadImage(src){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ img, ok:true });
      img.onerror = () => resolve({ img:null, ok:false });
      img.src = src;
    });
  }

  let stephenImg=null, throwerImg=null, stoneImg=null;
  let haveStephen=false, haveThrower=false, haveStone=false;

  Promise.all([
    loadImage(ASSET.stephen),
    loadImage(ASSET.thrower),
    loadImage(ASSET.stone)
  ]).then(([a,b,c]) => {
    stephenImg = a.img; haveStephen = a.ok;
    throwerImg = b.img; haveThrower = b.ok;
    stoneImg   = c.img; haveStone   = c.ok;

    // If anything is missing, show it immediately (still runs with fallbacks)
    const miss = [];
    if (!haveStephen) miss.push("StephenPixel.png");
    if (!haveThrower) miss.push("stonethrower.png");
    if (!haveStone)   miss.push("Stone.png");
    statusEl.textContent = miss.length
      ? `— missing: ${miss.join(", ")} (still playable)`
      : "— press Space to begin";

    reset(true);
    loop(performance.now());
  });

  // =========================
  // Input (desktop)
  // =========================
  addEventListener("keydown", (e) => {
    if (e.repeat) return;

    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (!running && !dead) start();
      else if (!dead) jump();
      else reset();
    }

    if (e.code === "KeyR") reset();
  });

  function start(){
    running = true;
    statusEl.textContent = "— run";
  }

  function jump(){
    if (!running || dead) return;
    if (!player.grounded) return;
    player.vy = -JUMP_V;
    player.grounded = false;
  }

  // =========================
  // Reset
  // =========================
  function reset(first=false){
    running = false;
    dead = false;
    score = 0;
    WORLD_SPEED = 480;

    player.vy = 0;
    player.grounded = true;
    player.animT = 0;
    player.animF = 0;

    // Hard anchor to ground
    player.y = (GROUND_Y - player.h);

    throwers.length = 0;
    stones.length = 0;
    nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);

    scoreEl.textContent = "0";
    if (!first) statusEl.textContent = "— press Space to begin";
  }

  // =========================
  // Spawning
  // =========================
  function spawnThrower(){
    // Keep throwers grounded and visible
    const h = 60;
    const w = 52;
    const y = GROUND_Y - h;

    throwers.push({
      x: W + 60,
      y,
      w,
      h,
      frame: 0,
      animT: 0,
      hasThrown: false
    });
  }

  function spawnStoneFromThrower(t){
    // Stone height: must be jumpable, not too high
    // Keep it roughly chest-level of thrower, but low enough to clear with jump.
    const size = STONE_SIZE;
    const stoneY = t.y + STONE_THROW_Y;

    stones.push({
      x: t.x + 8,
      y: stoneY,
      size,
      // total left speed = WORLD_SPEED + STONE_SPEED (computed in update)
      wobbleP: Math.random() * Math.PI * 2
    });
  }

  // =========================
  // Update
  // =========================
  function update(dt){
    if (!running || dead) return;

    // Ramp world speed (capped to keep it fair)
    WORLD_SPEED = Math.min(WORLD_SPEED_CAP, WORLD_SPEED + WORLD_RAMP * dt);

    // Score
    score += Math.floor(120 * dt);
    scoreEl.textContent = String(score);

    // Player physics
    player.vy += GRAVITY * dt;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;
    player.y += player.vy * dt;

    const groundY = GROUND_Y - player.h;
    if (player.y >= groundY){
      player.y = groundY;
      player.vy = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    // Player anim (only when running)
    player.animT += dt;
    const step = 1 / StephenSprite.fps;
    if (player.animT >= step){
      player.animT -= step;
      player.animF = (player.animF + 1) % Math.max(1, StephenSprite.frames);
    }

    // Spawn throwers
    nextThrowerIn -= dt;
    if (nextThrowerIn <= 0){
      spawnThrower();
      nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);
    }

    // Update throwers
    for (const t of throwers){
      t.x -= WORLD_SPEED * dt;

      t.animT += dt;
      const tStep = 1 / ThrowerSprite.fps;
      if (t.animT >= tStep){
        t.animT -= tStep;
        t.frame = (t.frame + 1) % ThrowerSprite.frames;

        // Throw at the release frame (frame 2)
        if (t.frame === ThrowerSprite.throwFrame && !t.hasThrown){
          spawnStoneFromThrower(t);
          t.hasThrown = true;
          // micro-pause sells impact (optional but helps)
          t.animT = -0.04;
        }
      }
    }
    // Cleanup throwers
    while (throwers.length && throwers[0].x < -220) throwers.shift();

    // Update stones (fly straight; jumpable height; no gravity)
    for (const s of stones){
      // Total left movement includes world scroll + stone speed
      s.x -= (WORLD_SPEED + STONE_SPEED) * dt;

      // subtle wobble so they feel alive (doesn't change difficulty)
      s.wobbleP += dt * 10;
      s.y += Math.sin(s.wobbleP) * 0.12;
    }
    while (stones.length && stones[0].x < -220) stones.shift();

    // Collision (instant martyr)
    const px = player.x, py = player.y, pw = player.w, ph = player.h;

    for (const s of stones){
      const pad = STONE_HITBOX_PAD;
      const sx = s.x + pad;
      const sy = s.y + pad;
      const ss = s.size - pad*2;

      if (rectHit(px, py, pw, ph, sx, sy, ss, ss)){
        die();
        break;
      }
    }
  }

  function die(){
    dead = true;
    running = false;

    if (score > best){
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = String(best);
    }

    statusEl.textContent = "— YOU HAVE BEEN MARTYRED (R to restart)";
  }

  // =========================
  // Draw
  // =========================
  function draw(){
    // Background (desert dusk)
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, "#3a2f3f");
    g.addColorStop(0.55, "#6f4a3e");
    g.addColorStop(1, "#a77744");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // Haze
    ctx.fillStyle = "rgba(10,10,12,0.22)";
    ctx.fillRect(0,0,W,H);

    // Ground
    ctx.fillStyle = "rgba(20,14,10,0.20)";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // Ground line
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    // Dunes (simple parallax)
    drawDunes();

    // Entities
    drawThrowers();
    drawStones();
    drawPlayer();

    // Start overlay
    if (!running && !dead){
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "800 44px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Press Space to begin", W/2, H/2);
      ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.fillText("Run. Jump the stones. Endure.", W/2, H/2 + 34);
    }

    // Death overlay
    if (dead){
      ctx.fillStyle = "rgba(0,0,0,0.46)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "900 48px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillText("YOU HAVE BEEN MARTYRED", W/2, H/2);
      ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText("Press R to restart", W/2, H/2 + 34);
    }
  }

  function drawDunes(){
    const t = performance.now() / 1000;

    // Far dunes
    ctx.fillStyle = "rgba(255,220,160,0.08)";
    const shift1 = (t * 18) % W;
    for (let i=0;i<9;i++){
      const x = i*150 - shift1;
      ctx.beginPath();
      ctx.ellipse(x+80, GROUND_Y-160, 140, 60, 0, 0, Math.PI*2);
      ctx.fill();
    }

    // Near dunes
    ctx.fillStyle = "rgba(0,0,0,0.09)";
    const shift2 = (t * 44) % W;
    for (let i=0;i<11;i++){
      const x = i*135 - shift2;
      ctx.beginPath();
      ctx.ellipse(x+70, GROUND_Y-72, 120, 48, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawPlayer(){
    const x = player.x;
    const y = Math.floor(player.y);

    if (haveStephen){
      const fw = StephenSprite.frameW, fh = StephenSprite.frameH;
      const sx = (player.animF % StephenSprite.frames) * fw;
      const sy = StephenSprite.row * fh;

      ctx.drawImage(
        stephenImg,
        sx, sy, fw, fh,
        x, y - 6,
        player.w, player.h
      );
    } else {
      // Fallback
      ctx.fillStyle = "#eaeaea";
      ctx.fillRect(x, y, player.w, player.h);
    }
  }

  function drawThrowers(){
    for (const t of throwers){
      if (haveThrower){
        const fw = ThrowerSprite.frameW, fh = ThrowerSprite.frameH;
        const sx = t.frame * fw;
        const sy = 0; // one row only

        ctx.drawImage(
          throwerImg,
          sx, sy, fw, fh,
          Math.floor(t.x), Math.floor(t.y) - 4,
          t.w, t.h
        );
      } else {
        ctx.fillStyle = "rgba(220,220,220,0.6)";
        ctx.fillRect(t.x, t.y, t.w, t.h);
      }
    }
  }

  function drawStones(){
    for (const s of stones){
      const x = Math.floor(s.x), y = Math.floor(s.y), size = s.size;

      if (haveStone){
        ctx.drawImage(stoneImg, x, y, size, size);
      } else {
        // Fallback rock
        ctx.fillStyle = "rgba(170,170,170,0.9)";
        ctx.beginPath();
        ctx.moveTo(x + size*0.15, y + size*0.55);
        ctx.lineTo(x + size*0.35, y + size*0.20);
        ctx.lineTo(x + size*0.70, y + size*0.18);
        ctx.lineTo(x + size*0.88, y + size*0.50);
        ctx.lineTo(x + size*0.62, y + size*0.85);
        ctx.lineTo(x + size*0.25, y + size*0.78);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.beginPath();
        ctx.ellipse(x + size*0.60, y + size*0.50, size*0.18, size*0.14, 0, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }

  // =========================
  // Loop
  // =========================
  let last = 0;
  function loop(t){
    requestAnimationFrame(loop);
    const now = t / 1000;
    const dt = Math.min(0.033, now - last || 0);
    last = now;

    update(dt);
    draw();
  }

  // =========================
  // Helpers
  // =========================
  function rand(a,b){ return a + Math.random() * (b-a); }
  function rectHit(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
})();
</script>
</body>
</html>
