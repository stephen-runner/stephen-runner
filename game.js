alert("game.js loaded");

(() => {
  const statusEl = document.getElementById("status");
  const scoreEl  = document.getElementById("score");
  const bestEl   = document.getElementById("best");
  const canvas   = document.getElementById("game");
  const ctx      = canvas.getContext("2d");

  ctx.imageSmoothingEnabled = false;

  // Show runtime errors on the page (so you aren't blind)
  window.addEventListener("error", (e) => {
    statusEl.textContent = `— JS ERROR: ${e.message}`;
  });

  // If this line doesn't show, game.js is not loading at all.
  statusEl.textContent = "— game.js loaded (press Space)";

  const W = canvas.width, H = canvas.height;
  const GROUND_Y = Math.floor(H * 0.80);

  // Assets (case-sensitive)
  const BASE = new URL("./", location.href);
  const ASSET = {
    stephen: new URL("Assets/StephenPixel.png", BASE).href,
    stone:   new URL("Assets/Stone.png", BASE).href,
    thrower: new URL("Assets/stonethrower.png", BASE).href, // lowercase per your repo
  };

  function loadImage(src){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ img, ok:true, src });
      img.onerror = () => resolve({ img:null, ok:false, src });
      img.src = src;
    });
  }

  // Game tuning
  let WORLD_SPEED = 480;
  const WORLD_RAMP = 7;
  const WORLD_CAP = 760;

  const GRAVITY = 2350;
  const JUMP_V = 980;
  const MAX_FALL = 1700;

  const THROWER_SPAWN_MIN = 1.25;
  const THROWER_SPAWN_MAX = 2.10;

  const STONE_SPEED = 520;
  const STONE_SIZE = 18;
  const STONE_THROW_Y = 22;
  const STONE_HITBOX_PAD = 3;

  const StephenSprite = { frameW:64, frameH:64, frames:6, row:0, fps:12 };
  const ThrowerSprite = { frameW:64, frameH:64, frames:4, fps:10, throwFrame:2 };

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
    y: GROUND_Y - 56,
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

  // Images
  let stephenImg=null, throwerImg=null, stoneImg=null;
  let haveStephen=false, haveThrower=false, haveStone=false;

  Promise.all([
    loadImage(ASSET.stephen),
    loadImage(ASSET.thrower),
    loadImage(ASSET.stone)
  ]).then((res) => {
    const [a,b,c] = res;
    stephenImg = a.img; haveStephen = a.ok;
    throwerImg = b.img; haveThrower = b.ok;
    stoneImg   = c.img; haveStone   = c.ok;

    const miss = [];
    if (!haveStephen) miss.push("StephenPixel.png");
    if (!haveThrower) miss.push("stonethrower.png");
    if (!haveStone)   miss.push("Stone.png");

    statusEl.textContent = miss.length
      ? `— missing: ${miss.join(", ")} (still playable)`
      : "— press Space to begin";
  });

  // Input
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
    dead = false;
    statusEl.textContent = "— run";
  }

  function jump(){
    if (!running || dead) return;
    if (!player.grounded) return;
    player.vy = -JUMP_V;
    player.grounded = false;
  }

  function reset(){
    running = false;
    dead = false;
    score = 0;
    WORLD_SPEED = 480;

    player.vy = 0;
    player.grounded = true;
    player.animT = 0;
    player.animF = 0;
    player.y = GROUND_Y - player.h;

    throwers.length = 0;
    stones.length = 0;
    nextThrowerIn = rand(THROWER_SPAWN_MIN, THROWER_SPAWN_MAX);

    scoreEl.textContent = "0";
    statusEl.textContent = "— press Space to begin";
  }

  function spawnThrower(){
    const h = 60, w = 52;
    throwers.push({
      x: W + 60,
      y: GROUND_Y - h,
      w, h,
      frame: 0,
      animT: 0,
      hasThrown: false
    });
  }

  function spawnStoneFromThrower(t){
    stones.push({
      x: t.x + 8,
      y: t.y + STONE_THROW_Y,
      size: STONE_SIZE,
      wobbleP: Math.random() * Math.PI * 2
    });
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

  function update(dt){
    if (!running || dead) return;

    WORLD_SPEED = Math.min(WORLD_CAP, WORLD_SPEED + WORLD_RAMP * dt);

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

    // Anim
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

    // Throwers animate + throw
    for (const t of throwers){
      t.x -= WORLD_SPEED * dt;

      t.animT += dt;
      const tStep = 1 / ThrowerSprite.fps;
      if (t.animT >= tStep){
        t.animT -= tStep;
        t.frame = (t.frame + 1) % ThrowerSprite.frames;

        if (t.frame === ThrowerSprite.throwFrame && !t.hasThrown){
          spawnStoneFromThrower(t);
          t.hasThrown = true;
          t.animT = -0.04;
        }
      }
    }
    while (throwers.length && throwers[0].x < -220) throwers.shift();

    // Stones
    for (const s of stones){
      s.x -= (WORLD_SPEED + STONE_SPEED) * dt;
      s.wobbleP += dt * 10;
      s.y += Math.sin(s.wobbleP) * 0.12;
    }
    while (stones.length && stones[0].x < -220) stones.shift();

    // Collision
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
    // If you still see a black screen with this draw(), JS isn't running.
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, "#3a2f3f");
    g.addColorStop(0.55, "#6f4a3e");
    g.addColorStop(1, "#a77744");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    ctx.fillStyle = "rgba(10,10,12,0.22)";
    ctx.fillRect(0,0,W,H);

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
      ctx.font = "800 44px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Press Space to begin", W/2, H/2);
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

  function drawPlayer(){
    const x = player.x, y = Math.floor(player.y);
    if (haveStephen){
      const fw = StephenSprite.frameW, fh = StephenSprite.frameH;
      const sx = (player.animF % StephenSprite.frames) * fw;
      const sy = StephenSprite.row * fh;
      ctx.drawImage(stephenImg, sx, sy, fw, fh, x, y - 6, player.w, player.h);
    } else {
      ctx.fillStyle = "#eaeaea";
      ctx.fillRect(x, y, player.w, player.h);
    }
  }

  function drawThrowers(){
    for (const t of throwers){
      if (haveThrower){
        const fw = ThrowerSprite.frameW, fh = ThrowerSprite.frameH;
        const sx = t.frame * fw;
        ctx.drawImage(throwerImg, sx, 0, fw, fh, Math.floor(t.x), Math.floor(t.y) - 4, t.w, t.h);
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
        ctx.fillStyle = "rgba(170,170,170,0.9)";
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  // Loop
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

  function rand(a,b){ return a + Math.random() * (b-a); }
  function rectHit(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
})();
