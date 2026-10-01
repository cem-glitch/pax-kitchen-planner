import {
  clamp,
  rotatedSize,
  wallLength,
  wallOrientation,
} from "./geometry";

function overlaps(a1, a2, b1, b2, padding = 40) {
  return a1 < b2 + padding && b1 < a2 + padding;
}

function round10(value) {
  return Math.round(value / 10) * 10;
}

function normalizedKey(p1, p2) {
  const a = { x: round10(p1.x), y: round10(p1.y) };
  const b = { x: round10(p2.x), y: round10(p2.y) };
  const first =
    a.x < b.x || (a.x === b.x && a.y <= b.y)
      ? a
      : b;
  const second = first === a ? b : a;
  return (
    first.x +
    ":" +
    first.y +
    "-" +
    second.x +
    ":" +
    second.y
  );
}

function lengthOf(p1, p2) {
  return Math.max(
    Math.abs(p2.x - p1.x),
    Math.abs(p2.y - p1.y)
  );
}

function addDimension(list, seen, id, p1, p2, kind, priority = 0) {
  const length = lengthOf(p1, p2);
  if (!Number.isFinite(length) || length < 50) return;

  const key = normalizedKey(p1, p2);
  if (seen.has(key)) return;
  seen.add(key);

  list.push({
    id,
    p1: {
      x: round10(p1.x),
      y: round10(p1.y),
    },
    p2: {
      x: round10(p2.x),
      y: round10(p2.y),
    },
    kind,
    auto: true,
    priority,
  });
}

function wallSpanContains(wall, axisValue, padding = 100) {
  if (wallOrientation(wall) === "horizontal") {
    const min = Math.min(wall.x1, wall.x2) - padding;
    const max = Math.max(wall.x1, wall.x2) + padding;
    return axisValue >= min && axisValue <= max;
  }

  const min = Math.min(wall.y1, wall.y2) - padding;
  const max = Math.max(wall.y1, wall.y2) + padding;
  return axisValue >= min && axisValue <= max;
}

