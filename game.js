(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const statusEl = document.getElementById("status");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const setStatus = (t) => (statusEl.textContent = t);

  /* ================== CANVAS / RESIZE ================== */
  let W = 1100,
    H = 520,
    GROUND_Y = 0,
    DPR = 1;

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

  /* ================== ASSETS ================== */
  const BASE = new URL("./", location.href);
  const ASSET = {
    runner: new URL("Assets/StephenPixel.png", BASE).href,
    thrower: new URL("Assets/stonethrower.png", BASE).href,
    stone: new URL("Assets/Stone.png", BASE).href,
    bg: new URL("Assets/BackgroundGame.png", BASE).href,
  };

  function loadImage(src) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ img, ok: true });
      img.onerror = () => res({ img: null, ok: false });
      img.src = src;
    });
  }

  /* ================== SPRITES ================== */
  // Runner sheet: 846x414, widths 250/315/281
  const RUNNER_FRAMES = [
    [0, 0, 250, 414], // idle
    [250, 0, 315, 414], // run
    [565, 0, 281, 414], // jump
  ];

  // Thrower sheet: 4 frames of 318x303 inside a 1400x303 strip (center padded)
  const THROW_W = 318;
  const THROW_H = 303;
  const THROW_COUNT = 4;
  const THROW_ON = 2;
  let THROWER_FRAMES = null;

  function computeThrowerFrames(img) {
    const totalW = THROW_W * THROW_COUNT; // 1272
    const extra = img.width - totalW; // e.g. 128
    const leftPad = Math.max(0, Math.floor(extra / 2)); // e.g. 64

    // Inset a little to prevent edge bleed from neighboring frames
    const INSET = 3;

    return Array.from({ length: 4 }, (_, i) => [
      leftPad + i * THROW_W + INSET,
      0,
      THROW_W - INSET * 2,
      THROW_H,
    ]);
  }

  function drawThrowerFrame(img, frame, dx, dy, dw, dh) {
    const [sx, sy, sw, sh] = frame;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  /* ================== VISUAL SIZE ================== */
  const PLAYER_HEIGHT = 140;
  const THROWER_HEIGHT = 150;

  /* ================== WORLD / SPEED ================== */
  let WORLD_SPEED = 620;
  const WORLD_RAMP = 18;
  const WORLD_CAP = 980;

  // Background faster + ramps w/ score
  const BG_SCROLL_BASE = 0.55;
  const BG_SCROLL_BONUS = 0.45;

  /* ================== PHYSICS ================== */
  const GRAVITY = 2600;
  const JUMP_V = 900;
  const MAX_FALL = 1800;

  /* ================== STONES ================== */
  const STONE_BASE_SIZE = 28;

  // Size scaling: after 3000 -> grow over 8000 points -> max 7x
  const STONE_GROW_START = 3000;
  const STONE_GROW_SPAN = 8000;
  const STONE_MAX_MULT = 7.0;

  // Speed scaling: after 7000 -> speed up over 8000 points
  const STONE_SPEED_BASE = 820;
  const STONE_SPEED_BOOST = 520;
  const STONE_SPEED_START = 7000;
  const STONE_SPEED_SPAN = 8000;

  // Normal throw: straight with slow drop
  const STONE_DROP_RATE = 65;

  // Rare toss 1/10
  const STONE_TOSS_CHANCE = 0.10;
  const STONE_TOSS_UP = 520;
  const STONE_TOSS_GRAV = 1600;

  /* ================== SPAWNS ================== */
  // (no 0.5 option)
  const SPAWN_POOL = [0.8, 1.0, 1.4, 2.0, 2.6, 3.0];
  const SPAWN_JITTER = 0.25;

  /* ================== THROWER BEHAVIOR ================== */
  // Idle parked until throw, then slide away + fade out
  const THROWER_SLIDE_MULT = 1.25;

  /* ================== NEAR MISS SHAKE ================== */
  const NEAR_MISS_RADIUS = 22;
  const SHAKE_MAX = 7;
  const SHAKE_DECAY = 18;
  let shake = 0;

  function addShake(amount) {
    shake = Math.max(shake, amount);
  }

  /* ================== BEST ================== */
  const BEST_KEY = "stephenRunnerBest";
  let best = +localStorage.getItem(BEST_KEY) || 0;
  bestEl.textContent = best;

  /* ================== STATE ================== */
  let running = false;
  let dead = false;
  let score = 0;

  let bgScrollPx = 0;
  let nextSpawn = 1.0;

  const player = {
    x: 0,
    yOff: 0,
    vy: 0,
    grounded: true,
    animT: 0,
    animF: 0,
    hit: { x: 0, y: 0, w: 40, h: 62 },
  };

  const throwers = [];
  const stones = [];

  let runnerImg, throwerImg, stoneImg, bgImg;
  let haveRunner = false,
    haveThrower = false,
    haveStone = false,
    haveBg = false;

  /* ================== INPUT ================== */
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

    WORLD_SPEED = 620;
    bgScrollPx = 0;
    shake = 0;

    player.vy = 0;
    player.yOff = 0;
    player.grounded = true;
    player.animT = 0;
    player.animF = 0;

    throwers.length = 0;
    stones.length = 0;

    nextSpawn = pickSpawnDelay();
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

  function pickSpawnDelay() {
    const base = SPAWN_POOL[(Math.random() * SPAWN_POOL.length) | 0];
    const jitter = (Math.random() * 2 - 1) * SPAWN_JITTER;
    return Math.max(0.6, base + jitter);
  }

  /* ================== SPAWNS ================== */
  function spawnThrower() {
    throwers.push({
      x: W + 220,
      frame: 0,
      anim: 0,
      thrown: false,
      sliding: false,
      alpha: 1,
    });
  }

  function spawnStone(t) {
    const handY = GROUND_Y - THROWER_HEIGHT * 0.60;
    const toss = Math.random() < STONE_TOSS_CHANCE;

    stones.push({
      x: t.x + 110,
      y: handY,
      toss,
      vy: toss ? -STONE_TOSS_UP : 0,
      nearMissed: false,
    });
  }

  /* ================== UPDATE ================== */
  function update(dt) {
    if (!running || dead) return;

    // decay shake
    shake = Math.max(0, shake - SHAKE_DECAY * dt);

    // ramp speed
    WORLD_SPEED = Math.min(WORLD_CAP, WORLD_SPEED + WORLD_RAMP * dt);

    // score
    score += Math.floor(140 * dt);
    scoreEl.textContent = String(score);

    // background speed increases with score
    const bgScoreFactor = clamp01(score / 3000);
    const bgMult = BG_SCROLL_BASE + BG_SCROLL_BONUS * bgScoreFactor;
    bgScrollPx += WORLD_SPEED * bgMult * dt;

    // player physics
    player.vy += GRAVITY * dt;
    if (player.vy > MAX_FALL) player.vy = MAX_FALL;

    player.yOff += player.vy * dt;
    if (player.yOff >= 0) {
      player.yOff = 0;
      player.vy = 0;
      player.grounded = true;
    }

    // runner animation
    player.animT += dt;
    if (player.animT > 0.12) {
      player.animT = 0;
      player.animF ^= 1;
    }

    // spawns
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      spawnThrower();
      nextSpawn = pickSpawnDelay();
    }

    // throwers: animate while parked; start sliding only after throw
    for (const t of throwers) {
      t.anim += dt;
      if (t.anim > 0.12) {
        t.anim = 0;
        t.frame = (t.frame + 1) % 4;

        if (t.frame === THROW_ON && !t.thrown) {
          spawnStone(t);
          t.thrown = true;
          t.sliding = true;
        }
      }

      if (t.sliding) {
        t.x -= WORLD_SPEED * THROWER_SLIDE_MULT * dt;
      }

      // fade out left
      const fadeStart = -60;
      const fadeEnd = -200;
      if (t.x < fadeStart) {
        t.alpha = clamp01((t.x - fadeEnd) / (fadeStart - fadeEnd));
      } else {
        t.alpha = 1;
      }
    }

    // stone size grows after 3000 (up to 7x over 8000 points)
    const growT = invLerp01(STONE_GROW_START, STONE_GROW_START + STONE_GROW_SPAN, score);
    const stoneSize = STONE_BASE_SIZE * (1 + (STONE_MAX_MULT - 1) * growT);

    // stone speed ramps after 7000
    const speedT = invLerp01(STONE_SPEED_START, STONE_SPEED_START + STONE_SPEED_SPAN, score);
    const stoneSpeedNow = STONE_SPEED_BASE + STONE_SPEED_BOOST * speedT;

    // stones
    for (const s of stones) {
      s.x -= (WORLD_SPEED + stoneSpeedNow) * dt;

      if (s.toss) {
        s.vy += STONE_TOSS_GRAV * dt;
        s.y += s.vy * dt;
      } else {
        s.y += STONE_DROP_RATE * dt;
      }

      // hit check
      if (rectHit(player.hit, s.x, s.y, stoneSize, stoneSize)) {
        die();
        return;
      }

      // near-miss shake (once per stone)
      if (!s.nearMissed) {
        const cx = s.x + stoneSize * 0.5;
        const cy = s.y + stoneSize * 0.5;

        const nx = clamp(player.hit.x, player.hit.x + player.hit.w, cx);
        const ny = clamp(player.hit.y, player.hit.y + player.hit.h, cy);

        const dx = cx - nx;
        const dy = cy - ny;
        const dist = Math.hypot(dx, dy);

        if (dist > 0 && dist < NEAR_MISS_RADIUS) {
          s.nearMissed = true;
          const t = 1 - dist / NEAR_MISS_RADIUS;
          addShake(2 + t * (SHAKE_MAX - 2));
        }
      }
    }

    // cleanup
    for (let i = throwers.length - 1; i >= 0; i--) {
      if (throwers[i].x < -260) throwers.splice(i, 1);
    }
    for (let i = stones.length - 1; i >= 0; i--) {
      if (stones[i].x < -300 || stones[i].y > H + 300) stones.splice(i, 1);
    }
  }

  /* ================== DRAW ================== */
  function drawScrollingBackground() {
    if (!haveBg) {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, W, H);
      return;
    }

    // scale bg to fill height
    const scale = H / bgImg.height;
    const dw = bgImg.width * scale;
    const dh = H;

    // wrap offset
    const off = ((bgScrollPx % dw) + dw) % dw;
    const x1 = -off;

    ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height, x1, 0, dw, dh);
    ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height, x1 + dw, 0, dw, dh);
  }

  function draw() {
    ctx.save();

    // screen shake
    if (shake > 0.001) {
      const sx = (Math.random() * 2 - 1) * shake;
      const sy = (Math.random() * 2 - 1) * shake;
      ctx.translate(sx, sy);
    }

    // background
    drawScrollingBackground();

    // subtle ground overlay + line
    ctx.fillStyle = "rgba(20,14,10,.14)";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    ctx.strokeStyle = "rgba(0,0,0,.22)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    // throwers
    if (haveThrower && THROWER_FRAMES) {
      for (const t of throwers) {
        const f = THROWER_FRAMES[t.frame];
        const sc = THROWER_HEIGHT / f[3];
        const dw = f[2] * sc;
        const dh = f[3] * sc;

        ctx.save();
        ctx.globalAlpha = t.alpha;
        drawThrowerFrame(throwerImg, f, t.x, GROUND_Y - dh, dw, dh);
        ctx.restore();
      }
    }

    // stone size for draw (same as update)
    const growT = invLerp01(STONE_GROW_START, STONE_GROW_START + STONE_GROW_SPAN, score);
    const stoneSize = STONE_BASE_SIZE * (1 + (STONE_MAX_MULT - 1) * growT);

    // stones
    for (const s of stones) {
      if (haveStone) ctx.drawImage(stoneImg, s.x, s.y, stoneSize, stoneSize);
      else {
        ctx.fillStyle = "#cfd3d6";
        ctx.fillRect(s.x, s.y, stoneSize, stoneSize);
      }
    }

    // player
    if (haveRunner) {
      const idx = !player.grounded ? 2 : player.animF ? 1 : 0;
      const f = RUNNER_FRAMES[idx];

      const sc = PLAYER_HEIGHT / f[3];
      const dw = f[2] * sc;
      const dh = f[3] * sc;

      const px = player.x;
      const py = GROUND_Y - dh + player.yOff;

      ctx.drawImage(runnerImg, f[0], f[1], f[2], f[3], px, py, dw, dh);

      // hitbox
      player.hit.x = px + dw * 0.30;
      player.hit.y = py + dh * 0.18;
      player.hit.w = dw * 0.40;
      player.hit.h = dh * 0.70;
    }

    // HUD inside canvas (top-right)
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.95;
    ctx.font = "700 18px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(`Score: ${score}`, W - 18, 14);
    ctx.restore();

    // overlays
    if (!running && !dead) {
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#fff";
      ctx.font = "900 44px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Press Space to begin", W / 2, H / 2);
    }

    if (dead) {
      ctx.fillStyle = "rgba(0,0,0,.52)";
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#fff";
      ctx.font = "900 52px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("YOU HAVE BEEN MARTYRED", W / 2, H / 2 - 10);

      ctx.font = "18px system-ui";
      ctx.fillText("Press R to restart", W / 2, H / 2 + 34);
    }

    ctx.restore();
  }

  /* ================== LOOP ================== */
  let last = 0;
  function loop(t) {
    const now = t / 1000;
    const dt = Math.min(0.033, now - last || 0);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  /* ================== HELPERS ================== */
  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function invLerp01(a, b, v) {
    return clamp01((v - a) / (b - a));
  }

  function clamp(a, b, v) {
    return Math.max(a, Math.min(b, v));
  }

  function rectHit(r, x, y, w, h) {
    return r.x < x + w && r.x + r.w > x && r.y < y + h && r.y + r.h > y;
  }

  /* ================== BOOT ================== */
  setStatus("— loading…");
  resizeCanvas();

  Promise.all([
    loadImage(ASSET.runner),
    loadImage(ASSET.thrower),
    loadImage(ASSET.stone),
    loadImage(ASSET.bg),
  ]).then(([a, b, c, d]) => {
    runnerImg = a.img;
    haveRunner = a.ok;

    throwerImg = b.img;
    haveThrower = b.ok;

    stoneImg = c.img;
    haveStone = c.ok;

    bgImg = d.img;
    haveBg = d.ok;

    if (haveThrower) THROWER_FRAMES = computeThrowerFrames(throwerImg);

    reset();
    requestAnimationFrame(loop);
  });
})();
