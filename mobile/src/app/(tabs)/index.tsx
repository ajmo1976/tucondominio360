import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Building2,
  Receipt,
  Home,
  CheckSquare,
  CalendarClock,
  Wrench,
  Megaphone,
  MessageSquareMore,
  TrendingDown,
  Users,
  LogOut,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useCondo } from '../../contexts/CondoContext';
import { fetchWithAuth, getMyModules } from '../../lib/api';
import { modulesVisibleForAccountType, AccountType } from '../../lib/shared';
import { CondoSelectorModal } from '../../components/CondoSelectorModal';

const usd = (n: number) => `$${Number(n || 0).toFixed(2)}`;

export default function DashboardScreen() {
  const router = useRouter();
  const { session, logout } = useAuth();
  const { selectedCondo, condos } = useCondo();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [condoSummary, setCondoSummary] = useState<any>(null);
  const [billsSummary, setBillsSummary] = useState<any>(null);
  const [showCondoModal, setShowCondoModal] = useState(false);

  const condoId = selectedCondo?.id;

  const loadData = async () => {
    try {
      const me = await fetchWithAuth('/auth/me');
      setProfile(me?.user);

      if (condoId) {
        // Resumen financiero del condominio activo
        const sum = await fetchWithAuth(`/condos/${condoId}/summary`).catch(() => null);
        setCondoSummary(sum);
      }

      // Resumen personal de recibos
      const myBills = await fetchWithAuth('/payments/my-bills').catch(() => null);
      if (myBills?.summary) {
        setBillsSummary(myBills.summary);
      }

      // Módulos visibles
      const mods = await getMyModules();
      const enabled = condoId ? mods[condoId] || [] : [];
      const accountType: AccountType = me?.user?.accountType || 'PROPIETARIO';
      const visible = modulesVisibleForAccountType(accountType, enabled);
      setModules(visible);
    } catch (e) {
      console.error('Error al cargar dashboard:', e);
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

  const menuItems = [
    {
      code: 'COMMUNITY',
      title: 'Portal del Propietario',
      subtitle: 'Recibos y estado de cuenta',
      icon: Receipt,
      route: '/(tabs)/comunidad',
    },
    {
      code: 'UNITS',
      title: 'Mis Unidades',
      subtitle: 'Inmuebles y alícuotas',
      icon: Home,
      route: '/(tabs)/unidades',
    },
    {
      code: 'PAYMENTS',
      title: 'Conciliación de Pagos',
      subtitle: 'Validación de reportes',
      icon: CheckSquare,
      route: '/(tabs)/conciliacion',
    },
    {
      code: 'AMENITIES',
      title: 'Áreas Comunes',
      subtitle: 'Reservas de espacios',
      icon: CalendarClock,
      route: '/amenidades',
    },
    {
      code: 'MAINTENANCE',
      title: 'Mantenimiento',
      subtitle: 'Reportes y averías',
      icon: Wrench,
      route: '/mantenimiento',
    },
    {
      code: 'ANNOUNCEMENTS',
      title: 'Cartelera Digital',
      subtitle: 'Comunicados oficiales',
      icon: Megaphone,
      route: '/anuncios',
    },
    {
      code: 'CONSULTATIONS',
      title: 'Consultas y Asambleas',
      subtitle: 'Votaciones activas',
      icon: MessageSquareMore,
      route: '/consultas',
    },
    {
      code: 'ACCESS',
      title: 'Control de Acceso',
      subtitle: 'Garita y pases digitales',
      icon: ShieldCheck,
      route: '/acceso',
    },
  ];

  // Mostramos módulos habilitados para el usuario o los módulos principales
  const visibleItems = menuItems.filter(
    (item) =>
      modules.includes(item.code) ||
      item.code === 'COMMUNITY' ||
      item.code === 'UNITS' ||
      item.code === 'PAYMENTS' ||
      item.code === 'ACCESS'
  );

  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando panel...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
          {/* Header Superior */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={styles.logoCircle}>
                <Text style={styles.logoText}>360</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.welcomeText}>Hola,</Text>
                <Text style={styles.userName}>
                  {profile?.first_name || session?.user?.firstName || 'Usuario'}{' '}
                  {profile?.last_name || session?.user?.lastName || ''}
                </Text>
              </View>
              <View style={styles.accountBadge}>
                <Text style={styles.accountBadgeText}>
                  {profile?.accountType || 'PROPIETARIO'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  await logout();
                  router.replace('/(auth)/login');
                }}
                style={styles.logoutIconBtn}
                accessibilityLabel="Cerrar sesión"
              >
                <LogOut size={18} color="#e11d48" />
              </TouchableOpacity>
            </View>

            {/* Selector de Residencia Activa (Dropdown Táctil) */}
            <TouchableOpacity
              style={styles.condoSelector}
              onPress={() => setShowCondoModal(true)}
              activeOpacity={0.7}
            >
              <View style={styles.condoSelectorIcon}>
                <Building2 size={18} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.condoSelectorLabel}>Residencia Seleccionada</Text>
                <Text style={styles.condoSelectorName}>
                  {selectedCondo ? selectedCondo.name : 'Seleccionar residencia'}
                </Text>
              </View>
              <View style={styles.condoSelectorArrow}>
                <ChevronDown size={18} color="#64748b" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Tarjeta de Resumen Propietario */}
          {billsSummary && (
            <View style={styles.financialCard}>
              <View style={styles.finHeader}>
                <Text style={styles.finTitle}>Estado de tus Cuentas</Text>
                <Receipt size={16} color="#94a3b8" />
              </View>
              <View style={styles.finRow}>
                <View>
                  <Text style={styles.finLabel}>Deuda Pendiente</Text>
                  <Text
                    style={[
                      styles.finAmount,
                      { color: (billsSummary.totalDebtUsd || 0) > 0 ? '#e11d48' : '#059669' },
                    ]}
                  >
                    {usd(billsSummary.totalDebtUsd)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.finLabel}>Recibos por Pagar</Text>
                  <Text style={styles.finOpenBills}>{billsSummary.openBills || 0}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Resumen Operativo de la Residencia */}
          {condoSummary?.overview && (
            <View style={styles.overviewGrid}>
              <View style={styles.overviewCard}>
                <Users size={16} color="#64748b" />
                <Text style={styles.overviewVal}>{condoSummary.overview.total_units || 0}</Text>
                <Text style={styles.overviewLbl}>Unidades</Text>
              </View>
              <View style={styles.overviewCard}>
                <TrendingDown size={16} color="#e11d48" />
                <Text style={[styles.overviewVal, { color: '#e11d48' }]}>
                  {condoSummary.overview.units_in_arrears || 0}
                </Text>
                <Text style={styles.overviewLbl}>En mora</Text>
              </View>
            </View>
          )}

          {/* Módulos Disponibles */}
          <View style={styles.modulesSection}>
            <Text style={styles.sectionTitle}>Módulos Disponibles</Text>
            <View style={styles.grid}>
              {visibleItems.map((item) => (
                <TouchableOpacity
                  key={item.code}
                  style={styles.card}
                  onPress={() => router.push(item.route as any)}
                  activeOpacity={0.7}
                >
                  <View style={styles.iconCircle}>
                    <item.icon size={22} color="#059669" />
                  </View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* Modal para Seleccionar Residencia */}
      <CondoSelectorModal
        visible={showCondoModal}
        onClose={() => setShowCondoModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: '#64748b', fontSize: 13 },
  scroll: { padding: 16, gap: 16 },
  header: { gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoCircle: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#0f172a', fontWeight: '900', fontSize: 18 },
  welcomeText: { fontSize: 12, color: '#64748b' },
  userName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  accountBadge: { backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#a7f3d0' },
  accountBadgeText: { fontSize: 10, fontWeight: '800', color: '#059669' },
  logoutIconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#ffe4e6', alignItems: 'center', justifyContent: 'center' },
  condoSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  condoSelectorIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  condoSelectorLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8', fontWeight: '700' },
  condoSelectorName: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 1 },
  condoSelectorArrow: { padding: 4 },
  financialCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, gap: 10 },
  finHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  finTitle: { fontSize: 13, fontWeight: '700', color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5 },
  finRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 4 },
  finLabel: { fontSize: 11, color: '#64748b', marginBottom: 2 },
  finAmount: { fontSize: 24, fontWeight: '800' },
  finOpenBills: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  overviewGrid: { flexDirection: 'row', gap: 10 },
  overviewCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, alignItems: 'center', gap: 4 },
  overviewVal: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  overviewLbl: { fontSize: 11, color: '#64748b' },
  modulesSection: { gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '48%', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, gap: 6 },
  iconCircle: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  cardSubtitle: { fontSize: 11, color: '#64748b', lineHeight: 14 },
});
