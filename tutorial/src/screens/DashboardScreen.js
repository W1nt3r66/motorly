import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../data/AppContext';
import { getAnalytics, mileageEntries, money, number } from '../utils/calculations';
import { Card, MetricCard, PageHeading, SectionHeading } from '../components/UI';
import { colors } from '../theme';

export default function DashboardScreen({ openAdd }) {
  const { data } = useApp();
  const { width } = useWindowDimensions();
  const compact = width < 800;
  const analytics = useMemo(
    () => getAnalytics(data.fuelEntries, data.expenses),
    [data.fuelEntries, data.expenses]
  );
  const trend = mileageEntries(data.fuelEntries).slice(-6);
  const maxMileage = Math.max(16, ...trend.map((item) => item.mileage));

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, compact && styles.compactHero]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroEyebrow}>HELLO, {data.owner.name.split(' ')[0].toUpperCase()}</Text>
          <Text style={styles.heroTitle}>Your car, in a nutshell.</Text>
          <Text style={styles.heroText}>Mileage, fuel, service and ownership costs in one clear view.</Text>
        </View>
        <View style={styles.heroCar}>
          <Ionicons name="car-sport" size={38} color={colors.lime} />
          <View>
            <Text style={styles.heroCarName}>{data.car.make} {data.car.model}</Text>
            <Text style={styles.heroCarMeta}>{data.car.year} · {data.car.fuelType} · {data.car.registration}</Text>
          </View>
        </View>
      </View>

      <View style={styles.metricRow}>
        <MetricCard icon="speedometer-outline" label="Average mileage" value={analytics.averageMileage ? `${number(analytics.averageMileage)} km/L` : '—'} />
        <MetricCard icon="wallet-outline" label="Total spent" value={money(analytics.totalSpend)} color={colors.orange} />
        <MetricCard icon="navigate-outline" label="Distance tracked" value={`${number(analytics.distance, 0)} km`} color={colors.blue} />
        <MetricCard icon="analytics-outline" label="Cost per km" value={analytics.costPerKm ? `${money(analytics.costPerKm)}/km` : '—'} color="#846B96" />
      </View>

      <View style={[styles.columns, compact && styles.compactColumns]}>
        <Card style={styles.largeColumn}>
          <SectionHeading title="Mileage trend" subtitle="Efficiency for each recent fill-up" />
          <View style={styles.chart}>
            {trend.map((item, index) => (
              <View key={item.id} style={styles.barSlot}>
                <Text style={styles.barValue}>{number(item.mileage)}</Text>
                <View
                  style={[
                    styles.bar,
                    { height: Math.max(26, (item.mileage / maxMileage) * 130) },
                    index === trend.length - 1 && { backgroundColor: colors.lime },
                  ]}
                />
                <Text style={styles.barDate}>{item.date.slice(5)}</Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={styles.smallColumn}>
          <SectionHeading title="Smart snapshot" subtitle="Calculated from your records" />
          <Insight icon="leaf-outline" title="Latest mileage" text={analytics.latestMileage ? `${number(analytics.latestMileage)} km/L on the latest interval.` : 'Add another fill-up to calculate mileage.'} />
          <Insight icon="construct-outline" title="Next service estimate" text={analytics.latestOdometer ? `Plan the next check around ${number(analytics.latestOdometer + 5000, 0)} km.` : 'Add an odometer reading first.'} orange />
        </Card>
      </View>

      <PageHeading
        eyebrow="KEEP IT CURRENT"
        title="Ready for the next fill-up?"
        description="Record the fuel quantity, amount and current dashboard reading after every full tank."
        actionTitle="Record fill-up"
        onAction={() => openAdd('fuel')}
      />
    </ScrollView>
  );
}

function Insight({ icon, title, text, orange }) {
  return (
    <View style={styles.insight}>
      <View style={[styles.insightIcon, orange && { backgroundColor: '#FBE9D8' }]}>
        <Ionicons name={icon} size={20} color={orange ? colors.orange : colors.green} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.insightTitle}>{title}</Text>
        <Text style={styles.insightText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1440, alignSelf: 'center', padding: 24, paddingBottom: 105, gap: 20 },
  hero: { padding: 28, borderRadius: 24, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', gap: 25 },
  compactHero: { flexDirection: 'column', alignItems: 'stretch' },
  heroEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.7, color: colors.lime },
  heroTitle: { fontSize: 34, fontWeight: '900', letterSpacing: -1.2, color: colors.white, marginTop: 6 },
  heroText: { fontSize: 14, lineHeight: 21, color: '#C9D8D2', marginTop: 7 },
  heroCar: { minWidth: 270, padding: 17, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.09)', flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroCarName: { fontSize: 17, fontWeight: '900', color: colors.white },
  heroCarMeta: { fontSize: 11, color: '#BFD0CA', marginTop: 4 },
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  columns: { flexDirection: 'row', gap: 20 },
  compactColumns: { flexDirection: 'column' },
  largeColumn: { flex: 1.4 },
  smallColumn: { flex: 1 },
  chart: { height: 190, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' },
  barSlot: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { fontSize: 10, fontWeight: '800', color: colors.muted, marginBottom: 5 },
  bar: { width: '55%', maxWidth: 44, borderTopLeftRadius: 7, borderTopRightRadius: 7, backgroundColor: colors.green },
  barDate: { fontSize: 9, color: colors.muted, marginTop: 7 },
  insight: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  insightIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  insightTitle: { fontSize: 14, fontWeight: '900', color: colors.ink },
  insightText: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 3 },
});
