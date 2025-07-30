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
   * @returns {number} The total signed area of the polygon (holes are subtracted).
   */
  getArea() {
    const area = (pts) =>
      0.5 *
      Math.abs(
        pts.reduce((acc, [x1, y1], i) => {
          const [x2, y2] = pts[(i + 1) % pts.length];
          return acc + (x1 * y2 - x2 * y1);
        }, 0)
      );

    let totalArea = area(this.points);
    for (const hole of this.holes) {
      totalArea -= area(hole);
    }
    return totalArea;
  }

  // FIXME: 가끔씩 제대로 안될 때가 있음
  /**
   * Returns the index of the vertex with the largest interior angle.
   * Works for both convex and concave polygons.
   * @returns {number} Index of the point with the largest interior angle.
   */
  getMaxInteriorAngleIndex() {
    const n = this.points.length;
    if (n < 3) return -1;

    const isCCW = Polygon.isCounterClockwise(this.points);

    let maxAngle = -Infinity;
    let maxIndex = -1;

    for (let i = 0; i < n; i++) {
      const prev = this.points[(i - 1 + n) % n];
      const curr = this.points[i];
      const next = this.points[(i + 1) % n];

      const v1 = vec2.sub(prev, curr);
      const v2 = vec2.sub(next, curr);

      const dot = vec2.dot(v1, v2);
      const cross = vec2.cross(v1, v2);

      // basic angle
      let angle = Math.atan2(cross, dot);

      // correct angle over π
      if (angle < 0) angle += 2 * Math.PI;

      if (!isCCW) angle = 2 * Math.PI - angle;

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
   * Checks whether a given point is inside this polygon (ignoring holes).
   * @param {[number, number]} point - The [x, y] point to test
   * @returns {boolean} true if inside, false if outside
   */
  isInside(point) {
    const EPSILON = 1e-12;
    const [px, py] = point;
    let inside = false;
    const n = this.points.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = this.points[i];
      const [xj, yj] = this.points[j];

      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + EPSILON) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Checks whether a given point is on the polygon's boundary (edge).
   * @param {[number, number]} point
   * @returns {boolean}
   */
  isOnEdge(point) {
    const EPSILON = 1e-12;
    const [px, py] = point;
    for (
      let i = 0, j = this.points.length - 1;
      i < this.points.length;
      j = i++
    ) {
      const [x1, y1] = this.points[j];
      const [x2, y2] = this.points[i];
      // colinearity
      const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
      if (Math.abs(cross) > EPSILON) continue;

      const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
      if (dot <= EPSILON) return true;
    }
    return false;
  }

  isInsideOrOnEdge(point) {
    return this.isOnEdge(point) || this.isInside(point);
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
