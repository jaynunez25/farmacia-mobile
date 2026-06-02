import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { api, resolveApiMediaUrl } from '@/services/api';
import { getErrorMessage } from '@/utils/errorMessage';
import { isLiquidPharmaceuticalForm } from '@/utils/liquidPharmaceuticalForm';
import { isAdminRole } from '@/utils/roles';
import {
  blisterSplitPayloadForSave,
  blisterTotalFromParts,
  normalizeBlisterParts,
  seedBlisterUiFromProduct,
} from '@/utils/blisterStockUi';
import { clearCaptureDraft, loadCaptureDraft } from '@/utils/captureDraft';

type EditableProduct = Product;

/** Format a total-blisters count as "X caixas + Y lâminas" using `bpp` (blisters per box). */
function formatBoxesLamina(total: number, bpp: number): string {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  if (bpp <= 1) return String(t);
  const boxes = Math.floor(t / bpp);
  const lam = t % bpp;
  if (boxes === 0 && lam === 0) return '0 lâminas';
  if (lam === 0) return `${boxes} caixa${boxes === 1 ? '' : 's'}`;
  if (boxes === 0) return `${lam} lâmina${lam === 1 ? '' : 's'}`;
  return `${boxes} caixa${boxes === 1 ? '' : 's'} + ${lam} lâmina${lam === 1 ? '' : 's'}`;
}

/** Default sale-unit label for the box, derived from pharmaceutical form. Preserves a non-empty
 * `currentPackName`. Used only as a save-side fallback so `pack_name` is not edited as text in the UI. */
