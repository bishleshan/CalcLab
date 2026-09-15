// src/screens/HomeScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { usePro } from '../context/ProContext';

const STUDY_MODULES = [
  {
    id: 'derivatives',
    title: 'Differential Calculus',
    badge: 'CALC I',
    badgeColor: '#38bdf8',
    desc: 'Instant step-by-step differentiation with rule breakdown (Power, Chain, Product, Quotient).',
    icon: 'flash-outline',
    target: 'Solver',
    params: { prefill: { type: 'derivative', expr: 'x^3 + 2*x', variable: 'x', order: '1' } },
  },
  {
    id: 'integrals',
    title: 'Integral Calculus',
    badge: 'CALC I & II',
    badgeColor: '#34d399',
    desc: 'Indefinite antiderivatives and definite integrals with Simpson approximation and area fill.',
    icon: 'infinite-outline',
    target: 'Solver',
    params: { prefill: { type: 'integral', expr: 'x^2 * cos(x)', variable: 'x' } },
  },
  {
    id: '2d-grapher',
    title: '2D Visual Explorer',
    badge: 'CURVES & TANGENTS',
    badgeColor: '#f472b6',
    desc: 'Interactive coordinate tracer showing real-time f(x), slope f\'(x), and accumulated area.',
    icon: 'pulse-outline',
    target: 'Graph',
    params: { prefill: 'x^3 - 3*x' },
  },
  {
    id: '3d-surface',
    title: '3D Surface Visualizer',
    badge: 'MULTIVARIABLE',
    badgeColor: '#818cf8',
    desc: 'Full-bleed 3D surfaces with solid lighting, contours, rotation, and camera angle HUD.',
    icon: 'cube-outline',
    target: 'Graph',
    params: { initialMode: '3d' },
  },
];

const CURATED_PROBLEMS = [
  {
    category: 'Limits & Continuity',
    items: [
      { label: 'Fundamental Trig Limit', detail: 'lim (x→0) sin(x)/x', type: 'limit', expr: 'sin(x)/x', approach: '0' },
      { label: 'Rational Indeterminate', detail: 'lim (x→2) (x^2 - 4)/(x - 2)', type: 'limit', expr: '(x^2 - 4)/(x - 2)', approach: '2' },
    ],
  },
  {
    category: 'Derivatives & Extrema',
    items: [
      { label: 'Polynomial & Power Rule', detail: 'd/dx [x^4 - 4x^2 + 1]', type: 'derivative', expr: 'x^4 - 4*x^2 + 1' },
      { label: 'Critical Points & Max/Min', detail: "Solve f'(x)=0 for x^3 - 3x", type: 'critical', expr: 'x^3 - 3*x' },
      { label: 'Product & Trig Chain', detail: 'd/dx [x^2 * sin(x)]', type: 'derivative', expr: 'x^2 * sin(x)' },
    ],
  },
  {
    category: 'Integrals & Area',
    items: [
      { label: 'Definite Area under Parabola', detail: '∫[0, 2] (x^2) dx', type: 'definite-integral', expr: 'x^2', lower: '0', upper: '2' },
      { label: 'Integration by Parts', detail: '∫ x * cos(x) dx', type: 'integral', expr: 'x * cos(x)' },
      { label: 'Exponential Decay', detail: '∫ e^(-x) dx', type: 'integral', expr: 'exp(-x)' },
    ],
  },
];

const QUICK_STUDY_TIPS = [
  {
    title: 'Fundamental Theorem of Calculus',
    formula: 'd/dx ∫[a, x] f(t) dt = f(x)',
    tip: 'Differentiation and integration are inverse operations. The rate of accumulation is the original function.',
  },
  {
    title: 'Derivative as Slope',
    formula: "f'(x) = lim (h→0) [f(x+h) - f(x)] / h",
    tip: 'The derivative at any point gives the exact slope of the tangent line touching the curve.',
  },
  {
    title: 'Second Derivative Test',
    formula: "f''(c) > 0 → Local Min  |  f''(c) < 0 → Local Max",
    tip: 'Check concavity at critical points where f\'(c) = 0 to rapidly classify peaks and valleys.',
  },
];

function triggerSelection() {
  Haptics.selectionAsync().catch(() => {});
}

