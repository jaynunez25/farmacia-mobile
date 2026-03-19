import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/contexts/AuthContext';
import { api, type CashSessionSummary } from '@/services/api';
import type { DashboardStats } from '@/types';
import {
  countCriticalLowStock,
  getAlertCount,
  getAttentionItems,
  getDisplayName,
  getGreetingByTime,
  getPriorityAlertCopy,
  getPriorityAlertType,
} from '@/utils/dashboardHelpers';
import { getErrorMessage } from '@/utils/errorMessage';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [cashSession, setCashSession] = useState<CashSessionSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.dashboard.get({
          low_stock_limit: 5,
          expiring_days: 30,
          recent_sales_count: 5,
        });
        if (!isMounted) return;
        setStats(data);
      } catch (err) {
        if (!isMounted) return;
        setError(getErrorMessage(err));
      } finally {
        if (isMounted) setLoading(false);
      }
      api.cashSessions
        .getCurrent()
        .then((s) => isMounted && setCashSession(s))
        .catch(() => isMounted && setCashSession(null));
    };

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  const greeting = getGreetingByTime();
  const name = getDisplayName(user);
  const greetingLine = name ? `${greeting}, ${name}` : greeting;

  const alertType = stats ? getPriorityAlertType(stats) : 'none';
  const alertCopy = stats ? getPriorityAlertCopy(stats) : null;
  const alertCount = stats ? getAlertCount(stats) : 0;
  const attentionItems = stats
    ? getAttentionItems(
        stats.low_stock_products,
        stats.expiring_products,
        stats.top_sold_products,
        6,
      )
    : [];
  const criticalLowStock = stats ? countCriticalLowStock(stats.low_stock_products) : 0;

  const alertVariant = alertType;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.greeting}>{greetingLine}</Text>
          <Text style={styles.subGreeting}>
            Visão geral das operações de hoje.
          </Text>
        </View>

        {loading && !stats && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#16a34a" />
            <Text style={styles.loadingText}>A carregar dados do painel...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Não foi possível carregar o dashboard</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {stats && (
          <>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
                <ThemedText type="subtitle">Vendas de hoje</ThemedText>
                <ThemedText type="title">{stats.sales_today}</ThemedText>
              </View>
              <View style={[styles.summaryCard, styles.summaryCardSecondary]}>
                <ThemedText type="subtitle">Vendas do mês</ThemedText>
                <ThemedText type="title">{stats.sales_this_month}</ThemedText>
              </View>
            </View>

            <View style={styles.summaryRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.summaryCardWrap,
                  pressed && styles.summaryCardWrapPressed,
                ]}
                onPress={() => router.push('/(tabs)/caixa')}>
                <View style={[styles.summaryCard, styles.summaryCardNeutral]}>
                  <ThemedText type="subtitle">Caixa</ThemedText>
                  <ThemedText type="title">
                    {cashSession
                      ? (() => {
                          try {
                            const d = new Date(cashSession.session.opened_at);
                            return d.toLocaleTimeString('pt-PT', {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                          } catch {
                            return 'Aberta';
                          }
                        })()
                      : 'Fechada'}
                  </ThemedText>
                  <ThemedText style={styles.summaryCardHint}>
                    {cashSession ? 'Aberta às ' + (() => {
                      try {
                        return new Date(cashSession.session.opened_at).toLocaleTimeString('pt-PT', {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                      } catch {
                        return '—';
                      }
                    })() : 'Sem sessão'}
                  </ThemedText>
                </View>
              </Pressable>
              <View style={[styles.summaryCard, styles.summaryCardAccent]}>
                <ThemedText type="subtitle">Stock total (unid.)</ThemedText>
                <ThemedText type="title">{stats.total_stock_units}</ThemedText>
              </View>
            </View>

            <View style={styles.alertSection}>
              <Pressable
                style={({ pressed }) => [
                  styles.alertCard,
                  alertVariant === 'expired' && styles.alertCardDanger,
                  alertVariant === 'low_stock' && styles.alertCardWarning,
                  alertVariant === 'expiring' && styles.alertCardCaution,
                  alertVariant === 'none' && styles.alertCardSuccess,
                  pressed && styles.alertCardPressed,
                ]}
                android_ripple={{ color: '#1f2937' }}
                onPress={() => router.push('/(tabs)/alertas')}>
                <ThemedText type="subtitle">Alertas de inventário</ThemedText>
                {alertCopy ? (
                  <>
                    <ThemedText type="defaultSemiBold">
                      {alertCopy.title}
                    </ThemedText>
                    <ThemedText>{alertCopy.message}</ThemedText>
                    <ThemedText style={styles.alertSubtitle}>
                      {alertCopy.subtitle}
                    </ThemedText>
                    <ThemedText style={styles.alertPill}>
                      {alertCount} itens a acompanhar
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText>Sem alertas críticos neste momento.</ThemedText>
                )}
              </Pressable>
            </View>

            <View style={styles.quickActions}>
              <Text style={styles.sectionTitle}>Ações rápidas</Text>
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionChip,
                    pressed && styles.actionChipPressed,
                  ]}
                  android_ripple={{ color: '#111827' }}
                  onPress={() => router.push('/(tabs)/vendas')}>
                  <ThemedText type="defaultSemiBold">Registar venda</ThemedText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionChip,
                    pressed && styles.actionChipPressed,
                  ]}
                  android_ripple={{ color: '#111827' }}
                  onPress={() => router.push('/(tabs)/stock')}>
                  <ThemedText type="defaultSemiBold">Ver stock</ThemedText>
                </Pressable>
              </View>
              <View style={styles.actionRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionChip,
                    pressed && styles.actionChipPressed,
                  ]}
                  android_ripple={{ color: '#111827' }}
                  onPress={() => router.push('/(tabs)/caixa')}>
                  <ThemedText type="defaultSemiBold">Abrir caixa</ThemedText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionChip,
                    pressed && styles.actionChipPressed,
                  ]}
                  android_ripple={{ color: '#111827' }}
                  onPress={() => router.push('/(tabs)/alertas')}>
                  <ThemedText type="defaultSemiBold">Produtos em risco</ThemedText>
                </Pressable>
              </View>
              {user?.role === 'admin' && (
                <View style={styles.actionRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionChip,
                      pressed && styles.actionChipPressed,
                    ]}
                    android_ripple={{ color: '#111827' }}
                    onPress={() => router.push('/utilizadores')}>
                    <ThemedText type="defaultSemiBold">Utilizadores</ThemedText>
                  </Pressable>
                </View>
              )}
            </View>

            <View style={styles.attentionSection}>
              <View style={styles.attentionHeader}>
                <Text style={styles.sectionTitle}>Itens que requerem atenção</Text>
                <Text style={styles.sectionSubtitle}>
                  {criticalLowStock} com stock crítico
                </Text>
              </View>

              {attentionItems.length === 0 ? (
                <Text style={styles.emptyText}>
                  Não há itens com atenção especial neste momento.
                </Text>
              ) : (
                attentionItems.map((item) => (
                  <View key={item.id} style={styles.attentionItem}>
                    <View style={styles.attentionIconBox}>
                      <Text style={styles.attentionIcon}>{item.icon}</Text>
                    </View>
                    <View style={styles.attentionContent}>
                      <Text style={styles.attentionTitle}>{item.productName}</Text>
                      <Text style={styles.attentionReason}>{item.reason}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {!loading && !stats && !error && (
          <Text style={styles.emptyText}>
            Não há dados para apresentar ainda.
          </Text>
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
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  subGreeting: {
    fontSize: 14,
    color: '#9ca3af',
  },
  loadingBox: {
    marginTop: 24,
    paddingVertical: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#6b7280',
    fontSize: 13,
  },
  errorBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
  },
  errorTitle: {
    fontWeight: '600',
    color: '#991b1b',
    marginBottom: 4,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCardWrap: {
    flex: 1,
  },
  summaryCardWrapPressed: {
    opacity: 0.9,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#111827',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryCardPrimary: {
    borderColor: '#111827',
    backgroundColor: '#ffffff',
  },
  summaryCardSecondary: {
    borderColor: '#111827',
    backgroundColor: '#ffffff',
  },
  summaryCardNeutral: {
    borderColor: '#111827',
    backgroundColor: '#ffffff',
  },
  summaryCardAccent: {
    borderColor: '#111827',
    backgroundColor: '#ffffff',
  },
  summaryCardHint: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  alertSection: {
    marginTop: 4,
  },
  alertSubtitle: {
    marginTop: 4,
  },
  alertPill: {
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    fontSize: 12,
  },
  quickActions: {
    marginTop: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  actionChipPressed: {
    backgroundColor: '#e5e7eb',
  },
  alertCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  alertCardDanger: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },
  alertCardWarning: {
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
    borderLeftWidth: 4,
    borderLeftColor: '#ea580c',
  },
  alertCardCaution: {
    borderColor: '#fef3c7',
    backgroundColor: '#fffbeb',
    borderLeftWidth: 4,
    borderLeftColor: '#ca8a04',
  },
  alertCardSuccess: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
  },
  alertCardPressed: {
    backgroundColor: '#e5e7eb',
  },
  attentionSection: {
    marginTop: 8,
    gap: 8,
  },
  attentionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  emptyText: {
    fontSize: 13,
    color: '#e5e7eb',
  },
  attentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  attentionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  attentionIcon: {
    fontSize: 16,
    color: '#6b7280',
  },
  attentionContent: {
    flex: 1,
    gap: 2,
  },
  attentionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  attentionReason: {
    fontSize: 13,
    color: '#6b7280',
  },
});