function defaultPackNameForForm(
  formValue: string | null | undefined,
  currentPackName: string | null | undefined,
): string {
  const cur = (currentPackName ?? '').toString().trim();
  if (cur) return cur;
  const folded = String(formValue ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/(xarope|suspens|solucao oral|gotas|frasco)/.test(folded)) return 'Frasco';
  if (/(creme|gel|pomada)/.test(folded)) return 'Tubo';
  if (/(ampola|injec|injet)/.test(folded)) return 'Ampola';
  if (/(termometro|luva|dispositivo)/.test(folded)) return 'Unidade';
  return 'Caixa';
}

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
  const [aiCaptureHint, setAiCaptureHint] = useState<string | null>(null);

  // Local UI state for the boxes + loose-blisters inputs (only used when the product is in
  // blister-stock mode). The form's shelf_stock_quantity / warehouse_stock_quantity remain the
  // source of truth (total blisters); these inputs recompute and write back on every change.
  const [shelfBoxes, setShelfBoxes] = useState<number>(0);
  const [shelfLoose, setShelfLoose] = useState<number>(0);
  const [storageBoxes, setStorageBoxes] = useState<number>(0);
  const [storageLoose, setStorageLoose] = useState<number>(0);

  const liquidFormUi = isLiquidPharmaceuticalForm(String(product?.form ?? '').trim());
  const sellByUnit = !!product?.can_sell_by_unit && !liquidFormUi;
  const blistersPerBoxNum = Number(product?.blisters_per_box ?? 0);
  const blistersPerBox =
    sellByUnit && Number.isFinite(blistersPerBoxNum) && blistersPerBoxNum >= 1
      ? Math.floor(blistersPerBoxNum)
      : 0;
  /** Alinhado com produto-criar: >= 1 lâminas/caixa mostra caixas + lâminas soltas. */
  const useBlisterStock = sellByUnit && blistersPerBox >= 1;
  const shelfTotal = Math.max(0, Math.floor(Number(product?.shelf_stock_quantity ?? 0) || 0));
  const warehouseTotal = Math.max(
    0,
    Math.floor(Number(product?.warehouse_stock_quantity ?? 0) || 0),
  );

  // Re-seed boxes/loose state when the blister mode flips on or when totals change externally
  // (e.g. after load). We only update if the current local state does not already match the
  // total to avoid disrupting in-flight keystrokes.
  // Só re-seed ao abrir outro produto — NÃO quando shelf_stock_quantity muda (isso apagava 0 caixas + 1 solta).
  useEffect(() => {
    if (!useBlisterStock || !product) return;
    const seeded = seedBlisterUiFromProduct(product, blistersPerBox);
    setShelfBoxes(seeded.shelfBoxes);
    setShelfLoose(seeded.shelfLoose);
    setStorageBoxes(seeded.storageBoxes);
    setStorageLoose(seeded.storageLoose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, useBlisterStock, blistersPerBox]);

  useEffect(() => {
    if (!product) return;
    let active = true;
    (async () => {
      const draft = await loadCaptureDraft();
      if (!active || !draft) return;
      await clearCaptureDraft();
      const f = draft.form;
      setProduct((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...(f.name?.trim() ? { name: f.name.trim() } : {}),
          ...(f.documentary_name?.trim() ? { documentary_name: f.documentary_name.trim() } : {}),
          ...(f.brand?.trim() ? { brand: f.brand.trim() } : {}),
          ...(f.category?.trim() ? { category: f.category.trim() } : {}),
          ...(f.form?.trim() ? { form: f.form.trim() } : {}),
          ...(f.notes?.trim() ? { notes: f.notes.trim() } : {}),
          ...(f.barcode?.trim() ? { barcode: f.barcode.trim() } : {}),
        };
      });
      const conf =
        draft.overallConfidence != null
          ? ` Confiança: ${Math.round(draft.overallConfidence * 100)}%.`
          : '';
      setAiCaptureHint(
        (draft.needsReview
          ? 'Reveja os campos sugeridos pela captura AI antes de gravar.'
          : 'Sugestões da embalagem (confirme antes de gravar).') + conf,
      );
    })();
    return () => {
      active = false;
    };
  }, [product?.id]);

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
        const total = Math.max(0, Number.parseInt(String(data.stock_quantity ?? 0), 10) || 0);
        const hasSplit =
          data.shelf_stock_quantity != null || data.warehouse_stock_quantity != null;
        let shelf = Math.max(
          0,
          data.shelf_stock_quantity != null
            ? Number.parseInt(String(data.shelf_stock_quantity), 10) || 0
            : total,
        );
        let warehouse = Math.max(
          0,
          data.warehouse_stock_quantity != null
            ? Number.parseInt(String(data.warehouse_stock_quantity), 10) || 0
            : 0,
        );
        if (!hasSplit) {
          shelf = total;
          warehouse = 0;
        }
        const normalized: EditableProduct = {
          ...data,
          shelf_stock_quantity: shelf,
          warehouse_stock_quantity: warehouse,
          stock_quantity: total,
          box_selling_price:
            data.box_selling_price != null
              ? String(data.box_selling_price)
              : data.price_box != null
                ? String(data.price_box)
                : null,
          unit_selling_price:
            data.unit_selling_price != null
              ? String(data.unit_selling_price)
              : data.price_unit != null
                ? String(data.price_unit)
                : null,
        };
        setProduct(normalized);
        const bppLoad =
          data.can_sell_by_unit && Number(data.blisters_per_box ?? 0) >= 1
            ? Math.floor(Number(data.blisters_per_box))
            : 0;
        if (bppLoad >= 1) {
          const seeded = seedBlisterUiFromProduct(normalized, bppLoad);
          setShelfBoxes(seeded.shelfBoxes);
          setShelfLoose(seeded.shelfLoose);
          setStorageBoxes(seeded.storageBoxes);
          setStorageLoose(seeded.storageLoose);
        }
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

  const setBlistersPerBox = (t: string) => {
    const trimmed = t.trim();
    if (trimmed === '') {
      setProduct((prev) =>
        prev ? { ...prev, blisters_per_box: null, units_per_pack: null } : prev,
      );
      return;
    }
    const n = Math.max(1, Number.parseInt(trimmed.replace(/[^0-9]/g, ''), 10) || 1);
    setProduct((prev) => {
      if (!prev) return prev;
      const next: EditableProduct = { ...prev, blisters_per_box: n, units_per_pack: n };
      const unitRaw = next.sale_price_blister ?? next.unit_selling_price;
      const unit = Number.parseFloat(String(unitRaw ?? '').replace(',', '.'));
      if (Number.isFinite(unit) && unit >= 0) {
        const box = (unit * n).toFixed(2);
        next.sale_price_box = box as unknown as Product['sale_price_box'];
        next.selling_price = box as unknown as Product['selling_price'];
        next.box_selling_price = box as unknown as Product['box_selling_price'];
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!id || !product) return;

    const name = product.name.trim();
    if (!name) {
      Alert.alert('Nome obrigatório', 'O nome do produto é obrigatório.');
      return;
    }

    const minStock = Number.parseInt(String(product.minimum_stock ?? 0), 10);
    if (Number.isNaN(minStock) || minStock < 0) {
      Alert.alert('Valores inválidos', 'Stock mínimo deve ser um número ≥ 0.');
      return;
    }

    const blistersPerBox =
      product.blisters_per_box != null && Number(product.blisters_per_box) >= 1
        ? Number(product.blisters_per_box)
        : product.units_per_pack != null && Number(product.units_per_pack) >= 1
          ? Number(product.units_per_pack)
          : null;
    const pharmForm = String(product.form ?? '').trim();
    const liquidForm = isLiquidPharmaceuticalForm(pharmForm);
    if (product.can_sell_by_unit && !liquidForm && (blistersPerBox == null || blistersPerBox < 1)) {
      Alert.alert(
        'Configuração inválida',
        'Lâminas por caixa é obrigatório quando a venda por lâmina está activa.',
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const toNullableTrimmed = (v: unknown) => {
        const s = String(v ?? '').trim();
        return s === '' ? null : s;
      };
      const toPrice = (v: unknown) => {
        const s = String(v ?? '').trim();
        if (s === '') return null;
        const n = Number.parseFloat(s.replace(',', '.'));
        return Number.isNaN(n) ? null : String(n);
      };
      const unitsPerPack =
        product.units_per_pack == null || String(product.units_per_pack).trim() === ''
          ? null
          : Math.max(1, Number.parseInt(String(product.units_per_pack), 10) || 1);
      const unitsPerBlister =
        product.units_per_blister == null || String(product.units_per_blister).trim() === ''
          ? null
          : Math.max(1, Number.parseInt(String(product.units_per_blister), 10) || 1);
      const unitsPerBoxSynced =
        product.units_per_box == null || String(product.units_per_box).trim() === ''
          ? (unitsPerPack != null && unitsPerBlister != null ? unitsPerPack * unitsPerBlister : null)
          : Math.max(1, Number.parseInt(String(product.units_per_box), 10) || 1);
      const unitsForPayload = unitsPerPack;

      const sellingNum =
        Number.parseFloat(String(product.selling_price ?? '0').replace(',', '.')) || 0;
      let unitPriceStr = toPrice(product.unit_selling_price);
      const packU = unitsForPayload != null && unitsForPayload >= 1 ? unitsForPayload : blistersPerBox;
      if (
        product.can_sell_by_unit &&
        !liquidForm &&
        unitPriceStr == null &&
        packU != null &&
        packU >= 1 &&
        sellingNum > 0
      ) {
        unitPriceStr = (sellingNum / packU).toFixed(2);
      }

      const packNameRaw = toNullableTrimmed(product.pack_name);
      const resolvedPackName = liquidForm
        ? packNameRaw || 'Frasco'
        : product.can_sell_by_unit
          ? packNameRaw || 'Caixa'
          : defaultPackNameForForm(product.form, packNameRaw);
      const resolvedUnitName = liquidForm
        ? null
        : product.can_sell_by_unit
          ? toNullableTrimmed(product.unit_name) || 'Lâmina'
          : null;
      const blistersPerBoxOut =
        product.blisters_per_box != null && Number(product.blisters_per_box) >= 1
          ? Number(product.blisters_per_box)
          : blistersPerBox;
      const blisterMode =
        !liquidForm && Boolean(product.can_sell_by_unit) && (blistersPerBoxOut ?? 0) >= 1;
      const bppSave = blisterMode ? Math.floor(Number(blistersPerBoxOut)) : 0;
      const shelf = blisterMode
        ? blisterTotalFromParts(shelfBoxes, shelfLoose, bppSave)
        : Number.parseInt(String(product.shelf_stock_quantity ?? 0), 10);
      const warehouse = blisterMode
        ? blisterTotalFromParts(storageBoxes, storageLoose, bppSave)
        : Number.parseInt(String(product.warehouse_stock_quantity ?? 0), 10);
      if (
        Number.isNaN(shelf) ||
        shelf < 0 ||
        Number.isNaN(warehouse) ||
        warehouse < 0
      ) {
        Alert.alert(
          'Valores inválidos',
          'Stock na prateleira e no storage devem ser números ≥ 0.',
        );
        return;
      }
      const unitsForPayloadResolved = liquidForm
        ? unitsForPayload != null &&
            !Number.isNaN(Number(unitsForPayload)) &&
            Number(unitsForPayload) >= 1
          ? unitsForPayload
          : 1
        : unitsForPayload;

      const payload: Partial<Product> = {
        name: String(product.name ?? '').trim(),
        category: toNullableTrimmed(product.category),
        brand: toNullableTrimmed(product.brand),
        selling_price: String(sellingNum),
        cost_price: toPrice(product.cost_price),
        batch_number: toNullableTrimmed(product.batch_number),
        expiry_date: toNullableTrimmed(product.expiry_date),
        location: toNullableTrimmed(product.location),
        shelf_location: toNullableTrimmed(product.location),
        is_verified: Boolean(product.is_verified),
        can_sell_by_box: true,
        can_sell_by_unit: liquidForm ? false : Boolean(product.can_sell_by_unit),
        pack_name: resolvedPackName,
        unit_name: resolvedUnitName,
        units_per_pack: unitsForPayloadResolved,
        units_per_box: liquidForm ? 1 : unitsPerBoxSynced,
        blisters_per_box: liquidForm ? null : blistersPerBoxOut,
        box_selling_price: String(sellingNum),
        sale_price_box: String(sellingNum),
        unit_selling_price: liquidForm ? null : unitPriceStr,
        sale_price_blister: liquidForm ? '0' : unitPriceStr ?? undefined,
        units_per_blister: liquidForm ? null : unitsPerBlister ?? undefined,
        shelf_stock_quantity: shelf,
        warehouse_stock_quantity: warehouse,
        minimum_stock: minStock,
        ...(blisterMode
          ? blisterSplitPayloadForSave(shelfBoxes, shelfLoose, storageBoxes, storageLoose)
          : {}),
      };

      console.log('[produto-editar] PATCH /products payload', {
        productId: Number(id),
        payload,
      });
      const saved = await api.products.update(Number(id), payload);
      if (blisterMode && bppSave >= 1) {
        const seeded = seedBlisterUiFromProduct(saved, bppSave);
        setShelfBoxes(seeded.shelfBoxes);
        setShelfLoose(seeded.shelfLoose);
        setStorageBoxes(seeded.storageBoxes);
        setStorageLoose(seeded.storageLoose);
        setProduct({
          ...saved,
          shelf_stock_quantity: shelf,
          warehouse_stock_quantity: warehouse,
          stock_quantity: shelf + warehouse,
        });
      }

      router.replace({
        pathname: '/(tabs)/stock',
        params: { saved: 'updated' },
      });
    } catch (err) {
      console.error('[produto-editar] PATCH /products failed', {
        productId: Number(id),
        error: err instanceof Error ? err.message : String(err),
      });
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

            {aiCaptureHint ? (
              <View style={styles.aiBanner}>
                <Text style={styles.aiBannerTitle}>Sugestão AI (captura)</Text>
                <Text style={styles.aiBannerText}>{aiCaptureHint}</Text>
                <Text style={styles.aiBannerText}>
                  Preços, stock e SKU não foram alterados — confirma antes de gravar.
                </Text>
              </View>
            ) : null}

            {(product.image_url?.trim() || product.thumbnail_url?.trim()) ? (
              <View style={styles.aiImagePreview}>
                <Image
                  source={{
                    uri:
                      resolveApiMediaUrl(
                        product.image_url?.trim() || product.thumbnail_url,
                      ) ??
                      product.image_url ??
                      product.thumbnail_url ??
                      '',
                  }}
                  style={styles.aiImageThumb}
                  resizeMode="contain"
                />
              </View>
            ) : null}

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
              <Text style={styles.stockHint}>
                Dois saldos: prateleira (à frente) e armazém. Nas vendas retira-se primeiro da prateleira. O
                total na base de dados é a soma dos dois.
              </Text>

              {useBlisterStock ? (
                <>
                  <Text style={styles.stockHint}>
                    Modo blister activo: <Text style={{ fontWeight: '700' }}>{blistersPerBox} lâminas por caixa</Text>.
                    Para alterar, edita Lâminas por caixa em &quot;Venda por lâmina&quot; abaixo.
                  </Text>
                  <Text style={[styles.label, { marginTop: 4 }]}>Prateleira</Text>
                  <View style={styles.row}>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Caixas na prateleira</Text>
                      <TextInput
                        style={styles.input}
                        value={String(shelfBoxes)}
                        keyboardType="number-pad"
                        onChangeText={(t) => {
                          const n = Math.max(
                            0,
                            Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0,
                          );
                          setShelfBoxes(n);
                          update(
                            'shelf_stock_quantity',
                            blisterTotalFromParts(n, shelfLoose, blistersPerBox),
                          );
                        }}
                      />
                    </View>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Lâminas soltas na prateleira</Text>
                      <TextInput
                        style={styles.input}
                        value={String(shelfLoose)}
                        keyboardType="number-pad"
                        onChangeText={(t) => {
                          const n = Math.max(
                            0,
                            Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0,
                          );
                          setShelfLoose(n);
                          update(
                            'shelf_stock_quantity',
                            blisterTotalFromParts(shelfBoxes, n, blistersPerBox),
                          );
                        }}
                        onEndEditing={() => {
                          const norm = normalizeBlisterParts(
                            shelfBoxes,
                            shelfLoose,
                            blistersPerBox,
                          );
                          if (!norm) return;
                          setShelfBoxes(norm.boxes);
                          setShelfLoose(norm.loose);
                          update(
                            'shelf_stock_quantity',
                            blisterTotalFromParts(norm.boxes, norm.loose, blistersPerBox),
                          );
                        }}
                      />
                    </View>
                  </View>
                  <Text style={styles.stockHint}>
                    Total prateleira: {formatBoxesLamina(shelfTotal, blistersPerBox)} ({shelfTotal} lâminas)
                  </Text>

                  <Text style={[styles.label, { marginTop: 8 }]}>Storage</Text>
                  <View style={styles.row}>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Caixas no storage</Text>
                      <TextInput
                        style={styles.input}
                        value={String(storageBoxes)}
                        keyboardType="number-pad"
                        onChangeText={(t) => {
                          const n = Math.max(
                            0,
                            Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0,
                          );
                          setStorageBoxes(n);
                          update(
                            'warehouse_stock_quantity',
                            blisterTotalFromParts(n, storageLoose, blistersPerBox),
                          );
                        }}
                      />
                    </View>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Lâminas soltas no storage</Text>
                      <TextInput
                        style={styles.input}
                        value={String(storageLoose)}
                        keyboardType="number-pad"
                        onChangeText={(t) => {
                          const n = Math.max(
                            0,
                            Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0,
                          );
                          setStorageLoose(n);
                          update(
                            'warehouse_stock_quantity',
                            blisterTotalFromParts(storageBoxes, n, blistersPerBox),
                          );
                        }}
                        onEndEditing={() => {
                          const norm = normalizeBlisterParts(
                            storageBoxes,
                            storageLoose,
                            blistersPerBox,
                          );
                          if (!norm) return;
                          setStorageBoxes(norm.boxes);
                          setStorageLoose(norm.loose);
                          update(
                            'warehouse_stock_quantity',
                            blisterTotalFromParts(norm.boxes, norm.loose, blistersPerBox),
                          );
                        }}
                      />
                    </View>
                  </View>
                  <Text style={styles.stockHint}>
                    Total storage: {formatBoxesLamina(warehouseTotal, blistersPerBox)} ({warehouseTotal} lâminas)
                  </Text>
                </>
              ) : (
                <>
                  {product.can_sell_by_unit ? (
                    <View style={styles.field}>
                      <Text style={styles.label}>
                        Lâminas por caixa <Text style={{ color: '#dc2626' }}>*</Text>
                      </Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="number-pad"
                        value={
                          product.blisters_per_box != null && Number(product.blisters_per_box) >= 1
                            ? String(product.blisters_per_box)
                            : ''
                        }
                        placeholder="Ex.: 10"
                        placeholderTextColor="#6b7280"
                        onChangeText={setBlistersPerBox}
                      />
                      <Text style={styles.stockHint}>
                        Define quantas lâminas tem cada caixa para introduzir o stock como{' '}
                        <Text style={{ fontWeight: '700' }}>caixas + lâminas soltas</Text>. Os
                        campos de caixas e lâminas soltas aparecem assim que guardares com valor 1 ou
                        mais.
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.stockHint}>
                      Para introduzir stock como{' '}
                      <Text style={{ fontWeight: '700' }}>caixas + lâminas soltas</Text>, ativa{' '}
                      <Text style={{ fontStyle: 'italic' }}>Pode vender por lâmina</Text> em{' '}
                      <Text style={{ fontStyle: 'italic' }}>Venda por lâmina</Text> abaixo e
                      define <Text style={{ fontStyle: 'italic' }}>Lâminas por caixa</Text>.
                    </Text>
                  )}
                  <View style={styles.row}>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Stock prateleira</Text>
                      <TextInput
                        style={styles.input}
                        value={String(product.shelf_stock_quantity ?? 0)}
                        keyboardType="number-pad"
                        onChangeText={(t) =>
                          update(
                            'shelf_stock_quantity',
                            Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0,
                          )
                        }
                      />
                    </View>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Stock no storage</Text>
                      <TextInput
                        style={styles.input}
                        value={String(product.warehouse_stock_quantity ?? 0)}
                        keyboardType="number-pad"
                        onChangeText={(t) =>
                          update(
                            'warehouse_stock_quantity',
                            Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0,
                          )
                        }
                      />
                    </View>
                  </View>
                </>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>Stock mínimo (alertas)</Text>
                <TextInput
                  style={styles.input}
                  value={String(product.minimum_stock)}
                  keyboardType="number-pad"
                  onChangeText={(t) =>
                    update(
                      'minimum_stock',
                      Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0,
                    )
                  }
                />
              </View>
              <Text style={styles.stockHint}>
                {useBlisterStock
                  ? `Total geral: ${formatBoxesLamina(shelfTotal + warehouseTotal, blistersPerBox)} (${shelfTotal + warehouseTotal} lâminas) (API: ${product.stock_quantity})`
                  : `Total: ${(product.shelf_stock_quantity ?? 0) + (product.warehouse_stock_quantity ?? 0)} (API: ${product.stock_quantity})`}
              </Text>
            </View>

            {/* Venda por lâmina: nomes da caixa/lâmina são automáticos; só configuras o necessário. */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Venda por lâmina</Text>
              <Text style={styles.stockHint}>
                Os nomes da caixa e da lâmina são definidos automaticamente a partir da forma farmacêutica.
                A venda por caixa fica sempre activa no POS.
              </Text>
              <View style={styles.toggleRow}>
                <Text style={styles.label}>Permitir venda por lâmina</Text>
                <Switch
                  value={!!product.can_sell_by_unit}
                  onValueChange={(v) => update('can_sell_by_unit', v)}
                />
              </View>

              {product.can_sell_by_unit ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Lâminas por caixa</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="number-pad"
                      value={
                        product.blisters_per_box != null && Number(product.blisters_per_box) >= 1
                          ? String(product.blisters_per_box)
                          : product.units_per_pack != null && Number(product.units_per_pack) >= 1
                            ? String(product.units_per_pack)
                            : ''
                      }
                      onChangeText={setBlistersPerBox}
                      placeholder="ex.: 5"
                      placeholderTextColor="#6b7280"
                    />
                  </View>

                  <View style={styles.row}>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Preço da caixa (Kz)</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="decimal-pad"
                        value={
                          product.sale_price_box
                            ? String(product.sale_price_box)
                            : product.selling_price != null
                              ? String(product.selling_price)
                              : ''
                        }
                        onChangeText={(t) => {
                          const value = t as unknown as Product['sale_price_box'];
                          update('sale_price_box', value);
                          update('selling_price', (t === '' ? '0' : t) as unknown as Product['selling_price']);
                          update('box_selling_price', (t === '' ? null : t) as unknown as Product['box_selling_price']);
                        }}
                      />
                    </View>
                    <View style={[styles.field, { flex: 1 }]}>
                      <Text style={styles.label}>Preço da lâmina (Kz)</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="decimal-pad"
                        value={
                          product.sale_price_blister
                            ? String(product.sale_price_blister)
                            : product.unit_selling_price != null
                              ? String(product.unit_selling_price)
                              : ''
                        }
                        onChangeText={(t) => {
                          update(
                            'sale_price_blister',
                            (t === '' ? '0' : t) as unknown as Product['sale_price_blister'],
                          );
                          update(
                            'unit_selling_price',
                            (t === '' ? null : t) as unknown as Product['unit_selling_price'],
                          );
                          const unit = Number.parseFloat(String(t).replace(',', '.'));
                          if (Number.isFinite(unit) && unit >= 0 && blistersPerBox >= 1) {
                            const box = (unit * blistersPerBox).toFixed(2);
                            update('sale_price_box', box as unknown as Product['sale_price_box']);
                            update('selling_price', box as unknown as Product['selling_price']);
                            update('box_selling_price', box as unknown as Product['box_selling_price']);
                          }
                        }}
                      />
                    </View>
                  </View>
                </>
              ) : null}
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
                  <Text style={styles.label}>Validade (opcional, AAAA-MM-DD)</Text>
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
  inputReadonly: {
    color: '#9ca3af',
    backgroundColor: '#0b1220',
    borderColor: '#111827',
  },
  stockHint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
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
  aiBanner: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#2563EB',
    gap: 6,
  },
  aiBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#93c5fd',
  },
  aiBannerText: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 18,
  },
  aiImagePreview: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  aiImageThumb: {
    width: '100%',
    maxWidth: 320,
    height: 200,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#374151',
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


