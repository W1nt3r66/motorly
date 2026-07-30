import React, { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme';
import { useApp } from '../data/AppContext';
import { Button, FormField } from './UI';

const blankForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  odometer: '', litres: '', amount: '', station: '',
  category: 'Service', vendor: '', description: '', photo: '',
});

export default function AddEntryModal({ visible, initialType = 'fuel', onClose }) {
  const { addFuel, addExpense } = useApp();
  const [type, setType] = useState(initialType);
  const [form, setForm] = useState(blankForm());

  useEffect(() => {
    if (visible) {
      setType(initialType);
      setForm(blankForm());
    }
  }, [visible, initialType]);

  function change(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled) change('photo', result.assets[0].uri);
  }

  function save() {
    const common = {
      id: `${type}-${Date.now()}`,
      date: form.date,
      odometer: Number(form.odometer),
      amount: Number(form.amount),
      photo: form.photo,
    };

    if (type === 'fuel') {
      addFuel({ ...common, litres: Number(form.litres), station: form.station });
    } else {
      addExpense({
        ...common,
        category: form.category,
        vendor: form.vendor,
        description: form.description,
      });
    }
    onClose();
  }

  const valid = Number(form.odometer) > 0
    && Number(form.amount) > 0
    && (type === 'expense' || Number(form.litres) > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>NEW RECORD</Text>
              <Text style={styles.title}>{type === 'fuel' ? 'Record a fill-up' : 'Add an expense'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.green} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            <Tab title="Fuel fill-up" active={type === 'fuel'} onPress={() => setType('fuel')} />
            <Tab title="Expense / service" active={type === 'expense'} onPress={() => setType('expense')} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.upload} onPress={choosePhoto}>
              {form.photo ? (
                <Image source={{ uri: form.photo }} style={styles.photo} />
              ) : (
                <>
                  <View style={styles.uploadIcon}><Ionicons name="camera-outline" size={25} color={colors.green} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.uploadTitle}>{type === 'fuel' ? 'Attach fuel bill or dashboard photo' : 'Attach dealership or workshop bill'}</Text>
                    <Text style={styles.uploadText}>Tap to choose an image</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>

            <FormField label="Date (YYYY-MM-DD)" value={form.date} onChangeText={(value) => change('date', value)} />
            <FormField label="Odometer reading (km)" value={form.odometer} onChangeText={(value) => change('odometer', value)} numeric />

            {type === 'fuel' ? (
              <>
                <FormField label="Fuel filled (litres)" value={form.litres} onChangeText={(value) => change('litres', value)} numeric />
                <FormField label="Amount paid (₹)" value={form.amount} onChangeText={(value) => change('amount', value)} numeric />
                <FormField label="Fuel station" value={form.station} onChangeText={(value) => change('station', value)} placeholder="e.g. IndianOil" />
              </>
            ) : (
              <>
                <FormField label="Category" value={form.category} onChangeText={(value) => change('category', value)} placeholder="Service, insurance, repair..." />
                <FormField label="Amount paid (₹)" value={form.amount} onChangeText={(value) => change('amount', value)} numeric />
                <FormField label="Dealership / vendor" value={form.vendor} onChangeText={(value) => change('vendor', value)} />
                <FormField label="Description" value={form.description} onChangeText={(value) => change('description', value)} multiline />
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Button title="Cancel" icon={null} secondary onPress={onClose} />
            <Button title="Save record" icon="checkmark" disabled={!valid} onPress={save} />
          </View>
        </View>
      </View>
    </Modal>
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
  backdrop: { flex: 1, padding: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,25,20,0.55)' },
  modalCard: { width: '100%', maxWidth: 620, maxHeight: '92%', padding: 21, borderRadius: 22, backgroundColor: colors.cream },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  eyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5, color: colors.green },
  title: { fontSize: 23, fontWeight: '900', color: colors.ink, marginTop: 3 },
  closeButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  tabs: { alignSelf: 'flex-start', flexDirection: 'row', padding: 4, borderRadius: 13, backgroundColor: '#E9EDE8' },
  tab: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 16 },
  activeTab: { backgroundColor: colors.white },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  activeTabText: { color: colors.green, fontWeight: '900' },
  upload: { minHeight: 82, marginVertical: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#A9B8B1', borderRadius: 14, backgroundColor: colors.white, overflow: 'hidden' },
  uploadIcon: { width: 45, height: 45, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  uploadTitle: { fontSize: 13, fontWeight: '900', color: colors.ink },
  uploadText: { fontSize: 11, color: colors.muted, marginTop: 4 },
  photo: { width: '100%', height: 125, borderRadius: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.line },
});
