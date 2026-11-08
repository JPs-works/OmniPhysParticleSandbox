// three.js renderer for the Field Lab.
// Pipeline per frame:
//   1. field pass (half res): potential colormap + animated LIC  -> fieldRT
//   2. trail pass (css res): fade previous trail target, add instanced segment quads (ping-pong)
//   3. main scene through postprocessing: composite quad, trail quad, glow points, bloom

import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, VignetteEffect } from 'postprocessing';
import { SPECIES, hexToRgb } from '../physics/species';
import type { Bounds, FieldObject, SimParams } from '../physics/types';
import {
  MAX_BREG,
  MAX_CHARGES,
  MAX_MIRROR,
  MAX_PLATES,
  compositeFrag,
  copyFrag,
  fadeFrag,
  fieldFrag,
  pointFrag,
  pointVert,
  quadVert,
  trailFrag,
  trailVert,
} from './shaders';

export interface RenderToggles {
  potential: boolean;
  flow: boolean;
  bField: boolean;
  grid: boolean;
  trails: boolean;
  /** trail time constant in seconds */
  trailTau: number;
  bloom: number;
}

const SPECIES_RGB = SPECIES.map((s) => hexToRgb(s.color));

const v3arr = (n: number) => Array.from({ length: n }, () => new THREE.Vector3());
const v4arr = (n: number) => Array.from({ length: n }, () => new THREE.Vector4());
const v2arr = (n: number) => Array.from({ length: n }, () => new THREE.Vector2());

