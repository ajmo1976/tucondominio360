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
  ShieldCheck,
  Plus,
  ArrowLeft,
  UserCheck,
  Clock,
  Car,
  QrCode,
  X,
  CheckCircle2,
} from 'lucide-react-native';
import { fetchWithAuth } from '../../lib/api';
import { useCondo } from '../../contexts/CondoContext';

export default function AccesoScreen() {
  const router = useRouter();
  const { selectedCondo } = useCondo();
  const condoId = selectedCondo?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'INVITATIONS' | 'LOGS'>('INVITATIONS');
  const [invitations, setInvitations] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Modal para nueva invitación
  const [showModal, setShowModal] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorDocNumber, setVisitorDocNumber] = useState('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().split('T')[0]);
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
      const [invRes, logsRes, unitsRes] = await Promise.all([
        fetchWithAuth(`/access/invitations?condoId=${condoId}`).catch(() => []),
        fetchWithAuth(`/access/logs?condoId=${condoId}`).catch(() => []),
        fetchWithAuth(`/condos/${condoId}/units`).catch(() => []),
      ]);

      setInvitations(Array.isArray(invRes) ? invRes : invRes?.data || []);
      setLogs(Array.isArray(logsRes) ? logsRes : logsRes?.data || []);

      const uList = Array.isArray(unitsRes) ? unitsRes : [];
      setUserUnits(uList);
      if (uList.length > 0 && !selectedUnitId) {
        setSelectedUnitId(uList[0].id);
      }
    } catch (e) {
      console.error('Error cargando control de acceso:', e);
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

  const handleCreateInvitation = async () => {
    if (!visitorName.trim()) {
      Alert.alert('Falta Información', 'Ingresa el nombre del visitante');
      return;
    }
    if (!selectedUnitId) {
      Alert.alert('Falta Unidad', 'Selecciona el inmueble destino');
      return;
    }

    setSubmitting(true);
    try {
      await fetchWithAuth('/access/invitations', {
        method: 'POST',
        body: JSON.stringify({
          condoId,
          propertyUnitId: selectedUnitId,
          guestName: visitorName,
          guestDocNumber: visitorDocNumber || undefined,
          validFrom,
          validUntil: validFrom,
        }),
      });
      Alert.alert('¡Invitación Creada!', 'El pase digital de garita ha sido generado.');
      setVisitorName('');
      setVisitorDocNumber('');
      setShowModal(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo crear la invitación');
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
          <Text style={styles.headerTitle}>Control de Acceso</Text>
          <Text style={styles.headerSubtitle}>
            {selectedCondo ? selectedCondo.name : 'Garita y Pases de Visitantes'}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Plus size={16} color="#fff" />
          <Text style={styles.addBtnText}>Pase</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'INVITATIONS' && styles.tabItemActive]}
          onPress={() => setActiveTab('INVITATIONS')}
        >
          <Text style={[styles.tabText, activeTab === 'INVITATIONS' && styles.tabTextActive]}>
            Invitaciones ({invitations.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'LOGS' && styles.tabItemActive]}
          onPress={() => setActiveTab('LOGS')}
        >
          <Text style={[styles.tabText, activeTab === 'LOGS' && styles.tabTextActive]}>
            Bitácora de Garita ({logs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando control de acceso...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
          {activeTab === 'INVITATIONS' ? (
            invitations.length === 0 ? (
              <View style={styles.emptyContainer}>
                <QrCode size={44} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>Sin pases activos</Text>
                <Text style={styles.emptySubtitle}>
                  Crea invitaciones para que tus visitantes o servicios entren más rápido por garita.
                </Text>
              </View>
            ) : (
              invitations.map((inv) => (
                <View key={inv.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.visitorName}>{inv.guest_name || inv.guestName}</Text>
                      <Text style={styles.docText}>
                        {inv.guest_doc_number || inv.guestDocNumber ? `C.I. ${inv.guest_doc_number || inv.guestDocNumber}` : 'Sin documento'}
                      </Text>
                    </View>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{inv.status || 'ACTIVA'}</Text>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>
                      Fecha: {new Date(inv.valid_from || inv.validFrom).toLocaleDateString('es-VE')}
                    </Text>
                    {inv.access_code && (
                      <Text style={styles.codeText}>Código: #{inv.access_code}</Text>
                    )}
                  </View>
                </View>
              ))
            )
          ) : (
            logs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Clock size={44} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>Sin registros en bitácora</Text>
                <Text style={styles.emptySubtitle}>
                  Los ingresos y salidas registrados por los guardias de garita se mostrarán aquí.
                </Text>
              </View>
            ) : (
              logs.map((log) => (
                <View key={log.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.visitorName}>{log.visitor_name || 'Visitante'}</Text>
                      <Text style={styles.docText}>
                        {log.visitor_doc ? `C.I. ${log.visitor_doc}` : ''} {log.unit_code ? `· Destino: Apto. ${log.unit_code}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: '#dcfce7' }]}>
                      <Text style={[styles.badgeText, { color: '#15803d' }]}>
                        {log.direction === 'OUT' ? 'SALIDA' : 'INGRESO'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.metaText}>
                    Hora: {new Date(log.created_at || log.check_in_at).toLocaleTimeString('es-VE')}
                  </Text>
                </View>
              ))
            )
          )}
        </ScrollView>
      )}

      {/* Modal Nueva Invitación */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Crear Pase de Visitante</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            {userUnits.length > 0 && (
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>Inmueble Destino</Text>
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
              <Text style={styles.inputLabel}>Nombre del Visitante</Text>
              <TextInput
                style={styles.input}
                value={visitorName}
                onChangeText={setVisitorName}
                placeholder="Nombre y Apellido"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Cédula / Documento (Opcional)</Text>
              <TextInput
                style={styles.input}
                value={visitorDocNumber}
                onChangeText={setVisitorDocNumber}
                placeholder="V-12345678"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Fecha de Visita (AAAA-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={validFrom}
                onChangeText={setValidFrom}
                placeholder="2026-10-30"
              />
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleCreateInvitation}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Generar Pase Digital</Text>
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
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  visitorName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  docText: { fontSize: 12, color: '#64748b', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#f1f5f9' },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#475569' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  metaText: { fontSize: 11, color: '#64748b' },
  codeText: { fontSize: 12, fontWeight: '700', color: '#059669' },
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
