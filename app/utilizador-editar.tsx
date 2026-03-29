import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { api, type AuthUser } from '@/services/api';
import { getErrorMessage } from '@/utils/errorMessage';

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'stock_auditor', label: 'Auditor de stock' },
  { value: 'auditor', label: 'Auditor (legado)' },
  { value: 'cashier', label: 'Caixa' },
  { value: 'worker', label: 'Operador' },
];

export default function UtilizadorEditarScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('cashier');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!id) {
      setLoading(false);
      return;
    }
    api.auth
      .listUsers()
      .then((list) => {
        const u = list.find((x) => x.id === Number(id));
        if (mounted && u) {
          setUser(u);
          setDisplayName(u.display_name ?? '');
          setRole(u.role);
        }
      })
      .catch((e) => mounted && setError(getErrorMessage(e)))
      .finally(() => mounted && setLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!user) return;
    if (password.length > 0 && password.length < 4) {
      setError('A nova palavra-passe deve ter pelo menos 4 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: { display_name?: string; role?: string; password?: string } = {
        display_name: displayName.trim() || undefined,
        role,
      };
      if (password.trim()) payload.password = password.trim();
      await api.auth.updateUser(user.id, payload);
      Alert.alert('Guardado', 'Alterações guardadas.', [
        { text: 'OK', onPress: () => router.replace('/utilizadores') },
      ]);
      router.replace('/utilizadores');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>{loading ? 'A carregar…' : 'Utilizador não encontrado.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Editar utilizador</Text>
          <Text style={styles.subtitle}>Utilizador: {user.username} (nome não editável)</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Nome a mostrar</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Nome a mostrar"
              placeholderTextColor="#64748b"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Função</Text>
            <View style={styles.roleRow}>
              {ROLES.map((r) => (
                <Pressable
                  key={r.value}
                  style={[styles.roleChip, role === r.value && styles.roleChipSelected]}
                  onPress={() => setRole(r.value)}>
                  <Text style={[styles.roleChipText, role === r.value && styles.roleChipTextSelected]}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Nova palavra-passe (deixar vazio para não alterar)</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry
            />
          </View>

          <Pressable
            style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
            onPress={handleSave}
            disabled={saving}>
            <Text style={styles.submitBtnText}>{saving ? 'A guardar…' : 'Guardar'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0f172a' },
  container: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: '#94a3b8' },
  title: { fontSize: 22, fontWeight: '700', color: '#f1f5f9' },
  subtitle: { fontSize: 14, color: '#94a3b8', marginTop: 4, marginBottom: 20 },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: '#7f1d1d', marginBottom: 16 },
  errorText: { color: '#fee2e2', fontSize: 13 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#cbd5e1', marginBottom: 6 },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    backgroundColor: '#1e293b',
    color: '#f1f5f9',
  },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  roleChipSelected: { borderColor: '#64748b', backgroundColor: '#334155' },
  roleChipText: { fontSize: 14, color: '#94a3b8' },
  roleChipTextSelected: { color: '#f1f5f9', fontWeight: '600' },
  submitBtn: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 10,
    backgroundColor: '#15803d',
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#475569', opacity: 0.8 },
  submitBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
