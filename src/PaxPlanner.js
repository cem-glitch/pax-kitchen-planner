import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Planner2D from "./Planner2D";
import Planner3D from "./Planner3D";
import AIRenderScreen from "./AIRenderScreen";
import {
  createRectangleWalls,
  clampEquipment,
  rectanglesOverlap,
  rotatedSize,
  wallLength,
} from "./geometry";
import {
  formatSEK,
  getFallbackCatalog,
  loadCatalog,
} from "./catalog";
import { useEditorHistory } from "./useEditorHistory";

const BLUE = "#1677D2";
const NAVY = "#0B1728";
const BG = "#F4F6F8";
const BORDER = "#DCE3EA";

const TOOLS = [
  { key: "select", label: "Välj", icon: "↖" },
  { key: "wall", label: "Vägg", icon: "╱" },
  { key: "measure", label: "Mått", icon: "↔" },
  { key: "door", label: "Dörr", icon: "⌜" },
  { key: "window", label: "Fönster", icon: "▭" },
  { key: "equipment", label: "Produkt", icon: "+" },
  { key: "electric", label: "El", icon: "⚡" },
  { key: "water", label: "Vatten", icon: "V" },
  { key: "drain", label: "Avlopp", icon: "A" },
  { key: "vent", label: "Vent", icon: "AIR" },
  { key: "gas", label: "Gas", icon: "G" },
];

const UTILITY_LABELS = {
  electric: "El",
  water: "Vatten",
  drain: "Avlopp",
  vent: "Ventilation",
  gas: "Gas",
};

function Splash() {
  return (
    <View style={styles.splash}>
      <View style={styles.splashLogo}>
        <Text style={styles.splashLogoText}>PAX</Text>
      </View>
      <Text style={styles.splashCompany}>PAX STORKÖK</Text>
      <Text style={styles.splashName}>Köksplanerare</Text>
      <View style={styles.splashLine} />
    </View>
  );
}

function ToolButton({ item, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.toolButton, active && styles.toolButtonActive]}
    >
      <Text style={[styles.toolIcon, active && styles.toolIconActive]}>
        {item.icon}
      </Text>
      <Text style={[styles.toolLabel, active && styles.toolLabelActive]}>
        {item.label}
      </Text>
    </TouchableOpacity>
  );
}

