import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  FAMILIES, NORMALS, wulffParticle, slab, slab100WithSites, siteOrder,
  gammaVsHydrogen, COVERAGES, gammaCoverage, winner,
} from './science.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLORS = {
  '111': new THREE.Color('#2F5DA8'),
  '100': new THREE.Color('#D9A21B'),
  '110': new THREE.Color('#1F8A7A'),
  edge: new THREE.Color('#8E97A3'),
  pd: new THREE.Color('#B8BEC6'),
  pdDeep: new THREE.Color('#8E97A3'),
  faded: new THREE.Color('#D5DBE2'),
  h: new THREE.Color('#FFFFFF'),
};

const PD_GEO = new THREE.SphereGeometry(0.72, 14, 10);
const H_GEO = new THREE.SphereGeometry(0.4, 10, 8);
const PD_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.15 });
const H_MAT = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0, emissive: 0x2a2f36 });

const pct = (x) => `${Math.round(x * 100)} %`;

/* ------------------------------------------------------------------ */
/* Visor 3D genérico: se crea solo cuando entra en pantalla.           */
/* ------------------------------------------------------------------ */
function makeViewer(el, { autoRotate = false, polar = null } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 1.5, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    el.innerHTML = '<p class="fallback">Este navegador no puede mostrar el modelo 3D (WebGL desactivado). El texto de la izquierda explica lo mismo.</p>';
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  el.appendChild(renderer.domElement);
  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = 'Arrastra para girar';
  el.appendChild(hint);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6b4, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, 1.4, 1.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.8);
  rim.position.set(-1.2, -0.4, -1);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  camera.position.set(1, 0.75, 1.2).normalize().multiplyScalar(50);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = !REDUCED;
  controls.dampingFactor = 0.12;
  if (polar) { controls.minPolarAngle = polar[0]; controls.maxPolarAngle = polar[1]; }

  let raf = 0;
  let visible = true;
  let spinning = autoRotate && !REDUCED;
  controls.autoRotate = spinning;
  controls.autoRotateSpeed = 0.9;

  const frame = () => {
    raf = 0;
    const moving = controls.update();
    renderer.render(scene, camera);
    if ((spinning || moving) && visible) raf = requestAnimationFrame(frame);
  };
  const render = () => { if (!raf) raf = requestAnimationFrame(frame); };

  controls.addEventListener('change', render);
  controls.addEventListener('start', () => {
    hint.remove();
    if (spinning) { spinning = false; controls.autoRotate = false; }
  });

  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  };
  new ResizeObserver(resize).observe(el);

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) render();
  }).observe(el);

  /** Ajusta la distancia de la cámara a un objeto de radio r. */
  const fit = (r, margin = 1.12) => {
    const d = (r * margin) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.normalize().multiplyScalar(d);
    controls.update();
    render();
  };

  resize();
  return { scene, camera, controls, renderer, render, fit };
}

/** Ejecuta init() la primera vez que el elemento se acerca a la pantalla. */
function whenNear(el, init) {
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); init(); }
  }, { rootMargin: '300px 0px' });
  io.observe(el);
}

/* ------------------------------------------------------------------ */
/* Partícula de Wulff hecha de átomos                                  */
/* ------------------------------------------------------------------ */
const MAX_PD = 4000;
const MAX_H = 2500;

