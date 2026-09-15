# ◈ CalcLab Mobile (Expo / React Native)

An interactive, high-performance calculus learning environment and step-by-step problem solver covering Undergrad Calculus I & II for iOS and Android.

---

## 🌟 Key Features
- **⚡ Step-by-Step Calculus Solver:** Derivatives (order 1 & higher), Indefinite Integrals, Definite Integrals, Limits, Critical Points, and Taylor Series.
- **📋 Automatic LaTeX Paste:** Copy LaTeX from textbooks or AI output (e.g. `$$\int (x^2+2x)\cos(x) dx$$`) — auto-parsed and processed seamlessly.
- **🌐 Interactive 3D Surface Visualizer:** Full-bleed Three.js 3D surface rendering with ACES Filmic Tone Mapping, multi-point lighting, and height-based color gradients.
- **📈 2D Vector Graph Visualizer:** Simultaneous vector plotting of $f(x)$, $f'(x)$, and $\int f(x) dx$ area fill with interactive zoom/pan controls.
- **💳 RevenueCat Subscription Ready:** Integrated free solve quota (5/day) & Pro subscription paywall ($2.99/mo).

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Mobile Dev Server
```bash
npx expo start
```

### 3. Open on Phone
- Install **Expo Go** on your iPhone (App Store) or Android (Play Store).
- Scan the QR code from your terminal.

---

## 📁 Project Structure

```
CalcLab/
├── App.js                 # Navigation container & RevenueCat Pro provider
├── index.js               # Root Expo entry point
├── app.json               # Expo project metadata
├── package.json
└── src/
    ├── engine/            # Pure-JS MobileSolver math engine (mathjs)
    ├── context/           # RevenueCat Pro subscription context & quota manager
    ├── screens/           # HomeScreen, SolverScreen, GraphScreen (2D/3D), PaywallScreen
    └── constants/         # Glass palette theme & problem definitions
```
