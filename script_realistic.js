// script.js — Top-down HUD that uses camera in background to detect objects,
// then draws a Tesla-like top-down visualization (car center + side bubbles).

const video = document.getElementById('video');
const canvas = document.getElementById('hudCanvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const testModeCheckbox = document.getElementById('testMode');
const refImage = document.getElementById('refImage');
const speedEl = document.getElementById('speed');

let model = null;
let stream = null;
let running = false;

// canvas sizing
function fit() {
  const vw = Math.min(window.innerWidth - 40, 920);
  const vh = Math.min(window.innerHeight * 0.72, 720);
  canvas.width = Math.floor(vw);
  canvas.height = Math.floor(vh);
}
window.addEventListener('resize', fit);
fit();

// load TF model
async function loadModel() {
  model = await cocoSsd.load();
  console.log('Model ready');
}
loadModel();

// start camera (hidden)
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

// convert detection bbox -> polar/top-down mapping
function mapDetToTop(det, vw, vh) {
  const [x,y,w,h] = det.bbox;
  const cx = x + w/2;
  const cy = y + h/2;
  // normalized -1..1 x axis (left..right)
  const nx = (cx / vw) * 2 - 1;
  // size -> approximate distance (bigger -> closer)
  const area = (w*h) / (vw*vh);
  let dist = 1 - Math.min(1, Math.sqrt(area) * 2.0); // 0 = very close, 1 = far
  dist = Math.max(0.05, Math.min(1.0, dist));
  // angle limited to +/-60 degrees
  const angle = nx * 60 * (Math.PI/180); // radians
  return { angle, r: dist };
}

// draw top-down scene very similar to Tesla illustration
function drawTop(detsTop) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  // light background
  ctx.fillStyle = '#f3f6f9';
  ctx.fillRect(0,0,W,H);

  const cx = W/2;
  const cy = H*0.72;

  // stylized road side blobs (soft)
  ctx.fillStyle = 'rgba(220,220,225,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx - W*0.35, cy - 40, W*0.24, H*0.34, 0, 0, Math.PI*2);
  ctx.ellipse(cx + W*0.35, cy - 40, W*0.24, H*0.34, 0, 0, Math.PI*2);
  ctx.ellipse(cx, cy - 80, W*0.22, H*0.38, 0, 0, Math.PI*2);
  ctx.fill();

  // car silhouette
  const carW = W*0.22;
  const carH = H*0.26;
  ctx.save();
  ctx.translate(cx, cy - 40);
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  // body
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -carW/2, -carH/2, carW, carH, 18, true, false);
  // roof
  ctx.fillStyle = '#10141a';
  roundRect(ctx, -carW*0.33, -carH*0.33, carW*0.66, carH*0.66, 10, true, false);
  ctx.restore();

  // draw each detection as bubble on top-down map
  for (const d of detsTop) {
    const pol = d.top; // { angle, r }
    // convert polar to screen coordinates
    const radiusBase = Math.min(W, H) * 0.44 * pol.r; // 0..some px
    const px = cx + radiusBase * Math.sin(pol.angle);
    const py = cy - 40 - radiusBase * Math.cos(pol.angle);

    // color per class
    let color = 'rgba(255,195,70,0.94)'; // person-yellow
    if (d.class === 'car') color = 'rgba(90,230,120,0.95)';
    if (d.class === 'bus' || d.class === 'truck') color = 'rgba(255,110,110,0.95)';
    if (d.class === 'bicycle') color = 'rgba(120,200,255,0.95)';

    // radius depends on distance (closer -> bigger)
    const rad = Math.max(18, (1 - pol.r) * Math.min(W,H) * 0.28);

    // radial gradient for soft bubble
    const g = ctx.createRadialGradient(px, py, rad*0.08, px, py, rad);
    g.addColorStop(0, color.replace(/[\d\.]+\)$/,'1)'));
    g.addColorStop(1, color.replace(/[\d\.]+\)$/,'0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI*2);
    ctx.fill();

    // outline
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI*2); ctx.stroke();

    // label bubble (rounded rectangle with arrow)
    const label = (d.class === 'person') ? 'مشاة' : (d.class === 'car' ? 'سيارة جانبية' : d.class);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const tw = ctx.measureText(label).width;
    const lx = px - tw/2 - 10;
    const ly = py - rad - 28;
    roundRect(ctx, lx, ly, tw + 20, 24, 8, true, false);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, lx + 10, ly + 16);
  }
}

// helper: rounded rectangle
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

// main loop: detect & draw
async function mainLoop() {
  if (!running) return;
  if (!model) { requestAnimationFrame(mainLoop); return; }

  // source: either video (live) or ref image (in test mode)
  const useTest = testModeCheckbox.checked;
  let srcW, srcH;
  const tmp = document.createElement('canvas');
  if (useTest) {
    tmp.width = refImage.naturalWidth || 640;
    tmp.height = refImage.naturalHeight || 360;
    tmp.getContext('2d').drawImage(refImage, 0, 0, tmp.width, tmp.height);
    srcW = tmp.width; srcH = tmp.height;
  } else {
    if (!video.videoWidth) { requestAnimationFrame(mainLoop); return; }
    const scale = Math.min(1, 640 / video.videoWidth);
    tmp.width = Math.floor(video.videoWidth * scale);
    tmp.height = Math.floor(video.videoHeight * scale);
    tmp.getContext('2d').drawImage(video, 0, 0, tmp.width, tmp.height);
    srcW = tmp.width; srcH = tmp.height;
  }

  const preds = await model.detect(tmp);

  // filter relevant classes
  const useful = preds.filter(p => ['person','car','bus','truck','bicycle','motorbike'].includes(p.class) && p.score > 0.35);

  // map to top-down positions
  const topList = useful.map(p => {
    const topPos = mapDetToTop(p, srcW, srcH);
    return { class: p.class, score: p.score, top: topPos };
  });

  drawTop(topList);

  // simulate speed readout
  const fakeSpeed = Math.round(20 + 10 * Math.abs(Math.sin(Date.now()/3000)));
  speedEl.textContent = fakeSpeed + ' km/h';

  // next frame
  requestAnimationFrame(mainLoop);
}

// start/stop
btnStart.onclick = async () => {
  await startCamera();
  running = true;
  if (!model) await loadModel();
  requestAnimationFrame(mainLoop);
};
btnStop.onclick = () => {
  running = false;
  stopCamera();
};