function hash(i, j, k) {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function outwardNormal(p, fam) {
  let best = NORMALS[fam][0], m = -Infinity;
  for (const n of NORMALS[fam]) {
    const d = p[0] * n[0] + p[1] * n[1] + p[2] * n[2];
    if (d > m) { m = d; best = n; }
  }
  return best;
}

class ParticleModel {
  constructor(scene) {
    this.pd = new THREE.InstancedMesh(PD_GEO, PD_MAT, MAX_PD);
    this.h = new THREE.InstancedMesh(H_GEO, H_MAT, MAX_H);
    this.pd.count = 0; this.h.count = 0;
    this.pd.frustumCulled = false; this.h.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.pd, this.h);
    scene.add(this.group);
    this.m = new THREE.Matrix4();
    this.highlight = 'all';
    this.result = null;
    this.hAmount = 0;
  }

  /** gamma: energías de las tres familias. hAmount ∈ [0,1]: cuánto H dibujar. */
  update(gamma, hAmount = 0) {
    this.result = wulffParticle(gamma, 11);
    this.hAmount = hAmount;
    this.paint();
    return this.result;
  }

  paint() {
    const { surface } = this.result;
    const m = this.m;
    let n = 0, nh = 0;
    let rmax = 0;
    for (const a of surface) {
      if (n >= MAX_PD) break;
      const [x, y, z] = a.p;
      m.makeTranslation(x, y, z);
      this.pd.setMatrixAt(n, m);
      let c = a.edge ? COLORS.edge : COLORS[a.fam];
      if (this.highlight !== 'all' && (a.edge || a.fam !== this.highlight)) c = COLORS.faded;
      this.pd.setColorAt(n, c);
      n++;
      rmax = Math.max(rmax, Math.hypot(x, y, z));

      // Hidrógeno: más probable en caras (110) y (100), que lo atraen más.
      if (this.hAmount > 0 && nh < MAX_H) {
        const affinity = { '111': 0.55, '100': 0.8, '110': 1 }[a.fam];
        if (hash(x, y, z) < this.hAmount * affinity * 0.55) {
          const nn = a.edge ? [x, y, z].map((v) => v / Math.hypot(x, y, z)) : outwardNormal(a.p, a.fam);
          m.makeTranslation(x + nn[0] * 1.0, y + nn[1] * 1.0, z + nn[2] * 1.0);
          this.h.setMatrixAt(nh, m);
          nh++;
        }
      }
    }
    this.pd.count = n;
    this.h.count = nh;
    this.pd.instanceMatrix.needsUpdate = true;
    if (this.pd.instanceColor) this.pd.instanceColor.needsUpdate = true;
    this.h.instanceMatrix.needsUpdate = true;
    this.radius = rmax + 1.4;
  }

  setHighlight(f) { this.highlight = f; this.paint(); }
}

/* ------------------------------------------------------------------ */
/* 0 · Hero: el hidrógeno cambia la forma                              */
/* ------------------------------------------------------------------ */
function initHero() {
  const el = document.getElementById('v-hero');
  const v = makeViewer(el);
  const slider = document.getElementById('hero-h');
  const out = Object.fromEntries(FAMILIES.map((f) => [f, document.getElementById(`hero-f${f}`)]));
  const writeFractions = (fr) => { for (const f of FAMILIES) out[f].textContent = pct(fr[f]); };

  if (!v) { writeFractions(wulffParticle(gammaVsHydrogen(0)).fractions); return; }
  const model = new ParticleModel(v.scene);

  let pending = false;
  const apply = () => {
    pending = false;
    const x = Math.round(Number(slider.value) * 50) / 50; // pasos de 0.02: reutiliza cálculos
    const r = model.update(gammaVsHydrogen(x), x);
    writeFractions(r.fractions);
    v.render();
  };
  slider.addEventListener('input', () => {
    if (!pending) { pending = true; requestAnimationFrame(apply); }
  });
  apply();
  v.fit(model.radius, 1.05);
}

/* ------------------------------------------------------------------ */
/* 1 · Caras por familia                                               */
/* ------------------------------------------------------------------ */
function initFacets() {
  const el = document.getElementById('v-facets');
  const v = makeViewer(el);
  if (!v) return;
  const model = new ParticleModel(v.scene);
  model.update(gammaVsHydrogen(0.55), 0);
  v.fit(model.radius);

  const buttons = document.querySelectorAll('#paso-1 [data-fam]');
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    model.setHighlight(b.dataset.fam);
    v.render();
  }));
}

/* ------------------------------------------------------------------ */
/* 2 · Láminas (slabs) de las tres caras                               */
/* ------------------------------------------------------------------ */
function initSlab() {
  const el = document.getElementById('v-slab');
  const v = makeViewer(el, { polar: [0.15, 1.45] });
  if (!v) return;
  v.camera.position.set(0, 1.3, 1).normalize().multiplyScalar(50);
  const mesh = new THREE.InstancedMesh(PD_GEO, PD_MAT, 400);
  mesh.frustumCulled = false;
  v.scene.add(mesh);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const layerColor = [null, COLORS.pd, COLORS.pdDeep];

  const show = (face) => {
    const { atoms, normal } = slab(face, 7, 3);
    q.setFromUnitVectors(new THREE.Vector3(...normal), up);
    atoms.forEach((a, n) => {
      pos.set(...a.p).applyQuaternion(q);
      m.makeTranslation(pos.x, pos.y + 1, pos.z);
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, a.layer === 0 ? COLORS[face] : layerColor[a.layer]);
    });
    mesh.count = atoms.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    v.render();
  };

  const tabs = document.querySelectorAll('#paso-2 [data-face]');
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((o) => o.setAttribute('aria-selected', String(o === t)));
    show(t.dataset.face);
  }));
  show('111');
  v.fit(8.2, 1.05);
}

