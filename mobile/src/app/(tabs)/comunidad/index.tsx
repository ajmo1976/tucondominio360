import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Receipt, Building2, AlertTriangle, Clock } from 'lucide-react-native';
import { fetchWithAuth } from '../../../lib/api';

const usd = (n: number) => `$${Number(n || 0).toFixed(2)}`;

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  PAID: { label: 'PAGADO', bg: '#dcfce7', text: '#15803d' },
  PARTIAL: { label: 'PARCIAL', bg: '#fef3c7', text: '#b45309' },
  PENDING: { label: 'POR PAGAR', bg: '#e0f2fe', text: '#0369a1' },
  OVERDUE: { label: 'MOROSO', bg: '#ffe4e6', text: '#be123c' },
  CANCELLED: { label: 'ANULADO', bg: '#f1f5f9', text: '#64748b' },
};

export default function ComunidadScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  const loadData = async () => {
    try {
      const res = await fetchWithAuth('/payments/my-bills');
      setData(res);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar los recibos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const summary = data?.summary;
  const condos = data?.condos || [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Portal del Propietario</Text>
        <Text style={styles.headerSubtitle}>Mis recibos y estado de cuenta consolidado</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando recibos...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
          {error ? (
            <View style={styles.errorBox}>
              <AlertTriangle size={18} color="#991b1b" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Resumen Métricas */}
          {summary && (
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Deuda total</Text>
                <Text style={[styles.summaryValue, { color: '#e11d48' }]}>{usd(summary.totalDebtUsd)}</Text>
                <Text style={styles.summaryHint}>cuotas por {usd(summary.totalDueUsd)}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Recibos abiertos</Text>
                <Text style={styles.summaryValue}>{summary.openBills || 0}</Text>
                <Text style={styles.summaryHint}>{summary.unitsCount || 0} inmueble(s)</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Residencias</Text>
                <Text style={styles.summaryValue}>{summary.condosCount || 0}</Text>
                <Text style={styles.summaryHint}>conectadas</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>En validación</Text>
                <Text style={[styles.summaryValue, { color: '#d97706' }]}>{summary.pendingPayments || 0}</Text>
                <Text style={styles.summaryHint}>por conciliar</Text>
              </View>
            </View>
          )}

          {/* Lista por Condominio e Inmueble */}
          {condos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Receipt size={48} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No tienes inmuebles asignados</Text>
              <Text style={styles.emptySubtitle}>
                Cuando la administración te asigne una unidad, verás aquí tus recibos y pagos.
              </Text>
            </View>
          ) : (
            condos.map((condo: any) => (
              <View key={condo.id} style={styles.condoSection}>
                <View style={styles.condoHeader}>
                  <Building2 size={18} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.condoName}>{condo.name}</Text>
                    <Text style={styles.condoRif}>RIF {condo.rif || '—'} · {condo.units?.length || 0} unidad(es)</Text>
                  </View>
                </View>

                {condo.units?.map((unit: any) => (
                  <View key={unit.id} style={styles.unitContainer}>
                    <View style={styles.unitHeader}>
                      <Text style={styles.unitCode}>Unidad {unit.unitCode}</Text>
                      <Text style={styles.unitBalance}>
                        Pendiente: <Text style={{ color: '#e11d48', fontWeight: '700' }}>{usd(unit.balanceUsd)}</Text>
                      </Text>
                    </View>

                    {unit.bills?.length === 0 ? (
                      <Text style={styles.noBillsText}>Sin recibos para esta unidad</Text>
                    ) : (
                      unit.bills?.map((bill: any) => {
                        const status = STATUS_CONFIG[bill.status] || { label: bill.status, bg: '#f1f5f9', text: '#475569' };
                        return (
                          <View key={bill.billId} style={styles.billCard}>
                            <View style={styles.billRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.billPeriod}>{bill.periodLabel || 'Recibo de condominio'}</Text>
                                <Text style={styles.billDue}>
                                  Vence: {bill.dueDate ? new Date(bill.dueDate).toLocaleDateString('es-VE') : '—'}
                                </Text>
                              </View>
                              <View style={[styles.badge, { backgroundColor: status.bg }]}>
                                <Text style={[styles.badgeText, { color: status.text }]}>{status.label}</Text>
                              </View>
                            </View>

                            <View style={styles.billFinancials}>
                              <View>
                                <Text style={styles.finLabel}>Total</Text>
                                <Text style={styles.finValue}>{usd(bill.totalDueUsd)}</Text>
                              </View>
                              <View>
                                <Text style={styles.finLabel}>Pagado</Text>
                                <Text style={[styles.finValue, { color: '#059669' }]}>{usd(bill.totalPaidUsd)}</Text>
                              </View>
                              <View>
                                <Text style={styles.finLabel}>Pendiente</Text>
                                <Text style={[styles.finValue, { fontWeight: '700', color: '#0f172a' }]}>{usd(bill.remainingUsd)}</Text>
                              </View>
                            </View>

                            {bill.pendingPayments > 0 && (
                              <View style={styles.pendingValidation}>
                                <Clock size={12} color="#b45309" />
                                <Text style={styles.pendingValidationText}>
                                  {bill.pendingPayments} pago(s) en proceso de validación
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })
                    )}
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#64748b', fontSize: 14 },
  scroll: { padding: 16, gap: 14 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10 },
  errorText: { color: '#991b1b', fontSize: 13, flex: 1 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { width: '48%', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  summaryLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', fontWeight: '700' },
  summaryValue: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginVertical: 2 },
  summaryHint: { fontSize: 11, color: '#94a3b8' },
  emptyContainer: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 32, alignItems: 'center', gap: 10, marginTop: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emptySubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 18 },
  condoSection: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  condoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  condoName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  condoRif: { fontSize: 11, color: '#64748b' },
  unitContainer: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  unitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  unitCode: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  unitBalance: { fontSize: 12, color: '#64748b' },
  noBillsText: { fontSize: 12, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 8 },
  billCard: { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 8 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  billPeriod: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  billDue: { fontSize: 11, color: '#64748b', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  billFinancials: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  finLabel: { fontSize: 10, color: '#64748b', textTransform: 'uppercase' },
  finValue: { fontSize: 13, fontFamily: 'monospace', color: '#334155', marginTop: 1 },
  pendingValidation: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 6, backgroundColor: '#fef3c7', borderRadius: 6 },
  pendingValidationText: { fontSize: 11, color: '#b45309', fontWeight: '500' },
});
