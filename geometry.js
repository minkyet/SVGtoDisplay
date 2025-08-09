import { Display, triangleToDisplays } from "./display.js";
import { Polygon } from "./polygon.js";
import { vec2 } from "./utils.js";

/**
 * Polygon to Display
 * @param {Polygon} polygon
 * @returns {Display}
 */
export function toDisplay(polygon) {
  const convexes = convexDecomposition(polygon);
  const displays = convexes.reduce((acc, convex) => {
    try {
      const result = convexToDisplay(convex, polygon);
      acc.push(result);
    } catch (error) {
      console.warn(error);
    }
    return acc;
  }, []);
  const result = Display.nestedDisplay(displays);

  result.setColor(polygon.color);
  result.setLayer(polygon.layer);

  return result;
}

/**
 * slice if polygon[0] == polygon[-1]
 * @param {[number, number][][][]} polygons
 * @returns {[number, number][][][]}
 */
function sliceSamePoint(polygons) {
  return polygons.map((poly) =>
    poly.map((ring) => {
      const [first, ..._] = ring;
      const last = ring[ring.length - 1];

      if (first[0] === last[0] && first[1] === last[1]) {
        return ring.slice(0, -1);
      }
      return ring;
    })
  );
}

// [1,2,3,4,5,6,7,8,9,10,11,12] -> [[1,2,3,4,5,6],[7,8,9,10,11,12]]
function splitIntoEdges(array, edges = 3) {
  const chunkSize = edges * 2;
  const result = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
}

/**
 * triangulate polygon points + holes.
 * code from triangulation example of libtess.js:
 * https://github.com/brendankenny/libtess.js/blob/gh-pages/examples/simple_triangulation/triangulate.js
 * @param {number[][]} contours
 * @returns {number[]}
 */
function triangulate(contours) {
  const tessy = new libtess.GluTesselator();

  tessy.gluTessCallback(
    libtess.gluEnum.GLU_TESS_VERTEX,
    (data, polyVertArray) => {
      polyVertArray[polyVertArray.length] = data[0];
      polyVertArray[polyVertArray.length] = data[1];
    }
  );
  tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_BEGIN, (type) => {
    if (type !== libtess.primitiveType.GL_TRIANGLES) {
      console.warn("expected TRIANGLES but got type: " + type);
    }
  });
  tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_ERROR, (err) => {
    throw new Error("Tessellation error " + err);
  });
  tessy.gluTessCallback(libtess.gluEnum.GLU_TESS_COMBINE, (coords, _, __) => [
    coords[0],
    coords[1],
    coords[2],
  ]);

  // libtess will take 3d verts and flatten to a plane for tesselation
  // since only doing 2d tesselation here, provide z=1 normal to skip
  // iterating over verts only to get the same answer.
  // comment out to test normal-generation code
  tessy.gluTessNormal(0, 0, 1);

  const triangleVerts = [];
  tessy.gluTessBeginPolygon(triangleVerts);

  for (let i = 0; i < contours.length; i++) {
    tessy.gluTessBeginContour();
    const contour = contours[i];
    for (let j = 0; j < contour.length; j += 2) {
      const coords = [contour[j], contour[j + 1], 0];
      tessy.gluTessVertex(coords, coords);
    }
    tessy.gluTessEndContour();
  }

  // finish polygon (and time triangulation process)
  const startTime = Date.now();
  tessy.gluTessEndPolygon();
  const endTime = Date.now();
  //     console.log("tesselation time: " + (endTime - startTime).toFixed(2) + "ms");

  return triangleVerts;
}

/**
 * Polygons to triangles points
 * @param {Polygon[]} polygons
 * @returns {Polygon[]}
 */
function toTriangles(polygons) {
  const trianglePolygons = polygons.map((poly) => {
    const polyarr = [poly.points, ...poly.holes];
    const flattenPoly = polyarr.map((ring) => ring.flat());
    return splitIntoEdges(triangulate(flattenPoly));
  });
  return trianglePolygons.flatMap((triangles) =>
    triangles
      .map(
        (rawTriangle) =>
          new Polygon([
            [rawTriangle[0], rawTriangle[1]],
            [rawTriangle[2], rawTriangle[3]],
            [rawTriangle[4], rawTriangle[5]],
          ])
      )
      .filter((triangle) => triangle.isConvex())
  );
}

/**
 * merge A and B and remove shared side
 * @param {Polygon} polyA
 * @param {Polygon} polyB
 * @param {[[number, number], [number, number]]} shared
 * @returns {Polygon}
 */
