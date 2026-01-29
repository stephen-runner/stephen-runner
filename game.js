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
      margin:0 0 10px 0;
      user-select:none;
      opacity:.95;
    }
    canvas{
      width:100%;
      height:auto;
      border-radius:18px;
      border:1px solid #2a2a33;
      background:#111;
      display:block;
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
      <div><strong>Stephen Runner</strong> <small id="status"></small></div>
      <div>Score: <strong id="score">0</strong></div>
    </div>

    <!-- INTERNAL GAME RESOLUTION (DO NOT RELY ON CSS SIZE) -->
    <canvas id="game" width="1100" height="520"></canvas>

    <div class="hint">
      Jump: <kbd>Space</kbd> / <kbd>↑</kbd> • Restart: <kbd>R</kbd> • Mobile: tap to jump • Debug: <kbd>D</kbd>
    </div>
  </div>

<script>
(() => {
  // ===========
  // ASSETS (put these exact files in /Assets/)
  // Assets/StephenPixel.png
  // Assets/StoneThrower.png  (the sheet you sent: 3 rows x 4 frames)
  // Optional: Assets/Stone.png (small rock). If missing, we draw a simple rock.
  // ===========
  const ASSET = {
    stephen: "/Assets/StephenPixel.png",
    thrower: "/Assets/StoneThrower.png",
    stone:   "/Assets/Stone.png"
  };

  // ===========
  // GAME CONSTANTS
  // ===========
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width;
  const H = canvas.height;

  // Ground line stays consistent even when screen is "bigger"
  const GROUND_Y = Math.floor(H * 0.78);

  // Speed
  let GAME_SPEED = 520;            // px/sec world scroll speed (make it feel faster)
  const SPEED_RAMP = 8;            // speed increases slowly over time

  // Physics
  const GRAVITY = 2200;            // px/sec^2
  const JUMP_V = 920;              // bigger jump
  const MAX_FALL = 1600;

  // Stones
  const STONE_SPEED = 760;         // px/sec (flying stones)
  const STONE_SIZE = 18;           // make smaller (not boulders)
  const STONE_Y_OFFSET = 34;       // relative to thrower top

  // Spawn
  const THROWER_SPAWN_MIN = 1.2;   // seconds
  const THROWER_SPAWN_MAX = 2.1;   // seconds

  // Speech
  const LINES = [
    "Jesus is Lord.",
    "My hope is in Christ.",
    "You cannot silence the truth.",
    "I will not deny Him.",
    "Lord, forgive them."
  ];

  // ===========
  // SPRITE SHEET SETTINGS (tweak if your sheet differs)
  // ===========
  const StephenSprite = {
    // If your Stephen sheet is different, adjust these:
    frameW: 64,
    frameH: 64,
    frames: 6,      // running frames in first row
    row: 0,
    fps: 12
  };

  const ThrowerSprite = {
    frameW: 64,
    frameH: 64,
    frames: 4,      // 4 frames across
    variants: 3,    // 3 rows (cloaks)
    fps: 10
  };

  // ===========
  // STATE
  // ===========
  const scoreEl = document.getElementById("score");
  const statusEl = document.getElementById("status");

  let running = false;
  let dead = false;
  let debug = false;
  let score = 0;

  const keys = new Set();

  const player = {
    x: Math.floor(W * 0.18),
    y: 0,
    w: 56,
    h: 56,
    vy: 0,
    grounded: true,
    animT: 0,
    animF: 0,
    sayT: 0,
    sayText: "",
  };

  const throwers = [];
  const stones = [];
  let nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);

  // ===========
  // LOAD IMAGES (with fallbacks)
  // ===========
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
    reset(true);
    loop(performance.now());
  });

  // ===========
  // INPUT
  // ===========
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (!running && !dead) start();
      else jump();
    }
    if (e.code === "KeyR") reset();
    if (e.code === "KeyD") debug = !debug;
  });

  addEventListener("keyup", (e) => keys.delete(e.code));

  canvas.addEventListener("pointerdown", () => {
    if (!running && !dead) start();
    else if (dead) reset();
    else jump();
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

  // ===========
  // RESET
  // ===========
  function reset(first=false){
    running = false;
    dead = false;
    score = 0;
    GAME_SPEED = 520;

    player.vy = 0;
    player.grounded = true;
    player.animT = 0;
    player.animF = 0;
    player.sayT = 0;
    player.sayText = "";

    // HARD ANCHOR to ground (prevents drifting / floating no matter canvas scaling)
    player.y = GROUND_Y - player.h;

    throwers.length = 0;
    stones.length = 0;
    nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);

    statusEl.textContent = first ? "— press Space to begin" : "— press Space to begin";
    scoreEl.textContent = "0";
  }

  // ===========
  // SPAWN THROWER
  // ===========
  function spawnThrower(){
    const h = 60; // draw size (slightly shorter than Stephen)
    const w = 52;
    const y = GROUND_Y - h;

    throwers.push({
      x: W + 50,
      y,
      w,
      h,
      variant: Math.floor(Math.random() * ThrowerSprite.variants),
      frame: 0,
      animT: 0,
      hasThrown: false
    });
  }

  function spawnStoneFromThrower(t){
    // stones fly left, stay in the air (no bouncing)
    const size = STONE_SIZE;
    const stoneY = t.y + STONE_Y_OFFSET; // adjust if needed

    stones.push({
      x: t.x + 10,
      y: stoneY,
      size,
      vx: -STONE_SPEED,
      // tiny wobble so it feels alive
      wobbleP: Math.random() * Math.PI * 2
    });
  }

  // ===========
  // UPDATE
  // ===========
  function update(dt){
    if (!running || dead) return;

    // speed ramp
    GAME_SPEED += SPEED_RAMP * dt;

    // score
    score += Math.floor(120 * dt);
    scoreEl.textContent = score;

    // PLAYER PHYSICS (anchored)
    player.vy += GRAVITY * dt;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;
    player.y += player.vy * dt;

    // HARD GROUND CLAMP (prevents floating permanently)
    const groundY = GROUND_Y - player.h;
    if (player.y >= groundY){
      player.y = groundY;
      player.vy = 0;
      player.grounded = true;
    } else {
      player.grounded = false;
    }

    // PLAYER ANIM
    player.animT += dt;
    const step = 1 / StephenSprite.fps;
    if (player.animT >= step){
      player.animT -= step;
      player.animF = (player.animF + 1) % Math.max(1, StephenSprite.frames);
    }

    // SPEECH
    player.sayT -= dt;
    if (player.sayT <= 0){
      if (Math.random() < 0.02){
        player.sayText = LINES[Math.floor(Math.random() * LINES.length)];
        player.sayT = 1.4;
      } else {
        player.sayText = "";
      }
    }

    // SPAWN THROWERS
    nextThrowerIn -= dt;
    if (nextThrowerIn <= 0){
      spawnThrower();
      nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);
    }

    // UPDATE THROWERS
    for (const t of throwers){
      t.x -= GAME_SPEED * dt;

      t.animT += dt;
      const tStep = 1 / ThrowerSprite.fps;
      if (t.animT >= tStep){
        t.animT -= tStep;
        t.frame = (t.frame + 1) % ThrowerSprite.frames;

        // Throw at frame 2 (0,1,2,3)
        if (t.frame === 2 && !t.hasThrown){
          spawnStoneFromThrower(t);
          t.hasThrown = true;
        }
      }
    }
    // cleanup throwers
    while (throwers.length && throwers[0].x < -200) throwers.shift();

    // UPDATE STONES (fly, no gravity)
    for (const s of stones){
      s.x += (s.vx - GAME_SPEED) * dt; // world scroll + stone velocity
      s.wobbleP += dt * 10;
      s.y += Math.sin(s.wobbleP) * 0.10; // almost invisible wobble
    }
    // cleanup stones
    while (stones.length && stones[0].x < -200) stones.shift();

    // COLLISION (stones only)
    const px = player.x, py = player.y, pw = player.w, ph = player.h;
    for (const s of stones){
      const sx = s.x, sy = s.y, ss = s.size;
      if (rectHit(px, py, pw, ph, sx, sy, ss, ss)){
        die();
        break;
      }
    }
  }

  function die(){
    dead = true;
    running = false;
    statusEl.textContent = "— YOU HAVE BEEN MARTYRED (tap / R to restart)";
  }

  // ===========
  // DRAW
  // ===========
  function draw(){
    // background gradient (desert)
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, "#3b3140");
    g.addColorStop(0.55, "#6e4b3f");
    g.addColorStop(1, "#a97945");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // haze
    ctx.fillStyle = "rgba(10,10,12,0.22)";
    ctx.fillRect(0,0,W,H);

    // ground
    ctx.fillStyle = "rgba(20,14,10,0.18)";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // ground line
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    // simple dunes (parallax illusion)
    drawDunes();

    // draw throwers
    drawThrowers();

    // draw stones
    drawStones();

    // draw player
    drawPlayer();

    // speech bubble
    if (player.sayText) drawSpeech(player.sayText);

    // start overlay
    if (!running && !dead){
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "700 44px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Press Space to begin", W/2, H/2);
      ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("Endure. Jump the stones. Speak the truth.", W/2, H/2 + 34);
    }

    // death overlay
    if (dead){
      ctx.fillStyle = "rgba(0,0,0,0.46)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "800 48px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillText("YOU HAVE BEEN MARTYRED", W/2, H/2);
      ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText("Tap or press R to restart", W/2, H/2 + 34);
    }

    // debug
    if (debug){
      ctx.strokeStyle = "rgba(0,255,120,0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(player.x, player.y, player.w, player.h);
      for (const s of stones){
        ctx.strokeRect(s.x, s.y, s.size, s.size);
      }
      for (const t of throwers){
        ctx.strokeStyle = "rgba(120,170,255,0.75)";
        ctx.strokeRect(t.x, t.y, t.w, t.h);
      }
    }
  }

  function drawDunes(){
    // far dunes
    ctx.fillStyle = "rgba(255,220,160,0.08)";
    const t = performance.now() / 1000;
    const shift = (t * 18) % W;
    for (let i=0;i<8;i++){
      const x = i*160 - shift;
      ctx.beginPath();
      ctx.ellipse(x+80, GROUND_Y-160, 140, 60, 0, 0, Math.PI*2);
      ctx.fill();
    }
    // near dunes
    ctx.fillStyle = "rgba(0,0,0,0.09)";
    const shift2 = (t * 46) % W;
    for (let i=0;i<10;i++){
      const x = i*140 - shift2;
      ctx.beginPath();
      ctx.ellipse(x+70, GROUND_Y-70, 120, 48, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function drawPlayer(){
    const x = player.x, y = Math.floor(player.y);

    if (haveStephen){
      const fw = StephenSprite.frameW, fh = StephenSprite.frameH;
      const sx = (player.animF % StephenSprite.frames) * fw;
      const sy = StephenSprite.row * fh;

      ctx.drawImage(
        stephenImg,
        sx, sy, fw, fh,
        x, y - 6, // tiny drop so feet sit on ground better
        player.w, player.h
      );
    } else {
      // fallback
      ctx.fillStyle = "#eaeaea";
      ctx.fillRect(x, y, player.w, player.h);
    }
  }

  function drawThrowers(){
    for (const t of throwers){
      if (haveThrower){
        const fw = ThrowerSprite.frameW, fh = ThrowerSprite.frameH;
        const sx = t.frame * fw;
        const sy = t.variant * fh;

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
        // simple rock fallback (looks like a stone, not a ball)
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

  function drawSpeech(text){
    const padX = 14, padY = 10;
    ctx.font = "600 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    const metrics = ctx.measureText(text);
    const bw = Math.ceil(metrics.width + padX*2);
    const bh = 34;

    const bx = Math.floor(player.x + player.w*0.30);
    const by = Math.floor(player.y - 44);

    // bubble
    roundRect(ctx, bx, by, bw, bh, 10, "rgba(240,235,225,0.95)", "rgba(0,0,0,0.25)");

    // tail
    ctx.fillStyle = "rgba(240,235,225,0.95)";
    ctx.beginPath();
    ctx.moveTo(bx + 24, by + bh);
    ctx.lineTo(bx + 34, by + bh);
    ctx.lineTo(bx + 26, by + bh + 10);
    ctx.closePath();
    ctx.fill();

    // text
    ctx.fillStyle = "rgba(20,20,22,0.95)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + padX, by + bh/2 + 1);
  }

  function roundRect(ctx, x, y, w, h, r, fill, stroke){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
    if (fill){ ctx.fillStyle = fill; ctx.fill(); }
    if (stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }

  // ===========
  // LOOP
  // ===========
  let last = 0;
  function loop(t){
    requestAnimationFrame(loop);
    const now = t / 1000;
    const dt = Math.min(0.033, now - last || 0);
    last = now;

    update(dt);
    draw();
  }

  // ===========
  // HELPERS
  // ===========
  function rand(a,b){ return a + Math.random() * (b-a); }

  function rectHit(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
})();
</script>
</body>
</html>
