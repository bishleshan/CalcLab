// src/screens/PaywallScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { usePro } from '../context/ProContext';

const FEATURES = [
  { icon: '∫ab', label: 'Definite Integrals',     free: false },
  { icon: "f'=0", label: 'Critical Points',       free: false },
  { icon: '∫',   label: 'Indefinite Integrals',   free: true  },
  { icon: 'd/dx', label: 'Derivatives any order', free: true  },
  { icon: 'lim',  label: 'Limits',                free: true  },
  { icon: '∞',   label: 'Unlimited Demo Solves',   free: false },
  { iconName: 'document-text-outline', label: 'LaTeX Paste & Convert', free: true },
  { iconName: 'list-outline', label: 'Step-by-Step Explanations', free: true },
];

export default function PaywallScreen({ navigation }) {
  const { isPro, isDemoMode, purchasePro, restorePurchases } = usePro();
  const [loading, setLoading] = useState(false);

  function select() {
    Haptics.selectionAsync().catch(() => {});
  }

  function openTab(tabName) {
    select();
    navigation.navigate(tabName);
  }

  async function handlePurchase() {
    setLoading(true);
    try {
      await purchasePro();
      Alert.alert('CalcLab demo unlocked', 'All features are now open for judging.', [
        { text: 'Let\'s go!', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('Purchase failed', e.message);
    }
    setLoading(false);
  }

  if (isPro) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.demoContainer} showsVerticalScrollIndicator={false}>
          <View style={s.proStar}>
            <Ionicons name="sparkles" size={34} color={COLORS.proGold} />
          </View>
          <Text style={s.proTitle}>{isDemoMode ? 'Judge Mode Unlocked' : "You're on Pro"}</Text>
          <Text style={s.proSub}>All premium calculus tools are open for the hackathon demo.</Text>

          <View style={s.demoPanel}>
            <Text style={s.demoPanelTitle}>Best demo route</Text>
            {[
              'Open the by-parts quick example from Home.',
              'Solve it and expand the step cards.',
              'Tap Graph it to connect the answer to a visual.',
              'Switch to 3D Surface for the visual finale.',
            ].map((item, index) => (
              <View key={item} style={s.demoStep}>
                <View style={s.demoStepNum}><Text style={s.demoStepNumText}>{index + 1}</Text></View>
                <Text style={s.demoStepText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={s.demoActions}>
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => openTab('Solver')}
              accessibilityRole="button"
              accessibilityLabel="Try the calculus solver"
            >
              <Ionicons name="calculator-outline" size={18} color={COLORS.white} />
              <Text style={s.backBtnText}>Try Solver</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.outlineBtn}
              onPress={() => openTab('Graph')}
              accessibilityRole="button"
              accessibilityLabel="Show graphing tools"
            >
              <Ionicons name="analytics-outline" size={18} color={COLORS.primary} />
              <Text style={s.outlineBtnText}>Show Graphs</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.headerSection}>
          <Text style={s.proBadge}>PRO</Text>
          <Text style={s.title}>Unlock CalcLab Demo</Text>
          <Text style={s.subtitle}>Full Calc 1 & 2 solver · No judging limits</Text>
        </View>

        {/* Pricing */}
        <View style={s.priceCard}>
          <Text style={s.priceAmount}>Demo</Text>
          <Text style={s.pricePeriod}>build</Text>
          <Text style={s.priceSub}>No real payment is processed</Text>
        </View>

        {/* Feature list */}
        <View style={s.featureList}>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureRow}>
              {f.iconName
                ? <Ionicons name={f.iconName} size={17} color={COLORS.primary} style={s.featureIconVector} />
                : <Text style={s.featureIcon}>{f.icon}</Text>
              }
              <Text style={s.featureLabel}>{f.label}</Text>
              <Text style={[s.featureStatus, { color: f.free ? COLORS.textDim : COLORS.accent }]}>
                {f.free ? 'Free' : 'Pro'}
              </Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[s.purchaseBtn, loading && { opacity: 0.7 }]}
          onPress={handlePurchase}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Unlock demo mode"
          accessibilityState={{ disabled: loading }}
        >
          {loading
            ? <ActivityIndicator color={COLORS.bg} />
            : <Text style={s.purchaseBtnText}>Unlock Demo Mode</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.restoreBtn} onPress={restorePurchases} accessibilityRole="button" accessibilityLabel="Simulate restoring demo unlock">
          <Text style={s.restoreBtnText}>Restore Demo Unlock</Text>
        </TouchableOpacity>

        <Text style={s.legal}>
          This hackathon build uses a simulated unlock. Add real App Store billing before production.
        </Text>

        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 8 }} accessibilityRole="button" accessibilityLabel="Close unlock screen">
          <Text style={s.skipText}>Not now →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 24, alignItems: 'center' },
  demoContainer: { padding: 24, alignItems: 'center', paddingBottom: 40 },
  proStar: {
    width: 66,
    height: 66,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.24)',
    marginBottom: 18,
  },
  proTitle: { fontSize: 28, fontWeight: '800', color: COLORS.white, marginBottom: 8 },
  proSub: { fontSize: 16, color: COLORS.textDim, marginBottom: 32, textAlign: 'center' },
  demoPanel: { width: '100%', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, padding: 14, marginBottom: 18 },
  demoPanelTitle: { color: COLORS.white, fontSize: 15, fontWeight: '900', marginBottom: 12 },
  demoStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  demoStepNum: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(125,211,252,0.1)' },
  demoStepNumText: { color: COLORS.primary, fontSize: 12, fontWeight: '900' },
  demoStepText: { flex: 1, color: COLORS.textSoft, fontSize: 13, lineHeight: 19 },
  demoActions: { width: '100%', flexDirection: 'row', gap: 10 },
  backBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 8, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  backBtnText: { color: COLORS.white, fontWeight: '800', fontSize: 15 },
  outlineBtn: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(125,211,252,0.26)', backgroundColor: 'rgba(125,211,252,0.06)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  outlineBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 15 },
  headerSection: { alignItems: 'center', marginBottom: 20 },
  proBadge: { color: COLORS.proGold, fontSize: 13, letterSpacing: 0, fontWeight: '700', marginBottom: 10 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.white, textAlign: 'center', lineHeight: 34 },
  subtitle: { fontSize: 14, color: COLORS.textDim, marginTop: 6, textAlign: 'center', letterSpacing: 0 },
  priceCard: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 6 },
  priceAmount: { fontSize: 42, fontWeight: '900', color: COLORS.accent },
  pricePeriod: { fontSize: 16, color: COLORS.textDim, marginBottom: 8 },
  priceSub: { position: 'absolute', bottom: -18, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: COLORS.textFaint },
  featureList: { width: '100%', marginTop: 32, gap: 2 },
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 12 },
  featureIcon: { fontSize: 16, width: 28, textAlign: 'center' },
  featureIconVector: { width: 28, textAlign: 'center' },
  featureLabel: { flex: 1, color: COLORS.white, fontSize: 14 },
  featureStatus: { fontSize: 11, fontWeight: '600', letterSpacing: 0 },
  purchaseBtn: { width: '100%', marginTop: 24, paddingVertical: 18, borderRadius: 8, backgroundColor: COLORS.accent, alignItems: 'center', shadowColor: COLORS.accent, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  purchaseBtnText: { color: COLORS.bg, fontSize: 17, fontWeight: '800', letterSpacing: 0 },
  restoreBtn: { marginTop: 12, padding: 10 },
  restoreBtnText: { color: COLORS.textDim, fontSize: 13 },
  legal: { marginTop: 16, fontSize: 10, color: COLORS.textFaint, textAlign: 'center', lineHeight: 16, paddingHorizontal: 10 },
  skipText: { color: COLORS.textDim, fontSize: 14, marginTop: 8 },
});
