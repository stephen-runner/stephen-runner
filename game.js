(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const statusEl = document.getElementById("status");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const setStatus = (t) => (statusEl.textContent = t);

  // ---------------- CANVAS RESIZE ----------------
  let W = 1100, H = 520, GROUND_Y = 0, DPR = 1;

  function resizeCanvas() {
    const r = canvas.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.round(r.width * DPR));
    canvas.height = Math.max(1, Math.round(r.height * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    W = r.width;
    H = r.height;
    GROUND_Y = Math.floor(H * 0.82);

    player.x = Math.floor(W * 0.18);
  }
  window.addEventListener("resize", resizeCanvas);

  // ---------------- ASSETS ----------------
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
      img.onload = () => res({ img, ok: true, src });
      img.onerror = () => res({ img: null, ok: false, src });
      img.src = src;
    });
  }

  // ---------------- RUNNER FRAMES ----------------
  const RUNNER_H = 414;
  const RUNNER_FRAMES = [
    [0, 0, 250, RUNNER_H],    // idle
    [250, 0, 315, RUNNER_H],  // run
    [565, 0, 281, RUNNER_H],  // jump
  ];

  // ---------------- THROWER FRAMES ----------------
  const THROWER_FRAME_W = 318;
  const THROWER_FRAME_H = 303;
  const THROWER_COUNT = 4;
  const THROW_ON = 2;

  let THROWER_FRAMES = null;
  let THROWER_LEFTPAD = 0;

  function computeThrowerFrames(img) {
    const totalFramesW = THROWER_FRAME_W * THROWER_COUNT; // 1272
    const extra = img.width - totalFramesW;              // e.g. 128
    THROWER_LEFTPAD = Math.max(0, Math.floor(extra / 2)); // e.g. 64

    // Small "inset" crop to avoid edge bleed from neighboring frames
    // (prevents slight previous-frame clipping)
    const INSET = 2;

    return [
      [THROWER_LEFTPAD + 0 * THROWER_FRAME_W + INSET, 0, THROWER_FRAME_W - INSET * 2, THROWER_FRAME_H],
      [THROWER_LEFTPAD + 1 * THROWER_FRAME_W + INSET, 0, THROWER_FRAME_W - INSET * 2, THROWER_FRAME_H],
      [THROWER_LEFTPAD + 2 * THROWER_FRAME_W + INSET, 0, THROWER_FRAME_W - INSET * 2, THROWER_FRAME_H],
      [THROWER_LEFTPAD + 3 * THROWER_FRAME_W + INSET, 0, THROWER_FRAME_W - INSET * 2, THROWER_FRAME_H],
    ];
  }

  function drawThrowerFrame(img, frame, dx, dy, dw, dh) {
    const [sx, sy, sw, sh] = frame;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // ---------------- VISUAL SIZE ----------------
  const PLAYER_HEIGHT = 140;
  const THROWER_HEIGHT = 150;
  const STONE_SIZE = 28;

  // ---------------- WORLD / SPEED ----------------
  let WORLD_SPEED = 620;
  const WORLD_RAMP = 18;
  const WORLD_CAP = 980;

  // Background faster + speeds up with score
  const BG_SCROLL_BASE = 0.50;     // was ~0.35
  const BG_SCROLL_BONUS = 0.35;    // extra multiplier added as score grows

  // ---------------- PHYSICS ----------------
  const GRAVITY = 2600;
  const JUMP_V = 900;
  const MAX_FALL = 1800;

  // Stones
  const STONE_SPEED = 820;
  const STONE_DROP_RATE = 65;

  // Rare toss 1/10
  const STONE_TOSS_CHANCE = 0.10;
  const STONE_TOSS_GRAV = 1600;
  const STONE_TOSS_UP = 520;

  // ---------------- SPAWNS (VARIED) ----------------
  // Removed 0.5
  const SPAWN_POOL = [0.8, 1.0, 1.4, 2.0, 2.6, 3.0];
  const SPAWN_JITTER = 0.25;

  // ---------------- THROWER BEHAVIOR ----------------
  // They will "idle" offscreen until they throw, then slide left and fade out.
  const THROWER_SLIDE_SPEED = 1.25; // multiplier on WORLD_SPEED after thrown

  // ---------------- BEST SCORE ----------------
  const BEST_KEY = "stephenRunnerBest";
  let best = +localStorage.getItem(BEST_KEY) || 0;
  bestEl.textContent = best;

  // ---------------- STATE ----------------
  let running = false, dead = false, score = 0;

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
  let nextSpawn = 1.0;

  // background scroll
  let bgScrollPx = 0;

  let runnerImg, throwerImg, stoneImg, bgImg;
  let haveRunner = false, haveThrower = false, haveStone = false, haveBg = false;

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

  function start() { running = true; dead = false; setStatus("— run"); }
  function jump() {
    if (!player.grounded) return;
    player.vy = -JUMP_V;
    player.grounded = false;
  }

  function reset() {
    running = false; dead = false; score = 0;
    WORLD_SPEED = 620;

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
    dead = true; running = false;
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
    return Math.max(0.55, base + jitter);
  }

  // ---------------- SPAWNS ----------------
  function spawnThrower() {
    throwers.push({
      x: W + 220,     // parked just off-screen
      frame: 0,
      anim: 0,
      thrown: false,
      alpha: 1,
      // after thrown, it starts moving left
      sliding: false,
    });
  }

  function spawnStone(t) {
    const handY = GROUND_Y - THROWER_HEIGHT * 0.60;
    const toss = Math.random() < STONE_TOSS_CHANCE;

    stones.push({
      x: t.x + 110,
      y: handY,
      toss,
      vy: toss ? -STONE_TOSS_UP : 0
    });
  }

  // ---------------- UPDATE ----------------
  function update(dt) {
    if (!running || dead) return;

    // speed ramps
    WORLD_SPEED = Math.min(WORLD_CAP, WORLD_SPEED + WORLD_RAMP * dt);

    // score
    score += Math.floor(140 * dt);
    scoreEl.textContent = String(score);

    // background: faster + increases with score
    // scoreFactor goes 0..1 over ~0..3000 score (tweak if you want)
    const scoreFactor = clamp01(score / 3000);
    const bgMult = BG_SCROLL_BASE + BG_SCROLL_BONUS * scoreFactor;
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

    // spawn timer
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      spawnThrower();
      nextSpawn = pickSpawnDelay();
    }

    // throwers animate, but DO NOT move left until after throw
    for (const t of throwers) {
      t.anim += dt;

      // animate frames while parked
      if (t.anim > 0.12) {
        t.anim = 0;
        t.frame = (t.frame + 1) % 4;

        if (t.frame === THROW_ON && !t.thrown) {
          spawnStone(t);
          t.thrown = true;
          t.sliding = true; // start sliding away after throw
        }
      }

      if (t.sliding) {
        t.x -= WORLD_SPEED * THROWER_SLIDE_SPEED * dt;
      }

      // fade out near the left edge (only relevant once sliding)
      const fadeStart = -60;
      const fadeEnd = -200;
      if (t.x < fadeStart) {
        t.alpha = clamp01((t.x - fadeEnd) / (fadeStart - fadeEnd));
      } else {
        t.alpha = 1;
      }
    }

    // stones
    for (const s of stones) {
      s.x -= (WORLD_SPEED + STONE_SPEED) * dt;

      if (s.toss) {
        s.vy += STONE_TOSS_GRAV * dt;
        s.y += s.vy * dt;
      } else {
        s.y += STONE_DROP_RATE * dt;
      }

      if (rect(player.hit.x, player.hit.y, player.hit.w, player.hit.h, s.x, s.y, STONE_SIZE, STONE_SIZE)) {
        die();
      }
    }

    // cleanup
    for (let i = throwers.length - 1; i >= 0; i--) {
      if (throwers[i].x < -260) throwers.splice(i, 1);
    }
    for (let i = stones.length - 1; i >= 0; i--) {
      if (stones[i].x < -220 || stones[i].y > H + 200) stones.splice(i, 1);
    }
  }

  // ---------------- DRAW ----------------
  function drawScrollingBackground() {
    if (!haveBg) {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const scale = H / bgImg.height;
    const dw = bgImg.width * scale;
    const dh = H;

    const off = ((bgScrollPx % dw) + dw) % dw;
    const x1 = -off;

    ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height, x1, 0, dw, dh);
    ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height, x1 + dw, 0, dw, dh);
  }

  function draw() {
    drawScrollingBackground();

    // subtle ground overlay
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

        const scale = THROWER_HEIGHT / f[3];
        const dw = f[2] * scale;
        const dh = f[3] * scale;

        const x = t.x;
        const y = GROUND_Y - dh;

        ctx.save();
        ctx.globalAlpha = t.alpha;
        drawThrowerFrame(throwerImg, f, x, y, dw, dh);
        ctx.restore();
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
    if (haveRunner) {
      const idx = !player.grounded ? 2 : player.animF ? 1 : 0;
      const f = RUNNER_FRAMES[idx];

      const scale = PLAYER_HEIGHT / f[3];
      const dw = f[2] * scale;
      const dh = f[3] * scale;

      const px = player.x;
      const py = GROUND_Y - dh + player.yOff;

      ctx.drawImage(runnerImg, f[0], f[1], f[2], f[3], px, py, dw, dh);

      player.hit.x = px + dw * 0.30;
      player.hit.y = py + dh * 0.18;
      player.hit.w = dw * 0.40;
      player.hit.h = dh * 0.70;
    }

    // HUD inside scene
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
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ---------------- BOOT ----------------
  setStatus("— loading…");
  resizeCanvas();

  Promise.all([
    loadImage(ASSET.runner),
    loadImage(ASSET.thrower),
    loadImage(ASSET.stone),
    loadImage(ASSET.bg),
  ]).then(([a, b, c, d]) => {
    runnerImg = a.img; haveRunner = a.ok;
    throwerImg = b.img; haveThrower = b.ok;
    stoneImg = c.img; haveStone = c.ok;
    bgImg = d.img; haveBg = d.ok;

    if (haveThrower) THROWER_FRAMES = computeThrowerFrames(throwerImg);

    reset();
    requestAnimationFrame(loop);
  });
})();
