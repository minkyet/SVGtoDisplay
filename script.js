import {
  toPolygons,
  toTriangles,
  xorPolygon,
  drawPrimitives,
  drawDisplay,
} from "./geometry.js";
import { Display, triangleToDisplay } from "./display.js";

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const toggleButton = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("sidebar");
  const svgRenderArea = document.getElementById("svg-render-area");
  const uploadBtn = document.getElementById("upload-button");
  const fileInput = document.getElementById("file-input");
  const popup = document.getElementById("svg-upload-popup");

  const resetBtn = document.getElementById("reset-btn");
  const triangulationBtn = document.getElementById("to-triangles-btn");
  const sampleInput = document.getElementById("sample-input");
  const draw = SVG().addTo(svgRenderArea).size("100%", "100%");

  // Variables
  let originalSVGSource = "";

  toggleButton.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  // Drag & Drop
  ["dragenter", "dragover"].forEach((event) => {
    svgRenderArea.addEventListener(event, (e) => {
      e.preventDefault();
      svgRenderArea.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((event) => {
    svgRenderArea.addEventListener(event, (e) => {
      e.preventDefault();
      svgRenderArea.classList.remove("dragging");
    });
  });

  svgRenderArea.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    loadSVGFromFiles(files);
  });

  uploadBtn.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const files = e.target.files;
    loadSVGFromFiles(files);
  });

  //   resetBtn.addEventListener("click", () => {
  //     if (!originalSVGSource) {
  //       alert("Original SVG not provided.");
  //       return;
  //     }
  //     currentZoom = 1;
  //     draw.clear().svg(originalSVGSource);
  //     applyViewboxAndZoom(draw.bbox());

  //     alert("Restored SVG to its original state.");
  //   });

  //   triangulationBtn.addEventListener("click", () => {
  //     if (!originalSVGSource) {
  //       alert("Original SVG not provided.");
  //       return;
  //     }

  //     const sampleValue = sampleInput.value;
  //     let polygons = toPolygons(draw, sampleValue);
  //     polygons = xorPolygon(polygons);
  //     const trianglePolygons = toTriangles(polygons);
  //     drawPrimitives(draw, trianglePolygons);
  //     const display = Display.nestedDisplay(
  //       trianglePolygons.flatMap((poly) => {
  //         return poly.map((triangle) => triangleToDisplay(triangle));
  //       })
  //     );

  //     const defaultDisplayWidth = 10;
  //     const displayScale = defaultDisplayWidth / draw.bbox().width;
  //     display.move([0, 0]);
  //     display.scale(displayScale);
  //     drawDisplay(draw, display, 1 / displayScale);
  //     // alert(display.command());
  //   });

  function loadSVGFromFiles(files) {
    const file = files[0];
    if (!file || file.type !== "image/svg+xml") {
      alert("Please upload a valid SVG file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      popup.classList.add("hidden");

      const svgText = event.target.result;
      originalSVGSource = svgText;

      draw.clear().svg(svgText);
      applyViewboxAndZoom(draw.bbox());
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
    draw.panZoom({
      panning: true,
      wheelZoom: true,
      pinchZoom: true,
      zoomMin: 0.1,
      zoomMax: 40,
      zoomFactor: 0.2,
    });
  }
});
