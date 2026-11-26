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

const key = (i, j, k) => `${i},${j},${k}`;

/**
 * Construcción de Wulff atómica: guarda los átomos fcc que están "dentro"
 * de todos los planos. Cada plano está a una distancia proporcional a su γ.
 * Devuelve los átomos de superficie, clasificados por la familia de cara
 * más cercana, y la fracción aproximada de superficie de cada familia.
 */
export function wulffParticle(gamma, radius = 9) {
  const gmin = Math.min(gamma['111'], gamma['100'], gamma['110']);
  const scale = radius / gmin;
  const lim = Math.ceil(radius * 1.8);
  const inside = new Map();

  for (let i = -lim; i <= lim; i++)
    for (let j = -lim; j <= lim; j++)
      for (let k = -lim; k <= lim; k++) {
        if ((i + j + k) % 2 !== 0) continue;
        let ok = true;
        let best = Infinity;
        let bestFam = '111';
        for (const f of FAMILIES) {
          const d = gamma[f] * scale;
          let m = -Infinity;
          for (const n of NORMALS[f]) {
            const p = i * n[0] + j * n[1] + k * n[2];
            if (p > m) m = p;
          }
          if (m > d + 1e-6) { ok = false; break; }
          const gap = d - m;
          if (gap < best) { best = gap; bestFam = f; }
        }
        if (ok) inside.set(key(i, j, k), { p: [i, j, k], fam: bestFam });
      }

  // Plano atómico más externo real de cada cara (no el plano ideal).
  const outer = {};
  for (const f of FAMILIES) {
    outer[f] = NORMALS[f].map((n) => {
      let m = -Infinity;
      for (const a of inside.values()) {
        const d = a.p[0] * n[0] + a.p[1] * n[1] + a.p[2] * n[2];
        if (d > m) m = d;
      }
      return m;
    });
  }

  const surface = [];
  for (const atom of inside.values()) {
    const [i, j, k] = atom.p;
    let nb = 0;
    for (const o of NEIGHBORS) if (inside.has(key(i + o[0], j + o[1], k + o[2]))) nb++;
    if (nb === 12) continue;
    // ¿En qué caras está este átomo? (en el plano más externo de esa cara)
    let hits = 0, fam = null, bestGap = Infinity, nearFam = '111';
    for (const f of FAMILIES) {
      NORMALS[f].forEach((n, q) => {
        const gap = outer[f][q] - (i * n[0] + j * n[1] + k * n[2]);
        if (gap < 1e-6) { hits++; fam = f; }
        if (gap < bestGap) { bestGap = gap; nearFam = f; }
      });
    }
    if (hits === 1) {
      surface.push({ p: atom.p, fam, edge: false });
    } else if (hits > 1) {
      surface.push({ p: atom.p, fam: nearFam, edge: true }); // arista o esquina
    } else {
      surface.push({ p: atom.p, fam: nearFam, edge: false }); // capa de abajo, visible
    }
  }
  // Fracciones de área: de la forma continua (más suave que contar átomos).
  return { surface, fractions: wulffAreas(gamma), nAtoms: inside.size };
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
