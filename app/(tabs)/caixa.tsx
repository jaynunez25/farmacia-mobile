import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { api, type CashSessionSummary } from '@/services/api';
import { getErrorMessage } from '@/utils/errorMessage';

const DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 1] as const;
type DenominationMap = Record<string, number>;

const makeEmptyBreakdown = (): DenominationMap =>
  DENOMINATIONS.reduce((acc, value) => {
    acc[String(value)] = 0;
    return acc;
  }, {} as DenominationMap);

const totalFromBreakdown = (breakdown: DenominationMap): number =>
  DENOMINATIONS.reduce((sum, value) => sum + value * (breakdown[String(value)] ?? 0), 0);

const toCurrency = (value: number) => `${value.toFixed(2)} Kz`;

export default function CaixaScreen() {
  const [summary, setSummary] = useState<CashSessionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openingBreakdown, setOpeningBreakdown] = useState<DenominationMap>(makeEmptyBreakdown);
  const [openingNotes, setOpeningNotes] = useState('');

  const [closingBreakdown, setClosingBreakdown] = useState<DenominationMap>(makeEmptyBreakdown);
  const [closingNotes, setClosingNotes] = useState('');

  const [openingSaving, setOpeningSaving] = useState(false);
  const [closingSaving, setClosingSaving] = useState(false);

  const loadCurrent = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.cashSessions.getCurrent();
      setSummary(data);
    } catch (err) {
      setSummary(null);
      const msg = getErrorMessage(err);
      if (
        msg === 'Not authenticated' ||
        msg === 'Not authenticated.' ||
        msg === 'Nenhuma sessão de caixa aberta.' ||
        msg === 'Nenhuma sessão de caixa aberta'
      ) {
        // Sem sessão válida ou sem sessão aberta:
        // não mostrar banner de erro, apenas o fluxo de abrir sessão.
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrent();
  }, []);

  const openingTotal = totalFromBreakdown(openingBreakdown);
  const closingCountedTotal = totalFromBreakdown(closingBreakdown);
  const expectedCash = Number(summary?.expected_cash_in_till ?? '0');
  const differenceAmount = closingCountedTotal - expectedCash;

  const setDenominationQty = (
    side: 'opening' | 'closing',
    denom: number,
    rawValue: string,
  ) => {
    const sanitized = rawValue.replace(/[^\d]/g, '');
    const parsed = sanitized === '' ? 0 : parseInt(sanitized, 10);
    const value = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
    if (side === 'opening') {
      setOpeningBreakdown(prev => ({ ...prev, [String(denom)]: value }));
    } else {
      setClosingBreakdown(prev => ({ ...prev, [String(denom)]: value }));
    }
  };

  const handleOpen = async () => {
    setOpeningSaving(true);
    setError(null);
    try {
      const session = await api.cashSessions.open({
        opening_float: openingTotal,
        opening_breakdown: openingBreakdown,
        notes: openingNotes.trim() || undefined,
      });
      setSummary({ session, ...{
        total_cash_sales: '0',
        total_card_sales: '0',
        total_transfer_sales: '0',
        total_other_sales: '0',
        total_sales: '0',
        cash_refunds: '0',
        approved_cash_drops: '0',
        expected_cash_in_till: session.opening_float,
        transaction_count: 0,
        voided_count: 0,
      }});
      Alert.alert('Sessão aberta', 'A sessão de caixa foi aberta com sucesso.');
      setOpeningBreakdown(makeEmptyBreakdown());
      setOpeningNotes('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setOpeningSaving(false);
    }
  };

  const handleClose = async () => {
    // Se existir resumo, verifica diferença e exige nota quando houver discrepância.
    if (summary) {
      const expected = Number(summary.expected_cash_in_till ?? '0');
      const diff = closingCountedTotal - expected;
      if (Math.abs(diff) > 0.009 && !closingNotes.trim()) {
        const absDiff = Math.abs(diff);
        const diffLabel = diff > 0 ? 'Excesso de caixa' : 'Falta de caixa';
        Alert.alert(
          'Discrepância no caixa',
          `Tens uma discrepância no caixa. O valor contado não corresponde ao valor esperado da sessão. ` +
            `Adiciona uma nota/incidente para justificar a diferença antes de fechar.\n\n` +
            `Valor esperado: ${toCurrency(expected)}\n` +
            `Valor contado: ${toCurrency(closingCountedTotal)}\n` +
            `Diferença: ${toCurrency(diff)}\n` +
            `${diffLabel}: ${toCurrency(absDiff)}\n\n` +
            `Isto pode acontecer por vendas em dinheiro não registadas, reforço de caixa, retirada de caixa, ` +
            `erro de contagem ou ajuste manual não registado.`,
        );
        return;
      }
    }

    setClosingSaving(true);
    setError(null);
    try {
      const session = await api.cashSessions.close({
        actual_cash_counted: closingCountedTotal,
        closing_breakdown: closingBreakdown,
        notes: closingNotes.trim() || undefined,
      });

      // Tenta obter relatório detalhado, se disponível.
      let expected = session.expected_cash ?? '0';
      let actual = session.actual_cash_counted ?? '0';
      let diff = session.cash_difference ?? '0';
      try {
        const report = await api.cashSessions.getReport(session.id);
        expected = report.expected_cash_in_till ?? expected;
        actual = report.actual_cash_counted ?? actual;
        diff = report.cash_difference ?? diff;
      } catch {
        // Se falhar, usa apenas os valores da sessão.
      }

      Alert.alert(
        'Sessão fechada',
        `Fundo inicial: ${session.opening_float ?? '0'}\nEsperado em caixa: ${expected}\nContado: ${actual}\nDiferença: ${diff}`,
      );
      setSummary(null);
      setClosingBreakdown(makeEmptyBreakdown());
      setClosingNotes('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setClosingSaving(false);
    }
  };

  const session = summary?.session ?? null;

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      )}

      {!loading && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Caixa</Text>
            <Text style={styles.subtitle}>
              Abre e fecha sessões de caixa para registar vendas de forma segura.
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Erro</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {session && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Sessão actual</Text>
                <Text style={styles.fieldText}>
                  <Text style={styles.fieldLabel}>Data: </Text>
                  {session.date}
                </Text>
                <Text style={styles.fieldText}>
                  <Text style={styles.fieldLabel}>Aberto por: </Text>
                  {session.opened_by}
                </Text>
                <Text style={styles.fieldText}>
                  <Text style={styles.fieldLabel}>Aberto em: </Text>
                  {new Date(session.opened_at).toLocaleString()}
                </Text>
                <Text style={styles.fieldText}>
                  <Text style={styles.fieldLabel}>Fundo inicial: </Text>
                  {session.opening_float} Kz
                </Text>
                {summary && (
                  <>
                    <Text style={styles.fieldText}>
                      <Text style={styles.fieldLabel}>Vendas em dinheiro: </Text>
                      {summary.total_cash_sales} Kz
                    </Text>
                    <Text style={styles.fieldText}>
                      <Text style={styles.fieldLabel}>Vendas cartão: </Text>
                      {summary.total_card_sales} Kz
                    </Text>
                    <Text style={styles.fieldText}>
                      <Text style={styles.fieldLabel}>Vendas transferência: </Text>
                      {summary.total_transfer_sales} Kz
                    </Text>
                    <Text style={styles.fieldText}>
                      <Text style={styles.fieldLabel}>Total vendas: </Text>
                      {summary.total_sales} Kz
                    </Text>
                    <Text style={styles.fieldText}>
                      <Text style={styles.fieldLabel}>Esperado em caixa: </Text>
                      {summary.expected_cash_in_till} Kz
                    </Text>
                  </>
                )}
              </View>
            )}

            {!session && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Abrir sessão de caixa</Text>
                <Text style={styles.helperText}>
                  Antes de registar vendas, abre uma sessão de caixa com o fundo inicial.
                </Text>
                <View style={styles.field}>
                  <Text style={styles.label}>Denominações (abertura)</Text>
                  {DENOMINATIONS.map(denom => {
                    const qty = openingBreakdown[String(denom)] ?? 0;
                    const lineTotal = qty * denom;
                    return (
                      <View style={styles.denomRow} key={`open-${denom}`}>
                        <Text style={styles.denomLabel}>{denom} Kz</Text>
                        <TextInput
                          style={styles.denomQtyInput}
                          keyboardType="number-pad"
                          value={String(qty)}
                          onChangeText={value => setDenominationQty('opening', denom, value)}
                          placeholder="0"
                          placeholderTextColor="#6b7280"
                        />
                        <Text style={styles.denomSubtotal}>{toCurrency(lineTotal)}</Text>
                      </View>
                    );
                  })}
                  <Text style={styles.totalLine}>
                    <Text style={styles.fieldLabel}>Total abertura: </Text>
                    {toCurrency(openingTotal)}
                  </Text>
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Notas / observações (opcional)</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={openingNotes}
                    onChangeText={setOpeningNotes}
                    placeholder="Ex.: Troco contado com supervisor."
                    placeholderTextColor="#6b7280"
                    multiline
                    numberOfLines={3}
                  />
                </View>
                <Pressable
                  style={[
                    styles.primaryButton,
                    openingSaving && styles.primaryButtonDisabled,
                  ]}
                  onPress={openingSaving ? undefined : handleOpen}>
                  <Text style={styles.primaryButtonText}>{openingSaving ? 'A abrir...' : 'Abrir sessão de caixa'}</Text>
                </Pressable>
              </View>
            )}

            {session && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Fechar sessão</Text>
                <Text style={styles.helperText}>
                  No fim do turno, conta o dinheiro físico e fecha a sessão para comparar o esperado com o contado.
                </Text>
                <View style={styles.field}>
                  <Text style={styles.label}>Denominações (fecho)</Text>
                  {DENOMINATIONS.map(denom => {
                    const qty = closingBreakdown[String(denom)] ?? 0;
                    const lineTotal = qty * denom;
                    return (
                      <View style={styles.denomRow} key={`close-${denom}`}>
                        <Text style={styles.denomLabel}>{denom} Kz</Text>
                        <TextInput
                          style={styles.denomQtyInput}
                          keyboardType="number-pad"
                          value={String(qty)}
                          onChangeText={value => setDenominationQty('closing', denom, value)}
                          placeholder="0"
                          placeholderTextColor="#6b7280"
                        />
                        <Text style={styles.denomSubtotal}>{toCurrency(lineTotal)}</Text>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.calculationBox}>
                  <Text style={styles.fieldText}><Text style={styles.fieldLabel}>Fundo inicial: </Text>{summary?.session?.opening_float ?? '0'} Kz</Text>
                  <Text style={styles.fieldText}><Text style={styles.fieldLabel}>Vendas em dinheiro: </Text>{summary?.total_cash_sales ?? '0'} Kz</Text>
                  <Text style={styles.fieldText}><Text style={styles.fieldLabel}>Reembolsos em dinheiro: </Text>{summary?.cash_refunds ?? '0'} Kz</Text>
                  <Text style={styles.fieldText}><Text style={styles.fieldLabel}>Reforços de caixa: </Text>0.00 Kz</Text>
                  <Text style={styles.fieldText}><Text style={styles.fieldLabel}>Retiradas de caixa: </Text>{summary?.approved_cash_drops ?? '0'} Kz</Text>
                  <Text style={styles.fieldText}><Text style={styles.fieldLabel}>Esperado em caixa: </Text>{toCurrency(expectedCash)}</Text>
                  <Text style={styles.fieldText}><Text style={styles.fieldLabel}>Total contado: </Text>{toCurrency(closingCountedTotal)}</Text>
                  <Text style={styles.fieldText}><Text style={styles.fieldLabel}>Diferença: </Text>{toCurrency(differenceAmount)}</Text>
                  {differenceAmount > 0 ? (
                    <Text style={styles.excessText}>Excesso de caixa: {toCurrency(Math.abs(differenceAmount))}</Text>
                  ) : null}
                  {differenceAmount < 0 ? (
                    <Text style={styles.shortText}>Falta de caixa: {toCurrency(Math.abs(differenceAmount))}</Text>
                  ) : null}
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Notas / incidentes {Math.abs(differenceAmount) > 0.009 ? '(obrigatório com diferença)' : '(opcional)'}</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={closingNotes}
                    onChangeText={setClosingNotes}
                    placeholder="Regista discrepâncias ou incidentes."
                    placeholderTextColor="#6b7280"
                    multiline
                    numberOfLines={3}
                  />
                </View>
                <Pressable
                  style={[
                    styles.dangerButton,
                    closingSaving && styles.dangerButtonDisabled,
                  ]}
                  onPress={closingSaving ? undefined : handleClose}>
                  <Text style={styles.dangerButtonText}>{closingSaving ? 'A fechar...' : 'Fechar sessão de caixa'}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  section: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  helperText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  field: {
    gap: 4,
  },
  denomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  denomLabel: {
    width: 86,
    fontSize: 13,
    color: '#e5e7eb',
    fontWeight: '600',
  },
  denomQtyInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 12,
    backgroundColor: '#020617',
    color: '#f9fafb',
  },
  denomSubtotal: {
    width: 110,
    textAlign: 'right',
    fontSize: 13,
    color: '#cbd5e1',
  },
  totalLine: {
    marginTop: 6,
    fontSize: 14,
    color: '#e5e7eb',
  },
  label: {
    fontSize: 13,
    color: '#9ca3af',
  },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 12,
    backgroundColor: '#020617',
    color: '#f9fafb',
  },
  inputMultiline: {
    height: 88,
    textAlignVertical: 'top',
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
  fieldText: {
    fontSize: 13,
    color: '#e5e7eb',
  },
  fieldLabel: {
    fontWeight: '600',
  },
  calculationBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#0b1220',
    padding: 10,
    gap: 4,
  },
  excessText: {
    marginTop: 4,
    color: '#4ade80',
    fontWeight: '700',
  },
  shortText: {
    marginTop: 4,
    color: '#fca5a5',
    fontWeight: '700',
  },
  primaryButton: {
    marginTop: 8,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryButtonDisabled: {
    backgroundColor: '#4b5563',
  },
  dangerButton: {
    marginTop: 8,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#7f1d1d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    color: '#fee2e2',
    fontSize: 15,
    fontWeight: '600',
  },
  dangerButtonDisabled: {
    backgroundColor: '#991b1b',
  },
});

