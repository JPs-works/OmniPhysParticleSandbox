import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import { sampleOrbital } from './orbital';

const vert = /* glsl */ `
attribute float aSign;
uniform float uSize;
uniform float uScale;
varying float vSign;
varying float vDepth;
void main() {
  vSign = aSign;
  vec4 mv = modelViewMatrix * vec4(position * uScale, 1.0);
  vDepth = -mv.z;
  gl_PointSize = uSize / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const frag = /* glsl */ `
varying float vSign;
varying float vDepth;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  vec3 pos = vec3(1.0, 0.55, 0.22);
  vec3 neg = vec3(0.25, 0.65, 1.0);
  vec3 col = vSign > 0.0 ? pos : neg;
  float a = exp(-d * 3.0) * 0.16;
  gl_FragColor = vec4(col * a, 1.0);
}
`;

export function OrbitalView({ n, l, m, playing }: { n: number; l: number; m: number; playing: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const api = useRef<{ setOrbital: (n: number, l: number, m: number) => void; playing: boolean } | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const canvas = document.createElement('canvas');
    canvas.className = 'absolute inset-0 h-full w-full';
    el.appendChild(canvas);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false });
    } catch {
      el.textContent = 'WebGL2 is not available.';
      return;
    }
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x03040a, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const group = new THREE.Group();
    group.rotation.x = 0.45;
    scene.add(group);
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uSize: { value: 40 }, uScale: { value: 1 } },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    group.add(pts);
    // nucleus + axes
    const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.6) }));
    group.add(nucleus);
    const axes = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 0, 0), new THREE.Vector3(4, 0, 0), new THREE.Vector3(0, -4, 0), new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, 0, -4), new THREE.Vector3(0, 0, 4)]),
      new THREE.LineBasicMaterial({ color: 0x1e293b }),
    );
    group.add(axes);

    const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, new BloomEffect({ mipmapBlur: true, intensity: 1.2, luminanceThreshold: 0.15, radius: 0.6 })));

    let fitScale = 1;
    const setOrbital = (nn: number, ll: number, mm: number) => {
      const N = 60000;
      const { pos, sign, rMax } = sampleOrbital(nn, ll, mm, N);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aSign', new THREE.BufferAttribute(sign, 1));
      geo.setDrawRange(0, sign.length);
      // fit: 95th percentile radius -> ~3.4 world units
      const rs = new Float32Array(sign.length);
      for (let i = 0; i < sign.length; i++) rs[i] = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      rs.sort();
      const r95 = rs[Math.floor(rs.length * 0.95)] || rMax;
      fitScale = 3.4 / r95;
      mat.uniforms.uScale.value = fitScale;
      mat.uniforms.uSize.value = 34 + 10 * nn;
      axes.scale.setScalar(1);
    };
    api.current = { setOrbital, playing: true };

    const resize = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, r.width), h = Math.max(1, r.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      composer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = w < h ? 10 * Math.max(1, (h / w) * 0.85) : 10;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // drag to rotate
    let dragging = false, lx = 0, ly = 0, vx = 0.12, vy = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      group.rotation.y += dx * 0.008;
      group.rotation.x += dy * 0.008;
      vx = dx * 0.4;
      vy = dy * 0.4;
    };
    const up = () => {
      dragging = false;
    };
    // let the host page scroll vertically over the view; horizontal drags rotate
    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!dragging && api.current?.playing) {
        group.rotation.y += dt * (0.25 + vx * 0.1);
        vx *= 0.95;
        vy *= 0.95;
      }
      composer.render(dt);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      composer.dispose();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      canvas.remove();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.setOrbital(n, l, m);
  }, [n, l, m]);
  useEffect(() => {
    if (api.current) api.current.playing = playing;
  }, [playing]);

  return <div ref={wrap} className="relative h-full w-full" data-testid="orbital-view" />;
}
