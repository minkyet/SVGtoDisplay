import { vec2 } from "./utils.js";

/**
 * Represents a 2D polygon with optional holes and a color.
 */
export class Polygon {
  /**
   * @param {[number, number][]} points - The outer boundary points in counterclockwise order.
   * @param {Array<[number, number][]>} [holes=[]] - Array of holes, each a set of points in clockwise order.
   * @param {string} [color="#000"] - The fill color of the polygon.
   */
  constructor(points, holes = [], color = "#000") {
    /** @type {[number, number][]} */
    this.points = points;

    /** @type {Array<[number, number][]>} */
    this.holes = holes;

    /** @type {string} */
    this.color = color;
  }

  /** @returns {number} The number of holes in the polygon. */
  getHoleCount = () => this.holes.length;

  /** @returns {boolean} Whether the polygon contains at least one hole. */
  hasHole = () => this.holes.length > 0;

  /** @returns {number} Total number of vertices including holes. */
  getVertexCount = () =>
    this.points.length + this.holes.reduce((sum, hole) => sum + hole.length, 0);

  /** @returns {boolean} Whether the polygon is a simple triangle with no holes. */
  isTriangle = () => !this.hasHole() && this.points.length === 3;

  /**
   * Returns the vertex at index `i`, supporting negative and wrapped indexing.
   * @param {number} i
   * @returns {[number, number]}
   */
  getPoint(i) {
    const n = this.points.length;
    return this.points[(i + n) % n];
  }

  /**
   * @returns {Polygon} A new polygon with reversed point order (no holes or color copied).
   */
  reverse() {
    return new Polygon([...this.points].reverse());
  }

  /**
   * @returns {Polygon} A deep clone of the polygon.
   */
  clone() {
    return new Polygon(
      this.points.map((p) => [...p]),
      this.holes.map((hole) => hole.map((p) => [...p])),
      this.color
    );
  }

  /**
   * @returns {Polygon} simplify colinear polygon.
   */
  simplify() {
    const result = this.clone();
    result.points = Polygon.removeColinear(result.points);
    result.holes = result.holes.map((hole) => Polygon.removeColinear(hole));
    return result;
  }

  /**
   * @returns {number} The total signed area of the polygon (holes are subtracted).
   */
  getArea() {
    let totalArea = Polygon.getSimpleArea(this.points);
    for (const hole of this.holes) {
      totalArea -= Polygon.getSimpleArea(hole);
    }
    return totalArea;
  }

  /**
   * Returns the index of the vertex with the largest interior angle.
   * Works for both convex and concave polygons.
   * @returns {number} Index of the point with the largest interior angle.
   */
  getMaxInteriorAngleIndex() {
    const n = this.points.length;
    if (n < 3) return -1;

    let maxAngle = -Infinity;
    let maxIndex = -1;

    for (let i = 0; i < n; i++) {
      const prev = this.points[(i - 1 + n) % n];
      const curr = this.points[i];
      const next = this.points[(i + 1) % n];

      const v1 = vec2.sub(prev, curr);
      const v2 = vec2.sub(next, curr);

      const dot = vec2.dot(v1, v2);
      const crossLength = vec2.length(v1) * vec2.length(v2);

      let angle = Math.acos(dot / crossLength);

      if (angle > maxAngle) {
        maxAngle = angle;
        maxIndex = i;
      }
    }

    return maxIndex;
  }

  /**
   * Returns true if the polygon is a simple convex trapezoid (no holes, 4 vertices)
   * @returns {boolean}
   */
  isTrapezoid() {
    if (this.hasHole() || this.points.length !== 4) return false;

    const [p0, p1, p2, p3] = this.points;

    const v01 = vec2.sub(p1, p0);
    const v23 = vec2.sub(p3, p2);
    const v12 = vec2.sub(p2, p1);
    const v30 = vec2.sub(p0, p3);

    const isParallel01_23 = vec2.isParallel(v01, v23);
    const isParallel12_30 = vec2.isParallel(v12, v30);

    return isParallel01_23 || isParallel12_30;
  }