/* ------------------------------------------------------------------ */
/* 3 · Hidrógeno en Pd(100)                                            */
/* ------------------------------------------------------------------ */
function initHydrogen() {
  const el = document.getElementById('v-hydrogen');
  const slider = document.getElementById('cov');
  const labels = ['Limpia', '¼ de capa', '½ capa', 'Capa completa'];
  const v = makeViewer(el, { polar: [0.15, 1.45] });
  if (!v) return;
  v.camera.position.set(0.6, 1.4, 1).normalize().multiplyScalar(50);

  const { atoms, sites } = slab100WithSites(5);
  const ordered = siteOrder(sites);
  const pd = new THREE.InstancedMesh(PD_GEO, PD_MAT, atoms.length);
  const h = new THREE.InstancedMesh(H_GEO, H_MAT, ordered.length);
  pd.frustumCulled = h.frustumCulled = false;
  const m = new THREE.Matrix4();
  const layerColor = [COLORS['100'], COLORS.pd, COLORS.pdDeep];
  atoms.forEach((a, n) => {
    m.makeTranslation(a.p[0], a.p[2] + 1, a.p[1]);
    pd.setMatrixAt(n, m);
    pd.setColorAt(n, layerColor[a.layer]);
  });
  ordered.forEach((s, n) => {
    m.makeTranslation(s[0], s[2] + 1, s[1]);
    h.setMatrixAt(n, m);
  });
  v.scene.add(pd, h);

  const apply = () => {
    const i = Number(slider.value);
    h.count = Math.round(ordered.length * COVERAGES[i].theta);
    slider.setAttribute('aria-valuetext', labels[i]);
    v.render();
  };
  slider.addEventListener('input', apply);
  apply();
  v.fit(7.6, 1.05);
}

/* ------------------------------------------------------------------ */
/* 5 · Diagrama de fase superficial (SVG)                              */
/* ------------------------------------------------------------------ */
const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, val);
  if (text != null) e.textContent = text;
  return e;
}

const COV_COLORS = ['#8E97A3', '#5B7FB8', '#2F5DA8', '#13233A'];
const COV_SHORT = ['Limpia', '¼', '½', 'Completa'];

