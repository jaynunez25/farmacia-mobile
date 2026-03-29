import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import type { SaleHistoryRecord, SaleHistoryResponse } from '@/types';
import { getErrorMessage } from '@/utils/errorMessage';
import { isAdminRole } from '@/utils/roles';

type SaleHistoryRow = {
  sale_id: number;
  date: string;
  total: number;
};

export default function HistoricoVendasScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [history, setHistory] = useState<SaleHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    daily_total: string;
    monthly_total: string;
    filtered_total: string | null;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [hist, sum] = await Promise.all([
        api.sales.getHistory({ skip: 0, limit: 100 }),
        api.sales.getHistorySummary({}),
      ]);
      setHistory(hist);
      setSummary(sum);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (!isAdminRole(user.role)) {
      router.replace('/(tabs)/dashboard');
      return;
    }
    void load();
  }, [user, router]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const rows: SaleHistoryRow[] = useMemo(() => {
    if (!history) return [];
    const map = new Map<number, { total: number; date: string }>();
    for (const item of history.items as SaleHistoryRecord[]) {
      const prev = map.get(item.sale_id);
      const lineTotal = Number(item.total_price);
      if (!prev) {
        map.set(item.sale_id, {
          total: lineTotal,
          date: item.sold_at,
        });
      } else {
        prev.total += lineTotal;
      }
    }
    return Array.from(map.entries())
      .map(([sale_id, v]) => ({ sale_id, total: v.total, date: v.date }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [history]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />
        }>
        <Text style={styles.title}>Histórico de vendas</Text>
        <Text style={styles.subtitle}>
          Consulta vendas recentes, totais e abre detalhes de cada venda.
        </Text>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        )}

        {!loading && error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Erro</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && summary && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Resumo</Text>
            <Text style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>Hoje: </Text>
              {summary.daily_total} Kz
            </Text>
            <Text style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>Este mês: </Text>
              {summary.monthly_total} Kz
            </Text>
            {summary.filtered_total != null && (
              <Text style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>Filtrado: </Text>
                {summary.filtered_total} Kz
              </Text>
            )}
          </View>
        )}

        {!loading && !error && (
          <View style={styles.listCard}>
            {rows.length === 0 ? (
              <Text style={styles.emptyText}>Ainda não há vendas registadas.</Text>
            ) : (
              rows.map(row => {
                const date = new Date(row.date);
                const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
                return (
                  <View
                    key={row.sale_id}
                    style={styles.row}
                    // eslint-disable-next-line react/no-unstable-nested-components
                    onTouchEnd={() =>
                      router.push({
                        pathname: '/venda',
                        params: { id: String(row.sale_id) },
                      })
                    }>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>Venda #{row.sale_id}</Text>
                      <Text style={styles.rowSubtitle}>{dateStr}</Text>
                    </View>
                    <Text style={styles.rowAmount}>{row.total.toFixed(2)} Kz</Text>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  container: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#9ca3af',
  },
  center: {
    marginTop: 32,
    alignItems: 'center',
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#7f1d1d',
  },
  errorTitle: {
    fontWeight: '600',
    color: '#fee2e2',
    marginBottom: 4,
  },
  errorText: {
    color: '#fee2e2',
    fontSize: 13,
  },
  summaryCard: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
    gap: 4,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  summaryLine: {
    fontSize: 13,
    color: '#e5e7eb',
  },
  summaryLabel: {
    fontWeight: '600',
  },
  listCard: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fbbf24',
    marginLeft: 8,
  },
});

