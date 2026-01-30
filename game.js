(() => {
  const statusEl = document.getElementById("status");
  const scoreEl  = document.getElementById("score");
  const bestEl   = document.getElementById("best");
  const canvas   = document.getElementById("game");
  const ctx      = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // Show errors on screen (so you never go blind again)
  window.addEventListener("error", (e) => {
    if (statusEl) statusEl.textContent = `— JS ERROR: ${e.message}`;
  });

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = Math.floor(H * 0.80);

  // ===== ASSETS (your exact filenames) =====
  const BASE = new URL("./", location.href);
  const ASSET = {
    stephen: new URL("Assets/StephenPixel.png", BASE).href,
    thrower: new URL("Assets/stonethrower.png", BASE).href,
    stone:   new URL("Assets/Stone.png", BASE).href
  };

  function loadImage(src){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload  = () => resolve({ img, ok:true });
      img.onerror = () => resolve({ img:null, ok:false });
      img.src = src;
    });
  }

  // ===== IMPORTANT: Crop frames for YOUR images =====
  // These rectangles were derived from the images you posted.
  // Format: [sx, sy, sw, sh]
  const STEPHEN_FRAMES = [
    [225, 456, 225, 514],  // idle
    [752, 456, 306, 489],  // run
    [1392, 374, 279, 503], // jump
  ];

  const THROWER_FRAMES = [
    [304, 480, 198, 402],
    [711, 481, 188, 402],
    [1234, 480, 222, 403], // release frame (we throw on this one)
    [1730, 482, 216, 401],
  ];
  const THROW_ON_INDEX = 2;

  // ===== GAME TUNING (fair) =====
  let WORLD_SPEED = 460;
  const WORLD_RAMP = 7;
  const WORLD_CAP  = 740;

  const GRAVITY  = 2350;
  const JUMP_V   = 980;
  const MAX_FALL = 1700;

  const THROWER_SPAWN_MIN = 1.25;
  const THROWER_SPAWN_MAX = 2.10;

  // Stones are jumpable (not too high)
  const STONE_SIZE  = 18;
  const STONE_SPEED = 520;    // extra beyond scroll
  const STONE_THROW_Y = 250;  // will be computed from thrower box; this is fallback
  const STONE_HITBOX_PAD = 3;

  // ===== BEST SCORE =====
  const BEST_KEY = "stephenRunnerBest";
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  if (bestEl) bestEl.textContent = String(best);

  // ===== STATE =====
  let running = false;
  let dead = false;
  let score = 0;

  const player = {
    x: Math.floor(W * 0.18),
    y: 0,
    w: 76,
    h: 76,
    vy: 0,
    grounded: true,
    animT: 0,
    animF: 0,
  };

  const throwers = [];
  const stones = [];
  let nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);

  let stephenImg=null, throwerImg=null, stoneImg=null;
  let haveStephen=false, haveThrower=false, haveStone=false;

  if (statusEl) statusEl.textContent = "— loading assets…";

  Promise.all([
    loadImage(ASSET.stephen),
    loadImage(ASSET.thrower),
    loadImage(ASSET.stone),
  ]).then(([a,b,c]) => {
    stephenImg = a.img; haveStephen = a.ok;
    throwerImg = b.img; haveThrower = b.ok;
    stoneImg   = c.img; haveStone   = c.ok;

    const miss = [];
    if (!haveStephen) miss.push("StephenPixel.png");
    if (!haveThrower) miss.push("stonethrower.png");
    if (!haveStone)   miss.push("Stone.png");

    if (statusEl){
      statusEl.textContent = miss.length
        ? `— missing: ${miss.join(", ")} (still playable)`
        : "— press Space to begin";
    }

    reset(true);
  });

  // ===== INPUT =====
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

  canvas.addEventListener("pointerdown", () => {
    if (!running && !dead) start();
    else if (dead) reset();
    else jump();
  });

  function start(){
    running = true;
    dead = false;
    if (statusEl) statusEl.textContent = "— run";
  }

  function jump(){
    if (!running || dead) return;
    if (!player.grounded) return;
    player.vy = -JUMP_V;
    player.grounded = false;
  }

  function reset(first=false){
    running = false;
    dead = false;
    score = 0;
    WORLD_SPEED = 460;

    player.vy = 0;
    player.grounded = true;
    player.animT = 0;
    player.animF = 0;
    player.y = GROUND_Y - player.h;

    throwers.length = 0;
    stones.length = 0;
    nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);

    if (scoreEl) scoreEl.textContent = "0";
    if (statusEl) statusEl.textContent = first ? "— press Space to begin" : "— press Space to begin";
  }

  // ===== SPAWN =====
  function spawnThrower(){
    const h = 86, w = 86;
    throwers.push({
      x: W + 70,
      y: GROUND_Y - h,
      w, h,
      frame: 0,
      animT: 0,
      hasThrown: false,
    });
  }

  function spawnStoneFromThrower(t){
    // Put stone near thrower hand height; tuned to be jumpable
    const stoneY = t.y + Math.floor(t.h * 0.35);

    stones.push({
      x: t.x + Math.floor(t.w * 0.55),
      y: stoneY,
      size: STONE_SIZE,
      wobbleP: Math.random() * Math.PI * 2,
    });
  }

  function die(){
    dead = true;
    running = false;

    if (score > best){
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      if (bestEl) bestEl.textContent = String(best);
    }
    if (statusEl) statusEl.textContent = "— YOU HAVE BEEN MARTYRED (R to restart)";
  }

  // ===== UPDATE =====
  function update(dt){
    if (!running || dead) return;

    WORLD_SPEED = Math.min(WORLD_CAP, WORLD_SPEED + WORLD_RAMP * dt);

    score += Math.floor(120 * dt);
    if (scoreEl) scoreEl.textContent = String(score);

    // player physics
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

    // Stephen anim: use run frame when grounded, jump frame when airborne
    player.animT += dt;
    if (player.animT > 0.10){
      player.animT = 0;
      player.animF = (player.animF + 1) % 2; // small “bounce” between idle/run feel
    }

    // spawn throwers
    nextThrowerIn -= dt;
    if (nextThrowerIn <= 0){
      spawnThrower();
      nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);
    }

    // throwers
    for (const t of throwers){
      t.x -= WORLD_SPEED * dt;

      t.animT += dt;
      const step = 1 / 10; // 10fps
      if (t.animT >= step){
        t.animT -= step;
        t.frame = (t.frame + 1) % THROWER_FRAMES.length;

        if (t.frame === THROW_ON_INDEX && !t.hasThrown){
          spawnStoneFromThrower(t);
          t.hasThrown = true;
        }
      }
    }
    while (throwers.length && throwers[0].x < -260) throwers.shift();

    // stones
    for (const s of stones){
      s.x -= (WORLD_SPEED + STONE_SPEED) * dt;
      s.wobbleP += dt * 10;
      s.y += Math.sin(s.wobbleP) * 0.12;
    }
    while (stones.length && stones[0].x < -260) stones.shift();

    // collision
    const px = player.x, py = player.y, pw = player.w, ph = player.h;
    for (const s of stones){
      const pad = STONE_HITBOX_PAD;
      const sx = s.x + pad, sy = s.y + pad, ss = s.size - pad*2;
      if (rectHit(px, py, pw, ph, sx, sy, ss, ss)){
        die();
        break;
      }
    }
  }

  // ===== DRAW =====
  function draw(){
    // desert gradient
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, "#3b3140");
    g.addColorStop(0.55, "#6e4b3f");
    g.addColorStop(1, "#a97945");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    // haze
    ctx.fillStyle = "rgba(10,10,12,0.22)";
    ctx.fillRect(0,0,W,H);

    // dunes (parallax)
    drawDunes();

    // ground
    ctx.fillStyle = "rgba(20,14,10,0.20)";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    // ground line
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    // entities
    drawThrowers();
    drawStones();
    drawPlayer();

    // overlays
    if (!running && !dead){
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "800 44px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Press Space to begin", W/2, H/2);
      ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("Endure. Jump the stones.", W/2, H/2 + 34);
    }

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

    // far dunes
    ctx.fillStyle = "rgba(255,220,160,0.08)";
    const shift1 = (t * 18) % W;
    for (let i=0;i<8;i++){
      const x = i*160 - shift1;
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

    if (haveStephen && stephenImg){
      // choose frame: airborne = jump, grounded = idle/run alternating
      let idx;
      if (!player.grounded) idx = 2;         // jump
      else idx = player.animF ? 1 : 0;       // run/idle bounce

      const [sx, sy, sw, sh] = STEPHEN_FRAMES[idx];
      ctx.drawImage(stephenImg, sx, sy, sw, sh, x, y - 6, player.w, player.h);
    } else {
      ctx.fillStyle = "#eaeaea";
      ctx.fillRect(x, y, player.w, player.h);
    }
  }

  function drawThrowers(){
    for (const t of throwers){
      if (haveThrower && throwerImg){
        const [sx, sy, sw, sh] = THROWER_FRAMES[t.frame];
        ctx.drawImage(throwerImg, sx, sy, sw, sh, Math.floor(t.x), Math.floor(t.y) - 4, t.w, t.h);
      } else {
        ctx.fillStyle = "rgba(220,220,220,0.6)";
        ctx.fillRect(t.x, t.y, t.w, t.h);
      }
    }
  }

  function drawStones(){
    for (const s of stones){
      const x = Math.floor(s.x), y = Math.floor(s.y), size = s.size;
      if (haveStone && stoneImg){
        ctx.drawImage(stoneImg, x, y, size, size);
      } else {
        ctx.fillStyle = "rgba(170,170,170,0.9)";
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  // ===== LOOP =====
  let last = 0;
  function loop(t){
    requestAnimationFrame(loop);
    const now = t / 1000;
    const dt = Math.min(0.033, now - last || 0);
    last = now;

    update(dt);
    draw();
  }
  requestAnimationFrame(loop);

  // ===== HELPERS =====
  function rand(a,b){ return a + Math.random() * (b-a); }
  function rectHit(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
})();

