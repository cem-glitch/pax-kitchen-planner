import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import {
  clamp,
  entityAtPoint,
  findNearestWall,
  openingEndpoints,
  rectanglesOverlap,
  rotatedSize,
  snap,
  snapEquipmentToBoundary,
  snapEquipmentToWalls,
  snapOrthogonal,
  wallLength,
} from "./geometry";

const WALL_COLOR = "#293746";
const SELECTED = "#1677D2";
const GRID = "#E9EDF2";
const BG = "#FCFDFE";

function pointsEqual(a, b, tolerance = 10) {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceToSegment(point, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = point.x - a.x;
  const wy = point.y - a.y;
  const len2 = vx * vx + vy * vy;

  if (!len2) return distance(point, a);

  const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
  const projection = {
    x: a.x + t * vx,
    y: a.y + t * vy,
  };
  return distance(point, projection);
}

function gridLines(roomW, roomD, scale) {
  const lines = [];
  const spacing = 500;

  for (let x = 0; x <= roomW; x += spacing) {
    lines.push(
      <Line
        key={"gx-" + x}
        x1={x * scale}
        y1={0}
        x2={x * scale}
        y2={roomD * scale}
        stroke={GRID}
        strokeWidth={1}
      />
    );
  }

  for (let y = 0; y <= roomD; y += spacing) {
    lines.push(
      <Line
        key={"gy-" + y}
        x1={0}
        y1={y * scale}
        x2={roomW * scale}
        y2={y * scale}
        stroke={GRID}
        strokeWidth={1}
      />
    );
  }

  return lines;
}

function DraggableEquipment({
  item,
  scale,
  selected,
  roomW,
  roomD,
  walls,
  equipment,
  interactive,
  onSelect,
  onCommitMove,
}) {
  const size = rotatedSize(item);
  const footprintWidth = Math.max(6, size.w * scale);
  const footprintDepth = Math.max(6, size.d * scale);
  const startX = item.x * scale;
  const startY = item.y * scale;
  const pan = useRef(new Animated.ValueXY({ x: startX, y: startY })).current;
  const itemRef = useRef(item);
  const dataRef = useRef({
    scale,
    roomW,
    roomD,
    walls,
    equipment,
    interactive,
    onSelect,
    onCommitMove,
  });

  useEffect(() => {
    itemRef.current = item;
    dataRef.current = {
      scale,
      roomW,
      roomD,
      walls,
      equipment,
      interactive,
      onSelect,
      onCommitMove,
    };
    pan.setValue({ x: item.x * scale, y: item.y * scale });
  }, [
    item,
    scale,
    roomW,
    roomD,
    walls,
    equipment,
    interactive,
    onSelect,
    onCommitMove,
    pan,
  ]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        dataRef.current.interactive && !itemRef.current.locked,
      onMoveShouldSetPanResponder: () =>
        dataRef.current.interactive && !itemRef.current.locked,
      onPanResponderGrant: () => {
        const current = itemRef.current;
        dataRef.current.onSelect({
          kind: "equipment",
          id: current.instanceId,
        });
      },
      onPanResponderMove: (_, gesture) => {
        const current = itemRef.current;
        const currentScale = dataRef.current.scale;
        pan.setValue({
          x: current.x * currentScale + gesture.dx,
          y: current.y * currentScale + gesture.dy,
        });
      },
      onPanResponderRelease: (_, gesture) => {
        const current = itemRef.current;
        const data = dataRef.current;

        let candidate = {
          ...current,
          x: snap(current.x + gesture.dx / data.scale, 50),
          y: snap(current.y + gesture.dy / data.scale, 50),
        };

        candidate = snapEquipmentToBoundary(
          candidate,
          data.roomW,
          data.roomD,
          130
        );
        candidate = snapEquipmentToWalls(
          candidate,
          data.walls,
          data.roomW,
          data.roomD,
          160
        );

        const collision = data.equipment.some(
          (other) =>
            other.instanceId !== current.instanceId &&
            rectanglesOverlap(candidate, other)
        );

        if (collision) {
          pan.setValue({
            x: current.x * data.scale,
            y: current.y * data.scale,
          });
          return;
        }

        data.onCommitMove(candidate);
      },
    })
  ).current;

  return (
    <Animated.View
      {...responder.panHandlers}
      pointerEvents={interactive ? "auto" : "none"}
      style={[
        styles.equipment,
        item.estimated && styles.equipmentEstimated,
        item.locked && styles.equipmentLocked,
        selected && styles.equipmentSelected,
        {
          width: footprintWidth,
          height: footprintDepth,
          transform: pan.getTranslateTransform(),
        },
      ]}
    >
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          style={styles.equipmentImage}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.equipmentFallback}>
          {(item.type || "P").slice(0, 1).toUpperCase()}
        </Text>
      )}

      <View style={styles.frontIndicator} />
      <Text numberOfLines={1} style={styles.equipmentLabel}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={styles.equipmentSize}>
        {size.w} × {size.d}
        {item.estimated ? " ~" : ""}
      </Text>
    </Animated.View>
  );
}

