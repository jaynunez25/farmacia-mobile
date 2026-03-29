import { useState } from 'react';
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
import { useRouter } from 'expo-router';

import { api } from '@/services/api';
import { getErrorMessage } from '@/utils/errorMessage';

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'stock_auditor', label: 'Auditor de stock' },
  { value: 'cashier', label: 'Caixa' },
  { value: 'worker', label: 'Operador' },
];

export default function UtilizadorCriarScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('cashier');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const u = username.trim();
    const p = password.trim();
    if (!u) {
      setError('Nome de utilizador é obrigatório.');
      return;
    }
    if (p.length < 4) {
      setError('A palavra-passe deve ter pelo menos 4 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.auth.createUser({
        username: u,
        password: p,
        display_name: displayName.trim() || undefined,
        role,
      });
      Alert.alert('Utilizador criado', `"${u}" foi adicionado com sucesso.`, [
        { text: 'OK', onPress: () => router.replace('/utilizadores') },
      ]);
      router.replace('/utilizadores');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Novo utilizador</Text>
          <Text style={styles.subtitle}>Preenche os dados. A função define as permissões na aplicação.</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Nome de utilizador *</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(t) => { setUsername(t); setError(null); }}
              placeholder="ex: maria.silva"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Palavra-passe * (mín. 4 caracteres)</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); }}
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              secureTextEntry
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Nome a mostrar</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Maria Silva"
              placeholderTextColor="#64748b"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Função *</Text>
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

          <Pressable
            style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
            onPress={handleCreate}
            disabled={saving}>
            <Text style={styles.submitBtnText}>{saving ? 'A guardar…' : 'Criar utilizador'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0f172a' },
  container: { padding: 16, paddingBottom: 32 },
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
