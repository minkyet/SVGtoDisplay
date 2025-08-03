import { vec2, stringifyLiteral } from "./utils.js";

/**
 * Represents a display entity, which can be either a block_display or text_display.
 * It supports transformation, nesting, and Minecraft summon command generation.
 */
export class Display {
  /**
   * @param {[number, number]} position - The position of the display entity.
   * @param {[[number, number], [number, number]]} sides - The two side vectors defining the parallelogram shape.
   */
  constructor(position, sides) {
    /** @type {string} The type of display entity ("block_display" or "text_display"). */
    this.type = "block_display";

    /** @type {{ Name: string }} The block state for block_display type. */
    this.state = { Name: "black_concrete" };

    /** @type {number} The background color code for text_display type. */
    this.colorCode = -16777216;

    /** @type {Display[]} List of nested (passenger) Display entities. */
    this.passengers = [];

    /** @type {string | undefined} UUID identifier (optional). */
    this.uuid = undefined;

    /** @type {[[number, number], [number, number]]} The two side vectors defining the parallelogram. */
    this.sides = sides;

    /** @type {number} Depth (Z scale) of the display entity. */
    this.depth = 0.0625;

    /** @type {[number, number]} Base position of the entity. */
    this.position = position;

    /** @type {[number, number]} Translation offset to be applied on top of position. */
    this.translation = [0, 0];

    /** @type {boolean} Whether this is the root display entity. */
    this.isRoot = false;
  }