function EndpointHandle({
  point,
  scale,
  roomW,
  roomD,
  onPreview,
  onMoveEnd,
}) {
  const dataRef = useRef({
    point,
    scale,
    roomW,
    roomD,
    onPreview,
    onMoveEnd,
  });

  useEffect(() => {
    dataRef.current = {
      point,
      scale,
      roomW,
      roomD,
      onPreview,
      onMoveEnd,
    };
  }, [point, scale, roomW, roomD, onPreview, onMoveEnd]);

  const getPoint = (gesture) => {
    const data = dataRef.current;
    return {
      x: clamp(
        snap(data.point.x + gesture.dx / data.scale, 50),
        0,
        data.roomW
      ),
      y: clamp(
        snap(data.point.y + gesture.dy / data.scale, 50),
        0,
        data.roomD
      ),
    };
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        dataRef.current.onPreview(getPoint(gesture));
      },
      onPanResponderRelease: (_, gesture) => {
        const next = getPoint(gesture);
        dataRef.current.onPreview(null);
        dataRef.current.onMoveEnd(next);
      },
      onPanResponderTerminate: () => dataRef.current.onPreview(null),
    })
  ).current;

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.endpoint,
        {
          left: point.x * scale - 14,
          top: point.y * scale - 14,
        },
      ]}
    >
      <View style={styles.endpointInner} />
    </View>
  );
}

function WallDragHandle({
  wall,
  scale,
  roomW,
  roomD,
  onSelect,
  onPreview,
  onMoveEnd,
}) {
  const horizontal =
    Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);
  const dataRef = useRef({
    wall,
    scale,
    roomW,
    roomD,
    onSelect,
    onPreview,
    onMoveEnd,
  });

  useEffect(() => {
    dataRef.current = {
      wall,
      scale,
      roomW,
      roomD,
      onSelect,
      onPreview,
      onMoveEnd,
    };
  }, [wall, scale, roomW, roomD, onSelect, onPreview, onMoveEnd]);

  const getDelta = (gesture) => {
    const data = dataRef.current;
    const current = data.wall;
    const isHorizontal =
      Math.abs(current.x2 - current.x1) >=
      Math.abs(current.y2 - current.y1);

    if (isHorizontal) {
      const raw = snap(gesture.dy / data.scale, 50);
      const minY = Math.min(current.y1, current.y2);
      const maxY = Math.max(current.y1, current.y2);
      const dy = clamp(raw, -minY, data.roomD - maxY);
      return { dx: 0, dy };
    }

    const raw = snap(gesture.dx / data.scale, 50);
    const minX = Math.min(current.x1, current.x2);
    const maxX = Math.max(current.x1, current.x2);
    const dx = clamp(raw, -minX, data.roomW - maxX);
    return { dx, dy: 0 };
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) + Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () =>
        dataRef.current.onSelect({
          kind: "wall",
          id: dataRef.current.wall.id,
        }),
      onPanResponderMove: (_, gesture) =>
        dataRef.current.onPreview(getDelta(gesture)),
      onPanResponderRelease: (_, gesture) => {
        const delta = getDelta(gesture);
        dataRef.current.onPreview(null);
        dataRef.current.onMoveEnd(delta);
      },
      onPanResponderTerminate: () => dataRef.current.onPreview(null),
    })
  ).current;

  const left = Math.min(wall.x1, wall.x2) * scale;
  const top = Math.min(wall.y1, wall.y2) * scale;
  const width = Math.abs(wall.x2 - wall.x1) * scale;
  const height = Math.abs(wall.y2 - wall.y1) * scale;

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.wallDragHandle,
        horizontal
          ? {
              left,
              top: top - 22,
              width: Math.max(48, width),
              height: 44,
            }
          : {
              left: left - 22,
              top,
              width: 44,
              height: Math.max(48, height),
            },
      ]}
    />
  );
}

