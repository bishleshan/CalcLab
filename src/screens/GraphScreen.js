// src/screens/GraphScreen.js
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Dimensions, Platform, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Line, Text as SvgText, Circle, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import * as math from 'mathjs';
import { COLORS } from '../constants/theme';
import { normalizeExpression } from '../engine/MobileSolver';

const { width: SW } = Dimensions.get('window');
const GRAPH_H = 340;
const GRAPH_W = SW - 32;

// ─── Math helpers ────────────────────────────────────────────
function compileExpression(expr) {
  try {
    return math.compile(normalizeExpression(expr));
  } catch { return null; }
}

function evalCompiled(compiled, scope) {
  if (!compiled) return null;
  try {
    const result = Number(compiled.evaluate(scope));
    return Number.isFinite(result) ? result : null;
  } catch { return null; }
}

function evalFn(expr, x) {
  return evalCompiled(compileExpression(expr), { x });
}

function derivativeNumericalCompiled(compiled, x, h = 1e-5) {
  const fp = evalCompiled(compiled, { x: x + h });
  const fm = evalCompiled(compiled, { x: x - h });
  if (fp === null || fm === null) return null;
  return (fp - fm) / (2 * h);
}

function derivativeNumerical(expr, x, h = 1e-5) {
  return derivativeNumericalCompiled(compileExpression(expr), x, h);
}

function buildPoints(expr, xMin, xMax, N = 240) {
  const pts = [];
  const compiled = compileExpression(expr);
  for (let i = 0; i <= N; i++) {
    const x = xMin + (i / N) * (xMax - xMin);
    const y = evalCompiled(compiled, { x });
    pts.push({ x, y });
  }
  return pts;
}

function buildDerivPoints(expr, xMin, xMax, N = 240) {
  const pts = [];
  const compiled = compileExpression(expr);
  for (let i = 0; i <= N; i++) {
    const x = xMin + (i / N) * (xMax - xMin);
    const y = derivativeNumericalCompiled(compiled, x);
    pts.push({ x, y });
  }
  return pts;
}

function buildIntegralPoints(expr, xMin, xMax, N = 240) {
  const pts = [];
  const compiled = compileExpression(expr);
  let cumSum = 0;
  const dx = (xMax - xMin) / N;
  for (let i = 0; i <= N; i++) {
    const x = xMin + (i / N) * (xMax - xMin);
    const y = evalCompiled(compiled, { x });
    if (y !== null) cumSum += y * dx;
    pts.push({ x, y: cumSum });
  }
  return pts;
}

// ─── Screen→Math coordinate mapping ─────────────────────────
function toScreen(pts, xMin, xMax, yMin, yMax, W, H) {
  return pts.map(({ x, y }) => {
    if (y === null) return null;
    const sx = ((x - xMin) / (xMax - xMin)) * W;
    const sy = H - ((y - yMin) / (yMax - yMin)) * H;
    return { sx, sy };
  });
}

function pointsToPath(screenPts) {
  let d = '';
  let pen = false;
  for (let i = 0; i < screenPts.length; i++) {
    const p = screenPts[i];
    if (!p || !isFinite(p.sx) || !isFinite(p.sy) || p.sy < -120 || p.sy > GRAPH_H + 120) {
      pen = false;
      continue;
    }
    if (!pen) { d += `M ${p.sx.toFixed(1)} ${p.sy.toFixed(1)} `; pen = true; }
    else d += `L ${p.sx.toFixed(1)} ${p.sy.toFixed(1)} `;
  }
  return d;
}

function integralAreaPath(screenPts, zeroY, W) {
  const valid = screenPts.filter(p => p && isFinite(p.sx) && isFinite(p.sy));
  if (valid.length < 2) return '';
  const clampY = Math.min(Math.max(zeroY, 0), GRAPH_H);
  let d = `M ${valid[0].sx.toFixed(1)} ${clampY.toFixed(1)} `;
  for (const p of valid) d += `L ${p.sx.toFixed(1)} ${Math.min(Math.max(p.sy, 0), GRAPH_H).toFixed(1)} `;
  d += `L ${valid[valid.length - 1].sx.toFixed(1)} ${clampY.toFixed(1)} Z`;
  return d;
}

function gridTicks(min, max, count = 6) {
  const range = max - min;
  const rawStep = range / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  let step = magnitude;
  if (rawStep / magnitude >= 5) step = 5 * magnitude;
  else if (rawStep / magnitude >= 2) step = 2 * magnitude;

  const ticks = [];
  const start = Math.ceil(min / step) * step;
  for (let t = start; t <= max + 1e-9; t += step) {
    ticks.push(parseFloat(t.toFixed(4)));
    if (ticks.length > 18) break;
  }
  return ticks;
}

function toSafe3dExpression(expr) {
  const fallback = 'sin(sqrt(x^2 + y^2))';
  const compact = normalizeExpression(expr || fallback).toLowerCase().replace(/\s+/g, '');
  const names = compact.match(/[a-z]+/g) || [];
  const allowedNames = new Set(['x', 'y', 'sin', 'cos', 'tan', 'sqrt', 'abs', 'log', 'exp', 'pi', 'e']);
  const allowedChars = /^[0-9a-z+\-*/^().,]+$/;
  const source = allowedChars.test(compact) && names.every(name => allowedNames.has(name)) ? compact : fallback;

  function mapToJs(value) {
    const mapped = value
      .replace(/\bsin\b/g, 'Math.sin')
      .replace(/\bcos\b/g, 'Math.cos')
      .replace(/\btan\b/g, 'Math.tan')
      .replace(/\bsqrt\b/g, 'Math.sqrt')
      .replace(/\babs\b/g, 'Math.abs')
      .replace(/\blog\b/g, 'Math.log')
      .replace(/\bexp\b/g, 'Math.exp')
      .replace(/\bpi\b/g, 'Math.PI')
      .replace(/\be\b/g, 'Math.E');

    return mapped.replace(
      /(Math\.(?:sin|cos|tan|sqrt|abs|log|exp)\([^()]*\)|Math\.PI|Math\.E|\b[xy]\b|\d+(?:\.\d+)?)\^([+-]?\d+(?:\.\d+)?|Math\.PI|Math\.E|\b[xy]\b)/g,
      'Math.pow($1,$2)'
    );
  }

  const js = mapToJs(source);
  if (js.includes('^')) return mapToJs(fallback);
  return js;
}

function hapticSelect() {
  Haptics.selectionAsync().catch(() => {});
}

