import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { StatusBar } from 'expo-status-bar';

import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';

/** Pharmaos-aligned palette (health / SaaS, light surfaces). */
const BG = '#F8FAFC';
const SURFACE = '#FFFFFF';
const TEXT_PRIMARY = '#0F172A';
const TEXT_MUTED = '#64748B';
const TEXT_SUBTLE = '#94A3B8';
const BORDER = '#E2E8F0';
const BORDER_FOCUS = '#2563EB';
const BRAND_BLUE = '#2563EB';
const BRAND_BLUE_PRESSED = '#1D4ED8';
/** Subtle Pharmaos “os” accent — thin rule only, no extra chrome. */
const BRAND_GREEN = '#15803D';
const ERROR_BG = '#FEF2F2';
const ERROR_BORDER = '#FECACA';
const ERROR_TEXT = '#991B1B';
const DISABLED_BG = '#E2E8F0';
const DISABLED_TEXT = '#94A3B8';

const LOGO = require('@/assets/images/pharmaos-logo.png');

export default function LoginScreen() {
  const { login, isLoading, isAuthenticated } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'user' | 'pass' | null>(null);

  const loading = isLoading || submitting;

  const handleSubmit = async () => {
    if (loading) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      console.error('Login failed', err);
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = !username.trim() || !password || loading;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.topSection}>
            <View style={styles.brandBlock}>
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />
              <Text style={styles.screenTitle}>Entrar</Text>
              <Text style={styles.screenSubtitle}>
                Aceda ao painel da sua farmácia de forma segura.
              </Text>
              <View style={styles.brandAccentRule} importantForAccessibility="no" />
            </View>
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
                placeholderTextColor={TEXT_SUBTLE}
                style={[
                  styles.input,
                  focusedField === 'user' && styles.inputFocused,
                ]}
                onFocus={() => setFocusedField('user')}
                onBlur={() => setFocusedField((f) => (f === 'user' ? null : f))}
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
                placeholderTextColor={TEXT_SUBTLE}
                style={[
                  styles.input,
                  focusedField === 'pass' && styles.inputFocused,
                ]}
                onFocus={() => setFocusedField('pass')}
                onBlur={() => setFocusedField((f) => (f === 'pass' ? null : f))}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={disabled}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              style={({ pressed }) => [
                styles.primaryButton,
                disabled && !loading && styles.primaryButtonDisabled,
                !disabled && pressed && styles.primaryButtonPressed,
              ]}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={[
                    styles.primaryButtonText,
                    disabled && styles.primaryButtonTextDisabled,
                  ]}>
                  Iniciar sessão
                </Text>
              )}
            </Pressable>

            {isAuthenticated ? (
              <Text style={styles.smallNote}>
                Já está autenticado. Pode navegar para o painel.
              </Text>
            ) : null}
          </View>

          <View style={styles.bottomSpacer} />

          <Text style={styles.footerHint}>Uso exclusivo de equipas autorizadas.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 28,
  },
  topSection: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  brandBlock: {
    alignItems: 'center',
  },
  logo: {
    width: 200,
    height: 76,
    marginBottom: 28,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  screenSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: TEXT_MUTED,
    textAlign: 'center',
    maxWidth: 320,
    paddingHorizontal: 8,
  },
  brandAccentRule: {
    marginTop: 20,
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: BRAND_GREEN,
  },
  form: {
    marginTop: 32,
    gap: 20,
  },
  bottomSpacer: {
    flexGrow: 1,
    minHeight: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    letterSpacing: 0.2,
  },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: BORDER,
    paddingHorizontal: 15,
    backgroundColor: SURFACE,
    color: TEXT_PRIMARY,
    fontSize: 16,
  },
  inputFocused: {
    borderColor: BORDER_FOCUS,
  },
  errorBox: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: ERROR_BG,
    borderWidth: 1,
    borderColor: ERROR_BORDER,
  },
  errorText: {
    color: ERROR_TEXT,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 4,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_BLUE,
  },
  primaryButtonDisabled: {
    backgroundColor: DISABLED_BG,
  },
  primaryButtonPressed: {
    backgroundColor: BRAND_BLUE_PRESSED,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  primaryButtonTextDisabled: {
    color: DISABLED_TEXT,
  },
  smallNote: {
    marginTop: 4,
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerHint: {
    marginTop: 24,
    fontSize: 12,
    color: TEXT_SUBTLE,
    textAlign: 'center',
    lineHeight: 17,
  },
});
