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

  for (let i = 0; i < elements.length; i++) {
    const layer = i;
    const el = elements[i];
    const fillColor = getComputedFill(el);
    if (!fillColor || fillColor === "none") continue;

    const subpaths = [];
    const polys = [];
    if (el.type === "path") {
      const d = el.attr("d");
      subpaths.push(...splitSubpaths(d));
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
        polys.push(points);
      }
    } else {
      // other shape types -> path
      const pathified = el.toPath(false);
      subpaths.push(...splitSubpaths(pathified.attr("d")));
      pathified.remove();
    }

    for (const subpath of subpaths) {
      const tempPath = draw.path(subpath);
      const polyfied = tempPath.toPoly(`${sampleRate}%`);
      tempPath.remove();
      const arr = polyfied.array();
      if (arr.length >= 3) {
        polys.push(arr);
      }
      polyfied.remove();
    }

    // xor merge
    const merged = xorPolygon(polys);

    // create Polygon instances
    for (const poly of merged) {
      result.push(new Polygon(poly[0], poly.slice(1), fillColor, layer));
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

/**
 * Splits subpaths from a path string, ensuring each subpath is standalone.
 * Converts relative starting movetos ('m') to absolute ('M').
 * @param {string} d
 * @returns {string[]}
 */
function splitSubpaths(d) {
  if (typeof d !== "string") return [];

  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
  if (commands.length === 0) return [];

  const result = [];
  let currentSubpath = "";
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  for (const cmdStr of commands) {
    const commandChar = cmdStr[0];
    const params = (cmdStr.substring(1).match(/-?[\d.]+/g) || []).map(
      parseFloat
    );

    if (commandChar === "M" || commandChar === "m") {
      if (currentSubpath) {
        result.push(currentSubpath.trim());
      }

      // Convert 'm' (relative) command to 'M' (absolute) command
      if (commandChar === "m") {
        cx += params[0];
        cy += params[1];
        currentSubpath = `M ${cx} ${cy} `;
      } else {
        cx = params[0];
        cy = params[1];
        currentSubpath = cmdStr + " ";
      }
      startX = cx;
      startY = cy;

      // Handle cases where 'm' or 'M' comes with multiple coordinate pairs (e.g., M 10 10 20 20)
      for (let i = 2; i < params.length; i += 2) {
        if (commandChar === "m") {
          cx += params[i];
          cy += params[i + 1];
          currentSubpath += `L ${cx} ${cy} `; // implicit Lineto
        } else {
          cx = params[i];
          cy = params[i + 1];
          currentSubpath += `L ${cx} ${cy} `; // implicit Lineto
        }
      }
    } else {
      currentSubpath += cmdStr + " ";

      // Update the last position of the pen for each command
      const pLen = params.length;
      switch (commandChar) {
        case "L":
        case "T":
          cx = params[pLen - 2];
          cy = params[pLen - 1];
          break;
        case "l":
        case "t":
          cx += params[pLen - 2];
          cy += params[pLen - 1];
          break;
        case "H":
          cx = params[pLen - 1];
          break;
        case "h":
          cx += params[pLen - 1];
          break;
        case "V":
          cy = params[pLen - 1];
          break;
        case "v":
          cy += params[pLen - 1];
          break;
        case "C":
          cx = params[pLen - 4];
          cy = params[pLen - 3];
          break;
        case "c":
          cx += params[pLen - 4];
          cy += params[pLen - 3];
          break;
        case "S":
        case "Q":
          cx = params[pLen - 2];
          cy = params[pLen - 1];
          break;
        case "s":
        case "q":
          cx += params[pLen - 2];
          cy += params[pLen - 1];
          break;
        case "A":
          cx = params[pLen - 2];
          cy = params[pLen - 1];
          break;
        case "a":
          cx += params[pLen - 2];
          cy += params[pLen - 1];
          break;
        case "Z":
        case "z":
          // When a path is closed, the pen position returns to the starting point of the subpath.
          cx = startX;
          cy = startY;
          break;
      }
    }
  }

  // Add the last processed subpath to the result
  if (currentSubpath) {
    result.push(currentSubpath.trim());
  }

  return result;
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

function getLayerIndex(el) {
  const siblings = el.parent().children();
  return siblings.indexOf(el);
}
