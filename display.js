import { vec2, stringifyLiteral } from "./utils.js";

export class Display {
  constructor(position, sides) {
    this.type = "block_display";
    this.state = { Name: "black_concrete" };
    this.colorCode = -16777216;
    this.passengers = [];
    this.uuid = undefined;
    this.sides = sides;
    this.depth = 0.0625;
    this.position = position;
    this.translation = [0, 0];
    this.isRoot = false;
  }

  #invokeOnPassengers(callback) {
    if (this.passengers.length > 0) {
      this.passengers.forEach((passenger) => callback(passenger));
    }
  }

  // Returns a nested Display based on the first Display
  static nestedDisplay([base, ...rest]) {
    base.translation = vec2.add(base.position, base.translation);
    base.position = [0, 0];
    rest.forEach((d) => base.addPassenger(d));
    return base;
  }

  // Add passenger & set delta translation
  addPassenger(display) {
    display.translation = vec2.add(
      display.translation,
      vec2.sub(display.position, this.position)
    );
    display.position = this.position;
    this.passengers.push(display);
  }

  // Change Display's position (not translation)
  move([x, y]) {
    this.position[0] = x;
    this.position[1] = y;
  }

  // Change Display's scale
  scale(scaleFactor) {
    this.sides[0] = vec2.scale(this.sides[0], scaleFactor);
    this.sides[1] = vec2.scale(this.sides[1], scaleFactor);
    this.translation = vec2.scale(this.translation, scaleFactor);

    this.#invokeOnPassengers((p) => p.scale(scaleFactor));
  }

  // Change Display's depth
  setDepth(depth) {
    this.depth = depth;
    this.#invokeOnPassengers((p) => p.setDepth(depth));
  }

  // Change Display's type (block or text)
  setType(type) {
    if (type !== "block_display" && type !== "text_display") return;
    this.type = type;
    this.#invokeOnPassengers((p) => p.setType(type));
  }

  // Change Block display's type
  setBlockType(blockType) {
    this.state = { Name: blockType };
    this.#invokeOnPassengers((p) => p.setBlockType(blockType));
  }

  // Change Text display's color code
  setColor(colorCode) {
    this.colorCode = colorCode;
    this.#invokeOnPassengers((p) => p.setColor(colorCode));
  }

  // Returns absolute position (position + translation)
  getAbsolutePosition() {
    return vec2.add(this.position, this.translation);
  }

  // Returns transformation matrix (invert y)
  getTransformation() {
    // text "\s" offset: (8x+0.4, 4y)
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

  // Returns 4 vertices
  getVertices() {
    const absPos = this.getAbsolutePosition();
    return [
      ...absPos,
      ...vec2.add(absPos, this.sides[0]),
      ...vec2.add(vec2.add(absPos, this.sides[0]), this.sides[1]),
      ...vec2.add(absPos, this.sides[1]),
    ];
  }

  // Returns total display count
  getTotalDisplayCount() {
    return (
      1 + this.passengers.reduce((sum, p) => sum + p.getTotalDisplayCount(), 0)
    );
  }

  // Returns summon command string
  command(pos = ["~", "~", "~"]) {
    return ["summon", this.type, pos.join(" "), stringifyLiteral(this.nbt())]
      .join(" ")
      .replaceAll(", ", ",")
      .replaceAll(": ", ":");
  }

  // Returns display entity's NBT
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

export function triangleToDisplay(triangle) {
  const points = [
    [triangle[0], triangle[1]],
    [triangle[2], triangle[3]],
    [triangle[4], triangle[5]],
  ];

  // triangle to 3 parallelograms
  return Display.nestedDisplay(
    points.map((p, i) => {
      const q = points[(i + 1) % 3];
      const r = points[(i + 2) % 3];
      return new Display(p, [
        vec2.scale(vec2.sub(q, p), 0.5),
        vec2.scale(vec2.sub(r, p), 0.5),
      ]);
    })
  );
}