function initPhase() {
  const svg = document.getElementById('phase-chart');
  const slider = document.getElementById('dmu');
  const out = document.getElementById('dmu-out');
  const W = 560, H = 470;
  const P = { l: 56, r: 16, t: 92, b: 104 };
  const X0 = -1, X1 = 0.15, Y0 = 0.85, Y1 = 1.62;
  const sx = (x) => P.l + ((x - X0) / (X1 - X0)) * (W - P.l - P.r);
  const sy = (y) => H - P.b - ((y - Y0) / (Y1 - Y0)) * (H - P.t - P.b);

  // Zona de hidruro
  svg.append(s('rect', { x: sx(0), y: P.t, width: sx(X1) - sx(0), height: H - P.t - P.b, fill: '#DCE3EA' }));
  svg.append(s('text', { x: (sx(0) + sx(X1)) / 2, y: P.t + 20, 'font-size': 14, 'text-anchor': 'middle', class: 'muted' }, 'Hidruro'));

  // Rejilla y ejes
  for (let y = 0.9; y < Y1; y += 0.1) {
    svg.append(s('line', { x1: P.l, x2: W - P.r, y1: sy(y), y2: sy(y), class: 'grid' }));
  }
  svg.append(s('line', { x1: P.l, x2: P.l, y1: P.t, y2: H - P.b, class: 'axis' }));
  svg.append(s('line', { x1: P.l, x2: W - P.r, y1: H - P.b, y2: H - P.b, class: 'axis' }));
  const ym = (P.t + H - P.b) / 2;
  svg.append(s('text', { x: 22, y: ym, 'font-size': 16, 'text-anchor': 'middle',
    transform: `rotate(-90 22 ${ym})` }, 'Energía superficial γ (costo)'));
  const xl = s('text', { x: (P.l + W - P.r) / 2, y: H - P.b + 26, 'font-size': 16, 'text-anchor': 'middle' },
    'Hidrógeno en el ambiente (Δμ');
  xl.append(s('tspan', { 'baseline-shift': 'sub', 'font-size': 12 }, 'H'));
  xl.append(s('tspan', {}, ')'));
  svg.append(xl);
  // Leyenda
  COVERAGES.forEach((c, i) => {
    const lx = P.l + (i % 2) * 250, ly = 22 + Math.floor(i / 2) * 26;
    svg.append(s('line', { x1: lx, x2: lx + 26, y1: ly - 5, y2: ly - 5, stroke: COV_COLORS[i], 'stroke-width': 3, 'stroke-dasharray': '6 4' }));
    svg.append(s('text', { x: lx + 34, y: ly, 'font-size': 15, 'font-weight': 700 }, c.label));
  });
  svg.append(s('line', { x1: P.l, x2: P.l + 26, y1: 70, y2: 70, stroke: '#13233A', 'stroke-width': 5 }));
  svg.append(s('text', { x: P.l + 34, y: 75, 'font-size': 15 }, 'La que gana (la más baja)'));

  // Líneas de cada cobertura
  const N = 60;
  COVERAGES.forEach((c, i) => {
    let d = '';
    for (let k = 0; k <= N; k++) {
      const x = X0 + (k / N) * (X1 - X0);
      d += `${k ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(gammaCoverage(c, x)).toFixed(1)}`;
    }
    svg.append(s('path', { d, fill: 'none', stroke: COV_COLORS[i], 'stroke-width': 2.5, 'stroke-dasharray': '6 4', opacity: 0.9 }));
  });

  // Envolvente inferior (la estructura ganadora) y franjas
  let env = '';
  const bands = [];
  for (let k = 0; k <= 230; k++) {
    const x = X0 + (k / 230) * (X1 - X0);
    const w = winner(x);
    env += `${k ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(gammaCoverage(w, x)).toFixed(1)}`;
    const idx = COVERAGES.indexOf(w);
    if (!bands.length || bands[bands.length - 1].idx !== idx) bands.push({ idx, x0: x, x1: x });
    else bands[bands.length - 1].x1 = x;
  }
  svg.append(s('path', { d: env, fill: 'none', stroke: '#13233A', 'stroke-width': 4.5, 'stroke-linejoin': 'round' }));

  const bandY = H - P.b + 42;
  svg.append(s('text', { x: P.l - 6, y: bandY + 17, 'font-size': 13, 'text-anchor': 'end', class: 'muted' }, 'Gana'));
  bands.forEach((b) => {
    svg.append(s('rect', { x: sx(b.x0), y: bandY, width: Math.max(1, sx(b.x1) - sx(b.x0)), height: 24,
      fill: COV_COLORS[b.idx] }));
    const cx = (sx(b.x0) + sx(b.x1)) / 2;
    svg.append(s('text', { x: cx, y: bandY + 17, 'font-size': 14, 'text-anchor': 'middle',
      fill: b.idx === 0 ? '#13233A' : '#FFFFFF', 'font-weight': 700 }, COV_SHORT[b.idx]));
  });
  svg.append(s('text', { x: P.l, y: bandY + 50, 'font-size': 14, class: 'muted' }, 'Poco H: alta T, baja p'));
  svg.append(s('text', { x: W - P.r, y: bandY + 50, 'font-size': 14, 'text-anchor': 'end', class: 'muted' }, 'Mucho H: baja T, alta p'));

  // Marcador del control
  const marker = s('line', { y1: P.t, y2: H - P.b, stroke: '#13233A', 'stroke-width': 1.5, 'stroke-dasharray': '2 3' });
  const dot = s('circle', { r: 8, fill: '#FFFFFF', stroke: '#13233A', 'stroke-width': 3 });
  svg.append(marker, dot);

  const apply = () => {
    const x = Number(slider.value);
    const w = winner(x);
    marker.setAttribute('x1', sx(x)); marker.setAttribute('x2', sx(x));
    dot.setAttribute('cx', sx(x)); dot.setAttribute('cy', sy(gammaCoverage(w, x)));
    out.textContent = w.label + (x > 0 ? ' (y el H empieza a entrar al metal)' : '');
    slider.setAttribute('aria-valuetext', `Gana: ${w.label}`);
  };
  slider.addEventListener('input', apply);
  apply();
}

