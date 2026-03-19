import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { api } from '@/services/api';
import type { DashboardStats, ExpiryAlertsResponse, Product } from '@/types';
import { getDaysUntilExpiry } from '@/utils/dashboardHelpers';
import { getErrorMessage } from '@/utils/errorMessage';

type AlertFilter =
  | 'low_stock'
  | 'expired'
  | 'expiring_30'
  | 'expiring_60'
  | 'expiring_90';

const FILTERS: { key: AlertFilter; label: string }[] = [
  { key: 'low_stock', label: 'Stock baixo' },
  { key: 'expired', label: 'Expirados' },
  { key: 'expiring_30', label: '30 dias' },
  { key: 'expiring_60', label: '60 dias' },
  { key: 'expiring_90', label: '90 dias' },
];

function getProductsForFilter(
  filter: AlertFilter,
  dashboard: DashboardStats | null,
  expiry: ExpiryAlertsResponse | null,
): Product[] {
  if (!expiry && !dashboard) return [];
  switch (filter) {
    case 'low_stock':
      return dashboard?.low_stock_products ?? [];
    case 'expired':
      return expiry?.expired ?? [];
    case 'expiring_30':
      return expiry?.expiring_30 ?? [];
    case 'expiring_60':
      return expiry?.expiring_60 ?? [];
    case 'expiring_90':
      return expiry?.expiring_90 ?? [];
    default:
      return [];
  }
}

function getCountForFilter(
  filter: AlertFilter,
  dashboard: DashboardStats | null,
  expiry: ExpiryAlertsResponse | null,
): number {
  if (!expiry && !dashboard) return 0;
  switch (filter) {
    case 'low_stock':
      return dashboard?.low_stock_count ?? 0;
    case 'expired':
      return expiry?.counts?.expired ?? 0;
    case 'expiring_30':
      return expiry?.counts?.expiring_30 ?? 0;
    case 'expiring_60':
      return expiry?.counts?.expiring_60 ?? 0;
    case 'expiring_90':
      return expiry?.counts?.expiring_90 ?? 0;
    default:
      return 0;
  }
}

function getSubtitleForProduct(p: Product, filter: AlertFilter): string {
  if (filter === 'low_stock') {
    const critical = p.stock_quantity === 0;
    return critical
      ? 'Stock esgotado'
      : `Stock: ${p.stock_quantity} (mín: ${p.minimum_stock ?? 0})`;
  }
  if (filter === 'expired') return 'Produto expirado';
  const days = getDaysUntilExpiry(p.expiry_date);
  if (days === null) return p.expiry_date ?? '—';
  if (days <= 0) return 'Expirado';
  return `Expira em ${days} dias`;
}

export default function AlertasScreen() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [expiry, setExpiry] = useState<ExpiryAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AlertFilter>('low_stock');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dashboardData, expiryData] = await Promise.all([
        api.dashboard.get({
          low_stock_limit: 100,
          expiring_days: 30,
          recent_sales_count: 1,
        }),
        api.expiryAlerts.get(),
      ]);
      setDashboard(dashboardData);
      setExpiry(expiryData);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const products = getProductsForFilter(filter, dashboard, expiry);
  const counts = {
    low_stock: getCountForFilter('low_stock', dashboard, expiry),
    expired: getCountForFilter('expired', dashboard, expiry),
    expiring_30: getCountForFilter('expiring_30', dashboard, expiry),
    expiring_60: getCountForFilter('expiring_60', dashboard, expiry),
    expiring_90: getCountForFilter('expiring_90', dashboard, expiry),
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#94a3b8"
          />
        }>
        <Text style={styles.title}>Alertas</Text>
        <Text style={styles.subtitle}>
          Stock baixo e produtos em risco de expirar ou já expirados. Toca num item para abrir o
          produto.
        </Text>

        {loading && !dashboard && !expiry && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#64748b" />
            <Text style={styles.loadingText}>A carregar alertas…</Text>
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Erro</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {(dashboard || expiry) && !error && (
          <>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, styles.summaryLow]}>
                <Text style={styles.summaryValue}>{counts.low_stock}</Text>
                <Text style={styles.summaryLabel}>Stock baixo</Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryExpired]}>
                <Text style={styles.summaryValue}>{counts.expired}</Text>
                <Text style={styles.summaryLabel}>Expirados</Text>
              </View>
              <View style={[styles.summaryCard, styles.summaryExpiring]}>
                <Text style={styles.summaryValue}>
                  {counts.expiring_30 + counts.expiring_60 + counts.expiring_90}
                </Text>
                <Text style={styles.summaryLabel}>A expirar</Text>
              </View>
            </View>

            <View style={styles.chipRow}>
              {FILTERS.map(({ key, label }) => {
                const count = getCountForFilter(key, dashboard, expiry);
                const selected = filter === key;
                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.chip,
                      selected && styles.chipSelected,
                      filter === 'expired' && key === 'expired' && styles.chipExpired,
                    ]}
                    onPress={() => setFilter(key)}>
                    <Text
                      style={[
                        styles.chipText,
                        selected && styles.chipTextSelected,
                      ]}
                      numberOfLines={1}>
                      {label}
                    </Text>
                    <Text
                      style={[
                        styles.chipBadge,
                        selected && styles.chipBadgeSelected,
                      ]}>
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {products.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Sem itens</Text>
                <Text style={styles.emptyText}>
                  {filter === 'low_stock'
                    ? 'Nenhum produto com stock baixo ou esgotado.'
                    : filter === 'expired'
                      ? 'Nenhum produto expirado.'
                      : `Nenhum produto a expirar neste período.`}
                </Text>
              </View>
            ) : (
              <View style={styles.list}>
                {products.map((p) => (
                  <Pressable
                    key={p.id}
                    style={({ pressed }) => [
                      styles.card,
                      pressed && styles.cardPressed,
                    ]}
                    onPress={() =>
                      router.push({ pathname: '/produto', params: { id: String(p.id) } })
                    }>
                    <View style={styles.cardMain}>
                      <Text style={styles.cardName} numberOfLines={2}>
                        {p.name}
                      </Text>
                      <Text style={styles.cardSku}>SKU: {p.sku}</Text>
                      <Text style={styles.cardSubtitle}>
                        {getSubtitleForProduct(p, filter)}
                      </Text>
                    </View>
                    <View style={styles.cardMeta}>
                      <Text style={styles.cardStock}>Stock: {p.stock_quantity}</Text>
                      {p.expiry_date && (
                        <Text style={styles.cardExpiry}>{p.expiry_date}</Text>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
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
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 2,
  },
  center: {
    marginTop: 24,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: '#94a3b8',
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
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
    alignItems: 'center',
  },
  summaryLow: {
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  summaryExpired: {
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },
  summaryExpiring: {
    borderLeftWidth: 4,
    borderLeftColor: '#ca8a04',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  chipSelected: {
    backgroundColor: '#334155',
    borderColor: '#64748b',
  },
  chipExpired: {
    borderColor: '#dc2626',
  },
  chipText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  chipTextSelected: {
    color: '#f1f5f9',
    fontWeight: '600',
  },
  chipBadge: {
    fontSize: 12,
    color: '#64748b',
    minWidth: 18,
    textAlign: 'center',
  },
  chipBadgeSelected: {
    color: '#cbd5e1',
  },
  emptyBox: {
    padding: 24,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardPressed: {
    backgroundColor: '#334155',
  },
  cardMain: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  cardSku: {
    fontSize: 12,
    color: '#64748b',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  cardMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  cardStock: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  cardExpiry: {
    fontSize: 12,
    color: '#94a3b8',
  },
});