function mergePolygons(polyA, polyB, shared) {
  const [s0, s1] = shared;
  const lenPolyA = polyA.points.length;
  const idxPolyAs0 = polyA.points.findIndex((p) => vec2.equal(p, s0));
  const idxPolyAs1 = polyA.points.findIndex((p) => vec2.equal(p, s1));
  const idxPolyBs0 = polyB.points.findIndex((p) => vec2.equal(p, s0));
  const idxPolyBs1 = polyB.points.findIndex((p) => vec2.equal(p, s1));

  let idxPolyAFirst = idxPolyAs0;
  let idxPolyBSecond = idxPolyBs1;

  // if order s0 -> s1
  if ((idxPolyAs0 + 1) % lenPolyA === idxPolyAs1) {
    idxPolyAFirst = idxPolyAs1;
    idxPolyBSecond = idxPolyBs0;
  }

  const merged = polyA.points
    .slice(idxPolyAFirst + 1)
    .concat(polyA.points.slice(0, idxPolyAFirst))
    .concat(polyB.points.slice(idxPolyBSecond + 1))
    .concat(polyB.points.slice(0, idxPolyBSecond));

  return new Polygon(merged, [], polyA.color);
}

/**
 * Returns convex polygons using Hertel-Mehlhorn Convex Decomposition.
 * @param {Polygon} polygon
 * @returns {Polygon[]}
 */
function convexDecomposition(polygon) {
  const input = polygon.clone();
  if (input.isTriangle() || input.isConvex()) return [input];

  /** @type {Polygon[]} */
  let polygons = toTriangles([input]); // triangle decomposition
  while (true) {
    let merged = false;

    outer: for (let i = 0; i < polygons.length; i++) {
      for (let j = i + 1; j < polygons.length; j++) {
        const polyA = polygons[i];
        const polyB = polygons[j];

        // check both poly has shared side
        const shared = [];
        for (const p1 of polyA.points) {
          for (const p2 of polyB.points) {
            if (vec2.equal(p1, p2)) shared.push(p1);
          }
        }
        if (shared.length !== 2) continue;

        const mergeCandidate = mergePolygons(polyA, polyB, shared);

        if (mergeCandidate.isConvex()) {
          const mergedPoly = mergeCandidate.simplify();
          // merge complete: remove poly A,B / push merged polygon
          polygons.splice(j, 1);
          polygons.splice(i, 1);
          polygons.push(mergedPoly);
          merged = true;

          break outer;
        }
      }
    }

    if (!merged) break;
  }

  return polygons;
}

/**
 * Returns Display from convex polygon.
 * - Moderate optimized display count, fast convert speed O(n)
 * @param {Polygon} polygon
 * @param {Polygon} [boundaryPolygon=polygon]
 * @returns {Display}
 */
function convexToDisplay(polygon, boundaryPolygon = polygon) {
  if (polygon.isTriangle()) {
    const [p0, p1, p2] = polygon.points;
    const pA = vec2.add(p0, vec2.sub(p1, p2));
    const pB = vec2.add(p1, vec2.sub(p2, p0));
    const pC = vec2.add(p2, vec2.sub(p0, p1));

    if (
      boundaryPolygon.isSegmentInside(pA, p0) &&
      boundaryPolygon.isSegmentInside(pA, p1)
    )
      return new Display(p0, [vec2.sub(p2, p0), vec2.sub(pA, p0)]);
    else if (
      boundaryPolygon.isSegmentInside(pB, p1) &&
      boundaryPolygon.isSegmentInside(pB, p2)
    )
      return new Display(p1, [vec2.sub(p0, p1), vec2.sub(pB, p1)]);
    else if (
      boundaryPolygon.isSegmentInside(pC, p2) &&
      boundaryPolygon.isSegmentInside(pC, p0)
    )
      return new Display(p2, [vec2.sub(p1, p2), vec2.sub(pC, p2)]);
    else return Display.nestedDisplay(triangleToDisplays(polygon.points));
  }
  if (polygon.isParallelogram()) {
    const [p0, p1, p2, _] = polygon.points;
    return new Display(p1, [vec2.sub(p0, p1), vec2.sub(p2, p1)]);
  }
  if (!polygon.isConvex())
    throw new Error("Convex to Displays ERROR: input polygon is not convex.");
  if (polygon.points.length < 3)
    throw new Error(
      "Convex to Displays ERROR: The number of input polygon points is less than 3."
    );

  /** @type {Display[]} */
  const resultDisplays = [];
  const length = polygon.points.length;
  const maxIdx = polygon.getMaxInteriorAngleIndex();

  const p0 = polygon.points[maxIdx];
  for (let i = 0; i < length; i++) {
    if (i === maxIdx || (i + 1) % length === maxIdx) continue;

    const p1 = polygon.points[i];
    const p2 = polygon.points[(i + 1) % length];
    const pA = vec2.add(p0, vec2.sub(p1, p2));
    const pC = vec2.add(p2, vec2.sub(p0, p1));

    if (
      boundaryPolygon.isSegmentInside(pA, p0) &&
      boundaryPolygon.isSegmentInside(pA, p1)
    ) {
      resultDisplays.push(
        new Display(p0, [vec2.sub(p2, p0), vec2.sub(pA, p0)])
      );
    } else if (
      boundaryPolygon.isSegmentInside(pC, p2) &&
      boundaryPolygon.isSegmentInside(pC, p0)
    ) {
      resultDisplays.push(
        new Display(p2, [vec2.sub(p1, p2), vec2.sub(pC, p2)])
      );
    } else {
      resultDisplays.push(...triangleToDisplays([p0, p1, p2]));
    }
  }

  return Display.nestedDisplay(resultDisplays);
}

