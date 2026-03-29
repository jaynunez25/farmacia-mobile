import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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

type EditableProduct = Product;

export default function ProdutoEditarScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();

  useEffect(() => {
    if (user && !isAdminRole(user.role)) {
      router.replace('/(tabs)/stock');
    }
  }, [user, router]);

  const [product, setProduct] = useState<EditableProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await api.products.get(Number(id));
        if (!mounted) return;
        setProduct(data);
      } catch (err) {
        if (!mounted) return;
        setError(getErrorMessage(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [id]);

  const update = <K extends keyof EditableProduct>(key: K, value: EditableProduct[K]) => {
    setProduct((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!id || !product) return;

    const name = product.name.trim();
    if (!name) {
      Alert.alert('Nome obrigatório', 'O nome do produto é obrigatório.');
      return;
    }

    const stock = Number.parseInt(String(product.stock_quantity ?? 0), 10);
    const minStock = Number.parseInt(String(product.minimum_stock ?? 0), 10);
    if (Number.isNaN(stock) || stock < 0 || Number.isNaN(minStock) || minStock < 0) {
      Alert.alert(
        'Valores inválidos',
        'Stock actual e stock mínimo devem ser números maiores ou iguais a 0.',
      );
      return;
    }

    if (product.can_sell_by_unit && (!product.units_per_pack || product.units_per_pack < 1)) {
      Alert.alert(
        'Configuração inválida',
        'Unidades por caixa é obrigatório quando a venda por unidade está activa.',
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const raw = product as unknown as Record<string, unknown>;
      const payload: Record<string, unknown> = {};
      const allowed = [
        'name',
        'category',
        'brand',
        'selling_price',
        'cost_price',
        'stock_quantity',
        'minimum_stock',
        'batch_number',
        'expiry_date',
        'location',
        'is_verified',
        'can_sell_by_box',
        'can_sell_by_unit',
        'pack_name',
        'unit_name',
        'units_per_pack',
        'box_selling_price',
        'unit_selling_price',
      ] as const;

      for (const key of allowed) {
        let v = raw[key];
        if (v === undefined) continue;

        if (key === 'selling_price') {
          const s = String(v ?? '').trim();
          payload[key] = s === '' ? '0' : s;
          continue;
        }

        if (key === 'cost_price' || key === 'box_selling_price' || key === 'unit_selling_price') {
          const s = String(v ?? '').trim();
          payload[key] = s === '' ? null : s;
          continue;
        }

        if (key === 'can_sell_by_box' || key === 'can_sell_by_unit' || key === 'is_verified') {
          payload[key] = Boolean(v);
          continue;
        }

        if (key === 'units_per_pack') {
          const n = Number.parseInt(String(v ?? ''), 10);
          payload[key] = Number.isNaN(n) || n < 1 ? null : n;
          continue;
        }

        if (key === 'stock_quantity' || key === 'minimum_stock') {
          const n = Number.parseInt(String(v ?? ''), 10);
          payload[key] = Number.isNaN(n) || n < 0 ? 0 : n;
          continue;
        }

        if (key === 'expiry_date') {
          const s = String(v ?? '').trim();
          payload[key] = s === '' ? null : s;
          continue;
        }

        if (
          key === 'name' ||
          key === 'category' ||
          key === 'brand' ||
          key === 'batch_number' ||
          key === 'location' ||
          key === 'pack_name' ||
          key === 'unit_name'
        ) {
          if (typeof v === 'string') {
            const s = v.trim();
            payload[key] = s === '' ? null : s;
          } else {
            payload[key] = v ?? null;
          }
          continue;
        }

        payload[key] = v ?? null;
      }

      await api.products.update(Number(id), payload as Partial<Product>);

      Alert.alert('Produto actualizado', 'As alterações foram guardadas.', [
        {
          text: 'OK',
          onPress: () =>
            router.replace({
              pathname: '/produto',
              params: { id: String(id) },
            }),
        },
      ]);

      router.replace({
        pathname: '/produto',
        params: { id: String(id) },
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      )}

      {!loading && product && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Editar produto</Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorTitle}>Não foi possível guardar</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Identificação */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Identificação</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Nome</Text>
                <TextInput
                  style={styles.input}
                  value={product.name}
                  onChangeText={(t) => update('name', t)}
                  placeholder="Nome do produto"
                  placeholderTextColor="#6b7280"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>SKU</Text>
                <Text style={styles.valueStatic}>{product.sku}</Text>
              </View>
              {product.barcode && (
                <View style={styles.field}>
                  <Text style={styles.label}>Código de barras</Text>
                  <Text style={styles.valueStatic}>{product.barcode}</Text>
                </View>
              )}
            </View>

            {/* Categoria / Marca */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Categoria e marca</Text>
              <View style={styles.field}>
                <Text style={styles.label}>Categoria</Text>
                <TextInput
                  style={styles.input}
                  value={product.category ?? ''}
                  onChangeText={(t) => update('category', t)}
                  placeholder="Categoria"
                  placeholderTextColor="#6b7280"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Marca</Text>
                <TextInput
                  style={styles.input}
                  value={product.brand ?? ''}
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
                  <Text style={styles.label}>Preço de venda (Kz)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={String(product.selling_price)}
                    onChangeText={(t) => update('selling_price', t as unknown as Product['selling_price'])}
                  />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Preço de custo (Kz)</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="decimal-pad"
                    value={product.cost_price ? String(product.cost_price) : ''}
                    onChangeText={(t) =>
                      update('cost_price', (t === '' ? null : t) as unknown as Product['cost_price'])
                    }
                  />
                </View>
              </View>
            </View>

            {/* Stock */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Stock</Text>
              <View style={styles.row}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Stock actual</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={String(product.stock_quantity)}
                    onChangeText={(t) =>
                      update(
                        'stock_quantity',
                        Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0,
                      )
                    }
                  />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Stock mínimo</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={String(product.minimum_stock)}
                    onChangeText={(t) =>
                      update(
                        'minimum_stock',
                        Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0,
                      )
                    }
                  />
                </View>
              </View>
            </View>

            {/* Venda por caixa / unidade */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Venda por caixa / unidade</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.label}>Pode vender por caixa</Text>
                <Switch
                  value={!!product.can_sell_by_box}
                  onValueChange={(v) => update('can_sell_by_box', v)}
                />
              </View>
              <View style={styles.toggleRow}>
                <Text style={styles.label}>Pode vender por unidade</Text>
                <Switch
                  value={!!product.can_sell_by_unit}
                  onValueChange={(v) => update('can_sell_by_unit', v)}
                />
              </View>

              {(product.can_sell_by_box || product.can_sell_by_unit) && (
                <>
                  <View style={styles.row}>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Nome da caixa</Text>
                      <TextInput
                        style={styles.input}
                        value={product.pack_name ?? ''}
                        onChangeText={(t) => update('pack_name', t || null)}
                        placeholder="Caixa"
                        placeholderTextColor="#6b7280"
                      />
                    </View>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Nome da unidade</Text>
                      <TextInput
                        style={styles.input}
                        value={product.unit_name ?? ''}
                        onChangeText={(t) => update('unit_name', t || null)}
                        placeholder="Lâmina"
                        placeholderTextColor="#6b7280"
                      />
                    </View>
                  </View>

                  {product.can_sell_by_unit && (
                    <View style={styles.field}>
                      <Text style={styles.label}>Unidades por caixa</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="number-pad"
                        value={product.units_per_pack ? String(product.units_per_pack) : ''}
                        onChangeText={(t) =>
                          update(
                            'units_per_pack',
                            t === ''
                              ? null
                              : (Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || null),
                          )
                        }
                        placeholder="3"
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
                        value={product.box_selling_price ? String(product.box_selling_price) : ''}
                        onChangeText={(t) => {
                          update('box_selling_price', (t === '' ? null : t) as any);
                          if (product.can_sell_by_unit && product.units_per_pack) {
                            const box = Number.parseFloat(t.replace(',', '.'));
                            if (!Number.isNaN(box) && product.units_per_pack) {
                              const unit = box / product.units_per_pack;
                              update('unit_selling_price', unit.toFixed(2) as any);
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
                        value={product.unit_selling_price ? String(product.unit_selling_price) : ''}
                        onChangeText={(t) =>
                          update('unit_selling_price', (t === '' ? null : t) as any)
                        }
                        placeholder="Auto se vazio"
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
                    value={product.batch_number ?? ''}
                    onChangeText={(t) => update('batch_number', t || null)}
                    placeholder="Lote"
                    placeholderTextColor="#6b7280"
                  />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Validade (AAAA-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={product.expiry_date ?? ''}
                    onChangeText={(t) => update('expiry_date', t || null)}
                    placeholder="2027-01-31"
                    placeholderTextColor="#6b7280"
                  />
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Prateleira / localização</Text>
                <TextInput
                  style={styles.input}
                  value={product.location ?? ''}
                  onChangeText={(t) => update('location', t || null)}
                  placeholder="Ex.: Corredor 3, Prateleira B"
                  placeholderTextColor="#6b7280"
                />
              </View>
            </View>

            <View style={styles.actions}>
              <Text
                style={[
                  styles.saveButton,
                  saving && styles.saveButtonDisabled,
                ]}
                onPress={saving ? undefined : handleSave}>
                {saving ? 'A guardar...' : 'Guardar alterações'}
              </Text>
            </View>
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
    fontSize: 20,
    fontWeight: '700',
    color: '#e5e7eb',
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
  valueStatic: {
    fontSize: 14,
    color: '#e5e7eb',
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
  saveButton: {
    height: 44,
    borderRadius: 999,
    backgroundColor: '#16a34a',
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 12,
  },
  saveButtonDisabled: {
    backgroundColor: '#4b5563',
  },
});


