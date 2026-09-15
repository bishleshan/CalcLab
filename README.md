# ◈ CalcLab Mobile — Interactive Calculus Solver & 3D Visualizer

> **A comprehensive, high-performance mobile application for Undergrad Calculus I & II (Derivatives, Integrals, Limits, Critical Points & 3D Surface Rendering).**

---

## 📖 Table of Contents
- [Overview](#-overview)
- [Technologies & Stack Used](#-technologies--stack-used)
- [How It Works Under the Hood (Architecture & Engines)](#-how-it-works-under-the-hood-architecture--engines)
  - [1. MobileSolver Math Engine](#1-mobilesolver-math-engine)
  - [2. LaTeX Parsing & Auto-Conversion Pipeline](#2-latex-parsing--auto-conversion-pipeline)
  - [3. Full-Bleed 3D Surface Visualizer (Three.js)](#3-full-bleed-3d-surface-visualizer-threejs)
  - [4. 2D Vector Graphing Engine (SVG)](#4-2d-vector-graphing-engine-svg)
  - [5. RevenueCat Quota & Monetization Engine](#5-revenuecat-quota--monetization-engine)
- [App Features](#-app-features)
- [Installation & Quick Start](#-installation--quick-start)
- [Project Directory Structure](#-project-directory-structure)
- [Author & License](#-author--license)

---

## 🌟 Overview

**CalcLab Mobile** is an intuitive, visual-first mobile app designed to help undergraduate students solve, visualize, and master Calculus I and Calculus II concepts. 

Key highlights include **instant step-by-step solutions**, **automatic LaTeX textbook expression pasting**, **interactive 2D function/derivative/integral graphs**, and an **edge-to-edge 3D surface renderer** powered by Three.js.

---

## 🛠️ Technologies & Stack Used

### 📱 Core Framework & Navigation
* **[React Native](https://reactnative.dev/)** & **[Expo SDK 57](https://expo.dev/)**: Cross-platform mobile development for iOS and Android.
* **[React Navigation v7](https://reactnavigation.org/)**: Bottom tab navigator (`HomeScreen`, `SolverScreen`, `GraphScreen`, `PaywallScreen`) and modal stack transitions.
* **[React Native Safe Area Context](https://github.com/th3rdwave/react-native-safe-area-context)**: Edge-to-edge layout formatting across modern device notches.

### 🧮 Symbolic & Numerical Math Processing
* **[MathJS](https://mathjs.org/)**: Pure JavaScript symbolic differentiation, numerical evaluation, expression compilation, and matrix/vector processing.
* **Custom LaTeX Parser (`src/engine/MobileSolver.js`)**: Converts LaTeX strings (e.g. `$$\int (x^2 + 2x) \cos(x) dx$$`) into executable mathematical trees.

### 🎨 2D & 3D Graphics Engines
* **[Three.js](https://threejs.org/)**: WebGL 3D graphics rendering with ACES Filmic Tone Mapping, 3-point lighting, height-based vertex shading, and interactive orbit touch controls.
* **[React Native SVG](https://github.com/software-mansion/react-native-svg)**: Scalable vector graphics engine for high-resolution 2D function curves, derivative lines, and integral gradient fills.
* **[React Native WebView](https://github.com/react-native-webview/react-native-webview)**: Hardware-accelerated canvas container for mobile 3D WebGL rendering.

### 💳 Monetization & Infrastructure
* **[RevenueCat (react-native-purchases ready)](https://www.revenuecat.com/)**: In-app purchase integration for free daily quota enforcement (5 solves/day) and Pro subscription paywalls ($2.99/month).

---

## ⚙️ How It Works Under the Hood (Architecture & Engines)

### 1. MobileSolver Math Engine
`src/engine/MobileSolver.js`

The math engine operates strictly in pure JavaScript without requiring browser-only dependencies or native binary modules, allowing it to execute instantly on-device.

* **Symbolic Differentiation:** Parses functions into MathJS expression nodes, evaluates derivatives symbolically via `math.derivative()`, applies algebraic simplification (`math.simplify()`), and generates plain-English step explanations (Power Rule, Product Rule, Quotient Rule, Chain Rule).
* **Numerical Integration (Simpson's 1/3 Rule):** For definite integrals $\int_{a}^{b} f(x) dx$, the engine applies adaptive Simpson's numerical integration with $N=2000$ intervals for 6-decimal precision:
  $$\int_{a}^{b} f(x) dx \approx \frac{h}{3} \left[ f(x_0) + 4\sum f(x_{\text{odd}}) + 2\sum f(x_{\text{even}}) + f(x_n) \right]$$
* **Limit Convergence Evaluator:** Evaluates limits $\lim_{x \to c} f(x)$ by checking for direct substitution first. If an indeterminate form ($0/0$ or $\infty/\infty$) is encountered, it evaluates numerical convergence as $x \to c^\pm$ using decreasing $\epsilon = [10^{-1}, 10^{-2}, 10^{-3}, 10^{-4}]$.
* **Root Finding & Critical Points:** Computes $f'(x)$, solves $f'(x) = 0$ numerically across $[-10, 10]$ using sign-change bisection, and classifies points using the Second Derivative Test ($f''(x) > 0 \implies \text{Min}$, $f''(x) < 0 \implies \text{Max}$).

---

### 2. LaTeX Parsing & Auto-Conversion Pipeline
`parseLatex()` inside `src/engine/MobileSolver.js`

When users paste LaTeX expressions directly from textbook PDFs or web tools (e.g. `$$\int_{0}^{1} x^2 dx$$`):
1. **Delimiter Stripping:** Strips `$$`, `\$`, `\\[`, `\\]`.
2. **Problem Type Detection:** Identifies integral symbols (`\int`), definite bounds (`\int_a^b`), derivatives (`\frac{d}{dx}`), and limits (`\lim_{x \to 0}`).
3. **TeX to MathJS Normalization:** Replaces LaTeX command structures:
   - `\frac{A}{B}` $\longrightarrow$ `(A)/(B)`
   - `\sqrt{A}` $\longrightarrow$ `sqrt(A)`
   - `\sin`, `\cos`, `\ln` $\longrightarrow$ `sin`, `cos`, `log`
   - `\cdot` $\longrightarrow$ `*`
4. **Auto-Populate UI:** Automatically selects the correct problem category tab and prefills lower/upper bounds.

---

### 3. Full-Bleed 3D Surface Visualizer (Three.js)
`src/screens/GraphScreen.js`

* **Tone Mapping & Lighting:** Uses `THREE.ACESFilmicToneMapping` (exposure 1.25) with a 3-point light setup:
  - **Main Point Light (Sky-Blue `#7dd3fc`):** Intensity 3.5 at `(4, 5, 4)`
  - **Secondary Light (Rose `#f472b6`):** Intensity 2.5 at `(-4, -3, 3)`
  - **Rim Light (Indigo `#818cf8`):** Intensity 1.8 at `(0, 6, -5)`
* **Height-Based Color Shading:** Computes height $z = f(x,y)$ on a $48 \times 48$ resolution grid. Vertices are dynamically shaded using custom height ratios $t = (z - z_{\min})/z_{\text{range}}$ to produce cyan-indigo-emerald gradients.
* **Dual Mesh Overlay:** Combines a semi-transparent Phong surface (`opacity: 0.75`, `shininess: 90`) with a cyan wireframe mesh (`opacity: 0.3`) and 220 floating ambient space particles.
* **Touch Spherical Orbit Controls:** Touch handlers calculate spherical coordinates $(\theta, \phi, r)$ to enable smooth 3D rotation, pinch zooming, and idle auto-rotation.

---

### 4. 2D Vector Graphing Engine (SVG)
`<Graph2D />` inside `src/screens/GraphScreen.js`

* **Coordinate System Normalization:** Maps mathematical coordinates $(x, y) \in [x_{\min}, x_{\max}] \times [y_{\min}, y_{\max}]$ to screen pixel space $(s_x, s_y)$:
  $$s_x = \frac{x - x_{\min}}{x_{\max} - x_{\min}} \cdot W, \quad s_y = H - \frac{y - y_{\min}}{y_{\max} - y_{\min}} \cdot H$$
* **Multi-Curve Plotting:** Plots the main function $f(x)$ (Sky-Blue), numerical derivative $f'(x)$ (Rose-Pink), and cumulative integral $\int f(x) dx$ (Emerald) simultaneously.
* **Integral Area Fill:** Generates SVG polygon paths connecting curve points to the zero-axis line with a translucent linear gradient fill.

---

### 5. RevenueCat Quota & Monetization Engine
`src/context/ProContext.js` & `src/screens/PaywallScreen.js`

* **Quota Tracking:** Enforces a daily limit of **5 free solves** for basic problems.
* **Feature Gating:** Restricts advanced problem types (Definite Integrals & Critical Points) to Pro users.
* **Subscription Paywall:** Interactive modal showing a $2.99/month pricing card with a 3-day free trial, feature breakdown, restore purchases option, and simulated checkout flow ready for live RevenueCat credentials.

---

## 📱 App Features

| Screen | Features |
|---|---|
| **◈ Home** | Hero header with math symbols, quick example prefill cards, quota status banner, and feature overview grid. |
| **∑ Solver** | Problem category selector, expression input with LaTeX auto-detect, math keyboard, parameter controls, and expandable step-by-step cards. |
| **∿ Graph** | **2D Plotter:** $f(x)$, $f'(x)$, $\int f(x)dx$ toggles, zoom/pan controls, range controls.<br>**3D Visualizer:** Edge-to-edge Three.js surface with preset shapes (Ripple, Saddle, Paraboloid, Gaussian, Waves, Cone, Monkey Saddle). |
| **★ Pro** | Pro status indicator, $2.99/mo trial purchase button, feature comparison checklist, and restore purchases button. |

---

## 🚀 Installation & Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Expo Go App](https://expo.dev/go) installed on your iOS or Android device

### 1. Clone the Repository
```bash
git clone https://github.com/bishleshan/CalcLab.git
cd CalcLab
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start the Development Server
```bash
npx expo start
```

### 4. Open on Phone
- Open **Expo Go** on your device.
- Scan the QR code displayed in your terminal window.

---

## 📁 Project Directory Structure

```text
CalcLab/
├── App.js                 # App Root, Navigation Container & Provider Setup
├── index.js               # Expo Entry Point
├── app.json               # Expo App Configuration & Metadata
├── package.json           # Dependencies & Scripts
├── README.md              # Complete Project Documentation
├── assets/                # App Icons & Splash Screen Assets
└── src/
    ├── constants/
    │   └── theme.js       # Glass Palette Colors & Problem Category Definitions
    ├── context/
    │   └── ProContext.js  # Solve Quota & RevenueCat Monetization State
    ├── engine/
    │   └── MobileSolver.js# Math Engine, Derivative/Integral Solvers & LaTeX Parser
    └── screens/
        ├── HomeScreen.js    # Home Screen with Hero & Quick Prefill Examples
        ├── SolverScreen.js  # Main Step-by-Step Problem Solver UI
        ├── GraphScreen.js   # 2D Vector Grapher & 3D Three.js Surface Engine
        └── PaywallScreen.js # RevenueCat Subscription Paywall UI
```

---

## 👤 Author & License

* **Author:** Bishleshan ([@bishleshan](https://github.com/bishleshan))
* **Email:** bishleshandahal1@gmail.com
* **License:** [MIT License](LICENSE)
