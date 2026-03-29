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
import { api } from '@/services/api';
import type { StockMovement } from '@/types';
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
  const [attendanceStatus, setAttendanceStatus] = useState<{
    clocked_in_at: string | null;
    clocked_out_at: string | null;
    is_clocked_in: boolean;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (isAdmin) {
          const [summary, movements, attendance] = await Promise.all([
            api.sales.getHistorySummary({}),
            api.stockMovements.list({ limit: 500 }),
            api.attendance.getStatus(),
          ]);
          setSalesSummary(summary);
          setAuditMovements(movements);
          setAttendanceStatus(attendance);
        } else if (isStockAuditor) {
          const movements = await api.stockMovements.list({ limit: 500 });
          setSalesSummary(null);
          setAttendanceStatus(null);
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
          Consulta resultados do dia, histórico de vendas e relatórios de sessões de caixa.
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
              {salesSummary.daily_total} Kz
            </Text>
            <Text style={styles.cardLine}>
              <Text style={styles.cardLabel}>Este mês: </Text>
              {salesSummary.monthly_total} Kz
            </Text>
            {salesSummary.filtered_total != null && (
              <Text style={styles.cardLine}>
                <Text style={styles.cardLabel}>Filtrado: </Text>
                {salesSummary.filtered_total} Kz
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

        {isAdmin && attendanceStatus && !loading && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Relatório de ponto (Clock in / Clock out)</Text>
            <Text style={styles.cardLine}>
              <Text style={styles.cardLabel}>Dia: </Text>
              {new Date().toLocaleDateString('pt-PT')}
            </Text>
            <Text style={styles.cardLine}>
              <Text style={styles.cardLabel}>Entrada: </Text>
              {attendanceStatus.clocked_in_at
                ? new Date(attendanceStatus.clocked_in_at).toLocaleTimeString('pt-PT', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </Text>
            <Text style={styles.cardLine}>
              <Text style={styles.cardLabel}>Saída: </Text>
              {attendanceStatus.clocked_out_at
                ? new Date(attendanceStatus.clocked_out_at).toLocaleTimeString('pt-PT', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </Text>
            <Text style={styles.cardMeta}>
              {attendanceStatus.is_clocked_in ? 'Utilizador com sessão de ponto aberta.' : 'Utilizador fora de ponto.'}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.linkButton, pressed && styles.linkButtonPressed]}
              onPress={() => router.push('/(tabs)/ponto')}>
              <Text style={styles.linkButtonText}>Ir para Ponto</Text>
            </Pressable>
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
});

