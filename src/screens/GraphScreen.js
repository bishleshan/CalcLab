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

// ─── 3D High-End Solid Surface with Specular Lighting & Floor Pedestal ───
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
    position:absolute; top:74px; left:14px; right:14px; display:flex; justify-content:space-between; align-items:center;
    pointer-events:none;
  }
  .hud-badge {
    background:rgba(8,16,36,0.9); border:1px solid rgba(125,211,252,0.25); border-radius:8px;
    padding:6px 12px; font-size:11px; color:#7dd3fc; font-weight:700; backdrop-filter:blur(12px);
    box-shadow:0 4px 14px rgba(0,0,0,0.5); pointer-events:auto;
  }
  .axis-legend {
    display:flex; gap:10px; align-items:center; background:rgba(8,16,36,0.9);
    border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:6px 12px;
    font-size:10px; color:#fff; pointer-events:auto; box-shadow:0 4px 14px rgba(0,0,0,0.5);
  }
  .axis-tag { display:flex; align-items:center; gap:4px; font-weight:800; }
  .dot-x { width:9px; height:9px; border-radius:4.5px; background:#f43f5e; box-shadow:0 0 6px #f43f5e; }
  .dot-y { width:9px; height:9px; border-radius:4.5px; background:#38bdf8; box-shadow:0 0 6px #38bdf8; }
  .dot-z { width:9px; height:9px; border-radius:4.5px; background:#34d399; box-shadow:0 0 6px #34d399; }
  
  #controls-overlay {
    position:absolute; bottom:82px; right:14px; display:flex; flex-direction:column; gap:8px; pointer-events:auto;
  }
  .ctrl-btn {
    width:38px; height:38px; border-radius:10px; background:rgba(8,18,40,0.92);
    border:1px solid rgba(125,211,252,0.35); color:#fff; font-size:18px; font-weight:800;
    display:flex; align-items:center; justify-content:center; cursor:pointer;
    box-shadow:0 4px 16px rgba(0,0,0,0.6); user-select:none;
  }
  .ctrl-btn:active { background:rgba(56,189,248,0.35); transform:scale(0.94); }
  
  #view-snap-row {
    position:absolute; bottom:82px; left:14px; display:flex; gap:6px; pointer-events:auto;
  }
  .snap-btn {
    background:rgba(8,18,40,0.9); border:1px solid rgba(255,255,255,0.15);
    border-radius:8px; padding:6px 10px; font-size:10px; color:rgba(255,255,255,0.85);
    font-weight:700; cursor:pointer; user-select:none; box-shadow:0 4px 14px rgba(0,0,0,0.5);
  }
  .snap-btn:active { background:rgba(56,189,248,0.3); color:#7dd3fc; }
  .snap-btn.active { border-color:#38bdf8; color:#38bdf8; background:rgba(56,189,248,0.15); }
</style>
</head>
<body>
<canvas id="surface"></canvas>

<div id="hud-top">
  <div class="hud-badge" id="angle-hud">3D Solid View</div>
  <div class="axis-legend">
    <div class="axis-tag"><span class="dot-x"></span>X</div>
    <div class="axis-tag"><span class="dot-y"></span>Y</div>
    <div class="axis-tag"><span class="dot-z"></span>Z (Height)</div>
  </div>
</div>

<div id="view-snap-row">
  <button class="snap-btn active" id="btn-iso" onclick="snapView('iso')">3D Iso</button>
  <button class="snap-btn" id="btn-top" onclick="snapView('top')">Top (X-Y)</button>
  <button class="snap-btn" id="btn-side" onclick="snapView('side')">Side (X-Z)</button>
  <button class="snap-btn" id="btn-spin" onclick="toggleSpin()">Auto ↻</button>
</div>

<div id="controls-overlay">
  <button class="ctrl-btn" onclick="adjustZoom(-1.6)" title="Zoom In">+</button>
  <button class="ctrl-btn" onclick="adjustZoom(1.6)" title="Zoom Out">−</button>
  <button class="ctrl-btn" onclick="resetAll()" title="Reset View">⟲</button>
</div>

<script>
const canvas = document.getElementById('surface');
const angleHud = document.getElementById('angle-hud');
const gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true });
if (!gl) {
  document.body.innerHTML = '<div style="color:#fff;padding:40px;text-align:center;">WebGL unavailable.</div>';
  throw new Error('WebGL unavailable');
}

// ─── Shaders with Blinn-Phong Specular & Underside Dual Shading ───
const vs =
  'attribute vec3 aPos;' +
  'attribute vec3 aNormal;' +
  'attribute vec3 aColor;' +
  'uniform mat4 uMatrix;' +
  'uniform mat3 uNormalMat;' +
  'varying vec3 vNormal;' +
  'varying vec3 vColor;' +
  'varying vec3 vWorldPos;' +
  'void main(){' +
  '  gl_Position = uMatrix * vec4(aPos, 1.0);' +
  '  vNormal = normalize(uNormalMat * aNormal);' +
  '  vColor = aColor;' +
  '  vWorldPos = aPos;' +
  '}';

const fs =
  'precision mediump float;' +
  'varying vec3 vNormal;' +
  'varying vec3 vColor;' +
  'varying vec3 vWorldPos;' +
  'uniform vec3 uLightDir;' +
  'uniform float uRenderMode;' + // 0: unlit lines, 1: solid surface, 2: floor grid
  'void main(){' +
  '  if (uRenderMode < 0.5) {' +
  '    gl_FragColor = vec4(vColor, 0.95);' +
  '  } else if (uRenderMode > 1.5) {' +
  '    gl_FragColor = vec4(vColor, 0.35);' +
  '  } else {' +
  '    vec3 n = normalize(vNormal);' +
  '    vec3 l = normalize(uLightDir);' +
  '    vec3 v = vec3(0.0, 0.0, 1.0);' +
  '    float nDotL = dot(n, l);' +
  '    vec3 baseColor = vColor;' +
  // Double-sided lighting: if looking at underside, use rich warm dark slate
  '    if (nDotL < 0.0) {' +
  '      n = -n;' +
  '      nDotL = dot(n, l);' +
  '      baseColor = mix(vColor, vec3(0.12, 0.16, 0.3), 0.55);' +
  '    }' +
  '    float diff = max(nDotL, 0.0);' +
  '    vec3 h = normalize(l + v);' +
  '    float spec = pow(max(dot(n, h), 0.0), 32.0) * 0.38;' +
  '    float amb = 0.42;' +
  '    vec3 lit = baseColor * (amb + diff * 0.68) + vec3(spec);' +
  '    gl_FragColor = vec4(lit, 1.0);' +
  '  }' +
  '}';

function createShader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, createShader(gl.VERTEX_SHADER, vs));
gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, fs));
gl.linkProgram(prog);

