(() => {
  const statusEl = document.getElementById("status");
  const scoreEl  = document.getElementById("score");
  const bestEl   = document.getElementById("best");
  const canvas   = document.getElementById("game");

  if (!canvas) {
    document.body.style.background = "#070709";
    document.body.style.color = "#eaeaea";
    document.body.innerHTML = "<h1 style='font-family:system-ui'>Canvas missing (index.html is wrong)</h1>";
    return;
  }

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  function setStatus(t){ if (statusEl) statusEl.textContent = t; }

  window.addEventListener("error", (e) => setStatus(`— JS ERROR: ${e.message}`));

  const W = canvas.width, H = canvas.height;
  const GROUND_Y = Math.floor(H * 0.80);

  // Assets (exact filenames)
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

  // Crops for your posted images (format: [sx,sy,sw,sh])
  const STEPHEN_FRAMES = [
    [225, 456, 225, 514],   // idle
    [752, 456, 306, 489],   // run
    [1392, 374, 279, 503],  // jump
  ];

  const THROWER_FRAMES = [
    [304, 480, 198, 402],
    [711, 481, 188, 402],
    [1234, 480, 222, 403],  // release
    [1730, 482, 216, 401],
  ];
  const THROW_ON_INDEX = 2;

  // Tuning
  let WORLD_SPEED = 460;
  const WORLD_RAMP = 7;
  const WORLD_CAP  = 740;

  const GRAVITY  = 2350;
  const JUMP_V   = 980;
  const MAX_FALL = 1700;

  const THROWER_SPAWN_MIN = 1.25;
  const THROWER_SPAWN_MAX = 2.10;

  const STONE_SIZE  = 18;
  const STONE_SPEED = 520;
  const STONE_HITBOX_PAD = 3;

  // Best score
  const BEST_KEY = "stephenRunnerBest";
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  if (bestEl) bestEl.textContent = String(best);

  // State
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

  // Always draw something even before assets load (prevents “white screen”)
  setStatus("— loading…");
  draw();

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

    setStatus(miss.length ? `— missing: ${miss.join(", ")} (still playable)` : "— press Space to begin");
    reset(true);
  });

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
    setStatus("— run");
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
    setStatus("— press Space to begin");
  }

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
    // jumpable height
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
    setStatus("— YOU HAVE BEEN MARTYRED (R to restart)");
  }

  function update(dt){
    if (!running || dead) return;

    WORLD_SPEED = Math.min(WORLD_CAP, WORLD_SPEED + WORLD_RAMP * dt);

    score += Math.floor(120 * dt);
    if (scoreEl) scoreEl.textContent = String(score);

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

    player.animT += dt;
    if (player.animT > 0.10){
      player.animT = 0;
      player.animF = (player.animF + 1) % 2;
    }

    nextThrowerIn -= dt;
    if (nextThrowerIn <= 0){
      spawnThrower();
      nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);
    }

    for (const t of throwers){
      t.x -= WORLD_SPEED * dt;

      t.animT += dt;
      const step = 1 / 10;
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

    for (const s of stones){
      s.x -= (WORLD_SPEED + STONE_SPEED) * dt;
      s.wobbleP += dt * 10;
      s.y += Math.sin(s.wobbleP) * 0.12;
    }
    while (stones.length && stones[0].x < -260) stones.shift();

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

    // dunes
    drawDunes();

    // ground
    ctx.fillStyle = "rgba(20,14,10,0.20)";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    drawThrowers();
    drawStones();
    drawPlayer();

    if (!running && !dead){
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "800 44px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Press Space to begin", W/2, H/2);
    }

    if (dead){
      ctx.fillStyle = "rgba(0,0,0,0.46)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "900 48px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("YOU HAVE BEEN MARTYRED", W/2, H/2);
      ctx.font = "16px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText("Press R to restart", W/2, H/2 + 34);
    }
  }

  function drawDunes(){
    const t = performance.now()/1000;
    ctx.fillStyle = "rgba(255,220,160,0.08)";
    const shift1 = (t * 18) % W;
    for (let i=0;i<8;i++){
      const x = i*160 - shift1;
      ctx.beginPath();
      ctx.ellipse(x+80, GROUND_Y-160, 140, 60, 0, 0, Math.PI*2);
      ctx.fill();
    }

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
      const idx = !player.grounded ? 2 : (player.animF ? 1 : 0);
      const [sx,sy,sw,sh] = STEPHEN_FRAMES[idx];
      ctx.drawImage(stephenImg, sx,sy,sw,sh, x, y-6, player.w, player.h);
    } else {
      ctx.fillStyle = "#eaeaea";
      ctx.fillRect(x,y,player.w,player.h);
    }
  }

  function drawThrowers(){
    for (const t of throwers){
      if (haveThrower && throwerImg){
        const [sx,sy,sw,sh] = THROWER_FRAMES[t.frame];
        ctx.drawImage(throwerImg, sx,sy,sw,sh, Math.floor(t.x), Math.floor(t.y)-4, t.w, t.h);
      } else {
        ctx.fillStyle = "rgba(220,220,220,0.6)";
        ctx.fillRect(t.x,t.y,t.w,t.h);
      }
    }
  }

  function drawStones(){
    for (const s of stones){
      const x = Math.floor(s.x), y = Math.floor(s.y), size = s.size;
      if (haveStone && stoneImg) ctx.drawImage(stoneImg, x, y, size, size);
      else { ctx.fillStyle="rgba(170,170,170,0.9)"; ctx.fillRect(x,y,size,size); }
    }
  }

  let last = 0;
  function loop(ts){
    requestAnimationFrame(loop);
    const now = ts/1000;
    const dt = Math.min(0.033, now - last || 0);
    last = now;
    update(dt);
    draw();
  }
  requestAnimationFrame(loop);

  function rand(a,b){ return a + Math.random()*(b-a); }
  function rectHit(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
})();
