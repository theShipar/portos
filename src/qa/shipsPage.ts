import * as THREE from 'three';
import { SHIP_MODEL_KEYS, SHIP_PRESETS, type ShipModelKey } from '@/map/vessels3d/categories';
import { headingToYaw } from '@/map/vessels3d/contract';
import { buildShipGeometry, LOD_TRIANGLE_RANGE, libraryStats, wakeGeometry, type ShipLod } from '@/map/vessels3d/library';

/**
 * Ship library QA page (spec 08 geometry tests): every model in front, port, starboard, top and three-quarter views at
 * LOD1 or LOD2 (`?lod=2`), the shared LOD0 glyph, and one hull at the four cardinal headings with a north reference.
 * One renderer draws all cells through scissored viewports. Procedural and illustrative; not design data.
 */
const params = new URLSearchParams(location.search);
const lod: ShipLod = params.get('lod') === '2' ? 2 : params.get('lod') === '0' ? 0 : 1;

const CELL_W = 200;
const CELL_H = 120;
const VIEWS = ['front', 'port', 'starboard', 'top', 'three-quarter'] as const;
type View = (typeof VIEWS)[number];
const HEADINGS = [0, 90, 180, 270];

const root = document.getElementById('qa')!;
document.body.style.cssText = 'margin:0;background:#f6f6f3;color:#13191e;font:13px/1.4 system-ui,sans-serif';
root.style.cssText = 'padding:20px 24px';
const stats = libraryStats();

const header = document.createElement('header');
header.innerHTML = `<h1 style="font-size:18px;margin:0 0 4px">Ship library QA · LOD${lod}</h1>
<p style="margin:0 0 12px;color:#52606a">Procedural, illustrative models (spec 08 fallback tier). Bow −Z, up +Y, starboard +X; length normalised to 1.
<a href="?lod=0">LOD0</a> · <a href="?lod=1">LOD1</a> · <a href="?lod=2">LOD2</a></p>`;
root.appendChild(header);

const grid = document.createElement('div');
grid.style.cssText = `display:grid;grid-template-columns:140px repeat(${VIEWS.length}, ${CELL_W}px) 120px;align-items:center;gap:0`;
const label = (text: string, extra = '') => {
  const d = document.createElement('div');
  d.style.cssText = `padding:4px 8px;${extra}`;
  d.textContent = text;
  return d;
};
grid.appendChild(label('Model', 'font-weight:600'));
for (const v of VIEWS) grid.appendChild(label(v, 'font-weight:600;text-transform:capitalize'));
grid.appendChild(label('Triangles', 'font-weight:600'));
const cells: { el: HTMLElement; key: ShipModelKey | null; view: View | 'heading'; heading?: number }[] = [];
const rows: ShipModelKey[] = lod === 0 ? ['other'] : [...SHIP_MODEL_KEYS];
for (const key of rows) {
  grid.appendChild(label(lod === 0 ? 'Shared glyph' : SHIP_PRESETS[key].label));
  for (const view of VIEWS) {
    const el = document.createElement('div');
    el.style.cssText = `width:${CELL_W}px;height:${CELL_H}px;border:1px solid #dce2e4;box-sizing:border-box`;
    el.dataset.testid = `ship-cell-${key}-${view}`;
    grid.appendChild(el);
    cells.push({ el, key, view });
  }
  const tris = stats[key][lod];
  const [lo, hi] = LOD_TRIANGLE_RANGE[lod];
  grid.appendChild(label(`${tris.toLocaleString('en-US')}${tris < lo || tris > hi ? ' ⚠' : ''}`, 'font-variant-numeric:tabular-nums'));
}
root.appendChild(grid);

