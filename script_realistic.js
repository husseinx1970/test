// Tesla-like HUD using camera in background, showing only top-down visualization.

const video = document.getElementById('video');
const canvas = document.getElementById('hud');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const speedEl = document.getElementById('speed');
const statusEl = document.getElementById('status');

let model = null;
let stream = null;
let running = false;
let lastTime = performance.now();

// ضبط حجم الـ canvas حسب الشاشة
function resizeCanvas() {
  const w = Math.min(window.innerWidth - 30, 900);
  const h = Math.min(window.innerHeight * 0.7, 600);
  canvas.width = w;
  canvas.height = h;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

async function loadModel() {
  statusEl.textContent = 'تحميل نموذج AI ...';
  model = await cocoSsd.load();
  statusEl.textContent = 'النموذج جاهز';
}
loadModel();

// تشغيل الكاميرا (لكن لن نعرض الفيديو)
async function startCamera() {
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width:{ideal:1280}, height:{ideal:720} },
      audio: false
    });
    video.srcObject = stream;
    await new Promise(res => video.onloadedmetadata = res);
  } catch (e) {
    alert('لم أستطع فتح الكاميرا: ' + e.message);
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

function mapDetectionToPolar(det, vw, vh) {
  // det: {bbox:[x,y,w,h], class, score}
  const [x,y,w,h] = det.bbox;
  const cx = x + w/2;
  const cy = y + h/2;

  // normalized
  const nx = (cx / vw) * 2 - 1;      // -1..1 left/right
  const ny = cy / vh;                // 0 (top) .. 1 (bottom)

  // تقدير زاوية من -60 درجة إلى +60
  const angle = nx * 60 * (Math.PI/180);
  // تقدير مسافة من حجم الصندوق: كلما كان أكبر كان أقرب
  const area = (w*h)/(vw*vh);
  let r = 1 - Math.min(1, Math.sqrt(area)*2);   // 0 قريب، 1 بعيد
  r = 0.2 + r*0.8;  // لا نجعله صفر تماما

  return {angle, r};
}

function drawScene(detections) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);

  // خلفية رمادية خفيفة
  ctx.fillStyle = '#f3f5f9';
  ctx.fillRect(0,0,W,H);

  const cx = W/2;
  const cy = H*0.7;

  // رسم "سحب" محيطة (خلفية، مثل Tesla)
  ctx.fillStyle = 'rgba(200,205,215,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx - W*0.35, cy-40, W*0.25, H*0.35, 0, 0, Math.PI*2);
  ctx.ellipse(cx + W*0.35, cy-40, W*0.25, H*0.35, 0, 0, Math.PI*2);
  ctx.ellipse(cx,           cy-80, W*0.25, H*0.4,  0, 0, Math.PI*2);
  ctx.fill();

  // رسم السيارة من الأعلى
  const carW = W*0.22;
  const carH = H*0.25;
  ctx.save();
  ctx.translate(cx, cy-40);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 10;

  // جسم السيارة
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, -carW/2, -carH/2, carW, carH, 18, true, false);

  // سقف أسود بانوراما
  ctx.fillStyle = '#15191f';
  roundRect(ctx, -carW*0.35, -carH*0.35, carW*0.7, carH*0.7, 10, true, false);
  ctx.restore();

  // رسم الفقاعات للأجسام المكتشفة
  detections.forEach(d => {
    const pol = d.polar; // angle, r
    const radiusBase = Math.min(W,H) * 0.42 * pol.r;
    const px = cx + radiusBase * Math.sin(pol.angle);
    const py = cy-40 - radiusBase * Math.cos(pol.angle);

    let color;
    if (d.class === 'person') color = 'rgba(255,190,60,0.95)';
    else if (d.class === 'car') color = 'rgba(120,220,120,0.95)';
    else color = 'rgba(255,130,100,0.95)';

    const rad = Math.min(W,H) * 0.18 * (1 - (pol.r-0.2)); // أقرب = أكبر

    // تدرج ناعم
    const g = ctx.createRadialGradient(px, py, rad*0.1, px, py, rad);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d\.]+\)$/,'0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rad*0.7, rad, 0, 0, Math.PI*2);
    ctx.fill();
  });
}

// أداة لرسم مستطيل بحواف ناعمة
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  if (r === undefined) r = 5;
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

// حلقة المعالجة
async function loop(now) {
  if (!running || !model || !video.videoWidth) {
    requestAnimationFrame(loop);
    return;
  }
  const dt = (now - lastTime)/1000;
  lastTime = now;

  // رسم السرعة الوهمية (فقط شكل)
  const fakeSpeed = Math.max(0, Math.round(40 + 5*Math.sin(now/1000)));
  speedEl.textContent = fakeSpeed + ' km/h';

  // تحضير إطار مصغّر للتحليل
  const maxW = 640;
  const scale = Math.min(1, maxW / video.videoWidth);
  const sw = Math.floor(video.videoWidth * scale);
  const sh = Math.floor(video.videoHeight * scale);
  const tmp = document.createElement('canvas');
  tmp.width = sw;
  tmp.height = sh;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(video, 0, 0, sw, sh);

  const predictions = await model.detect(tmp);

  // تحويل الـ detections إلى إحداثيات حول السيارة
  const useful = predictions
    .filter(p => ['person','car','bus','truck','bicycle','motorbike'].includes(p.class) && p.score > 0.4)
    .map(p => {
      const polar = mapDetectionToPolar(p, video.videoWidth, video.videoHeight);
      return { class: p.class, score: p.score, polar };
    });

  drawScene(useful);

  requestAnimationFrame(loop);
}

// أزرار التحكم
startBtn.onclick = async () => {
  await startCamera();
  running = true;
  statusEl.textContent = 'يعمل (تحليل مباشر)...';
};
stopBtn.onclick = () => {
  running = false;
  stopCamera();
  statusEl.textContent = 'متوقف';
};

requestAnimationFrame(loop);