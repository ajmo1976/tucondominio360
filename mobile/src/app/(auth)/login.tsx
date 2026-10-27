import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Building2, Mail, Lock, ArrowRight } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { ApiError } from '../../lib/api';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@test.com');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email || !password) {
      setError('Ingresa correo y contraseña');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (err: any) {
      const message = err instanceof ApiError ? err.message : err?.message || 'No se pudo iniciar sesión';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.content}>
          <View style={styles.logoSection}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>360</Text>
            </View>
            <Text style={styles.brandName}>
              TuCondominio<Text style={styles.brandAccent}>360</Text>
            </Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconCircle}>
                <Building2 size={22} color="#10b981" />
              </View>
              <Text style={styles.title}>Inicia sesión</Text>
              <Text style={styles.subtitle}>Accede al portal de propietarios</Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Correo Electrónico</Text>
                <View style={styles.inputWrapper}>
                  <Mail size={18} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="tu@correo.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Contraseña</Text>
                <View style={styles.inputWrapper}>
                  <Lock size={18} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <View style={styles.buttonContent}>
                    <Text style={styles.buttonText}>Entrar a la aplicación</Text>
                    <ArrowRight size={18} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.footer}>© 2026 TuCondominio360</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 24 },
  logoSection: { alignItems: 'center', marginBottom: 32, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  logoCircle: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#0f172a', fontWeight: '900', fontSize: 18 },
  brandName: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  brandAccent: { color: '#059669' },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 24, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 10 },
  cardHeader: { marginBottom: 20 },
  iconCircle: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  errorBox: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { color: '#991b1b', fontSize: 13 },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: '#334155' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#fff' },
  inputIcon: { marginLeft: 12 },
  input: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, fontSize: 14, color: '#0f172a' },
  button: { backgroundColor: '#059669', borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  footer: { textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 24 },
});