  /**
   * Returns true if the polygon is a simple convex parallelogram (no holes, 4 vertices, opposite sides parallel and equal length)
   * @returns {boolean}
   */
  isParallelogram() {
    const EPSILON = 1e-8;
    if (this.hasHole() || this.points.length !== 4) return false;

    const [p0, p1, p2, p3] = this.points;

    const v01 = vec2.sub(p1, p0);
    const v23 = vec2.sub(p3, p2);
    const v12 = vec2.sub(p2, p1);
    const v30 = vec2.sub(p0, p3);

    const isParallel01_23 = vec2.isParallel(v01, v23);
    const isParallel12_30 = vec2.isParallel(v12, v30);

    const isEqualLength01_23 =
      Math.abs(vec2.length(v01) - vec2.length(v23)) < EPSILON;
    const isEqualLength12_30 =
      Math.abs(vec2.length(v12) - vec2.length(v30)) < EPSILON;

    return (
      isParallel01_23 &&
      isEqualLength01_23 &&
      isParallel12_30 &&
      isEqualLength12_30
    );
  }

  /**
   * Checks if the polygon is simple convex (outer points only, counterclockwise, no holes).
   * @returns {boolean}
   */
  isConvex() {
    if (!Polygon.isCounterClockwise(this.points)) return false;
    if (this.hasHole()) return false;
    const n = this.points.length;
    for (let i = 0; i < n; i++) {
      const p1 = this.points[(i - 1 + n) % n];
      const p2 = this.points[i];
      const p3 = this.points[(i + 1) % n];
      if (Polygon.isReflex(p1, p2, p3)) return false;
    }
    return true;
  }

  /**
   * Checks whether a given point is inside this polygon (including its boundary)
   * and outside all hole interiors (but points on hole boundaries still count as inside).
   * @param {[number, number]} point - The [x, y] point to test
   * @returns {boolean} true if inside or on any boundary, false if outside or in a hole interior
   */
  isInside(point) {
    const EPSILON = 1e-8;
    const [px, py] = point;

    // helper: point on segment [a–b]
    const onSeg = (a, b) => {
      const cross = (px - a[0]) * (b[1] - a[1]) - (py - a[1]) * (b[0] - a[0]);
      if (Math.abs(cross) > EPSILON) return false;
      return (
        px >= Math.min(a[0], b[0]) - EPSILON &&
        px <= Math.max(a[0], b[0]) + EPSILON &&
        py >= Math.min(a[1], b[1]) - EPSILON &&
        py <= Math.max(a[1], b[1]) + EPSILON
      );
    };

    // helper: point on boundary
    const checkBoundary = (pts) => {
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        if (onSeg(pts[j], pts[i])) return true;
      }
      return false;
    };
    if (checkBoundary(this.points)) return true;
    for (const hole of this.holes) {
      if (checkBoundary(hole)) return true;
    }