function ProductCard({ product, onAdd }) {
  return (
    <View style={styles.productCard}>
      <View style={styles.productImageWrap}>
        {product.image ? (
          <Image
            source={{ uri: product.image }}
            style={styles.productImage}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.productImageFallback}>PAX</Text>
        )}
      </View>

      <View style={styles.productBody}>
        <Text numberOfLines={2} style={styles.productTitle}>
          {product.title}
        </Text>
        <Text style={styles.productMeta}>
          {product.w} × {product.d} × {product.h} mm
          {product.estimated ? "  • uppskattat mått" : ""}
        </Text>
        <Text style={styles.productPrice}>{formatSEK(product.price)}</Text>
      </View>

      <TouchableOpacity style={styles.productAdd} onPress={() => onAdd(product)}>
        <Text style={styles.productAddText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

function PropertyPanel({
  selected,
  editor,
  commit,
  setSelected,
  roomW,
  roomD,
}) {
  if (!selected) {
    return (
      <View style={styles.propertyEmpty}>
        <Text style={styles.propertyEmptyTitle}>Inget valt</Text>
        <Text style={styles.propertyEmptyText}>
          Välj en vägg, måttlinje, öppning, anslutningspunkt eller produkt för att redigera den.
        </Text>
      </View>
    );
  }

  const removeSelected = () => {
    commit((state) => {
      if (selected.kind === "wall") {
        return {
          ...state,
          walls: state.walls.filter((item) => item.id !== selected.id),
          openings: state.openings.filter((item) => item.wallId !== selected.id),
        };
      }

      if (selected.kind === "opening") {
        return {
          ...state,
          openings: state.openings.filter((item) => item.id !== selected.id),
        };
      }

      if (selected.kind === "utility") {
        return {
          ...state,
          utilities: state.utilities.filter((item) => item.id !== selected.id),
        };
      }

      if (selected.kind === "dimension") {
        return {
          ...state,
          dimensions: (state.dimensions || []).filter(
            (item) => item.id !== selected.id
          ),
        };
      }

      if (selected.kind === "equipment") {
        return {
          ...state,
          equipment: state.equipment.filter(
            (item) => item.instanceId !== selected.id
          ),
        };
      }

      return state;
    });

    setSelected(null);
  };

  if (selected.kind === "dimension") {
    const dimension = (editor.dimensions || []).find(
      (item) => item.id === selected.id
    );
    if (!dimension) return null;

    const dx = Math.abs(dimension.p2.x - dimension.p1.x);
    const dy = Math.abs(dimension.p2.y - dimension.p1.y);
    const length = Math.round(Math.max(dx, dy));

    return (
      <View style={styles.propertyCard}>
        <View style={styles.propertyHeader}>
          <View>
            <Text style={styles.propertyTitle}>Måttlinje</Text>
            <Text style={styles.propertySub}>Avstånd {length} mm</Text>
          </View>
          <Text style={styles.propertyBadge}>{length} mm</Text>
        </View>

        <Text style={styles.propertyHelp}>
          Måttlinjen visar avståndet mellan de två valda kanterna.
        </Text>

        <TouchableOpacity style={styles.dangerButton} onPress={removeSelected}>
          <Text style={styles.dangerButtonText}>Ta bort mått</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (selected.kind === "wall") {
    const wall = editor.walls.find((item) => item.id === selected.id);
    if (!wall) return null;

    const setThickness = (thickness) => {
      commit((state) => ({
        ...state,
        walls: state.walls.map((item) =>
          item.id === wall.id ? { ...item, thickness } : item
        ),
      }));
    };

    return (
      <View style={styles.propertyCard}>
        <View style={styles.propertyHeader}>
          <View>
            <Text style={styles.propertyTitle}>Vägg</Text>
            <Text style={styles.propertySub}>
              Längd {Math.round(wallLength(wall))} mm
            </Text>
          </View>
          <Text style={styles.propertyBadge}>{wall.thickness} mm</Text>
        </View>

        <Text style={styles.propertyLabel}>Väggtjocklek</Text>
        <View style={styles.segmentRow}>
          {[100, 150, 200].map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => setThickness(value)}
              style={[
                styles.segment,
                wall.thickness === value && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  wall.thickness === value && styles.segmentTextActive,
                ]}
              >
                {value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.propertyHelp}>
          Dra mitt på väggen för att flytta den. Dra de blå ändpunkterna för att ändra längden.
        </Text>

        <TouchableOpacity style={styles.dangerButton} onPress={removeSelected}>
          <Text style={styles.dangerButtonText}>Ta bort vägg</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (selected.kind === "opening") {
    const opening = editor.openings.find((item) => item.id === selected.id);
    if (!opening) return null;

    const updateWidth = (delta) => {
      commit((state) => ({
        ...state,
        openings: state.openings.map((item) =>
          item.id === opening.id
            ? {
                ...item,
                width: Math.max(500, Math.min(2400, item.width + delta)),
              }
            : item
        ),
      }));
    };

    const flip = () => {
      commit((state) => ({
        ...state,
        openings: state.openings.map((item) =>
          item.id === opening.id ? { ...item, flip: !item.flip } : item
        ),
      }));
    };

    return (
      <View style={styles.propertyCard}>
        <View style={styles.propertyHeader}>
          <View>
            <Text style={styles.propertyTitle}>
              {opening.type === "door" ? "Dörr" : "Fönster"}
            </Text>
            <Text style={styles.propertySub}>Bredd {opening.width} mm</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => updateWidth(-100)}
          >
            <Text style={styles.actionButtonText}>−100</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => updateWidth(100)}
          >
            <Text style={styles.actionButtonText}>+100</Text>
          </TouchableOpacity>
          {opening.type === "door" && (
            <TouchableOpacity style={styles.actionButton} onPress={flip}>
              <Text style={styles.actionButtonText}>Vänd</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.dangerButton} onPress={removeSelected}>
          <Text style={styles.dangerButtonText}>Ta bort</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (selected.kind === "utility") {
    const utility = editor.utilities.find((item) => item.id === selected.id);
    if (!utility) return null;

    return (
      <View style={styles.propertyCard}>
        <Text style={styles.propertyTitle}>
          {UTILITY_LABELS[utility.type] || "Anslutning"}
        </Text>
        <Text style={styles.propertySub}>
          X {Math.round(utility.x)} mm • Y {Math.round(utility.y)} mm
        </Text>
        <TouchableOpacity style={styles.dangerButton} onPress={removeSelected}>
          <Text style={styles.dangerButtonText}>Ta bort punkt</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (selected.kind === "equipment") {
    const item = editor.equipment.find(
      (entry) => entry.instanceId === selected.id
    );
    if (!item) return null;

    const rotate = () => {
      commit((state) => ({
        ...state,
        equipment: state.equipment.map((entry) => {
          if (entry.instanceId !== item.instanceId) return entry;

          let candidate = {
            ...entry,
            rotation: (entry.rotation + 90) % 360,
          };

          candidate = clampEquipment(candidate, roomW, roomD);

          const collision = state.equipment.some(
            (other) =>
              other.instanceId !== entry.instanceId &&
              rectanglesOverlap(candidate, other)
          );

          return collision ? entry : candidate;
        }),
      }));
    };

    const duplicate = () => {
      const copyId = item.id + "-" + Date.now() + "-copy";
      const size = rotatedSize(item);

      let copy = {
        ...item,
        instanceId: copyId,
        locked: false,
        x: Math.min(item.x + 200, Math.max(0, roomW - size.w)),
        y: Math.min(item.y + 200, Math.max(0, roomD - size.d)),
      };

      const collision = editor.equipment.some((other) =>
        rectanglesOverlap(copy, other)
      );

      if (collision) {
        copy = {
          ...copy,
          x: Math.max(0, Math.min(roomW - size.w, item.x + 500)),
          y: item.y,
        };
      }

      commit((state) => ({
        ...state,
        equipment: [...state.equipment, copy],
      }));
      setSelected({ kind: "equipment", id: copyId });
    };

    const toggleLock = () => {
      commit((state) => ({
        ...state,
        equipment: state.equipment.map((entry) =>
          entry.instanceId === item.instanceId
            ? { ...entry, locked: !entry.locked }
            : entry
        ),
      }));
    };

    return (
      <View style={styles.propertyCard}>
        <View style={styles.propertyHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.propertyTitle}>{item.title}</Text>
            <Text style={styles.propertySub}>
              {item.w} × {item.d} × {item.h} mm • {item.rotation}°
            </Text>
          </View>
          {item.estimated && (
            <Text style={styles.estimateBadge}>~ mått</Text>
          )}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={rotate}>
            <Text style={styles.actionButtonText}>↻ Rotera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={duplicate}>
            <Text style={styles.actionButtonText}>Duplicera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={toggleLock}>
            <Text style={styles.actionButtonText}>
              {item.locked ? "Lås upp" : "Lås"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.dangerButton} onPress={removeSelected}>
          <Text style={styles.dangerButtonText}>Ta bort produkt</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

export default function PaxPlanner() {
  const [splash, setSplash] = useState(true);
  const [tab, setTab] = useState("plan");
  const [tool, setTool] = useState("select");
  const [wallDraft, setWallDraft] = useState(null);
  const [selected, setSelected] = useState(null);

  const [projectName, setProjectName] = useState("Nytt köksprojekt");
  const [customerName, setCustomerName] = useState("");
  const [roomWInput, setRoomWInput] = useState("6000");
  const [roomDInput, setRoomDInput] = useState("4500");
  const [roomHInput, setRoomHInput] = useState("2600");

  const roomW = Math.max(2000, Number(roomWInput) || 6000);
  const roomD = Math.max(2000, Number(roomDInput) || 4500);
  const roomH = Math.max(2000, Number(roomHInput) || 2600);

  const initialEditor = useMemo(
    () => ({
      walls: createRectangleWalls(6000, 4500, 150),
      openings: [],
      utilities: [],
      dimensions: [],
      equipment: [],
    }),
    []
  );

  const {
    present: editor,
    commit,
    undo,
    redo,
    resetHistory,
    canUndo,
    canRedo,
  } = useEditorHistory(initialEditor);

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Alla");

  useEffect(() => {
    const timer = setTimeout(() => setSplash(false), 1300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, []);

  useEffect(() => {
    setWallDraft(null);
  }, [tool]);

  async function refreshCatalog() {
    setLoadingProducts(true);
    setCatalogMessage("");

    try {
      const live = await loadCatalog();
      setProducts(live);
    } catch (error) {
      setProducts(getFallbackCatalog());
      setCatalogMessage("Live-katalogen kunde inte nås. Reservdata visas.");
    } finally {
      setLoadingProducts(false);
    }
  }

  const categories = useMemo(() => {
    const all = Array.from(
      new Set(products.map((product) => product.type).filter(Boolean))
    );
    return ["Alla", ...all.slice(0, 18)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products
      .filter((product) => {
        const categoryMatch =
          category === "Alla" || product.type === category;
        const searchMatch =
          !query ||
          (
            product.title +
            " " +
            product.vendor +
            " " +
            product.type
          )
            .toLowerCase()
            .includes(query);

        return categoryMatch && searchMatch;
      })
      .slice(0, 100);
  }, [products, search, category]);

  function setActiveTool(nextTool) {
    setTool(nextTool);
    if (nextTool !== "select") setSelected(null);
  }

  function findFreePosition(product) {
    const step = 250;
    for (let y = 100; y <= roomD - product.d; y += step) {
      for (let x = 100; x <= roomW - product.w; x += step) {
        const candidate = {
          ...product,
          x,
          y,
          rotation: 0,
        };
        const collision = editor.equipment.some((item) =>
          rectanglesOverlap(candidate, item)
        );

        if (!collision) return { x, y };
      }
    }

    return { x: 0, y: 0 };
  }

  function addProduct(product) {
    const instanceId =
      product.id + "-" + Date.now() + "-" + Math.round(Math.random() * 999);
    const position = findFreePosition(product);

    const item = {
      ...product,
      instanceId,
      x: position.x,
      y: position.y,
      rotation: 0,
      locked: false,
    };

    commit((state) => ({
      ...state,
      equipment: [...state.equipment, item],
    }));

    setSelected({ kind: "equipment", id: instanceId });
    setTool("select");
  }

  function rebuildRectangle() {
    Alert.alert(
      "Skapa rektangulära väggar?",
      "Befintliga väggar, dörrar och fönster ersätts. Produkter och anslutningspunkter behålls.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Skapa",
          onPress: () => {
            resetHistory({
              ...editor,
              walls: createRectangleWalls(roomW, roomD, 150),
              openings: [],
            });
            setSelected(null);
            setWallDraft(null);
          },
        },
      ]
    );
  }

  async function shareProject() {
    const productLines = editor.equipment.map(
      (item, index) =>
        String(index + 1) +
        ". " +
        item.title +
        " — " +
        item.w +
        "×" +
        item.d +
        "×" +
        item.h +
        " mm — " +
        formatSEK(item.price)
    );

    const utilityCount = editor.utilities.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});

    const utilityText = Object.keys(utilityCount)
      .map(
        (key) =>
          (UTILITY_LABELS[key] || key) + ": " + utilityCount[key]
      )
      .join(", ");

    const total = editor.equipment.reduce(
      (sum, item) => sum + Number(item.price || 0),
      0
    );

    const message = [
      "PAX STORKÖK – Köksprojekt",
      "",
      "Projekt: " + projectName,
      customerName ? "Kund: " + customerName : null,
      "Lokal: " + roomW + " × " + roomD + " × " + roomH + " mm",
      "Väggar: " + editor.walls.length,
      "Dörrar/fönster: " + editor.openings.length,
      utilityText ? "Anslutningar: " + utilityText : null,
      "",
      "Produkter:",
      productLines.length ? productLines.join("\n") : "Inga produkter valda",
      "",
      "Beräknat listpris: " + formatSEK(total),
    ]
      .filter(Boolean)
      .join("\n");

    await Share.share({ message });
  }

  const totalPrice = editor.equipment.reduce(
    (sum, item) => sum + Number(item.price || 0),
    0
  );

  if (splash) return <Splash />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      <View style={styles.app}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>PAX</Text>
            </View>
            <View>
              <Text style={styles.brandTitle}>Köksplanerare</Text>
              <Text style={styles.brandSub}>PAX STORKÖK AB</Text>
            </View>
          </View>

          <View style={styles.historyRow}>
            <TouchableOpacity
              disabled={!canUndo}
              onPress={undo}
              style={[
                styles.historyButton,
                !canUndo && styles.historyButtonDisabled,
              ]}
            >
              <Text style={styles.historyText}>↶</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!canRedo}
              onPress={redo}
              style={[
                styles.historyButton,
                !canRedo && styles.historyButtonDisabled,
              ]}
            >
              <Text style={styles.historyText}>↷</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.tabs}>
          {[
            ["plan", "2D Ritning"],
            ["3d", "3D Vy"],
            ["ai", "AI Render"],
            ["list", "Projekt"],
          ].map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => setTab(key)}
              style={[styles.tab, tab === key && styles.tabActive]}
            >
              <Text
                style={[
                  styles.tabText,
                  tab === key && styles.tabTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.projectCard}>
            <View style={styles.projectTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardEyebrow}>PROJEKT</Text>
                <TextInput
                  value={projectName}
                  onChangeText={setProjectName}
                  style={styles.projectName}
                  placeholder="Projektnamn"
                />
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>PAX katalog</Text>
              </View>
            </View>

            <TextInput
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="Kund / företag (valfritt)"
              placeholderTextColor="#8B98A7"
              style={styles.customerInput}
            />
          </View>

          <View style={styles.dimensionCard}>
            <View style={styles.dimensionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Rityta & takhöjd</Text>
                <Text style={styles.sectionSub}>
                  Ritytan anger maximal arbetsyta. Väggarna kan ritas fritt.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.rectangleButton}
                onPress={rebuildRectangle}
              >
                <Text style={styles.rectangleButtonText}>Rektangel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dimensionRow}>
              {[
                ["Bredd", roomWInput, setRoomWInput],
                ["Djup", roomDInput, setRoomDInput],
                ["Höjd", roomHInput, setRoomHInput],
              ].map(([label, value, setter]) => (
                <View style={styles.dimensionField} key={label}>
                  <Text style={styles.dimensionLabel}>{label}</Text>
                  <TextInput
                    value={value}
                    onChangeText={setter}
                    keyboardType="number-pad"
                    style={styles.dimensionInput}
                  />
                  <Text style={styles.dimensionUnit}>mm</Text>
                </View>
              ))}
            </View>
          </View>

          {tab === "plan" && (
            <>
              <View style={styles.toolbarCard}>
                <Text style={styles.cardEyebrow}>VERKTYG</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tools}
                >
                  {TOOLS.map((item) => (
                    <ToolButton
                      key={item.key}
                      item={item}
                      active={tool === item.key}
                      onPress={() => setActiveTool(item.key)}
                    />
                  ))}
                </ScrollView>
              </View>

              <Planner2D
                roomW={roomW}
                roomD={roomD}
                editor={editor}
                tool={tool}
                selected={selected}
                setSelected={setSelected}
                wallDraft={wallDraft}
                setWallDraft={setWallDraft}
                commit={commit}
              />

              <PropertyPanel
                selected={selected}
                editor={editor}
                commit={commit}
                setSelected={setSelected}
                roomW={roomW}
                roomD={roomD}
              />

              {tool === "equipment" && (
                <View style={styles.catalogCard}>
                  <View style={styles.catalogHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>PAX Produktkatalog</Text>
                      <Text style={styles.sectionSub}>
                        {products.length} produkter tillgängliga
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.refreshButton}
                      onPress={refreshCatalog}
                    >
                      <Text style={styles.refreshText}>Uppdatera</Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Sök produkt, märke eller kategori..."
                    placeholderTextColor="#8B98A7"
                    style={styles.searchInput}
                  />

                  {!!catalogMessage && (
                    <Text style={styles.catalogMessage}>{catalogMessage}</Text>
                  )}

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categories}
                  >
                    {categories.map((item) => (
                      <TouchableOpacity
                        key={item}
                        onPress={() => setCategory(item)}
                        style={[
                          styles.category,
                          category === item && styles.categoryActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.categoryText,
                            category === item && styles.categoryTextActive,
                          ]}
                        >
                          {item}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {loadingProducts ? (
                    <View style={styles.loader}>
                      <ActivityIndicator size="large" color={BLUE} />
                      <Text style={styles.loaderText}>Laddar PAX katalog...</Text>
                    </View>
                  ) : (
                    filteredProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onAdd={addProduct}
                      />
                    ))
                  )}
                </View>
              )}
            </>
          )}

          {tab === "3d" && (
            <>
              <Planner3D
                roomW={roomW}
                roomD={roomD}
                roomH={roomH}
                editor={editor}
              />

              <View style={styles.statsCard}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{editor.walls.length}</Text>
                  <Text style={styles.statLabel}>Väggar</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{editor.openings.length}</Text>
                  <Text style={styles.statLabel}>Öppningar</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{editor.equipment.length}</Text>
                  <Text style={styles.statLabel}>Produkter</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{editor.utilities.length}</Text>
                  <Text style={styles.statLabel}>Anslutningar</Text>
                </View>
              </View>
            </>
          )}

          {tab === "ai" && (
            <AIRenderScreen
              projectName={projectName}
              customerName={customerName}
              roomW={roomW}
              roomD={roomD}
              roomH={roomH}
              editor={editor}
            />
          )}

          {tab === "list" && (
            <>
              <View style={styles.summaryHero}>
                <Text style={styles.summaryEyebrow}>PROJEKTÖVERSIKT</Text>
                <Text style={styles.summaryTitle}>{projectName}</Text>
                {!!customerName && (
                  <Text style={styles.summaryCustomer}>{customerName}</Text>
                )}

                <View style={styles.summaryMetrics}>
                  <View>
                    <Text style={styles.summaryMetricValue}>
                      {editor.equipment.length}
                    </Text>
                    <Text style={styles.summaryMetricLabel}>produkter</Text>
                  </View>
                  <View>
                    <Text style={styles.summaryMetricValue}>
                      {editor.walls.length}
                    </Text>
                    <Text style={styles.summaryMetricLabel}>väggar</Text>
                  </View>
                  <View>
                    <Text style={styles.summaryMetricValue}>
                      {formatSEK(totalPrice)}
                    </Text>
                    <Text style={styles.summaryMetricLabel}>listpris</Text>
                  </View>
                </View>
              </View>

              <View style={styles.listCard}>
                <Text style={styles.sectionTitle}>Vald utrustning</Text>

                {!editor.equipment.length ? (
                  <Text style={styles.emptyText}>Ingen utrustning vald ännu.</Text>
                ) : (
                  editor.equipment.map((item, index) => (
                    <View key={item.instanceId} style={styles.listRow}>
                      <View style={styles.listNumber}>
                        <Text style={styles.listNumberText}>{index + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={styles.listName}>
                          {item.title}
                        </Text>
                        <Text style={styles.listMeta}>
                          {item.w} × {item.d} × {item.h} mm • {item.rotation}°
                        </Text>
                      </View>
                      <Text style={styles.listPrice}>
                        {formatSEK(item.price)}
                      </Text>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.systemCard}>
                <Text style={styles.sectionTitle}>Tekniska punkter</Text>
                <View style={styles.systemGrid}>
                  {["electric", "water", "drain", "vent", "gas"].map((key) => {
                    const count = editor.utilities.filter(
                      (item) => item.type === key
                    ).length;

                    return (
                      <View style={styles.systemItem} key={key}>
                        <Text style={styles.systemValue}>{count}</Text>
                        <Text style={styles.systemLabel}>
                          {UTILITY_LABELS[key]}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity style={styles.shareButton} onPress={shareProject}>
                <Text style={styles.shareButtonText}>Dela projektunderlag</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.backToPlanButton}
                onPress={() => {
                  setTab("plan");
                  setTool("select");
                }}
              >
                <Text style={styles.backToPlanText}>Tillbaka till ritningen</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: StatusBar.currentHeight || 0,
  },
  app: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    padding: 16,
    paddingBottom: 60,
  },
  splash: {
    flex: 1,
    backgroundColor: "#091522",
    alignItems: "center",
    justifyContent: "center",
  },
  splashLogo: {
    width: 118,
    height: 82,
    borderRadius: 24,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  splashLogoText: {
    color: "#FFFFFF",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  splashCompany: {
    marginTop: 24,
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: 1,
  },
  splashName: {
    marginTop: 6,
    color: "#9FB0C3",
    fontSize: 15,
  },
  splashLine: {
    marginTop: 22,
    width: 52,
    height: 3,
    borderRadius: 2,
    backgroundColor: BLUE,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    minWidth: 50,
    height: 40,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  brandMarkText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  brandTitle: {
    color: NAVY,
    fontSize: 19,
    fontWeight: "900",
  },
  brandSub: {
    color: "#8390A0",
    fontSize: 10,
    marginTop: 1,
  },
  historyRow: {
    flexDirection: "row",
    gap: 6,
  },
  historyButton: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  historyButtonDisabled: {
    opacity: 0.35,
  },
  historyText: {
    fontSize: 21,
    color: "#405267",
    fontWeight: "800",
  },
  tabs: {
    marginHorizontal: 16,
    padding: 4,
    borderRadius: 14,
    backgroundColor: "#E7ECF1",
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
  },
  tabText: {
    color: "#748294",
    fontSize: 10,
    fontWeight: "800",
  },
  tabTextActive: {
    color: NAVY,
  },
  projectCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 14,
    marginBottom: 12,
  },
  projectTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardEyebrow: {
    color: "#93A0AE",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  projectName: {
    paddingVertical: 3,
    color: NAVY,
    fontSize: 19,
    fontWeight: "900",
  },
  customerInput: {
    marginTop: 8,
    backgroundColor: "#F7F9FB",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E3E8ED",
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: NAVY,
    fontSize: 13,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EDF8F3",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#28A56B",
  },
  liveText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#2E7654",
  },
  dimensionCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 14,
    marginBottom: 12,
  },
  dimensionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    color: NAVY,
    fontSize: 19,
    fontWeight: "900",
  },
  sectionSub: {
    color: "#758396",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  rectangleButton: {
    backgroundColor: "#EDF5FD",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  rectangleButtonText: {
    color: BLUE,
    fontSize: 10,
    fontWeight: "900",
  },
  dimensionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  dimensionField: {
    flex: 1,
    backgroundColor: "#F7F9FB",
    borderWidth: 1,
    borderColor: "#E1E7EC",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  dimensionLabel: {
    color: "#7A8899",
    fontSize: 9,
  },
  dimensionInput: {
    color: NAVY,
    fontSize: 17,
    fontWeight: "900",
    paddingVertical: 2,
  },
  dimensionUnit: {
    color: "#9AA5B2",
    fontSize: 9,
  },
  toolbarCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  tools: {
    gap: 7,
    paddingTop: 8,
    paddingRight: 12,
  },
  toolButton: {
    minWidth: 62,
    paddingHorizontal: 9,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E6EC",
    backgroundColor: "#FAFBFC",
    alignItems: "center",
  },
  toolButtonActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  toolIcon: {
    color: "#536579",
    fontSize: 17,
    fontWeight: "900",
    height: 20,
  },
  toolIconActive: {
    color: "#FFFFFF",
  },
  toolLabel: {
    marginTop: 3,
    color: "#596A7E",
    fontSize: 9,
    fontWeight: "800",
  },
  toolLabelActive: {
    color: "#FFFFFF",
  },
  propertyEmpty: {
    marginTop: 10,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F9FBFC",
    padding: 13,
  },
  propertyEmptyTitle: {
    color: "#516275",
    fontWeight: "900",
    fontSize: 13,
  },
  propertyEmptyText: {
    color: "#8290A0",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  propertyCard: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
  },
  propertyHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  propertyTitle: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "900",
  },
  propertySub: {
    color: "#7B8999",
    fontSize: 11,
    marginTop: 3,
  },
  propertyBadge: {
    color: "#4B6076",
    backgroundColor: "#EDF2F6",
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: "900",
  },
  estimateBadge: {
    color: "#966A12",
    backgroundColor: "#FFF5D9",
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 9,
    fontWeight: "900",
  },
  propertyLabel: {
    marginTop: 13,
    marginBottom: 7,
    color: "#647589",
    fontSize: 10,
    fontWeight: "800",
  },
  segmentRow: {
    flexDirection: "row",
    gap: 7,
  },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 9,
  },
  segmentActive: {
    backgroundColor: "#EAF4FE",
    borderColor: BLUE,
  },
  segmentText: {
    color: "#5F7083",
    fontWeight: "800",
    fontSize: 11,
  },
  segmentTextActive: {
    color: BLUE,
  },
  propertyHelp: {
    marginTop: 10,
    color: "#8090A2",
    fontSize: 10,
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: "row",
    gap: 7,
    marginTop: 13,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    backgroundColor: "#F9FAFB",
    paddingVertical: 9,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#405267",
    fontSize: 10,
    fontWeight: "900",
  },
  dangerButton: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: "#FFF4F4",
    borderWidth: 1,
    borderColor: "#F0CBCB",
    paddingVertical: 9,
    alignItems: "center",
  },
  dangerButtonText: {
    color: "#BE4545",
    fontSize: 10,
    fontWeight: "900",
  },
  catalogCard: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 13,
  },
  catalogHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refreshButton: {
    backgroundColor: "#EDF5FD",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  refreshText: {
    color: BLUE,
    fontSize: 9,
    fontWeight: "900",
  },
  searchInput: {
    marginTop: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#DFE5EA",
    backgroundColor: "#F8FAFB",
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: NAVY,
    fontSize: 13,
  },
  catalogMessage: {
    color: "#9B6A12",
    fontSize: 10,
    marginTop: 8,
  },
  categories: {
    gap: 6,
    paddingVertical: 10,
    paddingRight: 12,
  },
  category: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DFE5EA",
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF",
  },
  categoryActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  categoryText: {
    color: "#607185",
    fontSize: 9,
    fontWeight: "800",
  },
  categoryTextActive: {
    color: "#FFFFFF",
  },
  loader: {
    paddingVertical: 35,
    alignItems: "center",
  },
  loaderText: {
    marginTop: 8,
    color: "#7A899A",
    fontSize: 11,
  },
  productCard: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E0E6EC",
    borderRadius: 14,
    padding: 9,
    flexDirection: "row",
    alignItems: "center",
  },
  productImageWrap: {
    width: 66,
    height: 66,
    borderRadius: 10,
    backgroundColor: "#F3F6F8",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  productImage: {
    width: "92%",
    height: "92%",
  },
  productImageFallback: {
    color: "#9BA8B5",
    fontWeight: "900",
  },
  productBody: {
    flex: 1,
    paddingHorizontal: 10,
  },
  productTitle: {
    color: NAVY,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16,
  },
  productMeta: {
    marginTop: 3,
    color: "#8491A0",
    fontSize: 9,
  },
  productPrice: {
    marginTop: 4,
    color: "#2E7550",
    fontSize: 10,
    fontWeight: "900",
  },
  productAdd: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EAF4FE",
    alignItems: "center",
    justifyContent: "center",
  },
  productAddText: {
    color: BLUE,
    fontSize: 26,
    lineHeight: 28,
  },
  statsCard: {
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 15,
    padding: 12,
    flexDirection: "row",
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    color: NAVY,
    fontSize: 17,
    fontWeight: "900",
  },
  statLabel: {
    color: "#8693A2",
    fontSize: 8,
    marginTop: 2,
  },
  summaryHero: {
    backgroundColor: "#0C1929",
    borderRadius: 18,
    padding: 18,
  },
  summaryEyebrow: {
    color: "#718398",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  summaryTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 6,
  },
  summaryCustomer: {
    color: "#B5C0CD",
    fontSize: 12,
    marginTop: 3,
  },
  summaryMetrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  summaryMetricValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  summaryMetricLabel: {
    color: "#8190A1",
    fontSize: 9,
    marginTop: 2,
  },
  listCard: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 13,
  },
  emptyText: {
    color: "#8390A0",
    fontSize: 11,
    paddingVertical: 18,
    textAlign: "center",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF1F4",
  },
  listNumber: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#EDF2F6",
    alignItems: "center",
    justifyContent: "center",
  },
  listNumberText: {
    color: "#526477",
    fontSize: 9,
    fontWeight: "900",
  },
  listName: {
    color: NAVY,
    fontSize: 11,
    fontWeight: "900",
  },
  listMeta: {
    color: "#8693A1",
    fontSize: 8,
    marginTop: 2,
  },
  listPrice: {
    color: "#2E7550",
    fontSize: 9,
    fontWeight: "900",
  },
  systemCard: {
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 17,
    padding: 13,
  },
  systemGrid: {
    flexDirection: "row",
    marginTop: 12,
  },
  systemItem: {
    flex: 1,
    alignItems: "center",
  },
  systemValue: {
    color: NAVY,
    fontSize: 16,
    fontWeight: "900",
  },
  systemLabel: {
    color: "#8592A1",
    fontSize: 8,
    marginTop: 2,
    textAlign: "center",
  },
  shareButton: {
    marginTop: 14,
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  backToPlanButton: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE3EA",
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  backToPlanText: {
    color: "#4F6175",
    fontSize: 12,
    fontWeight: "900",
  },
});
