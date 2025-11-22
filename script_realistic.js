// script_realistic.js
// Realistic HUD demo: TFJS coco-ssd + Three.js rendering.
// Author: generated for user demo.

const video = document.getElementById('video');
const overlay = document.getElementById('overlay2d');
const threeContainer = document.getElementById('threeContainer');
const useCameraBtn = document.getElementById('useCamera');
const useRefBtn = document.getElementById('useReference');
const flipCheckbox = document.getElementById('flip');
const speedEl = document.getElementById('speed');

let model = null;
let stream = null;
let detections = [];
let smoothed = {};

// three.js globals
let scene, camera3, renderer, carMesh, billboards = [];
const MAX_TENSOR = 640;
const FPS = 15;
const SMOOTH_ALPHA = 0.45;

// initialize three.js scene for HUD visualization
function initThree(width, height) {
  // cleanup if exists
  if (renderer) {
    renderer.dispose();
    threeContainer.innerHTML = '';
  }
  renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, preserveDrawingBuffer:false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.domElement.style.width = width + 'px';
  renderer.domElement.style.height = height + 'px';
  threeContainer.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  // camera for HUD (orthographic-ish viewpoint)
  camera3 = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
  camera3.position.set(0, 10, 30);
  camera3.lookAt(0,0,0);

  // lights
  const amb = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.4);
  dir.position.set(10,20,10);
  scene.add(dir);

  // ground plane (stylized)
  const ggeom = new THREE.PlaneGeometry(200, 100, 10, 1);
  const gmat = new THREE.MeshBasicMaterial({color:0x111316,transparent:true,opacity:0.0});
  const ground = new THREE.Mesh(ggeom, gmat);
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -2.2;
  scene.add(ground);

  // simple car mesh (box + roof)
  const body = new THREE.BoxGeometry(4,1.2,8);
  const bodyMat = new THREE.MeshPhongMaterial({color:0x222831, shininess:30});
  carMesh = new THREE.Mesh(body, bodyMat);
  carMesh.position.set(0,0,0);
  scene.add(carMesh);

  // add wheel hints (cylinders)
  const wheelGeo = new THREE.CylinderGeometry(0.6,0.6,0.4,12);
  const wheelMat = new THREE.MeshPhongMaterial({color:0x0e0e0e});
  const offsets = [[-1.6,-0.6,3],[1.6,-0.6,3],[-1.6,-0.6,-3],[1.6,-0.6,-3]];
  offsets.forEach(o=>{ const w=new THREE.Mesh(wheelGeo,wheelMat); w.rotation.z = Math.PI/2; w.position.set(o[0], o[1], o[2]); scene.add(w); });

  // camera helpers not shown
  animateThree();
}

function animateThree() {
  requestAnimationFrame(animateThree);
  // subtle hover animation
  const t = Date.now()*0.001;
  carMesh.rotation.y = Math.sin(t*0.2)*0.02;
  // update billboards to face camera
  billboards.forEach(obj => { obj.lookAt(camera3.position); });
  renderer.render(scene, camera3);
}

// create or update a detection billboard in 3D
function upsertBillboard(id, props) {
  // props: {xScreen, yScreen, size, color, label, score}
  let bb = billboards.find(b=>b.userData.id===id);
  if (!bb) {
    const g = new THREE.PlaneGeometry(1,1);
    const mat = new THREE.MeshBasicMaterial({transparent:true,opacity:0.95});
    const mesh = new THREE.Mesh(g, mat);
    mesh.userData = { id };
    mesh.scale.set(props.size, props.size, 1);
    scene.add(mesh);
    billboards.push(mesh);
    bb = mesh;
  }
  // map screen XY to world coordinates in front of car
  const sx = (props.xScreen - 0.5) * 20; // -10..10
  const sy = (0.9 - props.yScreen) * 6; // ground vertical mapping
  const depth = 10 + (1 - props.size) * 40; // small -> far
  bb.position.set(sx, sy - 1.5, -depth);
  bb.material.color = new THREE.Color(props.color);
  bb.material.opacity = 0.9;
  bb.userData.label = props.label;
  // set size scaled
  bb.scale.set(props.size*6, props.size*3, 1);
}

// simple smoothing helper
function smoothKey(key, val) {
  if (!smoothed[key]) smoothed[key] = val;
  else {
    smoothed[key].x = smoothed[key].x*(1-SMOOTH_ALPHA)+val.x*SMOOTH_ALPHA;
    smoothed[key].y = smoothed[key].y*(1-SMOOTH_ALPHA)+val.y*SMOOTH_ALPHA;
    smoothed[key].w = smoothed[key].w*(1-SMOOTH_ALPHA)+val.w*SMOOTH_ALPHA;
    smoothed[key].h = smoothed[key].h*(1-SMOOTH_ALPHA)+val.h*SMOOTH_ALPHA;
    smoothed[key].score = Math.max(smoothed[key].score*(1-SMOOTH_ALPHA), val.score);
  }
  return smoothed[key];
}

