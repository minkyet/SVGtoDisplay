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
};

export function stringifyLiteral(obj) {
  if (obj === null) return "null";
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
