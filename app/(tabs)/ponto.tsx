import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import { api } from '@/services/api';
import { getErrorMessage } from '@/utils/errorMessage';

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('pt-PT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function PontoScreen() {
  const [status, setStatus] = useState<{
    clocked_in_at: string | null;
    clocked_out_at: string | null;
    is_clocked_in: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<'in' | 'out' | null>(null);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const data = await api.attendance.getStatus();
      setStatus(data);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStatus();
  }, [loadStatus]);

  const requestLocationAndClock = async (type: 'in' | 'out') => {
    setError(null);
    setActionLoading(type);
    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (permStatus !== 'granted') {
        setError('É necessário permitir a localização para marcar ponto no local de trabalho.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      if (type === 'in') {
        await api.attendance.clockIn({ latitude, longitude });
        Alert.alert('Entrada registada', 'Clock in efectuado com sucesso.');
      } else {
        await api.attendance.clockOut({ latitude, longitude });
        Alert.alert('Saída registada', 'Clock out efectuado com sucesso.');
      }
      await loadStatus();
    } catch (e) {
      const msg = getErrorMessage(e);
      setError(msg);
      Alert.alert('Erro', msg);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#94a3b8" />
        }>
        <Text style={styles.title}>Marcação de ponto</Text>
        <Text style={styles.subtitle}>
          Só pode marcar entrada e saída quando estiver no local de trabalho (geolocalização).
        </Text>

        {loading && !status && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#64748b" />
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {status && (
          <>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Estado de hoje</Text>
              <View style={styles.statusRow}>
                <Text style={styles.statusKey}>Entrada:</Text>
                <Text style={styles.statusValue}>{formatTime(status.clocked_in_at)}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusKey}>Saída:</Text>
                <Text style={styles.statusValue}>{formatTime(status.clocked_out_at)}</Text>
              </View>
              <View style={[styles.badge, status.is_clocked_in ? styles.badgeIn : styles.badgeOut]}>
                <Text style={styles.badgeText}>
                  {status.is_clocked_in ? 'Dentro do local' : 'Fora / Não marcou entrada'}
                </Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnIn,
                  (pressed || actionLoading === 'in') && styles.btnPressed,
                ]}
                onPress={() => requestLocationAndClock('in')}
                disabled={actionLoading !== null}>
                {actionLoading === 'in' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnText}>Marcar entrada (Clock in)</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnOut,
                  (pressed || actionLoading === 'out') && styles.btnPressed,
                ]}
                onPress={() => requestLocationAndClock('out')}
                disabled={actionLoading !== null}>
                {actionLoading === 'out' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnText}>Marcar saída (Clock out)</Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
    marginBottom: 20,
  },
  center: {
    marginTop: 24,
    alignItems: 'center',
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#7f1d1d',
    marginBottom: 16,
  },
  errorText: {
    color: '#fee2e2',
    fontSize: 13,
  },
  statusCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusKey: {
    fontSize: 15,
    color: '#cbd5e1',
  },
  statusValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  badgeIn: {
    backgroundColor: '#166534',
  },
  badgeOut: {
    backgroundColor: '#374151',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  actions: {
    gap: 12,
  },
  btn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIn: {
    backgroundColor: '#15803d',
  },
  btnOut: {
    backgroundColor: '#b91c1c',
  },
  btnPressed: {
    opacity: 0.85,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
