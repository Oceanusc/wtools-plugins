(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CalcEngine = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const CONSTANTS = {
    pi: Math.PI,
    π: Math.PI,
    e: Math.E,
    tau: Math.PI * 2,
    ans: 0
  };

  const FUNCTIONS = {
    abs: { args: 1, fn: x => Math.abs(x) },
    sqrt: { args: 1, fn: x => { if (x < 0) throw new Error("负数不能开平方"); return Math.sqrt(x); } },
    cbrt: { args: 1, fn: x => Math.cbrt(x) },
    round: { args: [1, 2], fn: (x, d = 0) => { const f = Math.pow(10, d); return Math.round(x * f) / f; } },
    floor: { args: 1, fn: x => Math.floor(x) },
    ceil: { args: 1, fn: x => Math.ceil(x) },
    sin: { args: 1, fn: x => Math.sin(x) },
    cos: { args: 1, fn: x => Math.cos(x) },
    tan: { args: 1, fn: x => Math.tan(x) },
    asin: { args: 1, fn: x => Math.asin(x) },
    acos: { args: 1, fn: x => Math.acos(x) },
    atan: { args: 1, fn: x => Math.atan(x) },
    ln: { args: 1, fn: x => { if (x <= 0) throw new Error("对数参数必须大于 0"); return Math.log(x); } },
    log: { args: 1, fn: x => { if (x <= 0) throw new Error("对数参数必须大于 0"); return Math.log10(x); } },
    log2: { args: 1, fn: x => { if (x <= 0) throw new Error("对数参数必须大于 0"); return Math.log2(x); } },
    exp: { args: 1, fn: x => Math.exp(x) },
    pow: { args: 2, fn: (a, b) => Math.pow(a, b) },
    min: { args: [1, Infinity], fn: (...xs) => Math.min(...xs) },
    max: { args: [1, Infinity], fn: (...xs) => Math.max(...xs) },
    sum: { args: [1, Infinity], fn: (...xs) => xs.reduce((a, b) => a + b, 0) },
    avg: { args: [1, Infinity], fn: (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length }
  };

  function normalizeInput(raw) {
    if (typeof raw !== "string") return "";
    let s = raw
      .replace(/\r?\n/g, " ")
      .replace(/[＋]/g, "+")
      .replace(/[－—–]/g, "-")
      .replace(/[＊×✕✖]/g, "*")
      .replace(/[／÷]/g, "/")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/[．。]/g, ".")
      .replace(/[，]/g, ",")
      .replace(/[％]/g, "%")
      .replace(/[＾]/g, "^")
      .replace(/\*\*/g, "^")
      .trim();

    // Remove trailing '=' if user pasted a formula ending with '='
    s = s.replace(/=+$/, "").trim();
    // Replace 'x' or 'X' used as multiplication between number/rparen and number/lparen/ident
    // e.g. 99x878.467 -> 99*878.467, but avoid breaking hex 0xFF or identifiers like max/exp
    s = s.replace(/(\d|\)|%)\s*[xX]\s*(?=\d|\(|[a-zA-Zπ])/g, "$1*");
    return s;
  }

  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    const len = expr.length;

    while (i < len) {
      const ch = expr[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Number literal (supports thousands commas like 1,942 or 1,942.50, scientific notation 1e-5)
      if (/[0-9.]/.test(ch)) {
        let numStr = "";
        let hasDot = false;
        while (i < len) {
          const c = expr[i];
          if (/[0-9]/.test(c)) {
            numStr += c;
            i++;
          } else if (c === "." && !hasDot) {
            hasDot = true;
            numStr += c;
            i++;
          } else if (
            c === "," &&
            !hasDot &&
            /^\d{3}(?!\d)/.test(expr.slice(i + 1)) &&
            numStr.length > 0
          ) {
            // Thousands separator comma inside number
            i++;
          } else {
            break;
          }
        }
        // Scientific notation e.g. 1e5, 1.5e-3
        if (i < len && (expr[i] === "e" || expr[i] === "E")) {
          const next = expr[i + 1];
          const after = expr[i + 2];
          if (/[0-9]/.test(next) || ((next === "+" || next === "-") && /[0-9]/.test(after))) {
            numStr += expr[i++];
            if (expr[i] === "+" || expr[i] === "-") {
              numStr += expr[i++];
            }
            while (i < len && /[0-9]/.test(expr[i])) {
              numStr += expr[i++];
            }
          }
        }
        const val = Number(numStr);
        if (!Number.isFinite(val)) {
          throw new Error("数值超出范围");
        }
        tokens.push({ type: "num", value: val });
        continue;
      }

      // Identifier (function or constant)
      if (/[a-zA-Z_π]/.test(ch)) {
        let ident = "";
        while (i < len && /[a-zA-Z0-9_π]/.test(expr[i])) {
          ident += expr[i++];
        }
        tokens.push({ type: "ident", value: ident.toLowerCase() });
        continue;
      }

      if ("+-*/^%(),".includes(ch)) {
        tokens.push({ type: "op", value: ch });
        i++;
        continue;
      }

      throw new Error(`无法识别的字符: ${ch}`);
    }

    return tokens;
  }

  function insertImplicitMultiplication(tokens) {
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const curr = tokens[i];
      if (i > 0) {
        const prev = tokens[i - 1];
        const prevIsValue =
          prev.type === "num" ||
          (prev.type === "op" && (prev.value === ")" || prev.value === "%")) ||
          (prev.type === "ident" && !(curr.type === "op" && curr.value === "("));
        const currStartsValue =
          curr.type === "num" ||
          curr.type === "ident" ||
          (curr.type === "op" && curr.value === "(");

        // Don't insert * between function name and '('
        const isFuncCall = prev.type === "ident" && curr.type === "op" && curr.value === "(" && Object.prototype.hasOwnProperty.call(FUNCTIONS, prev.value);

        if (prevIsValue && currStartsValue && !isFuncCall) {
          out.push({ type: "op", value: "*" });
        }
      }
      out.push(curr);
    }
    return out;
  }

  function evaluate(rawInput) {
    const normalized = normalizeInput(rawInput);
    if (!normalized) {
      return { ok: false, empty: true, value: null, formatted: "", raw: "" };
    }

    try {
      const tokens = insertImplicitMultiplication(tokenize(normalized));
      if (!tokens.length) {
        return { ok: false, empty: true, value: null, formatted: "", raw: "" };
      }

      let pos = 0;
      const peek = () => tokens[pos];
      const consume = () => tokens[pos++];

      function parseExpression() {
        let left = parseTerm();
        while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
          const op = consume().value;
          const right = parseTerm();
          left = op === "+" ? left + right : left - right;
        }
        return left;
      }

      function parseTerm() {
        let left = parseUnary();
        while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
          const op = consume().value;
          const right = parseUnary();
          if (op === "/") {
            if (right === 0) throw new Error("除数不能为 0");
            left = left / right;
          } else {
            left = left * right;
          }
        }
        return left;
      }

      function parseUnary() {
        if (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
          const op = consume().value;
          const val = parseUnary();
          return op === "-" ? -val : val;
        }
        return parsePower();
      }

      function parsePower() {
        const base = parsePostfix();
        if (peek() && peek().type === "op" && peek().value === "^") {
          consume();
          const exp = parseUnary();
          return Math.pow(base, exp);
        }
        return base;
      }

      function parsePostfix() {
        let val = parsePrimary();
        while (peek() && peek().type === "op" && peek().value === "%") {
          consume();
          val = val / 100;
        }
        return val;
      }

      function parsePrimary() {
        const tok = peek();
        if (!tok) throw new Error("表达式不完整");

        if (tok.type === "num") {
          consume();
          return tok.value;
        }

        if (tok.type === "ident") {
          consume();
          const name = tok.value;
          if (peek() && peek().type === "op" && peek().value === "(") {
            const fnSpec = FUNCTIONS[name];
            if (!fnSpec) throw new Error(`未知函数: ${name}`);
            consume(); // '('
            const args = [];
            if (!(peek() && peek().type === "op" && peek().value === ")")) {
              args.push(parseExpression());
              while (peek() && peek().type === "op" && peek().value === ",") {
                consume();
                args.push(parseExpression());
              }
            }
            if (!peek() || peek().type !== "op" || peek().value !== ")") {
              throw new Error("缺少右括号 )");
            }
            consume(); // ')'
            const [minArgs, maxArgs] = Array.isArray(fnSpec.args) ? fnSpec.args : [fnSpec.args, fnSpec.args];
            if (args.length < minArgs || args.length > maxArgs) {
              throw new Error(`${name}() 参数数量不正确`);
            }
            return fnSpec.fn(...args);
          }

          if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
            return CONSTANTS[name];
          }
          throw new Error(`未知变量或常量: ${name}`);
        }

        if (tok.type === "op" && tok.value === "(") {
          consume();
          const val = parseExpression();
          if (!peek() || peek().type !== "op" || peek().value !== ")") {
            throw new Error("缺少右括号 )");
          }
          consume();
          return val;
        }

        throw new Error(`意外的符号: ${tok.value}`);
      }

      const result = parseExpression();
      if (pos < tokens.length) {
        throw new Error(`多余的符号: ${tokens[pos].value}`);
      }
      if (!Number.isFinite(result)) {
        throw new Error("结果超出数值范围");
      }

      const cleaned = cleanFloat(result);
      return {
        ok: true,
        empty: false,
        value: cleaned,
        formatted: formatNumber(cleaned),
        raw: formatRaw(cleaned)
      };
    } catch (err) {
      return {
        ok: false,
        empty: false,
        error: err.message || "表达式有误",
        value: null,
        formatted: "",
        raw: ""
      };
    }
  }

  function cleanFloat(num) {
    if (Object.is(num, -0) || Math.abs(num) === 0) return 0;
    // Strip IEEE-754 binary float noise (e.g. 0.1 + 0.2 -> 0.3)
    const rounded = Number(num.toPrecision(14));
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function formatRaw(num) {
    if (Math.abs(num) >= 1e15 || (num !== 0 && Math.abs(num) < 1e-10)) {
      return String(num);
    }
    return String(num);
  }

  function formatNumber(num) {
    if (!Number.isFinite(num)) return "";
    if (Math.abs(num) >= 1e15 || (num !== 0 && Math.abs(num) < 1e-8)) {
      return num.toExponential(8).replace(/\.?0+e/, "e");
    }
    const str = String(num);
    const parts = str.split(".");
    const intPart = parts[0];
    const sign = intPart.startsWith("-") ? "-" : "";
    const digits = sign ? intPart.slice(1) : intPart;
    const withCommas = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.length > 1 ? `${sign}${withCommas}.${parts[1]}` : `${sign}${withCommas}`;
  }

  return {
    evaluate,
    formatNumber,
    formatRaw,
    normalizeInput
  };
});
