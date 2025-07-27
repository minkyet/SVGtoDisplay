const EPSILON = 1e-8;

export const vec2 = {
  add: ([x1, y1], [x2, y2]) => [x1 + x2, y1 + y2],
  sub: ([x1, y1], [x2, y2]) => [x1 - x2, y1 - y2],
  scale: ([x, y], s) => [x * s, y * s],
  dot: ([x1, y1], [x2, y2]) => x1 * x2 + y1 * y2,
  length: ([x, y]) => Math.hypot(x, y),
  normalize: ([x, y]) => {
    const len = Math.hypot(x, y);
    return len === 0 ? [0, 0] : [x / len, y / len];
  },
  cross: ([x1, y1], [x2, y2]) => x1 * y2 - y1 * x2,
  equal: ([x1, y1], [x2, y2]) =>
    Math.abs(x1 - x2) < EPSILON && Math.abs(y1 - y2) < EPSILON,
  isParallel: (a, b) => Math.abs(vec2.cross(a, b)) < EPSILON,
};

export function stringifyLiteral(obj) {
  if (obj === null) return "null";
  if (typeof obj === "number") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(stringifyLiteral).join(", ")}]`;
  }
  if (typeof obj === "object") {
    return `{${Object.entries(obj)
      .map(([key, val]) => `${key}: ${stringifyLiteral(val)}`)
      .join(", ")}}`;
  }
  if (typeof obj === "string") {
    return `"${obj}"`;
  }
  return String(obj); // numbers, booleans, undefined
}

export function formatNumber(num, length = 12) {
  const n = Number(num);
  if (!Number.isFinite(n)) return String(num);

  const fixed = n.toFixed(length);
  const numStr = parseFloat(fixed).toString();
  return numStr;
}

export function hexToSignedDword(hexString) {
  const unsigned = parseInt(hexString, 16);
  return unsigned >= 0x80000000 ? unsigned - 0x100000000 : unsigned;
}
