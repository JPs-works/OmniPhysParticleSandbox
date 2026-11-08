// GLSL for the Field Lab renderer. Field sources are passed as uniform arrays and
// evaluated analytically per pixel with the same formulas the engine uses.

export const MAX_CHARGES = 16;
export const MAX_PLATES = 8;
export const MAX_BREG = 8;
export const MAX_MIRROR = 2;

const fieldCommon = /* glsl */ `
uniform vec4 uView;          // world x0,y0,x1,y1 of the viewport
uniform vec3 uCh[${MAX_CHARGES}];
uniform int uNCh;
uniform float uK;
uniform float uEps2;
uniform vec4 uPlR[${MAX_PLATES}];
uniform vec2 uPlE[${MAX_PLATES}];
uniform int uNPl;
uniform vec4 uMiA[${MAX_MIRROR}];   // x, y, L, H
uniform vec2 uMiB[${MAX_MIRROR}];   // b0, ratio
uniform int uNMi;

vec2 efield(vec2 p) {
  vec2 e = vec2(0.0);
  for (int i = 0; i < ${MAX_CHARGES}; i++) {
    if (i >= uNCh) break;
    vec2 d = p - uCh[i].xy;
    float r2 = dot(d, d) + uEps2;
    e += d * (uK * uCh[i].z / (r2 * sqrt(r2)));
  }
  for (int i = 0; i < ${MAX_PLATES}; i++) {
    if (i >= uNPl) break;
    vec4 r = uPlR[i];
    if (p.x >= r.x && p.x <= r.z && p.y >= r.y && p.y <= r.w) e += uPlE[i];
  }
  return e;
}

float potential(vec2 p) {
  float phi = 0.0;
  for (int i = 0; i < ${MAX_CHARGES}; i++) {
    if (i >= uNCh) break;
    vec2 d = p - uCh[i].xy;
    phi += uK * uCh[i].z / sqrt(dot(d, d) + uEps2);
  }
  for (int i = 0; i < ${MAX_PLATES}; i++) {
    if (i >= uNPl) break;
    vec4 r = uPlR[i];
    if (p.x >= r.x && p.x <= r.z && p.y >= r.y && p.y <= r.w) {
      vec2 c = 0.5 * (r.xy + r.zw);
      phi -= dot(uPlE[i], p - c);
    }
  }
  return phi;
}

vec2 bplane(vec2 p) {
  vec2 b = vec2(0.0);
  for (int i = 0; i < ${MAX_MIRROR}; i++) {
    if (i >= uNMi) break;
    vec4 a = uMiA[i];
    vec2 d = p - a.xy;
    if (abs(d.x) <= a.z && abs(d.y) <= a.w) {
      float g = (uMiB[i].y - 1.0) / (a.z * a.z);
      b += vec2(uMiB[i].x * (1.0 + g * d.x * d.x), -d.y * uMiB[i].x * 2.0 * g * d.x);
    }
  }
  return b;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

export const quadVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Low-resolution pass: signed potential colormap + animated LIC flow along E (or in-plane B). */
export const fieldFrag = /* glsl */ `
precision highp float;
${fieldCommon}
uniform float uTime;
uniform vec2 uWorldPerPx;     // world units per low-res pixel
uniform float uPhiScale;
uniform float uEScale;
uniform float uBScale;
uniform float uShowPot;
uniform float uShowFlow;
varying vec2 vUv;

vec3 diverging(float u) {
  // u in [-1,1]: negative = cool, positive = warm
  vec3 neg = mix(vec3(0.10, 0.32, 0.95), vec3(0.15, 0.85, 1.0), smoothstep(0.35, 1.0, -u));
  vec3 pos = mix(vec3(0.95, 0.28, 0.12), vec3(1.0, 0.72, 0.25), smoothstep(0.35, 1.0, u));
  return u < 0.0 ? neg : pos;
}

