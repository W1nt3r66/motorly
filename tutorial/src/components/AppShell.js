import React from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { Button } from './UI';

const pages = [
  { id: 'dashboard', label: 'Overview', icon: 'grid-outline' },
  { id: 'fuel', label: 'Fuel log', icon: 'water-outline' },
  { id: 'expenses', label: 'Expenses', icon: 'receipt-outline' },
  { id: 'calculators', label: 'Calculators', icon: 'calculator-outline' },
  { id: 'garage', label: 'Garage', icon: 'car-sport-outline' },
];

export default function AppShell({ currentPage, setCurrentPage, onAdd, car, children }) {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.app}>
        {desktop && (
          <View style={styles.sidebar}>
            <View style={styles.logoRow}>
              <View style={styles.logo}><Ionicons name="speedometer" size={22} color={colors.green} /></View>
              <Text style={styles.logoText}>motorly</Text>
            </View>

            <View style={styles.menu}>
              {pages.map((page) => (
                <TouchableOpacity
                  key={page.id}
                  onPress={() => setCurrentPage(page.id)}
                  style={[styles.menuItem, currentPage === page.id && styles.activeMenuItem]}
                >
                  <Ionicons name={page.icon} size={20} color={currentPage === page.id ? colors.green : '#819089'} />
                  <Text style={[styles.menuText, currentPage === page.id && styles.activeMenuText]}>{page.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.carCard}>
              <Ionicons name="car-sport" size={27} color={colors.green} />
              <Text style={styles.carName}>{car.make} {car.model}</Text>
              <Text style={styles.carRegistration}>{car.registration}</Text>
            </View>
          </View>
        )}

        <View style={styles.main}>
          <View style={styles.header}>
            <Text style={styles.mobileLogo}>{desktop ? 'MY GARAGE' : 'motorly'}</Text>
            <Button title="Add entry" onPress={onAdd} />
          </View>
          {children}

          {!desktop && (
            <View style={styles.bottomNav}>
              {pages.map((page) => (
                <TouchableOpacity key={page.id} onPress={() => setCurrentPage(page.id)} style={styles.bottomItem}>
                  <Ionicons name={page.icon} size={21} color={currentPage === page.id ? colors.green : '#819089'} />
                  <Text style={[styles.bottomText, currentPage === page.id && styles.activeBottomText]}>
                    {page.label === 'Calculators' ? 'Calc' : page.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream },
  app: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 230, padding: 24, backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.line },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 38 },
  logo: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 25, fontWeight: '900', letterSpacing: -1, color: colors.green },
  menu: { gap: 7 },
  menuItem: { height: 48, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 13 },
  activeMenuItem: { backgroundColor: colors.mint },
  menuText: { fontSize: 15, fontWeight: '700', color: '#6D7B74' },
  activeMenuText: { color: colors.green, fontWeight: '900' },
  carCard: { marginTop: 'auto', borderRadius: 16, backgroundColor: colors.cream, padding: 16, gap: 5 },
  carName: { fontSize: 14, fontWeight: '900', color: colors.ink, marginTop: 5 },
  carRegistration: { fontSize: 11, color: colors.muted },
  main: { flex: 1 },
  header: { height: 72, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  mobileLogo: { fontSize: 18, fontWeight: '900', letterSpacing: 0.5, color: colors.green },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 72, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', paddingBottom: Platform.OS === 'ios' ? 8 : 0 },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomText: { fontSize: 9, color: '#819089' },
  activeBottomText: { color: colors.green, fontWeight: '900' },
});
