import { Display, triangleToDisplay } from "./display.js";

// find hole in polygons
export function xorPolygon(polygons) {
  if (polygons.length === 0) return [];

  const result = polygons.reduce(
    (prev, curr) => polygonClipping.xor(prev, [curr]),
    []
  );

  return sliceSamePoint(result);
}

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

export function drawPolygon(draw, polygons) {
  polygons.forEach((poly) => {
    const d = poly
      .map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join("L")}Z`)
      .join("");

    const p = draw.path(d);
    p.fill({ color: "#aff", rule: "evenodd" }).stroke({
      width: 1,
      color: "#040",
    });
  });
}

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
      p.fill({ color: "#aff", rule: "evenodd" }).stroke({
        width: 0.5,
        color: "#040",
      });
    });
  });
}

export function drawDisplay(draw, display, group = undefined) {
  group ??= draw.findOne("#display-svg") ?? draw.group().id("display-svg");
  display.move([0, 0]);

  let d = "M";
  const vertices = display.getVertices();
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

export function toDisplay(trianglePolygons) {
  return Display.nestedDisplay(
    trianglePolygons.flatMap((poly) =>
      poly.map((triangle) => triangleToDisplay(triangle))
    )
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
  return polygons.reduce((sum, polyline) => sum + polyline.length, 0);
}

export function getTriangleCount(triangles) {
  return triangles.length;
}

// svg path -> polygonize -> [[[x1, y1], [x2, y2], ...], [...]]
export function toPolygons(draw, sampleRate) {
  const existingGroup = draw.findOne("#polygon-svg");
  if (existingGroup) existingGroup.remove();

  const polygonGroup = draw.group().id("polygon-svg");

  // copy exsiting polygon
  draw.find("polygon").forEach((poly) => {
    const points = poly.node
      .getAttribute("points")
      .trim()
      .split(/\s+/)
      .map((pt) => pt.split(",").map(Number));

    draw.polygon(points).addTo(polygonGroup);
  });

  // path to polygon
  draw.find("path").forEach((pathEl) => {
    function cleanPathData(d) {
      return d
        .replace(/[\n\r]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    const dRaw = pathEl.node.getAttribute("d");
    const d = cleanPathData(dRaw);
    const subpaths = d.match(/[mM][^mM]+/g) || [d];

    subpaths.forEach((subD) => {
      try {
        const tempPath = draw.path(subD.trim());
        const polygon = tempPath.toPoly(`${sampleRate}%`);
        polygonGroup.add(polygon);
        tempPath.remove();
      } catch (err) {
        console.error("Failed to convert subpath:", subD, err);
      }
    });
  });

  return polygonGroup
    .children()
    .filter((child) => child.type === "polygon")
    .map((polygon) => {
      polygon.fill("none").stroke({ width: 0.5, color: "#af0" });
      const pointsStr = polygon.node.getAttribute("points")?.trim() || "";
      if (!pointsStr) return [];
      const pointsArr = pointsStr.split(/\s+/).map((pt) => {
        const [x, y] = pt.split(",").map(Number);
        return [x, y];
      });
      return pointsArr;
    });
}

export function toTriangles(polygons) {
  return polygons.map((poly) => {
    const flattenPoly = poly.map((ring) => ring.flat());
    return splitIntoEdges(triangulate(flattenPoly));
  });
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
      console.log("expected TRIANGLES but got type: " + type);
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
