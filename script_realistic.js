// script.js — Side object detector (English labels). Hidden camera or Test Mode (reference image).
const video = document.getElementById('video');
const refImage = document.getElementById('refImage');
const canvas = document.getElementById('hudCanvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const testMode = document.getElementById('testMode');
const statusBox = document.getElementById('statusBox');

let model = null;
let stream = null;
let running = false;

// sizing
function fitCanvas() {
  const vw = Math.min(window.innerWidth - 40, 920);
  const vh = Math.min(window.innerHeight * 0.72, 720);
  canvas.width = Math.floor(vw);
  canvas.height = Math.floor(vh);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// load model
async function loadModel() {
  statusBox.textContent = 'Status: loading model...';
  model = await cocoSsd.load();
  statusBox.textContent = 'Status: model ready';
}
loadModel();

// start hidden camera
async function startCamera() {
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width:{ideal:1280}, height:{ideal:720} },
      audio: false
    });
    video.srcObject = stream;
    await new Promise(r => video.onloadedmetadata = r);
  } catch (e) {
    alert('Camera error: ' + e.message);
  }
}
function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop());
  stream = null;
}

// center of bbox
function centerOfBox(bbox) {
  const [x,y,w,h] = bbox;
  return {cx: x + w/2, cy: y + h/2};
}

// main detection loop
async function detectAndDraw() {
  if (!running) return;
  if (!model) { requestAnimationFrame(detectAndDraw); return; }

  // prepare small canvas for model
  const tmp = document.createElement('canvas');
  let srcW, srcH;
  if (testMode.checked) {
    tmp.width = refImage.naturalWidth || 640;
    tmp.height = refImage.naturalHeight || 360;
    tmp.getContext('2d').drawImage(refImage, 0, 0, tmp.width, tmp.height);
    srcW = tmp.width; srcH = tmp.height;
  } else {
    if (!video.videoWidth) { requestAnimationFrame(detectAndDraw); return; }
    const scale = Math.min(1, 640 / video.videoWidth);
    tmp.width = Math.floor(video.videoWidth * scale);
    tmp.height = Math.floor(video.videoHeight * scale);
    tmp.getContext('2d').drawImage(video, 0, 0, tmp.width, tmp.height);
    srcW = tmp.width; srcH = tmp.height;
  }

  const preds = await model.detect(tmp);
  const useful = preds.filter(p => ['person','car','bus','truck','bicycle','motorbike'].includes(p.class) && p.score > 0.35);

  // determine left/right presence
  let leftFound = false, rightFound = false;
  let leftTypes = [], rightTypes = [];
  useful.forEach(p => {
    const c = centerOfBox(p.bbox);
    const nx = c.cx / srcW;
    // treat strict left/right thresholds to match visual layout
    if (nx < 0.46) { leftFound = true; leftTypes.push(p.class); }
    else if (nx > 0.54) { rightFound = true; rightTypes.push(p.class); }
    else {
      // center: optionally treat as both sides; we'll mark both to be safe
      leftFound = true; rightFound = true;
      leftTypes.push(p.class); rightTypes.push(p.class);
    }
  });

  // draw HUD
  drawHUD(leftFound, rightFound, leftTypes, rightTypes);

  requestAnimationFrame(detectAndDraw);
}

// draw HUD (top-down look)
function drawHUD(leftFound, rightFound, leftTypes, rightTypes) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  // background
  ctx.fillStyle = '#f3f6f9';
  ctx.fillRect(0,0,W,H);

  const cx = W/2;
  const cy = H*0.72;

  // stylized road blobs
  ctx.fillStyle = 'rgba(220,220,225,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx - W*0.35, cy-40, W*0.24, H*0.34, 0, 0, Math.PI*2);
  ctx.ellipse(cx + W*0.35, cy-40, W*0.24, H*0.34, 0, 0, Math.PI*2);
  ctx.ellipse(cx, cy - 80, W*0.22, H*0.38, 0, 0, Math.PI*2);
  ctx.fill();

  // car silhouette center
  const carW = W*0.22, carH = H*0.26;
  ctx.save();
  ctx.translate(cx, cy - 40);
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -carW/2, -carH/2, carW, carH, 18, true, false);
  ctx.fillStyle = '#10141a';
  roundRect(ctx, -carW*0.33, -carH*0.33, carW*0.66, carH*0.66, 10, true, false);
  ctx.restore();

  // side bubbles
  if (leftFound) drawSideBubble('left', leftTypes);
  if (rightFound) drawSideBubble('right', rightTypes);

  // status text
  statusBox.textContent = (leftFound || rightFound) ? 'Status: object detected at side' : 'Status: no side object';
}

// draw side bubble and label
function drawSideBubble(side, types) {
  const W = canvas.width, H = canvas.height;
  const cx = W/2;
  const cy = H*0.72;
  const sideX = (side === 'left') ? cx - W*0.35 : cx + W*0.35;
  const py = cy - 40 - H*0.06;

  const first = (types && types.length) ? types[0] : '';

  // color mapping
  let color = 'rgba(255,195,70,0.95)'; // person default
  if (first === 'car') color = 'rgba(90,230,120,0.95)';
  if (first === 'bus' || first === 'truck') color = 'rgba(255,110,110,0.95)';
  if (first === 'bicycle' || first === 'motorbike') color = 'rgba(120,200,255,0.95)';

  const rad = Math.min(W, H) * 0.22;

  // soft radial bubble
  const g = ctx.createRadialGradient(sideX, py, rad*0.05, sideX, py, rad);
  g.addColorStop(0, color.replace(/[\d\.]+\)$/,'1)'));
  g.addColorStop(1, color.replace(/[\d\.]+\)$/,'0)'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sideX, py, rad, 0, Math.PI*2);
  ctx.fill();

  // outline
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(sideX, py, rad, 0, Math.PI*2); ctx.stroke();

  // english label text
  let label = 'Side Object';
  if (first === 'person') label = 'Pedestrian';
  if (first === 'car') label = 'Side Car';
  if (first === 'bus') label = 'Bus';
  if (first === 'truck') label = 'Truck';
  if (first === 'bicycle') label = 'Bicycle';
  if (first === 'motorbike') label = 'Motorbike';

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.font = '14px sans-serif';
  const tw = ctx.measureText(label).width;
  const lx = sideX - tw/2 - 10;
  const ly = py - rad - 28;
  roundRect(ctx, lx, ly, tw + 20, 26, 8, true, false);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, lx + 10, ly + 18);
}

// rounded rect helper
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (r === undefined) r = 6;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// start/stop handlers
btnStart.onclick = async () => {
  if (!model) await loadModel();
  if (!testMode.checked) await startCamera();
  running = true;
  statusBox.textContent = 'Status: running (analyzing)...';
  detectAndDraw();
};
btnStop.onclick = () => {
  running = false;
  stopCamera();
  statusBox.textContent = 'Status: stopped';
};