import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import {
  buildRenderPrompt,
  rotatedFootprint,
  serializeScene,
  uniqueReferenceImages,
} from "./sceneSerializer";
import {
  generateKitchenRender,
  hasPaxRenderBackend,
} from "./renderService";

const BLUE = "#1677D2";
const NAVY = "#0B1728";
const BORDER = "#DCE3EA";

const CAMERAS = [
  ["left_corner", "Vänster hörn"],
  ["right_corner", "Höger hörn"],
  ["entrance", "Från entrén"],
  ["elevated", "Hög vinkel"],
];

const STYLES = [
  ["realistic", "Realistiskt"],
  ["stainless", "Rostfritt"],
  ["showroom", "Showroom"],
];

const QUALITIES = [
  ["low", "Snabb"],
  ["medium", "Standard"],
  ["high", "Hög"],
];

function ChoiceRow({ items, value, onChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.choiceRow}
    >
      {items.map(([key, label]) => (
        <TouchableOpacity
          key={key}
          onPress={() => onChange(key)}
          style={[
            styles.choice,
            value === key && styles.choiceActive,
          ]}
        >
          <Text
            style={[
              styles.choiceText,
              value === key &&
                styles.choiceTextActive,
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function PlanReferencePreview({
  roomW,
  roomD,
  editor,
}) {
  const width = 330;
  const height = Math.max(
    180,
    Math.min(270, width * (roomD / roomW))
  );
  const sx = width / roomW;
  const sy = height / roomD;
  const wallScale = Math.min(sx, sy);

  return (
    <View
      style={[
        styles.planCanvas,
        { width, height },
      ]}
    >
      {(editor.walls || []).map((wall) => {
        const horizontal =
          Math.abs(wall.x2 - wall.x1) >=
          Math.abs(wall.y2 - wall.y1);
        const thickness = Math.max(
          2,
          Number(wall.thickness || 150) *
            wallScale
        );

        if (horizontal) {
          return (
            <View
              key={wall.id}
              style={{
                position: "absolute",
                left:
                  Math.min(
                    wall.x1,
                    wall.x2
                  ) * sx,
                top:
                  wall.y1 * sy -
                  thickness / 2,
                width: Math.max(
                  2,
                  Math.abs(
                    wall.x2 - wall.x1
                  ) * sx
                ),
                height: thickness,
                backgroundColor: "#243448",
              }}
            />
          );
        }

        return (
          <View
            key={wall.id}
            style={{
              position: "absolute",
              left:
                wall.x1 * sx -
                thickness / 2,
              top:
                Math.min(
                  wall.y1,
                  wall.y2
                ) * sy,
              width: thickness,
              height: Math.max(
                2,
                Math.abs(
                  wall.y2 - wall.y1
                ) * sy
              ),
              backgroundColor: "#243448",
            }}
          />
        );
      })}

      {(editor.equipment || []).map(
        (item, index) => {
          const footprint =
            rotatedFootprint(item);

          return (
            <View
              key={item.instanceId}
              style={[
                styles.planEquipment,
                {
                  left: item.x * sx,
                  top: item.y * sy,
                  width: Math.max(
                    5,
                    footprint.w * sx
                  ),
                  height: Math.max(
                    5,
                    footprint.d * sy
                  ),
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={
                  styles.planEquipmentText
                }
              >
                {index + 1}
              </Text>
            </View>
          );
        }
      )}

      <View style={styles.planLegend}>
        <Text style={styles.planLegendText}>
          PAX plan • {roomW} × {roomD} mm
        </Text>
      </View>
    </View>
  );
}

export default function AIRenderScreen({
  projectName,
  customerName,
  roomW,
  roomD,
  roomH,
  editor,
}) {
  const previewRef = useRef(null);
  const backendReady =
    hasPaxRenderBackend();

  const [apiKey, setApiKey] =
    useState("");
  const [showTestMode, setShowTestMode] =
    useState(false);
  const [camera, setCamera] =
    useState("left_corner");
  const [visualStyle, setVisualStyle] =
    useState("realistic");
  const [quality, setQuality] =
    useState("medium");
  const [rendering, setRendering] =
    useState(false);
  const [renderUri, setRenderUri] =
    useState(null);
  const [error, setError] =
    useState("");

  const scene = useMemo(
    () =>
      serializeScene({
        projectName,
        customerName,
        roomW,
        roomD,
        roomH,
        editor,
      }),
    [
      projectName,
      customerName,
      roomW,
      roomD,
      roomH,
      editor,
    ]
  );

  const references = useMemo(
    () =>
      uniqueReferenceImages(scene, 12),
    [scene]
  );

  async function render() {
    setError("");
    setRendering(true);

    try {
      const floorPlanBase64 =
        await captureRef(previewRef, {
          format: "png",
          quality: 1,
          result: "base64",
        });

      const prompt =
        buildRenderPrompt(
          scene,
          camera,
          visualStyle
        );

      const result =
        await generateKitchenRender({
          apiKey:
            showTestMode
              ? apiKey
              : "",
          prompt,
          floorPlanBase64,
          referenceImages:
            references,
          quality,
        });

      setRenderUri(result.imageUri);
    } catch (e) {
      setError(
        e?.message ||
          "Renderingen misslyckades."
      );
    } finally {
      setRendering(false);
    }
  }

  return (
    <View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>
          PAX AI RENDER
        </Text>
        <Text style={styles.heroTitle}>
          Fotorealistisk köksvy
        </Text>
        <Text style={styles.heroText}>
          Planens geometri, verkliga
          produktmått och produktbilder
          används som referenser.
        </Text>

        <View style={styles.heroStats}>
          <View>
            <Text
              style={
                styles.heroStatValue
              }
            >
              {editor.equipment.length}
            </Text>
            <Text
              style={
                styles.heroStatLabel
              }
            >
              produkter
            </Text>
          </View>

          <View>
            <Text
              style={
                styles.heroStatValue
              }
            >
              {editor.walls.length}
            </Text>
            <Text
              style={
                styles.heroStatLabel
              }
            >
              väggar
            </Text>
          </View>

          <View>
            <Text
              style={
                styles.heroStatValue
              }
            >
              {references.length}
            </Text>
            <Text
              style={
                styles.heroStatLabel
              }
            >
              referenser
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View
          style={
            styles.connectionHeader
          }
        >
          <View style={{ flex: 1 }}>
            <Text
              style={
                styles.cardTitle
              }
            >
              PAX AI
            </Text>
            <Text
              style={
                styles.cardSub
              }
            >
              {backendReady
                ? "Säker PAX-server är ansluten. Ingen API-nyckel behövs i appen."
                : "Säker PAX-server väntar på aktivering. Ritning och renderflöde är klara."}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              backendReady
                ? styles.statusReady
                : styles.statusWaiting,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                backendReady
                  ? styles.statusReadyText
                  : styles.statusWaitingText,
              ]}
            >
              {backendReady
                ? "KLAR"
                : "VÄNTAR"}
            </Text>
          </View>
        </View>

        {!backendReady && (
          <TouchableOpacity
            style={styles.testToggle}
            onPress={() =>
              setShowTestMode(
                (value) => !value
              )
            }
          >
            <Text
              style={
                styles.testToggleText
              }
            >
              {showTestMode
                ? "Dölj avancerat testläge"
                : "Avancerat testläge"}
            </Text>
          </TouchableOpacity>
        )}

        {!backendReady &&
          showTestMode && (
            <TextInput
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="OpenAI API-nyckel för tillfälligt test"
              placeholderTextColor="#8B98A7"
              style={styles.keyInput}
            />
          )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Planreferens
        </Text>
        <Text style={styles.cardSub}>
          Den här top-down bilden skickas
          med som fast geometrireferens.
        </Text>

        <View
          ref={previewRef}
          collapsable={false}
          style={styles.previewWrap}
        >
          <PlanReferencePreview
            roomW={roomW}
            roomD={roomD}
            editor={editor}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Kamera
        </Text>
        <ChoiceRow
          items={CAMERAS}
          value={camera}
          onChange={setCamera}
        />

        <Text
          style={styles.settingLabel}
        >
          Stil
        </Text>
        <ChoiceRow
          items={STYLES}
          value={visualStyle}
          onChange={setVisualStyle}
        />

        <Text
          style={styles.settingLabel}
        >
          Kvalitet
        </Text>
        <ChoiceRow
          items={QUALITIES}
          value={quality}
          onChange={setQuality}
        />

        <View style={styles.warning}>
          <Text
            style={
              styles.warningTitle
            }
          >
            Produktbevarande
          </Text>
          <Text
            style={
              styles.warningText
            }
          >
            AI får planbilden plus upp
            till 12 unika
            produktreferenser. Slutlig
            installation ska alltid
            följa 2D-måtten.
          </Text>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text
              style={styles.errorText}
            >
              {error}
            </Text>
          </View>
        )}

        <TouchableOpacity
          disabled={rendering}
          onPress={render}
          style={[
            styles.renderButton,
            rendering &&
              styles.renderButtonDisabled,
          ]}
        >
          {rendering ? (
            <View
              style={
                styles.renderingRow
              }
            >
              <ActivityIndicator
                color="#FFFFFF"
              />
              <Text
                style={
                  styles.renderButtonText
                }
              >
                Renderar...
              </Text>
            </View>
          ) : (
            <Text
              style={
                styles.renderButtonText
              }
            >
              Generera AI-render
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {renderUri && (
        <View style={styles.resultCard}>
          <Text
            style={
              styles.resultEyebrow
            }
          >
            AI RESULTAT
          </Text>
          <Text
            style={
              styles.resultTitle
            }
          >
            {projectName}
          </Text>

          <Image
            source={{ uri: renderUri }}
            style={styles.resultImage}
            resizeMode="contain"
          />

          <Text
            style={
              styles.resultNote
            }
          >
            Kontrollera produktmodell,
            öppningar och fria mått mot
            2D-ritningen innan bilden
            används som kundunderlag.
          </Text>

          <TouchableOpacity
            style={
              styles.secondaryButton
            }
            onPress={render}
            disabled={rendering}
          >
            <Text
              style={
                styles.secondaryButtonText
              }
            >
              Generera ny version
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: "#0B1728",
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
  },
  eyebrow: {
    color: "#73B7F3",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 6,
  },
  heroText: {
    color: "#B5C1CE",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 7,
  },
  heroStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
  },
  heroStatValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  heroStatLabel: {
    color: "#8292A4",
    fontSize: 9,
    marginTop: 2,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    color: NAVY,
    fontSize: 17,
    fontWeight: "900",
  },
  cardSub: {
    color: "#78889A",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  connectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  statusBadge: {
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  statusReady: {
    backgroundColor: "#EAF7F0",
  },
  statusWaiting: {
    backgroundColor: "#FFF5D9",
  },
  statusText: {
    fontSize: 8,
    fontWeight: "900",
  },
  statusReadyText: {
    color: "#27734C",
  },
  statusWaitingText: {
    color: "#8B6517",
  },
  testToggle: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 5,
  },
  testToggleText: {
    color: "#748397",
    fontSize: 9,
    fontWeight: "800",
  },
  keyInput: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    borderRadius: 12,
    backgroundColor: "#F8FAFB",
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: NAVY,
    fontSize: 12,
  },
  previewWrap: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 7,
    backgroundColor: "#F4F6F8",
    borderRadius: 14,
  },
  planCanvas: {
    position: "relative",
    backgroundColor: "#FCFDFE",
    borderWidth: 1,
    borderColor: "#CAD4DE",
    overflow: "hidden",
  },
  planEquipment: {
    position: "absolute",
    backgroundColor: "#DCEAF7",
    borderWidth: 1,
    borderColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  planEquipmentText: {
    color: "#0B4C85",
    fontSize: 8,
    fontWeight: "900",
  },
  planLegend: {
    position: "absolute",
    left: 6,
    bottom: 5,
    backgroundColor:
      "rgba(255,255,255,0.88)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  planLegendText: {
    color: "#506277",
    fontSize: 7,
    fontWeight: "800",
  },
  settingLabel: {
    color: "#657589",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 13,
    marginBottom: 2,
  },
  choiceRow: {
    gap: 7,
    paddingTop: 8,
    paddingRight: 10,
  },
  choice: {
    borderWidth: 1,
    borderColor: "#DCE3EA",
    borderRadius: 11,
    backgroundColor: "#F8FAFB",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  choiceActive: {
    backgroundColor: "#EAF4FE",
    borderColor: BLUE,
  },
  choiceText: {
    color: "#607185",
    fontSize: 10,
    fontWeight: "800",
  },
  choiceTextActive: {
    color: BLUE,
  },
  warning: {
    marginTop: 12,
    backgroundColor: "#FFF8E8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F1DEAA",
    padding: 11,
  },
  warningTitle: {
    color: "#7A5A12",
    fontSize: 10,
    fontWeight: "900",
  },
  warningText: {
    color: "#846F3F",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 3,
  },
  errorBox: {
    marginTop: 10,
    borderRadius: 11,
    backgroundColor: "#FFF1F1",
    borderWidth: 1,
    borderColor: "#F1CACA",
    padding: 10,
  },
  errorText: {
    color: "#A64040",
    fontSize: 10,
    lineHeight: 15,
  },
  renderButton: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: BLUE,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  renderButtonDisabled: {
    opacity: 0.7,
  },
  renderingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  renderButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  resultCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 18,
    padding: 13,
    marginBottom: 20,
  },
  resultEyebrow: {
    color: BLUE,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  resultTitle: {
    color: NAVY,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 4,
  },
  resultImage: {
    width: "100%",
    height: 320,
    marginTop: 10,
    backgroundColor: "#EEF2F5",
    borderRadius: 13,
  },
  resultNote: {
    color: "#78889A",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 9,
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#CFE1F3",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    backgroundColor: "#F4F9FE",
  },
  secondaryButtonText: {
    color: BLUE,
    fontSize: 11,
    fontWeight: "900",
  },
});
