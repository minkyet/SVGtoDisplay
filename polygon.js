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
