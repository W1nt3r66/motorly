import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { supabase } from "./lib/supabase";
import {
  loadGarageFromCloud,
  saveGarageToCloud,
  subscribeToGarage,
} from "./lib/garageSync";
import AuthScreen from "./components/AuthScreen";
import CrewScreen from "./components/CrewScreen";

const LIGHT = {
  ink: "#20262E",
  muted: "#687482",
  green: "#456B8C",
  accentSurface: "#446A8B",
  green2: "#314E69",
  mint: "#DCE6EE",
  lime: "#D8E65A",
  cream: "#F1F3F5",
  white: "#FFFFFF",
  onAccent: "#FEFFFF",
  line: "#D5DBE1",
  orange: "#B77A48",
  red: "#C45E5E",
  blue: "#5F809E",
};
const DARK = {
  ink: "#E7ECF2",
  muted: "#9AA7B5",
  green: "#8FAFD0",
  accentSurface: "#314B63",
  green2: "#2B3D52",
  mint: "#202B38",
  lime: "#D8E65A",
  cream: "#0B0E12",
  white: "#151B23",
  onAccent: "#F3F6FA",
  line: "#2B3542",
  orange: "#C78955",
  red: "#E07A6B",
  blue: "#7EA6C8",
};
let nightModeActive = false;
const C = new Proxy(LIGHT, {
  get(target, property) {
    return (nightModeActive ? DARK : target)[property];
  },
});

const LEGACY_STORAGE_KEY = "motorly-v1";
const STORAGE_PREFIX = "motorly-v2";
const storageKeyForUser = (userId) => `${STORAGE_PREFIX}:${userId}`;
const today = () => new Date().toISOString().slice(0, 10);
const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const number = (n, digits = 1) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: digits });
const shortDate = (value) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
const deviceGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
};
const validIndianPhone = (value) =>
  /^(?:\+91|91)?[6-9]\d{9}$/.test(String(value || "").replace(/[\s-]/g, ""));
const validEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
const validIndianRegistration = (value) => {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  return (
    /^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4}$/.test(normalized) ||
    /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(normalized)
  );
};
function VehicleGlyph({ vehicle, size = 22, color = C.green, outlined }) {
  if (vehicle?.type === "motorbike") {
    return (
      <MaterialCommunityIcons name="motorbike" size={size} color={color} />
    );
  }

  return (
    <Ionicons
      name={outlined ? "car-sport-outline" : "car-sport"}
      size={size}
      color={color}
    />
  );
}

const emptyVehicle = () => ({
  id: "vehicle-primary",
  type: "car",
  make: "",
  model: "",
  year: "",
  fuelType: "Petrol",
  registration: "",
  tank: "",
});

const emptyGarage = () => ({
  owner: { name: "", email: "", phone: "" },
  car: emptyVehicle(),
  vehicles: [emptyVehicle()],
  activeVehicleId: "all",
  fuel: [],
  expenses: [],
});

const DEMO_FUEL_IDS = new Set(["f1", "f2", "f3", "f4", "f5", "f6"]);
const DEMO_EXPENSE_IDS = new Set(["e1", "e2", "e3"]);
const isDemoVehicle = (vehicle) =>
  String(vehicle?.registration || "")
    .replace(/[\s-]/g, "")
    .toUpperCase() === "KA01MN4821" &&
  String(vehicle?.make || "").toLowerCase() === "hyundai" &&
  String(vehicle?.model || "").toLowerCase() === "creta";

function removeLegacyDemoData(source = {}) {
  const sourceVehicles = source.vehicles?.length
    ? source.vehicles
    : source.car
      ? [source.car]
      : [];
  const vehicles = sourceVehicles.filter((vehicle) => !isDemoVehicle(vehicle));
  const cleanOwner =
    String(source.owner?.email || "").toLowerCase() === "arjun@example.com"
      ? { name: "", email: "", phone: "" }
      : source.owner;

  return {
    ...source,
    owner: cleanOwner || { name: "", email: "", phone: "" },
    car: vehicles[0],
    vehicles,
    activeVehicleId: vehicles.some(
      (vehicle) => vehicle.id === source.activeVehicleId,
    )
      ? source.activeVehicleId
      : "all",
    fuel: (source.fuel || []).filter((entry) => !DEMO_FUEL_IDS.has(entry.id)),
    expenses: (source.expenses || []).filter(
      (entry) => !DEMO_EXPENSE_IDS.has(entry.id),
    ),
  };
}

function normalizeGarage(source) {
  const safeSource = source || emptyGarage();
  const fallbackVehicle = {
    ...emptyVehicle(),
    ...(safeSource.car || {}),
  };
  const vehicles = (
    safeSource.vehicles?.length ? safeSource.vehicles : [fallbackVehicle]
  ).map((vehicle, index) => ({
    id: vehicle.id || `vehicle-${index + 1}`,
    type: vehicle.type || "car",
    ...vehicle,
  }));
  const primaryVehicleId = vehicles[0].id;

  return {
    ...safeSource,
    owner: {
      name: "",
      email: "",
      phone: "",
      ...(safeSource.owner || {}),
    },
    car: vehicles[0],
    vehicles,
    activeVehicleId: safeSource.activeVehicleId || "all",
    fuel: (safeSource.fuel || []).map((entry) => ({
      ...entry,
      vehicleId: entry.vehicleId || primaryVehicleId,
    })),
    expenses: (safeSource.expenses || []).map((entry) => ({
      ...entry,
      vehicleId: entry.vehicleId || primaryVehicleId,
    })),
  };
}

const NAV = [
  ["home", "Overview", "grid-outline"],
  ["logs", "Logs", "receipt-outline"],
  ["crew", "Crew", "people-outline"],
  ["calculators", "Calculators", "calculator-outline"],
  ["profile", "Garage", "speedometer-outline"],
];

const CHART_COLORS = [
  "#8FAFCC",
  "#D2A06B",
  "#B39ACA",
  "#D78491",
  "#7F9FBE",
  "#C4A6B8",
];

const fieldStyle = () => ({
  borderWidth: 1,
  borderColor: C.line,
  borderRadius: 12,
  paddingHorizontal: 14,
  height: 48,
  fontSize: 15,
  color: C.ink,
  backgroundColor: C.white,
});

function IconButton({ icon, onPress, light = false, compact = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.iconButton,
        compact && styles.iconButtonCompact,
        light && { backgroundColor: "rgba(255,255,255,.12)" },
      ]}
    >
      <Ionicons name={icon} size={20} color={light ? C.onAccent : C.green} />
    </TouchableOpacity>
  );
}

function Button({
  children,
  onPress,
  icon,
  customIcon,
  secondary,
  small,
  disabled,
  style,
}) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        small && styles.buttonSmall,
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {customIcon}
      {!customIcon && icon && (
        <Ionicons
          name={icon}
          size={18}
          color={secondary ? C.green : C.onAccent}
        />
      )}
      <Text style={[styles.buttonText, secondary && { color: C.green }]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Pill({ children, tone = "green" }) {
  const bg =
    tone === "orange" ? "#FBE9D8" : tone === "blue" ? "#E4EEF2" : C.mint;
  const color =
    tone === "orange" ? "#9A5B1F" : tone === "blue" ? "#46697A" : C.green;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  );
}