function UtilityMarker({ utility, scale, selected }) {
  const map = {
    electric: { label: "EL", color: "#F3A712" },
    water: { label: "V", color: "#2F80ED" },
    drain: { label: "A", color: "#00A6A6" },
    vent: { label: "AIR", color: "#8E63CE" },
    gas: { label: "G", color: "#E45756" },
  };

  const info = map[utility.type] || {
    label: "•",
    color: "#64748B",
  };

  return (
    <>
      <Circle
        cx={utility.x * scale}
        cy={utility.y * scale}
        r={selected ? 11 : 9}
        fill={info.color}
        stroke={selected ? "#0B1728" : "#FFFFFF"}
        strokeWidth={selected ? 2 : 1.5}
      />
      <SvgText
        x={utility.x * scale}
        y={utility.y * scale + 3}
        textAnchor="middle"
        fontSize={utility.type === "vent" ? 6 : 7}
        fontWeight="700"
        fill="#FFFFFF"
      >
        {info.label}
      </SvgText>
    </>
  );
}

function renderOpening(opening, wall, scale, selected) {
  const endpoints = openingEndpoints(opening, wall);
  if (!endpoints) return null;

  const a = {
    x: endpoints.a.x * scale,
    y: endpoints.a.y * scale,
  };
  const b = {
    x: endpoints.b.x * scale,
    y: endpoints.b.y * scale,
  };
  const center = {
    x: endpoints.center.x * scale,
    y: endpoints.center.y * scale,
  };

  const stroke = selected
    ? SELECTED
    : opening.type === "window"
      ? "#3BA7D8"
      : "#6E7D8C";

  const wallStroke = Math.max(4, wall.thickness * scale);
  const horizontal =
    Math.abs(wall.x2 - wall.x1) >=
    Math.abs(wall.y2 - wall.y1);

  if (opening.type === "window") {
    const offset = 3;
    return (
      <>
        <Line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={BG}
          strokeWidth={wallStroke + 3}
        />
        {horizontal ? (
          <>
            <Line
              x1={a.x}
              y1={a.y - offset}
              x2={b.x}
              y2={b.y - offset}
              stroke={stroke}
              strokeWidth={2}
            />
            <Line
              x1={a.x}
              y1={a.y + offset}
              x2={b.x}
              y2={b.y + offset}
              stroke={stroke}
              strokeWidth={2}
            />
          </>
        ) : (
          <>
            <Line
              x1={a.x - offset}
              y1={a.y}
              x2={b.x - offset}
              y2={b.y}
              stroke={stroke}
              strokeWidth={2}
            />
            <Line
              x1={a.x + offset}
              y1={a.y}
              x2={b.x + offset}
              y2={b.y}
              stroke={stroke}
              strokeWidth={2}
            />
          </>
        )}
      </>
    );
  }

  const radius = Math.max(18, opening.width * scale);
  let leafEnd;

  if (horizontal) {
    leafEnd = {
      x: a.x,
      y:
        a.y -
        radius * 0.85 * (opening.flip ? -1 : 1),
    };
  } else {
    leafEnd = {
      x:
        a.x +
        radius * 0.85 * (opening.flip ? -1 : 1),
      y: a.y,
    };
  }

  const arcPath = horizontal
    ? "M " +
      b.x +
      " " +
      b.y +
      " Q " +
      center.x +
      " " +
      (center.y -
        radius * 0.65 * (opening.flip ? -1 : 1)) +
      " " +
      leafEnd.x +
      " " +
      leafEnd.y
    : "M " +
      b.x +
      " " +
      b.y +
      " Q " +
      (center.x +
        radius * 0.65 * (opening.flip ? -1 : 1)) +
      " " +
      center.y +
      " " +
      leafEnd.x +
      " " +
      leafEnd.y;

  return (
    <>
      <Line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={BG}
        strokeWidth={wallStroke + 4}
      />
      <Line
        x1={a.x}
        y1={a.y}
        x2={leafEnd.x}
        y2={leafEnd.y}
        stroke={stroke}
        strokeWidth={2.2}
      />
      <Path
        d={arcPath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />
    </>
  );
}

function nearestMeasureAnchor(point, editor) {
  let best = {
    point,
    distance: Infinity,
  };

  const nearestWall = findNearestWall(
    point,
    editor.walls,
    320
  );

  if (
    nearestWall &&
    nearestWall.distance < best.distance
  ) {
    best = {
      point: nearestWall.point,
      distance: nearestWall.distance,
    };
  }

  for (const item of editor.equipment) {
    const size = rotatedSize(item);
    const left = item.x;
    const right = item.x + size.w;
    const top = item.y;
    const bottom = item.y + size.d;

    const candidates = [
      {
        x: clamp(point.x, left, right),
        y: top,
      },
      {
        x: clamp(point.x, left, right),
        y: bottom,
      },
      {
        x: left,
        y: clamp(point.y, top, bottom),
      },
      {
        x: right,
        y: clamp(point.y, top, bottom),
      },
    ];

    for (const candidate of candidates) {
      const d = distance(point, candidate);
      if (d < best.distance && d <= 320) {
        best = {
          point: candidate,
          distance: d,
        };
      }
    }
  }

  return {
    x: snap(best.point.x, 50),
    y: snap(best.point.y, 50),
  };
}

function renderDimension(dimension, scale, selected) {
  const p1 = {
    x: dimension.p1.x * scale,
    y: dimension.p1.y * scale,
  };
  const p2 = {
    x: dimension.p2.x * scale,
    y: dimension.p2.y * scale,
  };

  const horizontal =
    Math.abs(dimension.p2.x - dimension.p1.x) >=
    Math.abs(dimension.p2.y - dimension.p1.y);

  const length = horizontal
    ? Math.abs(dimension.p2.x - dimension.p1.x)
    : Math.abs(dimension.p2.y - dimension.p1.y);

  const mid = {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };

  const baseColor = dimension.auto
    ? dimension.kind === "clearance"
      ? "#5E7893"
      : dimension.kind === "equipment"
        ? "#7F91A4"
        : "#93A2B2"
    : "#66788A";
  const color = selected ? SELECTED : baseColor;
  const labelWidth = 58;
  const labelHeight = 18;

  return (
    <>
      <Line
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        stroke={color}
        strokeWidth={1.4}
      />

      {horizontal ? (
        <>
          <Line
            x1={p1.x}
            y1={p1.y - 6}
            x2={p1.x}
            y2={p1.y + 6}
            stroke={color}
            strokeWidth={1.4}
          />
          <Line
            x1={p2.x}
            y1={p2.y - 6}
            x2={p2.x}
            y2={p2.y + 6}
            stroke={color}
            strokeWidth={1.4}
          />
        </>
      ) : (
        <>
          <Line
            x1={p1.x - 6}
            y1={p1.y}
            x2={p1.x + 6}
            y2={p1.y}
            stroke={color}
            strokeWidth={1.4}
          />
          <Line
            x1={p2.x - 6}
            y1={p2.y}
            x2={p2.x + 6}
            y2={p2.y}
            stroke={color}
            strokeWidth={1.4}
          />
        </>
      )}

      <Rect
        x={mid.x - labelWidth / 2}
        y={mid.y - labelHeight / 2}
        width={labelWidth}
        height={labelHeight}
        rx={5}
        fill="#FFFFFF"
        stroke={selected ? SELECTED : dimension.auto ? "#DDE4EA" : "#D5DDE5"}
        strokeWidth={1}
      />
      <SvgText
        x={mid.x}
        y={mid.y + 3.5}
        textAnchor="middle"
        fontSize={8}
        fontWeight="800"
        fill={selected ? SELECTED : dimension.auto ? "#52677C" : "#405267"}
      >
        {Math.round(length)} mm
      </SvgText>
    </>
  );
}

export default function Planner2D({
  roomW,
  roomD,
  editor,
  tool,
  selected,
  setSelected,
  wallDraft,
  setWallDraft,
  commit,
  autoDimensions = [],
}) {
  const window = useWindowDimensions();
  const outerWidth = Math.max(280, window.width - 32);
  const scale = Math.min(
    (outerWidth - 12) / roomW,
    470 / roomD
  );
  const canvasW = roomW * scale;
  const canvasH = roomD * scale;

  const [measureDraft, setMeasureDraft] = useState(null);
  const [wallDragPreview, setWallDragPreview] =
    useState(null);
  const [endpointPreview, setEndpointPreview] =
    useState(null);

  useEffect(() => {
    if (tool !== "measure") {
      setMeasureDraft(null);
    }
  }, [tool]);

  const selectedWall = useMemo(
    () =>
      selected?.kind === "wall"
        ? editor.walls.find(
            (wall) => wall.id === selected.id
          )
        : null,
    [selected, editor.walls]
  );

  function pointFromPress(event) {
    return {
      x: clamp(
        snap(
          event.nativeEvent.locationX / scale,
          50
        ),
        0,
        roomW
      ),
      y: clamp(
        snap(
          event.nativeEvent.locationY / scale,
          50
        ),
        0,
        roomD
      ),
    };
  }

  function wallForRender(wall) {
    let next = { ...wall };

    if (
      wallDragPreview &&
      wall.id === wallDragPreview.wallId
    ) {
      next = {
        ...next,
        x1: next.x1 + wallDragPreview.dx,
        y1: next.y1 + wallDragPreview.dy,
        x2: next.x2 + wallDragPreview.dx,
        y2: next.y2 + wallDragPreview.dy,
      };
    }

    if (
      endpointPreview &&
      wall.id === endpointPreview.wallId
    ) {
      if (endpointPreview.endpoint === "start") {
        next.x1 = endpointPreview.point.x;
        next.y1 = endpointPreview.point.y;
      } else {
        next.x2 = endpointPreview.point.x;
        next.y2 = endpointPreview.point.y;
      }
    }

    return next;
  }

  function findDimension(point) {
    const dimensions = editor.dimensions || [];
    let best = null;

    for (const dimension of dimensions) {
      const d = distanceToSegment(
        point,
        dimension.p1,
        dimension.p2
      );
      if (!best || d < best.distance) {
        best = {
          id: dimension.id,
          distance: d,
        };
      }
    }

    return best && best.distance <= 180
      ? best
      : null;
  }

  function onCanvasPress(event) {
    const point = pointFromPress(event);

    if (tool === "wall") {
      if (!wallDraft) {
        setWallDraft(point);
        setSelected(null);
        return;
      }

      const end = snapOrthogonal(
        wallDraft,
        point,
        roomW,
        roomD
      );

      const wall = {
        id: "wall-" + Date.now(),
        x1: wallDraft.x,
        y1: wallDraft.y,
        x2: end.x,
        y2: end.y,
        thickness: 150,
      };

      setWallDraft(null);

      if (wallLength(wall) < 300) return;

      commit((state) => ({
        ...state,
        walls: [...state.walls, wall],
      }));

      setSelected({
        kind: "wall",
        id: wall.id,
      });
      return;
    }

    if (tool === "measure") {
      const anchor = nearestMeasureAnchor(
        point,
        editor
      );

      if (!measureDraft) {
        setMeasureDraft(anchor);
        setSelected(null);
        return;
      }

      const dx = anchor.x - measureDraft.x;
      const dy = anchor.y - measureDraft.y;

      const end =
        Math.abs(dx) >= Math.abs(dy)
          ? {
              x: anchor.x,
              y: measureDraft.y,
            }
          : {
              x: measureDraft.x,
              y: anchor.y,
            };

      const length =
        Math.abs(dx) >= Math.abs(dy)
          ? Math.abs(end.x - measureDraft.x)
          : Math.abs(end.y - measureDraft.y);

      if (length < 50) {
        setMeasureDraft(null);
        return;
      }

      const dimension = {
        id: "dim-" + Date.now(),
        p1: measureDraft,
        p2: end,
      };

      commit((state) => ({
        ...state,
        dimensions: [
          ...(state.dimensions || []),
          dimension,
        ],
      }));

      setMeasureDraft(null);
      setSelected({
        kind: "dimension",
        id: dimension.id,
      });
      return;
    }

    if (
      tool === "door" ||
      tool === "window"
    ) {
      const nearest = findNearestWall(
        point,
        editor.walls,
        350
      );

      if (!nearest) return;

      const width =
        tool === "door" ? 900 : 1200;
      const length = wallLength(nearest.wall);
      const edge = Math.min(
        0.45,
        width / 2 / Math.max(length, 1)
      );
      const t = clamp(
        nearest.t,
        edge,
        1 - edge
      );

      const opening = {
        id: tool + "-" + Date.now(),
        type: tool,
        wallId: nearest.wall.id,
        width,
        t,
        flip: false,
      };

      commit((state) => ({
        ...state,
        openings: [
          ...state.openings,
          opening,
        ],
      }));

      setSelected({
        kind: "opening",
        id: opening.id,
      });
      return;
    }

    if (
      [
        "electric",
        "water",
        "drain",
        "vent",
        "gas",
      ].includes(tool)
    ) {
      const utility = {
        id: tool + "-" + Date.now(),
        type: tool,
        x: point.x,
        y: point.y,
      };

      commit((state) => ({
        ...state,
        utilities: [
          ...state.utilities,
          utility,
        ],
      }));

      setSelected({
        kind: "utility",
        id: utility.id,
      });
      return;
    }

    if (tool === "select") {
      const dimension = findDimension(point);
      if (dimension) {
        setSelected({
          kind: "dimension",
          id: dimension.id,
        });
        return;
      }

      const entity = entityAtPoint(
        point,
        editor,
        240
      );

      setSelected(entity || null);
    }
  }

  function updateWallEndpoint(
    wallId,
    endpoint,
    point
  ) {
    commit((state) => {
      const target = state.walls.find(
        (wall) => wall.id === wallId
      );

      if (!target) return state;

      const oldPoint =
        endpoint === "start"
          ? { x: target.x1, y: target.y1 }
          : { x: target.x2, y: target.y2 };

      const other =
        endpoint === "start"
          ? { x: target.x2, y: target.y2 }
          : { x: target.x1, y: target.y1 };

      const snapped =
        Math.abs(point.x - other.x) >=
        Math.abs(point.y - other.y)
          ? {
              x: point.x,
              y: other.y,
            }
          : {
              x: other.x,
              y: point.y,
            };

      return {
        ...state,
        walls: state.walls.map((wall) => {
          if (wall.id === wallId) {
            if (endpoint === "start") {
              return {
                ...wall,
                x1: snapped.x,
                y1: snapped.y,
              };
            }

            return {
              ...wall,
              x2: snapped.x,
              y2: snapped.y,
            };
          }

          let next = { ...wall };

          if (
            pointsEqual(
              { x: wall.x1, y: wall.y1 },
              oldPoint
            )
          ) {
            next.x1 = snapped.x;
            next.y1 = snapped.y;
          }

          if (
            pointsEqual(
              { x: wall.x2, y: wall.y2 },
              oldPoint
            )
          ) {
            next.x2 = snapped.x;
            next.y2 = snapped.y;
          }

          return next;
        }),
      };
    });
  }

  function moveWholeWall(wallId, delta) {
    if (!delta || (!delta.dx && !delta.dy)) {
      return;
    }

    commit((state) => {
      const target = state.walls.find(
        (wall) => wall.id === wallId
      );

      if (!target) return state;

      const oldStart = {
        x: target.x1,
        y: target.y1,
      };
      const oldEnd = {
        x: target.x2,
        y: target.y2,
      };
      const newStart = {
        x: target.x1 + delta.dx,
        y: target.y1 + delta.dy,
      };
      const newEnd = {
        x: target.x2 + delta.dx,
        y: target.y2 + delta.dy,
      };

      return {
        ...state,
        walls: state.walls.map((wall) => {
          if (wall.id === wallId) {
            return {
              ...wall,
              x1: newStart.x,
              y1: newStart.y,
              x2: newEnd.x,
              y2: newEnd.y,
            };
          }

          let next = { ...wall };

          if (
            pointsEqual(
              { x: wall.x1, y: wall.y1 },
              oldStart
            )
          ) {
            next.x1 = newStart.x;
            next.y1 = newStart.y;
          } else if (
            pointsEqual(
              { x: wall.x1, y: wall.y1 },
              oldEnd
            )
          ) {
            next.x1 = newEnd.x;
            next.y1 = newEnd.y;
          }

          if (
            pointsEqual(
              { x: wall.x2, y: wall.y2 },
              oldStart
            )
          ) {
            next.x2 = newStart.x;
            next.y2 = newStart.y;
          } else if (
            pointsEqual(
              { x: wall.x2, y: wall.y2 },
              oldEnd
            )
          ) {
            next.x2 = newEnd.x;
            next.y2 = newEnd.y;
          }

          return next;
        }),
      };
    });
  }

  function commitEquipmentMove(candidate) {
    commit((state) => ({
      ...state,
      equipment: state.equipment.map(
        (item) =>
          item.instanceId ===
          candidate.instanceId
            ? candidate
            : item
      ),
    }));
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.measureRow}>
        <Text style={styles.measure}>
          {Math.round(roomW)} mm
        </Text>
        <Text style={styles.measureMuted}>
          50 mm snap • 500 mm rutnät
        </Text>
      </View>

      <Pressable
        onPress={onCanvasPress}
        style={[
          styles.canvas,
          {
            width: canvasW,
            height: canvasH,
          },
        ]}
      >
        <Svg
          width={canvasW}
          height={canvasH}
          viewBox={
            "0 0 " +
            canvasW +
            " " +
            canvasH
          }
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          <Rect
            x="0"
            y="0"
            width={canvasW}
            height={canvasH}
            fill={BG}
          />

          {gridLines(
            roomW,
            roomD,
            scale
          )}

          {editor.walls.map((wall) => {
            const displayWall =
              wallForRender(wall);
            const isSelected =
              selected?.kind === "wall" &&
              selected.id === wall.id;

            return (
              <Line
                key={wall.id}
                x1={displayWall.x1 * scale}
                y1={displayWall.y1 * scale}
                x2={displayWall.x2 * scale}
                y2={displayWall.y2 * scale}
                stroke={
                  isSelected
                    ? SELECTED
                    : WALL_COLOR
                }
                strokeWidth={Math.max(
                  4,
                  wall.thickness * scale
                )}
                strokeLinecap="square"
              />
            );
          })}

          {editor.openings.map(
            (opening) => {
              const wall =
                editor.walls.find(
                  (item) =>
                    item.id ===
                    opening.wallId
                );

              if (!wall) return null;

              const isSelected =
                selected?.kind ===
                  "opening" &&
                selected.id ===
                  opening.id;

              return (
                <React.Fragment
                  key={opening.id}
                >
                  {renderOpening(
                    opening,
                    wallForRender(wall),
                    scale,
                    isSelected
                  )}
                </React.Fragment>
              );
            }
          )}

          {(editor.dimensions || []).map(
            (dimension) => (
              <React.Fragment
                key={dimension.id}
              >
                {renderDimension(
                  dimension,
                  scale,
                  selected?.kind ===
                    "dimension" &&
                    selected.id ===
                      dimension.id
                )}
              </React.Fragment>
            )
          )}

          {autoDimensions.map((dimension) => (
            <React.Fragment key={dimension.id}>
              {renderDimension(dimension, scale, false)}
            </React.Fragment>
          ))}

          {editor.utilities.map(
            (utility) => (
              <UtilityMarker
                key={utility.id}
                utility={utility}
                scale={scale}
                selected={
                  selected?.kind ===
                    "utility" &&
                  selected.id ===
                    utility.id
                }
              />
            )
          )}

          {wallDraft && (
            <>
              <Circle
                cx={wallDraft.x * scale}
                cy={wallDraft.y * scale}
                r={7}
                fill={SELECTED}
              />
              <Circle
                cx={wallDraft.x * scale}
                cy={wallDraft.y * scale}
                r={13}
                fill="none"
                stroke={SELECTED}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            </>
          )}

          {measureDraft && (
            <>
              <Circle
                cx={measureDraft.x * scale}
                cy={measureDraft.y * scale}
                r={6}
                fill="#FFFFFF"
                stroke={SELECTED}
                strokeWidth={2}
              />
              <Circle
                cx={measureDraft.x * scale}
                cy={measureDraft.y * scale}
                r={12}
                fill="none"
                stroke={SELECTED}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            </>
          )}
        </Svg>

        {editor.equipment.map((item) => (
          <DraggableEquipment
            key={item.instanceId}
            item={item}
            scale={scale}
            selected={
              selected?.kind ===
                "equipment" &&
              selected.id ===
                item.instanceId
            }
            roomW={roomW}
            roomD={roomD}
            walls={editor.walls}
            equipment={editor.equipment}
            interactive={
              tool === "select"
            }
            onSelect={setSelected}
            onCommitMove={
              commitEquipmentMove
            }
          />
        ))}

        {tool === "select" &&
          editor.walls.map((wall) => (
            <WallDragHandle
              key={"drag-" + wall.id}
              wall={wall}
              scale={scale}
              roomW={roomW}
              roomD={roomD}
              onSelect={setSelected}
              onPreview={(delta) =>
                setWallDragPreview(
                  delta
                    ? {
                        wallId: wall.id,
                        ...delta,
                      }
                    : null
                )
              }
              onMoveEnd={(delta) =>
                moveWholeWall(wall.id, delta)
              }
            />
          ))}

        {selectedWall &&
          tool === "select" && (
            <>
              <EndpointHandle
                point={{
                  x: selectedWall.x1,
                  y: selectedWall.y1,
                }}
                scale={scale}
                roomW={roomW}
                roomD={roomD}
                onPreview={(point) =>
                  setEndpointPreview(
                    point
                      ? {
                          wallId:
                            selectedWall.id,
                          endpoint:
                            "start",
                          point,
                        }
                      : null
                  )
                }
                onMoveEnd={(point) =>
                  updateWallEndpoint(
                    selectedWall.id,
                    "start",
                    point
                  )
                }
              />

              <EndpointHandle
                point={{
                  x: selectedWall.x2,
                  y: selectedWall.y2,
                }}
                scale={scale}
                roomW={roomW}
                roomD={roomD}
                onPreview={(point) =>
                  setEndpointPreview(
                    point
                      ? {
                          wallId:
                            selectedWall.id,
                          endpoint:
                            "end",
                          point,
                        }
                      : null
                  )
                }
                onMoveEnd={(point) =>
                  updateWallEndpoint(
                    selectedWall.id,
                    "end",
                    point
                  )
                }
              />

            </>
          )}
      </Pressable>

      <Text style={styles.depth}>
        {Math.round(roomD)} mm djup
      </Text>

      {tool === "wall" && (
        <Text style={styles.hint}>
          {wallDraft
            ? "Tryck på slutpunkten. Väggen låses till 90°."
            : "Tryck där väggen ska börja."}
        </Text>
      )}

      {tool === "measure" && (
        <Text style={styles.hint}>
          {measureDraft
            ? "Tryck på den andra kanten. Måttet låses horisontellt eller vertikalt."
            : "Tryck på första kanten. Mått snappar mot väggar och produkter."}
        </Text>
      )}

      {(tool === "door" ||
        tool === "window") && (
        <Text style={styles.hint}>
          Tryck nära en vägg för att
          placera{" "}
          {tool === "door"
            ? "dörren"
            : "fönstret"}
          .
        </Text>
      )}

      {[
        "electric",
        "water",
        "drain",
        "vent",
        "gas",
      ].includes(tool) && (
        <Text style={styles.hint}>
          Tryck i ritningen för att
          placera anslutningspunkten.
        </Text>
      )}

      {tool === "select" &&
        selectedWall && (
          <Text style={styles.hintMuted}>
            Tryck och dra direkt på en vägg för att flytta den.
            Blå hörn ändrar längden och anslutna hörn följer med.
          </Text>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE4EC",
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
    overflow: "hidden",
  },
  measureRow: {
    width: "100%",
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  measure: {
    color: "#46566B",
    fontSize: 12,
    fontWeight: "800",
  },
  measureMuted: {
    color: "#98A3AF",
    fontSize: 10,
  },
  canvas: {
    position: "relative",
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: "#CBD4DE",
    overflow: "hidden",
  },
  depth: {
    color: "#697789",
    fontSize: 11,
    marginTop: 8,
  },
  hint: {
    marginTop: 8,
    paddingHorizontal: 14,
    textAlign: "center",
    color: "#1677D2",
    fontSize: 11,
    fontWeight: "700",
  },
  hintMuted: {
    marginTop: 6,
    paddingHorizontal: 18,
    textAlign: "center",
    color: "#748397",
    fontSize: 10,
    lineHeight: 14,
  },
  equipment: {
    position: "absolute",
    backgroundColor: "#E7ECF1",
    borderColor: "#98A7B7",
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
    zIndex: 8,
  },
  equipmentEstimated: {
    borderStyle: "dashed",
    borderColor: "#C58A22",
  },
  equipmentLocked: {
    opacity: 0.82,
    borderStyle: "dashed",
  },
  equipmentSelected: {
    borderWidth: 2,
    borderColor: SELECTED,
    backgroundColor: "#EEF7FF",
  },
  equipmentImage: {
    width: "62%",
    height: "48%",
  },
  frontIndicator: {
    position: "absolute",
    left: "20%",
    right: "20%",
    bottom: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#1677D2",
  },
  equipmentFallback: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0B1728",
  },
  equipmentLabel: {
    width: "94%",
    fontSize: 6.5,
    color: "#263548",
    fontWeight: "700",
    textAlign: "center",
  },
  equipmentSize: {
    width: "96%",
    fontSize: 6,
    color: "#657589",
    fontWeight: "800",
    textAlign: "center",
  },
  wallDragHandle: {
    position: "absolute",
    backgroundColor: "transparent",
    zIndex: 14,
  },
  endpoint: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "#B9D9F7",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  endpointInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: SELECTED,
  },
});
