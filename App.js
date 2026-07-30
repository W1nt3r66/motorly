import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { supabase } from "./lib/supabase";
import AuthScreen from "./components/AuthScreen";
import FriendsScreen from "./components/FriendsScreen";

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
    fuel: (source.fuel || []).filter(
      (entry) => !DEMO_FUEL_IDS.has(entry.id),
    ),
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
  const vehicles = (safeSource.vehicles?.length
    ? safeSource.vehicles
    : [fallbackVehicle]
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
  ["fuel", "Fuel log", "water-outline"],
  ["expenses", "Expenses", "receipt-outline"],
  ["friends", "Friends", "people-outline"],
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

function IconButton({ icon, onPress, light = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.iconButton,
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
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {action && (
        <TouchableOpacity onPress={onAction}>
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
            <Text
              style={[
                styles.brandText,
                darkMode && { color: "#D8E65A" },
              ]}
            >
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
        <View style={[styles.topbar, darkMode && styles.topbarDark]}>
          <View>
            {!isDesktop && <Text style={styles.mobileBrand}>motorly</Text>}
            <Text style={styles.pageEyebrow}>MY GARAGE</Text>
          </View>
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
            <IconButton
              icon="notifications-outline"
              onPress={onNotifications}
            />
            <IconButton icon="log-out-outline" onPress={onSignOut} />
          </View>
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
        <View style={styles.heroCar}>
          <View style={styles.heroCarIcon}>
            <VehicleGlyph vehicle={data.car} size={35} color={C.lime} />
          </View>
            <View>
              <Text style={styles.heroCarName}>
                {allVehicles
                  ? "All vehicles"
                  : `${data.car.make} ${data.car.model}`}
              </Text>
              <Text style={styles.heroCarSub}>
                {allVehicles
                  ? `${vehicleCount} vehicles · combined analytics`
                  : `${data.car.year} · ${data.car.fuelType} · ${data.car.registration}`}
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
          icon="navigate-outline"
          label="Distance tracked"
          value={`${number(stats.distance, 0)} km`}
          detail={`${data.fuel.length} fuel entries`}
          tone={C.blue}
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
      <View style={[styles.twoCol, !isDesktop && { flexDirection: "column" }]}>
        <Card style={{ flex: 1.45 }}>
          <SectionTitle
            title="Mileage trend"
            subtitle="Fuel efficiency over recent fill-ups"
            action="Fuel log"
            onAction={() => setPage("fuel")}
          />
          {trend.length ? (
            <View style={styles.chart}>
              <View style={styles.chartGuide}>
                <Text style={styles.chartAxis}>{number(maxMileage)} km/L</Text>
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
                          height: Math.max(24, (x.value / maxMileage) * 130),
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
        <Card style={{ flex: 1 }}>
          <SectionTitle
            title="Smart snapshot"
            subtitle="Based on your records"
          />
          <View style={styles.insight}>
            <View style={[styles.insightIcon, { backgroundColor: C.mint }]}>
              <Ionicons name="leaf-outline" size={20} color={C.green} />
            </View>
            <View style={{ flex: 1 }}>
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
            <View style={[styles.insightIcon, { backgroundColor: "#FBE9D8" }]}>
              <Ionicons name="construct-outline" size={20} color={C.orange} />
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
          onAction={() => setPage("expenses")}
        />
        {all.map((item, i) => (
          <ActivityRow key={item.id} item={item} last={i === all.length - 1} />
        ))}
      </Card>
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

function FuelLog({ data, openAdd, remove }) {
  const series = mileageSeries(data.fuel);
  const sorted = [...data.fuel].sort((a, b) => b.odometer - a.odometer);
  const map = Object.fromEntries(series.map((x) => [x.id, x.value]));
  const stats = computeStats(data);
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <PageIntro
        eyebrow="FUEL TRACKER"
        title="Every fill-up tells a story."
        text="Record a full tank and dashboard reading. Motorly calculates the distance and mileage automatically."
        action="Add fill-up"
        onAction={() => openAdd("fuel")}
      />
      <View style={styles.metricsRow}>
        <Metric
          icon="speedometer-outline"
          label="Average mileage"
          value={stats.avgMileage ? `${number(stats.avgMileage)} km/L` : "—"}
        />
        <Metric
          icon="water-outline"
          label="Fuel logged"
          value={`${number(stats.totalLiters, 0)} L`}
          tone={C.blue}
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
            <View style={styles.logFigures}>
              <Text style={styles.logAmount}>{money(item.amount)}</Text>
              <Text style={styles.logMileage}>
                {map[item.id] ? `${number(map[item.id])} km/L` : "Baseline"}
              </Text>
            </View>
            {item.photo && (
              <Image source={{ uri: item.photo }} style={styles.thumb} />
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

function Expenses({ data, openAdd, remove }) {
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
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <PageIntro
        eyebrow="COST OF OWNERSHIP"
        title="Know where the money goes."
        text="Keep service bills, insurance, repairs, parking, tolls, and every other car expense together."
        action="Add expense"
        onAction={() => openAdd("expense")}
      />
      <View style={[styles.twoCol, compact && { flexDirection: "column" }]}>
        <Card style={{ flex: 1 }}>
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
        <Card style={{ flex: 1 }}>
          <SectionTitle
            title="Ownership total"
            subtitle="Expenses outside your fuel log"
          />
          <Text style={styles.bigNumber}>
            {money(sorted.reduce((a, x) => a + Number(x.amount), 0))}
          </Text>
          <Text style={styles.bigNumberNote}>
            across {sorted.length} recorded expenses
          </Text>
          <View style={styles.receiptCallout}>
            <Ionicons
              name="document-attach-outline"
              size={28}
              color={C.green}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.insightTitle}>Keep the paperwork</Text>
              <Text style={styles.insightText}>
                Attach the dealership or workshop bill to any entry for easy
                reference later.
              </Text>
            </View>
          </View>
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
            {item.photo && (
              <Image source={{ uri: item.photo }} style={styles.thumb} />
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

function Calculators() {
  const { width } = useWindowDimensions();
  const compact = width < 800;
  const [mode, setMode] = useState("mileage");
  const [mileage, setMileage] = useState({ start: "", end: "", liters: "" });
  const [fuel, setFuel] = useState({ distance: "", efficiency: "", price: "" });
  const [cost, setCost] = useState({
    monthlyFuel: "",
    service: "",
    insurance: "",
    other: "",
  });
  const result =
    mode === "mileage"
      ? (+mileage.end - +mileage.start) / +mileage.liters
      : mode === "fuel"
        ? (+fuel.distance / +fuel.efficiency) * +fuel.price
        : +cost.monthlyFuel * 12 +
          +cost.service +
          +cost.insurance +
          +cost.other;
  const valid = Number.isFinite(result) && result > 0;
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <PageIntro
        eyebrow="QUICK CALCULATORS"
        title="Run the numbers."
        text="Estimate mileage, trip fuel cost, or your annual cost of ownership without adding a log entry."
      />
      <View style={styles.segment}>
        {[
          ["mileage", "Mileage"],
          ["fuel", "Trip fuel"],
          ["cost", "Annual cost"],
        ].map(([id, label]) => (
          <TouchableOpacity
            key={id}
            onPress={() => setMode(id)}
            style={[styles.segmentItem, mode === id && styles.segmentActive]}
          >
            <Text
              style={[
                styles.segmentText,
                mode === id && styles.segmentTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View
        style={[
          styles.calcWrap,
          (compact || Platform.OS !== "web") && { flexDirection: "column" },
        ]}
      >
        <Card style={{ flex: 1.3 }}>
          <SectionTitle
            title={
              mode === "mileage"
                ? "Mileage calculator"
                : mode === "fuel"
                  ? "Trip fuel calculator"
                  : "Annual ownership cost"
            }
            subtitle={
              mode === "mileage"
                ? "Use two odometer readings and fuel filled"
                : mode === "fuel"
                  ? "Estimate fuel spend for any journey"
                  : "Combine recurring and annual car costs"
            }
          />
          {mode === "mileage" && (
            <>
              <FormField
                label="Previous odometer (km)"
                value={mileage.start}
                onChangeText={(start) => setMileage({ ...mileage, start })}
                numeric
              />
              <FormField
                label="Current odometer (km)"
                value={mileage.end}
                onChangeText={(end) => setMileage({ ...mileage, end })}
                numeric
              />
              <FormField
                label="Fuel filled (litres)"
                value={mileage.liters}
                onChangeText={(liters) => setMileage({ ...mileage, liters })}
                numeric
              />
            </>
          )}
          {mode === "fuel" && (
            <>
              <FormField
                label="Trip distance (km)"
                value={fuel.distance}
                onChangeText={(distance) => setFuel({ ...fuel, distance })}
                numeric
              />
              <FormField
                label="Expected mileage (km/L)"
                value={fuel.efficiency}
                onChangeText={(efficiency) => setFuel({ ...fuel, efficiency })}
                numeric
              />
              <FormField
                label="Fuel price (₹/L)"
                value={fuel.price}
                onChangeText={(price) => setFuel({ ...fuel, price })}
                numeric
              />
            </>
          )}
          {mode === "cost" && (
            <>
              <FormField
                label="Average monthly fuel spend"
                value={cost.monthlyFuel}
                onChangeText={(monthlyFuel) =>
                  setCost({ ...cost, monthlyFuel })
                }
                numeric
              />
              <FormField
                label="Annual service & maintenance"
                value={cost.service}
                onChangeText={(service) => setCost({ ...cost, service })}
                numeric
              />
              <FormField
                label="Annual insurance"
                value={cost.insurance}
                onChangeText={(insurance) => setCost({ ...cost, insurance })}
                numeric
              />
              <FormField
                label="Other annual costs"
                value={cost.other}
                onChangeText={(other) => setCost({ ...cost, other })}
                numeric
              />
            </>
          )}
        </Card>
        <View style={styles.resultCard}>
          <Text style={styles.resultEyebrow}>ESTIMATED RESULT</Text>
          <Text style={styles.resultValue}>
            {valid
              ? mode === "mileage"
                ? `${number(result)} km/L`
                : money(result)
              : "—"}
          </Text>
          <Text style={styles.resultText}>
            {mode === "mileage"
              ? "Your fuel efficiency for this interval."
              : mode === "fuel"
                ? "Approximate fuel needed: " +
                  (valid
                    ? `${number(+fuel.distance / +fuel.efficiency)} L`
                    : "—")
                : "Estimated total for one year."}
          </Text>
          <View style={styles.formula}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={C.green}
            />
            <Text style={styles.formulaText}>
              {mode === "mileage"
                ? "(current reading − previous reading) ÷ litres filled"
                : mode === "fuel"
                  ? "distance ÷ mileage × fuel price"
                  : "(monthly fuel × 12) + yearly costs"}
            </Text>
          </View>
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
    email: email || data.owner.email,
  });
  const [vehicles, setVehicles] = useState(data.vehicles);
  const [editingVehicleId, setEditingVehicleId] = useState(
    data.vehicles[0].id,
  );
  const [saved, setSaved] = useState(false);
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
  };
  const removeVehicle = () => {
    if (vehicles.length === 1) return;
    const nextVehicles = vehicles.filter(
      (vehicle) => vehicle.id !== editingVehicleId,
    );
    setVehicles(nextVehicles);
    setEditingVehicleId(nextVehicles[0].id);
  };
  const driverName = account?.display_name || owner.name;
  const save = () => {
    setValidationError("");
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
    updateProfile(owner, vehicles);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
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
      <View style={styles.profileHero}>
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
            {car.make} {car.model} · {car.registration}
          </Text>
        </View>
        <Pill>{car.fuelType}</Pill>
      </View>
      <View style={[styles.twoCol, compact && { flexDirection: "column" }]}>
        <Card style={{ flex: 1 }}>
          <SectionTitle
            title="Owner details"
            subtitle="Your contact information"
          />
          <FormField
            label="Full name"
            value={owner.name}
            onChangeText={(name) => setOwner({ ...owner, name })}
          />
          <FormField
            label="Email"
            value={owner.email}
            onChangeText={(email) => setOwner({ ...owner, email })}
          />
          <FormField
            label="Phone"
            value={owner.phone}
            onChangeText={(phone) => setOwner({ ...owner, phone })}
          />
        </Card>
        <Card style={{ flex: 1 }}>
          <SectionTitle
            title="Vehicle details"
            subtitle="Add vehicles and edit the selected vehicle"
          />
          <View style={styles.vehicleTabs}>
            {vehicles.map((vehicle, index) => (
              <TouchableOpacity
                key={vehicle.id}
                onPress={() => setEditingVehicleId(vehicle.id)}
                style={[
                  styles.vehicleTab,
                  editingVehicleId === vehicle.id && styles.vehicleTabActive,
                ]}
              >
                <VehicleGlyph
                  vehicle={vehicle}
                  size={16}
                  color={
                    editingVehicleId === vehicle.id ? C.onAccent : C.green
                  }
                  outlined
                />
                <Text
                  style={[
                    styles.vehicleTabText,
                    editingVehicleId === vehicle.id &&
                      styles.vehicleTabTextActive,
                  ]}
                >
                  {vehicle.make || "Vehicle"} {vehicle.model || index + 1}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={addVehicle}
              style={styles.addVehicleTab}
            >
              <Ionicons name="add" size={18} color={C.green} />
              <Text style={styles.addVehicleText}>Add vehicle</Text>
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
          <View style={styles.formRow}>
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
          <View style={styles.formRow}>
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
          {vehicles.length > 1 && (
            <TouchableOpacity
              onPress={removeVehicle}
              style={styles.removeVehicle}
            >
              <Ionicons name="trash-outline" size={17} color={C.red} />
              <Text style={styles.removeVehicleText}>
                Remove this vehicle
              </Text>
            </TouchableOpacity>
          )}
        </Card>
      </View>
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
        <Button onPress={save} icon={saved ? "checkmark" : "save-outline"}>
          {saved ? "Saved" : "Save garage"}
        </Button>
      </View>
    </ScrollView>
  );
}

function PageIntro({ eyebrow, title, text, action, onAction }) {
  return (
    <View style={styles.pageIntro}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageIntroEyebrow}>{eyebrow}</Text>
        <Text style={styles.pageIntroTitle}>{title}</Text>
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
        style={[
          fieldStyle(),
          multiline && { height: 86, paddingTop: 13, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}

function EntryModal({ visible, type, onClose, onSave }) {
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
  });
  useEffect(() => {
    if (visible) {
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
      });
    }
  }, [visible, type]);
  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (!res.canceled) setForm({ ...form, photo: res.assets[0].uri });
  };
  const valid =
    form.date &&
    Number(form.odometer) > 0 &&
    Number(form.amount) > 0 &&
    (kind === "expense" || Number(form.liters) > 0);
  const save = () => {
    onSave(kind, {
      ...form,
      odometer: Number(form.odometer),
      amount: Number(form.amount),
      liters: Number(form.liters || 0),
      id: `${kind[0]}${Date.now()}`,
    });
    onClose();
  };
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHead}>
            <View>
              <Text style={styles.modalEyebrow}>NEW RECORD</Text>
              <Text style={styles.modalTitle}>
                {kind === "fuel" ? "Record a fill-up" : "Add car expense"}
              </Text>
            </View>
            <IconButton icon="close" onPress={onClose} />
          </View>
          <View style={styles.segment}>
            {[
              ["fuel", "Fuel fill-up"],
              ["expense", "Expense / service"],
            ].map(([id, label]) => (
              <TouchableOpacity
                key={id}
                onPress={() => setKind(id)}
                style={[
                  styles.segmentItem,
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
            <TouchableOpacity onPress={pick} style={styles.uploadBox}>
              {form.photo ? (
                <Image
                  source={{ uri: form.photo }}
                  style={styles.uploadImage}
                />
              ) : (
                <>
                  <View style={styles.uploadIcon}>
                    <Ionicons name="camera-outline" size={25} color={C.green} />
                  </View>
                  <View>
                    <Text style={styles.uploadTitle}>
                      {kind === "fuel"
                        ? "Upload fuel bill or dashboard"
                        : "Upload dealership or service bill"}
                    </Text>
                    <Text style={styles.uploadText}>
                      Choose a photo from this device
                    </Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
            <View style={styles.formRow}>
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
                <View style={styles.formRow}>
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
                <View style={styles.formRow}>
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
          </ScrollView>
          <View style={styles.modalActions}>
            <Button secondary onPress={onClose}>
              Cancel
            </Button>
            <Button disabled={!valid} onPress={save} icon="checkmark">
              Save record
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

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const [data, setData] = useState(() => normalizeGarage(emptyGarage()));
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [page, setPage] = useState("home");
  const [modal, setModal] = useState({ open: false, type: "fuel" });
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
    ])
      .then(async ([userData, legacyData, savedTheme]) => {
        if (!active) return;

        if (userData) {
          setData(normalizeGarage(JSON.parse(userData)));
        } else if (legacyData) {
          const migrated = normalizeGarage(
            removeLegacyDemoData(JSON.parse(legacyData)),
          );
          setData(migrated);
          await AsyncStorage.setItem(
            userStorageKey,
            JSON.stringify(migrated),
          );
          await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
        } else {
          setData(normalizeGarage(emptyGarage()));
        }
        setDarkMode(savedTheme === "dark");
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
  const persist = (next) => {
    const normalized = normalizeGarage(next);
    setData(normalized);
    if (session?.user?.id) {
      AsyncStorage.setItem(
        storageKeyForUser(session.user.id),
        JSON.stringify(normalized),
      ).catch(() => {});
    }
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
  const add = (kind, item) =>
    persist({
      ...data,
      [kind === "fuel" ? "fuel" : "expenses"]: [
        ...data[kind === "fuel" ? "fuel" : "expenses"],
        {
          ...item,
          vehicleId:
            activeVehicleId === "all" ? vehicles[0].id : activeVehicleId,
        },
      ],
    });
  const remove = (list, id) =>
    persist({ ...data, [list]: data[list].filter((x) => x.id !== id) });
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
    ) : page === "fuel" ? (
      <FuelLog
        data={scopedData}
        openAdd={(type) => setModal({ open: true, type })}
        remove={remove}
      />
    ) : page === "expenses" ? (
      <Expenses
        data={scopedData}
        openAdd={(type) => setModal({ open: true, type })}
        remove={remove}
      />
    ) : page === "friends" ? (
      <FriendsScreen userId={session.user.id} darkMode={darkMode} />
    ) : page === "calculators" ? (
      <Calculators />
    ) : (
      <Profile
        data={data}
        account={account}
        email={session.user.email}
        updateProfile={(owner, nextVehicles) =>
          persist({
            ...data,
            owner,
            vehicles: nextVehicles,
            car: nextVehicles[0],
          })
        }
      />
    );
  return (
    <SafeAreaView style={[styles.safe, darkMode && styles.safeDark]}>
      <StatusBar style={darkMode ? "light" : "dark"} />
      <AppShell
        page={page}
        setPage={setPage}
        car={activeVehicle}
        vehicleScope={
          activeVehicleId === "all"
            ? `All vehicles (${vehicles.length})`
            : `${activeVehicle.make} ${activeVehicle.model}`
        }
        onCycleVehicle={cycleVehicleScope}
        isDesktop={isDesktop}
        darkMode={darkMode}
        onToggleDarkMode={toggleDarkMode}
        onNotifications={() =>
          Alert.alert(
            "Motorly notifications",
            "Convoy, fuel, friend-request, and shared-stop alerts are coming in the next stage.",
          )
        }
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
      />
    </SafeAreaView>
  );
}

const styleDefinitions = {
  safe: { flex: 1, backgroundColor: C.cream },
  safeDark: { backgroundColor: "#0B0E12" },
  app: { flex: 1, flexDirection: "row", backgroundColor: C.cream },
  appDark: { backgroundColor: "#0B0E12" },
  main: { flex: 1 },
  mainDark: { backgroundColor: "#0F141B" },
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
    fontSize: 21,
    fontWeight: "800",
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
    padding: 32,
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
  heroMobile: { flexDirection: "column", alignItems: "stretch", padding: 24 },
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
  logAmount: { fontSize: 15, fontWeight: "800", color: C.ink },
  logMileage: { fontSize: 11, color: C.green, fontWeight: "700", marginTop: 4 },
  thumb: { width: 43, height: 43, borderRadius: 10, backgroundColor: C.cream },
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
  segmentItem: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 10 },
  segmentActive: { backgroundColor: C.white },
  segmentText: { fontSize: 13, fontWeight: "700", color: C.muted },
  segmentTextActive: { color: C.green, fontWeight: "800" },
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
  profileHero: {
    backgroundColor: C.accentSurface,
    borderRadius: 18,
    padding: 23,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
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
  addVehicleTab: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: C.mint,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  addVehicleText: { color: C.green, fontSize: 12, fontWeight: "800" },
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
