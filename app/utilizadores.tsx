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
import { useRouter } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { api, type AuthUser } from '@/services/api';
import { getErrorMessage } from '@/utils/errorMessage';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  stock_auditor: 'Auditor de stock',
  auditor: 'Auditor (legado)',
  cashier: 'Caixa',
  worker: 'Operador',
};

const ROLE_BG: Record<string, string> = {
  admin: '#1e3a5f',
  stock_auditor: '#78350f',
  auditor: '#78350f',
  cashier: '#334155',
  worker: '#334155',
};

export default function UtilizadoresScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await api.auth.listUsers();
      setUsers(list);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    load();
  }, [currentUser?.role, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const handleDelete = (u: AuthUser) => {
    if (u.id === currentUser?.id) {
      Alert.alert('Não permitido', 'Não pode eliminar a sua própria conta.');
      return;
    }
    Alert.alert(
      'Eliminar utilizador',
      `Tem a certeza que deseja eliminar "${u.username}"? Esta acção não pode ser anulada.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(u.id);
            setError(null);
            try {
              await api.auth.deleteUser(u.id);
              await load();
            } catch (e) {
              setError(getErrorMessage(e));
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  if (currentUser?.role !== 'admin') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.blockContainer}>
          <Text style={styles.blockTitle}>Acesso restrito</Text>
          <Text style={styles.blockText}>
            Apenas administradores podem gerir utilizadores. O teu perfil: {currentUser?.role ?? '—'}.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#94a3b8" />
        }>
        <Text style={styles.title}>Utilizadores</Text>
        <Text style={styles.subtitle}>
          Lista de utilizadores e funções. Só administradores podem criar, editar ou eliminar.
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          onPress={() => router.push('/utilizador-criar')}>
          <Text style={styles.addButtonText}>Adicionar utilizador</Text>
        </Pressable>

        {loading && !users.length ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#64748b" />
          </View>
        ) : users.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Ainda não há utilizadores.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {users.map((u) => (
              <View key={u.id} style={styles.card}>
                <Pressable
                  style={({ pressed }) => [styles.cardMain, pressed && styles.cardPressed]}
                  onPress={() => router.push({ pathname: '/utilizador-editar', params: { id: String(u.id) } })}>
                  <Text style={styles.cardUsername}>{u.username}</Text>
                  <Text style={styles.cardDisplayName}>{u.display_name || '—'}</Text>
                  <View style={[styles.roleBadge, { backgroundColor: ROLE_BG[u.role] ?? '#334155' }]}>
                    <Text style={styles.roleBadgeText}>{ROLE_LABELS[u.role] ?? u.role}</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    (pressed || deletingId === u.id) && styles.deleteBtnPressed,
                  ]}
                  onPress={() => handleDelete(u)}
                  disabled={deletingId !== null}>
                  <Text style={styles.deleteBtnText}>
                    {deletingId === u.id ? '…' : 'Eliminar'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
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
    marginBottom: 16,
  },
  blockContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  blockText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
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
  addButton: {
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#15803d',
    alignItems: 'center',
    marginBottom: 20,
  },
  addButtonPressed: {
    opacity: 0.9,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  center: {
    marginTop: 24,
    alignItems: 'center',
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#94a3b8',
  },
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  cardMain: {
    flex: 1,
    padding: 14,
  },
  cardPressed: {
    backgroundColor: '#334155',
  },
  cardUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  cardDisplayName: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  deleteBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  deleteBtnPressed: {
    backgroundColor: '#450a0a',
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f87171',
  },
});
