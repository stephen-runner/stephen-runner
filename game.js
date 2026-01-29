(() => {
  // =====================================================
  // IMPORTANT: GitHub Pages PROJECT BASE PATH
  // Site: https://stephen-runner.github.io/stephen-runner/
  // =====================================================
  const BASE_PATH = "/stephen-runner/Assets/";

  const ASSET = {
    stephen: BASE_PATH + "StephenPixel.png",
    thrower: BASE_PATH + "StoneThrower.png",
    stone:   BASE_PATH + "Stone.png"
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = Math.floor(H * 0.78);

  const GRAVITY = 2200;
  const JUMP_V = 920;
  const GAME_SPEED = 520;

  let running = false;
  let score = 0;

  const player = {
    x: Math.floor(W * 0.18),
    y: GROUND_Y - 56,
    w: 56,
    h: 56,
    vy: 0,
    grounded: true
  };

  const stones = [];

  // ========= LOAD IMAGES =========
  const images = {};
  function load(name, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { images[name] = img; resolve(true); };
      img.onerror = () => { console.error("FAILED:", src); resolve(false); };
      img.src = src;
    });
  }

  Promise.all([
    load("stephen", ASSET.stephen),
    load("stone", ASSET.stone)
  ]).then(() => {
    requestAnimationFrame(loop);
  });

  // ========= INPUT =========
  addEventListener("keydown", e => {
    if (e.code === "Space") {
      if (!running) running = true;
      else if (player.grounded) {
        player.vy = -JUMP_V;
        player.grounded = false;
      }
    }
    if (e.code === "KeyR") reset();
  });

  function reset() {
    running = false;
    score = 0;
    stones.length = 0;
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.grounded = true;
  }

  // ========= UPDATE =========
  function update(dt) {
    if (!running) return;

    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;

    if (player.y >= GROUND_Y - player.h) {
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.grounded = true;
    }

    // spawn stones
    if (Math.random() < 0.02) {
      stones.push({
        x: W + 20,
        y: GROUND_Y - 40,
        size: 18,
        vx: -760
      });
    }

    for (const s of stones) {
      s.x += s.vx * dt;
    }

    while (stones.length && stones[0].x < -100) stones.shift();
  }

  // ========= DRAW =========
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ground
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // player
    if (images.stephen) {
      ctx.drawImage(images.stephen, player.x, player.y, player.w, player.h);
    }

    // stones
    for (const s of stones) {
      if (images.stone) {
        ctx.drawImage(images.stone, s.x, s.y, s.size, s.size);
      }
    }
  }

  let last = 0;
  function loop(t) {
    const now = t / 1000;
    const dt = Math.min(0.033, now - last);
    last = now;

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
})();
