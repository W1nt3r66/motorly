import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, FormField, PageHeading, SectionHeading } from '../components/UI';
import { money, number } from '../utils/calculations';
import { colors } from '../theme';

export default function CalculatorsScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 800;
  const [mode, setMode] = useState('mileage');
  const [mileage, setMileage] = useState({ previous: '', current: '', litres: '' });
  const [trip, setTrip] = useState({ distance: '', efficiency: '', price: '' });
  const [annual, setAnnual] = useState({ monthlyFuel: '', service: '', insurance: '', other: '' });

  const result = useMemo(() => {
    if (mode === 'mileage') return (Number(mileage.current) - Number(mileage.previous)) / Number(mileage.litres);
    if (mode === 'trip') return Number(trip.distance) / Number(trip.efficiency) * Number(trip.price);
    return Number(annual.monthlyFuel) * 12 + Number(annual.service) + Number(annual.insurance) + Number(annual.other);
  }, [mode, mileage, trip, annual]);

  const valid = Number.isFinite(result) && result > 0;

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <PageHeading eyebrow="QUICK CALCULATORS" title="Run the numbers." description="Calculate mileage, trip fuel cost or annual ownership cost without saving an entry." />

      <View style={styles.tabs}>
        <Tab title="Mileage" active={mode === 'mileage'} onPress={() => setMode('mileage')} />
        <Tab title="Trip fuel" active={mode === 'trip'} onPress={() => setMode('trip')} />
        <Tab title="Annual cost" active={mode === 'annual'} onPress={() => setMode('annual')} />
      </View>

      <View style={[styles.columns, compact && styles.compactColumns]}>
        <Card style={styles.formCard}>
          <SectionHeading
            title={mode === 'mileage' ? 'Mileage calculator' : mode === 'trip' ? 'Trip fuel calculator' : 'Annual ownership cost'}
            subtitle="Enter the values below"
          />

          {mode === 'mileage' && (
            <>
              <FormField label="Previous odometer (km)" value={mileage.previous} onChangeText={(previous) => setMileage({ ...mileage, previous })} numeric />
              <FormField label="Current odometer (km)" value={mileage.current} onChangeText={(current) => setMileage({ ...mileage, current })} numeric />
              <FormField label="Fuel filled (litres)" value={mileage.litres} onChangeText={(litres) => setMileage({ ...mileage, litres })} numeric />
            </>
          )}

          {mode === 'trip' && (
            <>
              <FormField label="Trip distance (km)" value={trip.distance} onChangeText={(distance) => setTrip({ ...trip, distance })} numeric />
              <FormField label="Expected mileage (km/L)" value={trip.efficiency} onChangeText={(efficiency) => setTrip({ ...trip, efficiency })} numeric />
              <FormField label="Fuel price (₹/L)" value={trip.price} onChangeText={(price) => setTrip({ ...trip, price })} numeric />
            </>
          )}

          {mode === 'annual' && (
            <>
              <FormField label="Average monthly fuel spend" value={annual.monthlyFuel} onChangeText={(monthlyFuel) => setAnnual({ ...annual, monthlyFuel })} numeric />
              <FormField label="Annual service and maintenance" value={annual.service} onChangeText={(service) => setAnnual({ ...annual, service })} numeric />
              <FormField label="Annual insurance" value={annual.insurance} onChangeText={(insurance) => setAnnual({ ...annual, insurance })} numeric />
              <FormField label="Other annual costs" value={annual.other} onChangeText={(other) => setAnnual({ ...annual, other })} numeric />
            </>
          )}
        </Card>

        <View style={styles.resultCard}>
          <Text style={styles.resultEyebrow}>ESTIMATED RESULT</Text>
          <Text style={styles.resultValue}>{valid ? (mode === 'mileage' ? `${number(result)} km/L` : money(result)) : '—'}</Text>
          <Text style={styles.resultDescription}>
            {mode === 'mileage' ? 'Fuel efficiency for this interval.' : mode === 'trip' ? `Approximate fuel required: ${valid ? number(Number(trip.distance) / Number(trip.efficiency)) : '—'} L` : 'Estimated ownership cost for one year.'}
          </Text>
          <View style={styles.formula}>
            <Ionicons name="information-circle-outline" size={20} color={colors.lime} />
            <Text style={styles.formulaText}>{mode === 'mileage' ? '(current − previous) ÷ litres' : mode === 'trip' ? 'distance ÷ mileage × price' : '(monthly fuel × 12) + annual costs'}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Tab({ title, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.activeTab]}>
      <Text style={[styles.tabText, active && styles.activeTabText]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1200, alignSelf: 'center', padding: 24, paddingBottom: 105, gap: 20 },
  tabs: { flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: 13, backgroundColor: '#E9EDE8' },
  tab: { paddingHorizontal: 17, paddingVertical: 9, borderRadius: 10 },
  activeTab: { backgroundColor: colors.white },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  activeTabText: { color: colors.green, fontWeight: '900' },
  columns: { flexDirection: 'row', gap: 20 },
  compactColumns: { flexDirection: 'column' },
  formCard: { flex: 1.3 },
  resultCard: { flex: 1, minHeight: 300, padding: 28, borderRadius: 18, backgroundColor: colors.green, justifyContent: 'center' },
  resultEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, color: colors.lime },
  resultValue: { fontSize: 41, fontWeight: '900', letterSpacing: -1.5, color: colors.white, marginTop: 12 },
  resultDescription: { fontSize: 14, color: '#C9D8D2', marginTop: 8 },
  formula: { padding: 13, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 28 },
  formulaText: { flex: 1, fontSize: 11, color: '#D6E2DE' },
});