const locPos = gl.getAttribLocation(prog, 'aPos');
const locNormal = gl.getAttribLocation(prog, 'aNormal');
const locColor = gl.getAttribLocation(prog, 'aColor');
const locMatrix = gl.getUniformLocation(prog, 'uMatrix');
const locNormalMat = gl.getUniformLocation(prog, 'uNormalMat');
const locLightDir = gl.getUniformLocation(prog, 'uLightDir');
const locRenderMode = gl.getUniformLocation(prog, 'uRenderMode');

function fExpr(x, y) {
  try {
    const v = Number(${safeExpr});
    return Number.isFinite(v) ? Math.max(-4.5, Math.min(4.5, v)) : 0;
  } catch(e) { return 0; }
}

// ─── Build Solid Surface Geometry ────────────────────────────
const NS = 48;
const RANGE = 3.2;
const grid = [];
let zMin = Infinity, zMax = -Infinity;

for (let i = 0; i <= NS; i++) {
  const row = [];
  for (let j = 0; j <= NS; j++) {
    const x = -RANGE + (i / NS) * 2 * RANGE;
    const y = -RANGE + (j / NS) * 2 * RANGE;
    const z = fExpr(x, y);
    row.push(z);
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  grid.push(row);
}
const zRange = zMax - zMin || 1;

// Solid Scientific Colormaps (Rich, Opaque, Contrasting)
function colormap(t, scheme) {
  t = Math.max(0.0, Math.min(1.0, t));
  if (scheme === 'sunset') {
    // Deep Violet -> Rich Magenta -> Vivid Coral -> Golden Amber
    if (t < 0.33) {
      const s = t / 0.33;
      return [0.28 + 0.45 * s, 0.05 + 0.1 * s, 0.42 + 0.4 * s];
    } else if (t < 0.66) {
      const s = (t - 0.33) / 0.33;
      return [0.73 + 0.24 * s, 0.15 + 0.45 * s, 0.82 * (1.0 - s * 0.7)];
    } else {
      const s = (t - 0.66) / 0.34;
      return [0.97 + 0.03 * s, 0.6 + 0.38 * s, 0.25 * (1.0 - s)];
    }
  } else if (scheme === 'emerald') {
    // Deep Pine -> Vivid Jade -> Neon Mint -> Sunlight
    return [
      0.08 + 0.85 * Math.pow(t, 2.2),
      0.35 + 0.65 * Math.pow(t, 0.7),
      0.65 * (1.0 - t * 0.6)
    ];
  } else if (scheme === 'ceramic') {
    // Sculptural Solid Matte White / Ice with gentle shading
    const tone = 0.82 + 0.18 * t;
    return [tone * 0.95, tone * 0.98, tone];
  } else {
    // Solid Cyber Cyan: Deep Royal Sapphire -> Vivid Electric Cyan -> Crisp Arctic Ice
    if (t < 0.5) {
      const s = t / 0.5;
      return [0.08 + 0.1 * s, 0.22 + 0.6 * s, 0.65 + 0.35 * s];
    } else {
      const s = (t - 0.5) / 0.5;
      return [0.18 + 0.75 * s, 0.82 + 0.18 * s, 1.0];
    }
  }
}

const activeScheme = ${JSON.stringify(colorScheme)};
const positions = [];
const normals = [];
const colors = [];
const indices = [];
const wirePositions = [];
const wireColors = [];

for (let i = 0; i <= NS; i++) {
  for (let j = 0; j <= NS; j++) {
    const x = -RANGE + (i / NS) * 2 * RANGE;
    const y = -RANGE + (j / NS) * 2 * RANGE;
    const z = grid[i][j];
    positions.push(x, z * 0.65, y);

    // Precise Central Difference Normals
    const dzdx = (i > 0 && i < NS) ? (grid[i+1][j] - grid[i-1][j]) / (2 * (2 * RANGE / NS)) : 0;
    const dzdy = (j > 0 && j < NS) ? (grid[i][j+1] - grid[i][j-1]) / (2 * (2 * RANGE / NS)) : 0;
    const len = Math.hypot(-dzdx, 1.0, -dzdy) || 1;
    normals.push(-dzdx / len, 1.0 / len, -dzdy / len);

    const t = (z - zMin) / zRange;
    const rgb = colormap(t, activeScheme);
    colors.push(rgb[0], rgb[1], rgb[2]);
  }
}

// Solid Surface Triangles & Subtle Mesh Wireframe
for (let i = 0; i < NS; i++) {
  for (let j = 0; j < NS; j++) {
    const a = i * (NS + 1) + j;
    const b = a + 1;
    const c = (i + 1) * (NS + 1) + j;
    const d = c + 1;
    indices.push(a, b, d, a, d, c);

    // Quad wireframe border lines (subtle dark contour)
    if (i % 2 === 0 && j % 2 === 0) {
      const pA = [positions[a*3], positions[a*3+1], positions[a*3+2]];
      const pB = [positions[b*3], positions[b*3+1], positions[b*3+2]];
      const pD = [positions[d*3], positions[d*3+1], positions[d*3+2]];
      wirePositions.push(...pA, ...pB, ...pB, ...pD);
      wireColors.push(0.04, 0.08, 0.18, 0.04, 0.08, 0.18, 0.04, 0.08, 0.18, 0.04, 0.08, 0.18);
    }
  }
}

// ─── Solid High-Contrast 3D Axes (Red X, Cyan Y, Green Z) ───
const axisPositions = [
  // X-Axis (-3.8 to +3.8)
  -3.8, 0, 0,  3.8, 0, 0,
  // X Arrowhead
  3.55, 0.18, 0,  3.8, 0, 0,
  3.55, -0.18, 0, 3.8, 0, 0,
  
  // Y-Axis (-3.8 to +3.8)
  0, 0, -3.8,  0, 0, 3.8,
  // Y Arrowhead
  0, 0.18, 3.55,  0, 0, 3.8,
  0, -0.18, 3.55, 0, 0, 3.8,
  
  // Z-Axis (Vertical Height: -2.6 to +3.2)
  0, -2.6, 0,  0, 3.3, 0,
  // Z Arrowhead
  0.18, 3.05, 0,  0, 3.3, 0,
  -0.18, 3.05, 0, 0, 3.3, 0,
];

const axisColors = [
  // X: Coral Red
  0.96, 0.25, 0.37,  0.96, 0.25, 0.37,
  0.96, 0.25, 0.37,  0.96, 0.25, 0.37,
  0.96, 0.25, 0.37,  0.96, 0.25, 0.37,
  // Y: Sky Blue
  0.22, 0.74, 0.97,  0.22, 0.74, 0.97,
  0.22, 0.74, 0.97,  0.22, 0.74, 0.97,
  0.22, 0.74, 0.97,  0.22, 0.74, 0.97,
  // Z: Emerald Green
  0.2, 0.83, 0.6,   0.2, 0.83, 0.6,
  0.2, 0.83, 0.6,   0.2, 0.83, 0.6,
  0.2, 0.83, 0.6,   0.2, 0.83, 0.6,
];
const axisNormals = new Array(axisPositions.length).fill(0);

// Base Floor Studio Pedestal Grid (underneath the 3D surface)
const floorY = (zMin * 0.65) - 0.25;
const floorPositions = [];
const floorColors = [];
for (let g = -4; g <= 4; g += 0.8) {
  floorPositions.push(-4, floorY, g,  4, floorY, g);
  floorPositions.push(g, floorY, -4,  g, floorY, 4);
  floorColors.push(0.08, 0.16, 0.35, 0.08, 0.16, 0.35);
  floorColors.push(0.08, 0.16, 0.35, 0.08, 0.16, 0.35);
}
const floorNormals = new Array(floorPositions.length).fill(0);

function makeBuffer(data) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  return b;
}

