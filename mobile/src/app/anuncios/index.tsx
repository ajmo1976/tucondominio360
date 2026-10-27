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
import { ArrowLeft } from 'lucide-react-native';
import {
  Megaphone,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Calendar,
} from 'lucide-react-native';
import { fetchWithAuth } from '../../lib/api';
import { useCondo } from '../../contexts/CondoContext';

export default function AnunciosScreen() {
  const router = useRouter();
  const { selectedCondo } = useCondo();
  const condoId = selectedCondo?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [myAcks, setMyAcks] = useState<string[]>([]);
  const [ackingId, setAckingId] = useState<string | null>(null);

  const loadData = async () => {
    if (!condoId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [list, acks] = await Promise.all([
        fetchWithAuth(`/announcements?condoId=${condoId}`).catch(() => []),
        fetchWithAuth(`/announcements/my-acks?condoId=${condoId}`).catch(() => []),
      ]);
      setAnnouncements(Array.isArray(list) ? list : []);
      const ackIds = Array.isArray(acks) ? acks.map((a: any) => a.announcement_id || a.id) : [];
      setMyAcks(ackIds);
    } catch (e) {
      console.error('Error cargando anuncios:', e);
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

  const handleAcknowledge = async (id: string) => {
    setAckingId(id);
    try {
      await fetchWithAuth(`/announcements/${id}/acknowledge?condoId=${condoId}`, {
        method: 'POST',
      });
      setMyAcks((prev) => [...prev, id]);
      Alert.alert('Acuse registrado', 'Has confirmado la lectura de este comunicado.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo confirmar la lectura');
    } finally {
      setAckingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 10, padding: 4 }}>
          <ArrowLeft size={22} color="#0f172a" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Cartelera Digital</Text>
          <Text style={styles.headerSubtitle}>
            {selectedCondo ? selectedCondo.name : 'Comunicados Oficiales'}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Cargando comunicados...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
          {announcements.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Megaphone size={44} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No hay anuncios publicados</Text>
              <Text style={styles.emptySubtitle}>
                Los comunicados de la junta o administración aparecerán aquí.
              </Text>
            </View>
          ) : (
            announcements.map((a) => {
              const hasAcked = myAcks.includes(a.id);
              const isProcessing = ackingId === a.id;
              const isUrgent = a.priority === 'URGENT' || a.priority === 'HIGH';

              return (
                <View key={a.id} style={[styles.card, isUrgent && styles.cardUrgent]}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.announcementTitle}>{a.title}</Text>
                      <Text style={styles.announcementDate}>
                        Publicado: {new Date(a.created_at || a.published_at).toLocaleDateString('es-VE')}
                      </Text>
                    </View>
                    {isUrgent && (
                      <View style={styles.urgentBadge}>
                        <Text style={styles.urgentText}>IMPORTANTE</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.announcementBody}>{a.content || a.body}</Text>

                  {/* Acuse de Recibo */}
                  {a.require_acknowledgement && (
                    <View style={styles.ackBox}>
                      {hasAcked ? (
                        <View style={styles.ackedRow}>
                          <CheckCircle2 size={16} color="#059669" />
                          <Text style={styles.ackedText}>Lectura confirmada</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.ackBtn}
                          onPress={() => handleAcknowledge(a.id)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <>
                              <CheckCircle2 size={16} color="#fff" />
                              <Text style={styles.ackBtnText}>Confirmar lectura y enterado</Text>
                            </>
                          )}
                        </TouchableOpacity>
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
  cardUrgent: { borderColor: '#fca5a5', borderLeftWidth: 4, borderLeftColor: '#e11d48' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  announcementTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  announcementDate: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  urgentBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  urgentText: { fontSize: 10, fontWeight: '800', color: '#b91c1c' },
  announcementBody: { fontSize: 13, color: '#334155', lineHeight: 20 },
  ackBox: { paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  ackedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ackedText: { fontSize: 12, fontWeight: '600', color: '#059669' },
  ackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 8,
  },
  ackBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