export function createAutoDimensions(editor, roomW, roomD) {
  const dimensions = [];
  const seen = new Set();
  const walls = editor.walls || [];
  const equipment = editor.equipment || [];

  // Overall room dimensions, kept slightly inside the canvas so labels remain visible.
  const roomOffset = Math.min(180, roomD * 0.08);
  addDimension(
    dimensions,
    seen,
    "auto-room-width",
    { x: 0, y: roomOffset },
    { x: roomW, y: roomOffset },
    "room",
    100
  );

  const roomDepthOffset = Math.min(180, roomW * 0.08);
  addDimension(
    dimensions,
    seen,
    "auto-room-depth",
    { x: roomDepthOffset, y: 0 },
    { x: roomDepthOffset, y: roomD },
    "room",
    100
  );

  // Every wall gets its own length dimension, offset toward the room centre.
  walls.forEach((wall, index) => {
    if (wallLength(wall) < 300) return;

    if (wallOrientation(wall) === "horizontal") {
      const direction = wall.y1 <= roomD / 2 ? 1 : -1;
      const y = clamp(
        wall.y1 + direction * 150,
        80,
        roomD - 80
      );
      addDimension(
        dimensions,
        seen,
        "auto-wall-" + index,
        { x: wall.x1, y },
        { x: wall.x2, y },
        "wall",
        70
      );
    } else {
      const direction = wall.x1 <= roomW / 2 ? 1 : -1;
      const x = clamp(
        wall.x1 + direction * 150,
        80,
        roomW - 80
      );
      addDimension(
        dimensions,
        seen,
        "auto-wall-" + index,
        { x, y: wall.y1 },
        { x, y: wall.y2 },
        "wall",
        70
      );
    }
  });

  equipment.forEach((item, index) => {
    const size = rotatedSize(item);
    const left = item.x;
    const right = item.x + size.w;
    const top = item.y;
    const bottom = item.y + size.d;
    const centerX = left + size.w / 2;
    const centerY = top + size.d / 2;

    // Product footprint dimensions.
    const widthY = clamp(
      top + Math.min(90, Math.max(25, size.d * 0.18)),
      top,
      bottom
    );
    addDimension(
      dimensions,
      seen,
      "auto-eq-width-" + index,
      { x: left, y: widthY },
      { x: right, y: widthY },
      "equipment",
      50
    );

    const depthX = clamp(
      left + Math.min(90, Math.max(25, size.w * 0.18)),
      left,
      right
    );
    addDimension(
      dimensions,
      seen,
      "auto-eq-depth-" + index,
      { x: depthX, y: top },
      { x: depthX, y: bottom },
      "equipment",
      50
    );

    // Nearest obstruction to the left.
    let leftEdge = 0;
    for (const wall of walls) {
      if (
        wallOrientation(wall) === "vertical" &&
        wall.x1 <= left &&
        wallSpanContains(wall, centerY)
      ) {
        leftEdge = Math.max(leftEdge, wall.x1);
      }
    }
    for (const other of equipment) {
      if (other.instanceId === item.instanceId) continue;
      const otherSize = rotatedSize(other);
      const otherRight = other.x + otherSize.w;
      if (
        otherRight <= left &&
        overlaps(top, bottom, other.y, other.y + otherSize.d)
      ) {
        leftEdge = Math.max(leftEdge, otherRight);
      }
    }
    addDimension(
      dimensions,
      seen,
      "auto-gap-left-" + index,
      { x: leftEdge, y: centerY },
      { x: left, y: centerY },
      "clearance",
      80
    );

    // Nearest obstruction to the right.
    let rightEdge = roomW;
    for (const wall of walls) {
      if (
        wallOrientation(wall) === "vertical" &&
        wall.x1 >= right &&
        wallSpanContains(wall, centerY)
      ) {
        rightEdge = Math.min(rightEdge, wall.x1);
      }
    }
    for (const other of equipment) {
      if (other.instanceId === item.instanceId) continue;
      const otherSize = rotatedSize(other);
      if (
        other.x >= right &&
        overlaps(top, bottom, other.y, other.y + otherSize.d)
      ) {
        rightEdge = Math.min(rightEdge, other.x);
      }
    }
    addDimension(
      dimensions,
      seen,
      "auto-gap-right-" + index,
      { x: right, y: centerY },
      { x: rightEdge, y: centerY },
      "clearance",
      80
    );

    // Nearest obstruction above.
    let topEdge = 0;
    for (const wall of walls) {
      if (
        wallOrientation(wall) === "horizontal" &&
        wall.y1 <= top &&
        wallSpanContains(wall, centerX)
      ) {
        topEdge = Math.max(topEdge, wall.y1);
      }
    }
    for (const other of equipment) {
      if (other.instanceId === item.instanceId) continue;
      const otherSize = rotatedSize(other);
      const otherBottom = other.y + otherSize.d;
      if (
        otherBottom <= top &&
        overlaps(left, right, other.x, other.x + otherSize.w)
      ) {
        topEdge = Math.max(topEdge, otherBottom);
      }
    }
    addDimension(
      dimensions,
      seen,
      "auto-gap-top-" + index,
      { x: centerX, y: topEdge },
      { x: centerX, y: top },
      "clearance",
      80
    );

    // Nearest obstruction below.
    let bottomEdge = roomD;
    for (const wall of walls) {
      if (
        wallOrientation(wall) === "horizontal" &&
        wall.y1 >= bottom &&
        wallSpanContains(wall, centerX)
      ) {
        bottomEdge = Math.min(bottomEdge, wall.y1);
      }
    }
    for (const other of equipment) {
      if (other.instanceId === item.instanceId) continue;
      const otherSize = rotatedSize(other);
      if (
        other.y >= bottom &&
        overlaps(left, right, other.x, other.x + otherSize.w)
      ) {
        bottomEdge = Math.min(bottomEdge, other.y);
      }
    }
    addDimension(
      dimensions,
      seen,
      "auto-gap-bottom-" + index,
      { x: centerX, y: bottom },
      { x: centerX, y: bottomEdge },
      "clearance",
      80
    );
  });

  return dimensions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 120);
}
