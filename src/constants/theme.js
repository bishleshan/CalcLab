// src/constants/theme.js
export const COLORS = {
  bg: '#080F1E',
  bgCard: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.12)',
  primary: '#7dd3fc',     // sky blue
  secondary: '#818cf8',  // indigo
  accent: '#34d399',     // emerald
  pink: '#f472b6',
  warn: '#fb923c',
  white: '#FFFFFF',
  textSoft: 'rgba(255,255,255,0.72)',
  textDim: 'rgba(255,255,255,0.5)',
  textFaint: 'rgba(255,255,255,0.25)',
  proGold: '#FFD700',
};

export const FONTS = {
  mono: 'monospace',
};

export const PROBLEM_TYPES = [
  { id: 'derivative',          label: 'd/dx',     icon: "d/dx",  fullLabel: 'Derivative',          free: true  },
  { id: 'integral',            label: '∫',         icon: "∫",     fullLabel: 'Integral',             free: true  },
  { id: 'definite-integral',   label: '∫ₐᵇ',      icon: "∫ₐᵇ",  fullLabel: 'Definite Integral',    free: false },
  { id: 'limit',               label: 'lim',      icon: "lim",   fullLabel: 'Limit',                free: true  },
  { id: 'critical',            label: "f'=0",     icon: "f'=0",  fullLabel: 'Critical Points',      free: false },
];
