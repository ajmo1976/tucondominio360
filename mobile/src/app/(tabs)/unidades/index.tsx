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
import { Building2, Home, AlertTriangle, ShieldCheck, UserCheck } from 'lucide-react-native';
import { fetchWithAuth } from '../../../lib/api';

const usd = (n: number) => `$${Number(n || 0).toFixed(2)}`;

export default function UnidadesScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [condos, setCondos] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const res = await fetchWithAuth('/me/units');
      setCondos(res?.condos || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar tus unidades.');
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

  const totalUnits = condos.reduce((acc, c) => acc + (c.units?.length || 0), 0);
  const totalDebt = condos.reduce(
    (acc, c) => acc + (c.units || []).reduce((a: number, u: any) => a + (u.currentBalanceUsd || 0), 0),
    0
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mis Unidades</Text>
        <Text style={styles.headerSubtitle}>Inmuebles asignados, alícuotas y estado de cuenta</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando unidades...</Text>
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

          {/* Tarjetas de Resumen */}
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Unidades</Text>
              <Text style={styles.summaryValue}>{totalUnits}</Text>
              <Text style={styles.summaryHint}>en {condos.length} residencia(s)</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Saldo Consolidado</Text>
              <Text style={[styles.summaryValue, { color: totalDebt > 0 ? '#e11d48' : '#059669' }]}>
                {usd(totalDebt)}
              </Text>
              <Text style={styles.summaryHint}>{totalDebt > 0 ? 'pendiente por pagar' : 'al día'}</Text>
            </View>
          </View>

          {/* Listado de Condominios y Unidades */}
          {condos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Home size={44} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No tienes unidades asignadas</Text>
              <Text style={styles.emptySubtitle}>
                Cuando la administración vincule tu cuenta a un inmueble, podrás consultar sus detalles aquí.
              </Text>
            </View>
          ) : (
            condos.map((condo: any) => (
              <View key={condo.id} style={styles.condoCard}>
                <View style={styles.condoHeader}>
                  <Building2 size={20} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.condoName}>{condo.name}</Text>
                    <Text style={styles.condoDetails}>
                      RIF {condo.rif || '—'} · {condo.city || ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.unitsList}>
                  {condo.units?.map((unit: any) => (
                    <View key={unit.id} style={styles.unitItem}>
                      <View style={styles.unitTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.unitCode}>Unidad {unit.unitCode}</Text>
                          {unit.buildingName && (
                            <Text style={styles.unitBuilding}>
                              {unit.buildingName} {unit.floor !== null && unit.floor !== undefined ? `· Piso ${unit.floor}` : ''}
                            </Text>
                          )}
                        </View>
                        <View style={styles.roleBadge}>
                          <UserCheck size={12} color="#059669" />
                          <Text style={styles.roleText}>{unit.occupantType || 'Propietario'}</Text>
                        </View>
                      </View>

                      <View style={styles.unitSpecs}>
                        <View style={styles.specBox}>
                          <Text style={styles.specLabel}>Alícuota</Text>
                          <Text style={styles.specVal}>{unit.aliquot ? `${Number(unit.aliquot).toFixed(4)}%` : '—'}</Text>
                        </View>
                        <View style={styles.specBox}>
                          <Text style={styles.specLabel}>Saldo Actual</Text>
                          <Text style={[styles.specVal, { color: (unit.currentBalanceUsd || 0) > 0 ? '#e11d48' : '#059669', fontWeight: '700' }]}>
                            {usd(unit.currentBalanceUsd)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
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
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  summaryLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', fontWeight: '700' },
  summaryValue: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginVertical: 3 },
  summaryHint: { fontSize: 11, color: '#94a3b8' },
  emptyContainer: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 32, alignItems: 'center', gap: 10, marginTop: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  emptySubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 18 },
  condoCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  condoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  condoName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  condoDetails: { fontSize: 11, color: '#64748b', marginTop: 1 },
  unitsList: { padding: 12, gap: 10 },
  unitItem: { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  unitTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  unitCode: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  unitBuilding: { fontSize: 12, color: '#64748b', marginTop: 2 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  unitSpecs: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  specBox: { flex: 1 },
  specLabel: { fontSize: 10, color: '#64748b', textTransform: 'uppercase' },
  specVal: { fontSize: 13, color: '#1e293b', marginTop: 2 },
});
