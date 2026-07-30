import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../data/AppContext';
import { money, number } from '../utils/calculations';
import { Card, EmptyState, PageHeading, SectionHeading } from '../components/UI';
import { colors } from '../theme';

export default function ExpensesScreen({ openAdd }) {
  const { data, deleteExpense } = useApp();
  const { width } = useWindowDimensions();
  const compact = width < 800;
  const expenses = [...data.expenses].sort((a, b) => b.date.localeCompare(a.date));
  const totals = expenses.reduce((result, item) => ({
    ...result,
    [item.category]: (result[item.category] || 0) + Number(item.amount),
  }), {});
  const maximum = Math.max(1, ...Object.values(totals));
  const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0);

  return (
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <PageHeading
        eyebrow="COST OF OWNERSHIP"
        title="Know where the money goes."
        description="Keep service, repair, insurance and other ownership bills together."
        actionTitle="Add expense"
        onAction={() => openAdd('expense')}
      />

      <View style={[styles.columns, compact && styles.compactColumns]}>
        <Card style={styles.column}>
          <SectionHeading title="Expense breakdown" subtitle="Totals grouped by category" />
          {!Object.keys(totals).length && <EmptyState icon="receipt-outline" title="No expenses" description="Add a bill or manual expense to see the breakdown." />}
          {Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([category, amount], index) => (
            <View key={category} style={styles.progressRow}>
              <View style={styles.between}>
                <Text style={styles.progressLabel}>{category}</Text>
                <Text style={styles.progressAmount}>{money(amount)}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.max(8, amount / maximum * 100)}%`, backgroundColor: [colors.green, colors.orange, colors.blue, '#846B96'][index % 4] }]} />
              </View>
            </View>
          ))}
        </Card>

        <Card style={styles.column}>
          <SectionHeading title="Non-fuel ownership total" subtitle="All recorded service and other costs" />
          <Text style={styles.total}>{money(total)}</Text>
          <Text style={styles.totalNote}>across {expenses.length} expense records</Text>
          <View style={styles.tip}>
            <Ionicons name="document-attach-outline" size={27} color={colors.green} />
            <Text style={styles.tipText}>Attach the original bill to each entry so it is easy to find later.</Text>
          </View>
        </Card>
      </View>

      <Card>
        <SectionHeading title="Expense history" subtitle="Service, maintenance and ownership records" />
        {!expenses.length && <EmptyState icon="wallet-outline" title="Nothing recorded" description="Add your first car expense." />}
        {expenses.map((entry, index) => (
          <View key={entry.id} style={[styles.row, index === expenses.length - 1 && styles.lastRow]}>
            <View style={styles.rowIcon}><Ionicons name="construct-outline" size={20} color={colors.orange} /></View>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{entry.description || entry.category}</Text>
              <Text style={styles.rowMeta}>{entry.date} · {entry.vendor || 'No vendor'} · {number(entry.odometer, 0)} km</Text>
            </View>
            <Text style={styles.amount}>{money(entry.amount)}</Text>
            {entry.photo ? <Image source={{ uri: entry.photo }} style={styles.thumbnail} /> : null}
            <TouchableOpacity onPress={() => deleteExpense(entry.id)} style={styles.deleteButton}>
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
  columns: { flexDirection: 'row', gap: 20 },
  compactColumns: { flexDirection: 'column' },
  column: { flex: 1 },
  progressRow: { marginBottom: 17 },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  progressLabel: { fontSize: 13, fontWeight: '800', color: colors.ink },
  progressAmount: { fontSize: 13, fontWeight: '900', color: colors.ink },
  track: { height: 7, borderRadius: 10, backgroundColor: colors.cream, marginTop: 8, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 10 },
  total: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5, color: colors.green },
  totalNote: { fontSize: 13, color: colors.muted, marginTop: 4 },
  tip: { padding: 15, borderRadius: 14, backgroundColor: colors.cream, flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 24 },
  tipText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted },
  row: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 13 },
  lastRow: { borderBottomWidth: 0 },
  rowIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#FBE9D8', alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 170 },
  rowTitle: { fontSize: 14, fontWeight: '900', color: colors.ink },
  rowMeta: { fontSize: 11, color: colors.muted, marginTop: 4 },
  amount: { fontSize: 15, fontWeight: '900', color: colors.ink },
  thumbnail: { width: 43, height: 43, borderRadius: 10 },
  deleteButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FBE8E5', alignItems: 'center', justifyContent: 'center' },
});