/* ------------------------------------------------------------------ */
/* 6 · Ciclo de active learning (SVG)                                  */
/* ------------------------------------------------------------------ */
function initML() {
  const svg = document.getElementById('ml-loop');
  const btn = document.getElementById('ml-run');
  const cap = document.getElementById('ml-caption');
  const cx = 280, cy = 210, R = 150;
  const nodes = [
    { t: ['El modelo ML', 'predice energías'], a: -90 },
    { t: ['¿Los modelos', 'no coinciden?'], a: 0 },
    { t: ['DFT calcula', 'ese caso'], a: 90 },
    { t: ['Se re-entrena', 'el modelo'], a: 180 },
  ];
  const steps = [
    'El modelo predice la energía de muchas estructuras en segundos.',
    'Varios modelos "votan". Donde no se ponen de acuerdo, hay duda.',
    'Solo esos casos dudosos se calculan con DFT, que es lento pero preciso.',
    'El modelo aprende de los cálculos nuevos y mejora.',
  ];

  svg.append(s('circle', { cx, cy, r: R, fill: 'none', stroke: '#C9D2DC', 'stroke-width': 3 }));
  // flechas en el círculo
  for (const a of [-45, 45, 135, 225]) {
    const rad = THREE.MathUtils.degToRad(a);
    const x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
    const g = s('path', { d: 'M-7,-8 L7,0 L-7,8 Z', fill: '#8E97A3',
      transform: `translate(${x} ${y}) rotate(${a + 90})` });
    svg.append(g);
  }
  const els = nodes.map((n) => {
    const rad = THREE.MathUtils.degToRad(n.a);
    const x = cx + R * Math.cos(rad), y = cy + R * Math.sin(rad);
    const g = s('g', { transform: `translate(${x} ${y})` });
    const box = s('rect', { x: -92, y: -34, width: 184, height: 68, rx: 34, fill: '#F7F9FB', stroke: '#13233A', 'stroke-width': 2 });
    g.append(box);
    n.t.forEach((line, k) => g.append(s('text', { y: k * 20 - 4, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700 }, line)));
    svg.append(g);
    return { g, box };
  });

  // medidor en el centro
  svg.append(s('text', { x: cx, y: cy - 26, 'text-anchor': 'middle', 'font-size': 15, class: 'muted' }, 'Error del modelo'));
  svg.append(s('rect', { x: cx - 60, y: cy - 14, width: 120, height: 14, rx: 7, fill: '#C9D2DC' }));
  const fill = s('rect', { x: cx - 60, y: cy - 14, width: 120, height: 14, rx: 7, fill: '#D9A21B' });
  svg.append(fill);
  const round = s('text', { x: cx, y: cy + 26, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700 }, 'Ronda 0');
  svg.append(round);

  const errors = [1, 0.62, 0.38, 0.22, 0.12];
  let r = 0;
  let busy = false;
  const highlight = (i) => els.forEach((e, k) => {
    e.box.setAttribute('fill', k === i ? '#13233A' : '#F7F9FB');
    e.g.querySelectorAll('text').forEach((t) => t.setAttribute('fill', k === i ? '#FFFFFF' : '#13233A'));
  });
  const wait = (ms) => new Promise((res) => setTimeout(res, REDUCED ? 0 : ms));

  btn.addEventListener('click', async () => {
    if (busy) return;
    if (r >= errors.length - 1) {
      r = 0; fill.setAttribute('width', 120); fill.setAttribute('fill', '#D9A21B');
      round.textContent = 'Ronda 0'; highlight(-1);
      cap.textContent = 'El ciclo se repite hasta que el modelo acierta.';
      btn.textContent = 'Ver un ciclo de active learning';
      return;
    }
    busy = true; btn.disabled = true;
    for (let i = 0; i < 4; i++) {
      highlight(i);
      cap.textContent = steps[i];
      await wait(1300);
    }
    r++;
    fill.setAttribute('width', 120 * errors[r]);
    round.textContent = `Ronda ${r}`;
    highlight(-1);
    if (r >= errors.length - 1) {
      fill.setAttribute('fill', '#1F8A7A');
      cap.textContent = 'Listo: el modelo ya acierta qué estructura gana. Ahora sí se puede usar para probar muchas estructuras.';
      btn.textContent = 'Empezar de nuevo';
    } else {
      cap.textContent = `Después de la ronda ${r} el error bajó. Se repite hasta que sea suficientemente bajo.`;
      btn.textContent = 'Hacer otra ronda';
    }
    busy = false; btn.disabled = false;
  });
}

