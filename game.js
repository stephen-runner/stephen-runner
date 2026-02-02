(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const statusEl = document.getElementById("status");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const setStatus = (t) => (statusEl.textContent = t);

  // ---------- ASSETS ----------
  const BASE = new URL("./", location.href);
  const ASSET = {
    stephen: new URL("Assets/StephenPixel.png", BASE).href,
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

  // Auto-scale crop rectangles if exported PNG sizes changed
  function scaledCrop(img, frame, expectedW, expectedH) {
    const sx = img.width / expectedW;
    const sy = img.height / expectedH;
    return [
      Math.round(frame[0] * sx),
      Math.round(frame[1] * sy),
      Math.round(frame[2] * sx),
      Math.round(frame[3] * sy),
    ];
  }

  // ---------- SPRITE CROPS (your measured frames) ----------
  const STEPHEN_FRAMES = [
    [225, 456, 225, 514], // idle
    [752, 456, 306, 489], // run
    [1392, 374, 279, 503], // jump
  ];

  const THROWER_FRAMES = [
    [304, 480, 198, 402],
    [711, 481, 188, 402],
    [1234, 480, 222, 403], // release (throw here)
    [1730, 482, 216, 401],
  ];
  const THROW_ON = 2;

  const STEPHEN_EXPECTED_W = 1536;
  const STEPHEN_EXPECTED_H = 1024;
  const THROWER_EXPECTED_W = 2048;
  const THROWER_EXPECTED_H = 1024;

  // ---------- CANVAS / WORLD SIZE (FIXES CUT-OFF + FLOATING) ----------
  let W = 800,
    H = 450,
    GROUND_Y = 360,
    DPR = 1;

  function resizeCanvas() {
    const r = canvas.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;

    // Backing store matches display size * DPR
    canvas.width = Math.max(1, Math.round(r.width * DPR));
    canvas.height = Math.max(1, Math.round(r.height * DPR));

    // Draw in CSS pixels so W/H match what you see
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    W = r.width;
    H = r.height;
    GROUND_Y = Math.floor(H * 0.80);

    player.x = Math.floor(W * 0.18);
  }
  window.addEventListener("resize", resizeCanvas);

  // ---------- GAME TUNING ----------
  let WORLD_SPEED = 460;
  const WORLD_RAMP = 7;
  const WORLD_CAP = 760;

  const GRAVITY = 2400;
  const JUMP_V = 1050;
  const MAX_FALL = 1800;

  const STONE_SIZE = 18;
  const STONE_SPEED_BASE = 520;

  // Spawn cadence
  const SPAWN_MIN = 1.15;
  const SPAWN_MAX = 2.0;

  // These fix “floating” caused by empty pixels under feet in the crop
  const STEPHEN_FOOT_PAD = 12; // + pushes down
  const THROWER_FOOT_PAD = 10;

  // ---------- BEST SCORE ----------
  const BEST_KEY = "stephenRunnerBest";
  let best = +localStorage.getItem(BEST_KEY) || 0;
  bestEl.textContent = best;

  // ---------- STATE ----------
  let running = false,
    dead = false,
    score = 0;

  const player = {
    x: 0,
    baseH: 92,
    yOff: 0, // jump offset (negative up, 0 ground)
    vy: 0,
    grounded: true,
    animT: 0,
    animF: 0,
    hit: { x: 0, y: 0, w: 40, h: 62 },
  };

  const throwers = [];
  const stones = [];
  let nextSpawn = 1.5;

  let stephenImg,
    throwerImg,
    stoneImg,
    haveStephen = false,
    haveThrower = false,
    haveStone = false;

  // ---------- INPUT ----------
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

  // ---------- SPAWNS ----------
  function spawnThrower() {
    // two lanes: slightly different ground offsets so not identical
    const lane = Math.random() < 0.5 ? 0 : 1;
    throwers.push({
      x: W + 80,
      lane,
      frame: 0,
      anim: 0,
      thrown: false,
      pattern: pickPattern(), // stone pattern style
    });
  }

  function spawnStone(t) {
    // Patterns: subtle changes in speed + vertical wobble
    const speedMul =
      t.pattern === "fast"
        ? 1.25
        : t.pattern === "slow"
        ? 0.9
        : t.pattern === "burst"
        ? 1.1
        : 1.0;

    stones.push({
      x: t.x + 40,
      y: GROUND_Y - STONE_SIZE - 10, // sits on the ground
      wob: Math.random() * Math.PI * 2,
      wobAmp:
        t.pattern === "wobble" ? 6 : t.pattern === "burst" ? 3 : 2,
      speedMul,
    });

    // burst pattern throws a second stone quickly
    if (t.pattern === "burst") {
      stones.push({
        x: t.x + 58,
        y: GROUND_Y - STONE_SIZE - 10,
        wob: Math.random() * Math.PI * 2,
        wobAmp: 2,
        speedMul: 1.15,
      });
    }
  }

  function pickPattern() {
    const r = Math.random();
    if (r < 0.22) return "fast";
    if (r < 0.40) return "slow";
    if (r < 0.58) return "wobble";
    if (r < 0.74) return "burst";
    return "normal";
  }

  // ---------- UPDATE ----------
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
    if (player.animT > 0.1) {
      player.animT = 0;
      player.animF ^= 1;
    }

    // spawns
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      spawnThrower();
      nextSpawn = rand(SPAWN_MIN, SPAWN_MAX);
    }

    // throwers
    for (const t of throwers) {
      t.x -= WORLD_SPEED * dt;

      t.anim += dt;
      if (t.anim > 0.1) {
        t.anim = 0;
        t.frame = (t.frame + 1) % 4;

        if (t.frame === THROW_ON && !t.thrown) {
          spawnStone(t);
          t.thrown = true;
        }
      }
    }

    // stones
    for (const s of stones) {
      const stoneSpeed = (WORLD_SPEED + STONE_SPEED_BASE) * s.speedMul;
      s.x -= stoneSpeed * dt;
      s.wob += dt * 10;

      // keep stones grounded but with a small wobble that never “floats”
      const wobY = Math.sin(s.wob) * s.wobAmp;
      s.y = (GROUND_Y - STONE_SIZE - 10) + wobY;

      if (
        rect(
          player.hit.x,
          player.hit.y,
          player.hit.w,
          player.hit.h,
          s.x,
          s.y,
          STONE_SIZE,
          STONE_SIZE
        )
      ) {
        die();
      }
    }

    // cleanup offscreen
    for (let i = throwers.length - 1; i >= 0; i--) {
      if (throwers[i].x < -200) throwers.splice(i, 1);
    }
    for (let i = stones.length - 1; i >= 0; i--) {
      if (stones[i].x < -200) stones.splice(i, 1);
    }
  }

  // ---------- DRAW ----------
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
    // background
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2b2431");
    g.addColorStop(0.6, "#6e4b3f");
    g.addColorStop(1, "#a97945");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // hills
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
      const lanePad = t.lane ? 3 : 0;

      if (haveThrower) {
        const raw = THROWER_FRAMES[t.frame];
        const f = scaledCrop(
          throwerImg,
          raw,
          THROWER_EXPECTED_W,
          THROWER_EXPECTED_H
        );

        const scale = 100 / f[3];
        const dw = f[2] * scale;
        const dh = f[3] * scale;

        // anchor feet to ground (this fixes “floating”)
        const y = (GROUND_Y - dh) + THROWER_FOOT_PAD + lanePad;

        ctx.drawImage(
          throwerImg,
          f[0],
          f[1],
          f[2],
          f[3],
          t.x,
          y,
          dw,
          dh
        );
      } else {
        // fallback block so gameplay still works if assets 404
        ctx.fillStyle = "rgba(255,255,255,.4)";
        ctx.fillRect(t.x, GROUND_Y - 60, 30, 60);
      }
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
    const idx = !player.grounded ? 2 : player.animF ? 1 : 0;

    if (haveStephen) {
      const raw = STEPHEN_FRAMES[idx];
      const f = scaledCrop(
        stephenImg,
        raw,
        STEPHEN_EXPECTED_W,
        STEPHEN_EXPECTED_H
      );

      const scale = player.baseH / f[3];
      const dw = f[2] * scale;
      const dh = f[3] * scale;

      // anchor feet to ground + apply jump
      const px = player.x;
      const py = (GROUND_Y - dh) + STEPHEN_FOOT_PAD + player.yOff;

      ctx.drawImage(
        stephenImg,
        f[0],
        f[1],
        f[2],
        f[3],
        px,
        py,
        dw,
        dh
      );

      // hitbox tuned to center mass
      player.hit.x = px + dw * 0.34;
      player.hit.y = py + dh * 0.12;
      player.hit.w = dw * 0.38;
      player.hit.h = dh * 0.78;
    } else {
      // fallback
      const px = player.x;
      const py = (GROUND_Y - 60) + player.yOff;
      ctx.fillStyle = "rgba(255,255,255,.6)";
      ctx.fillRect(px, py, 28, 60);
      player.hit.x = px + 6;
      player.hit.y = py + 8;
      player.hit.w = 16;
      player.hit.h = 44;
    }

    // overlays
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

  // ---------- LOOP ----------
  let last = 0;
  function loop(t) {
    const now = t / 1000;
    const dt = Math.min(0.033, now - last || 0);
    last = now;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  // ---------- UTILS ----------
  function rect(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  // ---------- BOOT ----------
  setStatus("— loading…");

  // IMPORTANT: do this before any W/H math is used
  // (fixes “cut off” and “tiny sprites” on GitHub Pages)
  requestAnimationFrame(() => {
    resizeCanvas();

    Promise.all([
      loadImage(ASSET.stephen),
      loadImage(ASSET.thrower),
      loadImage(ASSET.stone),
    ]).then(([a, b, c]) => {
      stephenImg = a.img;
      haveStephen = a.ok;

      throwerImg = b.img;
      haveThrower = b.ok;

      stoneImg = c.img;
      haveStone = c.ok;

      reset();
      requestAnimationFrame(loop);
    });
  });
})();
