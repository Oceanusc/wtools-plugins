"use strict";

const assert = require("node:assert/strict");
const CalcEngine = require("../plugins/wtools-calc-pad/calc.js");

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    console.error(`FAIL: ${name}`);
    throw err;
  }
}

test("basic arithmetic and screenshot examples", () => {
  const r1 = CalcEngine.evaluate("55+888+999");
  assert.equal(r1.ok, true);
  assert.equal(r1.value, 1942);
  assert.equal(r1.formatted, "1,942");

  const r2 = CalcEngine.evaluate("1942+555+88+66");
  assert.equal(r2.ok, true);
  assert.equal(r2.value, 2651);
  assert.equal(r2.formatted, "2,651");

  const r3 = CalcEngine.evaluate("2651*pi");
  assert.equal(r3.ok, true);
  assert.ok(Math.abs(r3.value - 2651 * Math.PI) < 1e-8);
  assert.ok(r3.formatted.startsWith("8,328.36212466"));

  const r4 = CalcEngine.evaluate("55+88+7689*543");
  assert.equal(r4.ok, true);
  assert.equal(r4.value, 4175270);
  assert.equal(r4.formatted, "4,175,270");

  const r5 = CalcEngine.evaluate("4270-55+855+5525+88+66+4556+3.25*9825-5875/5+85+5369.55+83.45");
  assert.equal(r5.ok, true);
  assert.equal(r5.value, 51599.25);
  assert.equal(r5.formatted, "51,599.25");

  const r6 = CalcEngine.evaluate("2^5+888+99x878.467");
  assert.equal(r6.ok, true);
  assert.equal(r6.value, 87888.233);
  assert.equal(r6.formatted, "87,888.233");
});

test("floating point precision cleanup", () => {
  const r = CalcEngine.evaluate("0.1 + 0.2");
  assert.equal(r.ok, true);
  assert.equal(r.value, 0.3);
  assert.equal(r.formatted, "0.3");
});

test("full-width operators, parentheses, thousands commas, percentage", () => {
  const r1 = CalcEngine.evaluate("（1,000 ＋ 500）× 2 ÷ 3");
  assert.equal(r1.ok, true);
  assert.equal(r1.value, 1000);

  const r2 = CalcEngine.evaluate("200 * 15%");
  assert.equal(r2.ok, true);
  assert.equal(r2.value, 30);

  const r3 = CalcEngine.evaluate("2(3+4)");
  assert.equal(r3.ok, true);
  assert.equal(r3.value, 14);
});

test("math functions and constants", () => {
  assert.equal(CalcEngine.evaluate("sqrt(144) + abs(-8)").value, 20);
  assert.equal(CalcEngine.evaluate("max(10, 25, 3) + sum(1, 2, 3)").value, 31);
  assert.equal(CalcEngine.evaluate("round(3.14159, 2)").value, 3.14);
  assert.equal(CalcEngine.evaluate("log(1000)").value, 3);
});

test("error and empty handling", () => {
  assert.equal(CalcEngine.evaluate("").empty, true);
  assert.equal(CalcEngine.evaluate("   ").empty, true);
  const divZero = CalcEngine.evaluate("10 / 0");
  assert.equal(divZero.ok, false);
  assert.match(divZero.error, /0/);
  const badParen = CalcEngine.evaluate("(1 + 2");
  assert.equal(badParen.ok, false);
});

console.log("All calc-pad tests passed!");