export class FieldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: BloomEffect;
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private scene = new THREE.Scene();
  private fieldScene = new THREE.Scene();
  private fadeScene = new THREE.Scene();
  private segScene = new THREE.Scene();

  private fieldRT: THREE.WebGLRenderTarget;
  private trailA: THREE.WebGLRenderTarget;
  private trailB: THREE.WebGLRenderTarget;

  private fieldMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private fadeMat: THREE.ShaderMaterial;
  private trailQuadMat: THREE.ShaderMaterial;
  private segMat: THREE.ShaderMaterial;
  private pointMat: THREE.ShaderMaterial;

  private segGeo: THREE.InstancedBufferGeometry;
  private segAttr: THREE.InstancedBufferAttribute;
  private segCol: THREE.InstancedBufferAttribute;
  private pointGeo: THREE.BufferGeometry;
  private pointPos: THREE.BufferAttribute;
  private pointCol: THREE.BufferAttribute;
  private pointSize: THREE.BufferAttribute;
  private points: THREE.Points;
  private cap = 0;
  private segCount = 0;
  private newSegments = false;

  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  view: Bounds = { x0: -500, y0: -300, x1: 500, y1: 300 };
  private time = 0;
  private clearTrails = true;
  /** while the camera moves, trails (screen-space) are hidden and cleared once it settles */
  private trailResetAt = 0;
  private quality = 1;

  constructor(canvas: HTMLCanvasElement) {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x03040a, 1);
    this.renderer = renderer;

    const rtOpts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    } as const;
    this.fieldRT = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.trailA = new THREE.WebGLRenderTarget(4, 4, rtOpts);
    this.trailB = new THREE.WebGLRenderTarget(4, 4, rtOpts);

    const quad = new THREE.PlaneGeometry(2, 2);
    const fieldUniforms = () => ({
      uView: { value: new THREE.Vector4() },
      uCh: { value: v3arr(MAX_CHARGES) },
      uNCh: { value: 0 },
      uK: { value: 1000 },
      uEps2: { value: 9 },
      uPlR: { value: v4arr(MAX_PLATES) },
      uPlE: { value: v2arr(MAX_PLATES) },
      uNPl: { value: 0 },
      uMiA: { value: v4arr(MAX_MIRROR) },
      uMiB: { value: v2arr(MAX_MIRROR) },
      uNMi: { value: 0 },
    });

    this.fieldMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: fieldFrag,
      uniforms: {
        ...fieldUniforms(),
        uTime: { value: 0 },
        uWorldPerPx: { value: new THREE.Vector2(1, 1) },
        uPhiScale: { value: 1 },
        uEScale: { value: 1 },
        uBScale: { value: 1 },
        uShowPot: { value: 1 },
        uShowFlow: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.fieldScene.add(new THREE.Mesh(quad, this.fieldMat));

    this.compMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: compositeFrag,
      uniforms: {
        uField: { value: this.fieldRT.texture },
        uView: this.fieldMat.uniforms.uView,
        uRes: { value: new THREE.Vector2(1, 1) },
        uWorldPerPx: { value: 1 },
        uCh: this.fieldMat.uniforms.uCh,
        uNCh: this.fieldMat.uniforms.uNCh,
        uPlR: this.fieldMat.uniforms.uPlR,
        uPlE: this.fieldMat.uniforms.uPlE,
        uNPl: this.fieldMat.uniforms.uNPl,
        uBR: { value: v4arr(MAX_BREG) },
        uBz: { value: new Array(MAX_BREG).fill(0) },
        uNB: { value: 0 },
        uMiA: this.fieldMat.uniforms.uMiA,
        uNMi: this.fieldMat.uniforms.uNMi,
        uBRef: { value: 1 },
        uShowB: { value: 1 },
        uGrid: { value: 1 },
        uTime: this.fieldMat.uniforms.uTime,
      },
      depthTest: false,
      depthWrite: false,
    });
    const compMesh = new THREE.Mesh(quad, this.compMat);
    compMesh.frustumCulled = false;
    compMesh.renderOrder = 0;
    this.scene.add(compMesh);

    this.fadeMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: fadeFrag,
      uniforms: { uPrev: { value: this.trailA.texture }, uFade: { value: 0.95 } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    this.fadeScene.add(new THREE.Mesh(quad, this.fadeMat));

    this.trailQuadMat = new THREE.ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: copyFrag,
      uniforms: { uTex: { value: this.trailB.texture }, uGain: { value: 1 } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    const trailMesh = new THREE.Mesh(quad, this.trailQuadMat);
    trailMesh.frustumCulled = false;
    trailMesh.renderOrder = 1;
    this.scene.add(trailMesh);

    // instanced trail segments
    this.segGeo = new THREE.InstancedBufferGeometry();
    this.segGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.segGeo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), 2));
    this.segGeo.setIndex([0, 1, 2, 2, 1, 3]);
    this.segAttr = new THREE.InstancedBufferAttribute(new Float32Array(4), 4);
    this.segCol = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
    this.segMat = new THREE.ShaderMaterial({
      vertexShader: trailVert,
      fragmentShader: trailFrag,
      uniforms: { uHalfWidth: { value: 1 }, uMaxLen: { value: 200 }, uGain: { value: 0.55 } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    const segMesh = new THREE.Mesh(this.segGeo, this.segMat);
    segMesh.frustumCulled = false;
    this.segScene.add(segMesh);

    // glow points
    this.pointGeo = new THREE.BufferGeometry();
    this.pointPos = new THREE.BufferAttribute(new Float32Array(3), 3);
    this.pointCol = new THREE.BufferAttribute(new Float32Array(3), 3);
    this.pointSize = new THREE.BufferAttribute(new Float32Array(1), 1);
    this.pointMat = new THREE.ShaderMaterial({
      vertexShader: pointVert,
      fragmentShader: pointFrag,
      uniforms: { uScale: { value: 1 }, uGlow: { value: 0.9 } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    this.points = new THREE.Points(this.pointGeo, this.pointMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.scene.add(this.points);
    this.ensureCap(4096);

    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({
      mipmapBlur: true,
      intensity: 1.1,
      luminanceThreshold: 0.32,
      luminanceSmoothing: 0.3,
      radius: 0.72,
    });
    this.composer.addPass(new EffectPass(this.camera, this.bloom, new VignetteEffect({ darkness: 0.45, offset: 0.3 })));
  }

  private ensureCap(n: number) {
    if (n <= this.cap) return;
    let cap = Math.max(this.cap, 1024);
    while (cap < n) cap *= 2;
    this.cap = cap;
    this.segAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.segAttr.setUsage(THREE.DynamicDrawUsage);
    this.segCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.segCol.setUsage(THREE.DynamicDrawUsage);
    this.segGeo.setAttribute('aSeg', this.segAttr);
    this.segGeo.setAttribute('aCol', this.segCol);
    this.pointPos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3);
    this.pointPos.setUsage(THREE.DynamicDrawUsage);
    this.pointCol = new THREE.BufferAttribute(new Float32Array(cap * 3), 3);
    this.pointCol.setUsage(THREE.DynamicDrawUsage);
    this.pointSize = new THREE.BufferAttribute(new Float32Array(cap), 1);
    this.pointSize.setUsage(THREE.DynamicDrawUsage);
    this.pointGeo.setAttribute('position', this.pointPos);
    this.pointGeo.setAttribute('aCol', this.pointCol);
    this.pointGeo.setAttribute('aSize', this.pointSize);
  }

  resize(cssW: number, cssH: number, view: Bounds) {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    // post-processing is fill-rate bound: cap at 1.5x, and scale down further when the frame rate drops
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5) * this.quality;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.cssW, this.cssH, false);
    this.composer.setSize(this.cssW, this.cssH, false);
    // half-res field (relative to css px), css-res trails
    this.fieldRT.setSize(Math.ceil(this.cssW * 0.5), Math.ceil(this.cssH * 0.5));
    const tw = Math.ceil(this.cssW * Math.min(this.dpr, 1.5));
    const th = Math.ceil(this.cssH * Math.min(this.dpr, 1.5));
    this.trailA.setSize(tw, th);
    this.trailB.setSize(tw, th);
    this.setView(view);
    this.clearTrails = true;
  }

  setView(view: Bounds) {
    this.view = { ...view };
    const c = this.camera;
    c.left = view.x0;
    c.right = view.x1;
    c.bottom = view.y0;
    c.top = view.y1;
    c.updateProjectionMatrix();
    const u = this.fieldMat.uniforms;
    u.uView.value.set(view.x0, view.y0, view.x1, view.y1);
    const wpp = (view.x1 - view.x0) / this.cssW;
    u.uWorldPerPx.value.set(wpp * 2, wpp * 2);
    this.compMat.uniforms.uRes.value.set(this.cssW, this.cssH);
    this.compMat.uniforms.uWorldPerPx.value = wpp;
    this.segMat.uniforms.uHalfWidth.value = wpp * 0.9;
    this.segMat.uniforms.uMaxLen.value = (view.x1 - view.x0) * 0.25;
    this.pointMat.uniforms.uScale.value = this.dpr * Math.min(1.4, Math.max(0.7, 1 / wpp));
  }

  setSources(objects: FieldObject[], params: SimParams, scales: { phi: number; e: number; b: number }) {
    const u = this.fieldMat.uniforms;
    let nc = 0, np = 0, nm = 0, nb = 0;
    const bR = this.compMat.uniforms.uBR.value as THREE.Vector4[];
    const bZ = this.compMat.uniforms.uBz.value as number[];
    let bmax = 0;
    for (const o of objects) {
      if (o.kind === 'charge' && nc < MAX_CHARGES) (u.uCh.value as THREE.Vector3[])[nc++].set(o.x, o.y, o.q);
      else if (o.kind === 'plates' && np < MAX_PLATES) {
        (u.uPlR.value as THREE.Vector4[])[np].set(Math.min(o.x0, o.x1), Math.min(o.y0, o.y1), Math.max(o.x0, o.x1), Math.max(o.y0, o.y1));
        (u.uPlE.value as THREE.Vector2[])[np++].set(o.ex, o.ey);
      } else if (o.kind === 'mirror' && nm < MAX_MIRROR) {
        (u.uMiA.value as THREE.Vector4[])[nm].set(o.x, o.y, o.L, o.H);
        (u.uMiB.value as THREE.Vector2[])[nm++].set(o.b0, o.ratio);
        bmax = Math.max(bmax, o.b0 * o.ratio);
      } else if (o.kind === 'bfield' && nb < MAX_BREG) {
        if (o.infinite) bR[nb].set(-1e9, -1e9, 1e9, 1e9);
        else bR[nb].set(Math.min(o.x0, o.x1), Math.min(o.y0, o.y1), Math.max(o.x0, o.x1), Math.max(o.y0, o.y1));
        bZ[nb++] = o.bz;
        bmax = Math.max(bmax, Math.abs(o.bz));
      }
    }
    u.uNCh.value = nc;
    u.uNPl.value = np;
    u.uNMi.value = nm;
    this.compMat.uniforms.uNB.value = nb;
    this.compMat.uniforms.uBRef.value = Math.max(bmax, 1e-6);
    u.uK.value = params.kCoulomb;
    u.uEps2.value = params.chargeSoftening * params.chargeSoftening;
    u.uPhiScale.value = Math.max(scales.phi, 1e-6);
    u.uEScale.value = Math.max(scales.e, 1e-9);
    u.uBScale.value = Math.max(scales.b, 1e-9);
  }

  /** Upload a worker frame. */
  setParticles(n: number, pos: Float32Array, seg: Float32Array, sp: Uint8Array) {
    this.ensureCap(n);
    const pp = this.pointPos.array as Float32Array;
    const pc = this.pointCol.array as Float32Array;
    const ps = this.pointSize.array as Float32Array;
    const sa = this.segAttr.array as Float32Array;
    const sc = this.segCol.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const s = sp[i];
      const c = SPECIES_RGB[s];
      pp[i * 3] = pos[i * 2];
      pp[i * 3 + 1] = pos[i * 2 + 1];
      pp[i * 3 + 2] = 0;
      pc[i * 3] = c[0];
      pc[i * 3 + 1] = c[1];
      pc[i * 3 + 2] = c[2];
      ps[i] = 9 * SPECIES[s].size;
      sc[i * 3] = c[0];
      sc[i * 3 + 1] = c[1];
      sc[i * 3 + 2] = c[2];
    }
    sa.set(seg.subarray(0, n * 4));
    this.pointPos.needsUpdate = true;
    this.pointCol.needsUpdate = true;
    this.pointSize.needsUpdate = true;
    this.segAttr.needsUpdate = true;
    this.segCol.needsUpdate = true;
    this.pointGeo.setDrawRange(0, n);
    // keep dense beams from saturating to white
    this.segMat.uniforms.uGain.value = 0.6 * Math.min(1, Math.max(0.2, Math.sqrt(250 / Math.max(n, 1))));
    this.pointMat.uniforms.uGlow.value = 0.9 * Math.min(1, Math.max(0.45, Math.sqrt(800 / Math.max(n, 1))));
    this.segCount = n;
    this.newSegments = true;
  }

  resetTrails() {
    this.clearTrails = true;
    this.trailResetAt = 0;
  }

  /** Hide trails now and clear them once no further call arrives for 150 ms. */
  deferTrailReset() {
    this.trailResetAt = performance.now() + 150;
  }

  setQuality(q: number) {
    if (q === this.quality) return;
    this.quality = q;
    this.resize(this.cssW, this.cssH, this.view);
  }

  render(dtReal: number, t: RenderToggles) {
    const r = this.renderer;
    this.time += dtReal;
    const fu = this.fieldMat.uniforms;
    fu.uTime.value = this.time;
    fu.uShowPot.value = t.potential ? 1 : 0;
    fu.uShowFlow.value = t.flow ? 1 : 0;
    this.compMat.uniforms.uShowB.value = t.bField ? 1 : 0;
    this.compMat.uniforms.uGrid.value = t.grid ? 1 : 0;
    this.bloom.intensity = t.bloom;

    // 1. field
    r.setRenderTarget(this.fieldRT);
    r.render(this.fieldScene, this.quadCam);

    // 2. trails
    const moving = this.trailResetAt > 0;
    if (moving && performance.now() > this.trailResetAt) {
      this.clearTrails = true;
      this.trailResetAt = 0;
    }
    if (this.clearTrails) {
      for (const rt of [this.trailA, this.trailB]) {
        r.setRenderTarget(rt);
        r.setClearColor(0x000000, 1);
        r.clear();
      }
      r.setClearColor(0x03040a, 1);
      this.clearTrails = false;
    }
    if (t.trails) {
      this.fadeMat.uniforms.uPrev.value = this.trailA.texture;
      this.fadeMat.uniforms.uFade.value = Math.exp(-dtReal / Math.max(0.05, t.trailTau));
      r.setRenderTarget(this.trailB);
      r.render(this.fadeScene, this.quadCam);
      if (this.newSegments && this.segCount > 0) {
        this.segGeo.instanceCount = this.segCount;
        const ac = r.autoClear;
        r.autoClear = false;
        r.render(this.segScene, this.camera);
        r.autoClear = ac;
      }
      // swap
      const tmp = this.trailA;
      this.trailA = this.trailB;
      this.trailB = tmp;
      this.trailQuadMat.uniforms.uTex.value = this.trailA.texture;
      this.trailQuadMat.uniforms.uGain.value = moving ? 0 : 1;
    } else {
      this.trailQuadMat.uniforms.uGain.value = 0;
    }
    this.newSegments = false;
    r.setRenderTarget(null);

    // 3. main
    this.composer.render(dtReal);
  }

  dispose() {
    this.composer.dispose();
    this.fieldRT.dispose();
    this.trailA.dispose();
    this.trailB.dispose();
    this.renderer.dispose();
  }
}
