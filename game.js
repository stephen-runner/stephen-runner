(() => {

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const W = canvas.width;
const H = canvas.height;
const GROUND_Y = Math.floor(H * 0.80);

const statusEl = document.getElementById("status");
const scoreEl  = document.getElementById("score");
const bestEl   = document.getElementById("best");

function setStatus(t){ statusEl.textContent = t; }

const BASE = new URL("./", location.href);
const ASSET = {
  stephen: new URL("Assets/StephenPixel.png", BASE).href,
  thrower: new URL("Assets/stonethrower.png", BASE).href,
  stone:   new URL("Assets/Stone.png", BASE).href
};

function loadImage(src){
  return new Promise(res=>{
    const img=new Image();
    img.onload=()=>res({img,ok:true});
    img.onerror=()=>res({img:null,ok:false});
    img.src=src;
  });
}

/* SPRITE CROPS — matched to your images */
const STEPHEN_FRAMES=[
  [225,456,225,514],
  [752,456,306,489],
  [1392,374,279,503]
];

const THROWER_FRAMES=[
  [304,480,198,402],
  [711,481,188,402],
  [1234,480,222,403],
  [1730,482,216,401]
];
const THROW_ON=2;

/* GAME TUNING */
let WORLD_SPEED=460;
const WORLD_RAMP=7;
const WORLD_CAP=760;

const GRAVITY=2400;
const JUMP_V=1050;
const MAX_FALL=1800;

const STONE_SIZE=18;
const STONE_SPEED=520;

const SPAWN_MIN=1.25;
const SPAWN_MAX=2.1;

/* BEST SCORE */
const BEST_KEY="stephenRunnerBest";
let best=+localStorage.getItem(BEST_KEY)||0;
bestEl.textContent=best;

/* STATE */
let running=false, dead=false, score=0;

const player={
  x:Math.floor(W*0.18),
  baseH:92,
  vy:0,
  jump:0,
  grounded:true,
  animT:0,
  animF:0,
  hit:{x:0,y:0,w:40,h:62}
};

const throwers=[];
const stones=[];
let nextSpawn=Math.random()*(SPAWN_MAX-SPAWN_MIN)+SPAWN_MIN;

let stephenImg,throwerImg,stoneImg;
let haveStephen=false,haveThrower=false,haveStone=false;

setStatus("— loading…");

Promise.all([
  loadImage(ASSET.stephen),
  loadImage(ASSET.thrower),
  loadImage(ASSET.stone)
]).then(([a,b,c])=>{
  stephenImg=a.img; haveStephen=a.ok;
  throwerImg=b.img; haveThrower=b.ok;
  stoneImg=c.img; haveStone=c.ok;
  reset();
});

addEventListener("keydown",e=>{
  if(e.repeat) return;
  if(e.code==="Space"||e.code==="ArrowUp"){
    e.preventDefault();
    if(!running&&!dead) start();
    else if(dead) reset();
    else jump();
  }
  if(e.code==="KeyR") reset();
});

function start(){ running=true; dead=false; setStatus("— run"); }
function jump(){
  if(!player.grounded) return;
  player.vy=-JUMP_V;
  player.grounded=false;
}

function reset(){
  running=false; dead=false; score=0;
  WORLD_SPEED=460;
  player.vy=0; player.jump=0; player.grounded=true;
  throwers.length=0; stones.length=0;
  nextSpawn=Math.random()*(SPAWN_MAX-SPAWN_MIN)+SPAWN_MIN;
  scoreEl.textContent=0;
  setStatus("— press Space to begin");
}

function die(){
  dead=true; running=false;
  if(score>best){
    best=score;
    localStorage.setItem(BEST_KEY,best);
    bestEl.textContent=best;
  }
  setStatus("— YOU HAVE BEEN MARTYRED (R to restart)");
}

function spawnThrower(){
  throwers.push({x:W+80,frame:0,anim:0,thrown:false});
}

function spawnStone(t){
  stones.push({
    x:t.x+40,
    y:GROUND_Y-60,
    p:Math.random()*Math.PI*2
  });
}

function update(dt){
  if(!running||dead) return;

  WORLD_SPEED=Math.min(WORLD_CAP,WORLD_SPEED+WORLD_RAMP*dt);
  score+=Math.floor(120*dt);
  scoreEl.textContent=score;

  player.vy+=GRAVITY*dt;
  if(player.vy>MAX_FALL) player.vy=MAX_FALL;
  player.jump+=player.vy*dt;
  if(player.jump>=0){
    player.jump=0;
    player.vy=0;
    player.grounded=true;
  }

  player.animT+=dt;
  if(player.animT>.1){ player.animT=0; player.animF^=1; }

  nextSpawn-=dt;
  if(nextSpawn<=0){
    spawnThrower();
    nextSpawn=Math.random()*(SPAWN_MAX-SPAWN_MIN)+SPAWN_MIN;
  }

  for(const t of throwers){
    t.x-=WORLD_SPEED*dt;
    t.anim+=dt;
    if(t.anim>.1){
      t.anim=0;
      t.frame=(t.frame+1)%4;
      if(t.frame===THROW_ON&&!t.thrown){
        spawnStone(t);
        t.thrown=true;
      }
    }
  }

  for(const s of stones){
    s.x-=(WORLD_SPEED+STONE_SPEED)*dt;
    s.p+=dt*10;
    s.y+=Math.sin(s.p)*.12;

    if(rect(player.hit.x,player.hit.y,player.hit.w,player.hit.h,
            s.x,s.y,STONE_SIZE,STONE_SIZE)){
      die();
    }
  }
}

function drawHills(base,amp,speed,col){
  ctx.fillStyle=col;
  ctx.beginPath();
  ctx.moveTo(0,H);
  for(let x=0;x<=W;x+=40){
    const y=base+
      Math.sin((x+performance.now()/speed)*.01)*amp+
      Math.sin((x+performance.now()/speed)*.03)*(amp*.4);
    ctx.lineTo(x,y);
  }
  ctx.lineTo(W,H);
  ctx.fill();
}

function draw(){
  const g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#2b2431");
  g.addColorStop(.6,"#6e4b3f");
  g.addColorStop(1,"#a97945");
  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,H);

  drawHills(GROUND_Y-220,24,30,"rgba(255,220,160,.08)");
  drawHills(GROUND_Y-150,32,22,"rgba(255,220,160,.12)");
  drawHills(GROUND_Y-80,40,18,"rgba(0,0,0,.10)");

  ctx.fillStyle="rgba(20,14,10,.22)";
  ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);
  ctx.strokeStyle="rgba(0,0,0,.3)";
  ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(0,GROUND_Y);
  ctx.lineTo(W,GROUND_Y);
  ctx.stroke();

  for(const t of throwers){
    const f=THROWER_FRAMES[t.frame];
    const s=100/f[3];
    const dw=f[2]*s, dh=f[3]*s;
    const y=GROUND_Y-dh;
    if(haveThrower) ctx.drawImage(throwerImg,f[0],f[1],f[2],f[3],t.x,y,dw,dh);
  }

  for(const s of stones){
    if(haveStone) ctx.drawImage(stoneImg,s.x,s.y,STONE_SIZE,STONE_SIZE);
  }

  const idx=!player.grounded?2:(player.animF?1:0);
  const f=STEPHEN_FRAMES[idx];
  const s=player.baseH/f[3];
  const dw=f[2]*s, dh=f[3]*s;
  const px=player.x, py=GROUND_Y-dh+player.jump;
  if(haveStephen) ctx.drawImage(stephenImg,f[0],f[1],f[2],f[3],px,py,dw,dh);

  player.hit.x=px+dw*.33;
  player.hit.y=py+dh*.12;
  player.hit.w=dw*.4;
  player.hit.h=dh*.78;

  if(!running&&!dead){
    ctx.fillStyle="rgba(0,0,0,.35)";
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#fff";
    ctx.font="900 44px system-ui";
    ctx.textAlign="center";
    ctx.fillText("Press Space to begin",W/2,H/2);
  }

  if(dead){
    ctx.fillStyle="rgba(0,0,0,.46)";
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#fff";
    ctx.font="900 48px system-ui";
    ctx.textAlign="center";
    ctx.fillText("YOU HAVE BEEN MARTYRED",W/2,H/2);
    ctx.font="16px system-ui";
    ctx.fillText("Press R to restart",W/2,H/2+34);
  }
}

let last=0;
function loop(t){
  const dt=Math.min(.033,(t/1000-last)||0);
  last=t/1000;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function rect(ax,ay,aw,ah,bx,by,bw,bh){
  return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by;
}

})();