// ─── 3D Surface Template with Topographic Contours, Elevation Legend & Z-Ruler ───
function build3dHtml(expr, colorScheme = 'cyan') {
  const safeExpr = toSafe3dExpression(expr);
  const label = JSON.stringify(`z = ${normalizeExpression(expr || 'sin(sqrt(x^2 + y^2))')}`.slice(0, 72));

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#020617; overflow:hidden; touch-action:none; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  canvas { display:block; width:100vw; height:100vh; }
  
  #hud-top {
    position:absolute; top:124px; left:14px; right:14px; display:flex; justify-content:space-between; align-items:center;
    pointer-events:none; z-index:10;
  }
  .hud-badge {
    background:rgba(8,16,36,0.92); border:1px solid rgba(125,211,252,0.3); border-radius:8px;
    padding:6px 12px; font-size:11px; color:#7dd3fc; font-weight:700; backdrop-filter:blur(12px);
    box-shadow:0 4px 14px rgba(0,0,0,0.5); pointer-events:auto;
  }
  .axis-legend {
    display:flex; gap:10px; align-items:center; background:rgba(8,16,36,0.92);
    border:1px solid rgba(255,255,255,0.14); border-radius:8px; padding:6px 12px;
    font-size:10px; color:#fff; pointer-events:auto; box-shadow:0 4px 14px rgba(0,0,0,0.5);
  }
  .axis-tag { display:flex; align-items:center; gap:4px; font-weight:800; }
  .dot-x { width:9px; height:9px; border-radius:4.5px; background:#00f5ff; box-shadow:0 0 6px #00f5ff; }
  .dot-y { width:9px; height:9px; border-radius:4.5px; background:#ff2d78; box-shadow:0 0 6px #ff2d78; }
  .dot-z { width:9px; height:9px; border-radius:4.5px; background:#a855f7; box-shadow:0 0 6px #a855f7; }

  /* Floating Elevation Scale Bar on the side */
  #elevation-bar {
    position:absolute; top:175px; right:14px; background:rgba(8,16,36,0.92);
    border:1px solid rgba(125,211,252,0.28); border-radius:10px; padding:8px 7px;
    display:flex; flex-direction:column; align-items:center; backdrop-filter:blur(14px);
    box-shadow:0 4px 18px rgba(0,0,0,0.6); pointer-events:auto; user-select:none; z-index:10;
  }
  .elev-title { font-size:8px; font-weight:800; letter-spacing:1px; color:#c084fc; margin-bottom:4px; }
  .elev-val { font-size:9px; font-weight:700; color:rgba(255,255,255,0.9); font-family:monospace; }
  .elev-gradient-wrap {
    position:relative; width:12px; height:85px; margin:4px 0; border-radius:4px; overflow:hidden;
    border:1px solid rgba(255,255,255,0.25); box-shadow:inset 0 0 4px rgba(0,0,0,0.5);
  }
  .elev-bar { width:100%; height:100%; }
  
  #controls-overlay {
    position:absolute; bottom:82px; right:14px; display:flex; flex-direction:column; gap:8px; pointer-events:auto; z-index:10;
  }
  .ctrl-btn {
    width:38px; height:38px; border-radius:10px; background:rgba(8,18,40,0.94);
    border:1px solid rgba(125,211,252,0.35); color:#fff; font-size:18px; font-weight:800;
    display:flex; align-items:center; justify-content:center; cursor:pointer;
    box-shadow:0 4px 16px rgba(0,0,0,0.6); user-select:none;
  }
  .ctrl-btn:active { background:rgba(56,189,248,0.35); transform:scale(0.94); }
  
  #view-snap-row {
    position:absolute; bottom:82px; left:14px; display:flex; gap:6px; flex-wrap:wrap; max-width:calc(100vw - 80px); pointer-events:auto; z-index:10;
  }
  .snap-btn {
    background:rgba(8,18,40,0.92); border:1px solid rgba(255,255,255,0.18);
    border-radius:8px; padding:6px 10px; font-size:10px; color:rgba(255,255,255,0.9);
    font-weight:700; cursor:pointer; user-select:none; box-shadow:0 4px 14px rgba(0,0,0,0.5);
  }
  .snap-btn:active { background:rgba(56,189,248,0.3); color:#7dd3fc; }
  .snap-btn.active { border-color:#38bdf8; color:#38bdf8; background:rgba(56,189,248,0.18); }
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
<div id="hud-top">
  <div class="hud-badge" id="angle-hud">3D Iso · 45°</div>
  <div class="axis-legend">
    <div class="axis-tag"><span class="dot-x"></span>X</div>
    <div class="axis-tag"><span class="dot-y"></span>Y</div>
    <div class="axis-tag"><span class="dot-z"></span>Z (Height)</div>
  </div>
</div>

<div id="elevation-bar">
  <div class="elev-title">Z SCALE</div>
  <div class="elev-val" id="elev-max">+1.0</div>
  <div class="elev-gradient-wrap">
    <div class="elev-bar" id="elev-grad"></div>
  </div>
  <div class="elev-val" id="elev-mid">0.0</div>
  <div class="elev-val" id="elev-min">-1.0</div>
</div>

<div id="view-snap-row">
  <button class="snap-btn active" id="btn-iso" onclick="snapView('iso')">3D Iso</button>
  <button class="snap-btn" id="btn-top" onclick="snapView('top')">Top (X-Y)</button>
  <button class="snap-btn" id="btn-front" onclick="snapView('front')">Front (X-Z)</button>
  <button class="snap-btn" id="btn-side" onclick="snapView('side')">Side (Y-Z)</button>
  <button class="snap-btn active" id="btn-colormode" onclick="cycleColorMode()">Solid ◼</button>
  <button class="snap-btn active" id="btn-surface" onclick="cycleSurfaceStyle()">Faceted ◆</button>
  <button class="snap-btn active" id="btn-grid" onclick="cycleGrid()">Grid 50%</button>
  <button class="snap-btn" id="btn-relief" onclick="cycleRelief()">Depth 1.4×</button>
  <button class="snap-btn active" id="btn-spin" onclick="toggleSpin()">Auto ↻</button>
</div>

<div id="controls-overlay">
  <button class="ctrl-btn" onclick="adjustZoom(0.82)" title="Zoom In">+</button>
  <button class="ctrl-btn" onclick="adjustZoom(1.22)" title="Zoom Out">−</button>
  <button class="ctrl-btn" onclick="resetAll()" title="Reset View">⟲</button>
</div>

<script>
const angleHud = document.getElementById('angle-hud');
let autoRotate = true;
let showContours = true;
const reliefLevels = [1.0, 1.4, 2.0];
let reliefIdx = 1;
let reliefFactor = reliefLevels[reliefIdx];

function fExpr(x, y) {
  try {
    const v = Number(${safeExpr});
    return Number.isFinite(v) ? Math.max(-3.5, Math.min(3.5, v)) : 0;
  } catch(e) { return 0; }
}

const activeScheme = ${JSON.stringify(colorScheme)};

// ─── Initialize Three.js matching Graph3D.js ───────────────────
const scene = new THREE.Scene();
const W = window.innerWidth, H = window.innerHeight;
const camera = new THREE.PerspectiveCamera(48, W / H, 0.1, 100);
camera.position.set(4.0, 3.2, 4.0);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x020617, 1);
document.body.appendChild(renderer.domElement);

// OrbitControls with Damping
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// ─── Dynamic View-Dependent & Multi-Angle Lighting System ────────
// 1. Camera-mounted Eye-Light (shifts specular glints and reflections dynamically as you rotate!)
const camLight = new THREE.DirectionalLight(0xffffff, 1.2);
camLight.position.set(0, 2, 4);
camera.add(camLight);
scene.add(camera);

// 2. East flank reflects Electric Cyan
const lightEast = new THREE.DirectionalLight(0x00f5ff, 2.2);
lightEast.position.set(7, 3.5, 5);
scene.add(lightEast);

// 3. West flank reflects Hot Magenta Pink (opposite angle has contrasting sheen!)
const lightWest = new THREE.DirectionalLight(0xff2d78, 1.8);
lightWest.position.set(-7, 3.5, -5);
scene.add(lightWest);

// 4. North flank reflects Deep Purple Rim
const lightNorth = new THREE.DirectionalLight(0xa855f7, 1.3);
lightNorth.position.set(0, 5, -7);
scene.add(lightNorth);

// 5. Deep Ambient base
scene.add(new THREE.AmbientLight(0x081528, 0.45));

// 6. Orbiting Cyan Key PointLight
const pl1 = new THREE.PointLight(0x00f5ff, 1.4, 20);
pl1.position.set(4, 4.5, 4);
scene.add(pl1);

// GridHelper
const grid = new THREE.GridHelper(8, 28, 0x002838, 0x001420);
grid.material.transparent = true;
grid.material.opacity = 0.5;
grid.position.y = -2.2;
scene.add(grid);

// 3D Sprite Label Generator
function makeLabel(text, pos, color, parent = scene, scaleW = 0.65, scaleH = 0.32) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 40;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 48, 26);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85 });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(...pos);
  sprite.scale.set(scaleW, scaleH, 1);
  parent.add(sprite);
  return sprite;
}

const lblX = makeLabel('X', [4.5, 0, 0], '#00f5ff');
const lblY = makeLabel('Y', [0, 0, 4.5], '#ff2d78');
// Position Z label at corner pillar rather than blocking center
const lblZ = makeLabel('Z (Height)', [0, 3.4, 0], '#a855f7');

