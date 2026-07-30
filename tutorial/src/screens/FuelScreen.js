import React, { useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../data/AppContext';
import { getAnalytics, mileageEntries, money, number } from '../utils/calculations';
import { Card, EmptyState, MetricCard, PageHeading, SectionHeading } from '../components/UI';
import { colors } from '../theme';

export default function FuelScreen({ openAdd }) {
  const { data, deleteFuel } = useApp();
  const analytics = useMemo(() => getAnalytics(data.fuelEntries, data.expenses), [data]);
  const mileageMap = Object.fromEntries(mileageEntries(data.fuelEntries).map((item) => [item.id, item.mileage]));
  const entries = [...data.fuelEntries].sort((a, b) => b.odometer - a.odometer);

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <PageHeading
        eyebrow="FUEL TRACKER"
        title="Every fill-up tells a story."
        description="Enter the full-tank quantity and dashboard reading. Mileage is calculated automatically."
        actionTitle="Add fill-up"
        onAction={() => openAdd('fuel')}
      />

      <View style={styles.metrics}>
        <MetricCard icon="speedometer-outline" label="Average mileage" value={analytics.averageMileage ? `${number(analytics.averageMileage)} km/L` : '—'} />
        <MetricCard icon="water-outline" label="Fuel logged" value={`${number(analytics.totalLitres, 0)} L`} color={colors.blue} />
        <MetricCard icon="cash-outline" label="Fuel spend" value={money(analytics.fuelSpend)} color={colors.orange} />
      </View>

      <Card>
        <SectionHeading title="Fill-up history" subtitle="Mileage = distance since previous reading ÷ litres filled now" />
        {!entries.length && <EmptyState icon="water-outline" title="No fuel entries" description="Add your first full-tank entry to create an odometer baseline." />}

        {entries.map((entry, index) => (
          <View key={entry.id} style={[styles.row, index === entries.length - 1 && styles.lastRow]}>
            <View style={styles.dateBox}>
              <Text style={styles.dateDay}>{new Date(`${entry.date}T00:00:00`).getDate()}</Text>
              <Text style={styles.dateMonth}>{new Date(`${entry.date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</Text>
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{entry.station || 'Fuel station'}</Text>
              <Text style={styles.rowMeta}>{number(entry.odometer, 0)} km · {number(entry.litres)} L</Text>
            </View>
            <View style={styles.figures}>
              <Text style={styles.amount}>{money(entry.amount)}</Text>
              <Text style={styles.mileage}>{mileageMap[entry.id] ? `${number(mileageMap[entry.id])} km/L` : 'Baseline'}</Text>
            </View>
            {entry.photo ? <Image source={{ uri: entry.photo }} style={styles.thumbnail} /> : null}
            <TouchableOpacity onPress={() => deleteFuel(entry.id)} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={19} color={colors.red} />
            </TouchableOpacity>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1440, alignSelf: 'center', padding: 24, paddingBottom: 105, gap: 20 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  row: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 13 },
  lastRow: { borderBottomWidth: 0 },
  dateBox: { width: 45, height: 49, borderRadius: 12, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 17, fontWeight: '900', color: colors.ink },
  dateMonth: { fontSize: 8, fontWeight: '900', color: colors.muted },
  rowCopy: { flex: 1, minWidth: 145 },
  rowTitle: { fontSize: 14, fontWeight: '900', color: colors.ink },
  rowMeta: { fontSize: 11, color: colors.muted, marginTop: 4 },
  figures: { alignItems: 'flex-end', minWidth: 95 },
  amount: { fontSize: 15, fontWeight: '900', color: colors.ink },
  mileage: { fontSize: 11, fontWeight: '800', color: colors.green, marginTop: 4 },
  thumbnail: { width: 43, height: 43, borderRadius: 10 },
  deleteButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FBE8E5', alignItems: 'center', justifyContent: 'center' },
});