const posBuf = makeBuffer(positions);
const normBuf = makeBuffer(normals);
const colBuf = makeBuffer(colors);
const idxBuf = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

const wirePosBuf = makeBuffer(wirePositions);
const wireColBuf = makeBuffer(wireColors);
const wireNormBuf = makeBuffer(new Array(wirePositions.length).fill(0));

const axisPosBuf = makeBuffer(axisPositions);
const axisColBuf = makeBuffer(axisColors);
const axisNormBuf = makeBuffer(axisNormals);

const floorPosBuf = makeBuffer(floorPositions);
const floorColBuf = makeBuffer(floorColors);
const floorNormBuf = makeBuffer(floorNormals);

// ─── 3D Matrix Transformations ───────────────────────────────
function multiply(a, b) {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function translation(x, y, z) {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
}
function rotX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}
function rotY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}

let width = 1, height = 1, aspect = 1;
let theta = -0.65;
let tilt = -0.55;
let radius = window.innerWidth < 430 ? 10.8 : 9.2;
let autoRotate = true;
let dragging = false;
let prevX = 0, prevY = 0;
let pinchDist = 0;

function updateAngleHud() {
  const degTheta = Math.round(((theta % (Math.PI * 2)) * 180 / Math.PI + 360) % 360);
  const degTilt = Math.round(tilt * 180 / Math.PI);
  let viewName = '3D Iso';
  if (Math.abs(degTilt - (-90)) < 15) viewName = 'Top (X-Y)';
  else if (Math.abs(degTilt) < 15) viewName = 'Side Profile';
  angleHud.textContent = viewName + ' · ' + degTheta + '°';
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  aspect = width / Math.max(1, height);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function render() {
  requestAnimationFrame(render);
  if (autoRotate && !dragging) {
    theta += 0.0024;
    updateAngleHud();
  }

  gl.clearColor(0.008, 0.024, 0.07, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  const model = multiply(rotY(theta), rotX(tilt));
  const view = translation(0, 0.1, -radius);
  const proj = perspective(0.85, aspect, 0.1, 100);
  const mvp = multiply(proj, multiply(view, model));

  gl.useProgram(prog);
  gl.uniformMatrix4fv(locMatrix, false, mvp);

  const nm = new Float32Array([
    model[0], model[1], model[2],
    model[4], model[5], model[6],
    model[8], model[9], model[10]
  ]);
  gl.uniformMatrix3fv(locNormalMat, false, nm);
  gl.uniform3f(locLightDir, 0.65, 0.85, 0.55);

  // 1. Draw Floor Pedestal Grid
  gl.uniform1f(locRenderMode, 2.0);
  gl.bindBuffer(gl.ARRAY_BUFFER, floorPosBuf);
  gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(locPos);
  gl.bindBuffer(gl.ARRAY_BUFFER, floorNormBuf);
  gl.vertexAttribPointer(locNormal, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(locNormal);
  gl.bindBuffer(gl.ARRAY_BUFFER, floorColBuf);
  gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(locColor);
  gl.drawArrays(gl.LINES, 0, floorPositions.length / 3);

  // 2. Draw Solid Lit Surface
  gl.uniform1f(locRenderMode, 1.0);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
  gl.vertexAttribPointer(locNormal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
  gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);

  // 3. Draw Quad Wireframe Outlines
  if (wirePositions.length > 0) {
    gl.uniform1f(locRenderMode, 0.0);
    gl.bindBuffer(gl.ARRAY_BUFFER, wirePosBuf);
    gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, wireNormBuf);
    gl.vertexAttribPointer(locNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, wireColBuf);
    gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, wirePositions.length / 3);
  }

  // 4. Draw Solid Colored Coordinate Axes (Red X, Blue Y, Green Z)
  gl.uniform1f(locRenderMode, 0.0);
  gl.bindBuffer(gl.ARRAY_BUFFER, axisPosBuf);
  gl.vertexAttribPointer(locPos, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, axisNormBuf);
  gl.vertexAttribPointer(locNormal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, axisColBuf);
  gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, axisPositions.length / 3);
}