function SectionTitle({ title, subtitle, action, onAction }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionHeadCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {action && (
        <TouchableOpacity onPress={onAction} style={styles.sectionHeadAction}>
          <Text style={styles.textLink}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Metric({ icon, label, value, detail, tone = C.green, wide }) {
  return (
    <Card style={[styles.metric, wide && { minWidth: 260 }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${tone}18` }]}>
        <Ionicons name={icon} size={21} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
        {detail && <Text style={styles.metricDetail}>{detail}</Text>}
      </View>
    </Card>
  );
}

function Empty({ icon, title, text }) {
  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={C.green} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </Card>
  );
}

function AppShell({
  page,
  setPage,
  children,
  car,
  onAdd,
  isDesktop,
  darkMode,
  vehicleScope,
  onCycleVehicle,
  onToggleDarkMode,
  onNotifications,
  notificationUnread,
  onSignOut,
}) {
  return (
    <View style={[styles.app, darkMode && styles.appDark]}>
      {isDesktop && (
        <View style={[styles.sidebar, darkMode && styles.sidebarDark]}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Ionicons name="speedometer" size={22} color="#20262E" />
            </View>
            <Text style={[styles.brandText, darkMode && { color: "#D8E65A" }]}>
              motorly
            </Text>
          </View>
          <View style={styles.nav}>
            {NAV.map(([id, label, icon]) => (
              <TouchableOpacity
                key={id}
                onPress={() => setPage(id)}
                style={[styles.navItem, page === id && styles.navItemActive]}
              >
                <Ionicons
                  name={icon}
                  size={20}
                  color={page === id ? C.green : "#819089"}
                />
                <Text
                  style={[
                    styles.navLabel,
                    page === id && styles.navLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.carMini}>
            <View style={styles.carMiniIcon}>
              <VehicleGlyph vehicle={car} size={24} color={C.green} />
            </View>
            <Text style={styles.carMiniName}>
              {car.make} {car.model}
            </Text>
            <Text style={styles.carMiniReg}>{car.registration}</Text>
          </View>
        </View>
      )}
      <View style={[styles.main, darkMode && styles.mainDark]}>
        <View
          style={[
            styles.topbar,
            !isDesktop && styles.topbarMobile,
            darkMode && styles.topbarDark,
          ]}
        >
          {isDesktop ? (
            <>
              <Text style={styles.pageEyebrow}>MY GARAGE</Text>
              <View style={styles.topActions}>
                <Button
                  onPress={onCycleVehicle}
                  customIcon={
                    <VehicleGlyph
                      vehicle={car}
                      size={18}
                      color={C.green}
                      outlined
                    />
                  }
                  secondary
                  small
                >
                  {vehicleScope}
                </Button>
                <Button onPress={onAdd} icon="add" small>
                  Add entry
                </Button>
                <IconButton
                  icon={darkMode ? "sunny-outline" : "moon-outline"}
                  onPress={onToggleDarkMode}
                />
                <View style={styles.notificationButtonWrap}>
                  <IconButton
                    icon="notifications-outline"
                    onPress={onNotifications}
                  />
                  {notificationUnread && (
                    <View style={styles.notificationUnreadDot} />
                  )}
                </View>
                <IconButton icon="log-out-outline" onPress={onSignOut} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.mobileHeaderRow}>
                <View style={styles.mobileBrandLockup}>
                  <View style={styles.mobileBrandMark}>
                    <Ionicons name="speedometer" size={19} color="#20262E" />
                  </View>
                  <View>
                    <Text style={styles.mobileBrand}>motorly</Text>
                    <Text style={styles.pageEyebrow}>MY GARAGE</Text>
                  </View>
                </View>
                <View style={styles.mobileIconActions}>
                  <IconButton
                    icon={darkMode ? "sunny-outline" : "moon-outline"}
                    onPress={onToggleDarkMode}
                    compact
                  />
                  <View style={styles.notificationButtonWrap}>
                    <IconButton
                      icon="notifications-outline"
                      onPress={onNotifications}
                      compact
                    />
                    {notificationUnread && (
                      <View style={styles.notificationUnreadDot} />
                    )}
                  </View>
                  <IconButton
                    icon="log-out-outline"
                    onPress={onSignOut}
                    compact
                  />
                </View>
              </View>
              <View style={styles.mobilePrimaryActions}>
                <TouchableOpacity
                  onPress={onCycleVehicle}
                  style={styles.mobileVehicleSelector}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch vehicle. Currently showing ${vehicleScope}`}
                >
                  <VehicleGlyph
                    vehicle={car}
                    size={18}
                    color={C.green}
                    outlined
                  />
                  <Text
                    numberOfLines={1}
                    style={styles.mobileVehicleSelectorText}
                  >
                    {vehicleScope}
                  </Text>
                  <View style={styles.mobileVehicleSwitchCue}>
                    <Ionicons
                      name="swap-horizontal"
                      size={17}
                      color={C.green}
                    />
                    <Text style={styles.mobileVehicleSwitchText}>Switch</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onAdd}
                  style={styles.mobileAddButton}
                >
                  <Ionicons name="add" size={20} color={C.onAccent} />
                  <Text style={styles.mobileAddButtonText}>Add entry</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
        {children}
        {!isDesktop && (
          <View style={[styles.bottomNav, darkMode && styles.bottomNavDark]}>
            {NAV.map(([id, label, icon]) => (
              <TouchableOpacity
                key={id}
                onPress={() => setPage(id)}
                style={styles.bottomItem}
              >
                <Ionicons
                  name={page === id ? icon.replace("-outline", "") : icon}
                  size={21}
                  color={page === id ? C.green : "#829089"}
                />
                <Text
                  style={[
                    styles.bottomLabel,
                    page === id && { color: C.green, fontWeight: "700" },
                  ]}
                >
                  {label === "Calculators" ? "Calc" : label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function Overview({
  data,
  isDesktop,
  setPage,
  openAdd,
  allVehicles,
  vehicleCount,
}) {
  const [showInsights, setShowInsights] = useState(false);
  const stats = useMemo(() => computeStats(data), [data]);
  const trend = mileageSeries(data.fuel).slice(-6);
  const maxMileage = Math.max(16, ...trend.map((x) => x.value));
  const all = [
    ...data.fuel.map((x) => ({ ...x, kind: "Fuel" })),
    ...data.expenses.map((x) => ({ ...x, kind: x.category })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.hero, !isDesktop && styles.heroMobile]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroKicker}>
            {deviceGreeting().toUpperCase()},{" "}
            {data.owner.name.split(" ")[0].toUpperCase()}
          </Text>
          <Text style={[styles.heroTitle, !isDesktop && { fontSize: 30 }]}>
            {allVehicles
              ? "Your garage, in a nutshell."
              : data.car.type === "motorbike"
                ? "Your motorbike, in a nutshell."
                : "Your car, in a nutshell."}
          </Text>
          <Text style={styles.heroText}>
            Every fill-up and expense, organized into a clearer view of
            ownership.
          </Text>
        </View>
        <View style={[styles.heroCar, !isDesktop && styles.heroCarMobile]}>
          <View style={styles.heroCarIcon}>
            <VehicleGlyph vehicle={data.car} size={35} color={C.lime} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroCarName}>
              {allVehicles
                ? "All vehicles"
                : `${data.car.make} ${data.car.model}`.trim() ||
                  (data.car.type === "motorbike"
                    ? "Your motorbike"
                    : "Your car")}
            </Text>
            <Text numberOfLines={2} style={styles.heroCarSub}>
              {allVehicles
                ? `${vehicleCount} vehicles · combined analytics`
                : [data.car.year, data.car.fuelType, data.car.registration]
                    .filter(Boolean)
                    .join(" · ") || "Add vehicle details in Garage"}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.metricsRow}>
        <Metric
          icon="speedometer-outline"
          label="Average mileage"
          value={stats.avgMileage ? `${number(stats.avgMileage)} km/L` : "—"}
          detail="Across recorded fill-ups"
        />
        <Metric
          icon="wallet-outline"
          label="Total spent"
          value={money(stats.totalSpend)}
          detail={`${money(stats.monthSpend)} this month`}
          tone={C.orange}
        />
        <Metric
          icon="calendar-outline"
          label="Cost per km"
          value={
            stats.distance
              ? `${money(stats.totalSpend / stats.distance)}/km`
              : "—"
          }
          detail="Fuel + ownership costs"
          tone="#846B96"
        />
      </View>
      <TouchableOpacity
        onPress={() => setShowInsights((current) => !current)}
        style={styles.overviewInsightsToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: showInsights }}
      >
        <View style={styles.overviewInsightsToggleCopy}>
          <Ionicons name="analytics-outline" size={20} color={C.green} />
          <View>
            <Text style={styles.overviewInsightsToggleTitle}>
              {showInsights ? "Hide insights" : "More insights"}
            </Text>
            <Text style={styles.overviewInsightsToggleText}>
              Distance, mileage trends and recent activity
            </Text>
          </View>
        </View>
        <Ionicons
          name={showInsights ? "chevron-up" : "chevron-down"}
          size={20}
          color={C.green}
        />
      </TouchableOpacity>
      {showInsights && (
        <>
          <View style={styles.metricsRow}>
            <Metric
              icon="navigate-outline"
              label="Distance tracked"
              value={`${number(stats.distance, 0)} km`}
              detail={`${data.fuel.length} fuel entries`}
              tone={C.blue}
            />
          </View>
          <View
            style={[styles.twoCol, !isDesktop && { flexDirection: "column" }]}
          >
            <Card style={isDesktop ? { flex: 1.45 } : undefined}>
              <SectionTitle
                title="Mileage trend"
                subtitle="Fuel efficiency over recent fill-ups"
                action="Fuel log"
                onAction={() => setPage("logs")}
              />
              {trend.length ? (
                <View style={styles.chart}>
                  <View style={styles.chartGuide}>
                    <Text style={styles.chartAxis}>
                      {number(maxMileage)} km/L
                    </Text>
                    <View style={styles.guideLine} />
                  </View>
                  <View style={styles.bars}>
                    {trend.map((x, i) => (
                      <View key={x.id} style={styles.barSlot}>
                        <Text style={styles.barValue}>{number(x.value)}</Text>
                        <View
                          style={[
                            styles.bar,
                            {
                              height: Math.max(
                                24,
                                (x.value / maxMileage) * 130,
                              ),
                              backgroundColor:
                                i === trend.length - 1 ? C.lime : C.green,
                            },
                          ]}
                        />
                        <Text style={styles.barLabel}>{shortDate(x.date)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <Empty
                  icon="analytics-outline"
                  title="Your trend starts here"
                  text="Add two fuel fill-ups to calculate your first mileage result."
                />
              )}
            </Card>
            <Card style={isDesktop ? { flex: 1 } : undefined}>
              <SectionTitle
                title="Smart snapshot"
                subtitle="Based on your records"
              />
              <View style={styles.insight}>
                <View style={[styles.insightIcon, { backgroundColor: C.mint }]}>
                  <Ionicons name="leaf-outline" size={20} color={C.green} />
                </View>
                <View style={styles.recentEmptyCopy}>
                  <Text style={styles.insightTitle}>
                    {stats.avgMileage >= 12
                      ? "Efficiency looks healthy"
                      : "Build your baseline"}
                  </Text>
                  <Text style={styles.insightText}>
                    {stats.avgMileage
                      ? `Your average is ${number(stats.avgMileage)} km/L. The latest fill-up was ${number(stats.latestMileage)} km/L.`
                      : "Add another full-tank entry to unlock mileage insights."}
                  </Text>
                </View>
              </View>
              <View style={styles.insight}>
                <View
                  style={[styles.insightIcon, { backgroundColor: "#FBE9D8" }]}
                >
                  <Ionicons
                    name="construct-outline"
                    size={20}
                    color={C.orange}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.insightTitle}>Next service estimate</Text>
                  <Text style={styles.insightText}>
                    {stats.latestOdo
                      ? `At ${number(stats.latestOdo + 5000, 0)} km, about ${number(5000, 0)} km from your latest reading.`
                      : "Add your dashboard reading to start tracking."}
                  </Text>
                </View>
              </View>
              <Button onPress={() => openAdd("fuel")} icon="water-outline">
                Record a fill-up
              </Button>
            </Card>
          </View>
          <Card>
            <SectionTitle
              title="Recent activity"
              subtitle="Your latest fuel and ownership records"
              action="See expenses"
              onAction={() => setPage("logs")}
            />
            {!all.length && (
              <View style={styles.recentEmpty}>
                <View style={styles.recentEmptyIcon}>
                  <Ionicons name="sparkles-outline" size={20} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentEmptyTitle}>No activity yet</Text>
                  <Text style={styles.recentEmptyText}>
                    Add a fill-up or expense and it will appear here.
                  </Text>
                </View>
              </View>
            )}
            {all.map((item, i) => (
              <ActivityRow
                key={item.id}
                item={item}
                last={i === all.length - 1}
              />
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function ActivityRow({ item, last }) {
  const fuel = item.kind === "Fuel";
  return (
    <View style={[styles.activityRow, last && { borderBottomWidth: 0 }]}>
      <View
        style={[
          styles.activityIcon,
          { backgroundColor: fuel ? C.mint : "#FBE9D8" },
        ]}
      >
        <Ionicons
          name={fuel ? "water-outline" : "receipt-outline"}
          size={20}
          color={fuel ? C.green : C.orange}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowBetween}>
          <Text style={styles.activityTitle}>
            {fuel
              ? `${number(item.liters)} L at ${item.station || "fuel station"}`
              : item.description}
          </Text>
          <Text style={styles.activityAmount}>{money(item.amount)}</Text>
        </View>
        <Text style={styles.activityMeta}>
          {shortDate(item.date)} · {number(item.odometer, 0)} km · {item.kind}
        </Text>
      </View>
    </View>
  );
}

function EntryImage({ storagePath, legacyUri, label = "Entry image" }) {
  const [imageUrl, setImageUrl] = useState(
    legacyUri && !legacyUri.startsWith("blob:") ? legacyUri : "",
  );
  const [viewerOpen, setViewerOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!storagePath) return undefined;

    supabase.storage
      .from("entry-images")
      .createSignedUrl(storagePath, 3600)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data?.signedUrl) {
          setImageFailed(true);
          return;
        }
        setImageUrl(data.signedUrl);
        setImageFailed(false);
      });

    return () => {
      active = false;
    };
  }, [storagePath]);

  if (!imageUrl || imageFailed) {
    return (
      <View style={styles.thumbUnavailable}>
        <Ionicons name="image-outline" size={18} color={C.muted} />
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setViewerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label}`}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.thumb}
          onError={() => setImageFailed(true)}
        />
      </TouchableOpacity>
      <Modal
        visible={viewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerOpen(false)}
      >
        <View style={styles.imageViewerBackdrop}>
          <Image
            source={{ uri: imageUrl }}
            style={styles.imageViewerImage}
            resizeMode="contain"
          />
          <TouchableOpacity
            onPress={() => setViewerOpen(false)}
            style={styles.imageViewerClose}
            accessibilityRole="button"
            accessibilityLabel="Close image"
          >
            <Ionicons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.imageViewerLabel}>{label}</Text>
        </View>
      </Modal>
    </>
  );
}

function LogsScreen({ data, openAdd, remove }) {
  const [logTab, setLogTab] = useState("fuel");

  return (
    <View style={styles.logsScreen}>
      <View style={styles.logsHeader}>
        <View style={styles.logsTitleRow}>
          <View>
            <Text style={styles.logsTitle}>Logs</Text>
            <Text style={styles.logsSubtitle}>
              Fuel, service and ownership records.
            </Text>
          </View>

          <Button
            onPress={() => openAdd(logTab === "fuel" ? "fuel" : "expense")}
            icon="add"
            small
          >
            {logTab === "fuel" ? "Add fill-up" : "Add expense"}
          </Button>
        </View>

        <View style={styles.logsTabs}>
          {[
            ["fuel", "Fuel"],
            ["expenses", "Expenses"],
          ].map(([id, label]) => {
            const active = logTab === id;

            return (
              <TouchableOpacity
                key={id}
                onPress={() => setLogTab(id)}
                style={[styles.logsTab, active && styles.logsTabActive]}
              >
                <Text
                  style={[
                    styles.logsTabText,
                    active && styles.logsTabTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {logTab === "fuel" ? (
        <FuelLog data={data} openAdd={openAdd} remove={remove} embedded />
      ) : (
        <Expenses data={data} openAdd={openAdd} remove={remove} embedded />
      )}
    </View>
  );
}

function FuelLog({ data, openAdd, remove, embedded = false }) {
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const series = mileageSeries(data.fuel);
  const sorted = [...data.fuel].sort((a, b) => b.odometer - a.odometer);
  const map = Object.fromEntries(series.map((x) => [x.id, x.value]));
  const stats = computeStats(data);
  return (
    <ScrollView
      style={embedded ? styles.logsScroll : undefined}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {!embedded && (
        <PageIntro
          eyebrow="FUEL TRACKER"
          title="Every fill-up tells a story."
          text="Record a full tank and dashboard reading. Motorly calculates the distance and mileage automatically."
          action="Add fill-up"
          onAction={() => openAdd("fuel")}
        />
      )}
      <View style={styles.metricsRow}>
        <Metric
          icon="speedometer-outline"
          label="Average mileage"
          value={stats.avgMileage ? `${number(stats.avgMileage)} km/L` : "—"}
        />
        <Metric
          icon="cash-outline"
          label="Fuel spend"
          value={money(stats.fuelSpend)}
          tone={C.orange}
        />
      </View>
      <Card>
        <SectionTitle
          title="Fill-up history"
          subtitle="Mileage uses the distance since the previous reading ÷ litres filled"
        />
        {!sorted.length && (
          <Empty
            icon="water-outline"
            title="No fuel entries yet"
            text="Upload a fuel receipt or enter your first fill-up manually."
          />
        )}
        {sorted.map((item, i) => (
          <View
            key={item.id}
            style={[
              styles.logRow,
              compact && styles.logRowMobile,
              i === sorted.length - 1 && { borderBottomWidth: 0 },
            ]}
          >
            <View style={styles.dateBlock}>
              <Text style={styles.dateDay}>
                {new Date(`${item.date}T00:00:00`).getDate()}
              </Text>
              <Text style={styles.dateMonth}>
                {new Date(`${item.date}T00:00:00`)
                  .toLocaleDateString("en-IN", { month: "short" })
                  .toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <Text style={styles.logTitle}>
                {item.station || "Fuel station"}
              </Text>
              <Text style={styles.logMeta}>
                {number(item.odometer, 0)} km · {number(item.liters)} L{" "}
                {item.note ? `· ${item.note}` : ""}
              </Text>
            </View>
            <View
              style={[styles.logFigures, compact && styles.logFiguresMobile]}
            >
              <Text style={styles.logAmount}>{money(item.amount)}</Text>
              <Text style={styles.logMileage}>
                {map[item.id] ? `${number(map[item.id])} km/L` : "Baseline"}
              </Text>
            </View>
            {(item.photoPath || item.photo) && (
              <EntryImage
                storagePath={item.photoPath}
                legacyUri={item.photo}
                label="Fuel receipt"
              />
            )}
            {item.odometerPhotoPath && (
              <EntryImage
                storagePath={item.odometerPhotoPath}
                label="Dashboard photo"
              />
            )}
            <IconButton
              icon="trash-outline"
              onPress={() => remove("fuel", item.id)}
            />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function Expenses({ data, openAdd, remove, embedded = false }) {
  const { width } = useWindowDimensions();
  const compact = width < 800;
  const sorted = [...data.expenses].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const categoryTotals = sorted.reduce(
    (a, x) => ({ ...a, [x.category]: (a[x.category] || 0) + Number(x.amount) }),
    {},
  );
  const max = Math.max(1, ...Object.values(categoryTotals));
  return (
    <ScrollView
      style={embedded ? styles.logsScroll : undefined}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {!embedded && (
        <PageIntro
          eyebrow="COST OF OWNERSHIP"
          title="Know where the money goes."
          text="Keep service bills, insurance, repairs, parking, tolls, and every other car expense together."
          action="Add expense"
          onAction={() => openAdd("expense")}
        />
      )}
      <View>
        <Card>
          <SectionTitle
            title="Expense breakdown"
            subtitle="All recorded non-fuel costs"
          />
          {Object.keys(categoryTotals).length ? (
            Object.entries(categoryTotals)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, total], i) => (
                <View key={cat} style={styles.progressRow}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.progressLabel}>{cat}</Text>
                    <Text style={styles.progressAmount}>{money(total)}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(8, (total / max) * 100)}%`,
                          backgroundColor:
                            CHART_COLORS[i % CHART_COLORS.length],
                        },
                      ]}
                    />
                  </View>
                </View>
              ))
          ) : (
            <Empty
              icon="receipt-outline"
              title="No expenses yet"
              text="Add a service bill or car expense to see a breakdown."
            />
          )}
        </Card>
      </View>
      <Card>
        <SectionTitle
          title="Expense history"
          subtitle="Service, maintenance, and ownership records"
        />
        {!sorted.length && (
          <Empty
            icon="wallet-outline"
            title="Nothing recorded"
            text="Add an expense manually or attach a bill."
          />
        )}
        {sorted.map((item, i) => (
          <View
            key={item.id}
            style={[
              styles.logRow,
              compact && styles.logRowMobile,
              i === sorted.length - 1 && { borderBottomWidth: 0 },
            ]}
          >
            <View style={[styles.activityIcon, { backgroundColor: "#FBE9D8" }]}>
              <Ionicons name="construct-outline" size={20} color={C.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Text style={styles.logTitle}>{item.description}</Text>
                <Pill tone="orange">{item.category}</Pill>
              </View>
              <Text style={styles.logMeta}>
                {shortDate(item.date)} · {item.workshop || "No vendor"} ·{" "}
                {number(item.odometer, 0)} km
              </Text>
            </View>
            <Text style={styles.logAmount}>{money(item.amount)}</Text>
            {(item.photoPath || item.photo) && (
              <EntryImage
                storagePath={item.photoPath}
                legacyUri={item.photo}
                label="Expense receipt"
              />
            )}
            <IconButton
              icon="trash-outline"
              onPress={() => remove("expenses", item.id)}
            />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY;

async function geocodeIndianPlace(place) {
  const params = new URLSearchParams({
    api_key: ORS_API_KEY,
    text: place,
    "boundary.country": "IN",
    size: "1",
  });
  const response = await fetch(
    `https://api.openrouteservice.org/geocode/search?${params.toString()}`,
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Place search failed.");
  }

  const match = payload?.features?.[0];
  if (!match) throw new Error(`Could not find “${place}” in India.`);

  return {
    coordinates: match.geometry.coordinates,
    label: match.properties?.label || place,
  };
}

async function autocompleteIndianPlaces(text) {
  const params = new URLSearchParams({
    api_key: ORS_API_KEY,
    text,
    "boundary.country": "IN",
    size: "6",
  });
  const response = await fetch(
    `https://api.openrouteservice.org/geocode/autocomplete?${params.toString()}`,
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Place suggestions failed.");
  }

  return (payload?.features || []).map((feature) => ({
    id:
      feature.properties?.id ||
      `${feature.geometry.coordinates.join(",")}-${feature.properties?.label}`,
    coordinates: feature.geometry.coordinates,
    label: feature.properties?.label || feature.properties?.name || text,
    detail: [
      feature.properties?.locality,
      feature.properties?.county,
      feature.properties?.region,
    ]
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(", "),
  }));
}

async function getDrivingRoute(start, end) {
  const params = new URLSearchParams({
    api_key: ORS_API_KEY,
    start: start.join(","),
    end: end.join(","),
  });
  const response = await fetch(
    `https://api.openrouteservice.org/v2/directions/driving-car?${params.toString()}`,
  );
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Route calculation failed.");
  }

  const feature = payload?.features?.[0];
  const summary = feature?.properties?.summary;
  if (!summary) throw new Error("No drivable route was found.");
  return {
    summary,
    coordinates: feature.geometry?.coordinates || [],
  };
}

function routeDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return hours ? `${hours} hr ${remaining} min` : `${remaining} min`;
}

function communityRouteKey(start, end) {
  const token = ([longitude, latitude]) =>
    `${Number(latitude).toFixed(2)},${Number(longitude).toFixed(2)}`;
  return [token(start), token(end)].sort().join("|");
}

function useIndianPlaceSuggestions(query, selectedPlace) {
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  useEffect(() => {
    const cleanQuery = query.trim();

    if (
      !ORS_API_KEY ||
      cleanQuery.length < 3 ||
      selectedPlace?.label === query
    ) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(() => {
      setLoadingSuggestions(true);
      autocompleteIndianPlaces(cleanQuery)
        .then((results) => {
          if (active) setSuggestions(results);
        })
        .catch(() => {
          if (active) setSuggestions([]);
        })
        .finally(() => {
          if (active) setLoadingSuggestions(false);
        });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, selectedPlace?.label]);

  return { suggestions, loadingSuggestions, setSuggestions };
}

function RoutePlaceField({
  label,
  value,
  placeholder,
  suggestions,
  loadingSuggestions,
  onChangeText,
  onSelect,
}) {
  return (
    <View style={styles.routePlaceField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.routePlaceInputWrap}>
        <Ionicons name="location-outline" size={18} color={C.green} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8A949F"
          autoCorrect={false}
          style={styles.routePlaceInput}
        />
        {loadingSuggestions && (
          <ActivityIndicator size="small" color={C.green} />
        )}
      </View>
      {!!suggestions.length && (
        <View style={styles.routeSuggestions}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.id}
              onPress={() => onSelect(suggestion)}
              style={styles.routeSuggestion}
            >
              <View style={styles.routeSuggestionIcon}>
                <Ionicons name="pin" size={15} color={C.green} />
              </View>
              <View style={styles.routeSuggestionCopy}>
                <Text style={styles.routeSuggestionLabel} numberOfLines={2}>
                  {suggestion.label}
                </Text>
                {!!suggestion.detail && (
                  <Text style={styles.routeSuggestionDetail} numberOfLines={1}>
                    {suggestion.detail}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const SAMPLE_ROUTE = [
  [88.3639, 22.5726],
  [88.376, 22.49],
  [88.345, 22.39],
  [88.21, 22.3],
  [88.08, 22.22],
  [88.03, 22.12],
  [88.058, 22.0667],
];

function RouteMapPreview({ coordinates, preview, style }) {
  const width = 500;
  const height = 500;
  const padding = 52;
  const usableCoordinates =
    coordinates?.length > 1 ? coordinates : SAMPLE_ROUTE;
  const interval = Math.max(1, Math.ceil(usableCoordinates.length / 180));
  const sampled = usableCoordinates.filter(
    (_, index) =>
      index % interval === 0 || index === usableCoordinates.length - 1,
  );
  const longitudes = sampled.map(([longitude]) => longitude);
  const latitudes = sampled.map(([, latitude]) => latitude);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const longitudeRange = Math.max(maxLongitude - minLongitude, 0.001);
  const latitudeRange = Math.max(maxLatitude - minLatitude, 0.001);
  const scale = Math.min(
    (width - padding * 2) / longitudeRange,
    (height - padding * 2) / latitudeRange,
  );
  const routeWidth = longitudeRange * scale;
  const routeHeight = latitudeRange * scale;
  const offsetX = (width - routeWidth) / 2;
  const offsetY = (height - routeHeight) / 2;
  const points = sampled.map(([longitude, latitude]) => ({
    x: offsetX + (longitude - minLongitude) * scale,
    y: height - (offsetY + (latitude - minLatitude) * scale),
  }));
  const routePath = points
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
  const start = points[0];
  const end = points[points.length - 1];

  return (
    <View style={[styles.routeMapPreview, style]}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Rect width={width} height={height} rx="16" fill="#263B4F" />
        <Path
          d="M -20 385 C 70 335, 145 365, 220 420 S 390 505, 535 435 L 535 540 L -20 540 Z"
          fill="#31576B"
          opacity="0.55"
        />
        <Rect
          x="34"
          y="54"
          width="112"
          height="70"
          rx="12"
          fill="#344F5D"
          opacity="0.72"
        />
        <Rect
          x="171"
          y="38"
          width="76"
          height="105"
          rx="11"
          fill="#344F5D"
          opacity="0.58"
        />
        <Rect
          x="365"
          y="62"
          width="96"
          height="92"
          rx="13"
          fill="#344F5D"
          opacity="0.66"
        />
        <Rect
          x="48"
          y="262"
          width="102"
          height="82"
          rx="12"
          fill="#344F5D"
          opacity="0.54"
        />
        <Rect
          x="349"
          y="260"
          width="112"
          height="78"
          rx="12"
          fill="#344F5D"
          opacity="0.62"
        />
        <Rect
          x="58"
          y="405"
          width="90"
          height="50"
          rx="12"
          fill="#3D5C52"
          opacity="0.82"
        />
        <Path
          d="M -30 92 C 72 25, 170 118, 272 72 S 420 35, 540 92"
          stroke="#91A8BA"
          strokeWidth="5"
          opacity="0.24"
          fill="none"
        />
        <Path
          d="M -24 222 C 96 160, 172 252, 282 205 S 418 156, 535 214"
          stroke="#91A8BA"
          strokeWidth="4"
          opacity="0.2"
          fill="none"
        />
        <Path
          d="M 18 342 C 112 292, 216 350, 305 312 S 416 283, 516 324"
          stroke="#91A8BA"
          strokeWidth="3"
          opacity="0.18"
          fill="none"
        />
        <Line
          x1="114"
          y1="-20"
          x2="168"
          y2="515"
          stroke="#91A8BA"
          strokeWidth="4"
          opacity="0.18"
        />
        <Line
          x1="310"
          y1="-20"
          x2="270"
          y2="520"
          stroke="#91A8BA"
          strokeWidth="3"
          opacity="0.15"
        />
        <Line
          x1="452"
          y1="-20"
          x2="386"
          y2="520"
          stroke="#91A8BA"
          strokeWidth="4"
          opacity="0.17"
        />
        <Path
          d="M 6 458 C 105 416, 224 472, 330 431 S 442 398, 520 423"
          stroke="#A7BBC9"
          strokeWidth="2"
          opacity="0.16"
          strokeDasharray="8 10"
          fill="none"
        />
        <Circle cx="73" cy="177" r="5" fill="#8FAFD0" opacity="0.72" />
        <Circle cx="420" cy="190" r="5" fill="#8FAFD0" opacity="0.72" />
        <Circle cx="193" cy="396" r="5" fill="#8FAFD0" opacity="0.65" />
        <Circle cx="452" cy="370" r="5" fill="#8FAFD0" opacity="0.65" />
        <Path
          d={routePath}
          stroke="#101820"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.42"
          fill="none"
        />
        <Path
          d={routePath}
          stroke="#D8E65A"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Circle cx={start.x} cy={start.y} r="10" fill="#F6F8FA" />
        <Circle cx={start.x} cy={start.y} r="4" fill="#456B8C" />
        <Circle cx={end.x} cy={end.y} r="11" fill="#D8E65A" />
        <Circle cx={end.x} cy={end.y} r="4" fill="#202A36" />
      </Svg>
      <View style={styles.routeMapBadge}>
        <Ionicons name="navigate" size={12} color="#202A36" />
        <Text style={styles.routeMapBadgeText}>
          {preview ? "ROUTE PREVIEW" : "LIVE ROUTE SHAPE"}
        </Text>
      </View>
    </View>
  );
}

function Calculators({ vehicle, recordedMileage, userId }) {
  const { width } = useWindowDimensions();
  const compact = width < 800;
  const [routeForm, setRouteForm] = useState({
    from: "",
    to: "",
    fuelPrice: "",
    manualToll: "",
  });
  const [selectedPlaces, setSelectedPlaces] = useState({
    from: null,
    to: null,
  });
  const fromPlaceSearch = useIndianPlaceSuggestions(
    routeForm.from,
    selectedPlaces.from,
  );
  const toPlaceSearch = useIndianPlaceSuggestions(
    routeForm.to,
    selectedPlaces.to,
  );
  const [tollMode, setTollMode] = useState("community");
  const [routeResult, setRouteResult] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [actualToll, setActualToll] = useState("");
  const [tollReportStatus, setTollReportStatus] = useState("");
  const [tollReporting, setTollReporting] = useState(false);

  const loadCommunityToll = async (routeKey) => {
    const { data: reports, error } = await supabase
      .from("community_toll_reports")
      .select("toll_amount")
      .eq("route_key", routeKey)
      .limit(100);

    if (error) return { amount: 0, count: 0, available: false };
    const amounts = (reports || [])
      .map((report) => Number(report.toll_amount))
      .filter((amount) => Number.isFinite(amount) && amount >= 0);
    return {
      amount: amounts.length
        ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
        : 0,
      count: amounts.length,
      available: true,
    };
  };

  const calculateRoute = async () => {
    setRouteError("");
    setRouteResult(null);

    if (!ORS_API_KEY) {
      setRouteError(
        "Routing key is missing. Add EXPO_PUBLIC_ORS_API_KEY to .env.local and restart Expo.",
      );
      return;
    }
    if (!routeForm.from.trim() || !routeForm.to.trim()) {
      setRouteError("Enter both the starting point and destination.");
      return;
    }
    if (!(recordedMileage > 0)) {
      setRouteError(
        "Motorly needs at least two fuel-log entries for this vehicle to calculate its mileage.",
      );
      return;
    }
    if (!(Number(routeForm.fuelPrice) > 0)) {
      setRouteError("Enter the current fuel price.");
      return;
    }

    setRouteLoading(true);
    try {
      const [start, end] = await Promise.all([
        selectedPlaces.from || geocodeIndianPlace(routeForm.from.trim()),
        selectedPlaces.to || geocodeIndianPlace(routeForm.to.trim()),
      ]);
      const route = await getDrivingRoute(start.coordinates, end.coordinates);
      const summary = route.summary;
      const distance = summary.distance / 1000;
      const duration = summary.duration / 60;
      const fuelNeeded = distance / recordedMileage;
      const fuelCost = fuelNeeded * Number(routeForm.fuelPrice);
      const routeKey = communityRouteKey(start.coordinates, end.coordinates);
      const community =
        tollMode === "community"
          ? await loadCommunityToll(routeKey)
          : { amount: 0, count: 0, available: true };
      const toll =
        tollMode === "community"
          ? community.amount
          : Math.max(0, Number(routeForm.manualToll) || 0);

      setRouteResult({
        from: start.label,
        to: end.label,
        startCoordinates: start.coordinates,
        endCoordinates: end.coordinates,
        routeCoordinates: route.coordinates,
        routeKey,
        distance,
        duration,
        fuelNeeded,
        fuelCost,
        toll,
        total: fuelCost + toll,
        tollMode,
        communityCount: community.count,
        communityAvailable: community.available,
      });
      setActualToll("");
      setTollReportStatus("");
    } catch (error) {
      setRouteError(error.message || "Unable to calculate this route.");
    } finally {
      setRouteLoading(false);
    }
  };

  const openRouteMap = () => {
    if (!routeResult) return;
    const url =
      "https://www.google.com/maps/dir/?api=1" +
      `&origin=${encodeURIComponent(routeResult.from)}` +
      `&destination=${encodeURIComponent(routeResult.to)}` +
      "&travelmode=driving";
    Linking.openURL(url).catch(() =>
      setRouteError("Could not open the route map."),
    );
  };

  const shareActualToll = async () => {
    const amount = Number(actualToll);
    if (!routeResult || !userId) return;
    if (actualToll.trim() === "" || !Number.isFinite(amount) || amount < 0) {
      setTollReportStatus("Enter the actual toll paid, including ₹0.");
      return;
    }

    setTollReporting(true);
    setTollReportStatus("");
    const { error } = await supabase.from("community_toll_reports").upsert(
      {
        user_id: userId,
        route_key: routeResult.routeKey,
        distance_km: Number(routeResult.distance.toFixed(2)),
        toll_amount: amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,route_key" },
    );

    if (error) {
      setTollReportStatus(
        error.code === "42P01"
          ? "Create the community toll table in Supabase first."
          : error.message || "Could not share this toll report.",
      );
    } else {
      setTollReportStatus("Thanks—your toll report now helps other drivers.");
      const community = await loadCommunityToll(routeResult.routeKey);
      if (routeResult.tollMode === "community") {
        setRouteResult((current) => ({
          ...current,
          toll: community.amount,
          total: current.fuelCost + community.amount,
          communityCount: community.count,
          communityAvailable: community.available,
        }));
      }
    }
    setTollReporting(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.calculatorPage}>
        <View
          style={[
            styles.calculatorSection,
            compact && styles.journeySectionMobile,
          ]}
        >
          <View style={[styles.routeIntro, compact && styles.routeIntroMobile]}>
            <Text style={styles.routeEyebrow}>FREE ROAD ROUTING</Text>
            <Text style={styles.routeTitle}>Plan a real journey.</Text>
            <Text style={styles.routeText}>
              Search Indian locations, calculate road distance and time, then
              estimate fuel using your vehicle’s mileage.
            </Text>
          </View>
          {compact && (
            <RouteMapPreview
              coordinates={routeResult?.routeCoordinates}
              preview={!routeResult}
              style={styles.routeMapTopMobile}
            />
          )}
          <View
            style={[
              styles.calcWrap,
              (compact || Platform.OS !== "web") && { flexDirection: "column" },
            ]}
          >
            <Card style={compact ? styles.journeyFormMobile : { flex: 1.3 }}>
              <SectionTitle
                title="Route and fuel calculator"
                subtitle="Powered by openrouteservice and OpenStreetMap"
              />
              <RoutePlaceField
                label="Starting point"
                value={routeForm.from}
                onChangeText={(from) => {
                  setRouteForm({ ...routeForm, from });
                  setSelectedPlaces({ ...selectedPlaces, from: null });
                }}
                onSelect={(place) => {
                  setRouteForm({ ...routeForm, from: place.label });
                  setSelectedPlaces({ ...selectedPlaces, from: place });
                  fromPlaceSearch.setSuggestions([]);
                }}
                suggestions={fromPlaceSearch.suggestions}
                loadingSuggestions={fromPlaceSearch.loadingSuggestions}
                placeholder="Type an address, landmark or locality"
              />
              <RoutePlaceField
                label="Destination"
                value={routeForm.to}
                onChangeText={(to) => {
                  setRouteForm({ ...routeForm, to });
                  setSelectedPlaces({ ...selectedPlaces, to: null });
                }}
                onSelect={(place) => {
                  setRouteForm({ ...routeForm, to: place.label });
                  setSelectedPlaces({ ...selectedPlaces, to: place });
                  toPlaceSearch.setSuggestions([]);
                }}
                suggestions={toPlaceSearch.suggestions}
                loadingSuggestions={toPlaceSearch.loadingSuggestions}
                placeholder="Type an address, landmark or locality"
              />
              <View
                style={[
                  styles.formRow,
                  compact && { flexDirection: "column", gap: 0 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.routeMileageField}>
                    <Text style={styles.fieldLabel}>Fuel-log mileage</Text>
                    <View style={styles.routeMileageInput}>
                      <Text style={styles.routeMileageValue}>
                        {recordedMileage > 0
                          ? `${number(recordedMileage)} km/L`
                          : "— km/L"}
                      </Text>
                      <Ionicons
                        name="lock-closed-outline"
                        size={15}
                        color={C.muted}
                      />
                    </View>
                    <Text style={styles.routeMileageHint}>
                      {recordedMileage > 0
                        ? "Calculated automatically from this vehicle"
                        : "Add two fill-ups to calculate automatically"}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Fuel price (₹/L)"
                    value={routeForm.fuelPrice}
                    onChangeText={(fuelPrice) =>
                      setRouteForm({ ...routeForm, fuelPrice })
                    }
                    numeric
                  />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Toll estimate</Text>
              <View style={styles.tollModeRow}>
                {[
                  [
                    "community",
                    compact ? "Community toll" : "Community average",
                    "people-outline",
                  ],
                  [
                    "manual",
                    compact ? "Known toll" : "Enter known toll",
                    "create-outline",
                  ],
                ].map(([id, label, icon]) => (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setTollMode(id)}
                    style={[
                      styles.tollModeOption,
                      tollMode === id && styles.tollModeOptionActive,
                    ]}
                  >
                    <Ionicons
                      name={icon}
                      size={17}
                      color={tollMode === id ? C.onAccent : C.green}
                    />
                    <Text
                      style={[
                        styles.tollModeText,
                        tollMode === id && styles.tollModeTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {tollMode === "manual" && (
                <FormField
                  label="Known toll amount (₹)"
                  value={routeForm.manualToll}
                  onChangeText={(manualToll) =>
                    setRouteForm({ ...routeForm, manualToll })
                  }
                  numeric
                  placeholder="Enter the expected total toll"
                />
              )}
              <View style={styles.routeVehicle}>
                <VehicleGlyph vehicle={vehicle} size={19} color={C.green} />
                <Text style={styles.routeVehicleText}>
                  {vehicle?.make
                    ? `Using ${vehicle.make} ${vehicle.model || ""}`
                    : "Using the selected vehicle"}
                  {recordedMileage > 0
                    ? ` · mileage calculated from its fuel log`
                    : " · add two fill-ups to calculate mileage"}
                </Text>
              </View>
              {!!routeError && (
                <View style={styles.routeError}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={19}
                    color={C.red}
                  />
                  <Text style={styles.routeErrorText}>{routeError}</Text>
                </View>
              )}
              <Button
                onPress={calculateRoute}
                icon="navigate-outline"
                disabled={routeLoading}
              >
                {routeLoading ? "Calculating route…" : "Calculate route"}
              </Button>
            </Card>
            <View
              style={[
                styles.routeResultCard,
                compact && styles.journeyResultMobile,
              ]}
            >
              {!compact && (
                <RouteMapPreview
                  coordinates={routeResult?.routeCoordinates}
                  preview={!routeResult}
                />
              )}
              {routeLoading ? (
                <>
                  <ActivityIndicator color={C.lime} size="large" />
                  <Text style={styles.routeResultHint}>
                    Finding the best driving route…
                  </Text>
                </>
              ) : routeResult ? (
                <>
                  <Text style={styles.routeResultEyebrow}>ROUTE ESTIMATE</Text>
                  <Text style={styles.routeResultTitle}>
                    {number(routeResult.distance, 0)} km
                  </Text>
                  <Text style={styles.routeResultSub}>
                    {routeDuration(routeResult.duration)} traffic-free driving
                    time
                  </Text>
                  <View style={styles.trafficFreeNotice}>
                    <Ionicons
                      name="information-circle-outline"
                      size={17}
                      color={C.orange}
                    />
                    <Text style={styles.trafficFreeNoticeText}>
                      Traffic-free estimate. Live congestion, stops, weather and
                      road delays are not included, so your actual journey may
                      take longer.
                    </Text>
                  </View>
                  <View style={styles.routeMetrics}>
                    <View style={styles.routeMetric}>
                      <Text style={styles.routeMetricLabel}>FUEL NEEDED</Text>
                      <Text style={styles.routeMetricValue}>
                        {number(routeResult.fuelNeeded)} L
                      </Text>
                    </View>
                    <View style={styles.routeMetric}>
                      <Text style={styles.routeMetricLabel}>FUEL COST</Text>
                      <Text style={styles.routeMetricValue}>
                        {money(routeResult.fuelCost)}
                      </Text>
                    </View>
                    <View style={styles.routeMetric}>
                      <Text style={styles.routeMetricLabel}>
                        {routeResult.tollMode === "community"
                          ? "COMMUNITY TOLL"
                          : "KNOWN TOLL"}
                      </Text>
                      <Text style={styles.routeMetricValue}>
                        {money(routeResult.toll)}
                      </Text>
                    </View>
                  </View>
                  {routeResult.tollMode === "community" && (
                    <Text style={styles.communityTollNote}>
                      {!routeResult.communityAvailable
                        ? "Community toll storage needs to be enabled in Supabase."
                        : routeResult.communityCount
                          ? `Average from ${routeResult.communityCount} Motorly ${
                              routeResult.communityCount === 1
                                ? "report"
                                : "reports"
                            }.`
                          : "No reports for this route yet—currently using ₹0 toll."}
                    </Text>
                  )}
                  <View style={styles.routeTotal}>
                    <Text style={styles.routeTotalLabel}>
                      ESTIMATED TRIP TOTAL
                    </Text>
                    <Text style={styles.routeTotalValue}>
                      {money(routeResult.total)}
                    </Text>
                  </View>
                  <Button onPress={openRouteMap} icon="map-outline" secondary>
                    Open route map
                  </Button>
                </>
              ) : (
                <View style={styles.routeEmptyContent}>
                  <Text style={styles.routeResultEyebrow}>
                    READY WHEN YOU ARE
                  </Text>
                  <Text style={styles.routeEmptyTitle}>
                    Your trip at a glance.
                  </Text>
                  <Text style={styles.routeResultHint}>
                    Enter your journey details and Motorly will turn the route
                    into a clear cost breakdown.
                  </Text>
                  <View style={styles.routeFeatureRow}>
                    {[
                      ["navigate-outline", "Distance"],
                      ["water-outline", "Fuel"],
                      ["cash-outline", "Toll"],
                    ].map(([icon, label]) => (
                      <View key={label} style={styles.routeFeature}>
                        <Ionicons name={icon} size={15} color={C.green} />
                        <Text style={styles.routeFeatureText}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
          {!!routeResult && (
            <Card
              style={[
                styles.tollReportCard,
                compact && styles.tollReportCardMobile,
              ]}
            >
              <View
                style={compact ? { width: "100%" } : { flex: 1, minWidth: 230 }}
              >
                <SectionTitle
                  title="Share the actual toll"
                  subtitle="Your report improves this route estimate for Motorly friends and other users."
                />
                {!!tollReportStatus && (
                  <Text
                    style={[
                      styles.tollReportStatus,
                      tollReportStatus.startsWith("Thanks") && {
                        color: C.green,
                      },
                    ]}
                  >
                    {tollReportStatus}
                  </Text>
                )}
              </View>
              <View
                style={[
                  styles.tollReportAction,
                  compact && styles.tollReportActionMobile,
                ]}
              >
                <View
                  style={[
                    styles.tollReportInput,
                    compact && styles.tollReportInputMobile,
                  ]}
                >
                  <FormField
                    label="Actual toll paid (₹)"
                    value={actualToll}
                    onChangeText={setActualToll}
                    numeric
                    placeholder="0 if toll-free"
                  />
                </View>
                <Button
                  onPress={shareActualToll}
                  icon="people-outline"
                  disabled={tollReporting}
                  style={compact && styles.tollReportButtonMobile}
                >
                  {tollReporting ? "Sharing…" : "Share toll"}
                </Button>
              </View>
            </Card>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function Profile({ data, updateProfile, account, email }) {
  const { width } = useWindowDimensions();
  const compact = width < 800;
  const [owner, setOwner] = useState({
    ...data.owner,
    name: account?.display_name || data.owner.name,
    email: email || data.owner.email,
  });
  const [garageTab, setGarageTab] = useState("owner");
  const [vehicles, setVehicles] = useState(data.vehicles);
  const [editingVehicleId, setEditingVehicleId] = useState(data.vehicles[0].id);
  const [vehicleEditing, setVehicleEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState("");
  const car =
    vehicles.find((vehicle) => vehicle.id === editingVehicleId) || vehicles[0];
  const setCar = (nextCar) => {
    setVehicles((current) =>
      current.map((vehicle) =>
        vehicle.id === editingVehicleId ? nextCar : vehicle,
      ),
    );
  };
  const addVehicle = () => {
    const id = `vehicle-${Date.now()}`;
    setVehicles((current) => [
      ...current,
      {
        id,
        type: "car",
        make: "",
        model: "",
        year: "",
        fuelType: "Petrol",
        registration: "",
        tank: "",
      },
    ]);
    setEditingVehicleId(id);
    setVehicleEditing(true);
    setGarageTab("vehicles");
  };
  const removeVehicle = (vehicleId = editingVehicleId) => {
    if (vehicles.length === 1) return;
    const nextVehicles = vehicles.filter((vehicle) => vehicle.id !== vehicleId);
    setVehicles(nextVehicles);
    if (vehicleId === editingVehicleId) {
      setEditingVehicleId(nextVehicles[0].id);
    }
  };
  const driverName = account?.display_name || owner.name;
  const save = async () => {
    setValidationError("");
    if (!owner.name.trim()) {
      setValidationError("Enter your full name.");
      return;
    }
    if (!validEmail(owner.email)) {
      setValidationError("Enter a valid email address.");
      return;
    }
    if (!validIndianPhone(owner.phone)) {
      setValidationError(
        "Enter a valid Indian mobile number, such as +91 98765 43210.",
      );
      return;
    }
    const invalidVehicle = vehicles.find(
      (vehicle) => !validIndianRegistration(vehicle.registration),
    );
    if (invalidVehicle) {
      setValidationError(
        `Enter a valid Indian registration number for ${
          invalidVehicle.make || "the selected vehicle"
        }, such as KA 01 AB 1234 or 22 BH 1234 AA.`,
      );
      return;
    }
    setSaving(true);
    try {
      await updateProfile(owner, vehicles);
      setVehicleEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      setValidationError(error.message || "Could not save your garage.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <PageIntro
        eyebrow="YOUR GARAGE"
        title="Driver and vehicle details."
        text="These details personalize analytics and keep records tied to the right vehicle."
      />

      <View style={[styles.garageTabs, compact && styles.garageTabsMobile]}>
        {[
          ["owner", "person-outline", "Owner details"],
          ["vehicles", "car-sport-outline", "My vehicles"],
          ["manage", "add-circle-outline", "Add / remove"],
        ].map(([id, icon, label]) => {
          const active = garageTab === id;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => setGarageTab(id)}
              style={[
                styles.garageTab,
                compact && styles.garageTabMobile,
                active && styles.garageTabActive,
              ]}
            >
              <Ionicons
                name={icon}
                size={19}
                color={active ? C.onAccent : C.green}
              />
              <Text
                style={[
                  styles.garageTabText,
                  active && styles.garageTabTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {garageTab === "owner" && (
        <>
          <View
            style={[styles.profileHero, compact && styles.profileHeroMobile]}
          >
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitials}>
                {driverName
                  .split(" ")
                  .map((x) => x[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{driverName}</Text>
              <Text style={styles.profileSub}>
                @{account?.username || "setting-up"} · {email}
              </Text>
              <Text style={styles.profileSub}>
                {vehicles.length}{" "}
                {vehicles.length === 1 ? "vehicle" : "vehicles"} in your garage
              </Text>
            </View>
          </View>

          <Card>
            <SectionTitle
              title="Owner details"
              subtitle="Your personal and contact information"
            />
            <FormField
              label="Full name"
              value={owner.name}
              onChangeText={(name) => setOwner({ ...owner, name })}
            />
            <FormField
              label="Account email"
              value={owner.email}
              editable={false}
            />
            <FormField
              label="Phone"
              value={owner.phone}
              onChangeText={(phone) => setOwner({ ...owner, phone })}
            />
          </Card>
        </>
      )}

      {garageTab === "vehicles" && (
        <Card>
          <SectionTitle
            title="My vehicles"
            subtitle="Your saved vehicles stay read-only until you choose Edit"
          />
          <View style={styles.garageVehicleGrid}>
            {vehicles.map((vehicle, index) => (
              <View key={vehicle.id} style={styles.garageVehicleTile}>
                <View style={styles.garageVehicleTileTop}>
                  <View style={styles.garageVehicleTileIcon}>
                    <VehicleGlyph
                      vehicle={vehicle}
                      size={23}
                      color={C.green}
                      outlined
                    />
                  </View>
                  <View style={styles.garageVehicleTileInfo}>
                    <Text style={styles.garageVehicleTileName}>
                      {vehicle.make || "Vehicle"} {vehicle.model || index + 1}
                    </Text>
                    <Text style={styles.garageVehicleTileRegistration}>
                      {vehicle.registration || "Registration not added"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingVehicleId(vehicle.id);
                      setVehicleEditing(true);
                    }}
                    style={styles.garageVehicleEditButton}
                  >
                    <Ionicons name="create-outline" size={17} color={C.green} />
                    <Text style={styles.garageVehicleEditText}>Edit</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.garageVehicleFacts}>
                  <Text style={styles.garageVehicleFact}>
                    {vehicle.year || "Year not added"}
                  </Text>
                  <Text style={styles.garageVehicleFact}>
                    {vehicle.fuelType || "Fuel type not added"}
                  </Text>
                  <Text style={styles.garageVehicleFact}>
                    {vehicle.tank
                      ? `${vehicle.tank} L tank`
                      : "Tank size not added"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {vehicleEditing && (
            <View style={styles.garageVehicleEditor}>
              <View style={styles.garageVehicleEditorHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.garageVehicleEditorTitle}>
                    Edit {car.make || "vehicle"} {car.model || ""}
                  </Text>
                  <Text style={styles.garageVehicleEditorText}>
                    Save the garage when you finish making changes.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setVehicles(data.vehicles);
                    setVehicleEditing(false);
                    setValidationError("");
                  }}
                  style={styles.garageVehicleCancelButton}
                >
                  <Text style={styles.garageVehicleCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.fieldLabel}>Vehicle type</Text>
              <View style={styles.vehicleTypeRow}>
                {[
                  ["car", "Car", "car-sport-outline"],
                  ["motorbike", "Motorbike", "motorbike"],
                ].map(([type, label, icon]) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setCar({ ...car, type })}
                    style={[
                      styles.vehicleTypeOption,
                      car.type === type && styles.vehicleTypeOptionActive,
                    ]}
                  >
                    {type === "motorbike" ? (
                      <MaterialCommunityIcons
                        name={icon}
                        size={21}
                        color={car.type === type ? C.onAccent : C.green}
                      />
                    ) : (
                      <Ionicons
                        name={icon}
                        size={19}
                        color={car.type === type ? C.onAccent : C.green}
                      />
                    )}
                    <Text
                      style={[
                        styles.vehicleTypeText,
                        car.type === type && styles.vehicleTypeTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.formRow, compact && styles.formRowMobile]}>
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Make"
                    value={car.make}
                    onChangeText={(make) => setCar({ ...car, make })}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Model"
                    value={car.model}
                    onChangeText={(model) => setCar({ ...car, model })}
                  />
                </View>
              </View>
              <View style={[styles.formRow, compact && styles.formRowMobile]}>
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Year"
                    value={car.year}
                    onChangeText={(year) => setCar({ ...car, year })}
                    numeric
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Fuel type"
                    value={car.fuelType}
                    onChangeText={(fuelType) => setCar({ ...car, fuelType })}
                  />
                </View>
              </View>
              <FormField
                label="Registration number"
                value={car.registration}
                onChangeText={(registration) =>
                  setCar({ ...car, registration: registration.toUpperCase() })
                }
              />
              <FormField
                label="Tank capacity (litres)"
                value={car.tank}
                onChangeText={(tank) => setCar({ ...car, tank })}
                numeric
              />
            </View>
          )}
        </Card>
      )}

      {garageTab === "manage" && (
        <Card>
          <SectionTitle
            title="Add or remove vehicles"
            subtitle="Keep your garage list organised"
          />

          <TouchableOpacity
            onPress={addVehicle}
            style={styles.addVehicleButton}
          >
            <Ionicons name="add-circle-outline" size={20} color={C.green} />
            <Text style={styles.addVehicleText}>Add a new vehicle</Text>
          </TouchableOpacity>

          <View style={styles.manageVehicleList}>
            {vehicles.map((vehicle, index) => (
              <View key={vehicle.id} style={styles.manageVehicleRow}>
                <View style={[styles.carMiniIcon, styles.manageVehicleIcon]}>
                  <VehicleGlyph
                    vehicle={vehicle}
                    size={21}
                    color={C.green}
                    outlined
                  />
                </View>
                <View style={styles.manageVehicleInfo}>
                  <Text style={styles.manageVehicleName}>
                    {vehicle.make || "Unnamed"}{" "}
                    {vehicle.model ||
                      (vehicle.type === "motorbike"
                        ? `motorbike ${index + 1}`
                        : `car ${index + 1}`)}
                  </Text>
                  <Text style={styles.manageVehicleMeta}>
                    {vehicle.registration || "Registration not added"} ·{" "}
                    {vehicle.fuelType || "Fuel type not added"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removeVehicle(vehicle.id)}
                  disabled={vehicles.length === 1}
                  style={[
                    styles.manageRemoveButton,
                    vehicles.length === 1 && styles.manageRemoveButtonDisabled,
                  ]}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={vehicles.length === 1 ? C.muted : C.red}
                  />
                  {!compact && (
                    <Text
                      style={[
                        styles.manageRemoveText,
                        vehicles.length === 1 &&
                          styles.manageRemoveTextDisabled,
                      ]}
                    >
                      Remove
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {vehicles.length === 1 && (
            <Text style={styles.manageHint}>
              Your garage must always contain at least one vehicle.
            </Text>
          )}
        </Card>
      )}

      {garageTab === "vehicles" && (
        <View style={styles.vehicleManageShortcut}>
          <Text style={styles.vehicleManageShortcutText}>
            Want to add or remove a vehicle?
          </Text>
          <TouchableOpacity onPress={() => setGarageTab("manage")}>
            <Text style={styles.vehicleManageShortcutLink}>
              Manage vehicles
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!!validationError && (
        <Text style={styles.validationError}>{validationError}</Text>
      )}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Button
          onPress={save}
          icon={saved ? "checkmark" : "save-outline"}
          style={compact && styles.profileSaveButtonMobile}
          disabled={saving}
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save garage"}
        </Button>
      </View>
    </ScrollView>
  );
}

function PageIntro({ eyebrow, title, text, action, onAction }) {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  return (
    <View style={[styles.pageIntro, compact && styles.pageIntroMobile]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageIntroEyebrow}>{eyebrow}</Text>
        <Text
          style={[
            styles.pageIntroTitle,
            compact && styles.pageIntroTitleMobile,
          ]}
        >
          {title}
        </Text>
        <Text style={styles.pageIntroText}>{text}</Text>
      </View>
      {action && (
        <Button onPress={onAction} icon="add">
          {action}
        </Button>
      )}
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  numeric,
  multiline,
  editable = true,
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={String(value ?? "")}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A949F"
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
        editable={editable}
        style={[
          fieldStyle(),
          multiline && { height: 86, paddingTop: 13, textAlignVertical: "top" },
          !editable && { opacity: 0.65 },
        ]}
      />
    </View>
  );
}

function EntryModal({
  visible,
  type,
  onClose,
  onSave,
  vehicle,
  fuelEntries = [],
}) {
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const [kind, setKind] = useState(type || "fuel");
  const [form, setForm] = useState({
    date: today(),
    odometer: "",
    liters: "",
    amount: "",
    station: "",
    note: "Full tank",
    category: "Service",
    workshop: "",
    description: "",
    photo: "",
    odometerPhoto: "",
  });
  const [scanning, setScanning] = useState("");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [savingRecord, setSavingRecord] = useState(false);
  useEffect(() => {
    setKind(type || "fuel");
    setForm({
      date: today(),
      odometer: "",
      liters: "",
      amount: "",
      station: "",
      note: "Full tank",
      category: "Service",
      workshop: "",
      description: "",
      photo: "",
      odometerPhoto: "",
    });
    setScanning("");
    setScanProgress(0);
    setScanMessage("");
    setSavingRecord(false);
  }, [visible, type]);

  const recognizeImage = async (imageBase64, mimeType, imageKind) => {
    setScanning(imageKind);
    setScanProgress(18);
    setScanMessage(
      imageKind === "receipt"
        ? "AI is reading the fuel receipt…"
        : "AI is reading the dashboard…",
    );
    try {
      setScanProgress(55);
      const { data, error } = await supabase.functions.invoke(
        "analyze-vehicle-image",
        {
          body: { imageBase64, mimeType, kind: imageKind },
        },
      );
      if (error) {
        let message = error.message;
        if (error.context && typeof error.context.json === "function") {
          const details = await error.context.json().catch(() => null);
          message = details?.error || message;
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      const detected = data?.values || {};
      setScanProgress(100);

      if (imageKind === "receipt") {
        setForm((current) => ({
          ...current,
          date: detected.date || current.date,
          liters: detected.liters || current.liters,
          amount: detected.amount || current.amount,
          station: detected.station || current.station,
        }));
        const found = [
          detected.date,
          detected.liters,
          detected.amount,
          detected.station,
        ].filter(Boolean).length;
        setScanMessage(
          found
            ? `AI suggested ${found} receipt field${
                found === 1 ? "" : "s"
              }. Please verify them before saving.`
            : "AI could not find clear receipt values. Try a sharper, straight-on photo.",
        );
      } else if (detected.odometer) {
        setForm((current) => ({
          ...current,
          odometer: detected.odometer,
        }));
        setScanMessage(
          `AI detected ${detected.odometer} km. Please verify it before saving.`,
        );
      } else {
        setScanMessage(
          "AI could not identify the total odometer. Try a closer photo with the display in focus.",
        );
      }
    } catch (error) {
      setScanMessage(
        error?.message ||
          "AI could not read this image. Please try another photo.",
      );
    } finally {
      setScanning("");
      setTimeout(() => setScanProgress(0), 350);
    }
  };

  const pick = async (imageKind = "receipt") => {
    if (scanning) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    setForm((current) => ({
      ...current,
      [imageKind === "odometer" ? "odometerPhoto" : "photo"]: asset.uri,
    }));
    if (kind !== "fuel") return;
    if (!asset.base64) {
      setScanMessage("Could not prepare this image. Please choose it again.");
      return;
    }
    await recognizeImage(
      asset.base64,
      asset.mimeType || "image/jpeg",
      imageKind,
    );
  };
  const valid =
    form.date &&
    Number(form.odometer) > 0 &&
    Number(form.amount) > 0 &&
    (kind === "expense" || Number(form.liters) > 0);

  const entryWarnings = useMemo(() => {
    if (kind !== "fuel") return [];
    const warnings = [];
    const odometer = Number(form.odometer);
    const liters = Number(form.liters);
    const amount = Number(form.amount);
    const vehicleFuel = fuelEntries.filter(
      (entry) => !vehicle?.id || entry.vehicleId === vehicle.id,
    );
    const previousOdometer = vehicleFuel.reduce(
      (highest, entry) => Math.max(highest, Number(entry.odometer) || 0),
      0,
    );
    const tankCapacity = Number(vehicle?.tank) || 0;
    const pricePerLiter = liters > 0 ? amount / liters : 0;

    if (previousOdometer > 0 && odometer > 0 && odometer <= previousOdometer) {
      warnings.push(
        `Odometer must normally be above the previous ${number(
          previousOdometer,
          0,
        )} km reading.`,
      );
    }
    if (liters > 150 || (tankCapacity > 0 && liters > tankCapacity * 1.15)) {
      warnings.push(
        tankCapacity
          ? `Fuel quantity is above the saved ${number(
              tankCapacity,
              0,
            )} L tank capacity.`
          : "Fuel quantity looks unusually high.",
      );
    }
    if (pricePerLiter > 0 && (pricePerLiter < 50 || pricePerLiter > 200)) {
      warnings.push(
        `The calculated fuel price of ₹${number(
          pricePerLiter,
        )}/L looks unusual.`,
      );
    }
    const duplicate = vehicleFuel.some(
      (entry) =>
        entry.date === form.date &&
        Math.abs(Number(entry.amount) - amount) < 0.01 &&
        Math.abs(Number(entry.liters) - liters) < 0.01,
    );
    if (duplicate) {
      warnings.push("This looks like a fuel receipt already saved.");
    }
    if (
      (form.photo && (!form.date || !form.liters || !form.amount)) ||
      (form.odometerPhoto && !form.odometer)
    ) {
      warnings.push(
        "Some AI-detected values are uncertain or missing. Check the images and fields.",
      );
    }
    return warnings;
  }, [form, fuelEntries, kind, vehicle]);

  const commitSave = async () => {
    setSavingRecord(true);
    try {
      await onSave(kind, {
        ...form,
        odometer: Number(form.odometer),
        amount: Number(form.amount),
        liters: Number(form.liters || 0),
        id: `${kind[0]}${Date.now()}`,
      });
      onClose();
    } catch {
      // The save handler displays the upload or persistence error.
    } finally {
      setSavingRecord(false);
    }
  };
  const save = () => {
    if (!entryWarnings.length) {
      commitSave();
      return;
    }
    const message = `${entryWarnings.join("\n\n")}\n\nSave this record anyway?`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) commitSave();
      return;
    }
    Alert.alert("Check this fuel entry", message, [
      { text: "Go back", style: "cancel" },
      { text: "Save anyway", onPress: commitSave },
    ]);
  };
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, compact && styles.modalCardMobile]}>
          <View style={styles.modalHead}>
            <View>
              <Text style={styles.modalEyebrow}>NEW RECORD</Text>
              <Text style={styles.modalTitle}>
                {kind === "fuel" ? "Record a fill-up" : "Add car expense"}
              </Text>
            </View>
            <IconButton icon="close" onPress={onClose} />
          </View>
          <View style={[styles.segment, compact && styles.segmentMobile]}>
            {[
              ["fuel", "Fuel fill-up"],
              ["expense", "Expense / service"],
            ].map(([id, label]) => (
              <TouchableOpacity
                key={id}
                onPress={() => setKind(id)}
                style={[
                  styles.segmentItem,
                  compact && styles.segmentItemMobile,
                  kind === id && styles.segmentActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    kind === id && styles.segmentTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {kind === "fuel" ? (
              <View style={styles.smartUploadGroup}>
                <TouchableOpacity
                  onPress={() => pick("receipt")}
                  disabled={!!scanning}
                  style={styles.smartUploadCard}
                >
                  {form.photo ? (
                    <Image
                      source={{ uri: form.photo }}
                      style={styles.smartUploadThumbnail}
                    />
                  ) : (
                    <View style={styles.uploadIcon}>
                      <Ionicons
                        name="receipt-outline"
                        size={24}
                        color={C.green}
                      />
                    </View>
                  )}
                  <View style={styles.smartUploadCopy}>
                    <Text style={styles.uploadTitle}>Fuel receipt</Text>
                    <Text style={styles.uploadText}>
                      Detect date, litres, amount and station
                    </Text>
                  </View>
                  {scanning === "receipt" ? (
                    <ActivityIndicator color={C.green} />
                  ) : (
                    <Ionicons
                      name={form.photo ? "refresh-outline" : "camera-outline"}
                      size={21}
                      color={C.green}
                    />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => pick("odometer")}
                  disabled={!!scanning}
                  style={styles.smartUploadCard}
                >
                  {form.odometerPhoto ? (
                    <Image
                      source={{ uri: form.odometerPhoto }}
                      style={styles.smartUploadThumbnail}
                    />
                  ) : (
                    <View style={styles.uploadIcon}>
                      <MaterialCommunityIcons
                        name="speedometer"
                        size={24}
                        color={C.green}
                      />
                    </View>
                  )}
                  <View style={styles.smartUploadCopy}>
                    <Text style={styles.uploadTitle}>Dashboard photo</Text>
                    <Text style={styles.uploadText}>
                      Detect the odometer reading automatically
                    </Text>
                  </View>
                  {scanning === "odometer" ? (
                    <ActivityIndicator color={C.green} />
                  ) : (
                    <Ionicons
                      name={
                        form.odometerPhoto
                          ? "refresh-outline"
                          : "camera-outline"
                      }
                      size={21}
                      color={C.green}
                    />
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => pick("receipt")}
                style={styles.uploadBox}
              >
                {form.photo ? (
                  <Image
                    source={{ uri: form.photo }}
                    style={styles.uploadImage}
                  />
                ) : (
                  <>
                    <View style={styles.uploadIcon}>
                      <Ionicons
                        name="camera-outline"
                        size={25}
                        color={C.green}
                      />
                    </View>
                    <View>
                      <Text style={styles.uploadTitle}>
                        Upload dealership or service bill
                      </Text>
                      <Text style={styles.uploadText}>
                        Choose a photo from this device
                      </Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            )}

            {!!scanning && (
              <View style={styles.scanProgress}>
                <View
                  style={[
                    styles.scanProgressFill,
                    { width: `${Math.max(scanProgress, 4)}%` },
                  ]}
                />
              </View>
            )}
            {!!scanMessage && kind === "fuel" && (
              <View style={styles.scanMessage}>
                <Ionicons
                  name={
                    scanning ? "sparkles-outline" : "checkmark-circle-outline"
                  }
                  size={18}
                  color={C.green}
                />
                <Text style={styles.scanMessageText}>{scanMessage}</Text>
              </View>
            )}
            <View style={[styles.formRow, compact && styles.formRowMobile]}>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Date (YYYY-MM-DD)"
                  value={form.date}
                  onChangeText={(date) => setForm({ ...form, date })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FormField
                  label="Odometer reading (km)"
                  value={form.odometer}
                  onChangeText={(odometer) => setForm({ ...form, odometer })}
                  numeric
                />
              </View>
            </View>
            {kind === "fuel" ? (
              <>
                <View style={[styles.formRow, compact && styles.formRowMobile]}>
                  <View style={{ flex: 1 }}>
                    <FormField
                      label="Fuel filled (litres)"
                      value={form.liters}
                      onChangeText={(liters) => setForm({ ...form, liters })}
                      numeric
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormField
                      label="Amount paid (₹)"
                      value={form.amount}
                      onChangeText={(amount) => setForm({ ...form, amount })}
                      numeric
                    />
                  </View>
                </View>
                <FormField
                  label="Fuel station"
                  value={form.station}
                  onChangeText={(station) => setForm({ ...form, station })}
                  placeholder="e.g. IndianOil"
                />
                <FormField
                  label="Note"
                  value={form.note}
                  onChangeText={(note) => setForm({ ...form, note })}
                />
              </>
            ) : (
              <>
                <View style={[styles.formRow, compact && styles.formRowMobile]}>
                  <View style={{ flex: 1 }}>
                    <FormField
                      label="Category"
                      value={form.category}
                      onChangeText={(category) =>
                        setForm({ ...form, category })
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormField
                      label="Amount paid (₹)"
                      value={form.amount}
                      onChangeText={(amount) => setForm({ ...form, amount })}
                      numeric
                    />
                  </View>
                </View>
                <FormField
                  label="Dealership / vendor"
                  value={form.workshop}
                  onChangeText={(workshop) => setForm({ ...form, workshop })}
                />
                <FormField
                  label="Work performed / description"
                  value={form.description}
                  onChangeText={(description) =>
                    setForm({ ...form, description })
                  }
                  multiline
                />
              </>
            )}
            {entryWarnings.length > 0 && (
              <View style={styles.entryWarningBox}>
                <Ionicons name="warning-outline" size={20} color={C.orange} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryWarningTitle}>
                    Check before saving
                  </Text>
                  {entryWarnings.map((warning) => (
                    <Text key={warning} style={styles.entryWarningText}>
                      • {warning}
                    </Text>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
          <View style={styles.modalActions}>
            <Button secondary onPress={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!valid || !!scanning || savingRecord}
              onPress={save}
              icon="checkmark"
            >
              {savingRecord ? "Saving images…" : "Save record"}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function computeStats(data) {
  const series = mileageSeries(data.fuel);
  const fuelSpend = data.fuel.reduce((a, x) => a + Number(x.amount || 0), 0);
  const expenseSpend = data.expenses.reduce(
    (a, x) => a + Number(x.amount || 0),
    0,
  );
  const sorted = [...data.fuel].sort((a, b) => a.odometer - b.odometer);
  const now = today().slice(0, 7);
  const monthSpend = [...data.fuel, ...data.expenses]
    .filter((x) => x.date.startsWith(now))
    .reduce((a, x) => a + Number(x.amount || 0), 0);
  return {
    avgMileage: series.length
      ? series.reduce((a, x) => a + x.value, 0) / series.length
      : 0,
    latestMileage: series.length ? series[series.length - 1].value : 0,
    totalSpend: fuelSpend + expenseSpend,
    fuelSpend,
    expenseSpend,
    totalLiters: data.fuel.reduce((a, x) => a + Number(x.liters || 0), 0),
    distance:
      sorted.length > 1
        ? sorted[sorted.length - 1].odometer - sorted[0].odometer
        : 0,
    latestOdo: sorted.length ? sorted[sorted.length - 1].odometer : 0,
    monthSpend,
  };
}
function mileageSeries(fuel) {
  const sorted = [...fuel].sort((a, b) => a.odometer - b.odometer);
  return sorted
    .slice(1)
    .map((x, i) => ({
      ...x,
      value: (x.odometer - sorted[i].odometer) / Number(x.liters),
    }))
    .filter((x) => Number.isFinite(x.value) && x.value > 0 && x.value < 100);
}

async function uploadEntryImage(userId, entryId, imageKind, uri) {
  if (!uri) return "";
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Could not prepare the ${imageKind}.`);
  const blob = await response.blob();
  const contentType = blob.type || "image/jpeg";
  const extension =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : contentType === "image/heic"
          ? "heic"
          : "jpg";
  const path = `${userId}/${entryId}/${imageKind}.${extension}`;
  const { error } = await supabase.storage
    .from("entry-images")
    .upload(path, blob, {
      contentType,
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const [data, setData] = useState(() => normalizeGarage(emptyGarage()));
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [page, setPage] = useState("home");
  const [modal, setModal] = useState({ open: false, type: "fuel" });
  const [crewNotification, setCrewNotification] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationUnread, setNotificationUnread] = useState(false);
  nightModeActive = darkMode;
  styles = darkMode ? darkStyles : lightStyles;

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (mounted) {
        setSession(currentSession);
        setAuthLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setAccount(null);
      return undefined;
    }

    let active = true;

    supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", session.user.id)
      .single()
      .then(({ data: profile }) => {
        if (active) setAccount(profile || null);
      });

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setCrewNotification(null);
      setNotificationUnread(false);
      return undefined;
    }

    let active = true;
    const readKey = `motorly-read-crew-notification-${userId}`;

    const loadCrewNotification = async () => {
      const { data: membership } = await supabase
        .from("walkie_room_members")
        .select("room_id, joined_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (!active) return;
      if (!membership?.room_id) {
        setCrewNotification(null);
        setNotificationUnread(false);
        return;
      }

      const { data: room } = await supabase
        .from("walkie_rooms")
        .select("id, name, created_by")
        .eq("id", membership.room_id)
        .maybeSingle();

      if (!active || !room || room.created_by === userId) {
        setCrewNotification(null);
        setNotificationUnread(false);
        return;
      }

      const { data: creator } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", room.created_by)
        .maybeSingle();
      const notification = {
        id: `${room.id}:${membership.joined_at || ""}`,
        roomId: room.id,
        roomName: room.name,
        creatorName:
          creator?.display_name || creator?.username || "A Motorly friend",
      };
      const lastReadId = await AsyncStorage.getItem(readKey);
      if (!active) return;
      setCrewNotification(notification);
      setNotificationUnread(lastReadId !== notification.id);
    };

    loadCrewNotification();
    const channel = supabase
      .channel(`motorly-header-crew-notification-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "walkie_room_members",
          filter: `user_id=eq.${userId}`,
        },
        loadCrewNotification,
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) {
      setData(normalizeGarage(emptyGarage()));
      setLoading(false);
      return;
    }

    let active = true;
    const userStorageKey = storageKeyForUser(session.user.id);
    setLoading(true);

    Promise.all([
      AsyncStorage.getItem(userStorageKey),
      AsyncStorage.getItem(LEGACY_STORAGE_KEY),
      AsyncStorage.getItem("motorly-theme"),
      loadGarageFromCloud(session.user.id).catch((error) => {
        console.warn("Motorly cloud garage is not ready:", error.message);
        return null;
      }),
    ])
      .then(async ([userData, legacyData, savedTheme, cloudRecord]) => {
        if (!active) return;

        let nextGarage;

        if (cloudRecord?.garage_data) {
          nextGarage = normalizeGarage(cloudRecord.garage_data);
        } else if (userData) {
          nextGarage = normalizeGarage(JSON.parse(userData));
        } else if (legacyData) {
          nextGarage = normalizeGarage(
            removeLegacyDemoData(JSON.parse(legacyData)),
          );
          await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
        } else {
          nextGarage = normalizeGarage(emptyGarage());
        }

        setData(nextGarage);
        await AsyncStorage.setItem(userStorageKey, JSON.stringify(nextGarage));

        if (!cloudRecord) {
          saveGarageToCloud(session.user.id, nextGarage).catch((error) => {
            console.warn(
              "Motorly could not migrate the garage:",
              error.message,
            );
          });
        }

        setDarkMode(savedTheme !== "light");
      })
      .catch(() => {
        if (active) setData(normalizeGarage(emptyGarage()));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return undefined;

    return subscribeToGarage(session.user.id, (cloudGarage) => {
      const normalized = normalizeGarage(cloudGarage);
      setData(normalized);
      AsyncStorage.setItem(
        storageKeyForUser(session.user.id),
        JSON.stringify(normalized),
      ).catch(() => {});
    });
  }, [session?.user?.id]);

  const persist = (next) => {
    const normalized = normalizeGarage(next);
    setData(normalized);
    if (session?.user?.id) {
      AsyncStorage.setItem(
        storageKeyForUser(session.user.id),
        JSON.stringify(normalized),
      ).catch(() => {});
      saveGarageToCloud(session.user.id, normalized).catch((error) => {
        console.warn("Motorly cloud save failed:", error.message);
      });
    }
  };
  const updateProfile = async (owner, nextVehicles) => {
    const displayName = owner.name.trim();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", session.user.id)
      .select("id")
      .single();

    if (error) throw error;

    setAccount((current) => ({
      ...(current || {}),
      display_name: displayName,
    }));
    persist({
      ...data,
      owner: {
        ...owner,
        name: displayName,
        email: session.user.email || owner.email,
      },
      vehicles: nextVehicles,
      car: nextVehicles[0],
    });
  };
  const vehicles = data.vehicles;
  const activeVehicleId = data.activeVehicleId || "all";
  const activeVehicle =
    vehicles.find((vehicle) => vehicle.id === activeVehicleId) || vehicles[0];
  const scopedData = {
    ...data,
    owner: {
      ...data.owner,
      name: account?.display_name || data.owner.name || "Driver",
      email: session?.user?.email || data.owner.email,
    },
    car: activeVehicle,
    fuel:
      activeVehicleId === "all"
        ? data.fuel
        : data.fuel.filter((entry) => entry.vehicleId === activeVehicleId),
    expenses:
      activeVehicleId === "all"
        ? data.expenses
        : data.expenses.filter((entry) => entry.vehicleId === activeVehicleId),
  };
  const add = async (kind, item) => {
    try {
      const [photoPath, odometerPhotoPath] = await Promise.all([
        uploadEntryImage(
          session.user.id,
          item.id,
          kind === "fuel" ? "fuel-receipt" : "expense-receipt",
          item.photo,
        ),
        kind === "fuel"
          ? uploadEntryImage(
              session.user.id,
              item.id,
              "dashboard",
              item.odometerPhoto,
            )
          : Promise.resolve(""),
      ]);
      const storedItem = {
        ...item,
        photo: "",
        odometerPhoto: "",
        photoPath,
        odometerPhotoPath,
        vehicleId: activeVehicleId === "all" ? vehicles[0].id : activeVehicleId,
      };
      await persist({
        ...data,
        [kind === "fuel" ? "fuel" : "expenses"]: [
          ...data[kind === "fuel" ? "fuel" : "expenses"],
          storedItem,
        ],
      });
    } catch (error) {
      Alert.alert(
        "Could not save entry",
        error.message || "The images could not be uploaded. Please try again.",
      );
      throw error;
    }
  };
  const remove = async (list, id) => {
    const item = data[list].find((entry) => entry.id === id);
    const paths = [item?.photoPath, item?.odometerPhotoPath].filter(Boolean);
    if (paths.length) {
      const { error } = await supabase.storage
        .from("entry-images")
        .remove(paths);
      if (error) {
        Alert.alert("Could not remove images", error.message);
        return;
      }
    }
    await persist({
      ...data,
      [list]: data[list].filter((entry) => entry.id !== id),
    });
  };
  const toggleDarkMode = () => {
    setDarkMode((current) => {
      const next = !current;
      AsyncStorage.setItem("motorly-theme", next ? "dark" : "light").catch(
        () => {},
      );
      return next;
    });
  };
  const cycleVehicleScope = () => {
    const scopes = ["all", ...vehicles.map((vehicle) => vehicle.id)];
    const currentIndex = scopes.indexOf(activeVehicleId);
    const nextId = scopes[(currentIndex + 1) % scopes.length];
    persist({ ...data, activeVehicleId: nextId });
  };
  const openNotifications = async () => {
    setNotificationsOpen(true);
    if (crewNotification && session?.user?.id) {
      await AsyncStorage.setItem(
        `motorly-read-crew-notification-${session.user.id}`,
        crewNotification.id,
      );
      setNotificationUnread(false);
    }
  };
  const openCrewFromNotification = () => {
    setNotificationsOpen(false);
    setPage("crew");
  };
  if (loading || authLoading)
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={C.green} size="large" />
        <Text style={styles.loaderText}>Opening your garage…</Text>
      </View>
    );

  if (!session) {
    return <AuthScreen />;
  }

  const body =
    page === "home" ? (
      <Overview
        data={scopedData}
        isDesktop={isDesktop}
        allVehicles={activeVehicleId === "all"}
        vehicleCount={vehicles.length}
        setPage={setPage}
        openAdd={(type) => setModal({ open: true, type })}
      />
    ) : page === "logs" ? (
      <LogsScreen
        data={scopedData}
        openAdd={(type) => setModal({ open: true, type })}
        remove={remove}
      />
    ) : page === "crew" ? (
      <CrewScreen userId={session.user.id} darkMode={darkMode} />
    ) : page === "calculators" ? (
      <Calculators
        vehicle={activeVehicle}
        recordedMileage={
          computeStats({
            ...data,
            fuel: data.fuel.filter(
              (entry) => entry.vehicleId === activeVehicle.id,
            ),
            expenses: [],
          }).avgMileage
        }
        userId={session.user.id}
      />
    ) : (
      <Profile
        data={data}
        account={account}
        email={session.user.email}
        updateProfile={updateProfile}
      />
    );
  const RootContainer = Platform.OS === "web" ? View : SafeAreaView;

  return (
    <RootContainer style={[styles.safe, darkMode && styles.safeDark]}>
      <StatusBar style={darkMode ? "light" : "dark"} />
      <AppShell
        page={page}
        setPage={setPage}
        car={activeVehicle}
        vehicleScope={
          activeVehicleId === "all"
            ? `All vehicles (${vehicles.length})`
            : `${activeVehicle.make} ${activeVehicle.model}`.trim() ||
              (activeVehicle.type === "motorbike"
                ? "Unnamed motorbike"
                : "Unnamed car")
        }
        onCycleVehicle={cycleVehicleScope}
        isDesktop={isDesktop}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        onNotifications={openNotifications}
        notificationUnread={notificationUnread}
        onSignOut={() => supabase.auth.signOut()}
        onAdd={() =>
          setModal({
            open: true,
            type: page === "expenses" ? "expense" : "fuel",
          })
        }
      >
        {body}
      </AppShell>
      <EntryModal
        visible={modal.open}
        type={modal.type}
        onClose={() => setModal({ ...modal, open: false })}
        onSave={add}
        vehicle={activeVehicle}
        fuelEntries={data.fuel}
      />
      <Modal
        visible={notificationsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <Pressable
          style={styles.notificationModalBackdrop}
          onPress={() => setNotificationsOpen(false)}
        >
          <Pressable
            style={styles.notificationPanel}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.notificationPanelHeader}>
              <View>
                <Text style={styles.notificationPanelEyebrow}>
                  NOTIFICATIONS
                </Text>
                <Text style={styles.notificationPanelTitle}>Crew activity</Text>
              </View>
              <IconButton
                icon="close"
                onPress={() => setNotificationsOpen(false)}
              />
            </View>
            {crewNotification ? (
              <TouchableOpacity
                onPress={openCrewFromNotification}
                style={styles.crewNotificationCard}
              >
                <View style={styles.crewNotificationIcon}>
                  <Ionicons name="people" size={21} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.crewNotificationTitle}>
                    Added to {crewNotification.roomName}
                  </Text>
                  <Text style={styles.crewNotificationText}>
                    {crewNotification.creatorName} added you to this crew. Tap
                    to open the crew and use Walkie.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={19} color={C.green} />
              </TouchableOpacity>
            ) : (
              <View style={styles.notificationEmpty}>
                <Ionicons
                  name="notifications-off-outline"
                  size={25}
                  color={C.muted}
                />
                <Text style={styles.notificationEmptyTitle}>
                  No crew invitations
                </Text>
                <Text style={styles.notificationEmptyText}>
                  Motorly will notify you here when a friend adds you to a crew.
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </RootContainer>
  );
}

const styleDefinitions = {
  safe: {
    flex: 1,
    backgroundColor: C.white,
  },
  safeDark: {
    backgroundColor: "#111821",
  },
  app: { flex: 1, flexDirection: "row", backgroundColor: C.cream },
  appDark: { backgroundColor: "#0B0E12" },
  main: { flex: 1 },
  mainDark: { backgroundColor: "#0F141B" },
  notificationButtonWrap: {
    position: "relative",
  },
  notificationUnreadDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.red,
    borderWidth: 2,
    borderColor: C.white,
  },
  notificationModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5,9,14,.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  notificationPanel: {
    width: "100%",
    maxWidth: 470,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
  },
  notificationPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },
  notificationPanelEyebrow: {
    color: C.green,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  notificationPanelTitle: {
    color: C.ink,
    fontSize: 21,
    fontWeight: "900",
    marginTop: 3,
  },
  crewNotificationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.mint,
  },
  crewNotificationIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.white,
  },
  crewNotificationTitle: {
    color: C.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  crewNotificationText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  notificationEmpty: {
    alignItems: "center",
    paddingVertical: 25,
    paddingHorizontal: 16,
  },
  notificationEmptyTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 10,
  },
  notificationEmptyText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 5,
  },
  overviewInsightsToggle: {
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  overviewInsightsToggleCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  overviewInsightsToggleTitle: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  overviewInsightsToggleText: {
    color: C.muted,
    fontSize: 11,
    marginTop: 2,
  },
  logsScreen: {
    flex: 1,
    backgroundColor: C.cream,
  },
  logsScroll: {
    flex: 1,
  },
  logsHeader: {
    paddingHorizontal: 24,
    paddingTop: 22,
    gap: 16,
    backgroundColor: C.cream,
  },
  logsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  logsTitle: {
    color: C.ink,
    fontSize: 26,
    fontWeight: "900",
  },
  logsSubtitle: {
    color: C.muted,
    fontSize: 12,
    marginTop: 3,
  },
  logsTabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 13,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  logsTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  logsTabActive: {
    backgroundColor: C.accentSurface,
  },
  logsTabText: {
    color: C.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  logsTabTextActive: {
    color: C.onAccent,
  },
  sidebar: {
    width: 230,
    backgroundColor: C.white,
    borderRightWidth: 1,
    borderRightColor: C.line,
    padding: 24,
  },
  sidebarDark: {
    backgroundColor: "#111821",
    borderRightColor: "#2B3542",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 40,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -1,
    color: C.green,
  },
  nav: { gap: 7 },
  navItem: {
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 14,
  },
  navItemActive: { backgroundColor: C.mint },
  navLabel: { fontSize: 15, fontWeight: "600", color: "#6D7782" },
  navLabelActive: { color: C.green, fontWeight: "800" },
  carMini: {
    marginTop: "auto",
    padding: 16,
    backgroundColor: C.cream,
    borderRadius: 16,
  },
  carMiniIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  carMiniName: { fontWeight: "800", color: C.ink, fontSize: 14 },
  carMiniReg: {
    fontSize: 11,
    color: C.muted,
    marginTop: 3,
    letterSpacing: 0.7,
  },
  topbar: {
    height: 72,
    backgroundColor: C.cream,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  topbarMobile: {
    height:
      Platform.OS === "web" ? "calc(126px + env(safe-area-inset-top))" : 126,
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === "web" ? "calc(12px + env(safe-area-inset-top))" : 12,
    paddingBottom: 12,
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 10,
  },
  mobileHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mobileBrandLockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  mobileBrandMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  mobileIconActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  mobilePrimaryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  mobileVehicleSelector: {
    flex: 1,
    minWidth: 0,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mobileVehicleSelectorText: {
    flex: 1,
    minWidth: 0,
    color: C.ink,
    fontWeight: "800",
    fontSize: 12,
  },
  mobileVehicleSwitchCue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  mobileVehicleSwitchText: {
    color: C.green,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  mobileAddButton: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: C.accentSurface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  mobileAddButtonText: {
    color: C.onAccent,
    fontWeight: "800",
    fontSize: 12,
  },
  topbarDark: {
    backgroundColor: "#111821",
    borderBottomColor: "#2B3542",
  },
  pageEyebrow: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: "800",
    color: C.muted,
  },
  mobileBrand: {
    fontSize: 23,
    fontWeight: "900",
    color: C.green,
    letterSpacing: -0.8,
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.line,
  },
  iconButtonCompact: {
    width: 36,
    height: 36,
    borderRadius: 11,
  },
  button: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: C.accentSurface,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSecondary: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  buttonSmall: { minHeight: 40, paddingHorizontal: 14 },
  buttonText: { color: C.onAccent, fontSize: 14, fontWeight: "800" },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 110,
    gap: 20,
    maxWidth: 1440,
    width: "100%",
    alignSelf: "center",
  },
  hero: {
    borderRadius: 24,
    backgroundColor: C.accentSurface,
    padding: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 30,
    overflow: "hidden",
  },
  heroMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    padding: 20,
    borderRadius: 20,
    gap: 20,
  },
  heroKicker: {
    fontSize: 10,
    letterSpacing: 1.8,
    fontWeight: "800",
    color: C.lime,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -1.3,
    color: C.onAccent,
  },
  heroText: {
    fontSize: 14,
    color: "#C0CBD5",
    marginTop: 8,
    maxWidth: 530,
    lineHeight: 21,
  },
  heroCar: {
    minWidth: 265,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255,255,255,.09)",
    borderRadius: 18,
    padding: 17,
  },
  heroCarMobile: { minWidth: 0, width: "100%" },
  heroCarIcon: {
    width: 56,
    height: 56,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCarName: { fontSize: 17, fontWeight: "800", color: C.onAccent },
  heroCarSub: { fontSize: 11, color: "#B5C3D0", marginTop: 5 },
  metricsRow: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  card: {
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 22,
  },
  cardMobileAuto: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
  },
  metric: {
    flex: 1,
    minWidth: 205,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 17,
  },
  metricIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  metricLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
    color: C.muted,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: C.ink,
    marginTop: 3,
  },
  metricDetail: { fontSize: 11, color: C.muted, marginTop: 3 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  sectionHeadCopy: {
    flex: 1,
    minWidth: 170,
  },
  sectionHeadAction: {
    flexShrink: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: C.ink,
    letterSpacing: -0.3,
  },
  sectionSubtitle: { fontSize: 12, color: C.muted, marginTop: 4 },
  textLink: { fontSize: 13, fontWeight: "800", color: C.green },
  twoCol: { flexDirection: "row", gap: 20 },
  chart: { height: 210, justifyContent: "flex-end" },
  chartGuide: {
    position: "absolute",
    top: 2,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chartAxis: { fontSize: 9, color: C.muted },
  guideLine: { height: 1, backgroundColor: C.line, flex: 1 },
  bars: {
    height: 185,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingTop: 22,
  },
  barSlot: {
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    flex: 1,
  },
  bar: {
    width: "55%",
    maxWidth: 44,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  barValue: {
    fontSize: 10,
    color: C.muted,
    fontWeight: "700",
    marginBottom: 5,
  },
  barLabel: { fontSize: 9, color: C.muted, marginTop: 7 },
  insight: { flexDirection: "row", gap: 12, marginBottom: 18 },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  insightTitle: { fontSize: 14, fontWeight: "800", color: C.ink },
  insightText: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: 3 },
  recentEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: C.cream,
  },
  recentEmptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  recentEmptyCopy: {
    flex: 1,
    minWidth: 0,
  },
  recentEmptyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: C.ink,
  },
  recentEmptyText: {
    fontSize: 11,
    lineHeight: 16,
    color: C.muted,
    marginTop: 3,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  activityIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  activityTitle: { fontSize: 14, fontWeight: "700", color: C.ink, flex: 1 },
  activityAmount: { fontSize: 14, fontWeight: "800", color: C.ink },
  activityMeta: { fontSize: 11, color: C.muted, marginTop: 5 },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  empty: { alignItems: "center", borderWidth: 0, padding: 28 },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: C.ink, marginTop: 12 },
  emptyText: {
    fontSize: 12,
    color: C.muted,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 300,
    lineHeight: 18,
  },
  pageIntro: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 20,
    marginBottom: 3,
  },
  pageIntroMobile: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 14,
  },
  pageIntroEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
    color: C.green,
    marginBottom: 7,
  },
  pageIntroTitle: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1,
    color: C.ink,
  },
  pageIntroTitleMobile: { fontSize: 27, lineHeight: 32 },
  pageIntroText: {
    fontSize: 14,
    color: C.muted,
    marginTop: 7,
    maxWidth: 680,
    lineHeight: 21,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexWrap: "wrap",
  },
  logRowMobile: {
    alignItems: "flex-start",
    columnGap: 10,
    rowGap: 12,
  },
  dateBlock: {
    width: 45,
    height: 49,
    borderRadius: 12,
    backgroundColor: C.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: { fontSize: 17, fontWeight: "800", color: C.ink },
  dateMonth: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
    color: C.muted,
  },
  logTitle: { fontSize: 14, fontWeight: "800", color: C.ink },
  logMeta: { fontSize: 11, color: C.muted, marginTop: 4 },
  logFigures: { alignItems: "flex-end", minWidth: 95 },
  logFiguresMobile: {
    alignItems: "flex-start",
    marginLeft: 55,
    minWidth: 120,
  },
  logAmount: { fontSize: 15, fontWeight: "800", color: C.ink },
  logMileage: { fontSize: 11, color: C.green, fontWeight: "700", marginTop: 4 },
  thumb: { width: 43, height: 43, borderRadius: 10, backgroundColor: C.cream },
  thumbUnavailable: {
    width: 43,
    height: 43,
    borderRadius: 10,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(3,6,10,.94)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  imageViewerImage: {
    width: "100%",
    height: "86%",
  },
  imageViewerClose: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 24,
    right: 22,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(21,27,35,.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.3)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  imageViewerLabel: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 38 : 22,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    backgroundColor: "rgba(21,27,35,.86)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  progressRow: { marginBottom: 17 },
  progressLabel: { fontSize: 13, fontWeight: "700", color: C.ink },
  progressAmount: { fontSize: 13, fontWeight: "800", color: C.ink },
  progressTrack: {
    height: 7,
    borderRadius: 10,
    backgroundColor: C.cream,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 10 },
  bigNumber: {
    fontSize: 41,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: C.green,
    marginTop: 5,
  },
  bigNumberNote: { fontSize: 13, color: C.muted, marginTop: 4 },
  receiptCallout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.cream,
    padding: 16,
    borderRadius: 14,
    marginTop: 25,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#E7EAED",
    borderRadius: 13,
    padding: 4,
    alignSelf: "flex-start",
  },
  segmentMobile: {
    width: "100%",
    alignSelf: "stretch",
  },
  segmentItemMobile: { flex: 1, paddingHorizontal: 8 },
  segmentItem: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: C.white },
  segmentText: { fontSize: 13, fontWeight: "700", color: C.muted },
  segmentTextActive: { color: C.green, fontWeight: "800" },
  calculatorPage: {
    flexDirection: "column-reverse",
    gap: 38,
  },
  calculatorSection: {
    gap: 20,
  },
  journeySectionMobile: {
    gap: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    padding: 16,
  },
  journeyFormMobile: {
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
  },
  calcWrap: { flexDirection: "row", gap: 20 },
  field: { marginBottom: 15 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
    color: C.muted,
    marginBottom: 7,
  },
  formRow: { flexDirection: "row", gap: 13 },
  formRowMobile: { flexDirection: "column", gap: 0 },
  resultCard: {
    flex: 1,
    backgroundColor: C.accentSurface,
    borderRadius: 18,
    padding: 28,
    minHeight: 290,
    justifyContent: "center",
  },
  resultEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    color: C.lime,
  },
  resultValue: {
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: C.onAccent,
    marginTop: 12,
  },
  resultText: { fontSize: 14, color: "#C0CBD5", marginTop: 8 },
  formula: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(255,255,255,.1)",
    borderRadius: 13,
    padding: 13,
    marginTop: 30,
  },
  formulaText: { fontSize: 11, color: "#CAD3DC", flex: 1 },
  routeIntro: { marginTop: 18 },
  routeIntroMobile: { marginTop: 0 },
  routeEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.7,
    color: C.green,
    marginBottom: 7,
  },
  routeTitle: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: C.ink,
  },
  routeText: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 21,
    marginTop: 6,
    maxWidth: 720,
  },
  routeVehicle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.mint,
    marginBottom: 15,
  },
  routeVehicleText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    color: C.green,
  },
  routeMileageField: {
    marginBottom: 15,
  },
  routeMileageInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
    backgroundColor: C.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeMileageValue: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
  },
  routeMileageHint: {
    fontSize: 9,
    lineHeight: 13,
    color: C.muted,
    marginTop: 5,
  },
  routePlaceField: {
    marginBottom: 15,
    position: "relative",
    zIndex: 2,
  },
  routePlaceInputWrap: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 13,
    backgroundColor: C.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  routePlaceInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    color: C.ink,
    fontSize: 14,
    outlineStyle: "none",
  },
  routeSuggestions: {
    marginTop: 7,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: C.white,
  },
  routeSuggestion: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routeSuggestionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  routeSuggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  routeSuggestionLabel: {
    color: C.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  routeSuggestionDetail: {
    color: C.muted,
    fontSize: 10,
    marginTop: 2,
  },
  tollModeRow: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 15,
  },
  tollModeOption: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  tollModeOptionActive: {
    backgroundColor: C.accentSurface,
    borderColor: C.accentSurface,
  },
  tollModeText: { color: C.muted, fontSize: 11, fontWeight: "800" },
  tollModeTextActive: { color: C.onAccent },
  routeError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F9E4E4",
    borderRadius: 11,
    padding: 11,
    marginBottom: 14,
  },
  routeErrorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    color: C.red,
  },
  routeResultCard: {
    flex: 1,
    minHeight: 520,
    backgroundColor: C.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 16,
    justifyContent: "flex-start",
  },
  journeyResultMobile: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    minHeight: 0,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  routeMapPreview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    position: "relative",
  },
  routeMapTopMobile: {
    marginBottom: 0,
  },
  routeMapBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: C.lime,
  },
  routeMapBadgeText: {
    fontSize: 8,
    letterSpacing: 0.8,
    fontWeight: "900",
    color: "#202A36",
  },
  routeResultEyebrow: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
    color: C.green,
  },
  routeResultTitle: {
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -1.6,
    color: C.ink,
    marginTop: 10,
  },
  routeResultSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 3,
  },
  trafficFreeNotice: {
    marginTop: 12,
    padding: 11,
    borderRadius: 11,
    backgroundColor: "#FFF4E6",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  trafficFreeNoticeText: {
    flex: 1,
    color: C.orange,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
  },
  routeMetrics: {
    flexDirection: "row",
    gap: 9,
    flexWrap: "wrap",
    marginVertical: 22,
  },
  routeMetric: {
    flex: 1,
    minWidth: 105,
    backgroundColor: C.mint,
    borderRadius: 12,
    padding: 12,
  },
  routeMetricLabel: {
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: "800",
    color: C.muted,
  },
  routeMetricValue: {
    fontSize: 16,
    fontWeight: "900",
    color: C.ink,
    marginTop: 5,
  },
  routeTotal: {
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 16,
    marginBottom: 19,
  },
  communityTollNote: {
    fontSize: 10,
    lineHeight: 15,
    color: C.muted,
    marginTop: -12,
    marginBottom: 16,
  },
  routeTotalLabel: {
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: "800",
    color: C.green,
  },
  routeTotalValue: {
    fontSize: 29,
    fontWeight: "900",
    color: C.ink,
    marginTop: 4,
  },
  routeEmptyContent: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingBottom: 18,
  },
  routeEmptyTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
    color: C.ink,
    marginTop: 8,
  },
  routeResultHint: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 19,
    marginTop: 9,
    maxWidth: 390,
  },
  routeFeatureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 20,
  },
  routeFeature: {
    minHeight: 35,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: C.mint,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  routeFeatureText: {
    fontSize: 10,
    fontWeight: "800",
    color: C.green,
  },
  tollReportCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    flexWrap: "wrap",
  },
  tollReportCardMobile: {
    alignItems: "stretch",
    gap: 12,
  },
  tollReportAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  tollReportActionMobile: {
    width: "100%",
    flexDirection: "column",
    alignItems: "stretch",
    gap: 0,
  },
  tollReportInput: {
    width: 190,
  },
  tollReportInputMobile: {
    width: "100%",
  },
  tollReportButtonMobile: {
    width: "100%",
  },
  tollReportStatus: {
    color: C.red,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  profileHero: {
    backgroundColor: C.accentSurface,
    borderRadius: 18,
    padding: 23,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  profileHeroMobile: {
    alignItems: "flex-start",
    flexWrap: "wrap",
    padding: 18,
  },
  garageTabs: {
    flexDirection: "row",
    gap: 9,
    padding: 6,
    borderRadius: 16,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  garageTabsMobile: {
    gap: 5,
    padding: 4,
  },
  garageTab: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 13,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  garageTabMobile: {
    minHeight: 52,
    paddingHorizontal: 5,
    flexDirection: "column",
    gap: 3,
  },
  garageTabActive: {
    backgroundColor: C.accentSurface,
  },
  garageTabText: {
    color: C.green,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  garageTabTextActive: {
    color: C.onAccent,
  },
  profileSaveButtonMobile: { width: "100%" },
  profileAvatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: C.lime,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitials: { fontSize: 18, fontWeight: "900", color: "#202A36" },
  profileName: { fontSize: 20, fontWeight: "800", color: C.onAccent },
  profileSub: { fontSize: 12, color: "#B8C4CF", marginTop: 4 },
  vehicleTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },
  vehicleTab: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  vehicleTabActive: {
    backgroundColor: C.accentSurface,
    borderColor: C.green,
  },
  vehicleTabText: { color: C.muted, fontSize: 12, fontWeight: "700" },
  vehicleTabTextActive: { color: C.onAccent },
  garageVehicleGrid: {
    gap: 12,
  },
  garageVehicleTile: {
    padding: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
  },
  garageVehicleTileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  garageVehicleTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.mint,
  },
  garageVehicleTileInfo: {
    flex: 1,
    minWidth: 0,
  },
  garageVehicleTileName: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  garageVehicleTileRegistration: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  garageVehicleEditButton: {
    minHeight: 38,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  garageVehicleEditText: {
    color: C.green,
    fontSize: 11,
    fontWeight: "900",
  },
  garageVehicleFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 13,
  },
  garageVehicleFact: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    backgroundColor: C.mint,
  },
  garageVehicleEditor: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  garageVehicleEditorHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 18,
  },
  garageVehicleEditorTitle: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  garageVehicleEditorText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  garageVehicleCancelButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  garageVehicleCancelText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  addVehicleButton: {
    width: "100%",
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.mint,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 3,
  },
  addVehicleText: { color: C.green, fontSize: 12, fontWeight: "800" },
  manageVehicleList: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  manageVehicleRow: {
    minHeight: 78,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  manageVehicleIcon: {
    marginBottom: 0,
  },
  manageVehicleInfo: {
    flex: 1,
    minWidth: 0,
  },
  manageVehicleName: {
    color: C.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  manageVehicleMeta: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  manageRemoveButton: {
    minHeight: 38,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.red,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  manageRemoveButtonDisabled: {
    borderColor: C.line,
    opacity: 0.6,
  },
  manageRemoveText: {
    color: C.red,
    fontSize: 11,
    fontWeight: "800",
  },
  manageRemoveTextDisabled: {
    color: C.muted,
  },
  manageHint: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 12,
  },
  vehicleManageShortcut: {
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  vehicleManageShortcutText: {
    color: C.muted,
    fontSize: 12,
  },
  vehicleManageShortcutLink: {
    color: C.green,
    fontSize: 12,
    fontWeight: "900",
  },
  vehicleTypeRow: {
    flexDirection: "row",
    gap: 9,
    marginBottom: 18,
    marginTop: 7,
  },
  vehicleTypeOption: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  vehicleTypeOptionActive: {
    backgroundColor: C.accentSurface,
    borderColor: C.accentSurface,
  },
  vehicleTypeText: { color: C.muted, fontSize: 13, fontWeight: "800" },
  vehicleTypeTextActive: { color: C.onAccent },
  removeVehicle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    marginTop: 4,
    paddingVertical: 8,
  },
  removeVehicleText: { color: C.red, fontSize: 12, fontWeight: "700" },
  validationError: {
    color: C.red,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "right",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5,9,14,.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 650,
    maxHeight: "92%",
    backgroundColor: C.cream,
    borderRadius: 22,
    padding: 22,
  },
  modalCardMobile: {
    maxHeight: "96%",
    padding: 16,
    borderRadius: 18,
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalEyebrow: {
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "800",
    color: C.green,
  },
  modalTitle: { fontSize: 23, fontWeight: "800", color: C.ink, marginTop: 3 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  uploadBox: {
    minHeight: 82,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#AAB4BE",
    borderRadius: 14,
    marginVertical: 18,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: C.white,
    overflow: "hidden",
  },
  uploadIcon: {
    width: 45,
    height: 45,
    borderRadius: 13,
    backgroundColor: C.mint,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadTitle: { fontSize: 13, fontWeight: "800", color: C.ink },
  uploadText: { fontSize: 11, color: C.muted, marginTop: 4 },
  uploadImage: {
    width: "100%",
    height: 130,
    borderRadius: 10,
    resizeMode: "cover",
  },
  smartUploadGroup: {
    gap: 10,
    marginVertical: 18,
  },
  smartUploadCard: {
    minHeight: 76,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  smartUploadThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 11,
    resizeMode: "cover",
    backgroundColor: C.mint,
  },
  smartUploadCopy: {
    flex: 1,
    minWidth: 0,
  },
  scanProgress: {
    height: 4,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: C.line,
    marginTop: -8,
    marginBottom: 12,
  },
  scanProgressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: C.green,
  },
  scanMessage: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderRadius: 11,
    backgroundColor: C.mint,
    marginBottom: 14,
  },
  scanMessageText: {
    flex: 1,
    color: C.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  entryWarningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.orange,
    backgroundColor: C.white,
    marginTop: 4,
    marginBottom: 14,
  },
  entryWarningTitle: {
    color: C.ink,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4,
  },
  entryWarningText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.line,
    flexDirection: "row",
    paddingBottom: Platform.OS === "ios" ? 10 : 0,
  },
  bottomNavDark: {
    backgroundColor: "#111821",
    borderTopColor: "#2B3542",
  },
  bottomItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  bottomLabel: { fontSize: 9, color: "#829089" },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.cream,
  },
  loaderText: { fontSize: 13, color: C.muted, marginTop: 12 },
};

const darkColorMap = {
  ...Object.fromEntries(
    Object.keys(LIGHT).map((key) => [LIGHT[key], DARK[key]]),
  ),
  "#6D7782": "#9AA7B5",
  "#819089": "#8E9AA7",
  "#829089": "#8E9AA7",
  "#95A09A": "#8895A2",
  "#B8C4CF": "#AAB6C2",
  "#C0CBD5": "#B8C3CE",
  "#CAD3DC": "#C7D0D9",
  "#E7EAED": "#202B38",
};

function mapDarkStyles(value) {
  if (Array.isArray(value)) return value.map(mapDarkStyles);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, mapDarkStyles(child)]),
    );
  }
  return typeof value === "string" && darkColorMap[value]
    ? darkColorMap[value]
    : value;
}

const lightStyles = StyleSheet.create(styleDefinitions);
const darkStyles = StyleSheet.create(mapDarkStyles(styleDefinitions));
let styles = lightStyles;
