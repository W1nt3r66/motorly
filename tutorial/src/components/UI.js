import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export function Button({ title, onPress, icon = 'add', secondary = false, disabled = false }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}
    >
      {icon && <Ionicons name={icon} size={18} color={secondary ? colors.green : colors.white} />}
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function PageHeading({ eyebrow, title, description, actionTitle, onAction }) {
  return (
    <View style={styles.headingRow}>
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {actionTitle && <Button title={actionTitle} onPress={onAction} />}
    </View>
  );
}

export function SectionHeading({ title, subtitle }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

export function MetricCard({ icon, label, value, color = colors.green }) {
  return (
    <Card style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={21} color={color} />
      </View>
      <View>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
      </View>
    </Card>
  );
}

export function FormField({ label, value, onChangeText, placeholder = '', numeric = false, multiline = false }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={String(value ?? '')}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9AA49F"
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

export function EmptyState({ icon, title, description }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={26} color={colors.green} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, paddingHorizontal: 17, borderRadius: 12, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButton: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.white, fontWeight: '800', fontSize: 14 },
  secondaryButtonText: { color: colors.green },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 20 },
  headingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 },
  headingCopy: { flex: 1, minWidth: 250 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6, color: colors.green },
  heading: { fontSize: 31, fontWeight: '900', letterSpacing: -1, color: colors.ink, marginTop: 5 },
  description: { fontSize: 14, lineHeight: 21, color: colors.muted, marginTop: 6, maxWidth: 700 },
  sectionHeading: { marginBottom: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.ink },
  sectionSubtitle: { fontSize: 12, color: colors.muted, marginTop: 4 },
  metricCard: { flex: 1, minWidth: 205, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  metricIcon: { width: 43, height: 43, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7, color: colors.muted, textTransform: 'uppercase' },
  metricValue: { fontSize: 21, fontWeight: '900', color: colors.ink, marginTop: 3 },
  field: { marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '800', color: colors.muted, marginBottom: 7 },
  input: { height: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, backgroundColor: colors.white, fontSize: 15, color: colors.ink },
  multiline: { height: 84, paddingTop: 13, textAlignVertical: 'top' },
  empty: { paddingVertical: 28, alignItems: 'center' },
  emptyIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: colors.ink, marginTop: 12 },
  emptyText: { maxWidth: 330, textAlign: 'center', fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 5 },
});
