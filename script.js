import {
  toPolygons,
  toTriangles,
  xorPolygon,
  drawTriangles,
} from "./geometry.js";

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const resetBtn = document.getElementById("reset-btn");
  const importBtn = document.getElementById("import-btn");
  const triangulationBtn = document.getElementById("to-triangles-btn");
  const fileInput = document.getElementById("file-input");
  const svgRenderArea = document.getElementById("svg-render-area");
  const logArea = document.getElementById("log-area");
  const sampleInput = document.getElementById("sample-input");
  const draw = SVG().addTo(svgRenderArea).size("100%", "100%");
  const ZOOM_SETTINGS = {
    min: 0.1,
    max: 10.0,
    factorIn: 1.2,
    factorOut: 0.8,
    duration: 50,
  };

  // Variables
  let originalSVGSource = "";
  let currentZoom = 1;
  let currentZoomAnimation = null;

  // Zoom with animation
  draw.node.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();

      const delta =
        e.deltaY < 0 ? ZOOM_SETTINGS.factorIn : ZOOM_SETTINGS.factorOut;
      let nextZoom = currentZoom * delta;
      if (nextZoom < ZOOM_SETTINGS.min || nextZoom > ZOOM_SETTINGS.max) {
        nextZoom = currentZoom;
      }
      currentZoom = nextZoom;
      const pt = draw.point(e.clientX, e.clientY);

      if (currentZoomAnimation) {
        currentZoomAnimation.finish();
      }
      currentZoomAnimation = draw
        .animate(ZOOM_SETTINGS.duration)
        .ease(">")
        .zoom(nextZoom, pt);
      currentZoomAnimation.after(() => {
        currentZoomAnimation = null;
      });
    },
    { passive: false }
  );

  resetBtn.addEventListener("click", () => {
    if (!originalSVGSource) {
      log("Original SVG not provided.");
      return;
    }
    currentZoom = 1;
    draw.clear().svg(originalSVGSource);
    applyViewboxAndZoom(draw.bbox());

    log("Restored SVG to its original state.");
  });

  importBtn.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== "image/svg+xml") {
      log("Please select only SVG files.");
      return;
    }
    loadSVGFromFile(file);
  });

  triangulationBtn.addEventListener("click", () => {
    const sampleValue = sampleInput.value;
    let polygons = toPolygons(draw, sampleValue);
    console.log(polygons);
    polygons = xorPolygon(polygons);
    console.log(polygons);
    const triangles = toTriangles(polygons);
    drawTriangles(draw, triangles);
    log(`Polygonization complete.`);
  });

  function log(message) {
    logArea.textContent += `\n${message}`;
  }

  function loadSVGFromFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const svgText = event.target.result;
      originalSVGSource = svgText;

      draw.clear().svg(svgText);
      applyViewboxAndZoom(draw.bbox());

      log(`Imported file: ${file.name}`);
    };
    reader.readAsText(file);
  }

  function applyViewboxAndZoom(bbox, scale = 0.4) {
    const scaleFactor = 1 / scale;
    const centerX = bbox.cx;
    const centerY = bbox.cy;
    const newWidth = bbox.width * scaleFactor;
    const newHeight = bbox.height * scaleFactor;

    draw.viewbox(
      centerX - newWidth / 2,
      centerY - newHeight / 2,
      newWidth,
      newHeight
    );
    draw.panZoom({ panning: true, wheelZoom: false, pinchZoom: true });
  }
});
