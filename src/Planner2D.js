import React, { useEffect, useMemo, useRef } from "react";
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
  const startX = item.x * scale;
  const startY = item.y * scale;
  const pan = useRef(new Animated.ValueXY({ x: startX, y: startY })).current;
  const itemRef = useRef(item);
  const dataRef = useRef({ scale, roomW, roomD, walls, equipment, interactive, onSelect, onCommitMove });

  useEffect(() => {
    itemRef.current = item;
    dataRef.current = { scale, roomW, roomD, walls, equipment, interactive, onSelect, onCommitMove };
    pan.setValue({ x: item.x * scale, y: item.y * scale });
  }, [item, scale, roomW, roomD, walls, equipment, interactive, onSelect, onCommitMove, pan]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        dataRef.current.interactive && !itemRef.current.locked,
      onMoveShouldSetPanResponder: () =>
        dataRef.current.interactive && !itemRef.current.locked,
      onPanResponderGrant: () => {
        const current = itemRef.current;
        dataRef.current.onSelect({ kind: "equipment", id: current.instanceId });
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

        candidate = snapEquipmentToBoundary(candidate, data.roomW, data.roomD, 130);
        candidate = snapEquipmentToWalls(candidate, data.walls, data.roomW, data.roomD, 160);

        const collision = data.equipment.some(
          (other) =>
            other.instanceId !== current.instanceId &&
            rectanglesOverlap(candidate, other)
        );

        if (collision) {
          pan.setValue({ x: current.x * data.scale, y: current.y * data.scale });
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
        item.locked && styles.equipmentLocked,
        selected && styles.equipmentSelected,
        {
          width: Math.max(36, size.w * scale),
          height: Math.max(30, size.d * scale),
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
      <Text numberOfLines={1} style={styles.equipmentLabel}>
        {item.title}
      </Text>
    </Animated.View>
  );
}

function EndpointHandle({
  point,
  scale,
  roomW,
  roomD,
  onMoveEnd,
}) {
  const dataRef = useRef({ point, scale, roomW, roomD, onMoveEnd });
  useEffect(() => {
    dataRef.current = { point, scale, roomW, roomD, onMoveEnd };
  }, [point, scale, roomW, roomD, onMoveEnd]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gesture) => {
        const data = dataRef.current;
        const next = {
          x: clamp(snap(data.point.x + gesture.dx / data.scale), 0, data.roomW),
          y: clamp(snap(data.point.y + gesture.dy / data.scale), 0, data.roomD),
        };
        data.onMoveEnd(next);
      },
    })
  ).current;

  return (
    <View
      {...responder.panHandlers}
      style={[
        styles.endpoint,
        {
          left: point.x * scale - 9,
          top: point.y * scale - 9,
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
  const info = map[utility.type] || { label: "•", color: "#64748B" };

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

  const a = { x: endpoints.a.x * scale, y: endpoints.a.y * scale };
  const b = { x: endpoints.b.x * scale, y: endpoints.b.y * scale };
  const center = { x: endpoints.center.x * scale, y: endpoints.center.y * scale };
  const stroke = selected ? SELECTED : opening.type === "window" ? "#3BA7D8" : "#6E7D8C";
  const wallStroke = Math.max(4, wall.thickness * scale);

  const angleHorizontal = Math.abs(wall.x2 - wall.x1) >= Math.abs(wall.y2 - wall.y1);

  if (opening.type === "window") {
    const offset = 3;
    return (
      <>
        <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={BG} strokeWidth={wallStroke + 3} />
        {angleHorizontal ? (
          <>
            <Line x1={a.x} y1={a.y - offset} x2={b.x} y2={b.y - offset} stroke={stroke} strokeWidth={2} />
            <Line x1={a.x} y1={a.y + offset} x2={b.x} y2={b.y + offset} stroke={stroke} strokeWidth={2} />
          </>
        ) : (
          <>
            <Line x1={a.x - offset} y1={a.y} x2={b.x - offset} y2={b.y} stroke={stroke} strokeWidth={2} />
            <Line x1={a.x + offset} y1={a.y} x2={b.x + offset} y2={b.y} stroke={stroke} strokeWidth={2} />
          </>
        )}
      </>
    );
  }

  const radius = Math.max(18, opening.width * scale);
  let leafEnd;
  if (angleHorizontal) {
    leafEnd = { x: a.x, y: a.y - radius * 0.85 * (opening.flip ? -1 : 1) };
  } else {
    leafEnd = { x: a.x + radius * 0.85 * (opening.flip ? -1 : 1), y: a.y };
  }

  const arcPath = angleHorizontal
    ? "M " + b.x + " " + b.y + " Q " + center.x + " " + (center.y - radius * 0.65 * (opening.flip ? -1 : 1)) + " " + leafEnd.x + " " + leafEnd.y
    : "M " + b.x + " " + b.y + " Q " + (center.x + radius * 0.65 * (opening.flip ? -1 : 1)) + " " + center.y + " " + leafEnd.x + " " + leafEnd.y;

  return (
    <>
      <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={BG} strokeWidth={wallStroke + 4} />
      <Line x1={a.x} y1={a.y} x2={leafEnd.x} y2={leafEnd.y} stroke={stroke} strokeWidth={2.2} />
      <Path d={arcPath} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray="3 3" />
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
}) {
  const window = useWindowDimensions();
  const outerWidth = Math.max(280, window.width - 32);
  const scale = Math.min((outerWidth - 12) / roomW, 470 / roomD);
  const canvasW = roomW * scale;
  const canvasH = roomD * scale;

  const selectedWall = useMemo(
    () =>
      selected?.kind === "wall"
        ? editor.walls.find((wall) => wall.id === selected.id)
        : null,
    [selected, editor.walls]
  );

  function pointFromPress(event) {
    return {
      x: clamp(snap(event.nativeEvent.locationX / scale), 0, roomW),
      y: clamp(snap(event.nativeEvent.locationY / scale), 0, roomD),
    };
  }

  function onCanvasPress(event) {
    const point = pointFromPress(event);

    if (tool === "wall") {
      if (!wallDraft) {
        setWallDraft(point);
        setSelected(null);
        return;
      }

      const end = snapOrthogonal(wallDraft, point, roomW, roomD);
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
      setSelected({ kind: "wall", id: wall.id });
      return;
    }

    if (tool === "door" || tool === "window") {
      const nearest = findNearestWall(point, editor.walls, 350);
      if (!nearest) return;

      const width = tool === "door" ? 900 : 1200;
      const length = wallLength(nearest.wall);
      const edge = Math.min(0.45, width / 2 / Math.max(length, 1));
      const t = clamp(nearest.t, edge, 1 - edge);
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
        openings: [...state.openings, opening],
      }));
      setSelected({ kind: "opening", id: opening.id });
      return;
    }

    if (["electric", "water", "drain", "vent", "gas"].includes(tool)) {
      const utility = {
        id: tool + "-" + Date.now(),
        type: tool,
        x: point.x,
        y: point.y,
      };
      commit((state) => ({
        ...state,
        utilities: [...state.utilities, utility],
      }));
      setSelected({ kind: "utility", id: utility.id });
      return;
    }

    if (tool === "select") {
      setSelected(entityAtPoint(point, editor, 240));
    }
  }

  function updateWallEndpoint(wallId, endpoint, point) {
    commit((state) => ({
      ...state,
      walls: state.walls.map((wall) => {
        if (wall.id !== wallId) return wall;

        const other =
          endpoint === "start"
            ? { x: wall.x2, y: wall.y2 }
            : { x: wall.x1, y: wall.y1 };

        const snapped =
          Math.abs(point.x - other.x) >= Math.abs(point.y - other.y)
            ? { x: point.x, y: other.y }
            : { x: other.x, y: point.y };

        if (endpoint === "start") {
          return { ...wall, x1: snapped.x, y1: snapped.y };
        }

        return { ...wall, x2: snapped.x, y2: snapped.y };
      }),
    }));
  }

  function commitEquipmentMove(candidate) {
    commit((state) => ({
      ...state,
      equipment: state.equipment.map((item) =>
        item.instanceId === candidate.instanceId ? candidate : item
      ),
    }));
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.measureRow}>
        <Text style={styles.measure}>{Math.round(roomW)} mm</Text>
        <Text style={styles.measureMuted}>100 mm rutnät</Text>
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
          viewBox={"0 0 " + canvasW + " " + canvasH}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
        >
          <Rect x="0" y="0" width={canvasW} height={canvasH} fill={BG} />
          {gridLines(roomW, roomD, scale)}

          {editor.walls.map((wall) => {
            const isSelected = selected?.kind === "wall" && selected.id === wall.id;
            return (
              <Line
                key={wall.id}
                x1={wall.x1 * scale}
                y1={wall.y1 * scale}
                x2={wall.x2 * scale}
                y2={wall.y2 * scale}
                stroke={isSelected ? SELECTED : WALL_COLOR}
                strokeWidth={Math.max(4, wall.thickness * scale)}
                strokeLinecap="square"
              />
            );
          })}

          {editor.openings.map((opening) => {
            const wall = editor.walls.find((item) => item.id === opening.wallId);
            if (!wall) return null;
            const isSelected = selected?.kind === "opening" && selected.id === opening.id;
            return (
              <React.Fragment key={opening.id}>
                {renderOpening(opening, wall, scale, isSelected)}
              </React.Fragment>
            );
          })}

          {editor.utilities.map((utility) => (
            <UtilityMarker
              key={utility.id}
              utility={utility}
              scale={scale}
              selected={selected?.kind === "utility" && selected.id === utility.id}
            />
          ))}

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
        </Svg>

        {editor.equipment.map((item) => (
          <DraggableEquipment
            key={item.instanceId}
            item={item}
            scale={scale}
            selected={selected?.kind === "equipment" && selected.id === item.instanceId}
            roomW={roomW}
            roomD={roomD}
            walls={editor.walls}
            equipment={editor.equipment}
            interactive={tool === "select"}
            onSelect={setSelected}
            onCommitMove={commitEquipmentMove}
          />
        ))}

        {selectedWall && tool === "select" && (
          <>
            <EndpointHandle
              point={{ x: selectedWall.x1, y: selectedWall.y1 }}
              scale={scale}
              roomW={roomW}
              roomD={roomD}
              onMoveEnd={(point) =>
                updateWallEndpoint(selectedWall.id, "start", point)
              }
            />
            <EndpointHandle
              point={{ x: selectedWall.x2, y: selectedWall.y2 }}
              scale={scale}
              roomW={roomW}
              roomD={roomD}
              onMoveEnd={(point) =>
                updateWallEndpoint(selectedWall.id, "end", point)
              }
            />
          </>
        )}
      </Pressable>

      <Text style={styles.depth}>{Math.round(roomD)} mm djup</Text>

      {tool === "wall" && (
        <Text style={styles.hint}>
          {wallDraft
            ? "Tryck på slutpunkten. Linjen låses till 90°."
            : "Tryck där väggen ska börja."}
        </Text>
      )}

      {(tool === "door" || tool === "window") && (
        <Text style={styles.hint}>
          Tryck nära en vägg för att placera {tool === "door" ? "dörren" : "fönstret"}.
        </Text>
      )}

      {["electric", "water", "drain", "vent", "gas"].includes(tool) && (
        <Text style={styles.hint}>Tryck i ritningen för att placera anslutningspunkten.</Text>
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
    width: "74%",
    height: "60%",
  },
  equipmentFallback: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0B1728",
  },
  equipmentLabel: {
    width: "94%",
    fontSize: 7,
    color: "#263548",
    fontWeight: "700",
    textAlign: "center",
  },
  endpoint: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: SELECTED,
    zIndex: 20,
  },
});