  /**
   * Applies a callback function recursively to all passenger displays.
   * @param {(display: Display) => void} callback - The function to apply.
   */
  #invokeOnPassengers(callback) {
    if (this.passengers.length > 0) {
      this.passengers.forEach((passenger) => callback(passenger));
    }
  }

  /**
   * Combines a base display and nested passengers into one display.
   * @param {Display[]} displays - First display is the base, rest are nested.
   * @returns {Display} A single nested display entity.
   */
  static nestedDisplay([base, ...rest]) {
    base.translation = vec2.add(base.position, base.translation);
    base.position = [0, 0];
    rest.forEach((d) => base.addPassenger(d));
    return base;
  }

  /**
   * Adds a nested display (passenger) and updates its relative translation.
   * @param {Display} display - The display to be added as passenger.
   */
  addPassenger(display) {
    display.translation = vec2.add(
      display.translation,
      vec2.sub(display.position, this.position)
    );
    display.position = this.position;
    this.passengers.push(display);
  }

  /**
   * Sets a new base position for this display.
   * @param {[number, number]} position - New position.
   */
  move([x, y]) {
    this.position[0] = x;
    this.position[1] = y;
  }

  /**
   * Scales the display and all its passengers by the given factor.
   * @param {number} scaleFactor - The scaling factor.
   */
  scale(scaleFactor) {
    this.sides[0] = vec2.scale(this.sides[0], scaleFactor);
    this.sides[1] = vec2.scale(this.sides[1], scaleFactor);
    this.translation = vec2.scale(this.translation, scaleFactor);
    this.#invokeOnPassengers((p) => p.scale(scaleFactor));
  }

  /**
   * Sets the Z-depth of the display and propagates to passengers.
   * @param {number} depth - The new depth value.
   */
  setDepth(depth) {
    this.depth = depth;
    this.#invokeOnPassengers((p) => p.setDepth(depth));
  }

  /**
   * Sets the display type ("block_display" or "text_display").
   * @param {"block_display" | "text_display"} type - New display type.
   */
  setType(type) {
    if (type !== "block_display" && type !== "text_display") return;
    this.type = type;
    this.#invokeOnPassengers((p) => p.setType(type));
  }

  /**
   * Sets the block type for block_display entities.
   * @param {string} blockType - Minecraft block ID (e.g., "stone").
   */
  setBlockType(blockType) {
    this.state = { Name: blockType };
    this.#invokeOnPassengers((p) => p.setBlockType(blockType));
  }

  /**
   * Sets the color code for text_display entities.
   * @param {number} colorCode - ARGB integer color.
   */
  setColor(colorCode) {
    this.colorCode = colorCode;
    this.#invokeOnPassengers((p) => p.setColor(colorCode));
  }

  /**
   * Gets the absolute position of the display (position + translation).
   * @returns {[number, number]} The absolute position.
   */
  getAbsolutePosition() {
    return vec2.add(this.position, this.translation);
  }

  /**
   * Returns the 4x4 transformation matrix for the display.
   * Includes scaling, translation, and optional inversion for text.
   * @returns {number[][]} The transformation matrix.
   */
  getTransformation() {
    return this.type === "text_display"
      ? [
          [
            this.sides[1][0] * 8,
            this.sides[0][0] * 4,
            0,
            this.translation[0] + 0.4 * this.sides[1][0],
          ],
          [
            -this.sides[1][1] * 8,
            -this.sides[0][1] * 4,
            0,
            -(this.translation[1] + 0.4 * this.sides[1][1]),
          ],
          [0, 0, this.depth * 1, 0],
          [0, 0, 0, 1],
        ]
      : [
          [this.sides[0][0], this.sides[1][0], 0, this.translation[0]],
          [-this.sides[0][1], -this.sides[1][1], 0, -this.translation[1]],
          [0, 0, -this.depth, 0],
          [0, 0, 0, 1],
        ];
  }

  /**
   * Returns the 4 corner vertices of the display's parallelogram in counterclockwise.
   * @returns {[number, number][]} An array of 4 vertex positions.
   */
  getVertices() {
    const absPos = this.getAbsolutePosition();
    const s0 = this.sides[0];
    const s1 = this.sides[1];
    const cross = vec2.cross(s0, s1);
    const [v0, v1, v2, v3] =
      cross >= 0
        ? [
            absPos,
            vec2.add(absPos, s0),
            vec2.add(vec2.add(absPos, s0), s1),
            vec2.add(absPos, s1),
          ]
        : [
            absPos,
            vec2.add(absPos, s1),
            vec2.add(vec2.add(absPos, s1), s0),
            vec2.add(absPos, s0),
          ];

    return [v0, v1, v2, v3];
  }

  /**
   * Recursively counts the total number of displays including passengers.
   * @returns {number} Total count.
   */
  getTotalDisplayCount() {
    return (
      1 + this.passengers.reduce((sum, p) => sum + p.getTotalDisplayCount(), 0)
    );
  }

  /**
   * Generates the Minecraft summon command string.
   * @param {[string, string, string]} [pos=["~","~","~"]] - Position arguments.
   * @returns {string} The full summon command.
   */
  command(pos = ["~", "~", "~"]) {
    return ["summon", this.type, pos.join(" "), stringifyLiteral(this.nbt())]
      .join(" ")
      .replaceAll(", ", ",")
      .replaceAll(": ", ":");
  }

  /**
   * Generates the NBT data structure representing this display.
   * @returns {object} NBT-compatible object.
   */
  nbt() {
    const resultNBT = {
      id: this.type,
      transformation: this.getTransformation().flat(),
    };

    if (this.type === "block_display") {
      resultNBT.block_state = this.state;
    } else {
      resultNBT.background = this.colorCode;
      resultNBT.text = "\\s";
    }

    if (this.passengers.length > 0) {
      resultNBT.Passengers = this.passengers.map((p) => p.nbt());
    }

    return resultNBT;
  }
}

/**
 * Converts a triangle into 3 display entities representing parallelograms.
 * Each parallelogram covers one vertex and the two adjacent edges.
 *
 * @param {[number, number][]} points - Three 2D points defining a triangle.
 * @returns {Display[]} An array of 3 Display objects representing the triangle.
 */
export function triangleToDisplays(points) {
  // triangle to 3 parallelograms
  return points.map((p, i) => {
    const q = points[(i + 1) % 3];
    const r = points[(i + 2) % 3];
    return new Display(p, [
      vec2.scale(vec2.sub(q, p), 0.5),
      vec2.scale(vec2.sub(r, p), 0.5),
    ]);
  });
}
