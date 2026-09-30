import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, {
  Circle,
  Line,
  Polygon,
  Text as SvgText,
} from "react-native-svg";
import { openingPoint, rotatedSize } from "./geometry";

const VIEW_W = 360;
const VIEW_H = 440;

function rotatePoint(x, y, cx, cy, angle) {
  const radians = (angle * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;

  return {
    x: cx + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: cy + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

function createProjector(roomW, roomD, roomH, angle) {
  const cx = roomW / 2;
  const cy = roomD / 2;
  const extent = Math.max(roomW + roomD, 1);
  const scale = Math.min(0.052, 285 / extent, 250 / Math.max(roomH, 1));
  const originX = VIEW_W / 2;
  const originY = 155;

  return (x, y, z = 0) => {
    const rotated = rotatePoint(x, y, cx, cy, angle);
    const rx = rotated.x - cx;
    const ry = rotated.y - cy;

    return {
      x: originX + (rx - ry) * scale * 0.76,
      y: originY + (rx + ry) * scale * 0.38 - z * scale * 0.76,
    };
  };
}

function points(list) {
  return list.map((p) => p.x + "," + p.y).join(" ");
}

function shortTitle(title = "") {
  return title.length > 18 ? title.slice(0, 16) + "…" : title;
}

function EquipmentBox({ item, project }) {
  const size = rotatedSize(item);
  const h = Math.max(300, Math.min(item.h || 900, 2400));

  const p000 = project(item.x, item.y, 0);
  const p100 = project(item.x + size.w, item.y, 0);
  const p110 = project(item.x + size.w, item.y + size.d, 0);
  const p010 = project(item.x, item.y + size.d, 0);

  const p001 = project(item.x, item.y, h);
  const p101 = project(item.x + size.w, item.y, h);
  const p111 = project(item.x + size.w, item.y + size.d, h);
  const p011 = project(item.x, item.y + size.d, h);

  const labelX = (p001.x + p101.x + p111.x + p011.x) / 4;
  const labelY = (p001.y + p101.y + p111.y + p011.y) / 4 + 2;

  return (
    <>
      <Polygon
        points={points([p001, p101, p111, p011])}
        fill="#EFF4F8"
        stroke="#68798B"
        strokeWidth="1"
      />
      <Polygon
        points={points([p101, p100, p110, p111])}
        fill="#B9C6D2"
        stroke="#68798B"
        strokeWidth="1"
      />
      <Polygon
        points={points([p111, p110, p010, p011])}
        fill="#9EAFBF"
        stroke="#68798B"
        strokeWidth="1"
      />
      <Line
        x1={p001.x}
        y1={p001.y}
        x2={p111.x}
        y2={p111.y}
        stroke="#D6E0E8"
        strokeWidth="0.7"
      />
      <SvgText
        x={labelX}
        y={labelY}
        fontSize="7"
        fontWeight="700"
        fill="#18283A"
        textAnchor="middle"
      >
        {shortTitle(item.title)}
      </SvgText>
    </>
  );
}

function WallPlane({ wall, roomH, project }) {
  const p1 = project(wall.x1, wall.y1, 0);
  const p2 = project(wall.x2, wall.y2, 0);
  const t1 = project(wall.x1, wall.y1, roomH);
  const t2 = project(wall.x2, wall.y2, roomH);

  return (
    <>
      <Polygon
        points={points([p1, p2, t2, t1])}
        fill="#F4F6F8"
        stroke="#A7B3BF"
        strokeWidth="1"
        opacity="0.93"
      />
      <Line
        x1={t1.x}
        y1={t1.y}
        x2={t2.x}
        y2={t2.y}
        stroke="#7E8C9A"
        strokeWidth="1.4"
      />
    </>
  );
}

function OpeningMarker({ opening, wall, project }) {
  const center = openingPoint(opening, wall);
  const bottom = project(center.x, center.y, 0);
  const topHeight = opening.type === "door" ? 2050 : 1500;
  const top = project(center.x, center.y, topHeight);
  const color = opening.type === "door" ? "#57718A" : "#3BA7D8";

  return (
    <>
      <Line
        x1={bottom.x}
        y1={bottom.y}
        x2={top.x}
        y2={top.y}
        stroke={color}
        strokeWidth={opening.type === "door" ? 3 : 4}
        opacity="0.9"
      />
      <Circle cx={top.x} cy={top.y} r="3.2" fill={color} />
    </>
  );
}

function Utility3D({ utility, project }) {
  const p = project(utility.x, utility.y, 50);
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
      <Circle cx={p.x} cy={p.y} r="7" fill={info.color} />
      <SvgText
        x={p.x}
        y={p.y + 2.4}
        fontSize={utility.type === "vent" ? "5" : "6"}
        fontWeight="800"
        fill="#FFFFFF"
        textAnchor="middle"
      >
        {info.label}
      </SvgText>
    </>
  );
}

export default function Planner3D({
  roomW,
  roomD,
  roomH,
  editor,
}) {
  const [angle, setAngle] = useState(0);

  const project = useMemo(
    () => createProjector(roomW, roomD, roomH, angle),
    [roomW, roomD, roomH, angle]
  );

  const floor = [
    project(0, 0, 0),
    project(roomW, 0, 0),
    project(roomW, roomD, 0),
    project(0, roomD, 0),
  ];

  const sortedWalls = useMemo(() => {
    const cx = roomW / 2;
    const cy = roomD / 2;

    return [...editor.walls].sort((a, b) => {
      const ma = rotatePoint((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2, cx, cy, angle);
      const mb = rotatePoint((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, cx, cy, angle);
      return ma.x + ma.y - (mb.x + mb.y);
    });
  }, [editor.walls, roomW, roomD, angle]);

  const sortedEquipment = useMemo(() => {
    const cx = roomW / 2;
    const cy = roomD / 2;

    return [...editor.equipment].sort((a, b) => {
      const aa = rotatePoint(a.x + a.w / 2, a.y + a.d / 2, cx, cy, angle);
      const bb = rotatePoint(b.x + b.w / 2, b.y + b.d / 2, cx, cy, angle);
      return aa.x + aa.y - (bb.x + bb.y);
    });
  }, [editor.equipment, roomW, roomD, angle]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>3D-vy</Text>
          <Text style={styles.subtitle}>Väggar, öppningar och utrustning från ritningen</Text>
        </View>
        <View style={styles.angleBadge}>
          <Text style={styles.angleText}>{angle}°</Text>
        </View>
      </View>

      <Svg width="100%" height={VIEW_H} viewBox={"0 0 " + VIEW_W + " " + VIEW_H}>
        <Polygon
          points={points(floor)}
          fill="#E8EDF2"
          stroke="#7D8A98"
          strokeWidth="1.2"
        />

        {sortedWalls.map((wall) => (
          <WallPlane
            key={wall.id}
            wall={wall}
            roomH={roomH}
            project={project}
          />
        ))}

        {editor.openings.map((opening) => {
          const wall = editor.walls.find((item) => item.id === opening.wallId);
          if (!wall) return null;
          return (
            <OpeningMarker
              key={opening.id}
              opening={opening}
              wall={wall}
              project={project}
            />
          );
        })}

        {sortedEquipment.map((item) => (
          <EquipmentBox
            key={item.instanceId}
            item={item}
            project={project}
          />
        ))}

        {editor.utilities.map((utility) => (
          <Utility3D
            key={utility.id}
            utility={utility}
            project={project}
          />
        ))}

        <SvgText
          x={VIEW_W / 2}
          y={VIEW_H - 22}
          textAnchor="middle"
          fontSize="11"
          fill="#607085"
        >
          {Math.round(roomW)} × {Math.round(roomD)} × {Math.round(roomH)} mm
        </SvgText>
      </Svg>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.control}
          onPress={() => setAngle((value) => (value + 270) % 360)}
        >
          <Text style={styles.controlText}>↺ Vrid</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.control}
          onPress={() => setAngle(0)}
        >
          <Text style={styles.controlText}>Hemvy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.control}
          onPress={() => setAngle((value) => (value + 90) % 360)}
        >
          <Text style={styles.controlText}>Vrid ↻</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.note}>
        3D-vyn följer ritningens väggar, öppningar, höjd, produktmått och tekniska punkter.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE4EC",
    borderRadius: 18,
    overflow: "hidden",
  },
  header: {
    padding: 16,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0B1728",
  },
  subtitle: {
    marginTop: 3,
    color: "#748397",
    fontSize: 11,
  },
  angleBadge: {
    backgroundColor: "#EEF4FA",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  angleText: {
    color: "#38526C",
    fontWeight: "900",
    fontSize: 11,
  },
  controls: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  control: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#DDE4EC",
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    borderRadius: 11,
    alignItems: "center",
  },
  controlText: {
    color: "#34465A",
    fontWeight: "800",
    fontSize: 12,
  },
  note: {
    marginHorizontal: 14,
    marginBottom: 15,
    backgroundColor: "#F3F7FB",
    borderRadius: 11,
    padding: 10,
    color: "#68798B",
    fontSize: 11,
    lineHeight: 16,
  },
});
