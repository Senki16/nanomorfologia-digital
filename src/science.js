// Geometría y modelos (ilustrativos) usados por la página.
// Unidades: red fcc con celda convencional de lado 2 -> átomos en puntos
// enteros (i, j, k) con i + j + k par. Distancia entre vecinos = √2.

export const FAMILIES = ['111', '100', '110'];

const s2 = Math.SQRT2;
const s3 = Math.sqrt(3);

// Normales de cada familia de caras
export const NORMALS = {
  '100': [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ],
  '111': [],
  '110': [],
};
for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) {
  NORMALS['111'].push([x / s3, y / s3, z / s3]);
}
for (const a of [1, -1]) for (const b of [1, -1]) {
  NORMALS['110'].push([a / s2, b / s2, 0], [a / s2, 0, b / s2], [0, a / s2, b / s2]);
}

const NEIGHBORS = [];
for (const a of [1, -1]) for (const b of [1, -1]) {
  NEIGHBORS.push([a, b, 0], [a, 0, b], [0, a, b]);
}

// Todas las normales en una lista plana: [nx, ny, nz, familia]
const ALL_N = [];
FAMILIES.forEach((f, fi) => NORMALS[f].forEach((n) => ALL_N.push([n[0], n[1], n[2], fi])));

const cache = new Map();

/**
 * Construcción de Wulff atómica: guarda los átomos fcc que están "dentro"
 * de todos los planos. Cada plano está a una distancia proporcional a su γ.
 * Devuelve los átomos de superficie, clasificados por la cara en la que están,
 * y la fracción de área de cada familia (de la forma continua).
 */
export function wulffParticle(gamma, radius = 9) {
  const ck = `${gamma['111'].toFixed(3)}|${gamma['100'].toFixed(3)}|${gamma['110'].toFixed(3)}|${radius}`;
  if (cache.has(ck)) return cache.get(ck);

  const gmin = Math.min(gamma['111'], gamma['100'], gamma['110']);
  const scale = radius / gmin;
  const dist = FAMILIES.map((f) => gamma[f] * scale + 1e-6);
  const lim = Math.ceil(radius * 1.8);
  const N = 2 * lim + 1;
  const idx = (i, j, k) => ((i + lim) * N + (j + lim)) * N + (k + lim);
  const inside = new Uint8Array(N * N * N);
  const list = [];
  const nN = ALL_N.length;

  for (let i = -lim; i <= lim; i++)
    for (let j = -lim; j <= lim; j++)
      for (let k = -lim; k <= lim; k++) {
        if ((i + j + k) & 1) continue;
        let ok = true;
        for (let q = 0; q < nN; q++) {
          const n = ALL_N[q];
          if (i * n[0] + j * n[1] + k * n[2] > dist[n[3]]) { ok = false; break; }
        }
        if (ok) { inside[idx(i, j, k)] = 1; list.push(i, j, k); }
      }

  // Plano atómico más externo real de cada cara (no el plano ideal).
  const outer = new Float64Array(nN).fill(-Infinity);
  for (let a = 0; a < list.length; a += 3) {
    const i = list[a], j = list[a + 1], k = list[a + 2];
    for (let q = 0; q < nN; q++) {
      const n = ALL_N[q];
      const d = i * n[0] + j * n[1] + k * n[2];
      if (d > outer[q]) outer[q] = d;
    }
  }

  const nbOff = NEIGHBORS.map((o) => (o[0] * N + o[1]) * N + o[2]);
  const surface = [];
  for (let a = 0; a < list.length; a += 3) {
    const i = list[a], j = list[a + 1], k = list[a + 2];
    if (Math.abs(i) >= lim - 1 || Math.abs(j) >= lim - 1 || Math.abs(k) >= lim - 1) continue;
    const c = idx(i, j, k);
    let nb = 0;
    for (let q = 0; q < 12; q++) nb += inside[c + nbOff[q]];
    if (nb === 12) continue;
    // ¿En qué caras está este átomo? (en el plano más externo de esa cara)
    let hits = 0, fam = 0, bestGap = Infinity, nearFam = 0;
    for (let q = 0; q < nN; q++) {
      const n = ALL_N[q];
      const gap = outer[q] - (i * n[0] + j * n[1] + k * n[2]);
      if (gap < 1e-6) { hits++; fam = n[3]; }
      if (gap < bestGap) { bestGap = gap; nearFam = n[3]; }
    }
    const p = [i, j, k];
    if (hits === 1) surface.push({ p, fam: FAMILIES[fam], edge: false });
    else surface.push({ p, fam: FAMILIES[nearFam], edge: hits > 1 }); // arista, o capa de abajo visible
  }
  const result = { surface, fractions: wulffAreas(gamma), nAtoms: list.length / 3 };
  if (cache.size > 300) cache.clear();
  cache.set(ck, result);
  return result;
}

/**
 * Lámina (slab) de Pd vista desde arriba para una cara dada.
 * Devuelve átomos con su capa (0 = arriba).
 */
