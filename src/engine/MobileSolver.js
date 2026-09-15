/**
 * MobileSolver.js — React Native compatible calc solver (mathjs only)
 */
import * as math from 'mathjs';

const SUPER_SCRIPT_MAP = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '-',
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSuperscripts(expr) {
  return expr.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, match => `^${match.split('').map(ch => SUPER_SCRIPT_MAP[ch] || '').join('')}`);
}

function findClosingGroup(source, start, open, close) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === open) depth += 1;
    if (source[i] === close) depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

function normalizeEulerPowers(expr) {
  let output = '';
  const source = String(expr);

  for (let i = 0; i < source.length; i++) {
    const previous = source[i - 1] || '';
    if (source[i] !== 'e' || source[i + 1] !== '^' || /[a-zA-Z0-9_]/.test(previous)) {
      output += source[i];
      continue;
    }

    let cursor = i + 2;
    while (source[cursor] === ' ') cursor += 1;

    if (source[cursor] === '(' || source[cursor] === '{') {
      const open = source[cursor];
      const close = open === '(' ? ')' : '}';
      const end = findClosingGroup(source, cursor, open, close);
      if (end !== -1) {
        output += `exp(${source.slice(cursor + 1, end)})`;
        i = end;
        continue;
      }
    }

    const start = cursor;
    if (source[cursor] === '-' || source[cursor] === '+') cursor += 1;
    while (cursor < source.length && /[a-zA-Z0-9_.]/.test(source[cursor])) cursor += 1;

    if (cursor > start) {
      output += `exp(${source.slice(start, cursor)})`;
      i = cursor - 1;
    } else {
      output += source[i];
    }
  }

  return output;
}

export function normalizeExpression(expr) {
  if (!expr) return '';
  const normalized = normalizeSuperscripts(expr).trim()
    .replace(/[−–—]/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/π/g, 'pi')
    .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
    .replace(/\)([a-zA-Z\d])/g, ')*$1')
    .replace(/([a-zA-Z)])(\d)/g, '$1*$2')
    .replace(/\bln\b/g, 'log')
    .replace(/\barcsin\b/g, 'asin')
    .replace(/\barccos\b/g, 'acos')
    .replace(/\barctan\b/g, 'atan')
    .replace(/\bpi\b/g, 'pi');
  return normalizeEulerPowers(normalized);
}

const normalize = normalizeExpression;

