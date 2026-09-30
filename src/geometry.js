export const GRID_MM = 100;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function snap(value, grid = GRID_MM) {
  return Math.round(value / grid) * grid;
}

export function pointDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function wallLength(wall) {
  return Math.sqrt(
    Math.pow(wall.x2 - wall.x1, 2) +
    Math.pow(wall.y2 - wall.y1, 2)
  );
}

export function wallOrientation(wall) {
  return Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1)
    ? "horizontal"
    : "vertical";
}

export function snapOrthogonal(start, raw, roomW, roomD) {
  const dx = raw.x - start.x;
  const dy = raw.y - start.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: clamp(snap(raw.x), 0, roomW),
      y: clamp(snap(start.y), 0, roomD),
    };
  }

  return {
    x: clamp(snap(start.x), 0, roomW),
    y: clamp(snap(raw.y), 0, roomD),
  };
}

export function nearestPointOnWall(point, wall) {
  const vx = wall.x2 - wall.x1;
  const vy = wall.y2 - wall.y1;
  const wx = point.x - wall.x1;
  const wy = point.y - wall.y1;
  const len2 = vx * vx + vy * vy;

  if (!len2) {
    return {
      point: { x: wall.x1, y: wall.y1 },
      t: 0,
      distance: pointDistance(point, { x: wall.x1, y: wall.y1 }),
    };
  }

  const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
  const projected = {
    x: wall.x1 + t * vx,
    y: wall.y1 + t * vy,
  };

  return {
    point: projected,
    t,
    distance: pointDistance(point, projected),
  };
}

export function findNearestWall(point, walls, maxDistance = Infinity) {
  let best = null;

  for (const wall of walls) {
    const candidate = nearestPointOnWall(point, wall);
    if (!best || candidate.distance < best.distance) {
      best = { ...candidate, wall };
    }
  }

  if (!best || best.distance > maxDistance) return null;
  return best;
}

export function rotatedSize(item) {
  return item.rotation % 180 === 0
    ? { w: item.w, d: item.d }
    : { w: item.d, d: item.w };
}

export function rectanglesOverlap(a, b) {
  const as = rotatedSize(a);
  const bs = rotatedSize(b);

  return !(
    a.x + as.w <= b.x ||
    b.x + bs.w <= a.x ||
    a.y + as.d <= b.y ||
    b.y + bs.d <= a.y
  );
}

export function clampEquipment(item, roomW, roomD) {
  const size = rotatedSize(item);

  return {
    ...item,
    x: clamp(item.x, 0, Math.max(0, roomW - size.w)),
    y: clamp(item.y, 0, Math.max(0, roomD - size.d)),
  };
}

export function snapEquipmentToBoundary(item, roomW, roomD, threshold = 140) {
  const size = rotatedSize(item);
  let x = item.x;
  let y = item.y;

  if (x < threshold) x = 0;
  if (y < threshold) y = 0;
  if (roomW - (x + size.w) < threshold) x = roomW - size.w;
  if (roomD - (y + size.d) < threshold) y = roomD - size.d;

  return { ...item, x, y };
}

export function createRectangleWalls(roomW, roomD, thickness = 150) {
  return [
    { id: "wall-top", x1: 0, y1: 0, x2: roomW, y2: 0, thickness },
    { id: "wall-right", x1: roomW, y1: 0, x2: roomW, y2: roomD, thickness },
    { id: "wall-bottom", x1: roomW, y1: roomD, x2: 0, y2: roomD, thickness },
    { id: "wall-left", x1: 0, y1: roomD, x2: 0, y2: 0, thickness },
  ];
}

export function openingPoint(opening, wall) {
  return {
    x: wall.x1 + (wall.x2 - wall.x1) * opening.t,
    y: wall.y1 + (wall.y2 - wall.y1) * opening.t,
  };
}

export function openingEndpoints(opening, wall) {
  const length = wallLength(wall);
  if (!length) return null;

  const ux = (wall.x2 - wall.x1) / length;
  const uy = (wall.y2 - wall.y1) / length;
  const center = openingPoint(opening, wall);
  const half = opening.width / 2;

  return {
    a: { x: center.x - ux * half, y: center.y - uy * half },
    b: { x: center.x + ux * half, y: center.y + uy * half },
    center,
    ux,
    uy,
  };
}

export function entityAtPoint(point, editor, tolerance = 220) {
  for (const opening of editor.openings) {
    const wall = editor.walls.find((w) => w.id === opening.wallId);
    if (!wall) continue;
    const center = openingPoint(opening, wall);
    if (pointDistance(point, center) <= tolerance) {
      return { kind: "opening", id: opening.id };
    }
  }

  for (const utility of editor.utilities) {
    if (pointDistance(point, utility) <= tolerance) {
      return { kind: "utility", id: utility.id };
    }
  }

  const nearest = findNearestWall(point, editor.walls, tolerance);
  if (nearest) return { kind: "wall", id: nearest.wall.id };

  return null;
}
