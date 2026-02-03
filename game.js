(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const statusEl = document.getElementById("status");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const setStatus = (t) => (statusEl.textContent = t);

  /* ================== CANVAS ================== */
  let W = 1100, H = 520, GROUND_Y = 0;

  function resizeCanvas() {
    const r = canvas.getBoundingClientRect();
    canvas.width = r.width;
    canvas.height = r.height;
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

  const loadImage = (src) =>
    new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ img, ok: true });
      img.onerror = () => res({ img: null, ok: false });
      img.src = src;
    });

  /* ================== FRAMES ================== */
  const RUNNER_FRAMES = [
    [0, 0, 250, 414],
    [250, 0, 315, 414],
    [565, 0, 281, 414],
  ];

  const THROW_W = 318, THROW_H = 303;
  const THROW_ON = 2;
  let THROWER_FRAMES = null;

  function computeThrowerFrames(img) {
    const inset = 2;
    const pad = Math.floor((img.width - THROW_W * 4) / 2);
    return Array.from({ length: 4 }, (_, i) => [
      pad + i * THROW_W + inset,
      0,
      THROW_W - inset * 2,
      THROW_H,
    ]);
  }

  /* ================== TUNING ================== */
  const PLAYER_HEIGHT = 140;
  const THROWER_HEIGHT = 150;

  const STONE_BASE_SIZE = 28;
  const STONE_GROW_START = 3000;
  const STONE_GROW_SPAN = 8000;
  const STONE_MAX_MULT = 7;

  const STONE_SPEED_BASE = 820;
  const STONE_SPEED_BOOST = 520;
  const STONE_SPEED_START = 7000;
  const STONE_SPEED_SPAN = 8000;

  const STONE_DROP = 65;
  const STONE_TOSS_CHANCE = 0.1;
  const STONE_TOSS_UP = 520;
  const STONE_TOSS_GRAV = 1600;

  let WORLD_SPEED = 620;
  const WORLD_RAMP = 18;
  const WORLD_CAP = 980;

  const BG_SCROLL_BASE = 0.5;
  const BG_SCROLL_BONUS = 0.35;

  const SPAWN_POOL = [0.8, 1.0, 1.4, 2.0, 2.6, 3.0];
  const SPAWN_JITTER = 0.25;

  /* ================== STATE ================== */
  let running = false, dead = false, score = 0;
  let nextSpawn = 1;
  let bgScroll = 0;

  const player = {
    x: 0, yOff: 0, vy: 0,
    grounded: true, animT: 0, animF: 0,
    hit: { x: 0, y: 0, w: 40, h: 62 },
  };

  const throwers = [];
  const stones = [];

  let runnerImg, throwerImg, stoneImg, bgImg;
  let haveRunner, haveThrower, haveStone, haveBg;

  /* ================== INPUT ================== */
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "ArrowUp") {
      if (!running && !dead) start();
      else if (dead) reset();
      else jump();
    }
    if (e.code === "KeyR") reset();
  });

  function start() { running = true; dead = false; setStatus("— run"); }
  function jump() {
    if (!player.grounded) return;
    player.vy = -900;
    player.grounded = false;
  }

  function reset() {
    running = false; dead = false; score = 0;
    WORLD_SPEED = 620;
    player.vy = player.yOff = 0;
    player.grounded = true;
    throwers.length = stones.length = 0;
    nextSpawn = pickSpawn();
    setStatus("— press Space to begin");
  }

  function die() {
    dead = true; running = false;
    const best = Math.max(+localStorage.best || 0, score);
    localStorage.best = best;
    bestEl.textContent = best;
    setStatus("— YOU HAVE BEEN MARTYRED");
  }

  function pickSpawn() {
    const b = SPAWN_POOL[Math.random() * SPAWN_POOL.length | 0];
    return Math.max(0.6, b + (Math.random() * 2 - 1) * SPAWN_JITTER);
  }

  /* ================== SPAWN ================== */
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
    const toss = Math.random() < STONE_TOSS_CHANCE;
    stones.push({
      x: t.x + 110,
      y: GROUND_Y - THROWER_HEIGHT * 0.6,
      toss,
      vy: toss ? -STONE_TOSS_UP : 0,
    });
  }

  /* ================== UPDATE ================== */
  function update(dt) {
    if (!running || dead) return;

    score += Math.floor(140 * dt);
    scoreEl.textContent = score;

    WORLD_SPEED = Math.min(WORLD_CAP, WORLD_SPEED + WORLD_RAMP * dt);

    const score01 = clamp01(score / 3000);
    bgScroll += WORLD_SPEED * (BG_SCROLL_BASE + BG_SCROLL_BONUS * score01) * dt;

    player.vy += 2600 * dt;
    player.yOff += player.vy * dt;
    if (player.yOff >= 0) {
      player.yOff = 0;
      player.vy = 0;
      player.grounded = true;
    }

    player.animT += dt;
    if (player.animT > 0.12) { player.animT = 0; player.animF ^= 1; }

    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      spawnThrower();
      nextSpawn = pickSpawn();
    }

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
      if (t.sliding) t.x -= WORLD_SPEED * 1.25 * dt;
      if (t.x < -200) t.alpha = clamp01((t.x + 260) / 60);
    }

    const growT = invLerp(STONE_GROW_START, STONE_GROW_START + STONE_GROW_SPAN, score);
    const stoneSize = STONE_BASE_SIZE * (1 + (STONE_MAX_MULT - 1) * growT);

    const speedT = invLerp(STONE_SPEED_START, STONE_SPEED_START + STONE_SPEED_SPAN, score);
    const stoneSpeed = STONE_SPEED_BASE + STONE_SPEED_BOOST * speedT;

    for (const s of stones) {
      s.x -= (WORLD_SPEED + stoneSpeed) * dt;
      if (s.toss) {
        s.vy += STONE_TOSS_GRAV * dt;
        s.y += s.vy * dt;
      } else {
        s.y += STONE_DROP * dt;
      }
      if (rect(player.hit, s.x, s.y, stoneSize, stoneSize)) die();
    }

    throwers.filter(t => t.x > -300);
    stones.filter(s => s.x > -300);
  }

  /* ================== DRAW ================== */
  function draw() {
    if (haveBg) {
      const s = H / bgImg.height;
      const w = bgImg.width * s;
      const off = ((bgScroll % w) + w) % w;
      ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height, -off, 0, w, H);
      ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height, -off + w, 0, w, H);
    }

    ctx.strokeStyle = "#0006";
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    for (const t of throwers) {
      const f = THROWER_FRAMES[t.frame];
      const sc = THROWER_HEIGHT / f[3];
      ctx.save();
      ctx.globalAlpha = t.alpha;
      ctx.drawImage(throwerImg, f[0], f[1], f[2], f[3],
        t.x, GROUND_Y - f[3] * sc, f[2] * sc, f[3] * sc);
      ctx.restore();
    }

    const growT = invLerp(STONE_GROW_START, STONE_GROW_START + STONE_GROW_SPAN, score);
    const stoneSize = STONE_BASE_SIZE * (1 + (STONE_MAX_MULT - 1) * growT);

    for (const s of stones) {
      ctx.drawImage(stoneImg, s.x, s.y, stoneSize, stoneSize);
    }

    const idx = !player.grounded ? 2 : player.animF ? 1 : 0;
    const f = RUNNER_FRAMES[idx];
    const sc = PLAYER_HEIGHT / f[3];
    const py = GROUND_Y - f[3] * sc + player.yOff;
    ctx.drawImage(runnerImg, f[0], f[1], f[2], f[3],
      player.x, py, f[2] * sc, f[3] * sc);

    player.hit = {
      x: player.x + f[2] * sc * 0.3,
      y: py + f[3] * sc * 0.2,
      w: f[2] * sc * 0.4,
      h: f[3] * sc * 0.65,
    };

    ctx.fillStyle = "#fff";
    ctx.font = "700 18px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(`Score: ${score}`, W - 18, 18);
  }

  /* ================== HELPERS ================== */
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const invLerp = (a, b, v) => clamp01((v - a) / (b - a));
  const rect = (r, x, y, w, h) =>
    r.x < x + w && r.x + r.w > x && r.y < y + h && r.y + r.h > y;

  /* ================== BOOT ================== */
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
    THROWER_FRAMES = computeThrowerFrames(throwerImg);
    reset();
    requestAnimationFrame(loop);
  });

  let last = 0;
  function loop(t) {
    const dt = Math.min(0.033, (t / 1000) - last || 0);
    last = t / 1000;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
})();
