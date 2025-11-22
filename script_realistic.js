// script_static.js - static UI demo: draws top-down car and side bubbles
const canvas = document.getElementById('hudCanvas');
const ctx = canvas.getContext('2d');
const refImg = document.getElementById('refImage');
const status = document.getElementById('status');

const btnLeft = document.getElementById('showLeft');
const btnRight = document.getElementById('showRight');
const btnBoth = document.getElementById('showBoth');
const btnClear = document.getElementById('clear');

function fit() {
  const vw = Math.min(window.innerWidth - 40, 920);
  const vh = Math.min(window.innerHeight * 0.72, 720);
  canvas.width = Math.floor(vw);
  canvas.height = Math.floor(vh);
}
window.addEventListener('resize', fit);
fit();

function drawHUD(left=false, right=false) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0,0,W,H);
  // background
  ctx.fillStyle = '#f3f6f9';
  ctx.fillRect(0,0,W,H);

  const cx = W/2, cy = H*0.72;
  // road blobs
  ctx.fillStyle = 'rgba(220,220,225,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx - W*0.35, cy-40, W*0.24, H*0.34, 0, 0, Math.PI*2);
  ctx.ellipse(cx + W*0.35, cy-40, W*0.24, H*0.34, 0, 0, Math.PI*2);
  ctx.ellipse(cx, cy - 80, W*0.22, H*0.38, 0, 0, Math.PI*2);
  ctx.fill();

  // car silhouette
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

  if (left) drawSideBubble('left', 'Side Car');
  if (right) drawSideBubble('right', 'Side Car');
}

function drawSideBubble(side, labelText) {
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H*0.72;
  const sideX = (side === 'left') ? cx - W*0.35 : cx + W*0.35;
  const py = cy - 40 - H*0.06;
  const color = (side === 'left') ? 'rgba(120,240,160,0.96)' : 'rgba(255,195,70,0.95)';
  const rad = Math.min(W,H) * 0.22;
  const g = ctx.createRadialGradient(sideX, py, rad*0.05, sideX, py, rad);
  g.addColorStop(0, color.replace(/\)$/,'1)'));
  g.addColorStop(1, color.replace(/\)$/,'0)'));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(sideX, py, rad, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sideX, py, rad, 0, Math.PI*2); ctx.stroke();

  // label
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.font = '14px sans-serif';
  const tw = ctx.measureText(labelText).width;
  const lx = sideX - tw/2 - 10;
  const ly = py - rad - 28;
  roundRect(ctx, lx, ly, tw + 20, 26, 8, true, false);
  ctx.fillStyle = '#fff';
  ctx.fillText(labelText, lx + 10, ly + 18);
}

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

// buttons
btnLeft.onclick = () => { drawHUD(true, false); status.textContent='Status: left object shown'; };
btnRight.onclick = () => { drawHUD(false, true); status.textContent='Status: right object shown'; };
btnBoth.onclick = () => { drawHUD(true, true); status.textContent='Status: both objects shown'; };
btnClear.onclick = () => { drawHUD(false, false); status.textContent='Status: cleared'; };

// initial draw
drawHUD(false, false);