/* ------------------------------------------------------------------ */
/* 7 · Wulff interactivo                                               */
/* ------------------------------------------------------------------ */
function initWulff() {
  const el = document.getElementById('v-wulff');
  const v = makeViewer(el);
  const inputs = Object.fromEntries(FAMILIES.map((f) => [f, document.getElementById(`g${f}`)]));
  const vals = Object.fromEntries(FAMILIES.map((f) => [f, document.getElementById(`g${f}-v`)]));
  const bars = Object.fromEntries(FAMILIES.map((f) => [f, document.getElementById(`b${f}`)]));
  const pcts = Object.fromEntries(FAMILIES.map((f) => [f, document.getElementById(`p${f}`)]));
  const model = v ? new ParticleModel(v.scene) : null;

  let pending = false;
  const apply = () => {
    pending = false;
    const g = Object.fromEntries(FAMILIES.map((f) => [f, Number(inputs[f].value)]));
    const r = model ? model.update(g, 0) : wulffParticle(g, 11);
    for (const f of FAMILIES) {
      vals[f].textContent = g[f].toFixed(2);
      bars[f].style.width = pct(r.fractions[f]).replace(' ', '');
      pcts[f].textContent = pct(r.fractions[f]);
    }
    if (v) v.render();
  };
  for (const f of FAMILIES) inputs[f].addEventListener('input', () => {
    if (!pending) { pending = true; requestAnimationFrame(apply); }
  });
  apply();
  if (v) v.fit(model.radius * 1.12);
}

/* ------------------------------------------------------------------ */
/* 8 · Tira de formas (imágenes renderizadas una sola vez)             */
/* ------------------------------------------------------------------ */
function initStrip() {
  const snaps = document.querySelectorAll('#shape-strip .snap');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { return; }
  const size = 360;
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6b4, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, 1.4, 1.2);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  const model = new ParticleModel(scene);
  const xs = [0, 0.25, 0.5, 0.75, 1];
  const labels = ['Sin hidrógeno', 'Poco', 'Moderado', 'Bastante', 'Mucho'];
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 60));
  let i = 0;
  const next = () => {
    const x = xs[i];
    const r = model.update(gammaVsHydrogen(x), 0);
    const d = (model.radius * 1.05) / Math.sin(THREE.MathUtils.degToRad(15));
    camera.position.set(1, 0.75, 1.2).normalize().multiplyScalar(d);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const img = new Image();
    img.src = renderer.domElement.toDataURL('image/png');
    const f = r.fractions;
    img.alt = `${labels[i]}: (111) ${pct(f['111'])}, (100) ${pct(f['100'])}, (110) ${pct(f['110'])}`;
    snaps[i].append(img);
    i++;
    if (i < xs.length) idle(next);
    else { renderer.dispose(); renderer.forceContextLoss(); }
  };
  idle(next);
}

/* ------------------------------------------------------------------ */
/* Índice lateral: marca el paso visible                               */
/* ------------------------------------------------------------------ */
function initRail() {
  const links = [...document.querySelectorAll('.rail a')];
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        links.forEach((a) => { a.classList.remove('active'); a.removeAttribute('aria-current'); });
        const a = map.get(e.target.id);
        if (a) { a.classList.add('active'); a.setAttribute('aria-current', 'step'); }
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('.step').forEach((sec) => io.observe(sec));
}

/* ------------------------------------------------------------------ */
initHero();
whenNear(document.getElementById('v-facets'), initFacets);
whenNear(document.getElementById('v-slab'), initSlab);
whenNear(document.getElementById('v-hydrogen'), initHydrogen);
initPhase();
initML();
whenNear(document.getElementById('v-wulff'), initWulff);
whenNear(document.getElementById('shape-strip'), initStrip);
initRail();
