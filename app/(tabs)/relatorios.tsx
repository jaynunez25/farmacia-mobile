import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { useAuth } from '@/contexts/AuthContext';
import { api, type CashierDayActivityRow } from '@/services/api';
import type { StockMovement } from '@/types';
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errorMessage';
import { isAdminRole, isStockAuditorRole } from '@/utils/roles';

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase: 'Entrada',
  sale: 'Venda',
  return: 'Devolução',
  adjustment: 'Ajuste',
  damaged: 'Avariado',
  expired: 'Expirado',
};

function formatMovementDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function shiftIsoDate(isoDay: string, delta: number): string {
  const d = new Date(isoDay + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatReportDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-PT', {
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

function buildAuditHtml(movements: StockMovement[], generatedAt: string): string {
  const rows = movements
    .map(
      (m) =>
        `<tr>
          <td>${formatMovementDate(m.created_at)}</td>
          <td>#${m.product_id}</td>
          <td>${MOVEMENT_TYPE_LABELS[m.movement_type] ?? m.movement_type}</td>
          <td>${m.quantity > 0 ? '+' : ''}${m.quantity}</td>
          <td>${m.previous_stock} → ${m.new_stock}</td>
          <td>${(m.reason ?? '—').replace(/</g, '&lt;')}</td>
        </tr>`,
    )
    .join('');
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Auditoria de stock</title>
  <style>
    body { font-family: sans-serif; font-size: 12px; padding: 16px; color: #1f2937; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { color: #6b7280; font-size: 11px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:nth-child(even) { background: #f9fafb; }
  </style>
</head>
<body>
  <h1>Auditoria de stock</h1>
  <p class="meta">Gerado em ${generatedAt} · ${movements.length} movimentos</p>
  <table>
    <thead>
      <tr>
        <th>Data / Hora</th>
        <th>Produto</th>
        <th>Tipo</th>
        <th>Qtd</th>
        <th>Stock (antes → depois)</th>
        <th>Motivo</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export default function RelatoriosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const isStockAuditor = isStockAuditorRole(user?.role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesSummary, setSalesSummary] = useState<{
    daily_total: string;
    monthly_total: string;
    filtered_total: string | null;
  } | null>(null);
  const [auditMovements, setAuditMovements] = useState<StockMovement[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashierDaily, setCashierDaily] = useState<CashierDayActivityRow[]>([]);
  const [cashierLoading, setCashierLoading] = useState(false);
  const [cashierError, setCashierError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (isAdmin) {
          const [summary, movements] = await Promise.all([
            api.sales.getHistorySummary({}),
            api.stockMovements.list({ limit: 500 }),
          ]);
          setSalesSummary(summary);
          setAuditMovements(movements);
        } else if (isStockAuditor) {
          const movements = await api.stockMovements.list({ limit: 500 });
          setSalesSummary(null);
          setAuditMovements(movements);
        }
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [isAdmin, isStockAuditor]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const loadCashier = async () => {
      setCashierLoading(true);
      setCashierError(null);
      try {
        const rows = await api.reports.getCashierDaily(reportDate);
        if (!cancelled) setCashierDaily(rows);
      } catch (e) {
        if (!cancelled) setCashierError(getErrorMessage(e));
      } finally {
        if (!cancelled) setCashierLoading(false);
      }
    };
    void loadCashier();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, reportDate]);

  const handleExportAuditPdf = async () => {
    if (auditMovements.length === 0) {
      Alert.alert('Sem dados', 'Não há movimentos de stock para exportar.');
      return;
    }
    setExportingPdf(true);
    try {
      const generatedAt = new Date().toLocaleString('pt-PT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const html = buildAuditHtml(auditMovements, generatedAt);
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      setExportingPdf(false);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar auditoria de stock (PDF)',
        }).catch((shareErr) => {
          Alert.alert('Partilha', getErrorMessage(shareErr));
        });
      } else {
        Alert.alert('PDF gerado', 'Ficheiro guardado. Partilha não disponível neste dispositivo.');
      }
    } catch (e) {
      setExportingPdf(false);
      Alert.alert('Erro', getErrorMessage(e));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Relatórios e Audit</Text>
        <Text style={styles.subtitle}>
          {isAdmin
            ? 'Resumo financeiro, actividade por caixa por dia e auditoria de stock.'
            : 'Auditoria de movimentos de stock e exportação PDF.'}
        </Text>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        )}

        {error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Erro ao carregar resumo</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {salesSummary && !loading && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Resumo de vendas</Text>
            <Text style={styles.cardLine}>
              <Text style={styles.cardLabel}>Hoje: </Text>
              {formatCurrency(salesSummary.daily_total)}
            </Text>
            <Text style={styles.cardLine}>
              <Text style={styles.cardLabel}>Este mês: </Text>
              {formatCurrency(salesSummary.monthly_total)}
            </Text>
            {salesSummary.filtered_total != null && (
              <Text style={styles.cardLine}>
                <Text style={styles.cardLabel}>Filtrado: </Text>
                {formatCurrency(salesSummary.filtered_total)}
              </Text>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.linkButton,
                pressed && styles.linkButtonPressed,
              ]}
              onPress={() => router.push('/historico-vendas')}>
              <Text style={styles.linkButtonText}>Ver histórico de vendas</Text>
            </Pressable>
          </View>
        )}

        {isAdmin && !loading && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Actividade por caixa (por dia)</Text>
            <Text style={styles.cardMeta}>
              Rastreio operacional: vendas e envolvimento na sessão de caixa (abrir/fechar). Dia em UTC
              (servidor).
            </Text>
            <View style={styles.dateRow}>
              <Pressable
                style={({ pressed }) => [styles.dateNavBtn, pressed && styles.dateNavBtnPressed]}
                onPress={() => setReportDate((d) => shiftIsoDate(d, -1))}>
                <Text style={styles.dateNavBtnText}>◀ Dia anterior</Text>
              </Pressable>
              <Text style={styles.dateLabel}>
                {new Date(reportDate + 'T12:00:00.000Z').toLocaleDateString('pt-PT', {
                  weekday: 'short',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.dateNavBtn, pressed && styles.dateNavBtnPressed]}
                onPress={() => setReportDate((d) => shiftIsoDate(d, 1))}>
                <Text style={styles.dateNavBtnText}>Próximo dia ▶</Text>
              </Pressable>
            </View>
            {cashierLoading && (
              <ActivityIndicator style={{ marginVertical: 12 }} color="#16a34a" />
            )}
            {cashierError && (
              <Text style={styles.errorInline}>{cashierError}</Text>
            )}
            {!cashierLoading &&
              !cashierError &&
              cashierDaily.map((row) => (
                <View key={row.user_id} style={styles.cashierBlock}>
                  <Text style={styles.cashierName}>
                    {row.display_name || row.username}
                    <Text style={styles.cashierMeta}> · #{row.user_id}</Text>
                  </Text>
                  <Text style={styles.cardLine}>
                    <Text style={styles.cardLabel}>Vendas: </Text>
                    {row.sale_count} · Total: {formatCurrency(row.total_sales)}
                  </Text>
                  <Text style={styles.cardLine}>
                    <Text style={styles.cardLabel}>Dinheiro / Cartão: </Text>
                    {formatCurrency(row.cash_sales_total)} / {formatCurrency(row.card_sales_total)}
                  </Text>
                  <Text style={styles.cardLine}>
                    <Text style={styles.cardLabel}>1.ª venda / última: </Text>
                    {formatReportDateTime(row.first_sale_at)} · {formatReportDateTime(row.last_sale_at)}
                  </Text>
                  <Text style={styles.cardLine}>
                    <Text style={styles.cardLabel}>Abriu sessão: </Text>
                    {row.opened_session ? 'Sim' : 'Não'}
                    {' · '}
                    <Text style={styles.cardLabel}>Fechou sessão: </Text>
                    {row.closed_session ? 'Sim' : 'Não'}
                    {row.session_id_closed != null ? ` (sessão #${row.session_id_closed})` : ''}
                  </Text>
                  {(row.cash_difference_at_close != null || row.closing_notes) && (
                    <Text style={styles.cardLine}>
                      <Text style={styles.cardLabel}>Diferença caixa no fecho: </Text>
                      {row.cash_difference_at_close != null
                        ? formatCurrency(row.cash_difference_at_close, { signed: true })
                        : '—'}
                      {row.closing_notes ? (
                        <>
                          {'\n'}
                          <Text style={styles.cardLabel}>Notas fecho: </Text>
                          {row.closing_notes}
                        </>
                      ) : null}
                    </Text>
                  )}
                </View>
              ))}
            {!cashierLoading && !cashierError && cashierDaily.length === 0 && (
              <Text style={styles.cardMeta}>Sem actividade registada neste dia.</Text>
            )}
          </View>
        )}

        {isAdmin ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sessões de caixa</Text>
            <Text style={styles.cardLine}>
              Consulta e fecha sessões de caixa na secção Caixa. Em versões futuras poderás gerar
              relatórios completos de fecho de dia.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.linkButton,
                pressed && styles.linkButtonPressed,
              ]}
              onPress={() => router.push('/(tabs)/caixa')}>
              <Text style={styles.linkButtonText}>Ir para Caixa</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Auditoria de stock</Text>
          <Text style={styles.cardLine}>
            Movimentos de stock (entradas, vendas, ajustes). Cada novo produto com stock inicial
            gera um registo no dia da criação. Exporta para PDF para relatório ou arquivo.
          </Text>
          {!loading && (
            <Text style={styles.cardMeta}>
              {auditMovements.length} movimentos carregados
            </Text>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.exportButton,
              (exportingPdf || loading) && styles.exportButtonDisabled,
              pressed && !exportingPdf && !loading && styles.exportButtonPressed,
            ]}
            onPress={handleExportAuditPdf}
            disabled={exportingPdf || loading}>
            <Text style={styles.exportButtonText}>
              {exportingPdf ? 'A gerar PDF...' : 'Exportar auditoria para PDF'}
            </Text>
          </Pressable>
        </View>
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
  card: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
    gap: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  cardLine: {
    fontSize: 13,
    color: '#e5e7eb',
  },
  cardLabel: {
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  exportButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#1e3a5f',
    alignItems: 'center',
  },
  exportButtonPressed: {
    backgroundColor: '#1e4976',
  },
  exportButtonDisabled: {
    backgroundColor: '#374151',
    opacity: 0.8,
  },
  exportButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e0f2fe',
  },
  linkButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  linkButtonPressed: {
    backgroundColor: '#1f2937',
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 10,
    gap: 8,
  },
  dateNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  dateNavBtnPressed: {
    opacity: 0.85,
  },
  dateNavBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  dateLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  cashierBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    gap: 4,
  },
  cashierName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e5e7eb',
    marginBottom: 4,
  },
  cashierMeta: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9ca3af',
  },
  errorInline: {
    color: '#fecaca',
    fontSize: 13,
    marginTop: 8,
  },
});

