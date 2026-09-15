// src/screens/GraphScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Dimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Line, Text as SvgText, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import * as math from 'mathjs';
import { COLORS } from '../constants/theme';
import { normalizeExpression } from '../engine/MobileSolver';

const { width: SW } = Dimensions.get('window');
const GRAPH_H = 320;
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

function evalFn2(expr, x, y) {
  return evalCompiled(compileExpression(expr), { x, y });
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

function buildPoints(expr, xMin, xMax, N = 200) {
  const pts = [];
  const compiled = compileExpression(expr);
  for (let i = 0; i <= N; i++) {
    const x = xMin + (i / N) * (xMax - xMin);
    const y = evalCompiled(compiled, { x });
    pts.push({ x, y });
  }
  return pts;
}

function buildDerivPoints(expr, xMin, xMax, N = 200) {
  const pts = [];
  const compiled = compileExpression(expr);
  for (let i = 0; i <= N; i++) {
    const x = xMin + (i / N) * (xMax - xMin);
    const y = derivativeNumericalCompiled(compiled, x);
    pts.push({ x, y });
  }
  return pts;
}

function buildIntegralPoints(expr, xMin, xMax, N = 200) {
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
    if (!p || !isFinite(p.sx) || !isFinite(p.sy) || p.sy < -50 || p.sy > GRAPH_H + 50) {
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
  let d = `M ${valid[0].sx.toFixed(1)} ${Math.min(Math.max(zeroY, 0), GRAPH_H).toFixed(1)} `;
  for (const p of valid) d += `L ${p.sx.toFixed(1)} ${Math.min(Math.max(p.sy, 0), GRAPH_H).toFixed(1)} `;
  d += `L ${valid[valid.length-1].sx.toFixed(1)} ${Math.min(Math.max(zeroY, 0), GRAPH_H).toFixed(1)} Z`;
  return d;
}

// ─── Grid axis helpers ────────────────────────────────────────
function gridTicks(min, max, count = 5) {
  const range = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(range / count)));
  const ticks = [];
  const start = Math.ceil(min / step) * step;
  for (let t = start; t <= max + 1e-9; t += step) {
    ticks.push(parseFloat(t.toFixed(6)));
    if (ticks.length > 12) break;
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
  return js
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\babs\b/g, 'Math.abs')
    .replace(/\blog\b/g, 'Math.log')
    .replace(/\bexp\b/g, 'Math.exp')
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E');
}

function hapticSelect() {
  Haptics.selectionAsync().catch(() => {});
}

// ─── 3D HTML template (self-contained WebGL; no CDN dependency) ───
function build3dHtml(expr) {
  const safeExpr = toSafe3dExpression(expr);
  const label = JSON.stringify(`z = ${normalizeExpression(expr || 'sin(sqrt(x^2 + y^2))')}`.slice(0, 72));

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#040a1c; overflow:hidden; touch-action:none; }
  canvas { display:block; width:100vw; height:100vh; }
  #label {
    position:absolute; top:12px; left:50%; max-width:92vw; transform:translateX(-50%);
    color:#7dd3fc; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size:12px; line-height:16px; text-align:center; pointer-events:none;
    text-shadow:0 0 12px rgba(125,211,252,0.55);
  }
  #hint {
    position:absolute; bottom:12px; left:50%; transform:translateX(-50%);
    color:rgba(255,255,255,0.34); font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size:10px; pointer-events:none; white-space:nowrap;
  }
  #fallback {
    position:absolute; inset:0; display:none; align-items:center; justify-content:center; padding:24px;
    color:rgba(255,255,255,0.72); font-family:system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size:13px; line-height:19px; text-align:center; background:#040a1c;
  }
</style>
</head>
<body>
<canvas id="surface"></canvas>
<div id="label"></div>
<div id="hint">DRAG TO ROTATE · PINCH TO ZOOM</div>
<div id="fallback">3D rendering is unavailable on this device. The 2D graph still works.</div>
<script>
document.getElementById('label').textContent = ${label};

const canvas = document.getElementById('surface');
const fallback = document.getElementById('fallback');
const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
if (!gl) {
  fallback.style.display = 'flex';
  throw new Error('WebGL unavailable');
}

const vertexSource =
  'attribute vec3 aPosition;' +
  'attribute vec3 aColor;' +
  'uniform mat4 uMatrix;' +
  'uniform float uPointSize;' +
  'varying vec3 vColor;' +
  'void main(){' +
  '  gl_Position = uMatrix * vec4(aPosition, 1.0);' +
  '  gl_PointSize = uPointSize;' +
  '  vColor = aColor;' +
  '}';