export function slab(face, size = 7, layers = 3) {
  const n = NORMALS[face][0].slice();
  if (face === '111') { n[0] = n[1] = n[2] = 1 / s3; }
  if (face === '110') { n[0] = 1 / s2; n[1] = 1 / s2; n[2] = 0; }
  if (face === '100') { n[0] = 0; n[1] = 0; n[2] = 1; }
  const spacing = { '111': 2 / s3, '100': 1, '110': 1 / s2 }[face];
  const atoms = [];
  const lim = size + 4;
  for (let i = -lim; i <= lim; i++)
    for (let j = -lim; j <= lim; j++)
      for (let k = -lim; k <= lim; k++) {
        if ((i + j + k) % 2 !== 0) continue;
        const h = i * n[0] + j * n[1] + k * n[2];
        const layer = Math.round(-h / spacing);
        if (Math.abs(-h / spacing - layer) > 1e-3) continue;
        if (layer < 0 || layer >= layers) continue;
        // distancia lateral
        const lx = i - h * n[0], ly = j - h * n[1], lz = k - h * n[2];
        const lat = Math.hypot(lx, ly, lz);
        if (lat > size) continue;
        atoms.push({ p: [i, j, k], layer, h });
      }
  return { atoms, normal: n };
}

/** Lámina Pd(100) con sitios hueco (hollow) para colocar H. */
export function slab100WithSites(half = 5) {
  const atoms = [];
  const sites = [];
  for (let layer = 0; layer < 3; layer++)
    for (let i = -half; i <= half; i++)
      for (let j = -half; j <= half; j++) {
        if ((i + j + layer) % 2 === 0) atoms.push({ p: [i, j, -layer], layer });
      }
  for (let i = -half + 1; i <= half - 1; i++)
    for (let j = -half + 1; j <= half - 1; j++) {
      if ((i + j) % 2 !== 0) sites.push([i, j, 0.75]);
    }
  return { atoms, sites };
}

/** Orden fijo y "aleatorio" de sitios para llenar coberturas parciales. */
export function siteOrder(sites) {
  // Los huecos forman una red cuadrada con índices u, v.
  // ¼ = p(2×2): u y v pares.  ½ = c(2×2): u + v par.  1 = todos.
  const idx = sites.map((s, n) => ({ s, n }));
  const mod2 = (x) => ((x % 2) + 2) % 2;
  const rank = ({ s }) => {
    const [i, j] = s;
    const u = (i + j - 1) / 2;
    const v = (i - j - 1) / 2;
    if (mod2(u) === 0 && mod2(v) === 0) return 0;
    if (mod2(u + v) === 0) return 1;
    return 2;
  };
  return idx.sort((x, y) => rank(x) - rank(y)).map((x) => x.s);
}

// ---------------- Modelos ilustrativos (NO son resultados) ----------------

/** Energías superficiales relativas vs. "cantidad de hidrógeno" x ∈ [0, 1]. */
export function gammaVsHydrogen(x) {
  return {
    '111': 1.0 - 0.07 * x,
    '100': 1.12 - 0.16 * x,
    '110': 1.2 - 0.3 * x,
  };
}

/**
 * Diagrama de fase superficial ilustrativo para una cara:
 * γ(θ, Δμ) = γ0 + θ·(E_ads − Δμ)·k. Cada línea es una cobertura.
 */
export const COVERAGES = [
  { theta: 0, label: 'Limpia (sin H)', e: 0 },
  { theta: 0.25, label: '¼ de capa de H', e: -0.6 },
  { theta: 0.5, label: '½ capa de H', e: -0.45 },
  { theta: 1, label: 'Capa completa de H', e: -0.25 },
];
export function gammaCoverage(c, dmu) {
  return 1.12 + c.theta * (c.e - dmu) * 0.6;
}
export function winner(dmu) {
  let best = COVERAGES[0];
  let g = Infinity;
  for (const c of COVERAGES) {
    const v = gammaCoverage(c, dmu);
    if (v < g - 1e-9) { g = v; best = c; }
  }
  return best;
}

// Direcciones casi uniformes sobre la esfera (espiral de Fibonacci).
const DIRS = (() => {
  const n = 6000, out = [], ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), t = ga * i;
    out.push([r * Math.cos(t), y, r * Math.sin(t)]);
  }
  return out;
})();

/**
 * Fracción de área de cada familia en la forma de Wulff continua.
 * Para cada dirección, el rayo desde el centro choca con el plano más cercano;
 * ese trozo de superficie pesa t² / cos(ángulo).
 */
export function wulffAreas(gamma) {
  const area = { '111': 0, '100': 0, '110': 0 };
  for (const u of DIRS) {
    let tBest = Infinity, fBest = null, cBest = 1;
    for (const f of FAMILIES) {
      for (const n of NORMALS[f]) {
        const c = u[0] * n[0] + u[1] * n[1] + u[2] * n[2];
        if (c <= 1e-9) continue;
        const t = gamma[f] / c;
        if (t < tBest) { tBest = t; fBest = f; cBest = c; }
      }
    }
    area[fBest] += (tBest * tBest) / cBest;
  }
  const tot = area['111'] + area['100'] + area['110'];
  for (const f of FAMILIES) area[f] /= tot;
  return area;
}
