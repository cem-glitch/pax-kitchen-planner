export function rotatedFootprint(item) {
  return Number(item.rotation || 0) % 180 === 0
    ? { w: Number(item.w || 0), d: Number(item.d || 0) }
    : { w: Number(item.d || 0), d: Number(item.w || 0) };
}

export function serializeScene({
  projectName,
  customerName,
  roomW,
  roomD,
  roomH,
  editor,
}) {
  return {
    projectName,
    customerName,
    room: {
      widthMm: roomW,
      depthMm: roomD,
      heightMm: roomH,
    },
    walls: (editor.walls || []).map((wall) => ({
      id: wall.id,
      start: { xMm: Math.round(wall.x1), yMm: Math.round(wall.y1) },
      end: { xMm: Math.round(wall.x2), yMm: Math.round(wall.y2) },
      thicknessMm: wall.thickness,
    })),
    openings: (editor.openings || []).map((opening) => ({
      id: opening.id,
      type: opening.type,
      wallId: opening.wallId,
      widthMm: opening.width,
      positionOnWall: opening.t,
      flip: !!opening.flip,
    })),
    utilities: (editor.utilities || []).map((utility) => ({
      id: utility.id,
      type: utility.type,
      xMm: Math.round(utility.x),
      yMm: Math.round(utility.y),
    })),
    equipment: (editor.equipment || []).map((item, index) => {
      const footprint = rotatedFootprint(item);
      return {
        number: index + 1,
        id: item.id,
        instanceId: item.instanceId,
        title: item.title,
        vendor: item.vendor || "",
        widthMm: item.w,
        depthMm: item.d,
        heightMm: item.h,
        footprintWidthMm: footprint.w,
        footprintDepthMm: footprint.d,
        xMm: Math.round(item.x),
        yMm: Math.round(item.y),
        rotationDeg: item.rotation || 0,
        imageUrl: item.image || null,
        estimatedDimensions: !!item.estimated,
      };
    }),
  };
}

const CAMERA_TEXT = {
  left_corner:
    "Camera is at the front-left corner of the room, eye height about 1650 mm, looking diagonally toward the back-right corner.",
  right_corner:
    "Camera is at the front-right corner of the room, eye height about 1650 mm, looking diagonally toward the back-left corner.",
  entrance:
    "Camera is positioned just inside the main entrance, eye height about 1650 mm, with a natural wide-angle architectural view.",
  elevated:
    "Camera is above normal eye level at about 2300 mm, angled slightly downward for a clear commercial-kitchen overview.",
};

const STYLE_TEXT = {
  realistic:
    "Photorealistic working commercial restaurant kitchen, clean neutral surfaces, realistic stainless steel, practical bright ceiling lighting, no decorative clutter.",
  stainless:
    "High-end professional stainless-steel commercial kitchen, neutral white/gray walls, realistic brushed metal, strong clean task lighting.",
  showroom:
    "Bright professional kitchen showroom look, clean light walls and floor, soft daylight-balanced lighting, premium but realistic presentation.",
};

export function buildRenderPrompt(scene, camera, style) {
  const products = scene.equipment
    .map(
      (item) =>
        [
          "#" + item.number,
          item.vendor ? item.vendor + " " + item.title : item.title,
          "external dimensions " +
            item.widthMm +
            "×" +
            item.depthMm +
            "×" +
            item.heightMm +
            " mm",
          "position x=" + item.xMm + " mm, y=" + item.yMm + " mm",
          "rotation " + item.rotationDeg + " degrees",
          item.estimatedDimensions ? "dimensions are estimated" : "dimensions verified from catalog",
        ].join("; ")
    )
    .join("\n");

  return [
    "Create one photorealistic architectural visualization of the exact commercial kitchen described below.",
    "",
    "STRICT GEOMETRY RULES:",
    "- The first reference image is the top-down PAX floor plan. Treat its walls and equipment rectangles as fixed geometry.",
    "- Preserve the room proportions, wall positions, openings, equipment locations, orientation, and clearances.",
    "- Do not move, add, remove, duplicate, resize, merge, or substitute any appliance.",
    "- Keep each product footprint proportional to its stated real width and depth.",
    "- All measurements are millimetres.",
    "",
    "STRICT PRODUCT IDENTITY RULES:",
    "- Product reference images follow the floor-plan image.",
    "- Preserve the visible design language, front panels, doors, controls, handles, logos, body proportions, colors, and materials of each referenced product.",
    "- Never invent a different model when a reference image exists.",
    "- If a side or rear face is not visible in the reference, keep it simple and physically plausible rather than inventing distinctive features.",
    "",
    "ROOM:",
    JSON.stringify(scene.room),
    "",
    "WALLS:",
    JSON.stringify(scene.walls),
    "",
    "OPENINGS:",
    JSON.stringify(scene.openings),
    "",
    "EQUIPMENT:",
    products || "No equipment",
    "",
    "CAMERA:",
    CAMERA_TEXT[camera] || CAMERA_TEXT.left_corner,
    "",
    "VISUAL STYLE:",
    STYLE_TEXT[style] || STYLE_TEXT.realistic,
    "",
    "OUTPUT:",
    "Landscape-oriented realistic restaurant-kitchen visualization. Accurate layout is more important than decoration. Keep circulation areas visibly open and do not add people, food, signs, text labels, extra appliances, shelves, plants, or decorations unless they already exist in the plan.",
  ].join("\n");
}

export function uniqueReferenceImages(scene, maxImages = 12) {
  const seen = new Set();
  const refs = [];

  for (const item of scene.equipment) {
    if (!item.imageUrl || seen.has(item.imageUrl)) continue;
    seen.add(item.imageUrl);
    refs.push({
      title: item.title,
      imageUrl: item.imageUrl,
    });
    if (refs.length >= maxImages) break;
  }

  return refs;
}
