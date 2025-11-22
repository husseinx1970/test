// script-debug.js — improved debug version for Side Object Detector
// Replace your current script.js with this file (or include it as script-debug.js and adjust index.html).

const VIDEO = document.getElementById('video');
const REF = document.getElementById('refImage');
const CANVAS = document.getElementById('hudCanvas');
const CTX = CANVAS.getContext('2d');
const BTN_START = document.getElementById('btnStart');
const BTN_STOP = document.getElementById('btnStop');
const TEST_CHECK = document.getElementById('testMode');
const STATUS = document.getElementById('statusBox');

let model = null;
let stream = null;
let running = false;
let modelLoading = false;

function fitCanvas() {
  const vw = Math.min(window.innerWidth - 40, 920);
  const vh = Math.min(window.innerHeight * 0.72, 720);
  CANVAS.width = Math.floor(vw);
  CANVAS.height = Math.floor(vh);
  CANVAS.style.display = 'block';
  console.log('Canvas size', CANVAS.width, CANVAS.height);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// helper to update on-screen status
function setStatus(text) {
  STATUS.textContent = 'Status: ' + text;
  console.log('STATUS ->', text);
}

// load model function with error handling
async function loadModel() {
  if (model || modelLoading) return;
  modelLoading = true;
  try {
    setStatus('loading model...');
    console.log('Loading coco-ssd model...');
    model = await cocoSsd.load();
    setStatus('model ready');
    console.log('Model loaded.');
  } catch (err) {
    console.error('Model load failed:', err);
    setStatus('model load failed: ' + (err.message || err));
    alert('Model failed to load. Check console for details.');
  } finally {
    modelLoading = false;
  }
}

// start camera (hidden)
async function startCamera() {
  if (stream) return;
  try {
    setStatus('requesting camera...');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width:{ideal:1280}, height:{ideal:720} },
      audio: false
    });
    VIDEO.srcObject = stream;
    await new Promise(r => VIDEO.onloadedmetadata = r);
    setStatus('camera ready');
    console.log('Camera started', VIDEO.videoWidth, VIDEO.videoHeight);
  } catch (err) {
    console.error('Camera error:', err);
    setStatus('camera error: ' + (err.message || err));
    alert('Camera error: ' + (err.message || err));
  }
}

function stopCamera() {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop());
  stream = null;
  setStatus('camera stopped');
  console.log('Camera stopped');
}

function centerOfBox(bbox) {
  const [x,y,w,h] = bbox;
  return {cx: x + w/2, cy: y + h/2};
}

// robust detection loop
async function detectAndDrawOnce() {
  if (!running) return;
  if (!model) {
    // try to load model on-demand
    await loadModel();
    if (!model) {
      setStatus('cannot run: model missing');
      return;
    }
  }

  try {
    // prepare temp canvas
    const tmp = document.createElement('canvas');
    let srcW, srcH;
    if (TEST_CHECK.checked) {
      // test mode: ensure image is loaded
      if (!REF.complete || REF.naturalWidth === 0) {
        setStatus('test image not ready');
        console.warn('Reference image not loaded or zero size.');
        requestAnimationFrame(detectAndDrawOnce);
        return;
      }
      tmp.width = REF.naturalWidth;
      tmp.height = REF.naturalHeight;
      tmp.getContext('2d').drawImage(REF, 0, 0, tmp.width, tmp.height);
      srcW = tmp.width; srcH = tmp.height;
    } else {
      if (!VIDEO.videoWidth) {
        setStatus('waiting camera frame...');
        requestAnimationFrame(detectAndDrawOnce);
        return;
      }
      const scale = Math.min(1, 640 / VIDEO.videoWidth);
      tmp.width = Math.floor(VIDEO.videoWidth * scale);
      tmp.height = Math.floor(VIDEO.videoHeight * scale);
      tmp.getContext('2d').drawImage(VIDEO, 0, 0, tmp.width, tmp.height);
      srcW = tmp.width; srcH = tmp.height;
    }

    setStatus('running detection...');
    // run model
    const preds = await model.detect(tmp);
    // debug log
    console.log('Predictions count:', preds.length, preds);

    // filter
    const useful = preds.filter(p => ['person','car','bus','truck','bicycle','motorbike'].includes(p.class) && p.score > 0.35);

    // left/right check
    let leftFound = false, rightFound = false;
    let leftTypes = [], rightTypes = [];
    useful.forEach(p => {
      const c = centerOfBox(p.bbox);
      const nx = c.cx / srcW;
      if (nx < 0.46) { leftFound = true; leftTypes.push(p.class); }
      else if (nx > 0.54) { rightFound = true; rightTypes.push(p.class); }
      else { leftFound = true; rightFound = true; leftTypes.push(p.class); rightTypes.push(p.class); }
    });

    drawHUD(leftFound, rightFound, leftTypes, rightTypes);
    setStatus((leftFound || rightFound) ? 'object detected' : 'no side object');

  } catch (err) {
    console.error('Detection error:', err);
    setStatus('detection error: ' + (err.message || err));
  } finally {
    // schedule next iteration (but not too tight)
    setTimeout(() => {
      if (running) requestAnimationFrame(detectAndDrawOnce);
    }, 80); // ~12 fps
  }
}

