import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/types';
import { api } from '@/services/api';
import { getErrorMessage } from '@/utils/errorMessage';
import { isAdminRole } from '@/utils/roles';

type DuplicateReason = 'sku' | 'barcode' | 'similar';

type DuplicateResult = {
  reason: DuplicateReason;
  product: Product;
};

function normalizeProductListResponse(data: unknown): Product[] {
  if (Array.isArray(data)) return data as Product[];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown[] }).items)) {
    return (data as { items: Product[] }).items;
  }
  return [];
}

const defaultForm = {
  sku: '',
  barcode: '',
  name: '',
  category: '',
  brand: '',
  selling_price: '0',
  cost_price: '',
  can_sell_by_box: false,
  can_sell_by_unit: false,
  pack_name: '',
  unit_name: '',
  units_per_pack: '' as string | number,
  box_selling_price: '',
  unit_selling_price: '',
  minimum_stock: 0,
  batch_number: '',
  expiry_date: '',
  location: '',
  initial_stock: 0,
};

export default function ProdutoCriarScreen() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user && !isAdminRole(user.role)) {
      router.replace('/(tabs)/stock');
    }
  }, [user, router]);

  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryDropdownVisible, setCategoryDropdownVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.products
      .getCategories()
      .then((list) => {
        if (mounted) setCategories(list || []);
      })
      .catch(() => {
        if (mounted) setCategories([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  /** Check for duplicates by SKU, barcode, and strong similarity (name + brand + category). */
  const checkDuplicates = async (): Promise<DuplicateResult | null> => {
    const sku = String(form.sku ?? '').trim();
    const barcode = String(form.barcode ?? '').trim();
    const name = String(form.name ?? '').trim();
    const brand = String(form.brand ?? '').trim();
    const category = String(form.category ?? '').trim();

    // 1) By SKU (exact)
    if (sku) {
      const bySkuRaw = await api.products.list({ search: sku, limit: 10 });
      const bySku = normalizeProductListResponse(bySkuRaw);
      const exact = bySku.find((p) => (p.sku || '').trim() === sku);
      if (exact) return { reason: 'sku', product: exact };
    }

    // 2) By barcode
    if (barcode) {
      try {
        const byBarcode = await api.products.getByBarcode(barcode);
        if (byBarcode) return { reason: 'barcode', product: byBarcode };
      } catch {
        // 404 = no product with this barcode, OK
      }
    }

    // 3) Strong similarity: same name, and brand/category when provided
    if (name) {
      const byNameRaw = await api.products.list({ search: name, limit: 30 });
      const byName = normalizeProductListResponse(byNameRaw);
      const norm = (s: string) => (s || '').trim().toLowerCase();
      const similar = byName.find((p) => {
        if (norm(p.name) !== norm(name)) return false;
        if (brand && norm(p.brand || '') !== norm(brand)) return false;
        if (category && norm(p.category || '') !== norm(category)) return false;
        return true;
      });
      if (similar) return { reason: 'similar', product: similar };
    }

    return null;
  };

  const showDuplicateAlert = (dup: DuplicateResult) => {
    const msg =
      dup.reason === 'sku'
        ? `Já existe um produto com o SKU "${dup.product.sku}".`
        : dup.reason === 'barcode'
          ? `Já existe um produto com este código de barras.`
          : `Já existe um produto muito semelhante (nome, marca e categoria): "${dup.product.name}".`;

    Alert.alert('Produto duplicado', `${msg}\n\nEscolhe uma opção:`, [
      {
        text: 'Abrir produto existente',
        onPress: () =>
          router.replace({ pathname: '/produto', params: { id: String(dup.product.id) } }),
      },
      {
        text: 'Adicionar stock ao existente',
        onPress: () =>
          router.replace({
            pathname: '/produto',
            params: { id: String(dup.product.id), addStock: '1' },
          }),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const handleCreate = async () => {
    const name = String(form.name ?? '').trim();
    const sku = String(form.sku ?? '').trim();
    const category = String(form.category ?? '').trim();
    const barcodeRaw = String(form.barcode ?? '').trim();
    const barcode = barcodeRaw || undefined;

    if (!name) {
      setError('O nome do produto é obrigatório.');
      return;
    }
    if (!sku) {
      setError('O SKU é obrigatório.');
      return;
    }
    if (!category) {
      setError('A categoria é obrigatória.');
      return;
    }

    if (form.can_sell_by_unit && (!form.units_per_pack || Number(form.units_per_pack) < 1)) {
      setError('Unidades por caixa é obrigatório quando a venda por unidade está activa.');
      return;
    }

    const sellingPrice = Number.parseFloat(String(form.selling_price).replace(',', '.')) || 0;
    if (Number.isNaN(sellingPrice) || sellingPrice < 0) {
      setError('Preço de venda inválido.');
      return;
    }

    setCheckingDuplicates(true);
    setError(null);
    try {
      const dup = await checkDuplicates();
      if (dup) {
        showDuplicateAlert(dup);
        return;
      }
    } catch (e) {
      // Duplicate checks are helpful, but should never block product creation if they fail.
      console.warn('[produto-criar] duplicate-check failed; continuing create flow', e);
    } finally {
      setCheckingDuplicates(false);
    }

    const initialStock = Number.parseInt(String(form.initial_stock), 10) || 0;
    const unitsPerPack =
      form.units_per_pack === '' || form.units_per_pack == null
        ? null
        : Number(form.units_per_pack);
    const boxPrice =
      form.box_selling_price === ''
        ? null
        : Number.parseFloat(String(form.box_selling_price).replace(',', '.'));
    const unitPrice =
      form.unit_selling_price === ''
        ? null
        : Number.parseFloat(String(form.unit_selling_price).replace(',', '.'));

    const payload: Record<string, unknown> = {
      sku,
      barcode: barcode || null,
      name,
      category: category || null,
      brand: form.brand?.trim() || null,
      selling_price: String(sellingPrice),
      cost_price:
        form.cost_price === ''
          ? null
          : String(Number.parseFloat(String(form.cost_price).replace(',', '.')) || 0),
      can_sell_by_box: !!form.can_sell_by_box,
      can_sell_by_unit: !!form.can_sell_by_unit,
      pack_name: form.pack_name?.trim() || null,
      unit_name: form.unit_name?.trim() || null,
      units_per_pack: unitsPerPack,
      box_selling_price: boxPrice != null && !Number.isNaN(boxPrice) ? String(boxPrice) : null,
      unit_selling_price: unitPrice != null && !Number.isNaN(unitPrice) ? String(unitPrice) : null,
      minimum_stock: Number(form.minimum_stock) || 0,
      batch_number: form.batch_number?.trim() || null,
      expiry_date: form.expiry_date?.trim() || null,
      location: form.location?.trim() || null,
      // Keep explicit zero for compatibility with backend product-create schema.
      stock_quantity: 0,
    };

    setSaving(true);
    setError(null);
    try {
      const created = await api.products.create(payload as Omit<Product, 'id' | 'created_at' | 'updated_at'>);

      if (initialStock > 0) {
        const today = new Date();
        const dateStr = today.toLocaleDateString('pt-PT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        await api.stockMovements.addStock({
          product_id: created.id,
          quantity: initialStock,
          movement_type: 'purchase',
          reason: `Stock inicial (adicionado no dia ${dateStr})`,
        });
      }

      Alert.alert(
        'Produto criado',
        initialStock > 0
          ? `Produto criado e registadas ${initialStock} unidades em stock inicial.`
          : 'Produto criado com sucesso.',
        [
          {
            text: 'Ver produto',
            onPress: () =>
              router.replace({ pathname: '/produto', params: { id: String(created.id) } }),
          },
          {
            text: 'Continuar a adicionar',
            onPress: () => setForm(defaultForm),
          },
        ],
      );
    } catch (e) {
      console.error('[produto-criar] create failed', e);
      let message = getErrorMessage(e);
      if (message === 'Something went wrong.' || message === 'Something went wrong. Please try again.') {
        if (e instanceof Error && e.message?.trim()) {
          message = e.message.trim();
        } else {
          try {
            message = JSON.stringify(e);
          } catch {
            message = 'Falha ao criar produto. Verifica conexão/API e tenta novamente.';
          }
        }
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Novo produto</Text>
          <Text style={styles.subtitle}>
            Preenche os campos obrigatórios. SKU e código de barras devem ser únicos. Stock inicial
            é registado como movimento auditable.
          </Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Erro</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Identificação */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Identificação *</Text>
            <View style={styles.field}>
              <Text style={styles.label}>SKU *</Text>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={form.sku}
                  onChangeText={(t) => update('sku', t)}
                  placeholder="Ex.: MED-0001"
                  placeholderTextColor="#6b7280"
                  autoCapitalize="characters"
                />
                <Pressable
                  style={({ pressed }) => [
                    styles.suggestButton,
                    pressed && styles.suggestButtonPressed,
                  ]}
                  onPress={async () => {
                    if (!form.category?.trim() && !form.name?.trim()) {
                      setError('Indica categoria ou nome para sugerir SKU.');
                      return;
                    }
                    setError(null);
                    try {
                      const res = await api.products.suggestSku({
                        category: form.category?.trim() || undefined,
                        name: form.name?.trim() || undefined,
                      });
                      update('sku', res.sku);
                    } catch (e) {
                      setError(getErrorMessage(e));
                    }
                  }}>
                  <Text style={styles.suggestButtonText}>Sugerir SKU</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Código de barras</Text>
              <TextInput
                style={styles.input}
                value={form.barcode}
                onChangeText={(t) => update('barcode', t)}
                placeholder="Opcional; deve ser único se preenchido"
                placeholderTextColor="#6b7280"
                keyboardType="default"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Nome *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(t) => update('name', t)}
                placeholder="Nome do produto"
                placeholderTextColor="#6b7280"
              />
            </View>
          </View>

          {/* Categoria / Marca */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Categoria e marca *</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Categoria *</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.dropdownTrigger,
                  pressed && styles.dropdownTriggerPressed,
                ]}
                onPress={() => setCategoryDropdownVisible(true)}>
                <Text
                  style={[
                    styles.dropdownTriggerText,
                    !form.category && styles.dropdownTriggerPlaceholder,
                  ]}
                  numberOfLines={1}>
                  {form.category || 'Seleccionar categoria'}
                </Text>
                <Text style={styles.dropdownChevron}>▼</Text>
              </Pressable>
              <Modal
                visible={categoryDropdownVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setCategoryDropdownVisible(false)}>
                <Pressable
                  style={styles.dropdownBackdrop}
                  onPress={() => setCategoryDropdownVisible(false)}>
                  <View style={styles.dropdownModal}>
                    <Text style={styles.dropdownModalTitle}>Categoria</Text>
                    <ScrollView
                      style={styles.dropdownList}
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled>
                      {categories.map((cat) => (
                        <Pressable
                          key={cat}
                          style={({ pressed }) => [
                            styles.dropdownItem,
                            form.category === cat && styles.dropdownItemSelected,
                            pressed && styles.dropdownItemPressed,
                          ]}
                          onPress={() => {
                            update('category', cat);
                            setCategoryDropdownVisible(false);
                          }}>
                          <Text
                            style={[
                              styles.dropdownItemText,
                              form.category === cat && styles.dropdownItemTextSelected,
                            ]}>
                            {cat}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable
                        style={({ pressed }) => [
                          styles.dropdownItem,
                          styles.dropdownItemOther,
                          pressed && styles.dropdownItemPressed,
                        ]}
                        onPress={() => {
                          setCategoryDropdownVisible(false);
                        }}>
                        <Text style={styles.dropdownItemTextOther}>Outra (escrever abaixo)</Text>
                      </Pressable>
                    </ScrollView>
                    <Pressable
                      style={({ pressed }) => [
                        styles.dropdownCancelBtn,
                        pressed && styles.dropdownCancelBtnPressed,
                      ]}
                      onPress={() => setCategoryDropdownVisible(false)}>
                      <Text style={styles.dropdownCancelText}>Fechar</Text>
                    </Pressable>
                  </View>
                </Pressable>
              </Modal>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                value={form.category}
                onChangeText={(t) => update('category', t)}
                placeholder={
                  categories.length === 0
                    ? 'Escrever categoria (lista em carregamento)'
                    : 'Ou escrever outra categoria'
                }
                placeholderTextColor="#6b7280"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Marca</Text>
              <TextInput
                style={styles.input}
                value={form.brand}
                onChangeText={(t) => update('brand', t)}
                placeholder="Marca"
                placeholderTextColor="#6b7280"
              />
            </View>
          </View>

          {/* Preços */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preços</Text>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Preço de venda (Kz) *</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={form.selling_price}
                  onChangeText={(t) => update('selling_price', t)}
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Preço de custo (Kz)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={form.cost_price}
                  onChangeText={(t) => update('cost_price', t)}
                  placeholder="Opcional"
                  placeholderTextColor="#6b7280"
                />
              </View>
            </View>
          </View>

          {/* Stock inicial (auditable) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stock inicial</Text>
            <Text style={styles.hint}>
              Se preenchido, o stock é registado como movimento de compra (auditável). Deixar 0 para
              criar apenas o produto.
            </Text>
            <View style={styles.field}>
              <Text style={styles.label}>Quantidade inicial</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={form.initial_stock === 0 ? '' : String(form.initial_stock)}
                onChangeText={(t) =>
                  update('initial_stock', Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0)
                }
                placeholder="0"
                placeholderTextColor="#6b7280"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Stock mínimo</Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={String(form.minimum_stock)}
                onChangeText={(t) =>
                  update('minimum_stock', Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0)
                }
              />
            </View>
          </View>

          {/* Venda por caixa / unidade (single product, multiple sale modes) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Venda por caixa / unidade</Text>
            <Text style={styles.hint}>
              Um único produto pode ser vendido por caixa e/ou por unidade (ex.: caixa de 10
              comprimidos).
            </Text>
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Pode vender por caixa</Text>
              <Switch
                value={form.can_sell_by_box}
                onValueChange={(v) => update('can_sell_by_box', v)}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Pode vender por unidade</Text>
              <Switch
                value={form.can_sell_by_unit}
                onValueChange={(v) => update('can_sell_by_unit', v)}
              />
            </View>

            {(form.can_sell_by_box || form.can_sell_by_unit) && (
              <>
                <View style={styles.row}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Nome da caixa</Text>
                    <TextInput
                      style={styles.input}
                      value={form.pack_name}
                      onChangeText={(t) => update('pack_name', t)}
                      placeholder="Caixa"
                      placeholderTextColor="#6b7280"
                    />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Nome da unidade</Text>
                    <TextInput
                      style={styles.input}
                      value={form.unit_name}
                      onChangeText={(t) => update('unit_name', t)}
                      placeholder="Lâmina"
                      placeholderTextColor="#6b7280"
                    />
                  </View>
                </View>

                {form.can_sell_by_unit && (
                  <View style={styles.field}>
                    <Text style={styles.label}>Unidades por caixa *</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="number-pad"
                      value={form.units_per_pack === '' ? '' : String(form.units_per_pack)}
                      onChangeText={(t) =>
                        update(
                          'units_per_pack',
                          t === '' ? '' : Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || '',
                        )
                      }
                      placeholder="Ex.: 10"
                      placeholderTextColor="#6b7280"
                    />
                  </View>
                )}

                <View style={styles.row}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Preço caixa (Kz)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={form.box_selling_price}
                      onChangeText={(t) => {
                        update('box_selling_price', t);
                        if (form.can_sell_by_unit && form.units_per_pack) {
                          const box = Number.parseFloat(t.replace(',', '.'));
                          if (!Number.isNaN(box) && Number(form.units_per_pack) > 0) {
                            update(
                              'unit_selling_price',
                              (box / Number(form.units_per_pack)).toFixed(2),
                            );
                          }
                        }
                      }}
                      placeholder="5000"
                      placeholderTextColor="#6b7280"
                    />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.label}>Preço unidade (Kz)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={form.unit_selling_price}
                      onChangeText={(t) => update('unit_selling_price', t)}
                      placeholder="Auto a partir da caixa"
                      placeholderTextColor="#6b7280"
                    />
                  </View>
                </View>
              </>
            )}
          </View>

          {/* Validade / localização */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Validade e localização</Text>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Lote</Text>
                <TextInput
                  style={styles.input}
                  value={form.batch_number}
                  onChangeText={(t) => update('batch_number', t)}
                  placeholder="Lote"
                  placeholderTextColor="#6b7280"
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Validade (AAAA-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={form.expiry_date}
                  onChangeText={(t) => update('expiry_date', t)}
                  placeholder="2027-01-31"
                  placeholderTextColor="#6b7280"
                />
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Prateleira / localização</Text>
              <TextInput
                style={styles.input}
                value={form.location}
                onChangeText={(t) => update('location', t)}
                placeholder="Ex.: Corredor 3, Prateleira B"
                placeholderTextColor="#6b7280"
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.createButton,
                (saving || checkingDuplicates) && styles.createButtonDisabled,
                pressed && !saving && !checkingDuplicates && styles.createButtonPressed,
              ]}
              onPress={saving || checkingDuplicates ? undefined : handleCreate}
              disabled={saving || checkingDuplicates}>
              <Text style={styles.createButtonText}>
                {checkingDuplicates
                  ? 'A verificar duplicados...'
                  : saving
                    ? 'A criar...'
                    : 'Criar produto'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  subtitle: {
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 4,
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
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  field: {
    gap: 4,
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
  suggestButton: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#1e3a5f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestButtonPressed: {
    backgroundColor: '#1e4976',
  },
  suggestButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#93c5fd',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 12,
    backgroundColor: '#0f172a',
  },
  dropdownTriggerPressed: {
    backgroundColor: '#1e293b',
  },
  dropdownTriggerText: {
    fontSize: 15,
    color: '#f9fafb',
    flex: 1,
  },
  dropdownTriggerPlaceholder: {
    color: '#6b7280',
  },
  dropdownChevron: {
    fontSize: 10,
    color: '#9ca3af',
    marginLeft: 8,
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  dropdownModal: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    maxHeight: 400,
  },
  dropdownModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e5e7eb',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  dropdownList: {
    maxHeight: 280,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  dropdownItemSelected: {
    backgroundColor: '#1e3a5f',
  },
  dropdownItemPressed: {
    backgroundColor: '#1e293b',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#e5e7eb',
  },
  dropdownItemTextSelected: {
    color: '#93c5fd',
    fontWeight: '600',
  },
  dropdownItemOther: {
    borderBottomWidth: 0,
  },
  dropdownItemTextOther: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  dropdownCancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  dropdownCancelBtnPressed: {
    backgroundColor: '#1e293b',
  },
  dropdownCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#9ca3af',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  actions: {
    marginTop: 8,
  },
  createButton: {
    height: 48,
    borderRadius: 999,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonPressed: {
    opacity: 0.9,
  },
  createButtonDisabled: {
    backgroundColor: '#4b5563',
  },
  createButtonText: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '600',
  },
});
