// script.js — Simulated Tesla-like HUD (NO camera).
// Draws a 2.5D road, car in center, and moving side objects with labels & heat bubbles.

const canvas = document.getElementById('hudCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startSim');
const pauseBtn = document.getElementById('pauseSim');
const speedRange = document.getElementById('speedRange');
const speedLabel = document.getElementById('speed');
const batteryLabel = document.getElementById('battery');
const bgRef = document.getElementById('bgRef');

let W=1200, H=700;
function fitCanvas(){
  const vw = Math.min(window.innerWidth - 40, 1100);
  const vh = Math.min(window.innerHeight * 0.76, 760);
  canvas.width = Math.floor(vw);
  canvas.height = Math.floor(vh);
  W = canvas.width; H = canvas.height;
}
window.addEventListener('resize', fitCanvas, false);
fitCanvas();

// simulation state
let running = false;
let simSpeed = Number(speedRange.value);
let simTime = 0;
speedRange.addEventListener('input', ()=>{ simSpeed = Number(speedRange.value); });

// objects around the car (simulate pedestrians, cars, bikes)
const spawnList = [
  // side objects: x: -1 left, 1 right, z: distance ahead (0 near, 1 far)
  {type:'person', side:1, lane:1, z:0.6, speed:-0.03, label:'مشاة جانبي'},
  {type:'car', side:-1, lane:0.4, z:0.8, speed:-0.02, label:'سيارة على اليمين'},
  {type:'bus', side:1, lane:0.2, z:0.4, speed:-0.01, label:'حافلة خلفي'},
  {type:'bicycle', side:-1, lane:0.7, z:1.2, speed:-0.035, label:'دراجة جانبية'},
];
let objects = JSON.parse(JSON.stringify(spawnList)); // clone initial

// helpers: project world coordinates to screen (simple perspective)
function project(side, lane, z){
  // side: -1 left, 1 right
  // lane: lateral offset 0..1 (closer to edges)
  // z: distance scalar (0 near, 1 far)
  // map to screen: x: center +/- width * factor, y: smaller at far z
  const centerX = W/2;
  const depth = 1 + z*3; // larger => far
  const roadWidth = W * 0.36;
  const x = centerX + side * (lane*0.8*roadWidth) / depth;
  const yBase = H*0.75;
  const y = yBase - (1/z) * (H*0.14) * (1/(1+z)) * 0.8; // approximate
  // size inversely proportional to depth and z
  const size = Math.max(0.04, 0.35 * (1/(1+z)));
  return {x, y, size};
}

// draw road & ground grid (2.5D)
function drawRoad(){
  // background gradient already set on canvas
  // draw perspective road polygon
  const cx = W/2;
  ctx.save();
  // dark road
  ctx.fillStyle = '#111419';
  ctx.beginPath();
  ctx.moveTo(cx - W*0.45, H);
  ctx.lineTo(cx - W*0.12, H*0.4);
  ctx.lineTo(cx + W*0.12, H*0.4);
  ctx.lineTo(cx + W*0.45, H);
  ctx.closePath();
  ctx.fill();

  // lane markers (curved ellipses)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  for (let r=1;r<=6;r++){
    ctx.beginPath();
    ctx.ellipse(cx, H*0.78, W*0.36*(r/6), H*0.12*(r/6), 0, Math.PI, 0, true);
    ctx.stroke();
  }
  ctx.restore();
}

// draw the car at center
function drawCar(){
  const cx = W/2, cy = H*0.75;
  const carW = W*0.12, carH = H*0.06;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + carH*0.9, carW*0.6, carH*0.5, 0, 0, Math.PI*2);
  ctx.fill();
  // body
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cx - carW/2, cy - carH/2, carW, carH, carH*0.25, true, false);
  // windows
  ctx.fillStyle = 'rgba(8,20,30,0.9)';
  ctx.fillRect(cx - carW*0.25, cy - carH*0.18, carW*0.5, carH*0.36);
}

// helper for rounded rect
function roundRect(ctx, x, y, w, h, r, fill, stroke){
  if (r===undefined) r=5;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// draw objects as soft bubbles with labels
function drawObjects(){
  objects.forEach((o)=>{
    // compute projected pos
    const p = project(o.side, o.lane, Math.max(0.15, o.z));
    // bubble radius in px
    const rad = Math.max(12, p.size * Math.min(W,H) * 0.35);
    // color by type
    let color = 'rgba(255,200,80,0.95)'; // person
    if (o.type==='car') color = 'rgba(80,240,120,0.96)';
    if (o.type==='bus' || o.type==='truck') color = 'rgba(255,110,110,0.96)';
    if (o.type==='bicycle') color = 'rgba(120,200,255,0.96)';
    // radial gradient
    const g = ctx.createRadialGradient(p.x, p.y, rad*0.05, p.x, p.y, rad);
    g.addColorStop(0, color.replace(/[\d\.]+\)$/,'1)'));
    g.addColorStop(1, color.replace(/[\d\.]+\)$/,'0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rad, 0, Math.PI*2);
    ctx.fill();
    // outline
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.arc(p.x, p.y, rad,0,Math.PI*2); ctx.stroke();

    // label box
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = `${Math.max(10, Math.round(rad*0.18))}px sans-serif`;
    const label = o.label || o.type;
    const tw = ctx.measureText(label).width;
    ctx.fillRect(p.x - tw/2 - 8, p.y - rad - 28, tw + 16, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, p.x - tw/2, p.y - rad - 12);
  });
}

// advance simulation (move objects closer/away)
function step(dt){
  simTime += dt * simSpeed;
  // update objects z positions by speed
  objects.forEach(o=>{
    // move relative to sim speed
    o.z += o.speed * dt * simSpeed;
    // loop objects when too near or too far
    if (o.z < 0.18) o.z = 1.4 + Math.random()*0.6;
    if (o.z > 2.2) o.z = 0.3 + Math.random()*0.6;
  });
}

// main loop
let last = performance.now();
function frame(now){
  const dt = (now - last) / 1000;
  last = now;
  if (running){
    step(dt);
  }
  // clear and draw
  ctx.clearRect(0,0,W,H);
  // optional: faint background ref (already in DOM as <img> with low opacity)
  drawRoad();
  drawObjects();
  drawCar();

  // update speed display (simulate)
  const displaySpeed = Math.round(30 * simSpeed + Math.sin(now/1000)*2);
  speedLabel.textContent = `${displaySpeed} km/h`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// controls
startBtn.onclick = ()=>{ running = true; };
pauseBtn.onclick = ()=>{ running = false; };