const hTitle = document.createElement('h2');
hTitle.style.cssText = 'font-size:15px;margin:20px 0 6px';
hTitle.textContent = 'Cardinal headings (top view, north up) · container ship with wake';
root.appendChild(hTitle);
const hRow = document.createElement('div');
hRow.style.cssText = 'display:flex;gap:0';
for (const h of HEADINGS) {
  const wrap = document.createElement('div');
  const el = document.createElement('div');
  el.style.cssText = `width:${CELL_W}px;height:${CELL_W}px;border:1px solid #dce2e4;box-sizing:border-box;background:#071a27`;
  el.dataset.testid = `ship-heading-${h}`;
  wrap.appendChild(el);
  wrap.appendChild(label(`${h}° ${['N', 'E', 'S', 'W'][HEADINGS.indexOf(h)]}`));
  hRow.appendChild(wrap);
  cells.push({ el, key: 'container', view: 'heading', heading: h });
}
root.appendChild(hRow);

const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setScissorTest(true);

function material() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.18, side: THREE.DoubleSide });
}
function meshFor(key: ShipModelKey): THREE.Mesh {
  const g = buildShipGeometry(key, lod).clone();
  g.setAttribute('color', g.getAttribute('partColor'));
  return new THREE.Mesh(g, material());
}

function stage(): THREE.Scene {
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight('#f4f7f9', '#5a6a74', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(-2, 4, 3);
  s.add(sun);
  return s;
}

function cameraFor(view: View): THREE.Camera {
  const aspect = CELL_W / CELL_H;
  const ortho = (w: number) => new THREE.OrthographicCamera(-w / 2, w / 2, w / aspect / 2, -w / aspect / 2, 0.01, 20);
  let cam: THREE.Camera;
  switch (view) {
    case 'front':
      cam = ortho(0.42);
      cam.position.set(0, 0.06, -5);
      break;
    case 'port':
      cam = ortho(1.16);
      cam.position.set(-5, 0.06, 0);
      break;
    case 'starboard':
      cam = ortho(1.16);
      cam.position.set(5, 0.06, 0);
      break;
    case 'top':
      cam = ortho(1.16);
      cam.position.set(0, 5, 0);
      cam.up.set(-1, 0, 0);
      break;
    default:
      cam = new THREE.PerspectiveCamera(28, aspect, 0.01, 20);
      cam.position.set(1.35, 0.75, -1.25);
  }
  cam.lookAt(0, view === 'front' ? 0.06 : 0.04, 0);
  return cam;
}

function headingScene(h: number): { scene: THREE.Scene; camera: THREE.Camera } {
  const scene = stage();
  const ship = meshFor('container');
  ship.rotation.y = headingToYaw(h);
  scene.add(ship);
  const wake = new THREE.Mesh(wakeGeometry(), new THREE.MeshBasicMaterial({ color: '#dcebf0', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  wake.rotation.y = headingToYaw(h);
  scene.add(wake);
  // North reference: thin bar towards −Z with a tip.
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.001, 0.5), new THREE.MeshBasicMaterial({ color: '#e66a2d' }));
  bar.position.set(-1.4, 0, -1.1);
  scene.add(bar);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 3), new THREE.MeshBasicMaterial({ color: '#e66a2d' }));
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(-1.4, 0, -1.42);
  scene.add(tip);
  // Ship (1 length) plus a full wake (1 more length aft) fit at every heading.
  const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.01, 20);
  camera.position.set(0, 5, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  return { scene, camera };
}

const drawList = cells.map((c) => {
  if (c.view === 'heading') return { ...c, ...headingScene(c.heading!) };
  const scene = stage();
  scene.add(meshFor(c.key!));
  return { ...c, scene, camera: cameraFor(c.view) };
});

function render() {
  const w = document.documentElement.scrollWidth;
  const h = document.documentElement.scrollHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  renderer.setScissor(0, 0, w, h);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  for (const d of drawList) {
    const r = d.el.getBoundingClientRect();
    const x = r.left + window.scrollX;
    const y = h - (r.bottom + window.scrollY);
    renderer.setViewport(x + 1, y + 1, r.width - 2, r.height - 2);
    renderer.setScissor(x + 1, y + 1, r.width - 2, r.height - 2);
    renderer.render(d.scene, d.camera);
  }
}
render();
window.addEventListener('resize', render);

root.dataset.testid = 'ship-qa';
root.dataset.lod = String(lod);
root.dataset.stats = JSON.stringify(stats);
root.dataset.ready = '1';
