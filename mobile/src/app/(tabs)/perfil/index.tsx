import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { User, Mail, Phone, FileText, Shield, LogOut, Building2 } from 'lucide-react-native';
import { useAuth } from '../../../contexts/AuthContext';

export default function PerfilScreen() {
  const router = useRouter();
  const { session, logout } = useAuth();
  const user = session?.user;

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/(auth)/login');
    } catch (e) {
      console.error('Error al cerrar sesión:', e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mi Perfil</Text>
        <Text style={styles.headerSubtitle}>Información de la cuenta y sesión</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Avatar y Nombre */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.firstName?.[0] || 'U').toUpperCase()}
              {(user?.lastName?.[0] || '').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.userName}>
            {user?.firstName} {user?.lastName}
          </Text>
          <View style={styles.roleBadge}>
            <Shield size={12} color="#059669" />
            <Text style={styles.roleText}>
              {user?.isSuperadmin ? 'Super Administrador' : 'Propietario'}
            </Text>
          </View>
        </View>

        {/* Datos Personales */}
        <View style={styles.infoCard}>
          <Text style={styles.cardSectionTitle}>Datos Personales</Text>

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Mail size={16} color="#64748b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Correo Electrónico</Text>
              <Text style={styles.infoValue}>{user?.email || '—'}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Phone size={16} color="#64748b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Teléfono</Text>
              <Text style={styles.infoValue}>{user?.phone || 'No registrado'}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <FileText size={16} color="#64748b" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Documento de Identidad</Text>
              <Text style={styles.infoValue}>
                {user?.docType ? `${user.docType}-${user.docNumber}` : user?.docNumber || 'No registrado'}
              </Text>
            </View>
          </View>
        </View>

        {/* Residencias Conectadas */}
        {session?.condos && session.condos.length > 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.cardSectionTitle}>Residencias Asociadas</Text>
            {session.condos.map((c: any, idx: number) => (
              <View key={c.condo_id || idx} style={styles.condoRow}>
                <Building2 size={16} color="#059669" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.condoName}>{c.condo_name}</Text>
                  <Text style={styles.condoRole}>{c.role || 'Propietario'}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Botón Cerrar Sesión */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <LogOut size={18} color="#e11d48" />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>TuCondominio360 v1.0.0 · Mobile</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  scroll: { padding: 16, gap: 14 },
  userCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 20, alignItems: 'center', gap: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  userName: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#a7f3d0' },
  roleText: { fontSize: 11, fontWeight: '700', color: '#059669' },
  infoCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, gap: 14 },
  cardSectionTitle: { fontSize: 12, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: '#64748b' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginTop: 1 },
  condoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  condoName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  condoRole: { fontSize: 11, color: '#64748b' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca', paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  logoutText: { fontSize: 14, fontWeight: '700', color: '#e11d48' },
  versionText: { textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 8 },
});
