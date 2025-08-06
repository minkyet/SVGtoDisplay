import { Polygon } from "./polygon.js";
import { Display } from "./display.js";

/**
 * draw display
 * @param {SVG.Container} draw
 * @param {Display} display
 * @param {SVG.G} group
 */
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

// split subpaths from path
/**
 *
 * @param {string} d
 * @returns {string[]}
 */
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
