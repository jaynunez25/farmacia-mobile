import { useState } from 'react';
import {
  ActivityIndicator,
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

import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';

export default function LoginScreen() {
  const { login, isLoading, isAuthenticated } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = isLoading || submitting;

  const handleSubmit = async () => {
    if (loading) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      // Helpful for debugging backend / network issues during development.
      // eslint-disable-next-line no-console
      console.error('Login failed', err);
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !username.trim() || !password || loading;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Entrar</Text>
            <Text style={styles.subtitle}>Acede ao painel da farmácia.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Utilizador</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                textContentType="username"
                placeholder="nome.utilizador"
                placeholderTextColor="#9ca3af"
                style={styles.input}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Palavra-passe</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={disabled}
              style={({ pressed }) => [
                styles.button,
                disabled && styles.buttonDisabled,
                pressed && !disabled && styles.buttonPressed,
              ]}>
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Iniciar sessão</Text>
              )}
            </Pressable>

            {isAuthenticated && (
              <Text style={styles.smallNote}>
                Já está autenticado. Pode navegar para o painel.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 80,
    paddingBottom: 32,
    justifyContent: 'flex-start',
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#e5e7eb',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#9ca3af',
  },
  form: {
    gap: 18,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    color: '#d1d5db',
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 12,
    backgroundColor: '#020617',
    color: '#f9fafb',
  },
  errorBox: {
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#7f1d1d',
  },
  errorText: {
    color: '#fee2e2',
    fontSize: 13,
  },
  button: {
    marginTop: 8,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
  },
  buttonDisabled: {
    backgroundColor: '#4b5563',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
  },
  smallNote: {
    marginTop: 8,
    fontSize: 12,
    color: '#9ca3af',
  },
});

