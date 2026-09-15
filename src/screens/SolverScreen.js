// src/screens/SolverScreen.js
import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, PROBLEM_TYPES } from '../constants/theme';
import { usePro } from '../context/ProContext';
import {
  solveDerivative, solveIntegral, solveDefiniteIntegral,
  solveLimit, solveCriticalPoints, parseLatex,
} from '../engine/MobileSolver';

function tap() {
  Haptics.selectionAsync().catch(() => {});
}

function notify(type) {
  Haptics.notificationAsync(type).catch(() => {});
}

export default function SolverScreen({ navigation, route }) {
  const { isPro, canSolve, remaining, FREE_LIMIT, recordSolve } = usePro();
  const [selectedType, setSelectedType] = useState('derivative');
  const [expr, setExpr] = useState('');
  const [variable, setVariable] = useState('x');
  const [lower, setLower] = useState('0');
  const [upper, setUpper] = useState('1');
  const [approach, setApproach] = useState('0');
  const [order, setOrder] = useState('1');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedStep, setExpandedStep] = useState(null);
  const [latexDetected, setLatexDetected] = useState(false);
  const scrollRef = useRef();

  const currentType = PROBLEM_TYPES.find(t => t.id === selectedType);
  const isProType = currentType && !currentType.free;

  useEffect(() => {
    const prefill = route?.params?.prefill;
    if (!prefill) return;

    setSelectedType(prefill.type || 'derivative');
    setExpr(prefill.expr || '');
    setVariable(prefill.variable || 'x');
    if (prefill.lower) setLower(prefill.lower);
    if (prefill.upper) setUpper(prefill.upper);
    if (prefill.approach) setApproach(prefill.approach);
    if (prefill.order) setOrder(String(prefill.order));
    setResult(null);
    setExpandedStep(null);
    navigation.setParams?.({ prefill: undefined });
  }, [navigation, route?.params?.prefill]);

  function handlePaste(text) {
    const isLatex = /\$|\\\[|\\\(|\\int\b|\\frac\b|\\lim\b|\\cos\b|\\sin\b|\\sqrt\b/.test(text);
    if (isLatex) {
      const parsed = parseLatex(text);
      setExpr(parsed.expr);
      if (parsed.type) setSelectedType(parsed.type);
      if (parsed.params.variable) setVariable(parsed.params.variable);
      if (parsed.params.approach) setApproach(parsed.params.approach);
      if (parsed.params.lower) setLower(parsed.params.lower);
      if (parsed.params.upper) setUpper(parsed.params.upper);
      if (parsed.params.order) setOrder(String(parsed.params.order));
      setLatexDetected(true);
      setTimeout(() => setLatexDetected(false), 3000);
    } else {
      setExpr(text);
    }
  }

  function insertSymbol(sym) {
    tap();
    setExpr(e => e + sym);
  }

  async function handleSolve() {
    if (!expr.trim()) { Alert.alert('Enter an expression first'); return; }
    if (isProType && !isPro) {
      notify(Haptics.NotificationFeedbackType.Warning);
      navigation.navigate('Paywall');
      return;
    }
    if (!canSolve) {
      notify(Haptics.NotificationFeedbackType.Warning);
      navigation.navigate('Paywall');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Keyboard.dismiss();
    setLoading(true);
    setResult(null);
    setExpandedStep(null);

    await new Promise(r => setTimeout(r, 120)); // allow render

    try {
      let res;
      const v = variable || 'x';
      const ord = parseInt(order) || 1;
      switch (selectedType) {
        case 'derivative':         res = solveDerivative(expr, v, ord); break;
        case 'integral':           res = solveIntegral(expr, v); break;
        case 'definite-integral':  res = solveDefiniteIntegral(expr, v, lower, upper); break;
        case 'limit':              res = solveLimit(expr, v, approach); break;
        case 'critical':           res = solveCriticalPoints(expr, v); break;
        default:                   res = solveDerivative(expr, v, 1);
      }
      if (res.status !== 'error') recordSolve();
      setResult(res);
      notify(res.status === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 400, animated: true }), 300);
    } catch (e) {
      setResult({ answer: 'Error', steps: [{ title: 'Error', math: e.message, explanation: '' }], status: 'error' });
      notify(Haptics.NotificationFeedbackType.Error);
    }
    setLoading(false);
  }

  function graphCurrentExpression() {
    const graphTarget = result?.graphExpr || expr.trim();
    if (!graphTarget) return;
    tap();
    navigation.navigate('Graph', { prefill: graphTarget });
  }

  const mathKeys = ['x', '^', '(', ')', '*', '/', 'sin(', 'cos(', 'tan(', 'log(', 'sqrt(', 'pi', 'e', '+', '-'];
  const graphActionLabel = result?.graphExpr && result.graphExpr !== expr.trim() ? 'Graph result' : 'Graph function';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} style={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerTitleRow}>
              <Ionicons name="calculator-outline" size={24} color={COLORS.primary} />
              <Text style={s.headerTitle}>Calculus Solver</Text>
            </View>
            <Text style={s.headerSub}>Calc I & II · Step-by-Step</Text>
          </View>

          {/* Pro / Free badge */}
          {!isPro && (
            <TouchableOpacity
              style={s.quotaBadge}
              onPress={() => navigation.navigate('Paywall')}
              accessibilityRole="button"
              accessibilityLabel={`${remaining} of ${FREE_LIMIT} free solves left. Open upgrade screen.`}
            >
              <Text style={s.quotaText}>
                {remaining > 0
                  ? `${remaining}/${FREE_LIMIT} free solves left`
                  : 'Upgrade for unlimited solves'}
              </Text>
            </TouchableOpacity>
          )}
          {isPro && (
            <View style={[s.quotaBadge, { borderColor: 'rgba(255, 215, 0, 0.35)', backgroundColor: 'rgba(255, 215, 0, 0.08)', flexDirection: 'row', alignItems: 'center' }]}>
              <Ionicons name="sparkles" size={12} color={COLORS.proGold} style={{ marginRight: 5 }} />
              <Text style={[s.quotaText, { color: COLORS.proGold, fontWeight: '700' }]}>PRO · Unlimited Solves</Text>
            </View>
          )}

          {/* LaTeX detected badge */}
          {latexDetected && (
            <View style={s.latexBadge}>
              <Text style={s.latexBadgeText}>LaTeX detected & converted</Text>
            </View>
          )}

          {/* Problem type selector */}
          <Text style={s.sectionLabel}>PROBLEM TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.typeScroll}>
            {PROBLEM_TYPES.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[s.typeBtn, selectedType === t.id && s.typeBtnActive, !t.free && !isPro && s.typeBtnLocked]}
                onPress={() => { tap(); setSelectedType(t.id); }}
                accessibilityRole="button"
                accessibilityLabel={`${t.fullLabel}${!t.free && !isPro ? ', Pro feature' : ''}`}
                accessibilityState={{ selected: selectedType === t.id, disabled: !t.free && !isPro }}
              >
                <Text style={[s.typeBtnIcon, selectedType === t.id && { color: COLORS.secondary }]}>{t.icon}</Text>
                <Text style={[s.typeBtnLabel, selectedType === t.id && { color: COLORS.secondary }]}>
                  {t.fullLabel}
                </Text>
                {!t.free && !isPro && <Text style={s.lockBadge}>PRO</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Expression input */}
          <Text style={s.sectionLabel}>EXPRESSION</Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.exprInput}
              value={expr}
              onChangeText={handlePaste}
              placeholder="e.g. x^3 + 2*x  or paste LaTeX"
              placeholderTextColor={COLORS.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            {expr.length > 0 && (
              <TouchableOpacity
                style={s.clearBtn}
                onPress={() => { setExpr(''); setResult(null); }}
                accessibilityRole="button"
                accessibilityLabel="Clear expression"
              >
                <Ionicons name="close-outline" size={20} color={COLORS.textDim} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.pasteHint}>Paste LaTeX like <Text style={{ color: COLORS.secondary }}>$$\int x^2 dx$$</Text> - auto-detected.</Text>

          {/* Math keyboard */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.keyScroll}>
            {mathKeys.map(k => (
              <TouchableOpacity
                key={k}
                style={s.mathKey}
                onPress={() => insertSymbol(k)}
                accessibilityRole="button"
                accessibilityLabel={`Insert ${k}`}
              >
                <Text style={s.mathKeyText}>{k}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Extra params */}
          <View style={s.paramsRow}>
            <View style={s.paramBox}>
              <Text style={s.paramLabel}>Variable</Text>
              <TextInput style={s.paramInput} value={variable} onChangeText={setVariable} maxLength={1} autoCapitalize="none" autoCorrect={false} />
            </View>
            {selectedType === 'definite-integral' && <>
              <View style={s.paramBox}>
                <Text style={s.paramLabel}>Lower</Text>
                <TextInput style={s.paramInput} value={lower} onChangeText={setLower} autoCapitalize="none" autoCorrect={false} />
              </View>
              <View style={s.paramBox}>
                <Text style={s.paramLabel}>Upper</Text>
                <TextInput style={s.paramInput} value={upper} onChangeText={setUpper} autoCapitalize="none" autoCorrect={false} />
              </View>
            </>}
            {selectedType === 'limit' && (
              <View style={s.paramBox}>
                <Text style={s.paramLabel}>Approach</Text>
                <TextInput style={s.paramInput} value={approach} onChangeText={setApproach} autoCapitalize="none" autoCorrect={false} />
              </View>
            )}
            {selectedType === 'derivative' && (
              <View style={s.paramBox}>
                <Text style={s.paramLabel}>Order</Text>
                <TextInput style={s.paramInput} value={order} onChangeText={setOrder} keyboardType="numeric" maxLength={1} />
              </View>
            )}
          </View>

          {/* Solve button */}
          <TouchableOpacity
            style={[s.solveBtn, loading && { opacity: 0.7 }]}
            onPress={handleSolve}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Solve ${currentType?.fullLabel || 'calculus problem'}`}
            accessibilityState={{ disabled: loading }}
          >
            {loading
              ? <ActivityIndicator color={COLORS.bg} />
              : (
                <View style={s.solveBtnInner}>
                  <Ionicons name="flash" size={18} color={COLORS.white} />
                  <Text style={s.solveBtnText}>SOLVE</Text>
                </View>
              )
            }
          </TouchableOpacity>

          {/* Result */}
          {result && (
            <View style={s.resultContainer}>
              {/* Answer card */}
              <View style={[s.answerCard, { borderColor: result.status === 'success' ? COLORS.accent : result.status === 'partial' ? COLORS.warn : '#ef4444' }]}>
                <Text style={s.answerLabel}>ANSWER</Text>
                <Text style={[s.answerValue, { color: result.status === 'success' ? COLORS.accent : COLORS.warn }]}>
                  {result.answer}
                </Text>
                <View style={[s.statusDot, { backgroundColor: result.status === 'success' ? COLORS.accent : COLORS.warn }]} />
                <View style={s.resultActions}>
                  <TouchableOpacity
                    style={s.resultActionBtn}
                    onPress={graphCurrentExpression}
                    accessibilityRole="button"
                    accessibilityLabel={graphActionLabel}
                  >
                    <Ionicons name="analytics-outline" size={16} color={COLORS.primary} />
                    <Text style={s.resultActionText}>{graphActionLabel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.resultActionBtn}
                    onPress={() => { tap(); setExpr(''); setResult(null); setExpandedStep(null); }}
                    accessibilityRole="button"
                    accessibilityLabel="Start a new problem"
                  >
                    <Ionicons name="add-outline" size={17} color={COLORS.primary} />
                    <Text style={s.resultActionText}>New</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Steps */}
              <Text style={s.stepsLabel}>STEP-BY-STEP SOLUTION</Text>
              {result.steps.map((step, i) => (
                <TouchableOpacity
                  key={i}
                  style={s.stepCard}
                  onPress={() => setExpandedStep(expandedStep === i ? null : i)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Step ${i + 1}: ${step.title}`}
                  accessibilityState={{ expanded: expandedStep === i }}
                >
                  <View style={s.stepHeader}>
                    <View style={s.stepNumBadge}><Text style={s.stepNum}>{i + 1}</Text></View>
                    <Text style={s.stepTitle}>{step.title}</Text>
                    <Text style={s.stepChevron}>{expandedStep === i ? '▴' : '▾'}</Text>
                  </View>
                  {expandedStep === i && (
                    <View style={s.stepBody}>
                      <Text style={s.stepMath}>{step.math}</Text>
                      {step.explanation ? <Text style={s.stepExplain}>{step.explanation}</Text> : null}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  header: { alignItems: 'center', paddingTop: 24, paddingBottom: 16, paddingHorizontal: 20 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.white, letterSpacing: 0 },
  headerSub: { fontSize: 12, color: COLORS.textDim, marginTop: 4, letterSpacing: 0 },
  quotaBadge: { marginHorizontal: 20, marginBottom: 8, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: 'rgba(125,211,252,0.06)', alignItems: 'center' },
  quotaText: { color: COLORS.primary, fontSize: 12, letterSpacing: 0, fontWeight: '700' },
  latexBadge: { marginHorizontal: 20, marginBottom: 8, padding: 8, borderRadius: 8, backgroundColor: 'rgba(129,140,248,0.15)', borderWidth: 1, borderColor: COLORS.secondary, alignItems: 'center' },
  latexBadgeText: { color: COLORS.secondary, fontSize: 12, letterSpacing: 0, fontWeight: '800' },
  sectionLabel: { marginHorizontal: 20, marginTop: 16, marginBottom: 8, fontSize: 10, letterSpacing: 0, color: COLORS.textDim, textTransform: 'uppercase', fontWeight: '800' },
  typeScroll: { paddingLeft: 20, marginBottom: 4 },
  typeBtn: { marginRight: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bgCard, alignItems: 'center', minWidth: 82 },
  typeBtnActive: { borderColor: COLORS.secondary, backgroundColor: 'rgba(129,140,248,0.1)' },
  typeBtnLocked: { opacity: 0.6 },
  typeBtnIcon: { fontSize: 16, color: COLORS.textDim, marginBottom: 4 },
  typeBtnLabel: { fontSize: 10, color: COLORS.textDim, letterSpacing: 0, fontWeight: '700' },
  lockBadge: { fontSize: 7, color: COLORS.proGold, borderWidth: 1, borderColor: COLORS.proGold, borderRadius: 3, paddingHorizontal: 3, marginTop: 3 },
  inputWrap: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  exprInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, color: COLORS.white, fontSize: 15, fontFamily: 'monospace' },
  clearBtn: { padding: 14 },
  clearBtnText: { color: COLORS.textDim, fontSize: 14 },
  pasteHint: { marginHorizontal: 20, marginTop: 6, fontSize: 10, color: COLORS.textFaint, lineHeight: 16 },
  keyScroll: { paddingLeft: 20, marginTop: 10, marginBottom: 4 },
  mathKey: { marginRight: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(125,211,252,0.2)', backgroundColor: 'rgba(125,211,252,0.04)' },
  mathKeyText: { color: COLORS.primary, fontSize: 13, fontFamily: 'monospace' },
  paramsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 12 },
  paramBox: { flex: 1, minWidth: 70 },
  paramLabel: { fontSize: 10, color: COLORS.textDim, letterSpacing: 0, marginBottom: 4, fontWeight: '800' },
  paramInput: { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, color: COLORS.white, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontFamily: 'monospace' },
  solveBtn: { margin: 20, paddingVertical: 16, borderRadius: 8, alignItems: 'center', backgroundColor: COLORS.secondary, shadowColor: COLORS.secondary, shadowOpacity: 0.4, shadowRadius: 16, elevation: 8 },
  solveBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  solveBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '800', letterSpacing: 0 },
  resultContainer: { marginHorizontal: 20 },
  answerCard: { padding: 18, borderRadius: 8, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.4)', marginBottom: 16 },
  answerLabel: { fontSize: 10, letterSpacing: 0, color: COLORS.textDim, marginBottom: 8, fontWeight: '800' },
  answerValue: { fontSize: 18, fontWeight: '700', fontFamily: 'monospace', lineHeight: 28 },
  statusDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', top: 16, right: 16 },
  resultActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  resultActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(125,211,252,0.24)', paddingHorizontal: 10, paddingVertical: 8, backgroundColor: 'rgba(125,211,252,0.06)' },
  resultActionText: { color: COLORS.primary, fontSize: 12, fontWeight: '800' },
  stepsLabel: { fontSize: 10, letterSpacing: 0, color: COLORS.textDim, marginBottom: 10, fontWeight: '800' },
  stepCard: { backgroundColor: COLORS.bgCard, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  stepNumBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(129,140,248,0.2)', alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: COLORS.secondary, fontSize: 11, fontWeight: '700' },
  stepTitle: { flex: 1, color: COLORS.white, fontSize: 13, fontWeight: '600' },
  stepChevron: { color: COLORS.textDim, fontSize: 12 },
  stepBody: { paddingHorizontal: 16, paddingBottom: 14, borderTopWidth: 1, borderTopColor: COLORS.border },
  stepMath: { color: COLORS.primary, fontSize: 14, fontFamily: 'monospace', marginTop: 10, lineHeight: 22 },
  stepExplain: { color: COLORS.textDim, fontSize: 12, marginTop: 8, lineHeight: 18 },
});
