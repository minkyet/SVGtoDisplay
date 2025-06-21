import { vec2, stringifyLiteral } from "./utils.js";

export class Display {
  constructor(position, sides) {
    this.type = "block_display";
    this.state = { Name: "stone" };
    this.passengers = [];
    this.uuid = undefined;
    this.sides = sides;
    this.depth = 0.0625;
    this.position = position;
    this.translation = [0, 0];
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
    this.translation = vec2.scale(this.translation, 0.5);

    if (this.passengers.length > 0) {
      this.passengers.forEach((passenger) => passenger.scale(scaleFactor));
    }
  }

  // Returns absolute position (position + translation)
  getAbsolutePosition() {
    return vec2.add(this.position, this.translation);
  }

  // Returns transformation matrix
  getTransformation() {
    return [
      [...this.sides[0], 0, this.translation[0]],
      [...this.sides[1], 0, this.translation[1]],
      [0, 0, this.depth, 0],
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

  command() {
    return [
      "summon",
      this.type,
      `${this.position[0]} ${this.position[1]} 0`,
      stringifyLiteral(this.nbt()),
    ].join(" ");
  }

  nbt() {
    return {
      id: this.type,
      block_state: this.state,
      transformation: this.getTransformation().flat(),
      Passengers: this.passengers.map((p) => p.nbt()),
    };
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
