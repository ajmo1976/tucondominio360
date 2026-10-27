import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Building2, Check, X } from 'lucide-react-native';
import { useCondo, CondoItem } from '../contexts/CondoContext';

interface CondoSelectorModalProps {
  visible: boolean;
  onClose: () => void;
}

export function CondoSelectorModal({ visible, onClose }: CondoSelectorModalProps) {
  const { condos, selectedCondo, selectCondo } = useCondo();

  const handleSelect = async (c: CondoItem) => {
    await selectCondo(c);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Cambiar de Residencia</Text>
              <Text style={styles.subtitle}>Selecciona el condominio para gestionar</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.list}>
            {condos.map((c) => {
              const isSelected = selectedCondo?.id === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.item, isSelected && styles.itemSelected]}
                  onPress={() => handleSelect(c)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconCircle, isSelected && styles.iconCircleSelected]}>
                    <Building2 size={18} color={isSelected ? '#059669' : '#64748b'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.condoName, isSelected && styles.condoNameSelected]}>
                      {c.name}
                    </Text>
                    <Text style={styles.condoDetails}>
                      {c.rif ? `RIF ${c.rif}` : ''} {c.city ? `· ${c.city}` : ''}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={styles.checkCircle}>
                      <Check size={14} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  itemSelected: {
    borderColor: '#059669',
    backgroundColor: '#f0fdf4',
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSelected: {
    backgroundColor: '#ecfdf5',
  },
  condoName: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  condoNameSelected: { color: '#059669' },
  condoDetails: { fontSize: 11, color: '#64748b', marginTop: 2 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
