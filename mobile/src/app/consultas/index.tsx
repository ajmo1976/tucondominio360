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
import { useRouter } from 'expo-router';
import {
  MessageSquareMore,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Vote,
  ArrowLeft,
} from 'lucide-react-native';
import { fetchWithAuth } from '../../lib/api';
import { useCondo } from '../../contexts/CondoContext';

export default function ConsultasScreen() {
  const router = useRouter();
  const { selectedCondo } = useCondo();
  const condoId = selectedCondo?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [optionsMap, setOptionsMap] = useState<Record<string, any[]>>({});
  const [eligibilityMap, setEligibilityMap] = useState<Record<string, any[]>>({});
  const [votingId, setVotingId] = useState<string | null>(null);

  const loadData = async () => {
    if (!condoId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await fetchWithAuth(`/consultations?condoId=${condoId}`).catch(() => []);
      const list = Array.isArray(res) ? res : [];
      setConsultations(list);

      // Cargar elegibilidad en paralelo para cada consulta
      const elMap: Record<string, any[]> = {};
      await Promise.allSettled(
        list.map(async (c) => {
          try {
            const elData = await fetchWithAuth(`/consultations/${c.id}/my-eligibility`);
            elMap[c.id] = elData?.units || [];
          } catch {}
        })
      );
      setEligibilityMap(elMap);
    } catch (e) {
      console.error('Error cargando consultas:', e);
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

  const toggleExpand = async (cId: string) => {
    if (expandedId === cId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(cId);
    if (!optionsMap[cId]) {
      try {
        const full = await fetchWithAuth(`/consultations/${cId}`);
        setOptionsMap((prev) => ({ ...prev, [cId]: full?.options || [] }));
      } catch (err) {
        console.error('Error cargando opciones:', err);
      }
    }
  };

  const handleVote = async (consultationId: string, optionId: string) => {
    const units = eligibilityMap[consultationId] || [];
    const pendingUnit = units.find((u) => !u.alreadyVoted) || units[0];

    if (!pendingUnit) {
      Alert.alert('No elegible', 'No tienes unidades asignadas habilitadas para votar en esta consulta.');
      return;
    }

    setVotingId(consultationId);
    try {
      await fetchWithAuth(`/consultations/${consultationId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId,
          propertyUnitId: pendingUnit.propertyUnitId,
        }),
      });
      Alert.alert('¡Voto Emitido!', 'Tu voto ha sido registrado y procesado exitosamente.');
      loadData();
    } catch (err: any) {
      Alert.alert('No se pudo votar', err?.message || 'Error al emitir el voto');
    } finally {
      setVotingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10, padding: 4 }}>
          <ArrowLeft size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Consultas y Asambleas</Text>
          <Text style={styles.headerSubtitle}>
            {selectedCondo ? selectedCondo.name : 'Votaciones Digitales'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando consultas...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
          {consultations.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MessageSquareMore size={44} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No hay consultas abiertas</Text>
              <Text style={styles.emptySubtitle}>
                Cuando la junta convoque a una votación o asamblea digital, podrás ejercer tu voto aquí.
              </Text>
            </View>
          ) : (
            consultations.map((c) => {
              const status = c.status || 'DRAFT';
              const isPublished = status === 'PUBLISHED' || status === 'OPEN';
              const isClosed = status === 'CLOSED';
              const isExpanded = expandedId === c.id;
              const options = optionsMap[c.id] || c.options || [];
              const units = eligibilityMap[c.id] || [];
              const alreadyVoted = units.length > 0 && units.every((u) => u.alreadyVoted);

              return (
                <View key={c.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.consultationTitle}>{c.title}</Text>
                      <Text style={styles.consultationDates}>
                        {c.end_date ? `Cierre: ${new Date(c.end_date).toLocaleDateString('es-VE')}` : 'Fecha abierta'}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: isPublished ? '#dcfce7' : isClosed ? '#f1f5f9' : '#fef3c7',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color: isPublished ? '#15803d' : isClosed ? '#64748b' : '#b45309',
                          },
                        ]}
                      >
                        {isPublished ? 'EN CURSO' : isClosed ? 'CERRADA' : status}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.consultationDesc}>{c.description || 'Consulta comunitaria para propietarios.'}</Text>

                  {alreadyVoted && (
                    <View style={styles.votedNotice}>
                      <CheckCircle2 size={16} color="#059669" />
                      <Text style={styles.votedNoticeText}>Ya has participado en esta votación</Text>
                    </View>
                  )}

                  {/* Botón para expandir opciones o votar */}
                  <TouchableOpacity
                    style={styles.toggleBtn}
                    onPress={() => toggleExpand(c.id)}
                    activeOpacity={0.7}
                  >
                    <Vote size={16} color="#059669" />
                    <Text style={styles.toggleBtnText}>
                      {isExpanded ? 'Ocultar Opciones' : isPublished ? 'Ver Opciones y Votar' : 'Ver Opciones'}
                    </Text>
                  </TouchableOpacity>

                  {/* Opciones desplegables */}
                  {isExpanded && (
                    <View style={styles.optionsSection}>
                      <Text style={styles.optionsTitle}>Opciones registradas:</Text>
                      {options.length === 0 ? (
                        <ActivityIndicator size="small" color="#059669" style={{ marginVertical: 8 }} />
                      ) : (
                        options.map((opt: any) => (
                          <TouchableOpacity
                            key={opt.id}
                            style={[
                              styles.optionBtn,
                              alreadyVoted && { opacity: 0.6 },
                            ]}
                            onPress={() => handleVote(c.id, opt.id)}
                            disabled={!isPublished || alreadyVoted || votingId === c.id}
                            activeOpacity={0.7}
                          >
                            <Vote size={16} color="#059669" />
                            <Text style={styles.optionBtnText}>{opt.title || opt.label || opt.text}</Text>
                          </TouchableOpacity>
                        ))
                      )}
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
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, gap: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  consultationTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  consultationDates: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  consultationDesc: { fontSize: 13, color: '#334155', lineHeight: 20 },
  votedNotice: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ecfdf5', padding: 10, borderRadius: 8 },
  votedNoticeText: { fontSize: 12, color: '#059669', fontWeight: '600' },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingVertical: 10,
    borderRadius: 8,
  },
  toggleBtnText: { color: '#059669', fontWeight: '700', fontSize: 13 },
  optionsSection: { gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  optionsTitle: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
  },
  optionBtnText: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
});
