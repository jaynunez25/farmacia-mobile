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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
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

/** Apresentação: separador de milhares alinhado ao mock POS (ex.: 20,000). */
const formatDenominationLabel = (value: number) =>
  `${value.toLocaleString('en-US')} Kz`;

/** Grelha 2 colunas: notas maiores à esquerda, menores à direita (todas as denominações, sem duplicar). */
const OPENING_DENOM_LEFT = DENOMINATIONS.slice(0, 7);
const OPENING_DENOM_RIGHT = DENOMINATIONS.slice(7);

export default function CaixaScreen() {
  const { user } = useAuth();
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
      const openerLabel = (user?.display_name?.trim() || user?.username || '').trim() || null;
      setSummary({
        session,
        opened_by_display_name: openerLabel,
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
      });
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
  const { width: windowWidth } = useWindowDimensions();
  const closingLayoutNarrow = windowWidth < 720;

  const sessionOpenedSinceLabel =
    session != null
      ? (() => {
          const d = new Date(session.opened_at);
          const now = new Date();
          const sameDay =
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() === now.getDate();
          const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
          return sameDay ? `Hoje às ${time}` : d.toLocaleString('pt-PT');
        })()
      : '';

  const differenceDisplay =
    Math.abs(differenceAmount) < 0.009
      ? toCurrency(0)
      : differenceAmount > 0
        ? `+${toCurrency(differenceAmount)}`
        : toCurrency(differenceAmount);

  const openedByLabel =
    summary?.opened_by_display_name?.trim() ||
    (session != null ? `Utilizador #${session.opened_by}` : '—');

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
            contentContainerStyle={[styles.container, !session && styles.containerOpenFlow]}
            keyboardShouldPersistTaps="handled">
            {session ? (
              <>
                <Text style={styles.title}>Caixa</Text>
                <Text style={styles.subtitle}>
                  Sessão única da loja: todos os operadores usam a mesma gaveta até fechar. O esperado na gaveta inclui
                  apenas dinheiro (cartão não entra no físico).
                </Text>
              </>
            ) : (
              <View style={styles.openPageHeader}>
                <Text style={styles.openPageTitle}>Sessão de Caixa</Text>
                <Text style={styles.openPageSubtitle}>
                  Abra uma sessão de caixa antes de iniciar o registo de vendas. Insira o fundo inicial para começar.
                </Text>
              </View>
            )}

            {error && (
              <View style={[styles.errorBox, !session && styles.openErrorBox]}>
                <Text style={styles.errorTitle}>Erro</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {!session && (
              <View style={styles.openCard}>
                <Text style={styles.openCardTitle}>Abrir sessão de caixa</Text>
                <Text style={styles.openCardHelper}>
                  Insira o dinheiro disponível na gaveta para definir o fundo inicial da sessão. Só pode existir uma
                  sessão aberta por loja; outros operadores continuarão na mesma sessão até fechar.
                </Text>

                <View style={styles.openDenomGrid}>
                  <View style={styles.openDenomCol}>
                    {OPENING_DENOM_LEFT.map(denom => {
                      const qty = openingBreakdown[String(denom)] ?? 0;
                      const lineTotal = qty * denom;
                      return (
                        <View style={styles.openDenomCell} key={`open-${denom}`}>
                          <Text style={styles.openDenomValueLabel}>{formatDenominationLabel(denom)}</Text>
                          <TextInput
                            style={styles.openDenomQtyInput}
                            keyboardType="number-pad"
                            value={String(qty)}
                            onChangeText={value => setDenominationQty('opening', denom, value)}
                            placeholder="0"
                            placeholderTextColor="#6b7280"
                          />
                          <Text style={styles.openDenomLineTotal}>{toCurrency(lineTotal)}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.openDenomCol}>
                    {OPENING_DENOM_RIGHT.map(denom => {
                      const qty = openingBreakdown[String(denom)] ?? 0;
                      const lineTotal = qty * denom;
                      return (
                        <View style={styles.openDenomCell} key={`open-${denom}`}>
                          <Text style={styles.openDenomValueLabel}>{formatDenominationLabel(denom)}</Text>
                          <TextInput
                            style={styles.openDenomQtyInput}
                            keyboardType="number-pad"
                            value={String(qty)}
                            onChangeText={value => setDenominationQty('opening', denom, value)}
                            placeholder="0"
                            placeholderTextColor="#6b7280"
                          />
                          <Text style={styles.openDenomLineTotal}>{toCurrency(lineTotal)}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.openTotalBar}>
                  <Text style={styles.openTotalLabel}>Total abertura</Text>
                  <Text style={styles.openTotalValue}>{toCurrency(openingTotal)}</Text>
                </View>

                <View style={styles.openNotesBlock}>
                  <Text style={styles.openNotesLabel}>Notas / observações (opcional)</Text>
                  <TextInput
                    style={styles.openNotesInput}
                    value={openingNotes}
                    onChangeText={setOpeningNotes}
                    placeholder="Ex.: Troco contado com supervisor."
                    placeholderTextColor="#6b7280"
                    multiline
                    numberOfLines={4}
                  />
                </View>

                <Pressable
                  style={[styles.openPrimaryButton, openingSaving && styles.openPrimaryButtonDisabled]}
                  onPress={openingSaving ? undefined : handleOpen}>
                  <Text style={styles.openPrimaryButtonText}>
                    {openingSaving ? 'A abrir...' : 'Abrir sessão de caixa'}
                  </Text>
                </Pressable>
              </View>
            )}

            {session && summary && (
              <View style={styles.closeFlow}>
                <View style={styles.closeActiveBanner}>
                  <Text style={styles.closeActiveBannerText}>
                    Sessão da loja activa — aberta por <Text style={styles.closeActiveBannerStrong}>{openedByLabel}</Text>.
                    Qualquer caixa autorizado pode vender e fechar; não é necessário abrir outra sessão.
                  </Text>
                </View>
                <View
                  style={[
                    styles.closeStatCardsRow,
                    closingLayoutNarrow && styles.closeStatCardsRowStack,
                  ]}>
                  <View style={styles.closeStatCard}>
                    <Text style={styles.closeStatCardIcon}>🕐</Text>
                    <Text style={styles.closeStatCardTitle}>Sessão aberta desde</Text>
                    <Text style={styles.closeStatCardValue} numberOfLines={2}>
                      {sessionOpenedSinceLabel}
                    </Text>
                    <Text style={styles.closeStatCardMeta}>Aberto por: {openedByLabel}</Text>
                  </View>
                  <View style={styles.closeStatCard}>
                    <Text style={styles.closeStatCardIcon}>💵</Text>
                    <Text style={styles.closeStatCardTitle}>Fundo inicial</Text>
                    <Text style={styles.closeStatCardValue}>{session.opening_float} Kz</Text>
                  </View>
                  <View style={styles.closeStatCard}>
                    <Text style={styles.closeStatCardIcon}>🛒</Text>
                    <Text style={styles.closeStatCardTitle}>Total de vendas</Text>
                    <Text style={styles.closeStatCardValue}>{summary.total_sales} Kz</Text>
                    <Text style={styles.closeStatCardMeta}>
                      Dinheiro: {summary.total_cash_sales} Kz · Cartão: {summary.total_card_sales} Kz
                    </Text>
                  </View>
                </View>

                <View
                  style={[styles.closeMainRow, closingLayoutNarrow && styles.closeMainRowStack]}>
                  <View style={[styles.closePanel, styles.closePanelCount]}>
                    <Text style={styles.closePanelHeading}>Contagem de Dinheiro</Text>
                    <View style={styles.openDenomGrid}>
                      <View style={styles.openDenomCol}>
                        {OPENING_DENOM_LEFT.map(denom => {
                          const qty = closingBreakdown[String(denom)] ?? 0;
                          const lineTotal = qty * denom;
                          return (
                            <View style={styles.openDenomCell} key={`close-${denom}`}>
                              <Text style={styles.openDenomValueLabel}>{formatDenominationLabel(denom)}</Text>
                              <TextInput
                                style={styles.openDenomQtyInput}
                                keyboardType="number-pad"
                                value={String(qty)}
                                onChangeText={value => setDenominationQty('closing', denom, value)}
                                placeholder="0"
                                placeholderTextColor="#6b7280"
                              />
                              <Text style={styles.openDenomLineTotal}>{toCurrency(lineTotal)}</Text>
                            </View>
                          );
                        })}
                      </View>
                      <View style={styles.openDenomCol}>
                        {OPENING_DENOM_RIGHT.map(denom => {
                          const qty = closingBreakdown[String(denom)] ?? 0;
                          const lineTotal = qty * denom;
                          return (
                            <View style={styles.openDenomCell} key={`close-${denom}`}>
                              <Text style={styles.openDenomValueLabel}>{formatDenominationLabel(denom)}</Text>
                              <TextInput
                                style={styles.openDenomQtyInput}
                                keyboardType="number-pad"
                                value={String(qty)}
                                onChangeText={value => setDenominationQty('closing', denom, value)}
                                placeholder="0"
                                placeholderTextColor="#6b7280"
                              />
                              <Text style={styles.openDenomLineTotal}>{toCurrency(lineTotal)}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.closePanel,
                      styles.closePanelResumo,
                      closingLayoutNarrow && styles.closePanelResumoFull,
                    ]}>
                    <Text style={styles.closePanelHeading}>Resumo</Text>
                    <View style={styles.closeResumoMetric}>
                      <Text style={styles.closeResumoLabel}>Total contado</Text>
                      <Text style={styles.closeResumoValueHero}>{toCurrency(closingCountedTotal)}</Text>
                    </View>
                    <View style={styles.closeResumoMetric}>
                      <Text style={styles.closeResumoLabel}>Esperado na gaveta</Text>
                      <Text style={styles.closeResumoValueHero}>{toCurrency(expectedCash)}</Text>
                      <Text style={styles.closeEsperadoHint}>
                        Fundo inicial + vendas em dinheiro. Vendas em cartão não entram no dinheiro físico da gaveta.
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.closeDiffBox,
                        differenceAmount > 0.009 && styles.closeDiffBoxPositive,
                        differenceAmount < -0.009 && styles.closeDiffBoxNegative,
                        Math.abs(differenceAmount) < 0.009 && styles.closeDiffBoxNeutral,
                      ]}>
                      <Text style={styles.closeResumoLabel}>Diferença</Text>
                      <Text
                        style={[
                          styles.closeDiffValue,
                          differenceAmount > 0.009 && styles.closeDiffValuePositive,
                          differenceAmount < -0.009 && styles.closeDiffValueNegative,
                        ]}>
                        {differenceDisplay}
                      </Text>
                    </View>
                    <Text style={styles.closeResumoHint}>Registe discrepâncias se necessário.</Text>
                  </View>
                </View>

                <View style={styles.closeNotesBlock}>
                  <Text style={styles.closeNotesLabel}>
                    Notas / incidentes {Math.abs(differenceAmount) > 0.009 ? '(obrigatório com diferença)' : '(opcional)'}
                  </Text>
                  <TextInput
                    style={styles.closeNotesInput}
                    value={closingNotes}
                    onChangeText={setClosingNotes}
                    placeholder="Regista discrepâncias ou incidentes."
                    placeholderTextColor="#6b7280"
                    multiline
                    numberOfLines={4}
                  />
                </View>

                <Pressable
                  style={[styles.closeDangerButton, closingSaving && styles.closeDangerButtonDisabled]}
                  onPress={closingSaving ? undefined : handleClose}>
                  <Text style={styles.closeDangerButtonText}>
                    {closingSaving ? 'A fechar...' : 'Fechar sessão de caixa'}
                  </Text>
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
  containerOpenFlow: {
    alignItems: 'center',
    paddingBottom: 28,
    maxWidth: 720,
    width: '100%' as const,
    alignSelf: 'center',
  },
  openPageHeader: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  openPageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f9fafb',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  openPageSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 520,
  },
  openErrorBox: {
    width: '100%',
    maxWidth: 640,
    borderRadius: 4,
  },
  openCard: {
    width: '100%',
    maxWidth: 640,
    marginTop: 8,
    padding: 18,
    backgroundColor: '#0c111d',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 4,
    gap: 14,
  },
  openCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: 0.15,
  },
  openCardHelper: {
    fontSize: 13,
    lineHeight: 19,
    color: '#94a3b8',
    marginTop: -6,
  },
  openDenomGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  openDenomCol: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  openDenomCell: {
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingVertical: 10,
    gap: 6,
  },
  openDenomValueLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  openDenomQtyInput: {
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    backgroundColor: '#020617',
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '600',
  },
  openDenomLineTotal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'right',
  },
  openTotalBar: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 4,
  },
  openTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f9fafb',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  openTotalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4ade80',
  },
  openNotesBlock: {
    gap: 8,
    marginTop: 2,
  },
  openNotesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  openNotesInput: {
    minHeight: 88,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#020617',
    color: '#f9fafb',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  openPrimaryButton: {
    marginTop: 6,
    minHeight: 52,
    borderRadius: 4,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  openPrimaryButtonDisabled: {
    backgroundColor: '#4b5563',
  },
  openPrimaryButtonText: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
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
    lineHeight: 20,
  },
  closeFlow: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    gap: 16,
    marginTop: 4,
  },
  closeActiveBanner: {
    width: '100%',
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1e3a5f',
    backgroundColor: 'rgba(30, 58, 95, 0.35)',
  },
  closeActiveBannerText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#cbd5e1',
  },
  closeActiveBannerStrong: {
    fontWeight: '800',
    color: '#f1f5f9',
  },
  closeStatCardsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  closeStatCardsRowStack: {
    flexDirection: 'column',
  },
  closeStatCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#0c111d',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 4,
    padding: 14,
  },
  closeStatCardIcon: {
    fontSize: 18,
    marginBottom: 8,
  },
  closeStatCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  closeStatCardValue: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '800',
    color: '#f1f5f9',
    lineHeight: 22,
  },
  closeStatCardMeta: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    lineHeight: 17,
  },
  closeMainRow: {
    flexDirection: 'row',
    gap: 14,
    width: '100%',
    alignItems: 'flex-start',
  },
  closeMainRowStack: {
    flexDirection: 'column',
  },
  closePanel: {
    backgroundColor: '#0c111d',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 4,
    padding: 16,
    gap: 12,
  },
  closePanelCount: {
    flex: 1,
    minWidth: 0,
  },
  closePanelResumo: {
    width: 300,
    maxWidth: '100%' as const,
    flexShrink: 0,
  },
  closePanelResumoFull: {
    width: '100%',
  },
  closePanelHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f1f5f9',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  closeResumoMetric: {
    gap: 6,
    marginBottom: 4,
  },
  closeResumoLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  closeResumoValueHero: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f9fafb',
  },
  closeEsperadoHint: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  closeDiffBox: {
    marginTop: 10,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 4,
    borderWidth: 1,
  },
  closeDiffBoxPositive: {
    backgroundColor: 'rgba(22, 163, 74, 0.14)',
    borderColor: '#15803d',
  },
  closeDiffBoxNegative: {
    backgroundColor: 'rgba(127, 29, 29, 0.35)',
    borderColor: '#991b1b',
  },
  closeDiffBoxNeutral: {
    backgroundColor: 'rgba(51, 65, 85, 0.35)',
    borderColor: '#475569',
  },
  closeDiffValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: '900',
    color: '#e2e8f0',
    letterSpacing: 0.3,
  },
  closeDiffValuePositive: {
    color: '#4ade80',
  },
  closeDiffValueNegative: {
    color: '#fca5a5',
  },
  closeResumoHint: {
    marginTop: 12,
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  closeNotesBlock: {
    gap: 8,
    width: '100%',
  },
  closeNotesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeNotesInput: {
    minHeight: 88,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#020617',
    color: '#f9fafb',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  closeDangerButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 4,
    backgroundColor: '#7f1d1d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  closeDangerButtonDisabled: {
    backgroundColor: '#991b1b',
    opacity: 0.85,
  },
  closeDangerButtonText: {
    color: '#fee2e2',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
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
});

