import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/services/api';
import type { Product } from '@/types';
import { fetchAllProducts } from '@/utils/fetchAllProducts';
import { getErrorMessage } from '@/utils/errorMessage';
import { isAdminRole } from '@/utils/roles';

export default function StockScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const canManageProducts = isAdminRole(user?.role);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialSaveError, setInitialSaveError] = useState<string | null>(null);
  /** Draft back/front per product. undefined = use server value, null = user cleared, number = user entered. */
  const [draftCounts, setDraftCounts] = useState<Record<number, { back?: number | null; front?: number | null }>>({});
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  /** Catálogo demo antigo usava SKUs longos (ex.: ANT-METR-TAB-013). Seed real usa formato curto (ex.: ANTI-0001). */
  const showsLegacyDemoCatalog = useMemo(
    () => products.length > 0 && products.some((p) => (p.sku || '').split('-').length >= 4),
    [products],
  );

  const loadProducts = async (opts?: { refresh?: boolean }) => {
    if (opts?.refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    setInitialSaveError(null);
    try {
      const data = await fetchAllProducts({
        search: search.trim() || undefined,
        category: selectedCategory === 'Todos' ? undefined : selectedCategory,
        low_stock: false,
      });
      setProducts(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (opts?.refresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    api.products
      .getCategories()
      .then((cats) => {
        if (!mounted) return;
        setCategories(cats);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      await loadProducts();
    };
    run();

    return () => {
      isMounted = false;
    };
  }, [search, selectedCategory]);

  const renderItem = ({ item }: { item: Product }) => {
    const isLowStock = item.stock_quantity <= item.minimum_stock;
    const draft = draftCounts[item.id] ?? {};
    const effectiveBack = draft.back !== undefined ? draft.back : (item.initial_back_count ?? null);
    const effectiveFront = draft.front !== undefined ? draft.front : (item.initial_front_count ?? null);
    const confirmed = item.initial_count_confirmed === true;
    const canConfirm = !confirmed && effectiveBack != null && effectiveFront != null;
    const isConfirming = confirmingId === item.id;

    const saveBack = (n: number) => {
      setError(null);
      setInitialSaveError(null);
      api.products.initialCounts
        .setBack(item.id, n)
        .then(() => loadProducts())
        .catch((err) => {
          const msg = getErrorMessage(err);
          setInitialSaveError(
            /not found|não encontrado/i.test(msg)
              ? 'Serviço de auditoria inicial não disponível. Faça deploy do backend mais recente (inventory-initial).'
              : msg
          );
        });
    };

    const saveFront = (n: number) => {
      setError(null);
      setInitialSaveError(null);
      api.products.initialCounts
        .setFront(item.id, n)
        .then(() => loadProducts())
        .catch((err) => {
          const msg = getErrorMessage(err);
          setInitialSaveError(
            /not found|não encontrado/i.test(msg)
              ? 'Serviço de auditoria inicial não disponível. Faça deploy do backend mais recente (inventory-initial).'
              : msg
          );
        });
    };

    const handleConfirm = async () => {
      if (!canConfirm || effectiveBack == null || effectiveFront == null) return;
      setError(null);
      setInitialSaveError(null);
      setConfirmingId(item.id);
      try {
        await api.products.initialCounts.setBack(item.id, effectiveBack);
        await api.products.initialCounts.setFront(item.id, effectiveFront);
        await api.products.initialCounts.confirm(item.id);
        setDraftCounts((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        await loadProducts();
      } catch (err) {
        const msg = getErrorMessage(err);
        setInitialSaveError(
          /not found|não encontrado/i.test(msg)
            ? 'Serviço de auditoria inicial não disponível. Faça deploy do backend mais recente (inventory-initial).'
            : msg
        );
      } finally {
        setConfirmingId(null);
      }
    };

    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && styles.cardPressed,
          isLowStock && styles.cardLowStock,
        ]}
        android_ripple={{ color: '#111827' }}
        onPress={() =>
          router.push({
            pathname: '/produto',
            params: { id: String(item.id) },
          })
        }>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.cardStock}>{item.stock_quantity}</Text>
        </View>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardMeta}>
            SKU: {item.sku}{' '}
            {item.barcode ? ` • Código: ${item.barcode}` : ''}
          </Text>
        </View>
        <View style={styles.initialCountsRow} onStartShouldSetResponder={() => true}>
          <View style={styles.initialColumn}>
            <Text style={styles.initialLabel}>Back inicial</Text>
            <TextInput
              style={styles.initialInput}
              keyboardType="number-pad"
              value={effectiveBack != null ? String(effectiveBack) : ''}
              placeholder="0"
              placeholderTextColor="#6b7280"
              onChangeText={(t) => {
                const s = t.replace(/[^0-9]/g, '');
                const n = s === '' ? null : Math.max(0, parseInt(s, 10));
                setDraftCounts((prev) => ({
                  ...prev,
                  [item.id]: { ...(prev[item.id] ?? {}), back: n },
                }));
              }}
              onEndEditing={(e) => {
                const v = e.nativeEvent.text.trim();
                const n = v === '' ? null : parseInt(v, 10);
                if (n == null || Number.isNaN(n) || n < 0) return;
                saveBack(n);
              }}
              editable={!confirmed}
            />
          </View>
          <View style={styles.initialColumn}>
            <Text style={styles.initialLabel}>Frente inicial</Text>
            <TextInput
              style={styles.initialInput}
              keyboardType="number-pad"
              value={effectiveFront != null ? String(effectiveFront) : ''}
              placeholder="0"
              placeholderTextColor="#6b7280"
              onChangeText={(t) => {
                const s = t.replace(/[^0-9]/g, '');
                const n = s === '' ? null : Math.max(0, parseInt(s, 10));
                setDraftCounts((prev) => ({
                  ...prev,
                  [item.id]: { ...(prev[item.id] ?? {}), front: n },
                }));
              }}
              onEndEditing={(e) => {
                const v = e.nativeEvent.text.trim();
                const n = v === '' ? null : parseInt(v, 10);
                if (n == null || Number.isNaN(n) || n < 0) return;
                saveFront(n);
              }}
              editable={!confirmed}
            />
          </View>
        </View>
        <View style={styles.initialFooterRow} onStartShouldSetResponder={() => true}>
          {confirmed && item.initial_total_count != null ? (
            <Text style={styles.initialConfirmedText}>
              Baseline confirmado: {item.initial_total_count} unid.
            </Text>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.initialConfirmBtn,
                pressed && styles.initialConfirmBtnPressed,
                !canConfirm && styles.initialConfirmBtnDisabled,
              ]}
              disabled={!canConfirm || isConfirming}
              onPress={handleConfirm}>
              <Text style={styles.initialConfirmText}>
                {isConfirming ? 'A confirmar...' : 'Confirmar baseline'}
              </Text>
            </Pressable>
          )}
        </View>
        {isLowStock && (
          <View style={styles.badgeRow}>
            <Text style={styles.badgeLowStock}>Stock baixo</Text>
          </View>
        )}
      </Pressable>
    );
  };

  const exportProducts = async () => {
    if (typeof document === 'undefined') {
      setError('Exportação Excel disponível na versão web.');
      return;
    }
    try {
      setExporting(true);
      setError(null);
      const blob = await api.products.exportXlsx({
        search: search.trim() || undefined,
        category: selectedCategory === 'Todos' ? undefined : selectedCategory,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `products_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Stock</Text>
          <Text style={styles.subtitle}>Gestão do inventário e reposição.</Text>
          {!loading && !error && (
            <Text style={styles.productCount}>
              {products.length} produto{products.length === 1 ? '' : 's'}
            </Text>
          )}
        </View>
        <View style={styles.headerButtons}>
          <Pressable
            style={({ pressed }) => [
              styles.exportButton,
              pressed && styles.exportButtonPressed,
              exporting && styles.exportButtonDisabled,
            ]}
            disabled={exporting}
            onPress={() => void exportProducts()}>
            <Text style={styles.exportButtonText}>{exporting ? 'A exportar...' : 'Exportar Excel'}</Text>
          </Pressable>
          {canManageProducts ? (
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.addButtonPressed,
              ]}
              android_ripple={{ color: '#166534' }}
              onPress={() => router.push('/produto-criar')}>
              <Text style={styles.addButtonText}>Adicionar produto</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Procurar por nome, SKU ou código..."
          placeholderTextColor="#6b7280"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {categories.length > 0 && (
        <View style={styles.categoriesRow}>
          <FlatList
            horizontal
            data={['Todos', ...categories]}
            keyExtractor={(item) => item || 'empty'}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesContent}
            renderItem={({ item }) => {
              const active = item === selectedCategory;
              return (
                <Pressable
                  onPress={() => setSelectedCategory(item)}
                  style={({ pressed }) => [
                    styles.categoryChip,
                    active && styles.categoryChipActive,
                    pressed && styles.categoryChipPressed,
                  ]}>
                  <Text
                    style={[
                      styles.categoryLabel,
                      active && styles.categoryLabelActive,
                    ]}>
                    {item || 'Sem categoria'}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      )}

      {loading && !refreshing && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#16a34a" />
          <Text style={styles.loadingText}>A carregar stock...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Não foi possível carregar o stock</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {initialSaveError && (
        <View style={styles.initialErrorBox}>
          <Text style={styles.initialErrorTitle}>Erro ao guardar contagem inicial</Text>
          <Text style={styles.initialErrorText}>{initialSaveError}</Text>
        </View>
      )}

      {showsLegacyDemoCatalog && (
        <View style={styles.legacyBanner}>
          <Text style={styles.legacyBannerTitle}>Base de dados antiga (demonstração)</Text>
          <Text style={styles.legacyBannerText}>
            SKUs longos (ex. ANT-METR-TAB-013) e stock a zero = catálogo fictício ainda na cloud. As
            quantidades do levantamento não aparecem até correres o seed na mesma base que o Railway usa a API.
            No PC: na pasta backend,{' '}
            <Text style={styles.legacyBannerMono}>railway run python seed_products.py --yes</Text>
            {' '}ou <Text style={styles.legacyBannerMono}>DATABASE_URL=… python seed_products.py --yes</Text>.
            Guia: <Text style={styles.legacyBannerMono}>farmacia-web/backend/RUN_SEED.md</Text>.
          </Text>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadProducts({ refresh: true })}
              tintColor="#16a34a"
            />
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Nenhum produto encontrado.</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    paddingRight: 8,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
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
  productCount: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  searchRow: {
    marginBottom: 8,
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#16a34a',
  },
  addButtonPressed: {
    backgroundColor: '#15803d',
  },
  addButtonText: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '600',
  },
  exportButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1d4ed8',
  },
  exportButtonPressed: {
    backgroundColor: '#1e40af',
  },
  exportButtonDisabled: {
    opacity: 0.65,
  },
  exportButtonText: {
    color: '#f9fafb',
    fontSize: 13,
    fontWeight: '600',
  },
  categoriesRow: {
    marginBottom: 4,
  },
  categoriesContent: {
    paddingVertical: 4,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#020617',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  categoryChipPressed: {
    opacity: 0.85,
  },
  categoryLabel: {
    fontSize: 13,
    color: '#e5e7eb',
  },
  categoryLabelActive: {
    color: '#f9fafb',
    fontWeight: '600',
  },
  searchInput: {
    height: 44,
    borderRadius: 999,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#020617',
    color: '#f9fafb',
  },
  loadingBox: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#9ca3af',
  },
  errorBox: {
    marginTop: 8,
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
  initialErrorBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#422006',
    borderWidth: 1,
    borderColor: '#b45309',
  },
  initialErrorTitle: {
    fontWeight: '600',
    color: '#fef3c7',
    marginBottom: 4,
  },
  initialErrorText: {
    color: '#fef3c7',
    fontSize: 13,
  },
  legacyBanner: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#1e1b4b',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  legacyBannerTitle: {
    fontWeight: '700',
    color: '#e0e7ff',
    marginBottom: 6,
    fontSize: 14,
  },
  legacyBannerText: {
    color: '#c7d2fe',
    fontSize: 12,
    lineHeight: 18,
  },
  legacyBannerMono: {
    fontFamily: 'monospace',
    color: '#fde047',
    fontSize: 11,
  },
  listContent: {
    paddingVertical: 8,
    paddingBottom: 24,
    gap: 8,
  },
  card: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#020617',
    marginBottom: 8,
  },
  cardPressed: {
    backgroundColor: '#030712',
  },
  cardLowStock: {
    borderWidth: 1,
    borderColor: '#f97316',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#e5e7eb',
    marginRight: 8,
  },
  cardStock: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  cardMetaRow: {
    marginTop: 2,
  },
  cardMeta: {
    fontSize: 12,
    color: '#9ca3af',
  },
  initialCountsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  initialColumn: {
    flex: 1,
  },
  initialLabel: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 2,
  },
  initialInput: {
    height: 32,
    borderRadius: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#020617',
    color: '#f9fafb',
    fontSize: 13,
  },
  initialFooterRow: {
    marginTop: 8,
  },
  initialConfirmedText: {
    fontSize: 12,
    color: '#bbf7d0',
  },
  initialConfirmBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#16a34a',
  },
  initialConfirmBtnPressed: {
    backgroundColor: '#15803d',
  },
  initialConfirmBtnDisabled: {
    backgroundColor: '#4b5563',
  },
  initialConfirmText: {
    fontSize: 12,
    color: '#f9fafb',
    fontWeight: '600',
  },
  badgeRow: {
    marginTop: 6,
  },
  badgeLowStock: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 11,
    color: '#f97316',
    backgroundColor: '#111827',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
  },
});