// Solid 3D Coordinate Axis Lines
const axGeoX = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4,0,0), new THREE.Vector3(4,0,0)]);
const axGeoY = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,-4), new THREE.Vector3(0,0,4)]);
const axGeoZ = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-2.2,0), new THREE.Vector3(0,3.2,0)]);
const axLineX = new THREE.Line(axGeoX, new THREE.LineBasicMaterial({ color: 0x00f5ff, opacity: 0.6, transparent: true }));
const axLineY = new THREE.Line(axGeoY, new THREE.LineBasicMaterial({ color: 0xff2d78, opacity: 0.6, transparent: true }));
const axLineZ = new THREE.Line(axGeoZ, new THREE.LineBasicMaterial({ color: 0xa855f7, opacity: 0.6, transparent: true }));
scene.add(axLineX);
scene.add(axLineY);
scene.add(axLineZ);

// ─── 3D Graduated Vertical Height Ruler (Corner Pillar) ────────
const cornerPillar = new THREE.Group();
scene.add(cornerPillar);

const pillarGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-3.4, -2.2, -3.4),
  new THREE.Vector3(-3.4, 2.6, -3.4)
]);
cornerPillar.add(new THREE.Line(pillarGeo, new THREE.LineBasicMaterial({ color: 0xa855f7, opacity: 0.8, transparent: true })));

[-2, -1, 0, 1, 2].forEach(zv => {
  const tickGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-3.4, zv, -3.4),
    new THREE.Vector3(-3.1, zv, -3.4)
  ]);
  cornerPillar.add(new THREE.Line(tickGeo, new THREE.LineBasicMaterial({ color: 0xa855f7, opacity: 0.6, transparent: true })));
  makeLabel((zv > 0 ? '+' : '') + zv, [-2.6, zv, -3.4], '#c084fc', cornerPillar, 0.45, 0.22);
});

// 250 Glowing Space Particles
const pGeo = new THREE.BufferGeometry();
const pPos = [], pCol = [];
for (let i = 0; i < 250; i++) {
  pPos.push((Math.random() - 0.5) * 11, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 11);
  const c = Math.random() > 0.5 ? [0, 0.96, 1] : Math.random() > 0.5 ? [1, 0.18, 0.47] : [0.66, 0.33, 0.97];
  pCol.push(...c);
}
pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.Float32BufferAttribute(pCol, 3));
const pMat = new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.55 });
scene.add(new THREE.Points(pGeo, pMat));

// ─── 5-Stop Saturated Scientific & Cosmic Colormaps ───────────
function lerp(a, b, u) { return a + (b - a) * u; }
function lerp3(c1, c2, u) {
  return [lerp(c1[0], c2[0], u), lerp(c1[1], c2[1], u), lerp(c1[2], c2[2], u)];
}
function sampleStops(stops, u) {
  for (let i = 0; i < stops.length - 1; i++) {
    if (u >= stops[i].t && u <= stops[i + 1].t) {
      const frac = (u - stops[i].t) / (stops[i + 1].t - stops[i].t);
      return lerp3(stops[i].c, stops[i + 1].c, frac);
    }
  }
  return stops[stops.length - 1].c;
}

function getBaseColor(scheme, u) {
  if (scheme === 'sunset') {
    return sampleStops([
      { t: 0.00, c: [0.12, 0.02, 0.16] }, // deep midnight plum
      { t: 0.25, c: [0.70, 0.08, 0.65] }, // electric magenta
      { t: 0.50, c: [0.96, 0.22, 0.32] }, // vivid coral
      { t: 0.75, c: [1.00, 0.62, 0.12] }, // neon amber gold
      { t: 1.00, c: [1.00, 0.96, 0.65] }, // glowing sunburst crest
    ], u);
  } else if (scheme === 'emerald') {
    return sampleStops([
      { t: 0.00, c: [0.01, 0.12, 0.16] }, // deep abyss teal
      { t: 0.25, c: [0.03, 0.42, 0.36] }, // seafoam
      { t: 0.50, c: [0.06, 0.85, 0.45] }, // vibrant emerald
      { t: 0.75, c: [0.65, 0.98, 0.22] }, // radioactive lime
      { t: 1.00, c: [0.90, 1.00, 0.85] }, // luminous mint white
    ], u);
  } else if (scheme === 'ceramic') {
    return sampleStops([
      { t: 0.00, c: [0.08, 0.10, 0.16] }, // dark obsidian
      { t: 0.25, c: [0.26, 0.32, 0.42] }, // graphite steel
      { t: 0.50, c: [0.55, 0.62, 0.72] }, // satin chrome
      { t: 0.75, c: [0.82, 0.86, 0.92] }, // platinum
      { t: 1.00, c: [1.00, 1.00, 1.00] }, // pure white
    ], u);
  } else {
    // Electric Cyan & Ocean Wave Depths (Balanced Saturated)
    return sampleStops([
      { t: 0.00, c: [0.02, 0.06, 0.24] }, // deep midnight abyss
      { t: 0.25, c: [0.06, 0.28, 0.82] }, // royal sapphire
      { t: 0.50, c: [0.00, 0.82, 0.98] }, // electric cyan
      { t: 0.75, c: [0.22, 0.95, 0.82] }, // aquamarine
      { t: 1.00, c: [0.88, 0.98, 1.00] }, // glowing crest
    ], u);
  }
}

// ─── Dual-Mesh Mathematical Surface Group ───────────────────
const surfGrp = new THREE.Group();
scene.add(surfGrp);

const NS = 64; // High resolution for silky circular wave ripples
const cnt = (NS + 1) * (NS + 1);
const pos = new Float32Array(cnt * 3);
const colors = new Float32Array(cnt * 3);
const idx = [];

