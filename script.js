import {
  toDisplay,
  toPolygons,
  toTriangles,
  xorPolygon,
  drawDisplay,
  getPointCount,
} from "./geometry.js";

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const toggleButton = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("sidebar");
  const svgRenderArea = document.getElementById("svg-render-area");
  const uploadBtn = document.getElementById("upload-btn");
  const fileInput = document.getElementById("file-input");
  const uploadPopup = document.getElementById("svg-upload-popup");
  const aboutButton = document.getElementById("about-btn");
  const aboutDialog = document.getElementById("about-dialog");

  const replaceConfirmDialog = document.getElementById(
    "replace-confirm-dialog"
  );
  const cancelReplaceButton = document.getElementById("cancel-replace-btn");
  const confirmReplaceButton = document.getElementById("confirm-replace-btn");

  const summonCommandDialog = document.getElementById("summon-command-dialog");
  const commandText = document.getElementById("command-text");
  const copyCommandButton = document.getElementById("copy-command-btn");
  const longCommandAlert = document.getElementById("long-command-alert");

  const reuploadButton = document.getElementById("reupload-btn");
  const samplerateSlider = document.getElementById("samplerate-slider");
  const verticeCount = document.getElementById("vertice-count");
  const triangleCount = document.getElementById("triangle-count");
  const displayCount = document.getElementById("display-count");

  const resampleButton = document.getElementById("resample-btn");

  const objectSelectButton = document.getElementById("object-select-btn");
  const colorSelectButton = document.getElementById("color-select-btn");
  const allSelectButton = document.getElementById("all-select-btn");
  const selectButtons = [
    objectSelectButton,
    colorSelectButton,
    allSelectButton,
  ];

  const toggleOriginal = document.getElementById("toggle-original");
  const toggleDisplay = document.getElementById("toggle-display");
  const toggleBorder = document.getElementById("toggle-border");
  const toggleBbox = document.getElementById("toggle-bbox");

  const depthInput = document.getElementById("depth-input");
  const widthInput = document.getElementById("width-input");

  const summonButton = document.getElementById("summon-btn");

  const draw = SVG().addTo(svgRenderArea).size("100%", "100%");

  let resultDisplay = null;
  let pendingSVGFiles = null;

  // refresh warning
  window.addEventListener("beforeunload", (event) => {
    const original = draw.findOne("#original-svg");
    if (original) {
      event.preventDefault();
      event.returnValue = "";
      return "";
    }
  });

  // samplerate slider
  samplerateSlider.tooltipFormatter = (value) => `${value}%`;
  samplerateSlider.addEventListener("input", () => {
    const value = samplerateSlider.value;
    samplerateSlider.label = `Sample rate: ${value}%`;
  });

  // eye toggle buttons
  toggleOriginal.addEventListener("click", () => {
    const original = draw.findOne("#original-svg");
    if (original) {
      toggleOriginal.name = toggleOriginal.name === "eye" ? "eye-slash" : "eye";
      original.visible() ? original.hide() : original.show();
    }
  });
  toggleDisplay.addEventListener("click", () => {
    const display = draw.findOne("#display-svg");
    if (display) {
      toggleDisplay.name = toggleDisplay.name === "eye" ? "eye-slash" : "eye";
      display.visible() ? display.hide() : display.show();
    }
  });
  toggleBorder.addEventListener("click", () => {
    const border = draw.findOne("#polygon-svg");
    if (border) {
      toggleBorder.name = toggleBorder.name === "eye" ? "eye-slash" : "eye";
      border.visible() ? border.hide() : border.show();
    }
  });
  toggleBbox.addEventListener("click", () => {
    const bbox = draw.findOne("#bbox-svg");
    if (bbox) {
      toggleBbox.name = toggleBbox.name === "eye" ? "eye-slash" : "eye";
      bbox.visible() ? bbox.hide() : bbox.show();
    }
  });

  // select buttons
  objectSelectButton.addEventListener("click", () =>
    selectOnly(objectSelectButton)
  );
  colorSelectButton.addEventListener("click", () =>
    selectOnly(colorSelectButton)
  );
  allSelectButton.addEventListener("click", () => selectOnly(allSelectButton));

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
    const original = draw.findOne("#original-svg");
    if (original) {
      pendingSVGFiles = files;
      replaceConfirmDialog.show();
    } else {
      loadSVGFromFiles(files);
    }
  });

  replaceConfirmDialog.addEventListener("sl-request-close", (event) => {
    if (event.detail.source === "overlay") {
      event.preventDefault();
    }
  });

  cancelReplaceButton.addEventListener("click", () =>
    replaceConfirmDialog.hide()
  );

  confirmReplaceButton.addEventListener("click", () => {
    if (pendingSVGFiles) {
      loadSVGFromFiles(pendingSVGFiles);
      pendingSVGFiles = null;
    }
    replaceConfirmDialog.hide();
  });

  uploadBtn.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const files = e.target.files;
    const original = draw.findOne("#original-svg");
    if (original) {
      pendingSVGFiles = files;
      replaceConfirmDialog.show();
    } else {
      loadSVGFromFiles(files);
    }
  });

  aboutButton.addEventListener("click", () => {
    aboutDialog.show();
  });

  reuploadButton.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  resampleButton.addEventListener("click", () => {
    if (!draw.findOne("#original-svg")) {
      alert("Original SVG not provided.");
      return;
    }
    draw.findOne("#display-svg")?.remove();
    draw.findOne("#polygon-svg")?.remove();

    convertToDisplay();
  });

  summonButton.addEventListener("click", () => {
    if (!draw.findOne("#original-svg")) {
      alert("Original SVG not provided.");
      return;
    }
    if (!resultDisplay) {
      alert("Display not provided.");
      return;
    }

    summonCommand();
  });

  function summonCommand() {
    const width = draw.findOne("#display-svg").bbox().width;

    resultDisplay.setDepth(depthInput.value);
    resultDisplay.move([0, 0]);
    resultDisplay.scale(widthInput.value / width);

    const command = resultDisplay.command();
    if (command.length > 32767) {
      longCommandAlert.classList.remove("hidden");
    }
    commandText.value = command;
    copyCommandButton.value = command;
    summonCommandDialog.show();
  }

  function convertToDisplay() {
    const sampleValue = samplerateSlider.value;

    const polygons = toPolygons(draw, sampleValue);
    const trianglePolygons = toTriangles(xorPolygon(polygons));
    resultDisplay = toDisplay(trianglePolygons);

    drawDisplay(draw, resultDisplay);

    // update counts
    verticeCount.textContent = getPointCount(polygons);
    triangleCount.textContent = trianglePolygons.flat().length;
    displayCount.textContent = resultDisplay.getTotalDisplayCount();

    // enable summon button
    summonButton.removeAttribute("disabled");
  }

  function selectOnly(button) {
    selectButtons.forEach((btn) => {
      if (btn === button) {
        btn.setAttribute("variant", "primary");
      } else {
        btn.setAttribute("variant", "default");
      }
    });
  }

  function loadSVGFromFiles(files) {
    const file = files[0];
    if (!file || file.type !== "image/svg+xml") {
      alert("Please upload a valid SVG file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      uploadPopup.classList.add("hidden");
      draw.clear();
      const svgText = event.target.result;

      const modifiedSVG = removeTransformationsFromSVG(stripOuterSVG(svgText));
      const group = draw.group().id("original-svg");
      group.svg(modifiedSVG);

      requestAnimationFrame(() => {
        const bbox = draw.bbox();
        applyViewboxAndZoom(bbox);
        visualizeDrawBBox(bbox);
      });
    };
    reader.readAsText(file);

    updateSidebar(file.name);
  }

  function updateSidebar(fileName) {
    // open sidebar
    sidebar.classList.add("open");
    toggleButton.classList.remove("hidden");

    // update filename
    const filenameLabel = document.getElementById("filename-label");
    if (filenameLabel && fileName) {
      filenameLabel.textContent = fileName;
    }

    // update counts
    verticeCount.textContent = "?";
    triangleCount.textContent = "?";
    displayCount.textContent = "?";

    // disable summon button
    summonButton.setAttribute("disabled", "");
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

  function stripOuterSVG(svgText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const inner = doc.documentElement.innerHTML;
    return inner;
  }

  function removeTransformationsFromSVG(svgText) {
    return svgText.replace(/transform="([^"]*)"/g, (match, content) => {
      const blacklist = ["scale", "rotate", "translate"];

      const kept = content
        .split(/\)\s*/g)
        .map((cmd) => cmd.trim())
        .filter((cmd) => cmd.length > 0)
        .map((cmd) => cmd + ")")
        .filter((cmd) => !blacklist.some((b) => cmd.startsWith(b)));

      if (kept.length === 0) {
        return "";
      }

      return `transform="${kept.join(" ")}"`;
    });
  }

  function visualizeDrawBBox(bbox) {
    const existing = draw.findOne("#bbox-visualizer");
    if (existing) existing.remove();
    draw
      .rect(bbox.width, bbox.height)
      .move(bbox.x, bbox.y)
      .fill("none")
      .stroke({ width: 1, color: "red", dasharray: "5,5" })
      .id("bbox-svg");
  }
});
