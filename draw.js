import { Polygon } from "./polygon.js";
import { Display } from "./display.js";
import svgPathParser from "https://cdn.jsdelivr.net/npm/svg-path-parser@1.1.0/+esm";

/**
 * draw display
 * @param {SVG.Container} draw
 * @param {Display} display
 * @param {SVG.G} group
 * @returns {SVG.Path[]}
 */
export function drawDisplay(draw, display) {
  const elements = [];

  let d = "M";
  const vertices = display.getVertices().flat();
  for (let i = 0; i < vertices.length; i += 2) {
    d += vertices[i] + "," + vertices[i + 1];
    if (i < vertices.length - 2) d += "L";
  }
  d += "Z";

  const p = draw.path(d).fill("none").stroke({
    width: 0.1,
    color: "#aff",
  });
  elements.push(p);

  elements.push(
    ...display.passengers.flatMap((passenger) => drawDisplay(draw, passenger))
  );

  return elements;
}

/**
 * draw outline of Polygon
 * @param {SVG.Container} draw
 * @param {Polygon} polygon
 * @param {{outlineColor:string, holeColor:string, width:number}} [options={}]
 * @returns {SVG.Polygon[]}
 */
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
 * convert svg paths to Polygon[]
 * @param {SVG.Container} draw
 * @param {number} [sampleRate=2]
 * @returns {Polygon[]}
 */
// export function toPolygons(draw, sampleRate = 2) {
//   const result = [];

//   // include basic shape types + path + polygon
//   const shapeSelectors = ["path", "polygon", "circle", "ellipse", "rect"];
//   const elements = shapeSelectors.flatMap((sel) => draw.find(sel));

//   for (let i = 0; i < elements.length; i++) {
//     const layer = i;
//     const el = elements[i];
//     const fillColor = getComputedFill(el);
//     if (!fillColor || fillColor === "none") continue;

//     const subpaths = [];
//     const polys = [];
//     if (el.type === "path") {
//       const d = el.attr("d");
//       subpaths.push(...splitSubpaths(d));
//     } else if (el.type === "polygon") {
//       const pointsStr = el.attr("points");
//       const points = pointsStr
//         .trim()
//         .split(/[\s,]+/)
//         .reduce((acc, val, idx, arr) => {
//           if (idx % 2 === 0)
//             acc.push([parseFloat(arr[idx]), parseFloat(arr[idx + 1])]);
//           return acc;
//         }, []);
//       if (points.length >= 3) {
//         polys.push(points);
//       }
//     } else {
//       // other shape types -> path
//       const pathified = el.toPath(false);
//       subpaths.push(...splitSubpaths(pathified.attr("d")));
//       pathified.remove();
//     }

//     for (const subpath of subpaths) {
//       const tempPath = draw.path(subpath);
//       const polyfied = tempPath.toPoly(`${sampleRate}%`);
//       tempPath.remove();
//       const arr = polyfied.array();
//       if (arr.length >= 3) {
//         polys.push(arr);
//       }
//       polyfied.remove();
//     }

//     // xor merge
//     const merged = xorPolygon(polys);

//     // create Polygon instances
//     for (const poly of merged) {
//       const points = Polygon.removeColinear(poly[0]);
//       const holes = poly.slice(1).map((hole) => Polygon.removeColinear(hole));
//       result.push(new Polygon(points, holes, fillColor, layer));
//     }
//   }

