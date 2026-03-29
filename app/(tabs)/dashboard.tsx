import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
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
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errorMessage';
import { isAdminRole, normalizeAppRole } from '@/utils/roles';

/** Cards use fixed light backgrounds; theme text stays dark so contrast is correct in system dark mode. */
const TEXT_ON_LIGHT = { lightColor: '#111827', darkColor: '#111827' } as const;
const TEXT_ON_LIGHT_MUTED = { lightColor: '#6b7280', darkColor: '#6b7280' } as const;

function AdminDashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

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
                <ThemedText type="subtitle" {...TEXT_ON_LIGHT}>
                  Vendas de hoje
                </ThemedText>
                <ThemedText type="title" {...TEXT_ON_LIGHT}>
                  {stats.sales_today}
                </ThemedText>
              </View>
              <View style={[styles.summaryCard, styles.summaryCardSecondary]}>
                <ThemedText type="subtitle" {...TEXT_ON_LIGHT}>
                  Vendas do mês
                </ThemedText>
                <ThemedText type="title" {...TEXT_ON_LIGHT}>
                  {stats.sales_this_month}
                </ThemedText>
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
                  <ThemedText type="subtitle" {...TEXT_ON_LIGHT}>
                    Caixa
                  </ThemedText>
                  <ThemedText type="title" {...TEXT_ON_LIGHT}>
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
                  <ThemedText {...TEXT_ON_LIGHT_MUTED} style={styles.summaryCardHint}>
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
                <ThemedText type="subtitle" {...TEXT_ON_LIGHT}>
                  Stock total (unid.)
                </ThemedText>
                <ThemedText type="title" {...TEXT_ON_LIGHT}>
                  {stats.total_stock_units}
                </ThemedText>
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
                <ThemedText type="subtitle" {...TEXT_ON_LIGHT}>
                  Alertas de inventário
                </ThemedText>
                {alertCopy ? (
                  <>
                    <ThemedText type="defaultSemiBold" {...TEXT_ON_LIGHT}>
                      {alertCopy.title}
                    </ThemedText>
                    <ThemedText {...TEXT_ON_LIGHT}>{alertCopy.message}</ThemedText>
                    <ThemedText {...TEXT_ON_LIGHT_MUTED} style={styles.alertSubtitle}>
                      {alertCopy.subtitle}
                    </ThemedText>
                    <ThemedText {...TEXT_ON_LIGHT} style={styles.alertPill}>
                      {alertCount} itens a acompanhar
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText {...TEXT_ON_LIGHT_MUTED}>
                    Sem alertas críticos neste momento.
                  </ThemedText>
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
                  <ThemedText type="defaultSemiBold" {...TEXT_ON_LIGHT}>
                    Registar venda
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionChip,
                    pressed && styles.actionChipPressed,
                  ]}
                  android_ripple={{ color: '#111827' }}
                  onPress={() => router.push('/(tabs)/stock')}>
                  <ThemedText type="defaultSemiBold" {...TEXT_ON_LIGHT}>
                    Ver stock
                  </ThemedText>
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
                  <ThemedText type="defaultSemiBold" {...TEXT_ON_LIGHT}>
                    Abrir caixa
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.actionChip,
                    pressed && styles.actionChipPressed,
                  ]}
                  android_ripple={{ color: '#111827' }}
                  onPress={() => router.push('/(tabs)/alertas')}>
                  <ThemedText type="defaultSemiBold" {...TEXT_ON_LIGHT}>
                    Produtos em risco
                  </ThemedText>
                </Pressable>
              </View>
              {isAdminRole(user?.role) && (
                <View style={styles.actionRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionChip,
                      pressed && styles.actionChipPressed,
                    ]}
                    android_ripple={{ color: '#111827' }}
                    onPress={() => router.push('/utilizadores')}>
                    <ThemedText type="defaultSemiBold" {...TEXT_ON_LIGHT}>
                      Utilizadores
                    </ThemedText>
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

        <Pressable
          style={({ pressed }) => [styles.adminLogoutPressable, pressed && styles.adminLogoutPressed]}
          onPress={() => void logout()}
          accessibilityRole="button"
          accessibilityLabel="Sair">
          <Text style={styles.adminLogoutLabel}>Sair</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function openingTimeDisplay(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Hoje às ${time}`;
    return d.toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function CashierDashboardScreen({ onLogout }: { onLogout: () => void }) {
  const router = useRouter();
  const [summary, setSummary] = useState<CashSessionSummary | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const loadSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const s = await api.cashSessions.getCurrent();
      setSummary(s);
    } catch {
      setSummary(null);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSession();
    }, [loadSession]),
  );

  const hasSession = Boolean(summary);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={cstyles.cashierScroll}
        showsVerticalScrollIndicator={false}>
        <Text style={cstyles.pageTitle}>Dashboard</Text>

        <View style={cstyles.sessionCard}>
          <View style={cstyles.sessionCardHeaderRow}>
            <MaterialIcons name="point-of-sale" size={18} color="#94a3b8" />
            <Text style={cstyles.sessionCardTitle}>Sessão de Caixa</Text>
          </View>
          <View style={cstyles.sessionTopRow}>
            <View style={cstyles.sessionLeftCol}>
              <View style={[cstyles.checkCircle, hasSession ? cstyles.checkCircleActive : undefined]}>
                <MaterialIcons name="check" size={26} color={hasSession ? '#fff' : '#64748b'} />
              </View>
            </View>
            <View style={cstyles.sessionTextBlock}>
              {sessionLoading ? (
                <ActivityIndicator color="#22c55e" />
              ) : hasSession ? (
                <>
                  <View style={cstyles.badgeAtiva}>
                    <Text style={cstyles.badgeAtivaText}>Ativa</Text>
                  </View>
                  <Text style={cstyles.sessionLine}>
                    Aberta por:{' '}
                    <Text style={cstyles.sessionLineStrong}>
                      {summary?.opened_by_display_name?.trim() || '—'}
                    </Text>
                  </Text>
                  <Text style={cstyles.sessionLine}>
                    Hora de abertura:{' '}
                    <Text style={cstyles.sessionLineStrong}>
                      {openingTimeDisplay(summary!.session.opened_at)}
                    </Text>
                  </Text>
                  <Text style={cstyles.sessionLine}>
                    Fundo inicial:{' '}
                    <Text style={cstyles.sessionLineStrong}>
                      {formatCurrency(summary!.session.opening_float)}
                    </Text>
                  </Text>
                </>
              ) : (
                <Text style={cstyles.sessionInactive}>Nenhuma sessão de caixa aberta.</Text>
              )}
            </View>
          </View>
        </View>

        <View style={cstyles.actionsRow}>
          {hasSession ? (
            <Pressable
              style={({ pressed }) => [
                cstyles.actionCard,
                cstyles.actionCardNovaVenda,
                pressed && cstyles.actionCardPressed,
              ]}
              onPress={() => router.push('/(tabs)/vendas')}>
              <MaterialIcons name="shopping-cart" size={34} color="#60a5fa" />
              <Text style={cstyles.actionCardLabelLight}>Nova Venda</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                cstyles.actionCard,
                cstyles.actionCardFecharCaixa,
                pressed && cstyles.actionCardPressed,
              ]}
              onPress={() => router.push('/(tabs)/caixa')}>
              <MaterialIcons name="lock-open" size={30} color="#4ade80" />
              <Text style={cstyles.actionCardLabelLight}>Abrir Caixa</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [
              cstyles.actionCard,
              cstyles.actionCardVerProdutos,
              pressed && cstyles.actionCardPressed,
            ]}
            onPress={() => router.push('/(tabs)/stock')}>
            <MaterialIcons name="manage-search" size={32} color="#94a3b8" />
            <Text style={cstyles.actionCardLabelLight}>Ver Produtos</Text>
          </Pressable>
          {hasSession ? (
            <Pressable
              style={({ pressed }) => [
                cstyles.actionCard,
                cstyles.actionCardFecharCaixa,
                pressed && cstyles.actionCardPressed,
              ]}
              onPress={() => router.push('/(tabs)/caixa')}>
              <MaterialIcons name="point-of-sale" size={30} color="#4ade80" />
              <Text style={cstyles.actionCardLabelLight}>Fechar Caixa</Text>
            </Pressable>
          ) : (
            <Pressable
              disabled
              style={[cstyles.actionCard, cstyles.actionCardNovaVendaDisabled]}
              accessibilityState={{ disabled: true }}>
              <MaterialIcons name="shopping-cart" size={34} color="#475569" />
              <Text style={cstyles.actionCardLabelDisabled}>Nova Venda</Text>
            </Pressable>
          )}
        </View>

        <View style={cstyles.infoOuter}>
          <View style={cstyles.infoOuterHeaderRow}>
            <MaterialIcons name="description" size={17} color="#94a3b8" />
            <Text style={cstyles.infoOuterTitle}>Informações da Sessão</Text>
          </View>
          <View style={cstyles.infoInnerRow}>
            <View style={cstyles.infoMini}>
              <MaterialIcons name="payments" size={20} color="#4ade80" />
              <Text style={cstyles.infoMiniLabel}>Vendas em Dinheiro</Text>
              <Text style={cstyles.infoMiniValue}>
                {hasSession ? formatCurrency(summary!.total_cash_sales) : '—'}
              </Text>
            </View>
            <View style={cstyles.infoMini}>
              <MaterialIcons name="credit-card" size={20} color="#60a5fa" />
              <Text style={cstyles.infoMiniLabel}>Vendas em Cartão</Text>
              <Text style={cstyles.infoMiniValue}>
                {hasSession ? formatCurrency(summary!.total_card_sales) : '—'}
              </Text>
            </View>
            <View style={cstyles.infoMini}>
              <MaterialIcons name="shopping-cart" size={20} color="#e2e8f0" />
              <Text style={cstyles.infoMiniLabel}>Total de Vendas</Text>
              <Text style={cstyles.infoMiniValue}>
                {hasSession ? formatCurrency(summary!.total_sales) : '—'}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [cstyles.logoutBtn, pressed && cstyles.logoutBtnPressed]}
          onPress={onLogout}>
          <Text style={cstyles.logoutBtnText}>Sair</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function StockAuditorDashboardScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={cstyles.pageTitle}>Dashboard</Text>
        <View style={cstyles.sessionCard}>
          <Text style={cstyles.sessionInactive}>
            Perfil de auditoria de stock. Utiliza Stock e Alertas. Não tens acesso a vendas nem a caixa.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [cstyles.logoutBtn, pressed && cstyles.logoutBtnPressed]}
          onPress={onLogout}>
          <Text style={cstyles.logoutBtnText}>Sair</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const r = normalizeAppRole(user?.role);
  if (r === 'cashier') {
    return <CashierDashboardScreen onLogout={() => void logout()} />;
  }
  if (r === 'stock_auditor') {
    return <StockAuditorDashboardScreen onLogout={() => void logout()} />;
  }
  return <AdminDashboardScreen />;
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
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
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
  adminLogoutPressable: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  adminLogoutPressed: {
    opacity: 0.8,
  },
  adminLogoutLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#94a3b8',
  },
});

const cstyles = StyleSheet.create({
  cashierScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 18,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: 0.2,
  },
  sessionCard: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
  },
  sessionCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sessionCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  sessionTopRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  sessionLeftCol: {
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  checkCircleActive: {
    backgroundColor: '#15803d',
    borderColor: '#22c55e',
  },
  badgeAtiva: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#15803d',
    borderWidth: 1,
    borderColor: '#22c55e',
    marginBottom: 2,
  },
  badgeAtivaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  sessionTextBlock: {
    flex: 1,
    gap: 8,
    justifyContent: 'flex-start',
  },
  sessionLine: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
  },
  sessionLineStrong: {
    fontWeight: '600',
    color: '#f1f5f9',
  },
  sessionInactive: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  actionCard: {
    flex: 1,
    minHeight: 128,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 6,
    gap: 12,
  },
  actionCardNovaVenda: {
    backgroundColor: '#172554',
    borderWidth: 1,
    borderColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  actionCardVerProdutos: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  actionCardFecharCaixa: {
    backgroundColor: '#14532d',
    borderWidth: 1,
    borderColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  actionCardNovaVendaDisabled: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    opacity: 0.55,
  },
  actionCardPressed: {
    opacity: 0.88,
  },
  actionCardLabelDisabled: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  actionCardLabelLight: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
  },
  infoOuter: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  infoOuterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 2,
  },
  infoOuterTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  infoInnerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  infoMini: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 4,
    minHeight: 0,
  },
  infoMiniLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    textAlign: 'center',
  },
  infoMiniValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
    textAlign: 'center',
  },
  logoutBtn: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  logoutBtnPressed: {
    opacity: 0.75,
  },
  logoutBtnText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#94a3b8',
  },
});


