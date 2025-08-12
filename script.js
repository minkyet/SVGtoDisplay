import { Display } from "./display.js";
import { drawDisplay, drawPolygon, toPolygons } from "./draw.js";
import { toDisplay } from "./geometry.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  fetch("config.json")
    .then((res) => res.json())
    .then((config) => {
      $("version").textContent = `v${config.version}`;
    })
    .catch((err) => console.error("FAILED loading config: ", err));

  // DOM Elements
  const sidebarToggleButton = $("menu-toggle");
  const sidebar = $("sidebar");
  const svgRenderArea = $("svg-render-area");
  const uploadBtn = $("upload-btn");
  const fileInput = $("file-input");
  const uploadPopup = $("svg-upload-popup");
  const aboutButton = $("about-btn");
  const aboutDialog = $("about-dialog");

  const replaceConfirmDialog = $("replace-confirm-dialog");
  const cancelReplaceButton = $("cancel-replace-btn");
  const confirmReplaceButton = $("confirm-replace-btn");

  const summonCommandDialog = $("summon-command-dialog");
  const commandText = $("command-text");
  const copyCommandButton = $("copy-command-btn");
  const longCommandAlert = $("long-command-alert");

  const reuploadButton = $("reupload-btn");
  const samplerateSlider = $("samplerate-slider");
  const polygonCount = $("polygon-count");
  const verticeCount = $("vertice-count");
  const displayCount = $("display-count");

  const convertButton = $("convert-btn");

  const colorModeGroup = $("colormode-group");
  const displayTypeGroup = $("display-type-group");
  const blockDisplayRadio = $("block-display-radio");
  const blockDisplayRadioTooltip = $("block-display-radio-tooltip");

  const blockWrapper = $("block-input-wrapper");
  const textWrapper = $("text-input-wrapper");
  const globalBlockType = $("global-block-type");
  const globalColor = $("global-color");

  const toggleOriginal = $("toggle-original");
  const toggleDisplay = $("toggle-display");
  const toggleBorder = $("toggle-border");
  const toggleBbox = $("toggle-bbox");
  const toggleButtons = {
    "#original-svg": toggleOriginal,
    "#display-svg": toggleDisplay,
    "#polygon-svg": toggleBorder,
    "#bbox-svg": toggleBbox,
  };

  const depthInput = $("depth-input");
  const widthInput = $("width-input");

  const summonButton = $("summon-btn");
  const summonButtonTooltip = $("summon-btn-tooltip");

  const draw = SVG().addTo(svgRenderArea).size("100%", "100%");

  const MAX_COMMAND_LENGTH = 32767;
  let resultDisplay = null;
  let pendingSVGFiles = null;
  let displayType = "block_display";
  let colorMode = "Monochrome";

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
  await samplerateSlider.updateComplete;
  samplerateSlider.tooltipFormatter = (value) => `${value}%`;
  samplerateSlider.label = `Sample rate: ${samplerateSlider.value}%`;
  samplerateSlider.addEventListener("input", () => {
    const value = samplerateSlider.value;
    samplerateSlider.label = `Sample rate: ${value}%`;
  });

  // eye toggle buttons
  Object.entries(toggleButtons).forEach(([selector, button]) => {
    setupToggleIconButton(button, selector);
  });

  // color mode button
  colorModeGroup.addEventListener("sl-input", (e) => {
    const selectedValue = Number(e.target.value);
    if (selectedValue === 1) {
      colorMode = "Monochrome";
      blockDisplayRadio.removeAttribute("disabled");
      blockDisplayRadioTooltip.setAttribute("disabled", "");
      globalBlockType.removeAttribute("disabled");
      globalColor.removeAttribute("disabled");
    } else if (selectedValue === 2) {
      colorMode = "MultiColor";
      blockDisplayRadio.setAttribute("disabled", "");
      blockDisplayRadioTooltip.removeAttribute("disabled");
      globalBlockType.setAttribute("disabled", "");
      globalColor.setAttribute("disabled", "");
      displayTypeGroup.setAttribute("value", "2");
      setDisplayType(2);
    }
  });

  // display type button
  displayTypeGroup.addEventListener("sl-input", (e) => {
    const selectedValue = Number(e.target.value);
    setDisplayType(selectedValue);
  });

  sidebarToggleButton.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  // Drag & Drop
  ["dragenter", "dragover"].forEach((evt) =>
    svgRenderArea.addEventListener(evt, preventDrag("add"))
  );
  ["dragleave", "drop"].forEach((evt) =>
    svgRenderArea.addEventListener(evt, preventDrag("remove"))
  );

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

  convertButton.addEventListener("click", () => {
    if (!requireOriginalSVG()) return;

    draw.findOne("#display-svg")?.clear();
    draw.findOne("#polygon-svg")?.clear();

    convertToDisplay();
  });

  summonButton.addEventListener("click", () => {
    if (!requireOriginalSVG()) return;

    if (!resultDisplay) {
      alert("Display not provided.");
      return;
    }

    summonCommand();
  });

  function preventDrag(action) {
    return (e) => {
      e.preventDefault();
      svgRenderArea.classList[action]("dragging");
    };
  }

  function setupPanZoom(target) {
    target.panZoom({
      panning: true,
      wheelZoom: true,
      pinchZoom: true,
      zoomMin: 0.1,
      zoomMax: 40,
      zoomFactor: 0.1,
    });
  }

  function requireOriginalSVG() {
    const original = draw.findOne("#original-svg");
    if (!original) {
      alert("Original SVG not provided.");
      return false;
    }
    return true;
  }

  function setupToggleIconButton(button, selector) {
    button.addEventListener("click", () => {
      const node = draw.findOne(selector);
      if (node) {
        button.name = button.name === "eye" ? "eye-slash" : "eye";
        node.visible() ? node.hide() : node.show();
      }
    });
  }

  function summonCommand() {
    const bbox = draw.findOne("#display-svg").bbox();
    const width = bbox.width;
    const bboxPos = [bbox.x, bbox.y];
    const summonDisplay = resultDisplay.clone();

    summonDisplay.setType(displayType);
    if (displayType === "block_display") {
      summonDisplay.setBlockType(globalBlockType.value);
      summonDisplay.setDepth(depthInput.value);
    } else if (colorMode === "Monochrome") {
      summonDisplay.setColor(globalColor.getFormattedValue("hex").slice(1));
    }
    summonDisplay.move([-bboxPos[0], -bboxPos[1]]);
    summonDisplay.scale(widthInput.value / width);

    const command = summonDisplay.command();
    if (command.length > MAX_COMMAND_LENGTH) {
      longCommandAlert.classList.remove("hidden");
    }
    commandText.value = command;
    copyCommandButton.value = commandText.value;
    summonCommandDialog.show();
  }

  function convertToDisplay() {
    const original = draw.findOne("#original-svg");
    if (!original) {
      alert("Original SVG not provided.");
      return false;
    }
    const sampleValue = samplerateSlider.value;
    const polygonGroup =
      draw.findOne("#polygon-svg") ?? draw.group().id("polygon-svg");
    const displayGroup =
      draw.findOne("#display-svg") ?? draw.group().id("display-svg");

    const polygons = toPolygons(original, sampleValue);
    const displays = polygons.reduce((acc, polygon) => {
      const display = toDisplay(polygon);
      if (display) acc.push(display);
      return acc;
    }, []);

    resultDisplay = Display.nestedDisplay(displays);

    // draw border
    polygons.forEach((poly) => {
      drawPolygon(draw, poly).forEach((el) => polygonGroup.add(el));
    });
    // draw display
    drawDisplay(draw, resultDisplay).forEach((el) => displayGroup.add(el));

    // update counts
    polygonCount.textContent = polygons.length;
    verticeCount.textContent = polygons.reduce(
      (sum, poly) => sum + poly.getVertexCount(),
      0
    );
    displayCount.textContent = resultDisplay.getTotalDisplayCount();

    // enable summon button
    summonButton.removeAttribute("disabled");
    summonButtonTooltip.setAttribute("disabled", "");
  }

  function loadSVGFromFiles(files) {
    const file = files[0];
    if (!file || file.type !== "image/svg+xml") {
      alert("Please upload a valid SVG file.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      alert("Failed to read the SVG file.");
    };
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

  function resetDisplayStats() {
    polygonCount.textContent =
      verticeCount.textContent =
      displayCount.textContent =
        "?";
    summonButton.setAttribute("disabled", "");
    summonButtonTooltip.removeAttribute("disabled");
    Object.entries(toggleButtons).forEach(([selector, button]) => {
      button.name = "eye";
    });
    longCommandAlert.classList.add("hidden");
  }

  function updateSidebar(fileName) {
    // open sidebar
    sidebar.classList.add("open");
    sidebarToggleButton.classList.remove("hidden");

    // update filename
    const filenameLabel = $("filename-label");
    if (filenameLabel && fileName) {
      filenameLabel.textContent = fileName;
    }

    resetDisplayStats();
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

    setupPanZoom(draw);
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
      .stroke({ width: 0.5, color: "red", dasharray: "5,5" })
      .id("bbox-svg");
  }

  function setDisplayType(selectedValue) {
    if (selectedValue === 1) {
      displayType = "block_display";
      depthInput.removeAttribute("disabled");
      blockWrapper.classList.add("active");
      textWrapper.classList.remove("active");
    } else if (selectedValue === 2) {
      displayType = "text_display";
      depthInput.setAttribute("disabled", "");
      blockWrapper.classList.remove("active");
      textWrapper.classList.add("active");
    }
  }
});
