import { Display, triangleToDisplays } from "./display.js";
import { Polygon } from "./polygon.js";
import { vec2 } from "./utils.js";

export function drawPrimitives(draw, polygons) {
  polygons.forEach((poly) => {
    poly.forEach((shape) => {
      let d = "M";
      for (let i = 0; i < shape.length; i += 2) {
        d += shape[i] + "," + shape[i + 1];
        if (i < shape.length - 2) d += "L";
      }
      d += "Z";
      const p = draw.path(d);
      p.fill({ color: "none", rule: "evenodd" }).stroke({
        width: 0.5,
        color: "#FB0",
      });
    });
  });
}

export function drawDisplay(draw, display, group = undefined) {
  group ??= draw.findOne("#display-svg") ?? draw.group().id("display-svg");
  display.move([0, 0]);

  let d = "M";
  const vertices = display.getVertices().flat();
  for (let i = 0; i < vertices.length; i += 2) {
    d += vertices[i] + "," + vertices[i + 1];
    if (i < vertices.length - 2) d += "L";
  }
  d += "Z";
  const p = draw.path(d);
  p.fill("none")
    .stroke({
      width: 0.1,
      color: "#aff",
    })
    .addTo(group);

  if (display.passengers.length > 0) {
    display.passengers.forEach((passenger) =>
      drawDisplay(draw, passenger, group)
    );
  }
}

/**
 * @deprecated This function is no longer needed.
 */
