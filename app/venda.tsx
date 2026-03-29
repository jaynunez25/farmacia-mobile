import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';

import { api } from '@/services/api';
import type { Sale } from '@/types';
import { formatCurrency } from '@/utils/currency';
import { getErrorMessage } from '@/utils/errorMessage';

export default function VendaDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const idParam = params.id;

  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!idParam) {
        setError('ID da venda em falta.');
        setLoading(false);
        return;
      }
      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        setError('ID da venda inválido.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const s = await api.sales.get(id);
        setSale(s);
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [idParam]);

  const paymentMethod =
    (sale as unknown as { payment_method?: string })?.payment_method ?? '—';

  const createdAt = sale?.created_at ? new Date(sale.created_at) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          {sale ? `Venda #${sale.id}` : 'Detalhe da venda'}
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

        {!loading && !error && sale && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resumo</Text>
              {createdAt && (
                <Text style={styles.line}>
                  <Text style={styles.label}>Data: </Text>
                  {createdAt.toLocaleDateString()}{' '}
                  {createdAt.toLocaleTimeString()}
                </Text>
              )}
              <Text style={styles.line}>
                <Text style={styles.label}>Total: </Text>
                {formatCurrency(sale.total_amount)}
              </Text>
              <Text style={styles.line}>
                <Text style={styles.label}>Método de pagamento: </Text>
                {paymentMethod}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Itens</Text>
              {sale.items.length === 0 ? (
                <Text style={styles.emptyText}>Nenhum item registado.</Text>
              ) : (
                sale.items.map(item => {
                  const anyItem = item as unknown as {
                    product_name?: string;
                    sku?: string;
                  };
                  const name =
                    anyItem.product_name ??
                    `Produto #${item.product_id}`;
                  const sku = anyItem.sku;
                  const unitPrice = Number(item.unit_price);
                  const lineTotal = Number(item.total);
                  return (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{name}</Text>
                        <Text style={styles.itemMeta}>
                          {sku ? `SKU: ${sku} · ` : ''}
                          {formatCurrency(unitPrice)} × {item.quantity} ={' '}
                          {formatCurrency(lineTotal)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
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
  section: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#111827',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  line: {
    fontSize: 13,
    color: '#e5e7eb',
  },
  label: {
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: '#6b7280',
  },
  itemRow: {
    borderTopWidth: 1,
    borderTopColor: '#111827',
    paddingTop: 8,
    marginTop: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  itemMeta: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
});