const fragmentSource =
  'precision mediump float;' +
  'varying vec3 vColor;' +
  'uniform float uAlpha;' +
  'void main(){ gl_FragColor = vec4(vColor, uAlpha); }';

function shader(type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(result) || 'Shader compile failed');
  }
  return result;
}

function program() {
  const result = gl.createProgram();
  gl.attachShader(result, shader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(result, shader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(result) || 'Program link failed');
  }
  return result;
}

const prog = program();
const locPosition = gl.getAttribLocation(prog, 'aPosition');
const locColor = gl.getAttribLocation(prog, 'aColor');
const locMatrix = gl.getUniformLocation(prog, 'uMatrix');
const locAlpha = gl.getUniformLocation(prog, 'uAlpha');
const locPointSize = gl.getUniformLocation(prog, 'uPointSize');

function fExpr(x, y) {
  try {
    const value = Number(${safeExpr});
    return Number.isFinite(value) ? Math.max(-4, Math.min(4, value)) : 0;
  } catch (error) {
    return 0;
  }
}

const NS = 44;
const RANGE = 3.1;
const positions = [];
const colors = [];
const indices = [];
const wire = [];
let zMin = Infinity;
let zMax = -Infinity;
const heights = [];

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
  heights.push(row);
}

const zRange = zMax - zMin || 1;
for (let i = 0; i <= NS; i++) {
  for (let j = 0; j <= NS; j++) {
    const x = -RANGE + (i / NS) * 2 * RANGE;
    const y = -RANGE + (j / NS) * 2 * RANGE;
    const z = heights[i][j];
    const t = (z - zMin) / zRange;
    positions.push(x, z * 0.54, y);
    colors.push(0.16 + 0.7 * t, 0.45 + 0.38 * (1 - Math.abs(t - 0.55)), 0.96 - 0.34 * t);
  }
}

for (let i = 0; i < NS; i++) {
  for (let j = 0; j < NS; j++) {
    const a = i * (NS + 1) + j;
    const b = a + 1;
    const c = (i + 1) * (NS + 1) + j;
    const d = c + 1;
    indices.push(a, b, d, a, d, c);
    wire.push(a, b, b, d, d, c, c, a);
  }
}

const axisPositions = [
  -3.65, 0, 0, 3.65, 0, 0,
  0, 0, -3.65, 0, 0, 3.65,
  0, -2.6, 0, 0, 2.9, 0,
];
const axisColors = [
  0.49, 0.83, 0.99, 0.49, 0.83, 0.99,
  0.51, 0.55, 0.97, 0.51, 0.55, 0.97,
  0.96, 0.45, 0.71, 0.96, 0.45, 0.71,
];

const particlePositions = [];
const particleColors = [];
for (let i = 0; i < 150; i++) {
  particlePositions.push((Math.random() - 0.5) * 11, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 11);
  const palette = i % 3;
  if (palette === 0) particleColors.push(0.49, 0.83, 0.99);
  else if (palette === 1) particleColors.push(0.96, 0.45, 0.71);
  else particleColors.push(0.52, 0.92, 0.72);
}

function makeLayer(positionData, colorData, indexData) {
  const layer = {
    position: gl.createBuffer(),
    color: gl.createBuffer(),
    index: indexData ? gl.createBuffer() : null,
    count: indexData ? indexData.length : positionData.length / 3,
  };
  gl.bindBuffer(gl.ARRAY_BUFFER, layer.position);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positionData), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, layer.color);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colorData), gl.STATIC_DRAW);
  if (indexData) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, layer.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexData), gl.STATIC_DRAW);
  }
  return layer;
}

const wireColors = colors.map(function(value, index) {
  if (index % 3 === 0) return 0.49;
  if (index % 3 === 1) return 0.83;
  return 0.99;
});
const surfaceLayer = makeLayer(positions, colors, indices);
const wireLayer = makeLayer(positions, wireColors, wire);
const axisLayer = makeLayer(axisPositions, axisColors, null);
const particleLayer = makeLayer(particlePositions, particleColors, null);