// ─── Touch & Controls Helpers ────────────────────────────────
function pauseAutoRotate() {
  autoRotate = false;
  clearTimeout(window.__resumeRotate);
  window.__resumeRotate = setTimeout(() => { autoRotate = true; }, 7000);
}

window.adjustZoom = function(delta) {
  radius = Math.max(3.8, Math.min(18.0, radius + delta));
  pauseAutoRotate();
};

window.resetAll = function() {
  theta = -0.65;
  tilt = -0.55;
  radius = window.innerWidth < 430 ? 10.8 : 9.2;
  updateAngleHud();
  updateButtonStates('iso');
};

window.toggleSpin = function() {
  autoRotate = !autoRotate;
  document.getElementById('btn-spin').classList.toggle('active', autoRotate);
};

function updateButtonStates(view) {
  document.getElementById('btn-iso').classList.toggle('active', view === 'iso');
  document.getElementById('btn-top').classList.toggle('active', view === 'top');
  document.getElementById('btn-side').classList.toggle('active', view === 'side');
}

window.snapView = function(view) {
  pauseAutoRotate();
  if (view === 'top') {
    tilt = -1.55;
    theta = 0;
  } else if (view === 'side') {
    tilt = 0;
    theta = 0;
  } else {
    tilt = -0.55;
    theta = -0.65;
  }
  updateAngleHud();
  updateButtonStates(view);
};