vec2 flowDir(vec2 p, out float mag, out float isB) {
  vec2 e = efield(p);
  float em = length(e) / uEScale;
  if (em > 0.002) { mag = em; isB = 0.0; return e / length(e); }
  vec2 b = bplane(p);
  float bm = length(b);
  if (bm > 0.0) { mag = bm / uBScale; isB = 1.0; return b / bm; }
  mag = 0.0; isB = 0.0; return vec2(0.0);
}

void main() {
  vec2 w = mix(uView.xy, uView.zw, vUv);
  vec3 col = vec3(0.0);

  if (uShowPot > 0.5) {
    float phi = potential(w);
    float u = phi / uPhiScale;
    float t = tanh(u);
    vec3 c = diverging(t);
    float a = 0.05 + 0.30 * pow(abs(t), 0.8);
    col += c * a * step(1e-6, abs(u));
    // equipotential contours (log-spaced so they stay readable near point charges)
    float lv = sign(u) * log2(1.0 + abs(u) * 8.0) * 2.0;
    float fw = max(fwidth(lv), 1e-4);
    float dist = 0.5 - abs(fract(lv) - 0.5);
    float line = 1.0 - smoothstep(0.0, fw * 1.5, dist);
    col += c * 0.28 * line * step(0.02, abs(t)) * step(fw, 0.4);
  }

  if (uShowFlow > 0.5) {
    float mag; float isB;
    vec2 d0 = flowDir(w, mag, isB);
    if (mag > 0.0) {
      float cell = 1.6 * uWorldPerPx.x;
      float stepW = 1.0 * uWorldPerPx.x;
      vec2 p = w;
      float acc = 0.0;
      const int L = 26;
      for (int s = 0; s < L; s++) {
        float m2; float b2;
        vec2 d = flowDir(p, m2, b2);
        if (m2 <= 0.0) break;
        vec2 c = floor(p / cell);
        float h = hash12(c);
        float live = step(0.72, hash12(c + 17.31));
        float ph = fract(h + uTime * 0.5 - float(s) * 0.03);
        float pulse = max(0.0, 1.0 - ph * 5.0);
        acc += live * pulse * (1.0 - float(s) / float(L));
        p -= d * stepW;
      }
      float strength = 0.35 + 0.65 * smoothstep(0.0, 1.0, log2(1.0 + mag * 4.0) / 3.0);
      vec3 fc = isB > 0.5 ? vec3(0.72, 0.52, 1.0) : vec3(0.75, 0.9, 1.0);
      if (uShowPot > 0.5 && isB < 0.5) {
        float t = tanh(potential(w) / uPhiScale);
        fc = mix(fc, diverging(t), 0.45);
      }
      col += fc * acc * 0.22 * strength;
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Full-resolution composite: field texture + B lattice + electrodes + charge orbs + grid. */
export const compositeFrag = /* glsl */ `
precision highp float;
uniform sampler2D uField;
uniform vec4 uView;
uniform vec2 uRes;           // css px
uniform float uWorldPerPx;
uniform vec3 uCh[${MAX_CHARGES}];
uniform int uNCh;
uniform vec4 uPlR[${MAX_PLATES}];
uniform vec2 uPlE[${MAX_PLATES}];
uniform int uNPl;
uniform vec4 uBR[${MAX_BREG}];
uniform float uBz[${MAX_BREG}];
uniform int uNB;
uniform vec4 uMiA[${MAX_MIRROR}];
uniform int uNMi;
uniform float uBRef;
uniform float uShowB;
uniform float uGrid;
uniform float uTime;
varying vec2 vUv;

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 w = mix(uView.xy, uView.zw, vUv);
  vec2 px = vUv * uRes;
  vec3 col = vec3(0.012, 0.016, 0.03);
  // subtle vignette-y backdrop gradient
  col += vec3(0.01, 0.018, 0.04) * (1.0 - length(vUv - 0.5));

  // world grid every 50 units, brighter every 250
  if (uGrid > 0.5) {
    vec2 g = abs(fract(w / 50.0 + 0.5) - 0.5) * 50.0 / uWorldPerPx;
    float l = 1.0 - smoothstep(0.0, 1.0, min(g.x, g.y));
    vec2 g2 = abs(fract(w / 250.0 + 0.5) - 0.5) * 250.0 / uWorldPerPx;
    float l2 = 1.0 - smoothstep(0.0, 1.2, min(g2.x, g2.y));
    col += vec3(0.05, 0.07, 0.11) * (l * 0.5 + l2 * 0.8);
  }

  col += texture2D(uField, vUv).rgb;

  // magnetic regions
  if (uShowB > 0.5) {
    for (int i = 0; i < ${MAX_BREG}; i++) {
      if (i >= uNB) break;
      vec4 r = uBR[i];
      float bz = uBz[i];
      bool inside = w.x >= r.x && w.x <= r.z && w.y >= r.y && w.y <= r.w;
      vec3 tint = bz > 0.0 ? vec3(0.75, 0.35, 1.0) : vec3(0.2, 0.9, 0.75);
      float s = clamp(abs(bz) / uBRef, 0.15, 1.0);
      // edge glow (finite regions only)
      bool inf = r.z - r.x > 1e7;
      if (!inf) {
        vec2 dd = max(vec2(r.x, r.y) - w, w - vec2(r.z, r.w));
        float de = abs(max(dd.x, dd.y)) / uWorldPerPx;
        col += tint * (0.35 * exp(-de * 0.9) + 0.06 * exp(-de * 0.08)) * s;
      }
      if (inside) {
        col += tint * (inf ? 0.012 : 0.03) * s;
        float cell = 38.0;
        vec2 cpx = (w / uWorldPerPx);
        vec2 lc = mod(cpx, cell) - cell * 0.5;
        float d = length(lc);
        float ring = 1.0 - smoothstep(0.6, 1.4, abs(d - 6.5));
        float glyph;
        if (bz > 0.0) {
          glyph = 1.0 - smoothstep(1.4, 2.4, d);
        } else {
          vec2 a = abs(vec2(lc.x + lc.y, lc.x - lc.y)) * 0.7071;
          float cr = 1.0 - smoothstep(0.5, 1.3, min(a.x, a.y));
          glyph = cr * step(d, 5.0);
        }
        float pulse = 0.85 + 0.15 * sin(uTime * 1.5 + dot(floor(cpx / cell), vec2(0.7, 1.3)));
        float gk = inf ? 0.16 : 0.26;
        col += tint * (ring * 0.55 + glyph * 0.8) * gk * (0.35 + 0.65 * s) * pulse;
      }
    }
    for (int i = 0; i < ${MAX_MIRROR}; i++) {
      if (i >= uNMi) break;
      vec4 a = uMiA[i];
      vec2 d = w - a.xy;
      if (abs(d.x) <= a.z && abs(d.y) <= a.w) {
        float t = d.x / a.z;
        col += vec3(0.6, 0.35, 1.0) * 0.06 * (0.3 + t * t);
      }
      // coils at the ends
      for (int k = -1; k <= 1; k += 2) {
        vec2 c = a.xy + vec2(float(k) * a.z, 0.0);
        float dc = segDist(w, c + vec2(0.0, -a.w * 0.55), c + vec2(0.0, a.w * 0.55)) / uWorldPerPx;
        col += vec3(0.85, 0.55, 1.0) * (0.9 * (1.0 - smoothstep(3.0, 5.0, dc)) + 0.25 * exp(-dc * 0.12));
      }
    }
  }

  // capacitor electrodes
  for (int i = 0; i < ${MAX_PLATES}; i++) {
    if (i >= uNPl) break;
    vec4 r = uPlR[i];
    vec2 e = uPlE[i];
    vec2 a0, a1, b0, b1;
    // + electrode is where the field starts
    if (abs(e.y) >= abs(e.x)) {
      a0 = vec2(r.x, r.y); a1 = vec2(r.z, r.y); b0 = vec2(r.x, r.w); b1 = vec2(r.z, r.w);
      if (e.y < 0.0) { vec2 t0 = a0; vec2 t1 = a1; a0 = b0; a1 = b1; b0 = t0; b1 = t1; }
    } else {
      a0 = vec2(r.x, r.y); a1 = vec2(r.x, r.w); b0 = vec2(r.z, r.y); b1 = vec2(r.z, r.w);
      if (e.x < 0.0) { vec2 t0 = a0; vec2 t1 = a1; a0 = b0; a1 = b1; b0 = t0; b1 = t1; }
    }
    float dp = segDist(w, a0, a1) / uWorldPerPx;
    float dn = segDist(w, b0, b1) / uWorldPerPx;
    vec3 cp = vec3(1.0, 0.38, 0.2), cn = vec3(0.25, 0.55, 1.0);
    col += cp * (1.3 * (1.0 - smoothstep(1.5, 3.0, dp)) + 0.35 * exp(-dp * 0.18));
    col += cn * (1.3 * (1.0 - smoothstep(1.5, 3.0, dn)) + 0.35 * exp(-dn * 0.18));
  }

  // point charges
  for (int i = 0; i < ${MAX_CHARGES}; i++) {
    if (i >= uNCh) break;
    vec3 c = uCh[i];
    float d = length(w - c.xy) / uWorldPerPx;
    float rad = 7.0 + 3.0 * log2(1.0 + abs(c.z) / 4.0);
    vec3 cc = c.z > 0.0 ? vec3(1.0, 0.35, 0.22) : vec3(0.25, 0.6, 1.0);
    float core = 1.0 - smoothstep(rad - 1.5, rad, d);
    float halo = exp(-d / (rad * 1.4)) * 0.9 + exp(-d / (rad * 5.0)) * 0.25;
    float pulse = 0.9 + 0.1 * sin(uTime * 2.0 + float(i));
    col += cc * halo * pulse + mix(cc, vec3(1.0), 0.55) * core * 1.2;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export const fadeFrag = /* glsl */ `
uniform sampler2D uPrev;
uniform float uFade;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uPrev, vUv) * uFade;
  // kill denormal residue so long trails fully vanish
  c = max(c - vec4(0.0015), vec4(0.0));
  gl_FragColor = c;
}
`;

export const copyFrag = /* glsl */ `
uniform sampler2D uTex;
uniform float uGain;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(uTex, vUv).rgb * uGain, 1.0); }
`;

export const trailVert = /* glsl */ `
attribute vec2 corner;
attribute vec4 aSeg;
attribute vec3 aCol;
uniform float uHalfWidth;
uniform float uMaxLen;
varying float vSide;
varying vec3 vCol;
void main() {
  vec2 a = aSeg.xy;
  vec2 b = aSeg.zw;
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 p = mix(a, b, corner.x) + dir * (corner.x * 2.0 - 1.0) * uHalfWidth * 0.5 + nrm * corner.y * uHalfWidth;
  vSide = corner.y;
  vCol = aCol;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 0.0, 1.0);
  if (len > uMaxLen) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const trailFrag = /* glsl */ `
uniform float uGain;
varying float vSide;
varying vec3 vCol;
void main() {
  float a = 1.0 - vSide * vSide;
  gl_FragColor = vec4(vCol * a * uGain, 1.0);
}
`;

export const pointVert = /* glsl */ `
attribute vec3 aCol;
attribute float aSize;
uniform float uScale;
varying vec3 vCol;
void main() {
  vCol = aCol;
  gl_PointSize = aSize * uScale;
  gl_Position = projectionMatrix * viewMatrix * vec4(position.xy, 0.0, 1.0);
}
`;

export const pointFrag = /* glsl */ `
uniform float uGlow;
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c) * 4.0;
  if (d2 > 1.0) discard;
  float core = exp(-d2 * 28.0);
  float halo = exp(-d2 * 5.0) * (1.0 - d2);
  vec3 col = vCol * halo * uGlow + mix(vCol, vec3(1.0), 0.6) * core * 1.6;
  gl_FragColor = vec4(col, 1.0);
}
`;
