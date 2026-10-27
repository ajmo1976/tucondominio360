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
import { ArrowLeft } from 'lucide-react-native';
import {
  Wrench,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  MessageSquare,
} from 'lucide-react-native';
import { fetchWithAuth } from '../../lib/api';
import { useCondo } from '../../contexts/CondoContext';

export default function MantenimientoScreen() {
  const router = useRouter();
  const { selectedCondo } = useCondo();
  const condoId = selectedCondo?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);

  // Modal para reportar avería
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('PLUMBING');
  const [priority, setPriority] = useState('MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    if (!condoId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [tList, kpiData] = await Promise.all([
        fetchWithAuth(`/maintenance/tickets?condoId=${condoId}`).catch(() => []),
        fetchWithAuth(`/maintenance/tickets/kpis?condoId=${condoId}`).catch(() => null),
      ]);
      setTickets(Array.isArray(tList) ? tList : []);
      setKpis(kpiData);
    } catch (e) {
      console.error('Error cargando tickets:', e);
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

  const handleCreateTicket = async () => {
    if (!title.trim()) {
      Alert.alert('Faltan datos', 'Ingresa un título descriptivo para la incidencia');
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithAuth('/maintenance/tickets', {
        method: 'POST',
        body: JSON.stringify({
          condoId,
          title,
          description,
          category,
          priority,
          scope: 'COMMON',
        }),
      });
      Alert.alert('Éxito', 'Incidencia reportada correctamente');
      setTitle('');
      setDescription('');
      setShowModal(false);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo crear el ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RESOLVED':
      case 'CLOSED':
        return { label: 'RESUELTO', bg: '#dcfce7', text: '#15803d' };
      case 'IN_PROGRESS':
        return { label: 'EN CURSO', bg: '#e0f2fe', text: '#0369a1' };
      default:
        return { label: 'ABIERTO', bg: '#fef3c7', text: '#b45309' };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10, padding: 4 }}>
          <ArrowLeft size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Mantenimiento</Text>
          <Text style={styles.headerSubtitle}>
            {selectedCondo ? selectedCondo.name : 'Reporte de Averías'}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Plus size={16} color="#fff" />
          <Text style={styles.addBtnText}>Reportar</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando incidencias...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
          {/* Métricas / KPIs */}
          {kpis && (
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiVal}>{kpis.total || tickets.length}</Text>
                <Text style={styles.kpiLbl}>Total</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={[styles.kpiVal, { color: '#b45309' }]}>{kpis.open || 0}</Text>
                <Text style={styles.kpiLbl}>Abiertos</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={[styles.kpiVal, { color: '#15803d' }]}>{kpis.resolved || 0}</Text>
                <Text style={styles.kpiLbl}>Resueltos</Text>
              </View>
            </View>
          )}

          {/* Listado de Tickets */}
          {tickets.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Wrench size={44} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No hay averías reportadas</Text>
              <Text style={styles.emptySubtitle}>
                Si notas alguna falla en las áreas comunes o en tu inmueble, pulsa Reportar para abrir un ticket.
              </Text>
            </View>
          ) : (
            tickets.map((t) => {
              const statusMeta = getStatusBadge(t.status);
              return (
                <View key={t.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ticketTitle}>{t.title}</Text>
                      <Text style={styles.ticketCategory}>
                        {t.category || 'Mantenimiento General'} · Prioridad: {t.priority}
                      </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
                      <Text style={[styles.badgeText, { color: statusMeta.text }]}>
                        {statusMeta.label}
                      </Text>
                    </View>
                  </View>

                  {t.description ? (
                    <Text style={styles.ticketDesc}>{t.description}</Text>
                  ) : null}

                  <View style={styles.footerRow}>
                    <Text style={styles.dateText}>
                      Reportado: {new Date(t.created_at).toLocaleDateString('es-VE')}
                    </Text>
                    {t.reported_by_name && (
                      <Text style={styles.reporterText}>Por: {t.reported_by_name}</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Modal Nuevo Reporte */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reportar Avería o Incidencia</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Título de la Falla</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Ej. Fuga de agua en pasillo"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Descripción Detallada</Text>
              <TextInput
                style={[styles.input, { height: 75 }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Indica la ubicación exacta y lo que ocurre..."
                multiline
              />
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleCreateTicket}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Enviar Reporte</Text>
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
    justifyContent: 'space-between',
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: '#64748b', fontSize: 13 },
  scroll: { padding: 16, gap: 12 },
  kpiRow: { flexDirection: 'row', gap: 10 },
  kpiCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, alignItems: 'center' },
  kpiVal: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  kpiLbl: { fontSize: 11, color: '#64748b', marginTop: 2 },
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
  ticketTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  ticketCategory: { fontSize: 11, color: '#64748b', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  ticketDesc: { fontSize: 13, color: '#334155', lineHeight: 18 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  dateText: { fontSize: 11, color: '#94a3b8' },
  reporterText: { fontSize: 11, color: '#64748b' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  formGroup: { gap: 6 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fff' },
  submitBtn: { backgroundColor: '#059669', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