/**
 * Returns Display(Parallelogram) from convex polygon.
 * - Highly optimized display count, slow convert speed.
 * - FIXME: DO NOT USE POLYGON BOOLEAN OPERATION
 * @param {Polygon} polygon
 * @param {Polygon} [boundaryPolygon=polygon]
 * @returns {Display}
 * @deprecated This function is in development.
 */
function convexToDisplay_slow(polygon, boundaryPolygon = polygon) {
  const totalArea = polygon.getArea();
  const EPSILON = totalArea * 1e-5;

  if (polygon.isTriangle()) {
    const [p0, p1, p2] = polygon.points;
    const pA = vec2.add(p0, vec2.sub(p1, p2));
    const pB = vec2.add(p1, vec2.sub(p2, p0));
    const pC = vec2.add(p2, vec2.sub(p0, p1));

    if (
      boundaryPolygon.isSegmentInside(pA, p0) &&
      boundaryPolygon.isSegmentInside(pA, p1)
    )
      return new Display(p0, [vec2.sub(p2, p0), vec2.sub(pA, p0)]);
    else if (
      boundaryPolygon.isSegmentInside(pB, p1) &&
      boundaryPolygon.isSegmentInside(pB, p2)
    )
      return new Display(p1, [vec2.sub(p0, p1), vec2.sub(pB, p1)]);
    else if (
      boundaryPolygon.isSegmentInside(pC, p2) &&
      boundaryPolygon.isSegmentInside(pC, p0)
    )
      return new Display(p2, [vec2.sub(p1, p2), vec2.sub(pC, p2)]);
    else return Display.nestedDisplay(triangleToDisplays(polygon.points));
  }
  if (polygon.isParallelogram()) {
    const [p0, p1, p2, _] = polygon.points;
    return new Display(p1, [vec2.sub(p0, p1), vec2.sub(p2, p1)]);
  }
  if (!polygon.isConvex())
    throw new Error("Convex to Displays ERROR: input polygon is not convex.");

  // make possible parallelograms
  const length = polygon.points.length;
  /** @type {Array<{display: Display, coverArea:number}>} */
  const subsets = [];
  for (let i = 0; i < length; i++) {
    for (let j = i + 1; j < length; j++) {
      for (let k = j + 1; k < length; k++) {
        const p0 = polygon.points[i];
        const p1 = polygon.points[j];
        const p2 = polygon.points[k];
        const pA = vec2.add(p0, vec2.sub(p1, p2));
        const pB = vec2.add(p1, vec2.sub(p2, p0));
        const pC = vec2.add(p2, vec2.sub(p0, p1));

        /** @type {Display[]} */
        const displays = [];
        if (
          boundaryPolygon.isSegmentInside(pA, p0) &&
          boundaryPolygon.isSegmentInside(pA, p1)
        )
          displays.push(new Display(p0, [vec2.sub(p2, p0), vec2.sub(pA, p0)]));
        if (
          boundaryPolygon.isSegmentInside(pB, p1) &&
          boundaryPolygon.isSegmentInside(pB, p2)
        )
          displays.push(new Display(p1, [vec2.sub(p0, p1), vec2.sub(pB, p1)]));
        if (
          boundaryPolygon.isSegmentInside(pC, p2) &&
          boundaryPolygon.isSegmentInside(pC, p0)
        )
          displays.push(new Display(p2, [vec2.sub(p1, p2), vec2.sub(pC, p2)]));

        if (displays.length === 0) {
          displays.push(...triangleToDisplays([p0, p1, p2]));
        }

        displays.forEach((display) => {
          const area = Polygon.getSimpleArea(
            sliceSamePoint(
              polygonClipping.intersection(
                [display.getVertices()],
                [polygon.points]
              )
            )[0][0]
          );
          subsets.push({
            display: display,
            coverArea: area,
          });
        });
      }
    }
  }

  // Filling polygons from a large area
  let remainArea = polygon.getArea();
  let mergedArea = [];
  const resultDisplays = [];
  while (remainArea > EPSILON) {
    if (subsets.length === 0) break;

    // get widest parallelogram
    const widestIdx = subsets.reduce(
      (maxIdx, curr, i, a) =>
        curr.coverArea > a[maxIdx].coverArea ? i : maxIdx,
      0
    );
    const [widest] = subsets.splice(widestIdx, 1);

    //
    mergedArea = sliceSamePoint(
      polygonClipping.union(mergedArea.length === 0 ? [] : mergedArea, [
        widest.display.getVertices(),
      ])
    );

    resultDisplays.push(widest.display);

    // update subset cover area
    subsets.forEach((subset) => {
      const subsetArea = sliceSamePoint(
        polygonClipping.intersection(
          [subset.display.getVertices()],
          [polygon.points]
        )
      );
      subset.coverArea = Polygon.getSimpleArea(
        sliceSamePoint(
          polygonClipping.difference(subsetArea, mergedArea)
        )?.[0]?.[0] || []
      );
    });

    remainArea -= widest.coverArea;
  }

  return Display.nestedDisplay(resultDisplays);
}
