const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const uiScore = document.getElementById("score");
const uiStatus = document.getElementById("status");

const W = canvas.width;
const H = canvas.height;

// ======== Game constants ========
const groundY = 250;
const gravity = 0.58;

let score = 0;
let running = false; // start screen until first jump
let dead = false;

// Difficulty
let speed = 4.0;
let spawnEvery = 120; // frames
let spawnTimer = 0;

// ======== Stephen sprite ========
const stephenImg = new Image();
stephenImg.src = "./Assets/StephenPixel.png";

let stephenImgReady = false;
const SHEET = { frames: 3, frameW: 0, frameH: 0, scale: 0.33 };

stephenImg.onload = () => {
  stephenImgReady = true;
  SHEET.frameW = stephenImg.width / SHEET.frames;
  SHEET.frameH = stephenImg.height;
};

// Stephen physics + hitbox
const stephen = {
  x: 160,
  y: groundY - 54,
  w: 32,
  h: 46,
  vy: 0,
  onGround: true
};

// ======== Obstacles (stones) ========
let stones = [];