function drawHUD(leftFound, rightFound, leftTypes, rightTypes) {
  const W = CANVAS.width, H = CANVAS.height;
  CTX.clearRect(0,0,W,H);
  CTX.fillStyle = '#f3f6f9';
  CTX.fillRect(0,0,W,H);
  const cx = W/2, cy = H*0.72;
  // background blobs
  CTX.fillStyle = 'rgba(220,220,225,0.9)';
  CTX.beginPath();
  CTX.ellipse(cx - W*0.35, cy-40, W*0.24, H*0.34, 0, 0, Math.PI*2);
  CTX.ellipse(cx + W*0.35, cy-40, W*0.24, H*0.34, 0, 0, Math.PI*2);
  CTX.ellipse(cx, cy - 80, W*0.22, H*0.38, 0, 0, Math.PI*2);
  CTX.fill();
  // car
  const carW = W*0.22, carH = H*0.26;
  CTX.save(); CTX.translate(cx, cy - 40);
  CTX.shadowColor = 'rgba(0,0,0,0.2)'; CTX.shadowBlur = 18; CTX.shadowOffsetY = 8;
  CTX.fillStyle = '#ffffff'; roundRect(CTX, -carW/2, -carH/2, carW, carH, 18, true, false);
  CTX.fillStyle = '#10141a'; roundRect(CTX, -carW*0.33, -carH*0.33, carW*0.66, carH*0.66, 10, true, false);
  CTX.restore();
  if (leftFound) drawSideBubble('left', leftTypes);
  if (rightFound) drawSideBubble('right', rightTypes);
}

function drawSideBubble(side, types) {
  const W = CANVAS.width, H = CANVAS.height;
  const cx = W/2, cy = H*0.72;
  const sideX = (side === 'left') ? cx - W*0.35 : cx + W*0.35;
  const py = cy - 40 - H*0.06;
  const first = (types && types.length) ? types[0] : '';
  let color = 'rgba(255,195,70,0.95)';
  if (first === 'car') color = 'rgba(90,230,120,0.95)';
  if (first === 'bus' || first === 'truck') color = 'rgba(255,110,110,0.95)';
  if (first === 'bicycle' || first === 'motorbike') color = 'rgba(120,200,255,0.95)';
  const rad = Math.min(W, H) * 0.22;
  const g = CTX.createRadialGradient(sideX, py, rad*0.05, sideX, py, rad);
  g.addColorStop(0, color.replace(/[\d\.]+\)$/,'1)')); g.addColorStop(1, color.replace(/[\d\.]+\)$/,'0)'));
  CTX.fillStyle = g;
  CTX.beginPath(); CTX.arc(sideX, py, rad, 0, Math.PI*2); CTX.fill();
  CTX.strokeStyle = 'rgba(255,255,255,0.06)'; CTX.lineWidth = 2; CTX.beginPath(); CTX.arc(sideX, py, rad, 0, Math.PI*2); CTX.stroke();
  let label = 'Side Object';
  if (first === 'person') label = 'Pedestrian';
  if (first === 'car') label = 'Side Car';
  if (first === 'bus') label = 'Bus';
  if (first === 'truck') label = 'Truck';
  if (first === 'bicycle') label = 'Bicycle';
  if (first === 'motorbike') label = 'Motorbike';
  CTX.fillStyle = 'rgba(0,0,0,0.65)'; CTX.font = '14px sans-serif';
  const tw = CTX.measureText(label).width;
  const lx = sideX - tw/2 - 10; const ly = py - rad - 28;
  roundRect(CTX, lx, ly, tw + 20, 26, 8, true, false);
  CTX.fillStyle = '#fff'; CTX.fillText(label, lx + 10, ly + 18);
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (r === undefined) r=6;
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

// start / stop
BTN_START.onclick = async () => {
  if (!model && !modelLoading) await loadModel();
  if (!TEST_CHECK.checked) await startCamera();
  running = true;
  setStatus('running (analyzing)...');
  // first draw (clear canvas) to ensure visible
  CTX.clearRect(0,0,CANVAS.width,CANVAS.height);
  requestAnimationFrame(detectAndDrawOnce);
};

BTN_STOP.onclick = () => {
  running = false;
  stopCamera();
  setStatus('stopped');
};