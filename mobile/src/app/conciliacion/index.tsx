import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Smartphone,
  Check,
  X,
  CreditCard,
  Building2,
  Calendar,
  AlertCircle,
  RefreshCw,
} from 'lucide-react-native';
import { fetchWithAuth } from '../../lib/api';
import { useCondo } from '../../contexts/CondoContext';

export default function ConciliacionScreen() {
  const { selectedCondo } = useCondo();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const condoId = selectedCondo?.id;

  const loadPayments = async () => {
    if (!condoId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await fetchWithAuth(`/payments/condos/${condoId}`).catch(() => []);
      setPayments(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error('Error al cargar pagos:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [condoId]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPayments();
  };

  const handleVerify = async (paymentId: string, approved: boolean) => {
    setActionLoading(paymentId);
    try {
      await fetchWithAuth(`/payments/${paymentId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ approved }),
      });
      await loadPayments();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo procesar la verificación');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return { label: 'CONCILIADO', bg: '#dcfce7', text: '#15803d' };
      case 'REJECTED':
        return { label: 'RECHAZADO', bg: '#fee2e2', text: '#b91c1c' };
      default:
        return { label: 'PENDIENTE', bg: '#fef3c7', text: '#b45309' };
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Conciliación de Pagos</Text>
          <Text style={styles.headerSubtitle}>
            {selectedCondo ? selectedCondo.name : 'Validación de reportes'}
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <RefreshCw size={16} color="#059669" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando pagos reportados...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
          {payments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <CreditCard size={44} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No hay pagos registrados</Text>
              <Text style={styles.emptySubtitle}>
                Los pagos reportados por los residentes de esta residencia aparecerán aquí para su validación.
              </Text>
            </View>
          ) : (
            payments.map((p) => {
              const statusMeta = getStatusBadge(p.status);
              const isProcessing = actionLoading === p.id;
              const isPending = p.status === 'PENDING';

              return (
                <View key={p.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.unitText}>Apto. {p.unit_code}</Text>
                      <Text style={styles.reportedBy}>{p.reported_by_name || 'Residente'}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
                      <Text style={[styles.badgeText, { color: statusMeta.text }]}>
                        {statusMeta.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailRow}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Fecha</Text>
                      <Text style={styles.detailValue}>
                        {new Date(p.payment_date).toLocaleDateString('es-VE')}
                      </Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Método</Text>
                      <Text style={styles.detailValue}>{p.payment_method}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Referencia</Text>
                      <Text style={styles.detailValue}>#{p.reference_number}</Text>
                    </View>
                  </View>

                  <View style={styles.amountBox}>
                    <View>
                      <Text style={styles.amountLabel}>Monto Reportado</Text>
                      <Text style={styles.amountValue}>
                        {p.currency === 'USD'
                          ? `US$ ${Number(p.amount_paid).toFixed(2)}`
                          : `Bs. ${Number(p.amount_paid).toFixed(2)}`}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.amountLabel}>Equivalente USD</Text>
                      <Text style={styles.usdEquiv}>
                        ${Number(p.equivalent_usd || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  {p.bank_name ? (
                    <Text style={styles.bankInfo}>
                      Banco receptor: {p.bank_name} {p.account_number ? `(···${String(p.account_number).slice(-4)})` : ''}
                    </Text>
                  ) : null}

                  {isPending && (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.btnAction, styles.btnApprove]}
                        onPress={() => handleVerify(p.id, true)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Check size={16} color="#fff" />
                            <Text style={styles.btnApproveText}>Aprobar y Conciliar</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.btnAction, styles.btnReject]}
                        onPress={() => handleVerify(p.id, false)}
                        disabled={isProcessing}
                      >
                        <X size={16} color="#e11d48" />
                        <Text style={styles.btnRejectText}>Rechazar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
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
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#64748b', fontSize: 14 },
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 10,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  unitText: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  reportedBy: { fontSize: 12, color: '#64748b', marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailItem: { flex: 1 },
  detailLabel: { fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', fontWeight: '600' },
  detailValue: { fontSize: 12, color: '#334155', fontWeight: '500', marginTop: 1 },
  amountBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  amountLabel: { fontSize: 10, color: '#64748b', textTransform: 'uppercase' },
  amountValue: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 2 },
  usdEquiv: { fontSize: 14, fontWeight: '700', color: '#059669', marginTop: 2 },
  bankInfo: { fontSize: 11, color: '#64748b' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  btnApprove: { backgroundColor: '#059669' },
  btnApproveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  btnReject: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' },
  btnRejectText: { color: '#e11d48', fontSize: 12, fontWeight: '700' },
});