export default function HomeScreen({ navigation }) {
  const { isPro, remaining, FREE_LIMIT } = usePro();
  const [activeTipIndex, setActiveTipIndex] = useState(0);

  function openSolver(prefill) {
    triggerSelection();
    navigation.navigate('Solver', { prefill });
  }

  function handleModulePress(module) {
    triggerSelection();
    if (module.target === 'Solver') {
      navigation.navigate('Solver', module.params);
    } else if (module.target === 'Graph') {
      navigation.navigate('Graph', module.params);
    }
  }

  const currentTip = QUICK_STUDY_TIPS[activeTipIndex];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Clean, Calming Study Header */}
        <LinearGradient
          colors={['#0c1938', '#07122a', '#040a1c']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.headerCard}
        >
          <View style={s.headerPillRow}>
            <View style={s.headerPill}>
              <Text style={s.headerPillText}>CALCULUS STUDY LAB</Text>
            </View>
            <View style={s.headerSubPill}>
              <Text style={s.headerSubPillText}>CALC I & II</Text>
            </View>
          </View>

          <Text style={s.headerTitle}>CalcLab</Text>
          <Text style={s.headerSubtitle}>
            Master calculus concepts with step-by-step symbolic derivation, live 2D tangent graphing, and solid 3D multivariable visualizers.
          </Text>

          {/* Quick Study Navigation Bar */}
          <View style={s.quickNavGrid}>
            <TouchableOpacity
              style={s.quickNavBtn}
              onPress={() => { triggerSelection(); navigation.navigate('Solver'); }}
              accessibilityRole="button"
              accessibilityLabel="Open Problem Solver"
            >
              <View style={[s.quickNavIcon, { backgroundColor: 'rgba(56,189,248,0.12)' }]}>
                <Ionicons name="calculator-outline" size={18} color="#38bdf8" />
              </View>
              <Text style={s.quickNavLabel}>Solver</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.quickNavBtn}
              onPress={() => { triggerSelection(); navigation.navigate('Graph'); }}
              accessibilityRole="button"
              accessibilityLabel="Open 2D and 3D Graphs"
            >
              <View style={[s.quickNavIcon, { backgroundColor: 'rgba(244,114,182,0.12)' }]}>
                <Ionicons name="analytics-outline" size={18} color="#f472b6" />
              </View>
              <Text style={s.quickNavLabel}>2D Graph</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.quickNavBtn}
              onPress={() => { triggerSelection(); navigation.navigate('Graph', { initialMode: '3d' }); }}
              accessibilityRole="button"
              accessibilityLabel="Open 3D Surface Visualizer"
            >
              <View style={[s.quickNavIcon, { backgroundColor: 'rgba(129,140,248,0.12)' }]}>
                <Ionicons name="cube-outline" size={18} color="#818cf8" />
              </View>
              <Text style={s.quickNavLabel}>3D Surface</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.quickNavBtn}
              onPress={() => { triggerSelection(); navigation.navigate('Pro'); }}
              accessibilityRole="button"
              accessibilityLabel="View Pro Study Features"
            >
              <View style={[s.quickNavIcon, { backgroundColor: 'rgba(255,215,0,0.12)' }]}>
                <Ionicons name="star-outline" size={18} color="#ffd700" />
              </View>
              <Text style={s.quickNavLabel}>{isPro ? 'Pro' : 'Unlock'}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Daily Study Quota & Plan Status */}
        <View style={s.studyStatusCard}>
          <View style={s.statusIconCircle}>
            <Ionicons
              name={isPro ? 'sparkles' : 'book-outline'}
              size={18}
              color={isPro ? COLORS.proGold : COLORS.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statusTitleText}>
              {isPro ? 'CalcLab Pro Study Mode' : 'Daily Practice Plan'}
            </Text>
            <Text style={s.statusSubText}>
              {isPro
                ? 'Unlimited solves, full step breakdowns, and advanced problem categories unlocked.'
                : `${remaining} of ${FREE_LIMIT} daily free practice solves available today.`}
            </Text>
          </View>
          {!isPro && (
            <TouchableOpacity
              style={s.upgradeChip}
              onPress={() => { triggerSelection(); navigation.navigate('Pro'); }}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Pro"
            >
              <Text style={s.upgradeChipText}>Pro</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Study Modules Overview */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitleText}>Study Focus Areas</Text>
          <Text style={s.sectionBadgeText}>4 LABS</Text>
        </View>

        <View style={s.moduleList}>
          {STUDY_MODULES.map((mod) => (
            <TouchableOpacity
              key={mod.id}
              style={s.moduleCard}
              onPress={() => handleModulePress(mod)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${mod.title}`}
            >
              <View style={s.moduleHeader}>
                <View style={[s.moduleIconWrap, { borderColor: `${mod.badgeColor}40` }]}>
                  <Ionicons name={mod.icon} size={20} color={mod.badgeColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.moduleTitleRow}>
                    <Text style={s.moduleTitle}>{mod.title}</Text>
                    <View style={[s.moduleBadge, { backgroundColor: `${mod.badgeColor}18` }]}>
                      <Text style={[s.moduleBadgeText, { color: mod.badgeColor }]}>{mod.badge}</Text>
                    </View>
                  </View>
                  <Text style={s.moduleDesc}>{mod.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick Study Tip / Concept Flashcard */}
        <View style={s.tipCard}>
          <View style={s.tipTopRow}>
            <View style={s.tipBadge}>
              <Ionicons name="bulb-outline" size={14} color="#34d399" />
              <Text style={s.tipBadgeText}>STUDY CONCEPT</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                triggerSelection();
                setActiveTipIndex((prev) => (prev + 1) % QUICK_STUDY_TIPS.length);
              }}
              style={s.nextTipBtn}
            >
              <Text style={s.nextTipText}>Next Concept ↻</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.tipTitle}>{currentTip.title}</Text>
          <View style={s.tipFormulaBox}>
            <Text style={s.tipFormula}>{currentTip.formula}</Text>
          </View>
          <Text style={s.tipText}>{currentTip.tip}</Text>
        </View>

        {/* Curated Practice Problems */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitleText}>Practice Library</Text>
          <TouchableOpacity onPress={() => openSolver()}>
            <Text style={s.customProblemLink}>Custom Input →</Text>
          </TouchableOpacity>
        </View>

        {CURATED_PROBLEMS.map((cat) => (
          <View key={cat.category} style={s.categoryBlock}>
            <Text style={s.categoryTitle}>{cat.category.toUpperCase()}</Text>
            {cat.items.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={s.problemCard}
                onPress={() => openSolver(item)}
                accessibilityRole="button"
                accessibilityLabel={`Solve ${item.label}`}
              >
                <View style={s.problemIconCircle}>
                  <Ionicons
                    name={
                      item.type === 'derivative'
                        ? 'trending-up-outline'
                        : item.type === 'limit'
                        ? 'locate-outline'
                        : item.type === 'critical'
                        ? 'flag-outline'
                        : 'shapes-outline'
                    }
                    size={16}
                    color={COLORS.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.problemLabel}>{item.label}</Text>
                  <Text style={s.problemDetail}>{item.detail}</Text>
                </View>
                <View style={s.solveNowPill}>
                  <Text style={s.solveNowText}>Solve</Text>
                  <Ionicons name="arrow-forward" size={12} color={COLORS.primary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <View style={{ height: 28 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },

  headerCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.16)',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  headerPillRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  headerPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(56,189,248,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
  },
  headerPillText: { color: '#38bdf8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  headerSubPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.25)',
  },
  headerSubPillText: { color: '#34d399', fontSize: 10, fontWeight: '800' },
  headerTitle: { fontSize: 36, fontWeight: '900', color: COLORS.white, letterSpacing: -0.5 },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  quickNavGrid: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  quickNavBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    gap: 6,
  },
  quickNavIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickNavLabel: { color: COLORS.white, fontSize: 11, fontWeight: '700' },

  studyStatusCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.14)',
    backgroundColor: 'rgba(8,16,40,0.65)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(125,211,252,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitleText: { color: COLORS.white, fontSize: 13, fontWeight: '800' },
  statusSubText: { color: COLORS.textDim, fontSize: 11, lineHeight: 16, marginTop: 2 },
  upgradeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  upgradeChipText: { color: '#ffd700', fontSize: 11, fontWeight: '800' },

  sectionHeaderRow: {
    marginTop: 22,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleText: { fontSize: 15, fontWeight: '800', color: COLORS.white, letterSpacing: 0.2 },
  sectionBadgeText: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  customProblemLink: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },

  moduleList: { gap: 10 },
  moduleCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  moduleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moduleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
  },
  moduleTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  moduleTitle: { color: COLORS.white, fontSize: 14, fontWeight: '800' },
  moduleBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  moduleBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  moduleDesc: { color: COLORS.textDim, fontSize: 11, lineHeight: 16, marginTop: 4 },

  tipCard: {
    marginTop: 18,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.22)',
    backgroundColor: 'rgba(6,24,30,0.6)',
  },
  tipTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tipBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tipBadgeText: { color: '#34d399', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  nextTipBtn: { paddingVertical: 2, paddingHorizontal: 6 },
  nextTipText: { color: COLORS.textDim, fontSize: 11, fontWeight: '600' },
  tipTitle: { color: COLORS.white, fontSize: 14, fontWeight: '800', marginBottom: 6 },
  tipFormulaBox: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#34d399',
  },
  tipFormula: { color: '#7dd3fc', fontSize: 12, fontFamily: 'monospace', fontWeight: '700' },
  tipText: { color: 'rgba(255,255,255,0.65)', fontSize: 11, lineHeight: 16 },

  categoryBlock: { marginTop: 12 },
  categoryTitle: { color: COLORS.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8, paddingLeft: 4 },
  problemCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  problemIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(125,211,252,0.08)',
  },
  problemLabel: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  problemDetail: { color: COLORS.textDim, fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  solveNowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(125,211,252,0.08)',
  },
  solveNowText: { color: COLORS.primary, fontSize: 10, fontWeight: '700' },
});
