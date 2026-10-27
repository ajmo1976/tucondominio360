import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  CalendarClock,
  Plus,
  Users,
  DollarSign,
  Clock,
  CheckCircle2,
  X,
  AlertTriangle,
  Building2,
  ArrowLeft,
  Calendar,
} from 'lucide-react-native';
import { fetchWithAuth } from '../../lib/api';
import { useCondo } from '../../contexts/CondoContext';

export default function AmenidadesScreen() {
  const router = useRouter();
  const { selectedCondo } = useCondo();
  const condoId = selectedCondo?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'SPACES' | 'RESERVATIONS'>('SPACES');

  // Modal para reservar
  const [showModal, setShowModal] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<any>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [userUnits, setUserUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    if (!condoId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [ov, spacesList, res, unitsRes] = await Promise.all([
        fetchWithAuth(`/amenities/overview?condoId=${condoId}`).catch(() => null),
        fetchWithAuth(`/amenities/spaces?condoId=${condoId}`).catch(() => []),
        fetchWithAuth(`/amenities/reservations?condoId=${condoId}`).catch(() => []),
        fetchWithAuth(`/condos/${condoId}/units`).catch(() => []),
      ]);

      // Priorizar lista de espacios del catálogo o del overview
      const catalog = Array.isArray(spacesList) && spacesList.length > 0 ? spacesList : ov?.spaces || [];
      setSpaces(catalog);
      setReservations(Array.isArray(res) ? res : []);

      const uList = Array.isArray(unitsRes) ? unitsRes : [];
      setUserUnits(uList);
      if (uList.length > 0 && !selectedUnitId) {
        setSelectedUnitId(uList[0].id);
      }
    } catch (e) {
      console.error('Error cargando amenidades:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [condoId]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenReserve = (space: any) => {
    setSelectedSpace(space);
    setShowModal(true);
  };

  const handleCreateReservation = async () => {
    if (!selectedSpace) return;
    if (!selectedUnitId) {
      Alert.alert('Falta Unidad', 'Selecciona a qué inmueble aplicar la reserva');
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithAuth('/amenities/reservations', {
        method: 'POST',
        body: JSON.stringify({
          condoId,
          amenityId: selectedSpace.id,
          propertyUnitId: selectedUnitId,
          reservationDate: date,
          startTime,
          endTime,
        }),
      });
      Alert.alert('Éxito', 'Reserva solicitada correctamente');
      setShowModal(false);
      loadData();
    } catch (err: any) {
      Alert.alert('No se pudo reservar', err?.message || 'Error en la solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10, padding: 4 }}>
          <ArrowLeft size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Áreas Comunes</Text>
          <Text style={styles.headerSubtitle}>
            {selectedCondo ? selectedCondo.name : 'Espacios y Reservas'}
          </Text>
        </View>
      </View>

      {/* Switch de Pestañas */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'SPACES' && styles.tabItemActive]}
          onPress={() => setActiveTab('SPACES')}
        >
          <Text style={[styles.tabText, activeTab === 'SPACES' && styles.tabTextActive]}>
            Espacios ({spaces.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'RESERVATIONS' && styles.tabItemActive]}
          onPress={() => setActiveTab('RESERVATIONS')}
        >
          <Text style={[styles.tabText, activeTab === 'RESERVATIONS' && styles.tabTextActive]}>
            Mis Reservas ({reservations.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando áreas comunes...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
          {activeTab === 'SPACES' ? (
            spaces.length === 0 ? (
              <View style={styles.emptyContainer}>
                <CalendarClock size={44} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>Sin áreas comunes registradas</Text>
                <Text style={styles.emptySubtitle}>
                  Esta residencia no tiene áreas recreativas o parrilleras configuradas.
                </Text>
              </View>
            ) : (
              spaces.map((s) => {
                const isActive = s.isActive ?? s.is_active ?? true;
                const fee = s.feeUsd ?? s.fee_usd ?? 0;
                const capacity = s.capacity;

                return (
                  <View key={s.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.spaceTitle}>{s.name}</Text>
                        <Text style={styles.spaceDesc}>{s.description || 'Área recreativa y de esparcimiento'}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: isActive ? '#dcfce7' : '#fee2e2' }]}>
                        <Text style={[styles.statusText, { color: isActive ? '#15803d' : '#b91c1c' }]}>
                          {isActive ? 'DISPONIBLE' : 'CERRADO'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.specsRow}>
                      <View style={styles.specItem}>
                        <Users size={14} color="#64748b" />
                        <Text style={styles.specText}>Capacidad: {capacity || '—'} pers.</Text>
                      </View>
                      <View style={styles.specItem}>
                        <DollarSign size={14} color="#64748b" />
                        <Text style={styles.specText}>Costo: ${Number(fee).toFixed(2)}</Text>
                      </View>
                    </View>

                    {isActive && (
                      <TouchableOpacity
                        style={styles.reserveBtn}
                        onPress={() => handleOpenReserve(s)}
                      >
                        <CalendarClock size={16} color="#fff" />
                        <Text style={styles.reserveBtnText}>Reservar Espacio</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )
          ) : (
            reservations.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Clock size={44} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No tienes reservas activas</Text>
                <Text style={styles.emptySubtitle}>
                  Reserva un área común para compartir con tu familia.
                </Text>
              </View>
            ) : (
              reservations.map((r) => (
                <View key={r.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.spaceTitle}>{r.amenityName || r.space_name || 'Área Común'}</Text>
                      <Text style={styles.spaceDesc}>Fecha: {r.reservationDate || r.reservation_date}</Text>
                    </View>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{r.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.timeInfo}>
                    Horario: {r.startTime || r.start_time} - {r.endTime || r.end_time}
                  </Text>
                </View>
              ))
            )
          )}
        </ScrollView>
      )}

      {/* Modal Reservar */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reservar {selectedSpace?.name}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {userUnits.length > 0 && (
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Unidad Asignada</Text>
                <View style={styles.unitPillsRow}>
                  {userUnits.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.unitPill, selectedUnitId === u.id && styles.unitPillActive]}
                      onPress={() => setSelectedUnitId(u.id)}
                    >
                      <Text style={[styles.unitPillText, selectedUnitId === u.id && styles.unitPillTextActive]}>
                        Apto. {u.unit_number || u.unitCode || u.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Fecha de la Reserva (AAAA-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="2026-10-30"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Hora Inicio</Text>
                <TextInput
                  style={styles.input}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="09:00"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Hora Fin</Text>
                <TextInput
                  style={styles.input}
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="13:00"
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleCreateReservation}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Confirmar Solicitud</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: '#059669' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  tabTextActive: { color: '#059669', fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: '#64748b', fontSize: 13 },
  scroll: { padding: 16, gap: 12 },
  emptyContainer: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 32,
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emptySubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 18 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  spaceTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  spaceDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#f1f5f9' },
  statusText: { fontSize: 10, fontWeight: '700', color: '#475569' },
  specsRow: { flexDirection: 'row', gap: 16, paddingVertical: 4 },
  specItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  specText: { fontSize: 12, color: '#475569' },
  reserveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  reserveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  timeInfo: { fontSize: 12, color: '#64748b' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  formGroup: { gap: 6 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  unitPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  unitPillActive: { borderColor: '#059669', backgroundColor: '#ecfdf5' },
  unitPillText: { fontSize: 12, color: '#475569' },
  unitPillTextActive: { color: '#059669', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fff' },
  submitBtn: { backgroundColor: '#059669', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