export function toDisplay(trianglePolygons) {
  return Display.nestedDisplay(
    trianglePolygons.flatMap((tripoly) => {
      if (!tripoly.isTriangle()) return;
      return Display.nestedDisplay(triangleToDisplays(tripoly.points));
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

export function getPointCount(polygons) {
  return polygons.reduce((sum, poly) => sum + poly.getVertexCount(), 0);
}

export function getTriangleCount(triangles) {
  return triangles.length;
}

// find hole in polygons
function xorPolygon(polygons) {
  if (polygons.length === 0) return [];

  const result = polygons.reduce(
    (prev, curr) => polygonClipping.xor(prev, [curr]),
    []
  );

  return sliceSamePoint(result);
}

// slice if polygon[0] == polygon[-1]
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

// split subpaths from path
function splitSubpaths(d) {
  if (typeof d !== "string") return [];

  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
  const result = [];
  let current = "";

  for (const cmd of commands) {
    if (/^[mM]/.test(cmd) && current) {
      result.push(current.trim().replace(/\s+/g, " "));
      current = "";
    }
    current += cmd.trim() + " ";
  }
  if (current) {
    result.push(current.trim().replace(/\s+/g, " "));
  }

  return result;
}

// convert svg paths to Polygon[]
export function toPolygons(draw, sampleRate = 2) {
  const result = [];

  // include basic shape types + path + polygon
  const shapeSelectors = ["path", "polygon", "circle", "ellipse", "rect"];
  const elements = shapeSelectors.flatMap((sel) => draw.find(sel));

  // group elements by fill color (filter out fill="none")
  const colorMap = {};
  for (const el of elements) {
    const fill = el.attr("fill");
    if (!fill || fill === "none") continue;

    if (!colorMap[fill]) colorMap[fill] = [];
    colorMap[fill].push(el);
  }

  // process each color group
  for (const [color, group] of Object.entries(colorMap)) {
    const allPolys = [];

    for (const el of group) {
      let paths = [];

      if (el.type === "path") {
        const d = el.attr("d");
        paths = splitSubpaths(d);
      } else if (el.type === "polygon") {
        const pointsStr = el.attr("points");
        const points = pointsStr
          .trim()
          .split(/[\s,]+/)
          .reduce((acc, val, idx, arr) => {
            if (idx % 2 === 0)
              acc.push([parseFloat(arr[idx]), parseFloat(arr[idx + 1])]);
            return acc;
          }, []);
        if (points.length >= 3) {
          allPolys.push(points);
        }
        continue;
      } else {
        // other shape types -> path
        const pathified = el.toPath(false);
        paths = splitSubpaths(pathified.attr("d"));
        pathified.remove();
      }

      for (const sub of paths) {
        const tempPath = draw.path(sub);
        const polyResult = tempPath.toPoly(`${sampleRate}%`);
        tempPath.remove();

        const arr = polyResult.array();
        if (arr.length >= 3) {
          allPolys.push(arr);
        }

        polyResult.remove();
      }
    }

    // xor merge
    const merged = xorPolygon(allPolys);

    // create Polygon instances
    for (const poly of merged) {
      result.push(new Polygon(poly[0], poly.slice(1), color));
    }
  }

  return result;
}

// draw outline of Polygon
export function drawPolygon(draw, polygon, options = {}) {
  const { outlineColor = "#af0", holeColor = "#afa", width = 0.5 } = options;

  const elements = [];

  // outline
  const outer = draw
    .polygon(polygon.points.map(([x, y]) => `${x},${y}`).join(" "))
    .fill("none")
    .stroke({
      color: outlineColor,
      width: width,
    });

  elements.push(outer);

  // holes
  polygon.holes.forEach((hole) => {
    const outer = draw
      .polygon(hole.map(([x, y]) => `${x},${y}`).join(" "))
      .fill("none")
      .stroke({
        color: holeColor,
        width: width,
      });

    elements.push(outer);
  });

  return elements;
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

// code from triangulation example of libtess.js:
// https://github.com/brendankenny/libtess.js/blob/gh-pages/examples/simple_triangulation/triangulate.js
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
export function convexDecomposition(polygon) {
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

// FIXME: 너무 랙걸림
/**
 * Returns Display from convex polygon.
 * @param {Polygon} polygon
 * @param {Polygon} [boundaryPolygon=polygon]
 * @returns {Display}
 */
export function convexToDisplay(polygon, boundaryPolygon = polygon) {
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

// FIXME:---------------DEPRECATED BELOW---------------

// Whether point p is inside the angle (cone) vPrev–v–vNext (Hertel–Mehlhorn)
function inCone(vPrev, v, vNext, p) {
  // outer: counterclockwise, hole: clockwise
  const ax = vPrev[0] - v[0],
    ay = vPrev[1] - v[1];
  const bx = vNext[0] - v[0],
    by = vNext[1] - v[1];
  const apx = p[0] - v[0],
    apy = p[1] - v[1];
  const isReflex = vec2.cross([ax, ay], [bx, by]) < 0;
  if (isReflex) {
    // p cannot outside cone if reflex vertex
    return (
      vec2.cross([ax, ay], [apx, apy]) < 0 &&
      vec2.cross([apx, apy], [bx, by]) < 0
    );
  } else {
    // convex vertex
    return !(
      vec2.cross([ax, ay], [apx, apy]) >= 0 &&
      vec2.cross([apx, apy], [bx, by]) >= 0
    );
  }
}

// Check if p–q, a–b intersects
function intersects(p, q, a, b) {
  const pqx = q[0] - p[0],
    pqy = q[1] - p[1];
  const apx = a[0] - p[0],
    apy = a[1] - p[1];
  const bpx = b[0] - p[0],
    bpy = b[1] - p[1];
  const c1 = vec2.cross([pqx, pqy], [apx, apy]);
  const c2 = vec2.cross([pqx, pqy], [bpx, bpy]);
  if (c1 * c2 > 0) return false;
  const abx = b[0] - a[0],
    aby = b[1] - a[1];
  const pax = p[0] - a[0],
    pay = p[1] - a[1];
  const qax = q[0] - a[0],
    qay = q[1] - a[1];
  const c3 = vec2.cross([abx, aby], [pax, pay]);
  const c4 = vec2.cross([abx, aby], [qax, qay]);
  return c3 * c4 <= 0;
}

function intersectsExclusive(p, q, a, b) {
  if (
    (p[0] === a[0] && p[1] === a[1]) ||
    (p[0] === b[0] && p[1] === b[1]) ||
    (q[0] === a[0] && q[1] === a[1]) ||
    (q[0] === b[0] && q[1] === b[1])
  )
    return false;
  return intersects(p, q, a, b);
}

/**
 * Returns Polygon without holes.
 * @deprecated This function is no longer needed.
 * @param {Polygon} polygon
 * @returns {Polygon}
 */
export function removeHoles(polygon) {
  let outer = [...polygon.points];
  let holes = polygon.holes.map((h) => [...h]);

  // while until no hole
  while (holes.length > 0) {
    // find best hole point (rightmost)
    let bestHoleIdx = 0,
      bestHolePtIdx = 0;
    for (let i = 0; i < holes.length; i++) {
      for (let j = 0; j < holes[i].length; j++) {
        if (holes[i][j][0] > holes[bestHoleIdx][bestHolePtIdx][0]) {
          bestHoleIdx = i;
          bestHolePtIdx = j;
        }
      }
    }
    const hole = holes[bestHoleIdx];
    const holePt = hole[bestHolePtIdx];

    // find shortest path from holePt to outer point
    let bestDist = Infinity;
    let bestOuterIdx = -1;
    for (let i = 0; i < outer.length; i++) {
      const pt = outer[i];
      if (pt[0] <= holePt[0]) continue;
      // check in cone
      const prev = outer[(i - 1 + outer.length) % outer.length];
      const next = outer[(i + 1) % outer.length];
      if (!inCone(prev, pt, next, holePt)) continue;
      // check intersect
      let visible = true;
      for (let j = 0; j < outer.length; j++) {
        const a = outer[j],
          b = outer[(j + 1) % outer.length];
        if (intersectsExclusive(holePt, pt, a, b)) {
          visible = false;
          break;
        }
      }
      if (!visible) continue;
      const d2 = vec2.length(holePt, pt);
      if (d2 < bestDist) {
        bestDist = d2;
        bestOuterIdx = i;
      }
    }
    if (bestOuterIdx < 0) {
      throw new Error(
        "RemoveHoles: Could not find an outer point to connect to."
      );
    }

    // merge outer and hole into bridge
    const newOuter = [];
    // outer[0..bestOuterIdx]
    for (let i = 0; i <= bestOuterIdx; i++) newOuter.push(outer[i]);
    // hole[bestHolePtIdx..bestHolePtIdx] (bestHolePtIdx is duplicated)
    for (let k = 0; k <= hole.length; k++) {
      newOuter.push(hole[(bestHolePtIdx + k) % hole.length]);
    }
    // outer[bestOuterIdx..end] again
    for (let i = bestOuterIdx; i < outer.length; i++) newOuter.push(outer[i]);

    // update
    outer = newOuter;
    holes.splice(bestHoleIdx, 1);
  }

  return new Polygon(outer, [], polygon.color);
}
