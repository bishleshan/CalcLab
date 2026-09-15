import assert from 'node:assert/strict';

import {
  normalizeExpression,
  parseLatex,
  solveDefiniteIntegral,
  solveDerivative,
  solveIntegral,
  solveLimit,
} from '../src/engine/MobileSolver.js';

function assertIncludes(actual, expected, label) {
  assert.ok(
    String(actual).includes(expected),
    `${label}: expected "${actual}" to include "${expected}"`
  );
}

assert.equal(normalizeExpression('2x + e^x'), '2*x + exp(x)');

const derivative = solveDerivative('x^3 + 2x', 'x', 1);
assert.equal(derivative.status, 'success');
assertIncludes(derivative.answer, '3 * x ^ 2 + 2', 'derivative');
assert.equal(derivative.graphExpr, derivative.answer);

const exponentialIntegral = solveIntegral('e^x', 'x');
assert.equal(exponentialIntegral.status, 'success');
assert.equal(exponentialIntegral.answer, 'exp(x) + C');
assert.equal(exponentialIntegral.graphExpr, 'exp(x)');

const byPartsIntegral = solveIntegral('x^2*cos(x)', 'x');
assert.equal(byPartsIntegral.status, 'success');
assertIncludes(byPartsIntegral.answer, 'x^2*sin(x)', 'by-parts integral');

const definitePolynomial = solveDefiniteIntegral('x^2', 'x', '0', '1');
assert.equal(definitePolynomial.status, 'success');
assert.equal(definitePolynomial.answer, '0.333333');

const definitePi = solveDefiniteIntegral('sin(x)', 'x', '0', 'pi');
assert.equal(definitePi.status, 'success');
assert.equal(definitePi.answer, '2');

const removableLimit = solveLimit('sin(x)/x', 'x', '0');
assert.equal(removableLimit.status, 'success');
assert.equal(removableLimit.answer, '1');

const polynomialInfinity = solveLimit('x^2', 'x', 'infinity');
assert.equal(polynomialInfinity.status, 'success');
assert.equal(polynomialInfinity.answer, '∞');

const oscillatingInfinity = solveLimit('sin(x)', 'x', 'infinity');
assert.equal(oscillatingInfinity.status, 'partial');
assert.equal(oscillatingInfinity.answer, 'DNE');

const unbracedIntegral = parseLatex('\\int_0^1 x^2 dx');
assert.equal(unbracedIntegral.type, 'definite-integral');
assert.equal(unbracedIntegral.expr, 'x^2');
assert.equal(unbracedIntegral.params.lower, '0');
assert.equal(unbracedIntegral.params.upper, '1');

const latexLimit = parseLatex('\\lim_{x\\to 0} \\frac{\\sin x}{x}');
assert.equal(latexLimit.type, 'limit');
assert.equal(latexLimit.expr, '(sin(x))/(x)');

console.log('solver smoke tests passed');
