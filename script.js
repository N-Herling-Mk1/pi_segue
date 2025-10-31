/* ==========================
   Rotating Squares π Approx
   ========================== */

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false }); // opaque black
const piOverlay = document.getElementById('piOverlay');

const countInput = document.getElementById('countInput');
const degInput = document.getElementById('degInput');
const msInput = document.getElementById('msInput');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');

/* ---- globals / tunables ---- */
let WIDTH = 0, HEIGHT = 0, CX = 0, CY = 0, R = 0;
let runTimer = null, animRAF = null;
let angles = [];        // degrees for each persistent square (memory)
let targetCount = 36;   // number of squares to render (user input)
let stepDeg = 10;       // degrees per square (user input)
let spawnMs = 120;      // ms between spawns (user input)
let spawned = 0;

/* ---- sizing ---- */
function fit() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.floor(rect.width);
  canvas.height = Math.floor(rect.height);
  WIDTH = canvas.width;
  HEIGHT = canvas.height;
  CX = WIDTH / 2;
  CY = HEIGHT / 2;

  // Circle radius with padding
  R = Math.floor(Math.min(WIDTH, HEIGHT) * 0.36);
  // no need to redraw here; main loop handles it
}
window.addEventListener('resize', fit);
fit();

/* ---- geometry helpers ---- */
const toRad = d => d * Math.PI / 180;

/** Vertices of a square inscribed in circle radius R, rotated by theta (deg),
 *  centered at (0,0). We return 4 points in world coords translated to center.
 *  Base square: axis-aligned with side = R*sqrt(2), corners at (±s/2, ±s/2).
 */
function squareVertices(thetaDeg) {
  const s = R * Math.SQRT2;             // side length for inscribed square
  const h = s / 2;                       // half side
  const th = toRad(thetaDeg);
  const c = Math.cos(th), si = Math.sin(th);

  const base = [
    [-h, -h], [ h, -h], [ h,  h], [ -h,  h]
  ];
  // rotate + translate to center
  return base.map(([x,y]) => {
    const xr = x*c - y*si;
    const yr = x*si + y*c;
    return [xr + CX, yr + CY];
  });
}

/* ---- convex hull (Andrew monotone chain) ---- */
function cross(o, a, b) {
  return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
}
function convexHull(points) {
  if (points.length <= 1) return points.slice();
  const pts = points.slice().sort((a,b)=> a[0]===b[0] ? a[1]-b[1] : a[0]-b[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i=pts.length-1; i>=0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
function polyPerimeter(poly) {
  if (poly.length < 2) return 0;
  let L = 0;
  for (let i=0; i<poly.length; i++) {
    const [x1,y1] = poly[i];
    const [x2,y2] = poly[(i+1)%poly.length];
    const dx = x2-x1, dy = y2-y1;
    L += Math.hypot(dx,dy);
  }
  return L;
}

/* ---- rendering ---- */
function drawScene() {
  // black background
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,WIDTH,HEIGHT);

  // circle
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#00ff88';
  ctx.shadowColor = 'rgba(0,255,136,0.6)';
  ctx.shadowBlur = 14;

  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI*2);
  ctx.stroke();

  // squares (memory)
  ctx.lineWidth = 1.2;
  ctx.shadowBlur = 16;
  for (const ang of angles) {
    const v = squareVertices(ang);
    // glow pass
    ctx.strokeStyle = 'rgba(0,255,136,0.30)';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(v[0][0], v[0][1]);
    for (let i=1;i<4;i++) ctx.lineTo(v[i][0], v[i][1]);
    ctx.closePath(); ctx.stroke();

    // core pass
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(v[0][0], v[0][1]);
    for (let i=1;i<4;i++) ctx.lineTo(v[i][0], v[i][1]);
    ctx.closePath(); ctx.stroke();
  }

  // perimeter/π overlay
  const allPts = [];
  for (const ang of angles) {
    const v = squareVertices(ang);
    allPts.push(...v);
  }
  let piApprox = '—';
  if (allPts.length >= 3) {
    const hull = convexHull(allPts);
    const per = polyPerimeter(hull);
    const diameter = 2*R;
    const ratio = per / diameter; // ≈ π
    piApprox = ratio.toFixed(6);

    // draw hull lightly for clarity
    ctx.strokeStyle = 'rgba(0,255,136,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6,5]);
    ctx.beginPath();
    ctx.moveTo(hull[0][0], hull[0][1]);
    for (let i=1;i<hull.length;i++) ctx.lineTo(hull[i][0], hull[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // text overlay
  piOverlay.textContent = `π ≈ ${piApprox}`;
}

/* ---- animation control ---- */
function resetAll() {
  angles = [];
  spawned = 0;
  stopTimers();
  drawScene();
}

function stopTimers() {
  if (runTimer) { clearInterval(runTimer); runTimer = null; }
  if (animRAF) { cancelAnimationFrame(animRAF); animRAF = null; }
}

function startRun() {
  // take UI values
  targetCount = Math.max(1, Math.min(720, Number(countInput.value) || 36));
  stepDeg = Math.max(1, Math.min(180, Number(degInput.value) || 10));
  spawnMs = Math.max(1, Math.min(5000, Number(msInput.value) || 120));

  resetAll(); // clears + cancels

  // spawn loop (duplicates with memory)
  runTimer = setInterval(() => {
    if (spawned >= targetCount) {
      clearInterval(runTimer); runTimer = null;
      return;
    }
    const nextAngle = (spawned === 0) ? 0 : (angles[angles.length-1] + stepDeg);
    angles.push(nextAngle);
    spawned++;
  }, spawnMs);

  // render loop (smooth)
  const loop = () => { drawScene(); animRAF = requestAnimationFrame(loop); };
  animRAF = requestAnimationFrame(loop);
}

/* ---- wire controls ---- */
startBtn.addEventListener('click', startRun);
resetBtn.addEventListener('click', resetAll);

/* initial paint */
drawScene();