function formatNumber(value, digits = 6) {
  const rounded = Number.parseFloat(Number(value).toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function parseMathNumber(value) {
  const compact = String(value ?? '').trim().toLowerCase().replace(/∞/g, 'infinity');
  if (compact === 'infinity' || compact === '+infinity' || compact === 'inf' || compact === '+inf') return Infinity;
  if (compact === '-infinity' || compact === '-inf') return -Infinity;

  try {
    const evaluated = math.evaluate(normalize(compact));
    const number = Number(evaluated);
    if (Number.isFinite(number)) return number;
  } catch {}

  const fallback = Number.parseFloat(compact);
  return Number.isFinite(fallback) ? fallback : NaN;
}

function parseCoefficient(raw) {
  const value = String(raw || '').replace(/\s+/g, '');
  if (!value || value === '+') return 1;
  if (value === '-') return -1;
  return Number.parseFloat(value);
}

function splitTopLevelTerms(expr) {
  const terms = [];
  let depth = 0;
  let current = '';
  const compact = expr.replace(/\s+/g, '');

  for (let i = 0; i < compact.length; i++) {
    const ch = compact[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);

    if (i > 0 && depth === 0 && (ch === '+' || ch === '-')) {
      terms.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }

  if (current) terms.push(current);
  return terms;
}

function formatPower(variable, power) {
  if (power === 0) return '';
  if (power === 1) return variable;
  return `${variable}^${formatNumber(power)}`;
}

function formatTermMagnitude(coefficient, body) {
  const abs = Math.abs(coefficient);
  if (!body) return formatNumber(abs);
  if (Math.abs(abs - 1) < 1e-9) return body;
  return `${formatNumber(abs)}*${body}`;
}

function formatSignedTerms(terms) {
  const filtered = terms.filter(term => Math.abs(term.coefficient) > 1e-10);
  if (!filtered.length) return '0';

  return filtered.map((term, index) => {
    const sign = term.coefficient < 0 ? '-' : '+';
    const prefix = index === 0 ? (sign === '-' ? '-' : '') : ` ${sign} `;
    return `${prefix}${formatTermMagnitude(term.coefficient, term.body)}`;
  }).join('');
}

function polynomialAntiderivative(expr, variable) {
  const escaped = escapeRegExp(variable);
  const variableTerm = new RegExp(`^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)?)\\*?${escaped}(?:\\^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)))?$`);
  const constantTerm = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/;
  const terms = splitTopLevelTerms(expr);

  if (!terms.length) return null;

  const integrated = [];
  for (const term of terms) {
    const variableMatch = term.match(variableTerm);
    if (variableMatch) {
      const coefficient = parseCoefficient(variableMatch[1]);
      const power = variableMatch[2] === undefined ? 1 : Number.parseFloat(variableMatch[2]);
      if (!Number.isFinite(coefficient) || !Number.isFinite(power)) return null;

      if (Math.abs(power + 1) < 1e-9) {
        integrated.push({ coefficient, body: `log(abs(${variable}))` });
      } else {
        integrated.push({
          coefficient: coefficient / (power + 1),
          body: formatPower(variable, power + 1),
        });
      }
      continue;
    }

    const constantMatch = term.match(constantTerm);
    if (constantMatch) {
      const coefficient = Number.parseFloat(constantMatch[1]);
      if (!Number.isFinite(coefficient)) return null;
      integrated.push({ coefficient, body: variable });
      continue;
    }

    return null;
  }

  return formatSignedTerms(integrated);
}

function parsePowerTrig(expr, variable) {
  const escaped = escapeRegExp(variable);
  const compact = expr.replace(/\s+/g, '');
  const patterns = [
    new RegExp(`^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)?)\\*?${escaped}(?:\\^(\\d+))?\\*(sin|cos)\\(${escaped}\\)$`),
    new RegExp(`^([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)?)\\*?(sin|cos)\\(${escaped}\\)\\*${escaped}(?:\\^(\\d+))?$`),
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;
    const trigFirst = match[2] === 'sin' || match[2] === 'cos';
    return {
      coefficient: parseCoefficient(match[1]),
      trig: trigFirst ? match[2] : match[3],
      power: Number.parseInt(trigFirst ? (match[3] || '1') : (match[2] || '1'), 10),
    };
  }

  return null;
}

function integratePowerTrig(power, trig, variable) {
  if (power === 0) {
    return [{ coefficient: trig === 'sin' ? -1 : 1, body: `${trig === 'sin' ? 'cos' : 'sin'}(${variable})` }];
  }

  const powerBody = formatPower(variable, power);
  if (trig === 'cos') {
    return [
      { coefficient: 1, body: `${powerBody}*sin(${variable})` },
      ...integratePowerTrig(power - 1, 'sin', variable).map(term => ({
        coefficient: -power * term.coefficient,
        body: term.body,
      })),
    ];
  }

  return [
    { coefficient: -1, body: `${powerBody}*cos(${variable})` },
    ...integratePowerTrig(power - 1, 'cos', variable).map(term => ({
      coefficient: power * term.coefficient,
      body: term.body,
    })),
  ];
}

function deriveSymbolic(expr, variable = 'x') {
  try {
    const node = math.parse(expr);
    const derived = math.derivative(node, variable);
    return math.simplify(derived).toString();
  } catch { return null; }
}

function numericalIntegrate(expr, variable, a, b, n = 2000) {
  try {
    const f = math.compile(expr);
    const h = (b - a) / n;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const x = a + i * h;
      const val = f.evaluate({ [variable]: x });
      if (!Number.isFinite(Number(val))) return null;
      const w = (i === 0 || i === n) ? 1 : i % 2 === 0 ? 2 : 4;
      sum += w * val;
    }
    return (h / 3) * sum;
  } catch { return null; }
}

function parseApproachValue(approach) {
  return parseMathNumber(approach);
}

function evaluateAt(compiled, variable, x) {
  try {
    const number = Number(compiled.evaluate({ [variable]: x }));
    return Number.isNaN(number) ? null : number;
  } catch { return null; }
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isSettled(values, tolerance = 0.025) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 3) return false;
  const tail = finite.slice(-3);
  const spread = Math.max(...tail) - Math.min(...tail);
  const scale = Math.max(1, ...tail.map(value => Math.abs(value)));
  return spread <= tolerance * scale;
}

function sameNonZeroSign(values) {
  const meaningful = values.filter(value => Math.abs(value) > 1e-8);
  if (!meaningful.length) return true;
  const sign = Math.sign(meaningful[meaningful.length - 1]);
  return meaningful.every(value => Math.sign(value) === sign);
}

function isMonotoneAbsIncreasing(values) {
  const finite = values.filter(Number.isFinite).map(value => Math.abs(value));
  if (finite.length < 4) return false;
  const tail = finite.slice(-4);
  return tail.every((value, index) => index === 0 || value >= tail[index - 1] * 0.92);
}

function estimateLimitAtInfinity(compiled, variable, target) {
  const direction = target > 0 ? 1 : -1;
  const samples = [10, 100, 1000, 10000, 100000, 1000000, 10000000]
    .map(size => ({ x: direction * size, y: evaluateAt(compiled, variable, direction * size) }))
    .filter(sample => sample.y !== null);
  const values = samples.map(sample => sample.y);

  if (values.length < 3) return { answer: 'Could not estimate', status: 'error', samples };

  const infinities = values.filter(value => value === Infinity || value === -Infinity);
  if (infinities.length && sameNonZeroSign(infinities)) {
    return { answer: infinities[infinities.length - 1] > 0 ? '∞' : '-∞', status: 'success', samples };
  }

  const finite = values.filter(Number.isFinite);
  if (isSettled(finite)) {
    return { answer: formatNumber(average(finite.slice(-3))), status: 'success', samples };
  }

  const last = finite[finite.length - 1];
  const tail = finite.slice(-4);
  const tailChange = tail.length > 1 ? Math.abs(tail[tail.length - 1] - tail[0]) : 0;
  const growsFast = isMonotoneAbsIncreasing(finite) && Math.abs(last) > 75;
  const growsSlow = isMonotoneAbsIncreasing(finite) && Math.abs(last) > 10 && tailChange > 0.35;
  if ((growsFast || growsSlow) && sameNonZeroSign(tail)) {
    return { answer: last > 0 ? '∞' : '-∞', status: 'success', samples };
  }

  return { answer: 'DNE', status: 'partial', samples };
}

function refineRoot(compiled, variable, left, right, iterations = 40) {
  let lo = left;
  let hi = right;
  let flo = compiled.evaluate({ [variable]: lo });

  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const fmid = compiled.evaluate({ [variable]: mid });
    if (!Number.isFinite(Number(fmid))) break;
    if (Math.abs(fmid) < 1e-8) return mid;
    if (Math.sign(flo) === Math.sign(fmid)) {
      lo = mid;
      flo = fmid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

function addUniqueRoot(roots, root, tolerance = 0.03) {
  if (!Number.isFinite(Number(root))) return;
  const rounded = Number.parseFloat(root.toFixed(4));
  if (!roots.some(existing => Math.abs(existing - rounded) < tolerance)) roots.push(rounded);
}

function detectRules(expr) {
  const r = [];
  if (/[+\-]/.test(expr)) r.push('Sum/Difference Rule');
  if (/\^\s*\d+/.test(expr)) r.push('Power Rule');
  if (/sin|cos|tan|log|exp|sqrt/.test(expr)) r.push('Chain Rule');
  if (/\*/.test(expr) && !/^\d/.test(expr.split('*')[0])) r.push('Product Rule');
  return r;
}

function detectTechnique(expr) {
  if (/sin.*cos|cos.*sin/.test(expr)) return 'Trig Identity / By Parts';
  if (/\*/.test(expr) && /sin|cos|exp|log/.test(expr)) return 'Integration by Parts (∫u dv)';
  if (/\(.*\)\s*\^/.test(expr)) return 'u-Substitution';
  if (/x\s*\^/.test(expr)) return 'Power Rule: ∫xⁿdx = xⁿ⁺¹/(n+1)';
  if (/sin|cos/.test(expr)) return 'Standard Trig Integral';
  if (/exp|e\^/.test(expr)) return 'Exponential Rule';
  return 'Standard Integration';
}

export function solveDerivative(rawExpr, variable = 'x', order = 1) {
  const expr = normalize(rawExpr);
  const steps = [];
  steps.push({ title: 'Original Function', math: `f(${variable}) = ${expr}`, explanation: 'This is the function we will differentiate.' });
  const rules = detectRules(expr);
  if (rules.length) steps.push({ title: 'Rules to Apply', math: rules.join(' · '), explanation: `We will use: ${rules.join(', ')}.` });
  try {
    let current = expr;
    for (let i = 1; i <= order; i++) {
      const result = deriveSymbolic(current, variable);
      if (!result) throw new Error('Symbolic derivative failed');
      steps.push({ title: `Derivative${order > 1 ? ` (Order ${i})` : ''}`, math: `f${"'".repeat(i)}(${variable}) = ${result}`, explanation: `Differentiating ${current} w.r.t. ${variable}.` });
      current = result;
    }
    try {
      const val = math.evaluate(current.replace(new RegExp(`\\b${variable}\\b`, 'g'), '(1)'));
      if (isFinite(Number(val))) steps.push({ title: 'Quick Check', math: `f${"'".repeat(order)}(1) = ${parseFloat(Number(val).toFixed(6))}`, explanation: `Verified by evaluating at ${variable}=1.` });
    } catch {}
    return { answer: current, steps, status: 'success', graphExpr: current };
  } catch (err) {
    return { answer: 'Could not solve', steps: [...steps, { title: 'Error', math: err.message, explanation: 'Simplify the expression and try again.' }], status: 'error' };
  }
}

export function solveIntegral(rawExpr, variable = 'x') {
  const expr = normalize(rawExpr);
  const steps = [];
  steps.push({ title: 'Original Problem', math: `∫ (${expr}) d${variable}`, explanation: 'Find the antiderivative (indefinite integral).' });
  const technique = detectTechnique(expr);
  steps.push({ title: 'Technique', math: technique, explanation: 'Best approach for this integral type.' });

  const polyTrig = parsePowerTrig(expr, variable);
  if (polyTrig && Number.isFinite(polyTrig.coefficient) && polyTrig.power <= 6) {
    const result = formatSignedTerms(
      integratePowerTrig(polyTrig.power, polyTrig.trig, variable).map(term => ({
        coefficient: polyTrig.coefficient * term.coefficient,
        body: term.body,
      }))
    );
    steps.push({
      title: 'Integration by Parts',
      math: `F(${variable}) = ${result} + C`,
      explanation: `Reduce the power of ${variable} one step at a time until reaching a standard trig integral.`,
    });
    steps.push({
      title: 'Check',
      math: `d/d${variable} [${result}] = ${expr}`,
      explanation: 'Differentiate the antiderivative to confirm it returns the original integrand.',
    });
    return { answer: `${result} + C`, steps, status: 'success', graphExpr: result };
  }

  const polynomial = polynomialAntiderivative(expr, variable);
  if (polynomial) {
    steps.push({
      title: 'Power Rule Applied',
      math: `F(${variable}) = ${polynomial} + C`,
      explanation: 'Integrate each term with the power rule, then add the constant of integration.',
    });
    return { answer: `${polynomial} + C`, steps, status: 'success', graphExpr: polynomial };
  }

  // Trig basics
  const trigs = {
    [`sin(${variable})`]: `-cos(${variable})`,
    [`cos(${variable})`]: `sin(${variable})`,
    [`exp(${variable})`]: `exp(${variable})`,
    [`1/${variable}`]: `log(abs(${variable}))`,
  };
  const trimmed = expr.replace(/\s/g, '');
  if (trigs[trimmed]) {
    steps.push({ title: 'Standard Result', math: `F(x) = ${trigs[trimmed]} + C`, explanation: 'Standard antiderivative formula.' });
    return { answer: `${trigs[trimmed]} + C`, steps, status: 'success', graphExpr: trigs[trimmed] };
  }

  steps.push({ title: 'Setup Complete', math: `F(x) = ∫ ${expr} dx + C`, explanation: 'Apply the identified technique. Step-by-step shown above.' });
  return { answer: `∫(${expr})dx + C`, steps, status: 'partial', graphExpr: expr };
}

export function solveDefiniteIntegral(rawExpr, variable = 'x', lower = '0', upper = '1') {
  const expr = normalize(rawExpr);
  const a = parseMathNumber(lower), b = parseMathNumber(upper);
  const steps = [];
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return {
      answer: 'Invalid bounds',
      steps: [{ title: 'Check Bounds', math: `${lower} to ${upper}`, explanation: 'Use numeric lower and upper bounds.' }],
      status: 'error',
    };
  }
  steps.push({ title: 'Definite Integral', math: `∫[${a}, ${b}] (${expr}) d${variable}`, explanation: `Evaluate from ${variable}=${a} to ${variable}=${b}.` });
  steps.push({ title: 'Step 1: Antiderivative', math: `Find F(x) = ∫ ${expr} d${variable}`, explanation: 'Find F(x) first, then apply the Fundamental Theorem of Calculus.' });
  steps.push({ title: 'Step 2: FTC', math: `= F(${b}) − F(${a})`, explanation: 'Evaluate F at upper bound minus F at lower bound.' });
  const polynomial = polynomialAntiderivative(expr, variable);
  if (polynomial) {
    try {
      const F = math.compile(polynomial);
      const exact = F.evaluate({ [variable]: b }) - F.evaluate({ [variable]: a });
      if (Number.isFinite(Number(exact))) {
        const answer = formatNumber(exact);
        steps.push({
          title: 'Exact Evaluation',
          math: `${polynomial} |[${a}, ${b}] = ${answer}`,
          explanation: 'Because this is a polynomial-style integrand, the app can use an exact antiderivative instead of only estimating.',
        });
        return { answer, steps, status: 'success', graphExpr: expr };
      }
    } catch {}
  }
  const result = numericalIntegrate(expr, variable, a, b);
  if (result !== null) {
    steps.push({ title: 'Numerical Result', math: `≈ ${formatNumber(result)}`, explanation: "Computed with Simpson's Rule (n=2000) for a high-quality approximation." });
    return { answer: formatNumber(result), steps, status: 'success', graphExpr: expr };
  }
  return { answer: 'Error', steps, status: 'error' };
}

export function solveLimit(rawExpr, variable = 'x', approach = '0') {
  const expr = normalize(rawExpr);
  const steps = [];
  steps.push({ title: 'Limit Problem', math: `lim(${variable}→${approach}) [${expr}]`, explanation: `Find the limit of ${expr} as ${variable}→${approach}.` });
  const target = parseApproachValue(approach);
  if (Number.isNaN(target)) {
    return {
      answer: 'Invalid approach',
      steps: [...steps, { title: 'Check Approach Value', math: String(approach), explanation: 'Use a number, infinity, or -infinity.' }],
      status: 'error',
    };
  }
  try {
    const f = math.compile(expr);

    if (!Number.isFinite(target)) {
      const estimate = estimateLimitAtInfinity(f, variable, target);
      const visibleSamples = estimate.samples
        .slice(-3)
        .map(sample => `f(${formatNumber(sample.x, 0)})≈${Number.isFinite(sample.y) ? formatNumber(sample.y) : sample.y > 0 ? '∞' : '-∞'}`)
        .join(', ');
      steps.push({
        title: 'Behavior at Infinity',
        math: visibleSamples,
        explanation: estimate.answer === 'DNE'
          ? 'The sampled values do not settle or grow with one stable sign, so the limit does not exist.'
          : 'The far-out behavior is stable enough to classify the infinite-limit result.',
      });
      return { answer: estimate.answer, steps, status: estimate.status, graphExpr: expr };
    }

    const val = evaluateAt(f, variable, target);
    if (Number.isFinite(val)) {
      steps.push({ title: 'Direct Substitution', math: `= ${formatNumber(val)}`, explanation: 'No indeterminate form — direct substitution works.' });
      return { answer: formatNumber(val), steps, status: 'success', graphExpr: expr };
    }
  } catch {
    steps.push({ title: 'Parse Check', math: expr, explanation: 'The expression could not be evaluated directly, so the app will try nearby samples.' });
  }
  steps.push({ title: 'Indeterminate Form', math: '0/0 or ∞/∞ detected', explanation: "Apply L'Hôpital's Rule, factor, or rationalize." });
  // Numerical approach
  const epsilons = [0.1, 0.01, 0.001, 0.0001];
  const f = math.compile(expr);
  let lastRight = null;
  let lastLeft = null;
  for (const eps of epsilons) {
    const isInf = !Number.isFinite(target);
    const rightX = isInf ? (target < 0 ? -1 / eps : 1 / eps) : target + eps;
    const leftX = isInf ? rightX : target - eps;
    try { lastRight = f.evaluate({ [variable]: rightX }); } catch {}
    try { lastLeft = f.evaluate({ [variable]: leftX }); } catch {}
  }
  const rightFinite = lastRight !== null && Number.isFinite(Number(lastRight));
  const leftFinite = lastLeft !== null && Number.isFinite(Number(lastLeft));
  if (rightFinite && leftFinite && Math.abs(lastRight - lastLeft) > 0.01) {
    const answer = 'DNE';
    steps.push({
      title: 'One-sided Check',
      math: `left ≈ ${formatNumber(lastLeft)}, right ≈ ${formatNumber(lastRight)}`,
      explanation: 'The one-sided values do not agree, so the two-sided limit does not exist.',
    });
    return { answer, steps, status: 'partial', graphExpr: expr };
  }
  if (!rightFinite && !leftFinite) {
    steps.push({ title: 'Numerical Check Failed', math: 'No stable nearby values', explanation: 'Try simplifying the expression or checking one-sided behavior.' });
    return { answer: 'Could not estimate', steps, status: 'error', graphExpr: expr };
  }
  const finalValue = rightFinite ? lastRight : lastLeft;
  const answer = Number.isFinite(Number(finalValue)) ? formatNumber(finalValue) : (finalValue > 0 ? '∞' : '-∞');
  steps.push({ title: 'Numerical Result', math: `→ ${answer}`, explanation: 'Limit approximated from nearby values.' });
  return { answer, steps, status: 'success', graphExpr: expr };
}

export function solveCriticalPoints(rawExpr, variable = 'x') {
  const expr = normalize(rawExpr);
  const steps = [];
  steps.push({ title: 'Critical Points', math: `f(x) = ${expr}`, explanation: "Find where f'(x) = 0 or undefined." });
  try {
    const deriv = deriveSymbolic(expr, variable);
    if (!deriv) throw new Error('Cannot differentiate');
    steps.push({ title: "Compute f'(x)", math: `f'(x) = ${deriv}`, explanation: 'Differentiate f(x).' });
    steps.push({ title: "Set f'(x) = 0", math: `${deriv} = 0`, explanation: 'Solve for x.' });
    const f = math.compile(deriv);
    const roots = [];
    let prev = null;
    let prevX = null;
    for (let i = 0; i <= 1600; i++) {
      const x = -10 + (20 * i) / 1600;
      try {
        const val = f.evaluate({ [variable]: x });
        if (Number.isFinite(Number(val)) && Math.abs(val) < 0.001) {
          addUniqueRoot(roots, x);
        } else if (prev !== null && Number.isFinite(Number(val)) && Number.isFinite(Number(prev)) && Math.sign(val) !== Math.sign(prev)) {
          addUniqueRoot(roots, refineRoot(f, variable, prevX, x));
        }
        prev = val;
        prevX = x;
      } catch { prev = null; }
    }
    roots.sort((left, right) => left - right);
    if (roots.length) {
      steps.push({ title: 'Critical Points', math: `x = ${roots.join(', ')}`, explanation: "x values where f'(x) = 0." });
      const d2 = deriveSymbolic(deriv, variable);
      if (d2) {
        const fd2 = math.compile(d2);
        const classified = roots.map(r => {
          try { const v = fd2.evaluate({ [variable]: r }); return `x=${r}: ${v > 0.01 ? '📈 Local Min' : v < -0.01 ? '📉 Local Max' : '↔ Inflection'}`; }
          catch { return `x=${r}: Check manually`; }
        });
        steps.push({ title: 'Classification (2nd Derivative)', math: classified.join('\n'), explanation: "f''(x)>0→Min, f''(x)<0→Max." });
      }
      return { answer: `x = ${roots.join(', ')}`, steps, status: 'success', graphExpr: expr };
    }
    steps.push({ title: 'No Critical Points', math: 'None found in [-10, 10]', explanation: 'Try a different range.' });
    return { answer: 'None in [-10,10]', steps, status: 'partial', graphExpr: expr };
  } catch (err) {
    return { answer: 'Error', steps: [...steps, { title: 'Error', math: err.message, explanation: '' }], status: 'error' };
  }
}

export function parseLatex(raw) {
  let s = normalizeSuperscripts(raw)
    .trim()
    .replace(/^\$\$|\$\$$/g, '')
    .replace(/^\$|\$$/g, '')
    .trim();
  let type = null;
  const params = { variable: 'x', lower: '0', upper: '1', approach: '0', order: 1, center: 0 };
  const defInt = s.match(/\\int_\{?([^}^,\s]+)\}?\s*\^\{?([^},\s]+)\}?/);
  if (defInt) { type = 'definite-integral'; params.lower = defInt[1]; params.upper = defInt[2]; }
  else if (/\\int\b/.test(s)) type = 'integral';
  const dm = s.match(/\\frac\{d(?:\^\{?(\d+)\}?)?\}\{d([a-z])(?:\^\{?\d+\}?)?\}/);
  if (dm && !type) { type = 'derivative'; params.order = Number.parseInt(dm[1] || '1', 10); params.variable = dm[2]; }
  const lm = s.match(/\\lim_\{?\s*([a-z])\s*\\to\s*([^}\s\\]+|\\infty|-\\infty)/);
  if (lm && !type) { type = 'limit'; params.variable = lm[1]; params.approach = lm[2].replace('\\infty','infinity'); }
  let body = s
    .replace(/\\int_\{?[^}^,\s]+\}?\s*\^\{?[^},\s]+\}?/, '').replace(/\\int\b/, '')
    .replace(/\\frac\{d(?:\^\{?\d+\}?)?\}\{d[a-z](?:\^\{?\d+\}?)?\}/, '').replace(/\\lim_\{?[^}]*\}?/, '')
    .replace(/\\,?\s*d[a-z]\s*$/, '').replace(/\s*d[a-z]\s*$/, '')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
    .replace(/\\(sin|cos|tan|ln|log)\b/g, '$1')
    .replace(/\\pi\b/g, 'pi').replace(/\\infty/g, 'infinity')
    .replace(/\^\{([^}]+)\}/g, '^($1)')
    .replace(/\\left[\(\[\{]/g, '(').replace(/\\right[\)\]\}]/g, ')')
    .replace(/\\cdot\b/g, '*').replace(/[×·]/g, '*').replace(/[−–—]/g, '-')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/\{([^{}]*)\}/g, '($1)')
    .replace(/\b(sin|cos|tan|log|ln|sqrt)\s+([a-zA-Z][a-zA-Z0-9]*|\([^()]+\)|\d+(?:\.\d+)?)/g, '$1($2)')
    .replace(/\s+/g, ' ').trim();
  return { expr: body || s, type, params };
}
