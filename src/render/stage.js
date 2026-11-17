// Studio: Renderer, Licht, Hohlkehle mit Raster, Drehteller, Kamera.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

export class Stage {
  constructor(container) {
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#8f9091');
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.38;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60);
    this.camera.position.set(0, 1.15, 4.4);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 0.35; this.controls.maxDistance = 9;
    this.controls.maxPolarAngle = Math.PI * 0.58;

    this.addLights();
    this.addStudio();
    this.slot = new THREE.Group();
    this.turntable.add(this.slot);
    this.clock = new THREE.Clock();
    this.onFrame = null;
    this.spin = false;
    window.addEventListener('resize', () => this.resize());
    this.resize();
    r.setAnimationLoop(() => this.frame());
  }

  addLights() {
    const key = new THREE.DirectionalLight('#fff4e8', 3.1);
    key.position.set(2.2, 4.2, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1.5; key.shadow.camera.right = 1.5; key.shadow.camera.top = 2.4; key.shadow.camera.bottom = -0.5;
    key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#e8f0ff', 0.45);
    fill.position.set(-3, 2.2, 2.5);
    this.scene.add(fill);
    const rim = new THREE.SpotLight('#ffffff', 22, 12, 0.5, 0.6);
    rim.position.set(-1.5, 3.2, -3.5); rim.target.position.set(0, 1.1, 0);
    this.scene.add(rim, rim.target);
    this.scene.add(new THREE.HemisphereLight('#f4f1ec', '#55524e', 0.25));
  }

  addStudio() {
    // Hohlkehle mit Rasterlinien wie im Scan-Studio
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d');
    g.fillStyle = '#8d8e8f'; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(60,60,60,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 1024; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), mat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.scene.add(floor);
    const wallMat = mat.clone(); wallMat.map = t.clone(); wallMat.map.repeat.set(6, 2);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(24, 8), wallMat);
    wall.position.set(0, 4, -5); wall.receiveShadow = true;
    this.scene.add(wall);

    // Drehteller mit Markierungen
    const disk = document.createElement('canvas'); disk.width = disk.height = 512;
    const d = disk.getContext('2d');
    d.fillStyle = '#5b5c5e'; d.beginPath(); d.arc(256, 256, 256, 0, Math.PI * 2); d.fill();
    d.fillStyle = '#e8e8e8'; d.font = '600 30px system-ui, sans-serif'; d.textAlign = 'center'; d.textBaseline = 'middle';
    [['12', 0], ['3', 90], ['6', 180], ['9', 270]].forEach(([s, deg]) => {
      const a = (deg * Math.PI) / 180; d.save(); d.translate(256 + Math.sin(a) * 215, 256 + Math.cos(a) * 215); d.rotate(-a); d.fillText(s, 0, 0); d.restore();
    });
    const dt = new THREE.CanvasTexture(disk); dt.colorSpace = THREE.SRGBColorSpace;
    const tt = (this.turntable = new THREE.Group());
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 96), [
      new THREE.MeshStandardMaterial({ color: '#4d4e50', roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ map: dt, roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: '#4d4e50' }),
    ]);
    top.position.y = 0.025; top.receiveShadow = true; top.castShadow = true;
    tt.add(top);
    this.slotOffset = 0.05;
    this.scene.add(tt);
  }

  setFigure(obj) {
    this.slot.clear();
    if (obj) { obj.position.y += this.slotOffset; this.slot.add(obj); }
  }

  frameFigure(heightM) {
    this.controls.target.set(0, heightM * 0.55, 0);
    this.camera.position.set(0, heightM * 0.62, heightM * 2.65);
    this.controls.update();
  }

  focus(part, heightM) {
    const views = {
      full: [0, 0.55, 2.65, 0.55], face: [0, 0.93, 0.62, 0.93], torso: [0, 0.72, 1.25, 0.68],
      legs: [0, 0.3, 1.5, 0.3], side: [2.65, 0.55, 0.01, 0.55], back: [0, 0.55, -2.65, 0.55],
    }[part] || [0, 0.55, 2.65, 0.55];
    this.controls.target.set(0, heightM * views[3], 0);
    this.camera.position.set(heightM * views[0], heightM * views[1], heightM * views[2]);
    this.controls.update();
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;
    if (this.spin) this.turntable.rotation.y += dt * 0.35;
    this.onFrame?.(t, dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  screenshot() { return this.renderer.domElement.toDataURL('image/png'); }
}