function multiply(a, b) {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
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
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

function rotationX(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

function rotationY(a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function scaleMatrix(value) {
  return new Float32Array([
    value, 0, 0, 0,
    0, value, 0, 0,
    0, 0, value, 0,
    0, 0, 0, 1,
  ]);
}

let width = 1;
let height = 1;
let aspect = 1;
let theta = -0.58;
let tilt = -0.74;
let radius = window.innerWidth < 430 ? 12.2 : 10.4;
let autoRotate = true;
let dragging = false;
let prevX = 0;
let prevY = 0;
let pinchDistance = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  aspect = width / Math.max(1, height);
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function matrix() {
  const fov = width < 430 ? 1.02 : 0.88;
  const model = multiply(rotationY(theta), multiply(rotationX(tilt), scaleMatrix(width < 430 ? 0.84 : 0.92)));
  const view = translation(0, 0.1, -radius);
  return multiply(perspective(fov, aspect, 0.1, 100), multiply(view, model));
}

function drawLayer(layer, mode, alpha, pointSize) {
  gl.bindBuffer(gl.ARRAY_BUFFER, layer.position);
  gl.vertexAttribPointer(locPosition, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(locPosition);
  gl.bindBuffer(gl.ARRAY_BUFFER, layer.color);
  gl.vertexAttribPointer(locColor, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(locColor);
  gl.uniform1f(locAlpha, alpha);
  gl.uniform1f(locPointSize, pointSize || 1);
  if (layer.index) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, layer.index);
    gl.drawElements(mode, layer.count, gl.UNSIGNED_SHORT, 0);
  } else {
    gl.drawArrays(mode, 0, layer.count);
  }
}

function frame() {
  requestAnimationFrame(frame);
  if (autoRotate && !dragging) theta += 0.0022;
  gl.clearColor(0.015, 0.039, 0.11, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(prog);
  gl.uniformMatrix4fv(locMatrix, false, matrix());
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  drawLayer(particleLayer, gl.POINTS, 0.42, width < 430 ? 1.6 : 2.1);
  drawLayer(surfaceLayer, gl.TRIANGLES, 0.82, 1);
  drawLayer(wireLayer, gl.LINES, 0.32, 1);
  drawLayer(axisLayer, gl.LINES, 0.72, 1);
}

function pauseAutoRotate() {
  autoRotate = false;
  clearTimeout(window.__resumeAutoRotate);
  window.__resumeAutoRotate = setTimeout(function() { autoRotate = true; }, 5000);
}

canvas.addEventListener('mousedown', function(event) {
  dragging = true;
  prevX = event.clientX;
  prevY = event.clientY;
  pauseAutoRotate();
});

window.addEventListener('mousemove', function(event) {
  if (!dragging) return;
  const dx = event.clientX - prevX;
  const dy = event.clientY - prevY;
  theta += dx * 0.008;
  tilt = Math.max(-1.28, Math.min(0.15, tilt + dy * 0.008));
  prevX = event.clientX;
  prevY = event.clientY;
});

window.addEventListener('mouseup', function() {
  dragging = false;
});

canvas.addEventListener('wheel', function(event) {
  event.preventDefault();
  radius = Math.max(6.5, Math.min(17, radius + event.deltaY * 0.01));
  pauseAutoRotate();
}, { passive:false });

canvas.addEventListener('touchstart', function(event) {
  pauseAutoRotate();
  if (event.touches.length === 1) {
    dragging = true;
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;
  }
  if (event.touches.length === 2) {
    dragging = false;
    pinchDistance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
  }
}, { passive:true });

canvas.addEventListener('touchmove', function(event) {
  event.preventDefault();
  if (event.touches.length === 1 && dragging) {
    const dx = event.touches[0].clientX - prevX;
    const dy = event.touches[0].clientY - prevY;
    theta += dx * 0.01;
    tilt = Math.max(-1.28, Math.min(0.15, tilt + dy * 0.01));
    prevX = event.touches[0].clientX;
    prevY = event.touches[0].clientY;
  }
  if (event.touches.length === 2) {
    const nextDistance = Math.hypot(
      event.touches[0].clientX - event.touches[1].clientX,
      event.touches[0].clientY - event.touches[1].clientY
    );
    if (pinchDistance) radius = Math.max(6.5, Math.min(17, radius * (pinchDistance / nextDistance)));
    pinchDistance = nextDistance;
  }
}, { passive:false });

canvas.addEventListener('touchend', function() {
  dragging = false;
  pinchDistance = 0;
}, { passive:true });

window.addEventListener('resize', resize);
gl.disable(gl.CULL_FACE);
resize();
frame();
</script>
</body>
</html>`;
}

// ─── 2D SVG Graph ─────────────────────────────────────────────
function Graph2D({ expr, showDeriv, showIntegral, xMin, xMax, traceX }) {
  const W = GRAPH_W, H = GRAPH_H;

  const { fPts, dPts, iPts, yMin, yMax } = useMemo(() => {
    const fPts = buildPoints(expr, xMin, xMax);
    const dPts = showDeriv ? buildDerivPoints(expr, xMin, xMax) : [];
    const iPts = showIntegral ? buildIntegralPoints(expr, xMin, xMax) : [];

    const allY = [
      ...fPts.map(p => p.y).filter(y => y !== null && isFinite(y)),
      ...dPts.map(p => p.y).filter(y => y !== null && isFinite(y)),
      ...iPts.map(p => p.y).filter(y => y !== null && isFinite(y)),
    ];
    const raw_yMin = allY.length ? Math.min(...allY) : -5;
    const raw_yMax = allY.length ? Math.max(...allY) : 5;
    const pad = (raw_yMax - raw_yMin) * 0.15 || 1;
    return {
      fPts, dPts, iPts,
      yMin: raw_yMin - pad,
      yMax: raw_yMax + pad,
    };
  }, [expr, showDeriv, showIntegral, xMin, xMax]);

  const toSP = pts => toScreen(pts, xMin, xMax, yMin, yMax, W, H);

  const fScreen = toSP(fPts);
  const dScreen = toSP(dPts);
  const iScreen = toSP(iPts);

  // Zero line in screen coords
  const yZeroScreen = H - ((0 - yMin) / (yMax - yMin)) * H;
  const xZeroScreen = ((0 - xMin) / (xMax - xMin)) * W;

  // Axis ticks
  const xTicks = gridTicks(xMin, xMax, 6);
  const yTicks = gridTicks(yMin, yMax, 5);
  const hasCurve = fScreen.some(p => p && isFinite(p.sx) && isFinite(p.sy));
  const trace = (() => {
    if (traceX === null || traceX === undefined) return null;
    const y = evalFn(expr, traceX);
    if (y === null) return null;
    const sx = ((traceX - xMin) / (xMax - xMin)) * W;
    const sy = H - ((y - yMin) / (yMax - yMin)) * H;
    if (!isFinite(sx) || !isFinite(sy) || sx < 0 || sx > W || sy < -20 || sy > H + 20) return null;
    return { x: traceX, y, sx, sy: Math.min(Math.max(sy, 0), H) };
  })();

  return (
    <Svg width={W} height={H} style={s2.svg}>
      <Defs>
        <LinearGradient id="intGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#34d399" stopOpacity="0.3" />
          <Stop offset="1" stopColor="#34d399" stopOpacity="0.02" />
        </LinearGradient>
      </Defs>

      {/* Grid lines */}
      {xTicks.map(t => {
        const sx = ((t - xMin) / (xMax - xMin)) * W;
        return <Line key={`xg-${t}`} x1={sx} y1={0} x2={sx} y2={H}
          stroke="rgba(125,211,252,0.06)" strokeWidth={1} />;
      })}
      {yTicks.map(t => {
        const sy = H - ((t - yMin) / (yMax - yMin)) * H;
        return <Line key={`yg-${t}`} x1={0} y1={sy} x2={W} y2={sy}
          stroke="rgba(125,211,252,0.06)" strokeWidth={1} />;
      })}

      {/* Axes */}
      {yZeroScreen >= 0 && yZeroScreen <= H &&
        <Line x1={0} y1={yZeroScreen} x2={W} y2={yZeroScreen}
          stroke="rgba(125,211,252,0.3)" strokeWidth={1} />}
      {xZeroScreen >= 0 && xZeroScreen <= W &&
        <Line x1={xZeroScreen} y1={0} x2={xZeroScreen} y2={H}
          stroke="rgba(125,211,252,0.3)" strokeWidth={1} />}

      {/* Axis tick labels */}
      {xTicks.map(t => {
        const sx = ((t - xMin) / (xMax - xMin)) * W;
        if (sx < 20 || sx > W - 20) return null;
        return <SvgText key={`xl-${t}`} x={sx} y={Math.min(yZeroScreen + 14, H - 4)}
          fill="rgba(125,211,252,0.4)" fontSize={9} textAnchor="middle">{t}</SvgText>;
      })}
      {yTicks.map(t => {
        const sy = H - ((t - yMin) / (yMax - yMin)) * H;
        if (sy < 10 || sy > H - 10) return null;
        return <SvgText key={`yl-${t}`} x={Math.max(xZeroScreen + 4, 4)} y={sy + 4}
          fill="rgba(125,211,252,0.4)" fontSize={9}>{parseFloat(t.toFixed(2))}</SvgText>;
      })}

      {/* Integral area fill */}
      {showIntegral && iScreen.length > 0 && (
        <Path d={integralAreaPath(iScreen, yZeroScreen, W)}
          fill="url(#intGrad)" />
      )}

      {/* Integral curve */}
      {showIntegral && (
        <Path d={pointsToPath(iScreen)}
          stroke="#34d399" strokeWidth={1.5} fill="none" strokeOpacity={0.7} />
      )}

      {/* Derivative curve */}
      {showDeriv && (
        <Path d={pointsToPath(dScreen)}
          stroke="#f472b6" strokeWidth={2} fill="none" />
      )}

      {/* f(x) main curve */}
      <Path d={pointsToPath(fScreen)}
        stroke="#7dd3fc" strokeWidth={2.5} fill="none" />

      {!hasCurve && (
        <SvgText x={W / 2} y={H / 2} fill="rgba(255,255,255,0.55)" fontSize={12} textAnchor="middle">
          Enter a graphable function
        </SvgText>
      )}

      {/* f(0) dot */}
      {(() => {
        const y0 = evalFn(expr, 0);
        if (y0 === null) return null;
        const sx = ((0 - xMin) / (xMax - xMin)) * W;
        const sy = H - ((y0 - yMin) / (yMax - yMin)) * H;
        if (!isFinite(sx) || !isFinite(sy)) return null;
        return <Circle cx={sx} cy={sy} r={4} fill="#7dd3fc" />;
      })()}

      {trace && (
        <>
          <Line x1={trace.sx} y1={0} x2={trace.sx} y2={H} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="4 5" />
          <Circle cx={trace.sx} cy={trace.sy} r={5} fill="#ffffff" opacity={0.95} />
          <Circle cx={trace.sx} cy={trace.sy} r={9} fill="#7dd3fc" opacity={0.18} />
          <SvgText x={Math.min(Math.max(trace.sx, 54), W - 54)} y={Math.max(trace.sy - 12, 18)} fill="#ffffff" fontSize={10} textAnchor="middle">
            ({trace.x.toFixed(2)}, {trace.y.toFixed(2)})
          </SvgText>
        </>
      )}
    </Svg>
  );
}

// ─── Main Screen ──────────────────────────────────────────────
export default function GraphScreen({ route }) {
  const [mode, setMode] = useState('2d');
  const [expr2d, setExpr2d] = useState('sin(x)');
  const [expr3d, setExpr3d] = useState('sin(sqrt(x^2 + y^2))');
  const [showDeriv, setShowDeriv] = useState(true);
  const [showIntegral, setShowIntegral] = useState(true);
  const [xMin, setXMin] = useState(-6);
  const [xMax, setXMax] = useState(6);
  const [inputVal, setInputVal] = useState('sin(x)');
  const [input3dVal, setInput3dVal] = useState('sin(sqrt(x^2 + y^2))');
  const [webviewKey, setWebviewKey] = useState(0);
  const [traceX, setTraceX] = useState(0);

  useEffect(() => {
    const prefill = route?.params?.prefill;
    if (!prefill) return;
    setMode('2d');
    setInputVal(prefill);
    setExpr2d(prefill);
    setTraceX(0);
  }, [route?.params?.prefill]);

  function apply2d() {
    hapticSelect();
    setExpr2d(inputVal);
    setTraceX(0);
  }

  function apply3d() {
    hapticSelect();
    setExpr3d(input3dVal);
    setWebviewKey(k => k + 1);
  }

  function zoom(factor) {
    hapticSelect();
    const cx = (xMin + xMax) / 2;
    const half = (xMax - xMin) / 2 * factor;
    setXMin(cx - half);
    setXMax(cx + half);
  }

  function handleTrace(event) {
    const locationX = Math.min(Math.max(event.nativeEvent.locationX, 0), GRAPH_W);
    const x = xMin + (locationX / GRAPH_W) * (xMax - xMin);
    setTraceX(x);
  }

  const traceY = evalFn(expr2d, traceX);
  const traceSlope = derivativeNumerical(expr2d, traceX);

  const mathKeys2d = ['x', '^2', '^', 'sin(', 'cos(', 'tan(', 'sqrt(', 'log(', 'exp(', 'pi', '+', '-', '*', '/'];
  const mathKeys3d = ['x', 'y', '^2', '^', 'sin(', 'cos(', 'sqrt(', 'pi', '+', '-', '*', '/'];

  return (
    <SafeAreaView style={gs.safe} edges={['top']}>
      {/* Mode toggle */}
      <View style={gs.modeBar}>
        {['2d', '3d'].map(m => (
          <TouchableOpacity
            key={m}
            style={[gs.modeBtn, mode === m && gs.modeBtnActive]}
            onPress={() => { hapticSelect(); setMode(m); }}
            accessibilityRole="button"
            accessibilityLabel={m === '2d' ? 'Show 2D graph' : 'Show 3D surface'}
            accessibilityState={{ selected: mode === m }}
          >
            <Ionicons
              name={m === '2d' ? 'pulse-outline' : 'cube-outline'}
              size={16}
              color={mode === m ? COLORS.primary : COLORS.textDim}
            />
            <Text style={[gs.modeBtnText, mode === m && { color: COLORS.primary }]}>
              {m === '2d' ? '2D Graph' : '3D Surface'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 2D MODE ── */}
      {mode === '2d' && (
        <ScrollView style={gs.scroll}>
          {/* Function input */}
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
            <TouchableOpacity style={gs.applyBtn} onPress={apply2d} accessibilityRole="button" accessibilityLabel="Plot 2D function">
              <Text style={gs.applyBtnText}>Plot</Text>
            </TouchableOpacity>
          </View>

          {/* Math keyboard */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={gs.keyScroll}>
            {mathKeys2d.map(k => (
              <TouchableOpacity
                key={k}
                style={gs.mathKey}
                onPress={() => { hapticSelect(); setInputVal(v => v + k); }}
                accessibilityRole="button"
                accessibilityLabel={`Insert ${k}`}
              >
                <Text style={gs.mathKeyText}>{k}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Graph canvas */}
          <View
            style={gs.graphWrap}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleTrace}
            onResponderMove={handleTrace}
          >
            <Graph2D
              expr={expr2d}
              showDeriv={showDeriv}
              showIntegral={showIntegral}
              xMin={xMin}
              xMax={xMax}
              traceX={traceX}
            />
          </View>

          <View style={gs.tracePanel}>
            <View style={gs.traceMetric}>
              <Text style={gs.traceLabel}>x</Text>
              <Text style={gs.traceValue}>{traceX.toFixed(3)}</Text>
            </View>
            <View style={gs.traceMetric}>
              <Text style={gs.traceLabel}>f(x)</Text>
              <Text style={gs.traceValue}>{traceY === null ? 'undefined' : traceY.toFixed(3)}</Text>
            </View>
            <View style={gs.traceMetric}>
              <Text style={gs.traceLabel}>slope</Text>
              <Text style={gs.traceValue}>{traceSlope === null ? 'undefined' : traceSlope.toFixed(3)}</Text>
            </View>
          </View>

          {/* Zoom controls */}
          <View style={gs.zoomRow}>
            <TouchableOpacity style={gs.zoomBtn} onPress={() => zoom(1.4)} accessibilityRole="button" accessibilityLabel="Zoom out">
              <Ionicons name="remove-outline" size={15} color={COLORS.textDim} />
              <Text style={gs.zoomBtnText}>Out</Text>
            </TouchableOpacity>
            <TouchableOpacity style={gs.zoomBtn} onPress={() => { hapticSelect(); setXMin(-6); setXMax(6); setTraceX(0); }} accessibilityRole="button" accessibilityLabel="Reset graph range">
              <Ionicons name="reload-outline" size={15} color={COLORS.textDim} />
              <Text style={gs.zoomBtnText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={gs.zoomBtn} onPress={() => zoom(0.65)} accessibilityRole="button" accessibilityLabel="Zoom in">
              <Ionicons name="add-outline" size={15} color={COLORS.textDim} />
              <Text style={gs.zoomBtnText}>In</Text>
            </TouchableOpacity>
          </View>

          {/* X range control */}
          <View style={gs.rangeRow}>
            <Text style={gs.rangeLabel}>x range:</Text>
            <TextInput
              style={gs.rangeInput}
              value={String(parseFloat(xMin.toFixed(1)))}
              onChangeText={v => { const n = parseFloat(v); if (!isNaN(n)) setXMin(n); }}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Minimum x value"
            />
            <Text style={gs.rangeSep}>to</Text>
            <TextInput
              style={gs.rangeInput}
              value={String(parseFloat(xMax.toFixed(1)))}
              onChangeText={v => { const n = parseFloat(v); if (!isNaN(n)) setXMax(n); }}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Maximum x value"
            />
          </View>

          {/* Toggles */}
          <View style={gs.toggleRow}>
            <Text style={gs.toggleTitle}>SHOW:</Text>
            {[
              { key: 'fx', label: "f(x)", color: COLORS.primary, state: true, fixed: true },
              { key: 'deriv', label: "f'(x)", color: COLORS.pink, state: showDeriv, toggle: () => setShowDeriv(v => !v) },
              { key: 'integ', label: '∫f dx', color: COLORS.accent, state: showIntegral, toggle: () => setShowIntegral(v => !v) },
            ].map(item => (
              <TouchableOpacity
                key={item.key}
                style={[gs.toggleChip, { borderColor: item.color, backgroundColor: item.state ? `${item.color}22` : 'transparent' }]}
                onPress={() => { hapticSelect(); item.toggle?.(); }}
                disabled={item.fixed}
                accessibilityRole="switch"
                accessibilityLabel={`Show ${item.label}`}
                accessibilityState={{ checked: item.state, disabled: item.fixed }}
              >
                <View style={[gs.toggleDot, { backgroundColor: item.state ? item.color : 'transparent', borderColor: item.color }]} />
                <Text style={[gs.toggleLabel, { color: item.state ? item.color : COLORS.textDim }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Legend */}
          <View style={gs.legend}>
            <View style={gs.legItem}><View style={[gs.legLine, { backgroundColor: COLORS.primary }]} /><Text style={gs.legText}>f(x)</Text></View>
            {showDeriv && <View style={gs.legItem}><View style={[gs.legLine, { backgroundColor: COLORS.pink }]} /><Text style={gs.legText}>f'(x)</Text></View>}
            {showIntegral && <View style={gs.legItem}><View style={[gs.legLine, { backgroundColor: COLORS.accent }]} /><Text style={gs.legText}>∫f dx</Text></View>}
          </View>

          {/* Quick presets */}
          <Text style={gs.presetsLabel}>QUICK PRESETS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={gs.presetsScroll}>
              {[
                { label: 'sin(x)', fn: 'sin(x)' },
                { label: 'x²', fn: 'x^2' },
              { label: 'x³-3x', fn: 'x^3 - 3*x' },
              { label: 'eˣ', fn: 'exp(x)' },
              { label: '1/x', fn: '1/x' },
              { label: 'ln(x)', fn: 'log(x)' },
              { label: 'cos(x)tan(x)', fn: 'cos(x)*tan(x)' },
            ].map(p => (
              <TouchableOpacity key={p.fn} style={gs.presetChip}
                onPress={() => { hapticSelect(); setInputVal(p.fn); setExpr2d(p.fn); setTraceX(0); }}
                accessibilityRole="button"
                accessibilityLabel={`Plot preset ${p.label}`}>
                <Text style={gs.presetLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* ── 3D MODE (Full-bleed edge-to-edge canvas with floating glass controls) ── */}
      {mode === '3d' && (
        <View style={gs.fullBleed3dContainer}>
          {/* Background 3D View (Full Height) */}
          <View style={StyleSheet.absoluteFill}>
            {Platform.OS === 'web' ? (
              <iframe
                key={webviewKey}
                srcDoc={build3dHtml(expr3d)}
                style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#040a1c' }}
                title="3D Surface View"
              />
            ) : (
              <WebView
                key={webviewKey}
                originWhitelist={['*']}
                source={{ html: build3dHtml(expr3d) }}
                style={gs.webviewFull}
                scrollEnabled={false}
                bounces={false}
                javaScriptEnabled
                domStorageEnabled
                allowsInlineMediaPlayback
              />
            )}
          </View>

          {/* Floating Top Glass Bar (Formula Input & Math Keys) */}
          <View style={gs.floatingGlassTop}>
            <View style={gs.inputRowGlass}>
              <Text style={gs.fnLabelGlass}>f(x,y)=</Text>
              <TextInput
                style={gs.fnInputGlass}
                value={input3dVal}
                onChangeText={setInput3dVal}
                onSubmitEditing={apply3d}
                autoCapitalize="none" autoCorrect={false}
                returnKeyType="done"
                placeholderTextColor={COLORS.textFaint}
              />
              <TouchableOpacity style={gs.applyBtnGlass} onPress={apply3d} accessibilityRole="button" accessibilityLabel="Plot 3D surface">
                <Text style={gs.applyBtnTextGlass}>Plot</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Math Keyboard */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={gs.keyScrollGlass}>
              {mathKeys3d.map(k => (
                <TouchableOpacity
                  key={k}
                  style={gs.mathKeyGlass}
                  onPress={() => { hapticSelect(); setInput3dVal(v => v + k); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Insert ${k}`}
                >
                  <Text style={gs.mathKeyTextGlass}>{k}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Floating Bottom Glass Bar (Presets) */}
          <View style={gs.floatingGlassBottom}>
            <Text style={gs.presetHeaderGlass}>SURFACE PRESETS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={gs.presetsScrollGlass}>
              {[
                { label: 'Ripple', fn: 'sin(sqrt(x^2 + y^2))' },
                { label: 'Saddle', fn: 'x^2 - y^2' },
                { label: 'Paraboloid', fn: 'x^2 + y^2' },
                { label: 'Gaussian', fn: 'exp(-(x^2+y^2))' },
                { label: 'Waves', fn: 'sin(x) * cos(y)' },
                { label: 'Cone', fn: 'sqrt(x^2 + y^2)' },
                { label: 'Cubic Saddle', fn: 'x^3 - 3*x*y^2' },
              ].map(p => (
                <TouchableOpacity key={p.fn} style={gs.presetChipGlass}
                  onPress={() => { hapticSelect(); setInput3dVal(p.fn); setExpr3d(p.fn); setWebviewKey(k => k + 1); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Plot 3D preset ${p.label}`}>
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
  modeBar: { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 8, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, backgroundColor: 'rgba(255,255,255,0.02)' },
  modeBtnActive: { backgroundColor: 'rgba(125,211,252,0.1)' },
  modeBtnText: { color: COLORS.textDim, fontSize: 13, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6, gap: 8 },
  fnLabel: { color: COLORS.primary, fontSize: 13, fontFamily: 'monospace', minWidth: 48 },
  fnInput: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, color: COLORS.white, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontFamily: 'monospace' },
  applyBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: COLORS.secondary },
  applyBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  keyScroll: { paddingLeft: 16, marginBottom: 8 },
  mathKey: { marginRight: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(125,211,252,0.2)', backgroundColor: 'rgba(125,211,252,0.04)' },
  mathKeyText: { color: COLORS.primary, fontSize: 12, fontFamily: 'monospace' },
  graphWrap: { marginHorizontal: 16, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'rgba(4,10,28,0.95)' },
  tracePanel: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, flexDirection: 'row', gap: 8 },
  traceMetric: { flex: 1 },
  traceLabel: { color: COLORS.textFaint, fontSize: 10, fontWeight: '800', marginBottom: 3 },
  traceValue: { color: COLORS.white, fontSize: 12, fontFamily: 'monospace' },
  zoomRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 10 },
  zoomBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  zoomBtnText: { color: COLORS.textDim, fontSize: 12 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, gap: 8 },
  rangeLabel: { color: COLORS.textDim, fontSize: 11, minWidth: 54 },
  rangeInput: { width: 60, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 7, borderWidth: 1, borderColor: COLORS.border, color: COLORS.white, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, fontFamily: 'monospace', textAlign: 'center' },
  rangeSep: { color: COLORS.textDim, fontSize: 11 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 10, gap: 8 },
  toggleTitle: { color: COLORS.textFaint, fontSize: 10, letterSpacing: 0, fontWeight: '800' },
  toggleChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  toggleDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1 },
  toggleLabel: { fontSize: 11, fontFamily: 'monospace' },
  legend: { flexDirection: 'row', gap: 16, marginHorizontal: 16, marginTop: 10 },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legLine: { width: 18, height: 2, borderRadius: 1 },
  legText: { color: COLORS.textDim, fontSize: 11 },
  presetsLabel: { marginHorizontal: 16, marginTop: 14, marginBottom: 8, fontSize: 10, letterSpacing: 0, color: COLORS.textDim, fontWeight: '800' },
  presetsScroll: { paddingLeft: 16 },
  presetChip: { marginRight: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard },
  presetLabel: { color: COLORS.white, fontSize: 12, fontFamily: 'monospace' },
  webviewWrap: { flex: 1, marginHorizontal: 16, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border, minHeight: 360 },
  webview: { flex: 1, backgroundColor: '#080F1E' },

  // Full-bleed 3D Glass Styles
  fullBleed3dContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
  webviewFull: { flex: 1, backgroundColor: '#040a1c' },
  floatingGlassTop: {
    position: 'absolute', top: 12, left: 14, right: 14,
    backgroundColor: 'rgba(8,16,40,0.85)',
    borderWidth: 1, borderColor: 'rgba(125,211,252,0.2)',
    borderRadius: 8, padding: 10,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
  },
  inputRowGlass: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  fnLabelGlass: { color: COLORS.primary, fontSize: 13, fontFamily: 'monospace', minWidth: 54 },
  fnInputGlass: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    color: COLORS.white, paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 13, fontFamily: 'monospace',
  },
  applyBtnGlass: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: COLORS.secondary },
  applyBtnTextGlass: { color: COLORS.white, fontWeight: '700', fontSize: 12 },
  keyScrollGlass: { paddingLeft: 2 },
  mathKeyGlass: { marginRight: 6, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(125,211,252,0.25)', backgroundColor: 'rgba(125,211,252,0.06)' },
  mathKeyTextGlass: { color: COLORS.primary, fontSize: 11, fontFamily: 'monospace' },
  floatingGlassBottom: {
    position: 'absolute', bottom: 12, left: 14, right: 14,
    backgroundColor: 'rgba(8,16,40,0.85)',
    borderWidth: 1, borderColor: 'rgba(125,211,252,0.2)',
    borderRadius: 8, padding: 10,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, elevation: 8,
  },
  presetHeaderGlass: { color: COLORS.textFaint, fontSize: 10, letterSpacing: 0, marginBottom: 6, fontWeight: '800' },
  presetsScrollGlass: {},
  presetChipGlass: {
    marginRight: 8, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 18, borderWidth: 1, borderColor: 'rgba(125,211,252,0.25)',
    backgroundColor: 'rgba(125,211,252,0.08)',
  },
  presetLabelGlass: { color: COLORS.white, fontSize: 11, fontFamily: 'monospace' },
});

const s2 = StyleSheet.create({
  svg: { backgroundColor: 'transparent' },
});
