import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Alert,
  Image,
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
import { resolveApiMediaUrl } from '@/services/aiCapture';
import { clearCaptureDraft, loadCaptureDraft } from '@/utils/captureDraft';
import { getErrorMessage } from '@/utils/errorMessage';
import { isLiquidPharmaceuticalForm } from '@/utils/liquidPharmaceuticalForm';
import { withSellingPriceFromBlisterForm } from '@/utils/blisterBoxPrice';
import {
  blisterSplitPayloadForSave,
  blisterTotalFromParts,
  normalizeBlisterParts,
} from '@/utils/blisterStockUi';
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

const defaultForm = {
  sku: '',
  barcode: '',
  name: '',
  category: '',
  brand: '',
  /** Pharmaceutical form (e.g. Xarope) — used for liquid pack rules. */
  form: '',
  selling_price: '0',
  cost_price: '',
  can_sell_by_unit: false,
  pack_name: '',
  unit_name: '',
  /** Source of truth for blister-stock model: number of blisters/lâminas per full box. */
  blisters_per_box: '' as string | number,
  /** Legacy: kept only for backward compatibility (mirrored from blisters_per_box on save). */
  units_per_pack: '' as string | number,
  units_per_box: '' as string | number,
  units_per_blister: '' as string | number,
  unit_selling_price: '',
  shelf_stock_quantity: 0,
  warehouse_stock_quantity: 0,
  minimum_stock: 0,
  batch_number: '',
  expiry_date: '',
  location: '',
  image_url: '',
  thumbnail_url: '',
  notes: '',
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
  const [fromAiCapture, setFromAiCapture] = useState(false);
  const [aiCaptureHint, setAiCaptureHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryDropdownVisible, setCategoryDropdownVisible] = useState(false);

  // Local UI state for the boxes + loose-blisters inputs (only when product is in blister-stock
  // mode). The form's shelf_stock_quantity / warehouse_stock_quantity remain the source of truth
  // (total blisters); these inputs recompute and write back on every change.
  const [shelfBoxes, setShelfBoxes] = useState<number>(0);
  const [shelfLoose, setShelfLoose] = useState<number>(0);
  const [storageBoxes, setStorageBoxes] = useState<number>(0);
  const [storageLoose, setStorageLoose] = useState<number>(0);

  // Blister-stock model: blisters_per_box is the source of truth. units_per_pack is legacy and
  // is only mirrored at payload time for backward compatibility — it never drives this UI.
  const blistersPerBoxNum = Number(form.blisters_per_box);
  const liquidFormUi = isLiquidPharmaceuticalForm(String(form.form ?? '').trim());
  const sellByUnit = !!form.can_sell_by_unit && !liquidFormUi;
  const blistersPerBox = sellByUnit && Number.isFinite(blistersPerBoxNum) && blistersPerBoxNum >= 1
    ? Math.floor(blistersPerBoxNum)
    : 0;
  const useBlisterStock = sellByUnit && blistersPerBox >= 1;
  const shelfTotal = Math.max(0, Math.floor(Number(form.shelf_stock_quantity) || 0));
  const warehouseTotal = Math.max(0, Math.floor(Number(form.warehouse_stock_quantity) || 0));

  // Re-seed boxes/loose state when the blister mode flips on or when totals change externally
  // (e.g. user toggled can_sell_by_unit). Avoid disrupting in-flight keystrokes by only re-seeding
  // when local state does not already match the total.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const draft = await loadCaptureDraft();
        if (!active || !draft) return;
        await clearCaptureDraft();
        setForm((prev) => ({
          ...prev,
          ...draft.form,
          selling_price: prev.selling_price,
          cost_price: prev.cost_price,
          shelf_stock_quantity: prev.shelf_stock_quantity,
          warehouse_stock_quantity: prev.warehouse_stock_quantity,
          minimum_stock: prev.minimum_stock,
          batch_number: prev.batch_number,
          expiry_date: prev.expiry_date,
          location: prev.location,
        }));
        setFromAiCapture(true);
        const conf =
          draft.overallConfidence != null
            ? ` Confiança: ${Math.round(draft.overallConfidence * 100)}%.`
            : '';
        setAiCaptureHint(
          (draft.needsReview
            ? 'Reveja nome, categoria, ficha técnica, lâminas e preços antes de gravar.'
            : 'Ficha técnica e campos sugeridos a partir da embalagem (confirme tudo).') + conf,
        );
        if (__DEV__) {
          console.log('[produto-criar] AI capture draft applied', draft.form);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

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

  const setUnitsPerBoxSynced = (t: string) => {
    const v =
      t === '' ? ('' as const) : Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || ('' as const);
    setForm((prev) => ({ ...prev, units_per_box: v }));
    setError(null);
  };

  const setBlistersPerBox = (t: string) => {
    const v =
      t === '' ? ('' as const) : Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || ('' as const);
    setForm((prev) => withSellingPriceFromBlisterForm({ ...prev, blisters_per_box: v }));
    setError(null);
  };

  const setUnitsPerBlister = (t: string) => {
    const v =
      t === '' ? ('' as const) : Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || ('' as const);
    setForm((prev) => ({ ...prev, units_per_blister: v }));
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

    // blisters_per_box is the source of truth. units_per_pack is legacy fallback only.
    const blistersPerBoxForRule =
      Number(form.blisters_per_box) >= 1
        ? Number(form.blisters_per_box)
        : Number(form.units_per_pack) >= 1
          ? Number(form.units_per_pack)
          : 0;
    const liquidForm = isLiquidPharmaceuticalForm(String(form.form ?? '').trim());
    if (form.can_sell_by_unit && !liquidForm && blistersPerBoxForRule < 1) {
      setError('Indica quantas lâminas vêm em cada caixa (>= 1).');
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

    // Prefer the dedicated blisters_per_box field; fall back to legacy units_per_pack only when
    // the new field is empty so existing forms/imports continue to work.
    const blistersPerBox =
      form.blisters_per_box !== '' && form.blisters_per_box != null
        ? Number(form.blisters_per_box)
        : form.units_per_pack !== '' && form.units_per_pack != null
          ? Number(form.units_per_pack)
          : null;
    const unitsPerBoxRaw =
      form.units_per_box === '' || form.units_per_box == null ? null : Number(form.units_per_box);
    const unitsPerBlister =
      form.units_per_blister === '' || form.units_per_blister == null ? null : Number(form.units_per_blister);
    const unitsPerBoxComputed =
      unitsPerBoxRaw != null && unitsPerBoxRaw >= 1
        ? unitsPerBoxRaw
        : blistersPerBox != null && blistersPerBox >= 1 && unitsPerBlister != null && unitsPerBlister >= 1
          ? blistersPerBox * unitsPerBlister
          : null;
    let unitPrice =
      form.unit_selling_price === ''
        ? null
        : Number.parseFloat(String(form.unit_selling_price).replace(',', '.'));
    if (
      form.can_sell_by_unit &&
      !liquidForm &&
      (unitPrice == null || Number.isNaN(unitPrice)) &&
      blistersPerBoxForRule >= 1
    ) {
      unitPrice = sellingPrice / blistersPerBoxForRule;
    }

    const formTrim = String(form.form ?? '').trim();
    const packNameOut = liquidForm
      ? form.pack_name?.trim() || 'Frasco'
      : form.can_sell_by_unit
        ? 'Caixa'
        : form.pack_name?.trim() || '';
    const blistersOut =
      liquidForm && (blistersPerBox == null || blistersPerBox < 1)
        ? 1
        : blistersPerBox != null && blistersPerBox >= 1
          ? blistersPerBox
          : null;
    // Stock/POS por lâmina: não gravamos comprimidos por lâmina.
    const unitsPerBlisterOut = null;
    const unitsPerBoxOut =
      liquidForm
        ? 1
        : unitsPerBoxComputed != null && unitsPerBoxComputed >= 1
          ? unitsPerBoxComputed
          : null;

    const expiryTrimmed = form.expiry_date?.trim() || '';
    const batchTrimmed = form.batch_number?.trim() || '';
    const locationTrimmed = form.location?.trim() || '';

    // Venda por caixa: sempre activa; preço da caixa = selling_price (sem campo duplicado no formulário).
    const payload: Record<string, unknown> = {
      sku,
      name,
      category,
      selling_price: String(sellingPrice),
      minimum_stock: Number(form.minimum_stock) || 0,
      stock_quantity: useBlisterStock
        ? blisterTotalFromParts(shelfBoxes, shelfLoose, blistersPerBox) +
          blisterTotalFromParts(storageBoxes, storageLoose, blistersPerBox)
        : 0,
      shelf_stock_quantity: useBlisterStock
        ? blisterTotalFromParts(shelfBoxes, shelfLoose, blistersPerBox)
        : Number(form.shelf_stock_quantity) || 0,
      warehouse_stock_quantity: useBlisterStock
        ? blisterTotalFromParts(storageBoxes, storageLoose, blistersPerBox)
        : Number(form.warehouse_stock_quantity) || 0,
      can_sell_by_box: true,
      can_sell_by_unit: liquidForm ? false : !!form.can_sell_by_unit,
      box_selling_price: String(sellingPrice),
      sale_price_box: String(sellingPrice),
      barcode: barcode || '',
      brand: form.brand?.trim() || '',
      cost_price:
        form.cost_price === ''
          ? '0'
          : String(Number.parseFloat(String(form.cost_price).replace(',', '.')) || 0),
      pack_name: packNameOut,
      unit_name: liquidForm ? null : form.unit_name?.trim() || '',
      ...(batchTrimmed ? { batch_number: batchTrimmed } : {}),
      ...(expiryTrimmed ? { expiry_date: expiryTrimmed } : {}),
      ...(locationTrimmed
        ? { location: locationTrimmed, shelf_location: locationTrimmed }
        : {}),
    };
    if (formTrim) payload.form = formTrim;
    const imageUrl = String(form.image_url ?? '').trim();
    const thumbUrl = String(form.thumbnail_url ?? '').trim();
    if (imageUrl) payload.image_url = imageUrl;
    if (thumbUrl) payload.thumbnail_url = thumbUrl;
    if (fromAiCapture) payload.source_type = 'ai_capture';
    const notesTrimmed = form.notes?.trim() || '';
    if (notesTrimmed) payload.notes = notesTrimmed;
    if (liquidForm) {
      payload.units_per_blister = null;
      payload.unit_selling_price = null;
      payload.sale_price_blister = '0';
    }
    if (unitsPerBoxOut != null && unitsPerBoxOut >= 1) {
      payload.units_per_box = unitsPerBoxOut;
    }
    if (blistersOut != null && blistersOut >= 1 && (liquidForm || form.can_sell_by_unit)) {
      payload.units_per_pack = blistersOut;
    }
    // Engage the new blister-stock model: when can_sell_by_unit is on and lâminas-por-caixa > 1,
    // backend treats stock_quantity as total blisters and POS subtracts blisters_per_box per box sale.
    if (
      !liquidForm &&
      form.can_sell_by_unit &&
      blistersOut != null &&
      blistersOut >= 1
    ) {
      payload.blisters_per_box = blistersOut;
    }
    if (form.can_sell_by_unit && !liquidForm) {
      payload.units_per_blister = null;
    }
    if (unitPrice != null && !Number.isNaN(unitPrice) && !liquidForm) {
      payload.unit_selling_price = String(unitPrice);
      payload.sale_price_blister = String(unitPrice);
    }
    if (useBlisterStock) {
      Object.assign(
        payload,
        blisterSplitPayloadForSave(shelfBoxes, shelfLoose, storageBoxes, storageLoose),
      );
    }
    const fallbackPayload: Record<string, unknown> = {
      ...payload,
      sku,
      name,
      category,
    };
    if (formTrim) fallbackPayload.form = formTrim;
    if (imageUrl) fallbackPayload.image_url = imageUrl;
    if (thumbUrl) fallbackPayload.thumbnail_url = thumbUrl;
    if (fromAiCapture) fallbackPayload.source_type = 'ai_capture';
    if (notesTrimmed) fallbackPayload.notes = notesTrimmed;
    if (liquidForm) {
      fallbackPayload.units_per_blister = null;
      fallbackPayload.unit_selling_price = null;
      fallbackPayload.sale_price_blister = '0';
    }
    if (unitsPerBoxOut != null && unitsPerBoxOut >= 1) {
      fallbackPayload.units_per_box = unitsPerBoxOut;
    }
    if (blistersOut != null && blistersOut >= 1 && (liquidForm || form.can_sell_by_unit)) {
      fallbackPayload.units_per_pack = blistersOut;
    }
    if (
      !liquidForm &&
      form.can_sell_by_unit &&
      blistersOut != null &&
      blistersOut >= 1
    ) {
      fallbackPayload.blisters_per_box = blistersOut;
    }
    if (form.can_sell_by_unit && !liquidForm) {
      fallbackPayload.units_per_blister = null;
    }
    if (unitPrice != null && !Number.isNaN(unitPrice) && !liquidForm) {
      fallbackPayload.unit_selling_price = String(unitPrice);
      fallbackPayload.sale_price_blister = String(unitPrice);
    }
    const minimalPayload: Record<string, unknown> = {
      sku,
      name,
      category,
      selling_price: String(sellingPrice),
      stock_quantity: 0,
    };
    const ultraMinimalPayload: Record<string, unknown> = {
      sku,
      name,
      category,
      selling_price: String(sellingPrice),
    };

    setSaving(true);
    setError(null);
    try {
      let created: Product | null = null;
      const attempts: Record<string, unknown>[] = [payload, fallbackPayload, minimalPayload, ultraMinimalPayload];
      let lastCreateErr: unknown = null;
      for (let i = 0; i < attempts.length; i += 1) {
        const attemptPayload = attempts[i];
        try {
          created = await api.products.create(
            attemptPayload as Omit<Product, 'id' | 'created_at' | 'updated_at'>,
          );
          break;
        } catch (attemptErr) {
          lastCreateErr = attemptErr;
          const attemptMsg = getErrorMessage(attemptErr);
          const isServerFailure =
            attemptMsg.includes('500') ||
            attemptMsg.toLowerCase().includes('server error') ||
            attemptMsg.toLowerCase().includes('internal server error');
          const isLastAttempt = i === attempts.length - 1;
          if (!isServerFailure || isLastAttempt) {
            throw attemptErr;
          }
          console.warn('[produto-criar] create attempt failed; retrying with stricter payload', {
            attempt: i + 1,
            attemptMsg,
            attemptPayload,
          });
        }
      }
      if (!created) {
        // Common backend behavior: duplicate SKU can surface as 500.
        // Ask API for a unique SKU and retry once with minimal payload.
        try {
          const suggested = await api.products.suggestSku({
            category: category || undefined,
            name: name || undefined,
          });
          const nextSku = String(suggested?.sku ?? '').trim();
          if (nextSku && nextSku !== sku) {
            const retryPayload = {
              ...ultraMinimalPayload,
              sku: nextSku,
            } as Omit<Product, 'id' | 'created_at' | 'updated_at'>;
            created = await api.products.create(retryPayload);
            // Keep form consistent with created SKU for immediate user feedback.
            update('sku', nextSku);
          }
        } catch (suggestErr) {
          console.warn('[produto-criar] suggest-sku retry failed after create failure', suggestErr);
        }
      }
      if (!created) {
        throw lastCreateErr ?? new Error('Falha ao criar produto.');
      }

      router.replace({
        pathname: '/(tabs)/stock',
        params: { saved: 'created' },
      });
    } catch (e) {
      console.error('[produto-criar] create failed', e, {
        payload,
        fallbackPayload,
        minimalPayload,
        ultraMinimalPayload,
      });
      // Backend may return 500 for DB unique violations. Re-check duplicates and show a precise message.
      try {
        const dupAfterFailure = await checkDuplicates();
        if (dupAfterFailure) {
          if (dupAfterFailure.reason === 'sku') {
            setError(`SKU já existe: "${dupAfterFailure.product.sku}". Usa "Sugerir SKU" ou outro SKU.`);
            return;
          }
          if (dupAfterFailure.reason === 'barcode') {
            setError('Código de barras já existe noutro produto.');
            return;
          }
          setError(`Produto semelhante já existe: "${dupAfterFailure.product.name}".`);
          return;
        }
      } catch (dupErr) {
        console.warn('[produto-criar] duplicate re-check after create failure also failed', dupErr);
      }
      let message = getErrorMessage(e);
      if (message === 'Something went wrong.' || message === 'Something went wrong. Please try again.') {
        if (e instanceof Error && e.message?.trim()) {
          message = e.message.trim();
        } else {
          message = 'Falha ao criar produto (500). O backend recusou os dados enviados.';
        }
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const stockUnitLabel = liquidFormUi ? 'frascos' : sellByUnit ? 'caixas' : 'unidades';
  const stockUnitLabelCap = liquidFormUi ? 'Frascos' : sellByUnit ? 'Caixas' : 'Unidades';

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

          {fromAiCapture && aiCaptureHint ? (
            <View style={styles.aiBanner}>
              <Text style={styles.aiBannerTitle}>Sugestão AI (captura)</Text>
              <Text style={styles.aiBannerText}>{aiCaptureHint}</Text>
              <Text style={styles.aiBannerText}>
                Preços, stock e venda por lâmina: confirma antes de gravar.
              </Text>
            </View>
          ) : null}

          {(form.image_url?.trim() || form.thumbnail_url?.trim()) ? (
            <View style={styles.aiImagePreview}>
              <Image
                source={{
                  uri:
                    resolveApiMediaUrl(form.image_url?.trim() || form.thumbnail_url) ??
                    form.image_url ??
                    form.thumbnail_url,
                }}
                style={styles.aiImageThumb}
                resizeMode="contain"
              />
            </View>
          ) : null}

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
            <View style={styles.field}>
              <Text style={styles.label}>Forma farmacêutica (opcional)</Text>
              <TextInput
                style={styles.input}
                value={form.form}
                onChangeText={(t) => update('form', t)}
                placeholder="ex.: Xarope, Comprimido"
                placeholderTextColor="#6b7280"
                autoCapitalize="sentences"
              />
              <Text style={styles.hint}>
                Se indicar xarope, suspensão, solução oral, gotas ou frasco, o produto é tratado como líquido (sem
                venda por unidade/blister).
              </Text>
            </View>
          </View>

          {fromAiCapture || form.notes?.trim() ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ficha técnica (sugerida)</Text>
              <Text style={styles.hint}>
                Resumo gerado a partir do texto da embalagem. Podes editar ou apagar antes de gravar.
              </Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={form.notes}
                onChangeText={(t) => update('notes', t)}
                placeholder="Indicações, conservação, via de administração…"
                placeholderTextColor="#6b7280"
                multiline
                textAlignVertical="top"
              />
            </View>
          ) : null}

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

          {/* Venda por lâmina — activar antes do stock */}
          {!liquidFormUi ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Venda por lâmina (opcional)</Text>
              <Text style={styles.hint}>
                O preço da caixa é o <Text style={{ fontWeight: '700' }}>Preço de venda (Kz)</Text> acima. Stock e
                vendas avulsas contam em <Text style={{ fontWeight: '700' }}>lâminas</Text> (não comprimidos dentro da
                lâmina).
              </Text>
              <View style={styles.toggleRow}>
                <Text style={styles.label}>Pode vender por lâmina / unidade</Text>
                <Switch
                  value={form.can_sell_by_unit}
                  onValueChange={(v) => {
                    update('can_sell_by_unit', v);
                    if (!v) {
                      setShelfLoose(0);
                      setStorageLoose(0);
                    }
                  }}
                />
              </View>

              {sellByUnit ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Nome da unidade (POS)</Text>
                    <TextInput
                      style={styles.input}
                      value={form.unit_name}
                      onChangeText={(t) => update('unit_name', t)}
                      placeholder="Lâmina, Ampola, Sachê…"
                      placeholderTextColor="#6b7280"
                    />
                    <Text style={styles.hint}>
                      Como aparece no POS ao vender uma unidade. A embalagem no sistema fica sempre &quot;Caixa&quot;.
                    </Text>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Preço da lâmina (Kz)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="decimal-pad"
                      value={form.unit_selling_price}
                      onChangeText={(t) =>
                        setForm((prev) =>
                          withSellingPriceFromBlisterForm({ ...prev, unit_selling_price: t }),
                        )
                      }
                      placeholder="Vazio = preço da caixa ÷ lâminas por caixa"
                      placeholderTextColor="#6b7280"
                    />
                  </View>
                </>
              ) : null}
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Embalagem</Text>
              <Text style={styles.hint}>
                Produto líquido: vende-se por caixa/frasco. Stock em número de frascos abaixo.
              </Text>
            </View>
          )}

          {/* Stock inicial */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Stock</Text>
            <Text style={styles.hint}>
              Mostruário = prateleira (à frente). Armazém = reserva. Podes misturar caixas fechadas e lâminas
              soltas; se as soltas chegarem a uma caixa completa, convertem-se automaticamente ao sair do campo.
            </Text>

            {sellByUnit ? (
              <View style={styles.field}>
                <Text style={styles.label}>
                  Lâminas por caixa <Text style={{ color: '#dc2626' }}>*</Text>
                </Text>
                <Text style={styles.hint}>
                  Obrigatório para venda por lâmina. Todo o stock (caixas e soltas) é convertido em número de lâminas.
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={
                    form.blisters_per_box != null && form.blisters_per_box !== ''
                      ? String(form.blisters_per_box)
                      : ''
                  }
                  placeholder="Ex.: 10"
                  placeholderTextColor="#6b7280"
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9]/g, '');
                    if (cleaned === '') {
                      update('blisters_per_box', '');
                      return;
                    }
                    const n = Math.max(1, Number.parseInt(cleaned, 10) || 1);
                    setForm((prev) =>
                      withSellingPriceFromBlisterForm({
                        ...prev,
                        blisters_per_box: n,
                        shelf_stock_quantity: blisterTotalFromParts(shelfBoxes, shelfLoose, n),
                        warehouse_stock_quantity: blisterTotalFromParts(
                          storageBoxes,
                          storageLoose,
                          n,
                        ),
                      }),
                    );
                  }}
                />
              </View>
            ) : null}

            <Text style={[styles.label, { marginTop: sellByUnit ? 4 : 0 }]}>Mostruário (prateleira)</Text>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>
                  {useBlisterStock ? 'Caixas' : stockUnitLabelCap}
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  editable={!sellByUnit || blistersPerBox >= 1}
                  value={
                    useBlisterStock
                      ? String(shelfBoxes)
                      : String(form.shelf_stock_quantity ?? 0)
                  }
                  onChangeText={(t) => {
                    const n = Math.max(0, Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0);
                    if (useBlisterStock) {
                      setShelfBoxes(n);
                      update(
                        'shelf_stock_quantity',
                        blisterTotalFromParts(n, shelfLoose, blistersPerBox),
                      );
                    } else {
                      update('shelf_stock_quantity', n);
                    }
                  }}
                  placeholder="0"
                  placeholderTextColor="#6b7280"
                />
              </View>
              {useBlisterStock ? (
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Lâminas soltas</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={String(shelfLoose)}
                    onChangeText={(t) => {
                      const n = Math.max(0, Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0);
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
                    placeholder="0"
                    placeholderTextColor="#6b7280"
                  />
                </View>
              ) : null}
            </View>
            {useBlisterStock ? (
              <Text style={styles.hint}>
                Prateleira: {formatBoxesLamina(shelfTotal, blistersPerBox)} ({shelfTotal} lâminas)
              </Text>
            ) : null}

            <Text style={[styles.label, { marginTop: 8 }]}>Armazém</Text>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>
                  {useBlisterStock ? 'Caixas' : stockUnitLabelCap}
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  editable={!sellByUnit || blistersPerBox >= 1}
                  value={
                    useBlisterStock
                      ? String(storageBoxes)
                      : String(form.warehouse_stock_quantity ?? 0)
                  }
                  onChangeText={(t) => {
                    const n = Math.max(0, Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0);
                    if (useBlisterStock) {
                      setStorageBoxes(n);
                      update(
                        'warehouse_stock_quantity',
                        blisterTotalFromParts(n, storageLoose, blistersPerBox),
                      );
                    } else {
                      update('warehouse_stock_quantity', n);
                    }
                  }}
                  placeholder="0"
                  placeholderTextColor="#6b7280"
                />
              </View>
              {useBlisterStock ? (
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.label}>Lâminas soltas</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={String(storageLoose)}
                    onChangeText={(t) => {
                      const n = Math.max(0, Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0);
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
                    placeholder="0"
                    placeholderTextColor="#6b7280"
                  />
                </View>
              ) : null}
            </View>
            {useBlisterStock ? (
              <Text style={styles.hint}>
                Armazém: {formatBoxesLamina(warehouseTotal, blistersPerBox)} ({warehouseTotal} lâminas)
              </Text>
            ) : null}

            {sellByUnit && blistersPerBox < 1 ? (
              <Text style={styles.hint}>Indica primeiro quantas lâminas vêm em cada caixa.</Text>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>
                Stock mínimo (alertas){useBlisterStock ? ' — em lâminas' : ''}
              </Text>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={String(form.minimum_stock)}
                onChangeText={(t) =>
                  update('minimum_stock', Number.parseInt(t.replace(/[^0-9]/g, ''), 10) || 0)
                }
              />
            </View>

            <Text style={styles.hint}>
              {useBlisterStock
                ? `Total: ${formatBoxesLamina(shelfTotal + warehouseTotal, blistersPerBox)} (${shelfTotal + warehouseTotal} lâminas) — ${shelfBoxes + storageBoxes} ${stockUnitLabel} físicas`
                : `Total: ${shelfTotal + warehouseTotal} ${stockUnitLabel} (${shelfTotal} mostruário + ${warehouseTotal} armazém)`}
            </Text>
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
                <Text style={styles.label}>Validade (opcional, AAAA-MM-DD)</Text>
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
    height: 320,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  notesInput: {
    minHeight: 100,
    height: undefined,
    paddingVertical: 10,
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