const heights = [];
let zMin = Infinity, zMax = -Infinity;
for (let i = 0; i <= NS; i++) {
  const row = [];
  for (let j = 0; j <= NS; j++) {
    const x = (i / NS - 0.5) * 6;
    const y = (j / NS - 0.5) * 6;
    const z = fExpr(x, y);
    row.push(z);
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  heights.push(row);
}
const zRange = zMax - zMin || 1;

for (let i = 0; i < NS; i++) {
  for (let j = 0; j < NS; j++) {
    const a = i * (NS + 1) + j, b = a + 1, c = (i + 1) * (NS + 1) + j, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
}

const surfGeo = new THREE.BufferGeometry();
surfGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
surfGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
surfGeo.setIndex(idx);

function getSolidHex(scheme) {
  if (scheme === 'sunset') return 0xd91448; // Solid Crimson Ruby
  if (scheme === 'emerald') return 0x059669; // Solid Deep Emerald
  if (scheme === 'chrome') return 0x334155; // Solid Titanium Chrome
  if (scheme === 'ceramic') return 0xe2e8f0; // Solid Studio White
  return 0x0284c7; // Solid Electric Cyan
}

// SOLID MESH PHYSICAL MATERIAL with Lacquer Clearcoat for Dynamic Multi-Angle Reflections
const surfMat = new THREE.MeshPhysicalMaterial({
  color: getSolidHex(activeScheme),
  roughness: activeScheme === 'chrome' ? 0.08 : 0.18,
  metalness: activeScheme === 'chrome' ? 0.85 : 0.32,
  clearcoat: 1.0,
  clearcoatRoughness: 0.08,
  reflectivity: 0.95,
  side: THREE.DoubleSide,
  flatShading: true, // Physical faceted surface definition!
});

// GLOWING GEOMETRIC COORDINATE WIREFRAME OVERLAY
const wireMat = new THREE.MeshBasicMaterial({
  color: activeScheme === 'sunset' ? 0xff3b82 : activeScheme === 'emerald' ? 0x10b981 : 0x00f5ff,
  wireframe: true,
  transparent: true,
  opacity: 0.48, // Crisp glowing geometric coordinate grid lines!
});

surfGrp.add(new THREE.Mesh(surfGeo, surfMat));
surfGrp.add(new THREE.Mesh(surfGeo, wireMat));

// Update Elevation Gradient Bar in HTML
const elevGrad = document.getElementById('elev-grad');
if (elevGrad) {
  if (activeScheme === 'sunset') {
    elevGrad.style.background = 'linear-gradient(to bottom, #fef08a, #fb923c, #f43f5e, #c026d3, #1e0524)';
  } else if (activeScheme === 'emerald') {
    elevGrad.style.background = 'linear-gradient(to bottom, #a7f3d0, #34d399, #10b981, #047857, #022c22)';
  } else if (activeScheme === 'ceramic') {
    elevGrad.style.background = 'linear-gradient(to bottom, #ffffff, #cbd5e1, #94a3b8, #475569, #0f172a)';
  } else if (activeScheme === 'chrome') {
    elevGrad.style.background = 'linear-gradient(to bottom, #f8fafc, #94a3b8, #475569, #1e293b, #020617)';
  } else {
    elevGrad.style.background = 'linear-gradient(to bottom, #e0faff, #00d4ff, #0077ff, #1040c0, #030a24)';
  }
}

let colorMode = 'solid'; // 'solid' by default as requested!

function rebuildMesh() {
  if (colorMode === 'solid') {
    surfMat.vertexColors = false;
    surfMat.color.setHex(getSolidHex(activeScheme));
    surfMat.roughness = activeScheme === 'chrome' ? 0.08 : 0.18;
    surfMat.metalness = activeScheme === 'chrome' ? 0.85 : 0.32;
    surfMat.needsUpdate = true;
  } else {
    surfMat.vertexColors = true;
    surfMat.color.setHex(0xffffff);
    surfMat.roughness = 0.25;
    surfMat.metalness = 0.2;
    surfMat.needsUpdate = true;
  }

  let v = 0;
  for (let i = 0; i <= NS; i++) {
    for (let j = 0; j <= NS; j++) {
      const x = (i / NS - 0.5) * 6;
      const zVal = heights[i][j];
      const y = (j / NS - 0.5) * 6;
      pos[v] = x;
      pos[v + 1] = zVal * reliefFactor;
      pos[v + 2] = y;

      if (colorMode !== 'solid') {
        const t = Math.max(0, Math.min(1, (zVal - zMin) / zRange));
        if (colorMode === 'stepped') {
          // 7 discrete solid color tiers
          const numTiers = 7;
          const tier = Math.min(numTiers - 1, Math.floor(t * numTiers));
          const tierT = (tier + 0.5) / numTiers;
          const tierCol = getBaseColor(activeScheme, tierT);
          colors[v]     = tierCol[0];
          colors[v + 1] = tierCol[1];
          colors[v + 2] = tierCol[2];
        } else {
          const baseCol = getBaseColor(activeScheme, t);
          colors[v]     = baseCol[0];
          colors[v + 1] = baseCol[1];
          colors[v + 2] = baseCol[2];
        }
      }

      v += 3;
    }
  }

  surfGeo.attributes.position.needsUpdate = true;
  if (colorMode !== 'solid') {
    surfGeo.attributes.color.needsUpdate = true;
  }
  surfGeo.computeVertexNormals();

  // Update Elevation Scale readout
  const elevMax = document.getElementById('elev-max');
  const elevMid = document.getElementById('elev-mid');
  const elevMin = document.getElementById('elev-min');
  if (elevMax) elevMax.textContent = (zMax >= 0 ? '+' : '') + zMax.toFixed(1);
  if (elevMid) elevMid.textContent = ((zMax + zMin) / 2).toFixed(1);
  if (elevMin) elevMin.textContent = (zMin >= 0 ? '+' : '') + zMin.toFixed(1);
}

rebuildMesh();

// ─── Interaction & Camera Controls ───────────────────────────
function updateAngleHud() {
  const theta = Math.round(((controls.getAzimuthalAngle() * 180 / Math.PI) + 360) % 360);
  const phi = Math.round((controls.getPolarAngle() * 180 / Math.PI));
  let viewName = '3D Angle';
  if (phi < 18) viewName = 'Top View (X-Y) · Topographic';
  else if (Math.abs(phi - 90) < 12) viewName = 'Elevation Profile (Side)';
  else viewName = '3D Iso';
  angleHud.textContent = viewName + ' · ' + theta + '°';
}

window.adjustZoom = function(factor) {
  camera.position.multiplyScalar(factor);
  controls.update();
  updateAngleHud();
};

window.resetAll = function() {
  snapView('iso');
};

window.toggleSpin = function() {
  autoRotate = !autoRotate;
  document.getElementById('btn-spin').classList.toggle('active', autoRotate);
};

const colorModes = ['solid', 'stepped', 'gradient'];
const colorModeLabels = {
  'solid': 'Solid ◼',
  'stepped': 'Stepped ▦',
  'gradient': 'Gradient ☲'
};

window.cycleColorMode = function() {
  const nextIdx = (colorModes.indexOf(colorMode) + 1) % colorModes.length;
  colorMode = colorModes[nextIdx];
  document.getElementById('btn-colormode').textContent = colorModeLabels[colorMode];
  rebuildMesh();
};

let isFaceted = true;
window.cycleSurfaceStyle = function() {
  isFaceted = !isFaceted;
  surfMat.flatShading = isFaceted;
  surfMat.needsUpdate = true;
  document.getElementById('btn-surface').textContent = isFaceted ? 'Faceted ◆' : 'Smooth ~';
  document.getElementById('btn-surface').classList.toggle('active', isFaceted);
};

const gridLevels = [0.48, 0.85, 0.0];
const gridLabels = ['Grid 50%', 'Grid 85%', 'Grid Off'];
let gridIdx = 0;
window.cycleGrid = function() {
  gridIdx = (gridIdx + 1) % gridLevels.length;
  wireMat.opacity = gridLevels[gridIdx];
  wireMat.visible = gridLevels[gridIdx] > 0.01;
  wireMat.needsUpdate = true;
  document.getElementById('btn-grid').textContent = gridLabels[gridIdx];
  document.getElementById('btn-grid').classList.toggle('active', gridLevels[gridIdx] > 0.01);
};

window.cycleRelief = function() {
  reliefIdx = (reliefIdx + 1) % reliefLevels.length;
  reliefFactor = reliefLevels[reliefIdx];
  document.getElementById('btn-relief').textContent = 'Depth ' + reliefFactor.toFixed(1) + '×';
  rebuildMesh();
};

function updateButtonStates(view) {
  document.getElementById('btn-iso').classList.toggle('active', view === 'iso');
  document.getElementById('btn-top').classList.toggle('active', view === 'top');
  document.getElementById('btn-front').classList.toggle('active', view === 'front');
  document.getElementById('btn-side').classList.toggle('active', view === 'side');
}

window.snapView = function(view) {
  if (view === 'top') {
    camera.position.set(0.001, 7.5, 0.001);
    lblZ.visible = false;
    axLineZ.visible = false;
    cornerPillar.visible = false;
  } else if (view === 'front') {
    camera.position.set(0, 1.8, 6.8);
    lblZ.visible = true;
    axLineZ.visible = true;
    cornerPillar.visible = true;
  } else if (view === 'side') {
    camera.position.set(6.8, 1.8, 0);
    lblZ.visible = true;
    axLineZ.visible = true;
    cornerPillar.visible = true;
  } else {
    camera.position.set(4.0, 3.2, 4.0);
    lblZ.visible = true;
    axLineZ.visible = true;
    cornerPillar.visible = true;
  }
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
  updateButtonStates(view);
  updateAngleHud();
};

controls.addEventListener('start', () => { autoRotate = false; document.getElementById('btn-spin').classList.remove('active'); });
controls.addEventListener('change', updateAngleHud);

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// ─── Render Animation Loop matching Graph3D.js from Web App ───
let animTime = 0;
function animate() {
  requestAnimationFrame(animate);
  animTime += 0.016;

  if (autoRotate) {
    surfGrp.rotation.y += 0.003;
    updateAngleHud();
  }

  // Floating bobbing motion & rotating light from Graph3D.js
  surfGrp.position.y = Math.sin(animTime * 0.5) * 0.08;
  pl1.position.x = Math.cos(animTime * 0.3) * 5;
  pl1.position.z = Math.sin(animTime * 0.3) * 5;

  controls.update();
  renderer.render(scene, camera);
}
animate();
updateAngleHud();
</script>
</body>
</html>`;
}

// ─── 2D SVG Graph with Independent 2D Zoom & High-Contrast Axes ───
function Graph2D({ expr, showDeriv, showIntegral, xMin, xMax, yMin, yMax, traceX }) {
  const W = GRAPH_W, H = GRAPH_H;

  const fPts = useMemo(() => buildPoints(expr, xMin, xMax), [expr, xMin, xMax]);
  const dPts = useMemo(() => showDeriv ? buildDerivPoints(expr, xMin, xMax) : [], [expr, showDeriv, xMin, xMax]);
  const iPts = useMemo(() => showIntegral ? buildIntegralPoints(expr, xMin, xMax) : [], [expr, showIntegral, xMin, xMax]);

  const toSP = pts => toScreen(pts, xMin, xMax, yMin, yMax, W, H);
  const fScreen = toSP(fPts);
  const dScreen = toSP(dPts);
  const iScreen = toSP(iPts);

  const yZeroScreen = H - ((0 - yMin) / (yMax - yMin)) * H;
  const xZeroScreen = ((0 - xMin) / (xMax - xMin)) * W;

  const xTicks = gridTicks(xMin, xMax, 6);
  const yTicks = gridTicks(yMin, yMax, 6);
  const hasCurve = fScreen.some(p => p && isFinite(p.sx) && isFinite(p.sy));

  // Crosshair & Tangent at traceX
  const trace = (() => {
    if (traceX === null || traceX === undefined) return null;
    const y = evalFn(expr, traceX);
    const slope = derivativeNumerical(expr, traceX);
    if (y === null) return null;
    const sx = ((traceX - xMin) / (xMax - xMin)) * W;
    const sy = H - ((y - yMin) / (yMax - yMin)) * H;
    if (!isFinite(sx) || !isFinite(sy) || sx < 0 || sx > W || sy < -50 || sy > H + 50) return null;

    let tangentPath = null;
    if (slope !== null && isFinite(slope)) {
      const deltaX = (xMax - xMin) * 0.15;
      const x1 = traceX - deltaX, y1 = y - slope * deltaX;
      const x2 = traceX + deltaX, y2 = y + slope * deltaX;
      const sx1 = ((x1 - xMin) / (xMax - xMin)) * W;
      const sy1 = H - ((y1 - yMin) / (yMax - yMin)) * H;
      const sx2 = ((x2 - xMin) / (xMax - xMin)) * W;
      const sy2 = H - ((y2 - yMin) / (yMax - yMin)) * H;
      tangentPath = { sx1, sy1, sx2, sy2 };
    }

    return { x: traceX, y, sx, sy: Math.min(Math.max(sy, 0), H), slope, tangentPath };
  })();

  return (
    <Svg width={W} height={H} style={s2.svg}>
      <Defs>
        <LinearGradient id="intGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#34d399" stopOpacity="0.4" />
          <Stop offset="1" stopColor="#34d399" stopOpacity="0.04" />
        </LinearGradient>
      </Defs>

      {/* Grid Lines */}
      {xTicks.map(t => {
        const sx = ((t - xMin) / (xMax - xMin)) * W;
        return <Line key={`xg-${t}`} x1={sx} y1={0} x2={sx} y2={H}
          stroke="rgba(125,211,252,0.08)" strokeWidth={1} />;
      })}
      {yTicks.map(t => {
        const sy = H - ((t - yMin) / (yMax - yMin)) * H;
        return <Line key={`yg-${t}`} x1={0} y1={sy} x2={W} y2={sy}
          stroke="rgba(125,211,252,0.08)" strokeWidth={1} />;
      })}

      {/* SOLID X-AXIS (Sky Blue) */}
      {yZeroScreen >= 0 && yZeroScreen <= H && (
        <>
          <Line x1={0} y1={yZeroScreen} x2={W} y2={yZeroScreen} stroke="#38bdf8" strokeWidth={2.0} />
          <Rect x={W - 26} y={Math.max(yZeroScreen - 18, 4)} width={22} height={15} rx={3} fill="rgba(56,189,248,0.25)" />
          <SvgText x={W - 15} y={Math.max(yZeroScreen - 7, 15)} fill="#38bdf8" fontSize={10} fontWeight="bold" textAnchor="middle">+X</SvgText>
        </>
      )}

      {/* SOLID Y-AXIS (Emerald Green) */}
      {xZeroScreen >= 0 && xZeroScreen <= W && (
        <>
          <Line x1={xZeroScreen} y1={0} x2={xZeroScreen} y2={H} stroke="#34d399" strokeWidth={2.0} />
          <Rect x={Math.min(xZeroScreen + 5, W - 26)} y={4} width={22} height={15} rx={3} fill="rgba(52,211,153,0.25)" />
          <SvgText x={Math.min(xZeroScreen + 16, W - 15)} y={15} fill="#34d399" fontSize={10} fontWeight="bold" textAnchor="middle">+Y</SvgText>
        </>
      )}

      {/* Origin Marker (0,0) */}
      {xZeroScreen >= 0 && xZeroScreen <= W && yZeroScreen >= 0 && yZeroScreen <= H && (
        <Circle cx={xZeroScreen} cy={yZeroScreen} r={4} fill="#ffffff" stroke="#38bdf8" strokeWidth={2} />
      )}

      {/* Numerical Ticks */}
      {xTicks.map(t => {
        const sx = ((t - xMin) / (xMax - xMin)) * W;
        if (sx < 20 || sx > W - 24) return null;
        const labelY = yZeroScreen >= 0 && yZeroScreen <= H - 20 ? yZeroScreen + 14 : H - 4;
        return (
          <SvgText key={`xl-${t}`} x={sx} y={labelY} fill="rgba(125,211,252,0.7)" fontSize={9} textAnchor="middle">
            {t}
          </SvgText>
        );
      })}
      {yTicks.map(t => {
        const sy = H - ((t - yMin) / (yMax - yMin)) * H;
        if (sy < 14 || sy > H - 10) return null;
        const labelX = xZeroScreen >= 10 && xZeroScreen <= W - 40 ? xZeroScreen + 6 : 6;
        return (
          <SvgText key={`yl-${t}`} x={labelX} y={sy + 3} fill="rgba(52,211,153,0.75)" fontSize={9}>
            {parseFloat(t.toFixed(2))}
          </SvgText>
        );
      })}

      {/* Area Under Curve Fill */}
      {showIntegral && iScreen.length > 0 && (
        <Path d={integralAreaPath(iScreen, yZeroScreen, W)} fill="url(#intGrad)" />
      )}

      {/* Integral Curve */}
      {showIntegral && (
        <Path d={pointsToPath(iScreen)} stroke="#34d399" strokeWidth={2.0} fill="none" strokeOpacity={0.85} />
      )}

      {/* Derivative Curve (Rose) */}
      {showDeriv && (
        <Path d={pointsToPath(dScreen)} stroke="#f472b6" strokeWidth={2.2} fill="none" />
      )}

      {/* Main Function Curve (Sky Blue Solid) */}
      <Path d={pointsToPath(fScreen)} stroke="#38bdf8" strokeWidth={2.8} fill="none" />

      {/* Dynamic Tangent Line at Trace Point */}
      {trace && trace.tangentPath && (
        <Line
          x1={trace.tangentPath.sx1} y1={trace.tangentPath.sy1}
          x2={trace.tangentPath.sx2} y2={trace.tangentPath.sy2}
          stroke="#f59e0b" strokeWidth={2.0} strokeDasharray="5 3"
        />
      )}

      {/* Interactive Cursor & Crosshairs */}
      {trace && (
        <>
          <Line x1={trace.sx} y1={0} x2={trace.sx} y2={H} stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="3 3" />
          <Line x1={0} y1={trace.sy} x2={W} y2={trace.sy} stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="3 3" />
          <Circle cx={trace.sx} cy={trace.sy} r={6.5} fill="#ffffff" />
          <Circle cx={trace.sx} cy={trace.sy} r={11} fill="none" stroke="#38bdf8" strokeWidth={2} />
        </>
      )}

      {!hasCurve && (
        <SvgText x={W / 2} y={H / 2} fill="rgba(255,255,255,0.5)" fontSize={12} textAnchor="middle">
          Enter a valid mathematical function to plot
        </SvgText>
      )}
    </Svg>
  );
}

// ─── Main Screen Component ───────────────────────────────────
export default function GraphScreen({ route }) {
  const [mode, setMode] = useState(route?.params?.initialMode || '2d');
  const [expr2d, setExpr2d] = useState('sin(x)');
  const [expr3d, setExpr3d] = useState('sin(sqrt(x^2 + y^2))');
  const [showDeriv, setShowDeriv] = useState(true);
  const [showIntegral, setShowIntegral] = useState(true);

  // Independent 2D Coordinate Bounds (Enables TRUE 2D Magnification & Zoom)
  const [xMin, setXMin] = useState(-6);
  const [xMax, setXMax] = useState(6);
  const [yMin, setYMin] = useState(-4);
  const [yMax, setYMax] = useState(4);

  const [inputVal, setInputVal] = useState('sin(x)');
  const [input3dVal, setInput3dVal] = useState('sin(sqrt(x^2 + y^2))');
  const [colorScheme3d, setColorScheme3d] = useState('cyan');
  const [webviewKey, setWebviewKey] = useState(0);
  const [traceX, setTraceX] = useState(0);

  // Gesture Pinch & Pan State for 2D Graph
  const lastPinchDist = useRef(null);
  const panStart = useRef({ x: 0, y: 0 });
  const boundsAtStart = useRef({ xMin: -6, xMax: 6, yMin: -4, yMax: 4 });

  useEffect(() => {
    const prefill = route?.params?.prefill;
    if (prefill) {
      setMode('2d');
      setInputVal(prefill);
      setExpr2d(prefill);
      setTraceX(0);
      autoFitBounds(prefill, -6, 6);
    }
    if (route?.params?.initialMode) {
      setMode(route?.params?.initialMode);
    }
  }, [route?.params]);

  function autoFitBounds(fnExpr, currentXMin, currentXMax) {
    const pts = buildPoints(fnExpr, currentXMin, currentXMax);
    const validY = pts.map(p => p.y).filter(y => y !== null && isFinite(y));
    if (validY.length) {
      const rawMin = Math.min(...validY);
      const rawMax = Math.max(...validY);
      const pad = (rawMax - rawMin) * 0.18 || 1;
      setYMin(parseFloat((rawMin - pad).toFixed(2)));
      setYMax(parseFloat((rawMax + pad).toFixed(2)));
    }
  }

  function apply2d() {
    hapticSelect();
    setExpr2d(inputVal);
    setTraceX(0);
    autoFitBounds(inputVal, xMin, xMax);
  }

  function apply3d() {
    hapticSelect();
    setExpr3d(input3dVal);
    setWebviewKey(k => k + 1);
  }

  // TRUE 2D ZOOM: Zooms BOTH X and Y axes simultaneously for real magnification!
  function zoom2D(factor) {
    hapticSelect();
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const halfX = ((xMax - xMin) / 2) * factor;
    const halfY = ((yMax - yMin) / 2) * factor;
    setXMin(parseFloat((cx - halfX).toFixed(3)));
    setXMax(parseFloat((cx + halfX).toFixed(3)));
    setYMin(parseFloat((cy - halfY).toFixed(3)));
    setYMax(parseFloat((cy + halfY).toFixed(3)));
  }

  function setRangePreset(xRange, yRange) {
    hapticSelect();
    setXMin(-xRange);
    setXMax(xRange);
    setYMin(-yRange);
    setYMax(yRange);
    setTraceX(0);
  }

  // PanResponder for smooth 2D Touch, Pan & Pinch Zoom
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      if (evt.nativeEvent.touches.length === 1) {
        const touchX = evt.nativeEvent.locationX;
        const x = xMin + (touchX / GRAPH_W) * (xMax - xMin);
        setTraceX(parseFloat(x.toFixed(3)));
        panStart.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        boundsAtStart.current = { xMin, xMax, yMin, yMax };
      }
      lastPinchDist.current = null;
    },
    onPanResponderMove: (evt, gestureState) => {
      // Two-Finger Pinch Zoom on 2D Graph
      if (evt.nativeEvent.touches.length === 2) {
        const t1 = evt.nativeEvent.touches[0];
        const t2 = evt.nativeEvent.touches[1];
        const dist = Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
        if (lastPinchDist.current) {
          const ratio = lastPinchDist.current / dist;
          if (ratio > 0.85 && ratio < 1.18) {
            const cx = (xMin + xMax) / 2;
            const cy = (yMin + yMax) / 2;
            const halfX = ((xMax - xMin) / 2) * ratio;
            const halfY = ((yMax - yMin) / 2) * ratio;
            setXMin(parseFloat((cx - halfX).toFixed(3)));
            setXMax(parseFloat((cx + halfX).toFixed(3)));
            setYMin(parseFloat((cy - halfY).toFixed(3)));
            setYMax(parseFloat((cy + halfY).toFixed(3)));
          }
        }
        lastPinchDist.current = dist;
      }
      // Single-Finger Drag & Pan along X and Y
      else if (evt.nativeEvent.touches.length === 1) {
        const touchX = Math.min(Math.max(evt.nativeEvent.locationX, 0), GRAPH_W);
        const x = xMin + (touchX / GRAPH_W) * (xMax - xMin);
        setTraceX(parseFloat(x.toFixed(3)));

        if (Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10) {
          const shiftFractionX = (gestureState.dx / GRAPH_W) * 0.45;
          const shiftFractionY = (gestureState.dy / GRAPH_H) * 0.45;
          const rangeX = boundsAtStart.current.xMax - boundsAtStart.current.xMin;
          const rangeY = boundsAtStart.current.yMax - boundsAtStart.current.yMin;
          setXMin(parseFloat((boundsAtStart.current.xMin - shiftFractionX * rangeX).toFixed(3)));
          setXMax(parseFloat((boundsAtStart.current.xMax - shiftFractionX * rangeX).toFixed(3)));
          setYMin(parseFloat((boundsAtStart.current.yMin + shiftFractionY * rangeY).toFixed(3)));
          setYMax(parseFloat((boundsAtStart.current.yMax + shiftFractionY * rangeY).toFixed(3)));
        }
      }
    },
    onPanResponderRelease: () => {
      lastPinchDist.current = null;
    },
  }), [xMin, xMax, yMin, yMax]);

  const traceY = evalFn(expr2d, traceX);
  const traceSlope = derivativeNumerical(expr2d, traceX);

  const mathKeys2d = ['x', '^2', '^', 'sin(', 'cos(', 'tan(', 'sqrt(', 'log(', 'exp(', 'pi', '+', '-', '*', '/'];
  const mathKeys3d = ['x', 'y', '^2', '^', 'sin(', 'cos(', 'sqrt(', 'pi', '+', '-', '*', '/'];

  return (
    <SafeAreaView style={gs.safe} edges={['top']}>
      {/* Visual Mode Selector: 2D vs 3D */}
      <View style={gs.modeBar}>
        <TouchableOpacity
          style={[gs.modeBtn, mode === '2d' && gs.modeBtnActive]}
          onPress={() => { hapticSelect(); setMode('2d'); }}
          accessibilityRole="button"
          accessibilityLabel="Show 2D function graph"
        >
          <Ionicons name="pulse-outline" size={16} color={mode === '2d' ? COLORS.primary : COLORS.textDim} />
          <Text style={[gs.modeBtnText, mode === '2d' && { color: COLORS.primary }]}>2D Function &amp; Tangent</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[gs.modeBtn, mode === '3d' && gs.modeBtnActive]}
          onPress={() => { hapticSelect(); setMode('3d'); }}
          accessibilityRole="button"
          accessibilityLabel="Show 3D multivariable surface"
        >
          <Ionicons name="cube-outline" size={16} color={mode === '3d' ? COLORS.primary : COLORS.textDim} />
          <Text style={[gs.modeBtnText, mode === '3d' && { color: COLORS.primary }]}>3D Three.js Surface</Text>
        </TouchableOpacity>
      </View>

      {/* ── 2D VISUAL MODE ── */}
      {mode === '2d' && (
        <ScrollView style={gs.scroll} showsVerticalScrollIndicator={false}>
          {/* Function Input Bar */}
          <View style={gs.inputRow}>
            <Text style={gs.fnLabel}>f(x) =</Text>
            <TextInput
              style={gs.fnInput}
              value={inputVal}
              onChangeText={setInputVal}
              onSubmitEditing={apply2d}
              autoCapitalize="none" autoCorrect={false}
              returnKeyType="done"
              placeholderTextColor={COLORS.textFaint}
            />
            <TouchableOpacity style={gs.applyBtn} onPress={apply2d} accessibilityRole="button">
              <Text style={gs.applyBtnText}>Plot</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Math Keyboard */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={gs.keyScroll}>
            {mathKeys2d.map(k => (
              <TouchableOpacity
                key={k}
                style={gs.mathKey}
                onPress={() => { hapticSelect(); setInputVal(v => v + k); }}
              >
                <Text style={gs.mathKeyText}>{k}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 2D Canvas Container with Gesture PanResponder */}
          <View style={gs.graphWrap} {...panResponder.panHandlers}>
            <Graph2D
              expr={expr2d}
              showDeriv={showDeriv}
              showIntegral={showIntegral}
              xMin={xMin}
              xMax={xMax}
              yMin={yMin}
              yMax={yMax}
              traceX={traceX}
            />
          </View>

          {/* Real-time Point & Tangent Readout Card */}
          <View style={gs.traceCard}>
            <View style={gs.traceCardHeader}>
              <View style={gs.traceTag}>
                <Ionicons name="locate-outline" size={14} color="#38bdf8" />
                <Text style={gs.traceTagText}>ACTIVE POINT &amp; TANGENT</Text>
              </View>
              <Text style={gs.traceHintText}>Drag graph to trace point</Text>
            </View>

            <View style={gs.traceMetricsRow}>
              <View style={gs.traceMetricBox}>
                <Text style={gs.traceMetricLabel}>X-COORDINATE</Text>
                <Text style={[gs.traceMetricValue, { color: '#38bdf8' }]}>{traceX.toFixed(3)}</Text>
              </View>

              <View style={gs.traceMetricBox}>
                <Text style={gs.traceMetricLabel}>HEIGHT f(X)</Text>
                <Text style={[gs.traceMetricValue, { color: '#34d399' }]}>
                  {traceY === null ? 'undefined' : traceY.toFixed(3)}
                </Text>
              </View>

              <View style={gs.traceMetricBox}>
                <Text style={gs.traceMetricLabel}>SLOPE f'(X)</Text>
                <Text style={[gs.traceMetricValue, { color: '#f59e0b' }]}>
                  {traceSlope === null ? 'undefined' : traceSlope.toFixed(3)}
                </Text>
              </View>
            </View>
          </View>

          {/* TRUE 2D ZOOM & FIT CONTROLS */}
          <View style={gs.zoomRow}>
            <TouchableOpacity style={gs.zoomBtn} onPress={() => zoom2D(1.4)} accessibilityRole="button">
              <Ionicons name="remove-circle-outline" size={16} color={COLORS.primary} />
              <Text style={gs.zoomBtnText}>Zoom Out</Text>
            </TouchableOpacity>

            <TouchableOpacity style={gs.zoomBtn} onPress={() => setRangePreset(6, 4)} accessibilityRole="button">
              <Ionicons name="reload" size={14} color={COLORS.textDim} />
              <Text style={gs.zoomBtnText}>Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity style={gs.zoomBtn} onPress={() => autoFitBounds(expr2d, xMin, xMax)} accessibilityRole="button">
              <Ionicons name="scan-outline" size={14} color="#34d399" />
              <Text style={[gs.zoomBtnText, { color: '#34d399' }]}>Auto-Fit</Text>
            </TouchableOpacity>

            <TouchableOpacity style={gs.zoomBtn} onPress={() => zoom2D(0.65)} accessibilityRole="button">
              <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
              <Text style={gs.zoomBtnText}>Zoom In</Text>
            </TouchableOpacity>
          </View>

          {/* Quick 2D Range Presets */}
          <View style={gs.rangePresetsRow}>
            <Text style={gs.rangePresetsLabel}>ZOOM PRESETS:</Text>
            {[
              { label: 'Deep Zoom (±1.5)', x: 1.5, y: 1.5 },
              { label: 'Standard (±6)', x: 6, y: 4 },
              { label: 'Wide (±15)', x: 15, y: 12 },
              { label: 'Trig (±2π)', x: 6.28, y: 2.2 },
            ].map(r => (
              <TouchableOpacity
                key={r.label}
                style={[gs.rangeChip, Math.abs(xMax - r.x) < 0.2 && gs.rangeChipActive]}
                onPress={() => setRangePreset(r.x, r.y)}
              >
                <Text style={[gs.rangeChipText, Math.abs(xMax - r.x) < 0.2 && { color: COLORS.primary }]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Curve Toggle Controls */}
          <View style={gs.toggleRow}>
            <Text style={gs.toggleTitle}>LAYERS:</Text>
            {[
              { key: 'fx', label: "f(x) Function", color: '#38bdf8', state: true, fixed: true },
              { key: 'deriv', label: "f'(x) Derivative", color: '#f472b6', state: showDeriv, toggle: () => setShowDeriv(v => !v) },
              { key: 'integ', label: "∫f dx Area", color: '#34d399', state: showIntegral, toggle: () => setShowIntegral(v => !v) },
            ].map(item => (
              <TouchableOpacity
                key={item.key}
                style={[gs.toggleChip, { borderColor: item.color, backgroundColor: item.state ? `${item.color}20` : 'transparent' }]}
                onPress={() => { hapticSelect(); item.toggle?.(); }}
                disabled={item.fixed}
              >
                <View style={[gs.toggleDot, { backgroundColor: item.state ? item.color : 'transparent', borderColor: item.color }]} />
                <Text style={[gs.toggleLabel, { color: item.state ? item.color : COLORS.textDim }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Function Presets */}
          <Text style={gs.presetsLabel}>STUDY FUNCTIONS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={gs.presetsScroll}>
            {[
              { label: 'sin(x)', fn: 'sin(x)' },
              { label: 'x³ - 3x', fn: 'x^3 - 3*x' },
              { label: 'e^(-x²)', fn: 'exp(-x^2)' },
              { label: 'x² - 4', fn: 'x^2 - 4' },
              { label: '1 / (1 + x²)', fn: '1 / (1 + x^2)' },
              { label: 'x * sin(x)', fn: 'x * sin(x)' },
            ].map(p => (
              <TouchableOpacity
                key={p.fn}
                style={gs.presetChip}
                onPress={() => {
                  hapticSelect();
                  setInputVal(p.fn);
                  setExpr2d(p.fn);
                  setTraceX(0);
                  autoFitBounds(p.fn, xMin, xMax);
                }}
              >
                <Text style={gs.presetLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ height: 48 }} />
        </ScrollView>
      )}

      {/* ── 3D SOLID SURFACE MODE (Three.js with OrbitControls, Lights & Particles) ── */}
      {mode === '3d' && (
        <View style={gs.fullBleed3dContainer}>
          {/* Full Screen Three.js Canvas */}
          <View style={StyleSheet.absoluteFill}>
            {Platform.OS === 'web' ? (
              <iframe
                key={`${webviewKey}-${colorScheme3d}`}
                srcDoc={build3dHtml(expr3d, colorScheme3d)}
                style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#020617' }}
                title="3D Solid Surface"
              />
            ) : (
              <WebView
                key={`${webviewKey}-${colorScheme3d}`}
                originWhitelist={['*']}
                source={{ html: build3dHtml(expr3d, colorScheme3d) }}
                style={gs.webviewFull}
                scrollEnabled={false}
                bounces={false}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
              />
            )}
          </View>

          {/* Floating Top Glass Bar (Formula Input & Solid Colormaps) */}
          <View style={gs.floatingGlassTop}>
            <View style={gs.inputRowGlass}>
              <Text style={gs.fnLabelGlass}>z = f(x,y)</Text>
              <TextInput
                style={gs.fnInputGlass}
                value={input3dVal}
                onChangeText={setInput3dVal}
                onSubmitEditing={apply3d}
                autoCapitalize="none" autoCorrect={false}
                returnKeyType="done"
                placeholderTextColor={COLORS.textFaint}
              />
              <TouchableOpacity style={gs.applyBtnGlass} onPress={apply3d}>
                <Text style={gs.applyBtnTextGlass}>Plot</Text>
              </TouchableOpacity>
            </View>

            {/* Solid Color Palettes */}
            <View style={gs.colormapRow}>
              <Text style={gs.colormapLabel}>SOLID THEME:</Text>
              {[
                { id: 'cyan', label: 'Electric Cyan' },
                { id: 'sunset', label: 'Sunset Magma' },
                { id: 'emerald', label: 'Cyber Emerald' },
                { id: 'chrome', label: 'Liquid Chrome' },
                { id: 'ceramic', label: 'Studio White' },
              ].map(cm => (
                <TouchableOpacity
                  key={cm.id}
                  style={[gs.colormapChip, colorScheme3d === cm.id && gs.colormapChipActive]}
                  onPress={() => { hapticSelect(); setColorScheme3d(cm.id); }}
                >
                  <Text style={[gs.colormapChipText, colorScheme3d === cm.id && { color: COLORS.primary }]}>
                    {cm.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Floating Bottom Bar with Canonical 3D Surfaces */}
          <View style={gs.floatingGlassBottom}>
            <Text style={gs.presetHeaderGlass}>CANONICAL 3D SURFACES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={gs.presetsScrollGlass}>
              {[
                { label: 'Ripple Wave', fn: 'sin(sqrt(x^2 + y^2))' },
                { label: 'Hyperbolic Saddle', fn: 'x^2 - y^2' },
                { label: 'Paraboloid Bowl', fn: 'x^2 + y^2' },
                { label: 'Gaussian Bell', fn: 'exp(-(x^2 + y^2))' },
                { label: 'Trig Eggcrate', fn: 'sin(x) * cos(y)' },
                { label: 'Monkey Saddle', fn: 'x^3 - 3*x*y^2' },
              ].map(p => (
                <TouchableOpacity
                  key={p.fn}
                  style={gs.presetChipGlass}
                  onPress={() => { hapticSelect(); setInput3dVal(p.fn); setExpr3d(p.fn); setWebviewKey(k => k + 1); }}
                >
                  <Text style={gs.presetLabelGlass}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const gs = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },

  modeBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  modeBtnActive: { backgroundColor: 'rgba(56,189,248,0.14)' },
  modeBtnText: { color: COLORS.textDim, fontSize: 12, fontWeight: '700' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 6,
    gap: 8,
  },
  fnLabel: { color: COLORS.primary, fontSize: 14, fontFamily: 'monospace', fontWeight: '800' },
  fnInput: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.25)',
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: 'monospace',
  },
  applyBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: COLORS.secondary },
  applyBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },

  keyScroll: { paddingLeft: 16, marginBottom: 8 },
  mathKey: {
    marginRight: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.2)',
    backgroundColor: 'rgba(125,211,252,0.05)',
  },
  mathKeyText: { color: COLORS.primary, fontSize: 12, fontFamily: 'monospace' },

  graphWrap: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.25)',
    backgroundColor: '#020617',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },

  traceCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.18)',
    backgroundColor: 'rgba(8,16,40,0.75)',
  },
  traceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  traceTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  traceTagText: { color: '#38bdf8', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  traceHintText: { color: COLORS.textFaint, fontSize: 10 },
  traceMetricsRow: { flexDirection: 'row', gap: 8 },
  traceMetricBox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 6,
    padding: 7,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(125,211,252,0.3)',
  },
  traceMetricLabel: { color: COLORS.textDim, fontSize: 9, fontWeight: '700', marginBottom: 2 },
  traceMetricValue: { fontSize: 12, fontFamily: 'monospace', fontWeight: '800' },

  zoomRow: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginTop: 10 },
  zoomBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  zoomBtnText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },

  rangePresetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 6,
    flexWrap: 'wrap',
  },
  rangePresetsLabel: { color: COLORS.textDim, fontSize: 9, fontWeight: '800' },
  rangeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  rangeChipActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(56,189,248,0.15)' },
  rangeChipText: { color: COLORS.textDim, fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    gap: 8,
  },
  toggleTitle: { color: COLORS.textFaint, fontSize: 10, fontWeight: '800' },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  toggleDot: { width: 7, height: 7, borderRadius: 3.5, borderWidth: 1 },
  toggleLabel: { fontSize: 10, fontFamily: 'monospace', fontWeight: '700' },

  presetsLabel: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    fontSize: 10,
    color: COLORS.textDim,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  presetsScroll: { paddingLeft: 16 },
  presetChip: {
    marginRight: 8,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  presetLabel: { color: COLORS.white, fontSize: 11, fontFamily: 'monospace', fontWeight: '700' },

  // Full-bleed 3D Container
  fullBleed3dContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
  webviewFull: { flex: 1, backgroundColor: '#020617' },

  floatingGlassTop: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(8,16,36,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.28)',
    borderRadius: 10,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  inputRowGlass: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fnLabelGlass: { color: COLORS.primary, fontSize: 12, fontFamily: 'monospace', fontWeight: '800' },
  fnInputGlass: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    color: COLORS.white,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  applyBtnGlass: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 7, backgroundColor: COLORS.secondary },
  applyBtnTextGlass: { color: COLORS.white, fontWeight: '800', fontSize: 11 },

  colormapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    flexWrap: 'wrap',
  },
  colormapLabel: { color: COLORS.textFaint, fontSize: 9, fontWeight: '800' },
  colormapChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  colormapChipActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(56,189,248,0.2)' },
  colormapChipText: { color: COLORS.textDim, fontSize: 10, fontWeight: '700' },

  floatingGlassBottom: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    right: 14,
    backgroundColor: 'rgba(8,16,36,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.25)',
    borderRadius: 10,
    padding: 9,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  presetHeaderGlass: { color: COLORS.textFaint, fontSize: 9, letterSpacing: 0.5, marginBottom: 6, fontWeight: '800' },
  presetsScrollGlass: {},
  presetChipGlass: {
    marginRight: 8,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.28)',
    backgroundColor: 'rgba(125,211,252,0.1)',
  },
  presetLabelGlass: { color: COLORS.white, fontSize: 11, fontFamily: 'monospace', fontWeight: '600' },
});

const s2 = StyleSheet.create({
  svg: { backgroundColor: 'transparent' },
});