// drawing 2D overlay labels (optional)
function draw2D(frameDetections) {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0,0,overlay.width, overlay.height);
  // draw faint vignette around center
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.rect(0,0,overlay.width, overlay.height);
  ctx.fill();

  // ground grid arcs
  const cx = overlay.width/2;
  const cy = overlay.height*0.78;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let r=1;r<=5;r++){
    ctx.beginPath();
    ctx.ellipse(cx, cy, overlay.width*0.38*(r/5), overlay.height*0.12*(r/5), 0, 0, Math.PI*2);
    ctx.stroke();
  }

  // draw small labels / bubbles for detections
  frameDetections.forEach(det=>{
    const ox = det.x * overlay.width;
    const oy = det.y * overlay.height;
    const size = Math.max(10, det.size * Math.min(overlay.width, overlay.height) * 0.25);
    // radial
    const g = ctx.createRadialGradient(ox, oy, 2, ox, oy, size);
    g.addColorStop(0, det.color);
    g.addColorStop(1, det.color.replace('1)','0)'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ox, oy, size, 0, Math.PI*2);
    ctx.fill();
    // label
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(ox-40, oy-35, 80, 20);
    ctx.fillStyle = '#fff';
    ctx.fillText(det.label + ' ' + Math.round(det.score*100) + '%', ox-36, oy-20);
  });
}

// run detection and map to 3D HUD
async function processFrame() {
  if (!model) { setTimeout(processFrame, 200); return; }
  if (!video.videoWidth) { setTimeout(processFrame, 200); return; }

  // create small canvas for inference
  const scale = Math.min(1, MAX_TENSOR / video.videoWidth);
  const w = Math.floor(video.videoWidth * scale);
  const h = Math.floor(video.videoHeight * scale);
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').drawImage(video, 0, 0, w, h);

  const preds = await model.detect(tmp);
  const filtered = [];
  for (let p of preds) {
    if (!['person','car','bus','truck','bicycle','motorbike'].includes(p.class)) continue;
    // center normalized
    const scaleBack = video.videoWidth / w;
    const bx = p.bbox[0]*scaleBack, by = p.bbox[1]*scaleBack, bw = p.bbox[2]*scaleBack, bh = p.bbox[3]*scaleBack;
    const cx = (bx + bw/2) / video.videoWidth;
    const cy = (by + bh/2) / video.videoHeight;
    const area = (bw*bh) / (video.videoWidth*video.videoHeight);
    const size = Math.min(1, Math.sqrt(area)*2.0);
    filtered.push({x:cx, y:cy, w:bw, h:bh, score:p.score, cls:p.class, size});
  }

  // smoothing + update billboards
  filtered.forEach((f, idx) => {
    const key = f.cls + '_' + idx;
    const s = smoothKey(key, f);
    // pick color by class
    let color = 0xFFA500; // orange default
    if (s.cls==='person') color = 0xFFBB33;
    if (s.cls==='car') color = 0x59F078;
    if (s.cls==='bus' || s.cls==='truck') color = 0xFF6B6B;
    // update 3D billboard
    upsertBillboard(key, { xScreen: s.x, yScreen: s.y, size: s.size, color: color, label: s.cls, score: s.score });
  });

  // draw 2D overlay
  draw2D(filtered);

  // simulate speed (placeholder)
  const simulatedSpeed = Math.min(60, Math.round((Math.random()*2 + 10) * (1 + Math.random()*0.1)));
  speedEl.innerText = simulatedSpeed + ' km/h';

  setTimeout(processFrame, 1000 / FPS);
}

// camera start/stop and init
async function startCamera() {
  try {
    if (stream) { stream.getTracks().forEach(t=>t.stop()); stream = null; }
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal:1280 }, height: { ideal:720 } }, audio:false });
    video.srcObject = stream;
    await new Promise(r=>video.onloadedmetadata = r);
    // set overlay sizes
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    overlay.style.width = overlay.width + 'px';
    overlay.style.height = overlay.height + 'px';
    // init three with same size
    initThree(overlay.width, overlay.height);
  } catch (e) {
    alert('Camera error: ' + e.message);
  }
}

function useReference() {
  // not implemented in this build (keeps camera flow)
  alert('Reference mode disabled in realistic demo. Use camera.');
}

// load model then enable UI
async function boot() {
  model = await cocoSsd.load();
  console.log('Model loaded');
  useCameraBtn.disabled = false;
  useCameraBtn.onclick = startCamera;
  useRefBtn.onclick = useReference;
  flipCheckbox.onchange = ()=>{ if (video) video.style.transform = flipCheckbox.checked ? 'scaleX(-1)' : 'scaleX(1)'; };
  processFrame();
}
boot();
