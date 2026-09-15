// src/screens/HomeScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { usePro } from '../context/ProContext';

const QUICK_EXAMPLES = [
  { label: 'Derivative', detail: 'd/dx [x^3 + 2x]', type: 'derivative', expr: 'x^3 + 2*x' },
  { label: 'By parts', detail: 'integral of x^2 cos(x)', type: 'integral', expr: 'x^2*cos(x)' },
  { label: 'Area', detail: 'integral from 0 to 1 of x^2', type: 'definite-integral', expr: 'x^2', lower: '0', upper: '1' },
  { label: 'Limit', detail: 'lim x->0 sin(x)/x', type: 'limit', expr: 'sin(x)/x', approach: '0' },
  { label: 'Optimization', detail: "critical points of x^3 - 3x", type: 'critical', expr: 'x^3 - 3*x' },
];

const FEATURE_CARDS = [
  { icon: 'document-text-outline', title: 'Paste LaTeX', desc: 'Converts textbook notation into solvable input.' },
  { icon: 'list-outline', title: 'Guided Steps', desc: 'Shows rules, checks, and plain-language reasoning.' },
  { icon: 'analytics-outline', title: '2D + 3D Graphs', desc: 'Plots functions, derivatives, integrals, and surfaces.' },
  { icon: 'school-outline', title: 'Calc I + II', desc: 'Built for derivatives, integrals, limits, and extrema.' },
];

function triggerSelection() {
  Haptics.selectionAsync().catch(() => {});
}

export default function HomeScreen({ navigation }) {
  const { isPro, remaining, FREE_LIMIT, isDemoMode } = usePro();

  function openSolver(prefill) {
    triggerSelection();
    navigation.navigate('Solver', { prefill });
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#0f1b3d', '#0b1228', '#07111f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.hero}
        >
          <View style={s.heroTop}>
            <View>
              <Text style={s.eyebrow}>HACKATHON DEMO</Text>
              <Text style={s.heroTitle}>CalcLab</Text>
            </View>
            <View style={s.logoMark}>
              <Ionicons name="calculator" size={28} color={COLORS.primary} />
            </View>
          </View>

          <Text style={s.heroSub}>A calculus lab that solves, explains, and visualizes Calc I and II problems.</Text>

          <View style={s.heroActions}>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => openSolver()}
              accessibilityRole="button"
              accessibilityLabel="Start solving a custom calculus problem"
            >
              <Ionicons name="flash" size={18} color={COLORS.bg} />
              <Text style={s.primaryBtnText}>Start Solving</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => { triggerSelection(); navigation.navigate('Graph'); }}
              accessibilityRole="button"
              accessibilityLabel="Open graphing tools"
            >
              <Ionicons name="analytics" size={18} color={COLORS.primary} />
              <Text style={s.secondaryBtnText}>Open Graphs</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <View style={s.statusCard}>
          <Ionicons
            name={isPro ? 'sparkles' : 'time-outline'}
            size={18}
            color={isPro ? COLORS.proGold : COLORS.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.statusTitle}>{isDemoMode ? 'Judge mode unlocked' : isPro ? 'Pro unlocked' : 'Free plan'}</Text>
            <Text style={s.statusText}>
              {isPro ? 'All solver types are available for the demo.' : `${remaining}/${FREE_LIMIT} free solves left today.`}
            </Text>
          </View>
        </View>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Quick Wins</Text>
          <TouchableOpacity onPress={() => openSolver()} accessibilityRole="button" accessibilityLabel="Open a custom solver problem">
            <Text style={s.sectionAction}>Custom</Text>
          </TouchableOpacity>
        </View>

        {QUICK_EXAMPLES.map((ex) => (
          <TouchableOpacity
            key={`${ex.type}-${ex.expr}`}
            style={s.exampleCard}
            onPress={() => openSolver(ex)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${ex.label} example: ${ex.detail}`}
          >
            <View style={s.exampleIcon}>
              <Ionicons name="flask-outline" size={18} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.exampleLabel}>{ex.label}</Text>
              <Text style={s.exampleDetail}>{ex.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textDim} />
          </TouchableOpacity>
        ))}

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Why It Stands Out</Text>
        </View>

        <View style={s.featureGrid}>
          {FEATURE_CARDS.map((feature) => (
            <View key={feature.title} style={s.featureCard}>
              <Ionicons name={feature.icon} size={22} color={COLORS.secondary} />
              <Text style={s.featureTitle}>{feature.title}</Text>
              <Text style={s.featureDesc}>{feature.desc}</Text>
            </View>
          ))}
        </View>

        <View style={s.pitchCard}>
          <Text style={s.pitchTitle}>Demo story</Text>
          <Text style={s.pitchText}>
            Paste a messy calculus expression, solve it step by step, then jump to the graph to connect symbolic work with visual intuition.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  hero: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.18)',
    padding: 18,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 },
  eyebrow: { color: COLORS.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0, marginBottom: 6 },
  heroTitle: { fontSize: 46, fontWeight: '900', color: COLORS.white, letterSpacing: 0 },
  logoMark: {
    width: 54,
    height: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(125,211,252,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.24)',
  },
  heroSub: { color: COLORS.textSoft, fontSize: 15, lineHeight: 22, marginTop: 14, marginBottom: 18 },
  heroActions: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: { color: COLORS.bg, fontSize: 14, fontWeight: '900' },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.26)',
    backgroundColor: 'rgba(125,211,252,0.06)',
  },
  secondaryBtnText: { color: COLORS.primary, fontSize: 14, fontWeight: '800' },
  statusCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusTitle: { color: COLORS.white, fontSize: 14, fontWeight: '800' },
  statusText: { color: COLORS.textDim, fontSize: 12, marginTop: 2, lineHeight: 17 },
  sectionHeader: { marginTop: 22, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: COLORS.white },
  sectionAction: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  exampleCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  exampleIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(125,211,252,0.08)',
  },
  exampleLabel: { color: COLORS.white, fontSize: 14, fontWeight: '800' },
  exampleDetail: { color: COLORS.textDim, fontSize: 12, marginTop: 3, fontFamily: 'monospace' },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  featureCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 136,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgCard,
  },
  featureTitle: { color: COLORS.white, fontWeight: '800', fontSize: 14, marginTop: 12, marginBottom: 6 },
  featureDesc: { color: COLORS.textDim, fontSize: 12, lineHeight: 17 },
  pitchCard: {
    marginTop: 18,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.24)',
    backgroundColor: 'rgba(52,211,153,0.07)',
  },
  pitchTitle: { color: COLORS.accent, fontSize: 14, fontWeight: '900', marginBottom: 6 },
  pitchText: { color: COLORS.textSoft, fontSize: 13, lineHeight: 19 },
});