    // outer boundary ray-cast
    let inside = false;
    for (
      let i = 0, j = this.points.length - 1;
      i < this.points.length;
      j = i++
    ) {
      const [xi, yi] = this.points[i];
      const [xj, yj] = this.points[j];
      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + EPSILON) + xi;
      if (intersect) inside = !inside;
    }
    if (!inside) return false;

    // holes interiors exclusion (but boundary already handled)
    for (const hole of this.holes) {
      let inHole = false;
      for (let i = 0, j = hole.length - 1; i < hole.length; j = i++) {
        const [xi, yi] = hole[i];
        const [xj, yj] = hole[j];
        const intersect =
          yi > py !== yj > py &&
          px < ((xj - xi) * (py - yi)) / (yj - yi + EPSILON) + xi;
        if (intersect) inHole = !inHole;
      }
      if (inHole) return false;
    }

    return true;
  }

  /**
   * Checks whether the segment [p0–p1] lies entirely inside this polygon (including its boundary)
   * and outside all holes. Endpoints on edges count as inside.
   * @param {[number, number]} p0
   * @param {[number, number]} p1
   * @returns {boolean}
   */
  isSegmentInside(p0, p1) {
    const EPSILON = 1e-8;

    // are endpoints inside
    if (!this.isInside(p0) || !this.isInside(p1)) return false;

    // Check whether two line segments properly intersect (excluding endpoints)
    const intersectsStrict = (a, b, c, d) => {
      const orient = (p, q, r) =>
        (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const onSeg = (p, q, r) =>
        Math.min(p[0], r[0]) - EPSILON <= q[0] &&
        q[0] <= Math.max(p[0], r[0]) + EPSILON &&
        Math.min(p[1], r[1]) - EPSILON <= q[1] &&
        q[1] <= Math.max(p[1], r[1]) + EPSILON;
      const o1 = orient(a, b, c),
        o2 = orient(a, b, d);
      const o3 = orient(c, d, a),
        o4 = orient(c, d, b);

      // proper intersection
      if (o1 * o2 < -EPSILON && o3 * o4 < -EPSILON) return true;
      // colinear overlap at non‐endpoint
      if (
        Math.abs(o1) < EPSILON &&
        onSeg(a, c, b) &&
        !vec2.equal(c, a) &&
        !vec2.equal(c, b)
      )
        return true;
      if (
        Math.abs(o2) < EPSILON &&
        onSeg(a, d, b) &&
        !vec2.equal(d, a) &&
        !vec2.equal(d, b)
      )
        return true;
      if (
        Math.abs(o3) < EPSILON &&
        onSeg(c, a, d) &&
        !vec2.equal(a, c) &&
        !vec2.equal(a, d)
      )
        return true;
      if (
        Math.abs(o4) < EPSILON &&
        onSeg(c, b, d) &&
        !vec2.equal(b, c) &&
        !vec2.equal(b, d)
      )
        return true;
      return false;
    };

    // Check if the outline and each side of every hole intersect
    const checkEdges = (pts) => {
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        if (intersectsStrict(p0, p1, pts[j], pts[i])) {
          return false;
        }
      }
      return true;
    };

    // outlines
    if (!checkEdges(this.points)) return false;
    // holes
    for (const hole of this.holes) {
      if (!checkEdges(hole)) return false;
    }

    return true;
  }

  /**
   * Returns inner area of points
   * @param {[number, number][]} points
   * @returns {number}
   */
  static getSimpleArea(points) {
    return (
      0.5 *
      Math.abs(
        points.reduce((acc, [x1, y1], i) => {
          const [x2, y2] = points[(i + 1) % points.length];
          return acc + (x1 * y2 - x2 * y1);
        }, 0)
      )
    );
  }

  /**
   * remove colinear from points
   * @param {[number, number][]} points
   * @returns {[number, number][]}
   */
  static removeColinear(points) {
    const EPSILON = 1e-8;
    const result = [];
    const n = points.length;
    if (n < 3) return points;

    for (let i = 0; i < n; i++) {
      const a = points[(i - 1 + n) % n];
      const b = points[i];
      const c = points[(i + 1) % n];

      const ab = [b[0] - a[0], b[1] - a[1]];
      const bc = [c[0] - b[0], c[1] - b[1]];
      const cross = ab[0] * bc[1] - ab[1] * bc[0];

      if (Math.abs(cross) > EPSILON) result.push(b);
    }

    return result;
  }

  /**
   * Determines if a point array forms a counterclockwise polygon.
   * @param {[number, number][]} points
   * @returns {boolean}
   */
  static isCounterClockwise(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      sum += (x2 - x1) * (y2 + y1);
    }
    return sum < 0;
  }

  /**
   * Checks if p2 is a reflex vertex (forms a concave angle) between p1 and p3.
   * Assumes counterclockwise orientation.
   * @param {[number, number]} p1
   * @param {[number, number]} p2
   * @param {[number, number]} p3
   * @returns {boolean}
   */
  static isReflex(p1, p2, p3) {
    const d1 = vec2.sub(p2, p1);
    const d2 = vec2.sub(p3, p2);
    return vec2.cross(d1, d2) < 0;
  }
}