canvas.addEventListener('touchstart', (e) => {
  pauseAutoRotate();
  if (e.touches.length === 1) {
    dragging = true;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    dragging = false;
    pinchDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
  }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length === 1 && dragging) {
    const dx = e.touches[0].clientX - prevX;
    const dy = e.touches[0].clientY - prevY;
    theta += dx * 0.009;
    tilt = Math.max(-1.56, Math.min(0.2, tilt + dy * 0.009));
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
    updateAngleHud();
  } else if (e.touches.length === 2) {
    const nextD = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (pinchDist) {
      radius = Math.max(3.8, Math.min(18.0, radius * (pinchDist / nextD)));
    }
    pinchDist = nextD;
  }
}, { passive: false });

canvas.addEventListener('touchend', () => { dragging = false; pinchDist = 0; }, { passive: true });

window.addEventListener('resize', resize);
resize();
updateAngleHud();
render();
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
          <Text style={[gs.modeBtnText, mode === '3d' && { color: COLORS.primary }]}>3D Solid Surface</Text>
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

      {/* ── 3D SOLID SURFACE MODE (High-End Solid Shading, Colormaps & Camera HUD) ── */}
      {mode === '3d' && (
        <View style={gs.fullBleed3dContainer}>
          {/* Full Screen WebGL 3D Canvas */}
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

            {/* 4 Solid Color Palettes */}
            <View style={gs.colormapRow}>
              <Text style={gs.colormapLabel}>SOLID THEME:</Text>
              {[
                { id: 'cyan', label: 'Electric Blue' },
                { id: 'sunset', label: 'Sunset Magma' },
                { id: 'emerald', label: 'Cyber Emerald' },
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