//   return result;
// }
export function toPolygons(draw, sampleRate = 2) {
  const result = [];

  // include basic shape types + path + polygon
  const shapeSelectors = ["path", "polygon", "circle", "ellipse", "rect"];
  const elements = shapeSelectors.flatMap((sel) => draw.find(sel));

  for (let i = 0; i < elements.length; i++) {
    const layer = i;
    const el = elements[i];
    const fillColor = getComputedFill(el);
    if (!fillColor || fillColor === "none") continue;

    const matrix = el.matrixify();
    const subpaths = [];
    const polys = [];
    if (el.type === "path") {
      const d = el.attr("d");
      subpaths.push(...splitSubpaths(d));
    } else {
      // other shape types -> path
      const pathified = el.toPath(false);
      subpaths.push(...splitSubpaths(pathified.attr("d")));
      pathified.remove();
    }

    // path to poly
    for (const subpath of subpaths) {
      const tempPath = draw.path(subpath);
      const polyfied = tempPath.toPoly(`${sampleRate}%`);
      tempPath.remove();
      const arr = polyfied.array();
      if (arr.length < 3) continue;

      const transformedPoints = arr.map((p) => {
        const point = new SVG.Point(p[0], p[1]);
        const transformedPoint = point.transform(matrix);
        return [transformedPoint.x, transformedPoint.y];
      });

      polys.push(transformedPoints);
      polyfied.remove();
    }

    // xor merge
    const merged = xorPolygon(polys);

    // create Polygon instances
    for (const poly of merged) {
      const points = Polygon.removeColinear(poly[0]);
      const holes = poly.slice(1).map((hole) => Polygon.removeColinear(hole));
      result.push(new Polygon(points, holes, fillColor, layer));
    }
  }

  return result;
}

/**
 * svgPathParser object to path string
 * @param {object[]} pathData
 * @returns {string}
 */
function serializePathData(pathData) {
  return pathData
    .map((cmd) => {
      const parts = [cmd.code];

      switch (cmd.code) {
        case "M":
        case "L":
        case "T":
          parts.push(cmd.x, cmd.y);
          break;
        case "H":
          parts.push(cmd.x);
          break;
        case "V":
          parts.push(cmd.y);
          break;
        case "C":
          parts.push(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
          break;
        case "S":
          parts.push(cmd.x2, cmd.y2, cmd.x, cmd.y);
          break;
        case "Q":
          parts.push(cmd.x1, cmd.y1, cmd.x, cmd.y);
          break;

        case "A":
          parts.push(
            cmd.rx,
            cmd.ry,
            cmd.xAxisRotation,
            cmd.largeArc ? 1 : 0,
            cmd.sweep ? 1 : 0,
            cmd.x,
            cmd.y
          );
          break;
        case "Z":
          break;
      }

      return parts.join(" ");
    })
    .join(" ");
}

/**
 * find hole in polygons
 * @param {[number, number][][]} polygons
 * @returns {[number, number][][][]}
 */
function xorPolygon(polygons) {
  if (polygons.length === 0) return [];

  const result = polygons.reduce(
    (prev, curr) => polygonClipping.xor(prev, [curr]),
    []
  );

  return sliceSamePoint(result);
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

/**
 * Splits subpaths from a path string using the svg-path-parser library.
 * The returned subpaths are standalone (start with absolute 'M') and sanitized.
 * @param {string} d
 * @returns {string[]}
 */
function splitSubpaths(d) {
  if (typeof d !== "string" || d.trim() === "") return [];

  try {
    const parsed = svgPathParser.parseSVG(d);

    svgPathParser.makeAbsolute(parsed);

    const result = [];
    let currentSubpathData = [];

    for (const cmd of parsed) {
      if (cmd.code === "M" && currentSubpathData.length > 0) {
        result.push(serializePathData(currentSubpathData));
        currentSubpathData = [];
      }
      currentSubpathData.push(cmd);
    }

    if (currentSubpathData.length > 0) {
      result.push(serializePathData(currentSubpathData));
    }

    return result;
  } catch (error) {
    console.error("Failed to parse or split the SVG path:", error);
    return [];
  }
}

function rgbToHex(rgb) {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return rgb;

  const r = parseInt(match[1]).toString(16).padStart(2, "0");
  const g = parseInt(match[2]).toString(16).padStart(2, "0");
  const b = parseInt(match[3]).toString(16).padStart(2, "0");

  return `${r}${g}${b}`.toLowerCase();
}

function getComputedFill(el) {
  const node = el.node;
  const fill = window.getComputedStyle(node).fill;
  return rgbToHex(fill);
}
