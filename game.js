(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const statusEl = document.getElementById("status");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const setStatus = (t) => (statusEl.textContent = t);

  // ---------------- CANVAS RESIZE (match CSS size) ----------------
  let W = 1100, H = 520, GROUND_Y = 0, DPR = 1;

  function resizeCanvas() {
    const r = canvas.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(r.width * DPR));
    canvas.height = Math.max(1, Math.round(r.height * DPR));

    // draw in CSS pixels
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    W = r.width;
    H = r.height;
    GROUND_Y = Math.floor(H * 0.82);

    player.x = Math.floor(W * 0.18);
  }
  window.addEventListener("resize", resizeCanvas);

  // ---------------- ASSETS (UPDATE FILENAMES IF NEEDED) ----------------
  const BASE = new URL("./", location.href);
  const ASSET = {
    // make sure this points to your NEW runner sheet file name
    runner: new URL("Assets/Runner.png", BASE).href,
    thrower: new URL("Assets/stonethrower.png", BASE).href,
    stone: new URL("Assets/Stone.png", BASE).href,
  };

  function loadImage(src) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ img, ok: true });
      img.onerror = () => res({ img: null, ok: false });
      img.src = src;
    });
  }

  // ---------------- SPRITE FRAMES (FROM YOUR MEASUREMENTS) ----------------
  // Runner.png: 846 x 414
  const STEPHEN_FRAMES = [
    [0,   0, 250, 414],  // idle
    [250, 0, 315, 414],  // run
    [565, 0, 281, 414],  // jump
  ];

  // stonethrower.png: 1400 x 303, each frame 318 x 303 (4 frames)
  // If your sheet has gaps, you’ll adjust these x values slightly.
  const THROWER_FRAMES = [
    [0,   0, 318, 303],
    [318, 0, 318, 303],
    [636, 0, 318, 303],  // release
    [954, 0, 318, 303],
  ];
  const THROW_ON = 2;

  // ---------------- VISUAL SIZE (NOT HUGE) ----------------
  // These are the ONLY size knobs.
  const PLAYER_HEIGHT = 140;   // runner on-screen height
  const THROWER_HEIGHT = 150;  // thrower on-screen height
  const STONE_SIZE = 18;

  // ---------------- GAME TUNING ----------------
  let WORLD_SPEED = 460;
  const WORLD_RAMP = 7;
  const WORLD_CAP = 760;

  const GRAVITY = 2600;
  const JUMP_V = 900;
  const MAX_FALL = 1800;

  const STONE_SPEED = 520;
  const SPAWN_MIN = 1.15;
  const SPAWN_MAX = 2.0;

  // ---------------- BEST SCORE ----------------
  const BEST_KEY = "stephenRunnerBest";
  let best = +localStorage.getItem(BEST_KEY) || 0;
  bestEl.textContent = best;

  // ---------------- STATE ----------------
  let running = false, dead = false, score = 0;

  const player = {
    x: 0,
    yOff: 0,     // 0 = on ground, negative = up
    vy: 0,
    grounded: true,
    animT: 0,
    animF: 0,
    hit: { x: 0, y: 0, w: 40, h: 62 },
  };

  const throwers = [];
  const stones = [];
  let nextSpawn = 1.5;

  let runnerImg, throwerImg, stoneImg;
  let haveRunner = false, haveThrower = false, haveStone = false;

  // ---------------- INPUT ----------------
  addEventListener("keydown", (e) => {
    if (e.repeat) return;

    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      if (!running && !dead) start();
      else if (dead) reset();
      else jump();
    }
    if (e.code === "KeyR") reset();
  });

  function start() {
    running = true;
    dead = false;
    setStatus("— run");
  }

  function jump() {
    if (!player.grounded) return;
    player.vy = -JUMP_V;
    player.grounded = false;
  }

  function reset() {
    running = false;
    dead = false;
    score = 0;
    WORLD_SPEED = 460;

    player.vy = 0;
    player.yOff = 0;
    player.grounded = true;
    player.animT = 0;
    player.animF = 0;

    throwers.length = 0;
    stones.length = 0;

    nextSpawn = rand(SPAWN_MIN, SPAWN_MAX);
    scoreEl.textContent = "0";
    setStatus("— press Space to begin");
  }

  function die() {
    dead = true;
    running = false;

    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, best);
      bestEl.textContent = best;
    }
    setStatus("— YOU HAVE BEEN MARTYRED (R to restart)");
  }

  // ---------------- SPAWNS ----------------
  function spawnThrower() {
    throwers.push({ x: W + 120, frame: 0, anim: 0, thrown: false });
  }

  function spawnStone(t) {
    stones.push({
      x: t.x + 60,
      y: GROUND_Y - STONE_SIZE,
      p: Math.random() * Math.PI * 2,
    });
  }

  // ---------------- UPDATE ----------------
  function update(dt) {
    if (!running || dead) return;

    WORLD_SPEED = Math.min(WORLD_CAP, WORLD_SPEED + WORLD_RAMP * dt);

    score += Math.floor(120 * dt);
    scoreEl.textContent = String(score);

    // player physics
    player.vy += GRAVITY * dt;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;

    player.yOff += player.vy * dt;
    if (player.yOff >= 0) {
      player.yOff = 0;
      player.vy = 0;
      player.grounded = true;
    }

    // animation
    player.animT += dt;
    if (player.animT > 0.12) { // slightly slower
      player.animT = 0;
      player.animF ^= 1;
    }

    // spawn timer
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      spawnThrower();
      nextSpawn = rand(SPAWN_MIN, SPAWN_MAX);
    }

    // throwers animate + move
    for (const t of throwers) {
      t.x -= WORLD_SPEED * dt;

      t.anim += dt;
      if (t.anim > 0.12) {
        t.anim = 0;
        t.frame = (t.frame + 1) % 4;

        if (t.frame === THROW_ON && !t.thrown) {
          spawnStone(t);
          t.thrown = true;
        }
      }
    }

    // stones move + bob
    for (const s of stones) {
      s.x -= (WORLD_SPEED + STONE_SPEED) * dt;
      s.p += dt * 10;
      s.y = (GROUND_Y - STONE_SIZE) + Math.sin(s.p) * 2;

      if (
        rect(
          player.hit.x, player.hit.y, player.hit.w, player.hit.h,
          s.x, s.y, STONE_SIZE, STONE_SIZE
        )
      ) {
        die();
      }
    }

    // cleanup
    for (let i = throwers.length - 1; i >= 0; i--) {
      if (throwers[i].x < -400) throwers.splice(i, 1);
    }
    for (let i = stones.length - 1; i >= 0; i--) {
      if (stones[i].x < -200) stones.splice(i, 1);
    }
  }

  // ---------------- DRAW ----------------
  function drawHills(base, amp, speed, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) {
      const y =
        base +
        Math.sin((x + performance.now() / speed) * 0.01) * amp +
        Math.sin((x + performance.now() / speed) * 0.03) * (amp * 0.4);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2b2431");
    g.addColorStop(0.6, "#6e4b3f");
    g.addColorStop(1, "#a97945");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    drawHills(GROUND_Y - 220, 24, 30, "rgba(255,220,160,.08)");
    drawHills(GROUND_Y - 150, 32, 22, "rgba(255,220,160,.12)");
    drawHills(GROUND_Y - 80, 40, 18, "rgba(0,0,0,.10)");

    // ground
    ctx.fillStyle = "rgba(20,14,10,.22)";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    ctx.strokeStyle = "rgba(0,0,0,.3)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    // throwers
    for (const t of throwers) {
      if (!haveThrower) continue;

      const f = THROWER_FRAMES[t.frame];
      const scale = THROWER_HEIGHT / f[3];
      const dw = f[2] * scale;
      const dh = f[3] * scale;

      const x = t.x;
      const y = GROUND_Y - dh;

      ctx.drawImage(throwerImg, f[0], f[1], f[2], f[3], x, y, dw, dh);
    }

    // stones
    for (const s of stones) {
      if (haveStone) ctx.drawImage(stoneImg, s.x, s.y, STONE_SIZE, STONE_SIZE);
      else {
        ctx.fillStyle = "#cfd3d6";
        ctx.fillRect(s.x, s.y, STONE_SIZE, STONE_SIZE);
      }
    }

    // player
    if (haveRunner) {
      const idx = !player.grounded ? 2 : (player.animF ? 1 : 0);
      const f = STEPHEN_FRAMES[idx];

      const scale = PLAYER_HEIGHT / f[3];
      const dw = f[2] * scale;
      const dh = f[3] * scale;

      const px = player.x;
      const py = (GROUND_Y - dh) + player.yOff;

      ctx.drawImage(runnerImg, f[0], f[1], f[2], f[3], px, py, dw, dh);

      // hitbox
      player.hit.x = px + dw * 0.30;
      player.hit.y = py + dh * 0.18;
      player.hit.w = dw * 0.40;
      player.hit.h = dh * 0.70;
    }

    if (!running && !dead) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "900 44px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Press Space to begin", W / 2, H / 2);
    }

    if (dead) {
      ctx.fillStyle = "rgba(0,0,0,.46)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "900 48px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("YOU HAVE BEEN MARTYRED", W / 2, H / 2);
      ctx.font = "16px system-ui";
      ctx.fillText("Press R to restart", W / 2, H / 2 + 34);
    }
  }

  // ---------------- LOOP ----------------
  let last = 0;
  function loop(t) {
    const now = t / 1000;
    const dt = Math.min(0.033, now - last || 0);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ---------------- UTILS ----------------
  function rect(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  // ---------------- BOOT ----------------
  setStatus("— loading…");
  resizeCanvas();

  Promise.all([
    loadImage(ASSET.runner),
    loadImage(ASSET.thrower),
    loadImage(ASSET.stone),
  ]).then(([a, b, c]) => {
    runnerImg = a.img; haveRunner = a.ok;
    throwerImg = b.img; haveThrower = b.ok;
    stoneImg = c.img; haveStone = c.ok;

    reset();
    requestAnimationFrame(loop);
  });
})();
