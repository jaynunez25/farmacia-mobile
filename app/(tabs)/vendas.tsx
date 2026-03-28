import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { api } from '@/services/api';
import type { Product } from '@/types';
import { getErrorMessage } from '@/utils/errorMessage';

type CartItem = {
  product: Product;
  quantity: number;
  sell_as?: 'box' | 'unit';
};

/** Second line under product name: sell-mode hint only (price/qty live in their columns). Skips unit/pack labels that duplicate the product title. */
function cartLineSellHint(displayName: string, sell_as: CartItem['sell_as'], product: Product): string {
  const dn = displayName.trim().toLowerCase();
  if (sell_as === 'box') {
    const p = (product.pack_name || '').trim();
    if (p && p.toLowerCase() !== dn) return p;
    return 'Por caixa';
  }
  if (sell_as === 'unit') {
    const u = (product.unit_name || '').trim();
    if (u && u.toLowerCase() !== dn) return u;
    return 'Por unidade';
  }
  return '';
}

/** react-native-web: flex + minWidth:0 on <Text> table headers collapses width and stacks letters vertically; use Views as cells. */
function CartTableHeaderRow({ webCart }: { webCart: boolean }) {
  if (webCart) {
    return (
      <View style={[styles.summaryTableHeader, styles.summaryTableHeaderWebCart]}>
        <View style={styles.cartThQty}>
          <Text style={styles.th} numberOfLines={1}>
            Qtd
          </Text>
        </View>
        <View style={styles.cartThProd}>
          <Text style={styles.th} numberOfLines={1}>
            Produto
          </Text>
        </View>
        <View style={styles.cartThUnit}>
          <Text style={[styles.th, styles.cartThUnitText]} numberOfLines={1}>
            P.unit
          </Text>
        </View>
        <View style={styles.cartThTotal}>
          <Text style={[styles.th, styles.cartThTotalText]} numberOfLines={1}>
            Total
          </Text>
        </View>
        <View style={styles.cartThRemove}>
          <Text style={styles.th} numberOfLines={1}>
            {' '}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.summaryTableHeader}>
      <Text style={[styles.th, styles.thQty]}>Qtd</Text>
      <Text style={[styles.th, styles.thName]}>Produto</Text>
      <Text style={[styles.th, styles.thUnit]}>P.unit</Text>
      <Text style={[styles.th, styles.thSubtotal]}>Total</Text>
      <Text style={[styles.th, styles.thRemove]}> </Text>
    </View>
  );
}

function PosPaymentMethodButtons({
  paymentMethod,
  setPaymentMethod,
}: {
  paymentMethod: 'cash' | 'card' | 'transfer' | 'other';
  setPaymentMethod: (m: 'cash' | 'card' | 'transfer' | 'other') => void;
}) {
  return (
    <View style={styles.paymentMethodTwoRow}>
      {(['cash', 'card'] as const).map(method => (
        <Pressable
          key={method}
          style={({ pressed }) => [
            styles.paymentMethodButton,
            paymentMethod === method && styles.paymentMethodButtonActive,
            pressed && styles.chipPressed,
          ]}
          onPress={() => setPaymentMethod(method)}>
          <Text
            style={[
              styles.paymentMethodButtonText,
              paymentMethod === method && styles.paymentMethodButtonTextActive,
            ]}
            numberOfLines={1}>
            {method === 'cash' ? 'Dinheiro' : 'Cartão'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Lista do carrinho no painel Pagamento: viewport fixo para 6 linhas; scroll só com 7+ itens. */
const PAYMENT_CART_ROW_HEIGHT = 50;
const PAYMENT_CART_MAX_VISIBLE_ROWS = 6;
const PAYMENT_CART_VIEWPORT_V_PADDING = 8;
const PAYMENT_CART_LIST_VIEWPORT_HEIGHT =
  PAYMENT_CART_MAX_VISIBLE_ROWS * PAYMENT_CART_ROW_HEIGHT + PAYMENT_CART_VIEWPORT_V_PADDING;

function PaymentCartLines({
  cart,
  cartListNeedsScroll,
  listVariant: _listVariant,
  fillAvailableHeight: _fillAvailableHeight,
  lineUnitPrice,
  updateCartQty,
  removeFromCart,
  hasInsufficientStock,
  showStockWarning,
  setShowStockWarning,
}: {
  cart: CartItem[];
  cartListNeedsScroll: boolean;
  listVariant: 'wide' | 'stack';
  /** Reservado (layout do carrinho é sempre viewport fixo de 6 linhas). */
  fillAvailableHeight: boolean;
  lineUnitPrice: (item: CartItem) => number;
  updateCartQty: (productId: number, sellAs: 'box' | 'unit' | undefined, delta: number) => void;
  removeFromCart: (productId: number, sellAs: 'box' | 'unit' | undefined) => void;
  hasInsufficientStock: boolean;
  showStockWarning: boolean;
  setShowStockWarning: (v: boolean) => void;
}) {
  const listContent = (
    <>
      {cart.length === 0 ? (
        <Text style={styles.emptyText}>Carrinho vazio. Selecciona produtos para iniciar a venda.</Text>
      ) : (
        <>
          {hasInsufficientStock && showStockWarning && (
            <View style={styles.warningRow}>
              <Text style={styles.warningText}>
                Alguns itens ultrapassam o stock disponível. Ajusta as quantidades.
              </Text>
              <Pressable style={styles.inlineCloseButton} onPress={() => setShowStockWarning(false)}>
                <Text style={styles.inlineCloseButtonText}>X</Text>
              </Pressable>
            </View>
          )}
          {cart.map((item, idx) => {
            const { product, quantity, sell_as } = item;
            const unitP = lineUnitPrice(item);
            const lineTotal = unitP * quantity;
            const displayName = (product.name && String(product.name).trim()) || product.sku || 'Produto';
            const sellHint = cartLineSellHint(displayName, sell_as, product);
            const key = `${product.id}-${sell_as ?? 's'}-${idx}`;

            return (
              <View
                key={key}
                style={[
                  styles.summaryRow,
                  Platform.OS === 'web' && styles.summaryRowWebCart,
                  styles.paymentCartRowFixed,
                ]}>
                <View style={[styles.colQty, Platform.OS === 'web' && styles.colQtyWebCart]}>
                  <View style={styles.qtyControls}>
                    <Pressable style={styles.qtyButton} onPress={() => updateCartQty(product.id, sell_as, -1)}>
                      <Text style={styles.qtyButtonText}>-</Text>
                    </Pressable>
                    <Text style={styles.qtyText}>{quantity}</Text>
                    <Pressable style={styles.qtyButton} onPress={() => updateCartQty(product.id, sell_as, 1)}>
                      <Text style={styles.qtyButtonText}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.colName, Platform.OS === 'web' && styles.colNameWebCart]}>
                  <Text style={styles.summaryItemName} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {sellHint ? (
                    <Text style={styles.summaryItemMeta} numberOfLines={1}>
                      {sellHint}
                    </Text>
                  ) : null}
                </View>

                <View style={[styles.colUnit, Platform.OS === 'web' && styles.colUnitWebCart]}>
                  <Text style={styles.summaryPriceText} numberOfLines={1} ellipsizeMode="tail">
                    Kz {unitP.toFixed(2)}
                  </Text>
                </View>

                <View style={[styles.colSubtotal, Platform.OS === 'web' && styles.colSubtotalWebCart]}>
                  <Text style={styles.summarySubtotalText} numberOfLines={1} ellipsizeMode="tail">
                    Kz {lineTotal.toFixed(2)}
                  </Text>
                </View>

                <Pressable style={styles.removeButton} onPress={() => removeFromCart(product.id, sell_as)}>
                  <Text style={styles.removeButtonText}>X</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      )}
    </>
  );

  return (
    <View style={styles.paymentCartBlock}>
      <View style={styles.paymentCartHeaderBlock}>
        <Text style={styles.paymentCartTitle}>Itens da venda</Text>
        <Text style={styles.paymentCartHint}>
          {cart.length === 0
            ? 'Nenhum item — adiciona produtos acima'
            : cart.length === 1
              ? '1 item'
              : `${cart.length} itens`}
        </Text>
      </View>
      <View style={styles.paymentCartTableOuter}>
        <View style={styles.paymentCartTableHeaderWrap}>
          <CartTableHeaderRow webCart={Platform.OS === 'web'} />
        </View>
        <ScrollView
          style={[
            styles.paymentCartRowsScroll,
            {
              height: PAYMENT_CART_LIST_VIEWPORT_HEIGHT,
              minHeight: PAYMENT_CART_LIST_VIEWPORT_HEIGHT,
              maxHeight: PAYMENT_CART_LIST_VIEWPORT_HEIGHT,
            },
          ]}
          contentContainerStyle={[
            styles.paymentCartRowsScrollContent,
            Platform.OS === 'web' && styles.summaryListContentWeb,
          ]}
          showsVerticalScrollIndicator={cartListNeedsScroll}
          scrollEnabled={cartListNeedsScroll}
          nestedScrollEnabled>
          {listContent}
        </ScrollView>
      </View>
    </View>
  );
}

export default function VendasScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const isTablet = width >= 768;
  const isLandscape = width > height;
  const isTabletLandscape = isTablet && isLandscape;
  const isPhone = !isTablet;

  const productGridColumns = (() => {
    if (isTabletLandscape) return width >= 1200 ? 6 : 5;
    if (isTablet) return 4;
    return 2;
  })();

  const [hasOpenSession, setHasOpenSession] = useState<boolean | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [sellAsChoice, setSellAsChoice] = useState<'box' | 'unit'>('unit');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedQty, setSelectedQty] = useState('1');

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'other'>('cash');
  const [paymentMode, setPaymentMode] = useState<'simple' | 'split'>('simple');
  const [splitPayments, setSplitPayments] = useState<
    { method: 'cash' | 'card' | 'transfer' | 'other'; amount: number }[]
  >([
    { method: 'cash', amount: 0 },
    { method: 'card', amount: 0 },
  ]);

  // UI-only: para permitir ao caixa colocar o valor recebido e visualizar troco.
  // Não altera o payload de `confirmSale`.
  const [cashReceived, setCashReceived] = useState<string>('');
  const [mobilePagerWidth, setMobilePagerWidth] = useState(0);
  const [showScanNotice, setShowScanNotice] = useState(false);
  const [showStockWarning, setShowStockWarning] = useState(true);
  const [sellModeModalVisible, setSellModeModalVisible] = useState(false);
  const [sellModeProduct, setSellModeProduct] = useState<Product | null>(null);
  const [unitSellQty, setUnitSellQty] = useState('1');

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaleMessage, setLastSaleMessage] = useState<string | null>(null);

  // Category POS UI (presentation only): products are fetched using the existing API filter contract.
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [categoryProductsLoading, setCategoryProductsLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  /** Caixa vê até 6 linhas sem scroll; scroll vertical só com 7+ itens. */
  const CART_VISIBLE_WITHOUT_SCROLL = 6;
  const cartListNeedsScroll = cart.length > CART_VISIBLE_WITHOUT_SCROLL;

  const isPackProduct = (p: Product) =>
    (p.can_sell_by_box || p.can_sell_by_unit) && (p.units_per_pack ?? 0) > 0;

  const getBoxPrice = (p: Product) =>
    Number(p.box_selling_price ?? p.selling_price ?? 0);

  const getUnitPrice = (p: Product) => {
    if (p.unit_selling_price != null) return Number(p.unit_selling_price);
    const upp = p.units_per_pack ?? 0;
    const box = getBoxPrice(p);
    if (upp > 0) return box / upp;
    return Number(p.selling_price ?? 0);
  };

  const baseUnitsRequired = (item: CartItem) =>
    item.sell_as === 'box' ? item.quantity * (item.product.units_per_pack ?? 1) : item.quantity;

  const lineUnitPrice = useCallback((item: CartItem) => {
    if (item.sell_as === 'box') {
      return Number(item.product.box_selling_price ?? item.product.selling_price ?? 0);
    }
    if (item.sell_as === 'unit') {
      if (item.product.unit_selling_price != null) return Number(item.product.unit_selling_price);
      const upp = item.product.units_per_pack ?? 0;
      const box = Number(item.product.box_selling_price ?? item.product.selling_price ?? 0);
      return upp > 0 ? box / upp : Number(item.product.selling_price ?? 0);
    }
    return Number(item.product.selling_price);
  }, []);

  const addProductToCart = (
    product: Product,
    mode: 'tap' | 'manual' = 'tap',
    options?: { qty?: number; sellAs?: 'box' | 'unit' },
  ) => {
    if (!hasOpenSession) {
      setError('Não pode registar vendas sem uma sessão de caixa aberta. Abra uma sessão em Caixa primeiro.');
      return;
    }
    const qty =
      options?.qty != null
        ? Math.max(1, options.qty)
        : mode === 'tap'
          ? 1
          : Math.max(1, parseInt(selectedQty || '1', 10) || 1);
    const sellAs = isPackProduct(product)
      ? (options?.sellAs ?? (mode === 'manual' ? sellAsChoice : undefined))
      : undefined;
    const required = sellAs === 'box' ? qty * (product.units_per_pack ?? 1) : qty;
    if (required > product.stock_quantity) {
      setError(`Stock insuficiente. Disponível: ${product.stock_quantity} unidades de base.`);
      return;
    }
    setError(null);
    setCart(prev => {
      const idx = prev.findIndex(c => c.product.id === product.id && c.sell_as === sellAs);
      if (idx >= 0) {
        const next = [...prev];
        const newQty = next[idx].quantity + qty;
        const need = sellAs === 'box' ? newQty * (product.units_per_pack ?? 1) : newQty;
        if (need > product.stock_quantity) {
          setError(`Stock insuficiente. Máximo: ${product.stock_quantity} unidades de base.`);
          return prev;
        }
        next[idx] = { ...next[idx], quantity: newQty };
        return next;
      }
      return [...prev, { product, quantity: qty, sell_as: sellAs }];
    });
  };

  useEffect(() => {
    // Initial check on mount.
    void (async () => {
      setCheckingSession(true);
      try {
        await api.cashSessions.getCurrent();
        setHasOpenSession(true);
      } catch {
        setHasOpenSession(false);
      } finally {
        setCheckingSession(false);
      }
    })();
  }, []);

  const checkSession = useCallback(async () => {
    setCheckingSession(true);
    try {
      await api.cashSessions.getCurrent();
      setHasOpenSession(true);
    } catch {
      setHasOpenSession(false);
    } finally {
      setCheckingSession(false);
    }
  }, []);

  // If the user opens the cash session in another screen and comes back,
  // ensure we re-check before locking the POS.
  useFocusEffect(
    useCallback(() => {
      void checkSession();
    }, [checkSession]),
  );

  const doSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setError(null);
    setSearching(true);
    try {
      const list = await api.products.list({ search: q, limit: 20 });
      setSearchResults(list);
      if (list.length === 0) {
        setError('Nenhum produto encontrado para essa pesquisa.');
      }
    } catch (e) {
      setError(getErrorMessage(e));
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addSelectedToCart = () => {
    if (!selectedProduct) return;
    addProductToCart(selectedProduct, 'manual');
    setSelectedProduct(null);
    setSelectedQty('1');
  };

  const updateCartQty = (productId: number, sellAs: 'box' | 'unit' | undefined, delta: number) => {
    setCart(prev =>
      prev
        .map(c => {
          if (c.product.id !== productId || c.sell_as !== sellAs) return c;
          const newQty = Math.max(0, c.quantity + delta);
          return { ...c, quantity: newQty };
        })
        .filter(c => c.quantity > 0),
    );
  };

  const removeFromCart = (productId: number, sellAs: 'box' | 'unit' | undefined) => {
    setCart(prev => prev.filter(c => !(c.product.id === productId && c.sell_as === sellAs)));
  };

  const total = useMemo(() => cart.reduce((sum, c) => sum + c.quantity * lineUnitPrice(c), 0), [cart, lineUnitPrice]);

  const hasInsufficientStock = cart.some(c => baseUnitsRequired(c) > c.product.stock_quantity);

  const canConfirm = cart.length > 0 && !hasInsufficientStock && !confirming && hasOpenSession;

  const cashReceivedNumber = useMemo(() => {
    const txt = cashReceived.trim();
    if (!txt) return null;
    const v = parseFloat(txt.replace(',', '.'));
    return Number.isNaN(v) ? null : v;
  }, [cashReceived]);

  const trocoNumber =
    paymentMode === 'simple' && paymentMethod === 'cash' && cashReceivedNumber != null
      ? cashReceivedNumber - total
      : null;

  useEffect(() => {
    if (paymentMethod === 'transfer' || paymentMethod === 'other') {
      setPaymentMethod('cash');
    }
  }, [paymentMethod]);

  useEffect(() => {
    if (paymentMode === 'split') {
      setPaymentMode('simple');
    }
  }, [paymentMode]);

  useEffect(() => {
    if (paymentMode !== 'simple' || paymentMethod !== 'cash') {
      setCashReceived('');
    }
  }, [paymentMode, paymentMethod]);

  const renderSimplePaymentAmount = () => {
    const isCash = paymentMethod === 'cash';
    return (
      <>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Recebido</Text>
        </View>
        <TextInput
          editable={isCash}
          style={[styles.posInput, !isCash && styles.posInputReadonly]}
          keyboardType="decimal-pad"
          value={isCash ? cashReceived : total.toFixed(2)}
          placeholder={isCash ? '0' : undefined}
          placeholderTextColor="#6b7280"
          onChangeText={isCash ? setCashReceived : undefined}
        />
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Troco</Text>
          <Text style={styles.amountValueSecondary}>
            {isCash ? (trocoNumber != null ? `${Math.max(0, trocoNumber).toFixed(2)} Kz` : '—') : '0.00 Kz'}
          </Text>
        </View>
      </>
    );
  };

  useEffect(() => {
    if (hasInsufficientStock) {
      setShowStockWarning(true);
    }
  }, [hasInsufficientStock]);

  const onScanPress = () => {
    setShowScanNotice(true);
  };

  const onProductPress = (product: Product) => {
    // POS requirement: always ask how to sell on product tap.
    setSellModeProduct(product);
    setUnitSellQty('1');
    setSellModeModalVisible(true);
  };

  const closeSellModeModal = () => {
    setSellModeModalVisible(false);
    setSellModeProduct(null);
    setUnitSellQty('1');
  };

  const getSellModePrices = () => {
    if (!sellModeProduct) return { box: null as number | null, unit: null as number | null };
    const box = getBoxPrice(sellModeProduct);
    const unit = getUnitPrice(sellModeProduct);
    return { box, unit };
  };

  const confirmSellAsBox = () => {
    if (!sellModeProduct) return;
    addProductToCart(sellModeProduct, 'manual', { qty: 1, sellAs: 'box' });
    closeSellModeModal();
  };

  const confirmSellAsUnit = () => {
    if (!sellModeProduct) return;
    const qty = Math.max(1, parseInt(unitSellQty || '1', 10) || 1);
    addProductToCart(sellModeProduct, 'manual', { qty, sellAs: 'unit' });
    closeSellModeModal();
  };

  const confirmSale = async () => {
    if (!canConfirm || !hasOpenSession) return;
    if (paymentMode === 'split') {
      const sum = splitPayments.reduce((s, p) => s + (p.amount || 0), 0);
      if (Math.abs(sum - total) > 0.01) {
        setError(
          `A soma dos pagamentos (${sum.toFixed(2)} Kz) deve ser igual ao total (${total.toFixed(2)} Kz).`,
        );
        return;
      }
      if (!splitPayments.some(p => p.amount > 0)) {
        setError('Indica pelo menos um valor em algum método de pagamento.');
        return;
      }
    }
    setError(null);
    setConfirming(true);
    try {
      const body: Parameters<typeof api.sales.create>[0] = {
        items: cart.map(c => ({
          product_id: c.product.id,
          quantity: c.quantity,
          unit_price: String(lineUnitPrice(c)),
          ...(c.sell_as && { sell_as: c.sell_as }),
        })),
      };
      if (paymentMode === 'split') {
        body.payments = splitPayments
          .filter(p => p.amount > 0)
          .map(p => ({ payment_method: p.method, amount: p.amount }));
      } else {
        body.payment_method = paymentMethod || 'cash';
        if (paymentMethod === 'cash') {
          if (cashReceivedNumber != null) {
            body.cash_received = cashReceivedNumber;
          }
          if (trocoNumber != null) {
            body.cash_change = Math.max(0, trocoNumber);
          }
        }
      }
      const sale = await api.sales.create(body);
      setLastSaleMessage(`Venda #${sale.id} concluída — Kz ${Number(sale.total_amount).toFixed(2)}`);
      setCart([]);
      setSelectedProduct(null);
      setSelectedQty('1');
      setPaymentMethod('cash');
      setPaymentMode('simple');
      setSplitPayments([
        { method: 'cash', amount: 0 },
        { method: 'card', amount: 0 },
      ]);
      setTimeout(() => setLastSaleMessage(null), 5000);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setConfirming(false);
    }
  };

  useEffect(() => {
    if (!hasOpenSession) return;

    let mounted = true;
    const loadCats = async () => {
      setCategoryError(null);
      try {
        const cats = await api.products.getCategories();
        if (!mounted) return;
        setCategories(cats);
        setActiveCategory(null);
      } catch (e) {
        if (!mounted) return;
        setCategoryError(getErrorMessage(e));
        setCategories([]);
        setActiveCategory(null);
      }
    };

    void loadCats();
    return () => {
      mounted = false;
    };
  }, [hasOpenSession]);

  useEffect(() => {
    if (!hasOpenSession) return;

    let cancelled = false;
    const loadCategoryProducts = async () => {
      setCategoryProductsLoading(true);
      setCategoryError(null);
      try {
        const list = await api.products.list({
          ...(activeCategory ? { category: activeCategory } : {}),
          limit: 60,
        });
        if (cancelled) return;
        setCategoryProducts(list);
      } catch (e) {
        if (cancelled) return;
        setCategoryError(getErrorMessage(e));
        setCategoryProducts([]);
      } finally {
        if (cancelled) return;
        setCategoryProductsLoading(false);
      }
    };

    void loadCategoryProducts();
    return () => {
      cancelled = true;
    };
  }, [activeCategory, hasOpenSession]);

  const sessionBlocked = hasOpenSession === false;
  const showSearch = searchQuery.trim().length > 0 || searching;
  const productsToShow = showSearch ? searchResults : categoryProducts;

  const mobileProductPages = useMemo(() => {
    if (!isPhone) return [];
    const pageSize = 6;
    const pages: Product[][] = [];
    for (let i = 0; i < productsToShow.length; i += pageSize) {
      pages.push(productsToShow.slice(i, i + pageSize));
    }
    return pages;
  }, [productsToShow, isPhone]);

  const productCardBadge = (p: Product) => {
    if (p.is_expired) return { text: 'Expirado', bg: '#dc2626' };
    if (p.is_expiring_soon) return { text: 'Expira', bg: '#f97316' };
    if (p.stock_quantity <= p.minimum_stock) return { text: 'Baixo stock', bg: '#eab308' };
    return null;
  };

  const renderProductCard = ({ item }: { item: Product }) => {
    const badge = productCardBadge(item);
    const displayPrice = Number(item.selling_price).toFixed(2);

    return (
      <Pressable
        style={({ pressed }) => [
          isPhone ? styles.productCardMobile : styles.productCard,
          pressed && (isPhone ? styles.productCardPressedMobile : styles.productCardPressed),
          badge && { borderColor: '#e5e7eb' },
        ]}
        onPress={() => onProductPress(item)}
        accessible
        accessibilityRole="button">
        {badge && (
          <View style={[styles.productBadge, { backgroundColor: badge.bg }]}>
            <Text style={styles.productBadgeText}>{badge.text}</Text>
          </View>
        )}
        <Text style={styles.productCardName} numberOfLines={isPhone ? 1 : 2} ellipsizeMode="tail">
          {item.name}
        </Text>
        <Text style={styles.productCardMeta} numberOfLines={1} ellipsizeMode="tail">
          Kz {displayPrice}
        </Text>
      </Pressable>
    );
  };

  const categoriesBar = ['Todas', ...categories];

  const onCategoryPress = (label: string) => {
    const nextActive = label === 'Todas' ? null : label;
    setActiveCategory(nextActive);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    setSelectedProduct(null);
    setSelectedQty('1');
  };

  const sellModePrices = getSellModePrices();

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        <View style={[styles.screen, isPhone && styles.screenMobile]}>
          {(checkingSession || hasOpenSession === null) && (
            <View style={styles.sessionCard}>
              <ActivityIndicator size="small" color="#16a34a" />
              <Text style={styles.sessionText}>A verificar sessão de caixa…</Text>
            </View>
          )}

          {sessionBlocked && !checkingSession && (
            <View style={styles.blockCard}>
              <Text style={styles.blockTitle}>Sessão de caixa obrigatória</Text>
              <Text style={styles.blockText}>
                Não pode registar vendas sem uma sessão de caixa aberta. Esta regra existe para evitar fraudes e garantir que todo o dinheiro está associado a um turno.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}
                onPress={() => router.push('/(tabs)/caixa')}>
                <Text style={styles.primaryButtonText}>Ir para Caixa e abrir sessão</Text>
              </Pressable>
            </View>
          )}

          {hasOpenSession && (
            <>
              <Modal
                visible={sellModeModalVisible}
                transparent
                animationType="fade"
                onRequestClose={closeSellModeModal}>
                <View style={styles.sellModeOverlay}>
                  <View style={styles.sellModeCard}>
                    <View style={styles.sellModeHeader}>
                      <Text style={styles.sellModeTitle}>Vender Caixa ou Lâmina?</Text>
                      <Pressable style={styles.inlineCloseButton} onPress={closeSellModeModal}>
                        <Text style={styles.inlineCloseButtonText}>X</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.sellModeSubtitle} numberOfLines={1} ellipsizeMode="tail">
                      {sellModeProduct?.name ?? ''}
                    </Text>
                    <View style={styles.sellModePriceRow}>
                      <Text style={styles.sellModePriceText}>
                        Caixa: Kz {sellModePrices.box != null ? sellModePrices.box.toFixed(2) : '0.00'}
                      </Text>
                      <Text style={styles.sellModePriceText}>
                        Lâmina: Kz {sellModePrices.unit != null ? sellModePrices.unit.toFixed(2) : '0.00'}
                      </Text>
                    </View>
                    <View style={styles.sellModeActions}>
                      <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]} onPress={confirmSellAsBox}>
                        <Text style={styles.secondaryButtonText}>Caixa</Text>
                      </Pressable>
                    </View>
                    <View style={styles.sellModeUnitRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Lâmina - quantidade</Text>
                        <TextInput
                          style={styles.posInput}
                          keyboardType="number-pad"
                          value={unitSellQty}
                          onChangeText={setUnitSellQty}
                          placeholder="1"
                          placeholderTextColor="#6b7280"
                        />
                      </View>
                      <Pressable
                        style={({ pressed }) => [styles.primaryButton, styles.sellModePrimary, pressed && styles.primaryButtonPressed]}
                        onPress={confirmSellAsUnit}>
                        <Text style={styles.primaryButtonText}>Adicionar</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Modal>

              {showScanNotice && (
                <View style={styles.noticeBox}>
                  <Text style={styles.noticeText}>Scan ainda não disponível.</Text>
                  <Pressable style={styles.inlineCloseButton} onPress={() => setShowScanNotice(false)}>
                    <Text style={styles.inlineCloseButtonText}>X</Text>
                  </Pressable>
                </View>
              )}

              {error && (
                <View style={styles.errorBox}>
                  <View style={styles.inlineHeaderRow}>
                    <Text style={styles.errorTitle}>Erro</Text>
                    <Pressable style={styles.inlineCloseButton} onPress={() => setError(null)}>
                      <Text style={styles.inlineCloseButtonText}>X</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.errorText} numberOfLines={3} ellipsizeMode="tail">
                    {error}
                  </Text>
                </View>
              )}

              {lastSaleMessage && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>{lastSaleMessage}</Text>
                </View>
              )}

              {isTablet ? (isTabletLandscape ? (
                <View style={[styles.posRowLayout, Platform.OS === 'web' && styles.posRowLayoutWeb]}>
                  <View style={[styles.leftArea, Platform.OS === 'web' && styles.leftAreaWeb]}>
                    <View style={[styles.productPanel, Platform.OS === 'web' && styles.productPanelWebLandscape]}>
                      <View style={styles.productPanelHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.panelTitle}>Produtos</Text>
                          <Text style={styles.panelSubtitle}>
                            {showSearch ? 'Resultados da pesquisa' : activeCategory ? `Categoria: ${activeCategory}` : 'Todos os produtos'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.searchRow}>
                        <Pressable
                          style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
                          onPress={onScanPress}>
                          <Text style={styles.scanButtonText}>Scan</Text>
                        </Pressable>

                        <TextInput
                          style={styles.searchInput}
                          placeholder="Nome ou SKU do produto"
                          placeholderTextColor="#6b7280"
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          onSubmitEditing={doSearch}
                          returnKeyType="search"
                        />

                        <Pressable
                          style={({ pressed }) => [styles.searchButton, pressed && styles.searchButtonPressed]}
                          onPress={doSearch}
                          disabled={searching}>
                          <Text style={styles.searchButtonText}>{searching ? '...' : 'Procurar'}</Text>
                        </Pressable>
                      </View>

                      {selectedProduct && (
                        <View style={styles.manualCard}>
                          <Text style={styles.manualTitle}>Produto seleccionado</Text>
                          <Text style={styles.manualProductName}>{selectedProduct.name}</Text>
                          <Text style={styles.manualProductMeta}>
                            SKU: {selectedProduct.sku} · Stock: {selectedProduct.stock_quantity}
                          </Text>
                          <Text style={styles.manualProductMeta}>
                            Preço base: {Number(selectedProduct.selling_price).toFixed(2)} Kz
                          </Text>

                          {isPackProduct(selectedProduct) && (
                            <View style={styles.sellAsRow}>
                              <Text style={styles.label}>Vender por</Text>
                              <View style={styles.sellAsButtons}>
                                <Pressable
                                  style={({ pressed }) => [
                                    styles.posChip,
                                    sellAsChoice === 'box' && styles.posChipActive,
                                    pressed && styles.chipPressed,
                                  ]}
                                  onPress={() => setSellAsChoice('box')}>
                                  <Text style={[styles.chipText, sellAsChoice === 'box' && styles.chipTextActive]}>
                                    {selectedProduct.pack_name || 'Caixa'}
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={({ pressed }) => [
                                    styles.posChip,
                                    sellAsChoice === 'unit' && styles.posChipActive,
                                    pressed && styles.chipPressed,
                                  ]}
                                  onPress={() => setSellAsChoice('unit')}>
                                  <Text style={[styles.chipText, sellAsChoice === 'unit' && styles.chipTextActive]}>
                                    {selectedProduct.unit_name || 'Unidade'}
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          )}

                          <View style={styles.field}>
                            <Text style={styles.label}>Quantidade</Text>
                            <TextInput
                              style={styles.posInput}
                              keyboardType="number-pad"
                              value={selectedQty}
                              onChangeText={setSelectedQty}
                            />
                          </View>

                          <Pressable
                            style={({ pressed }) => [
                              styles.primaryButton,
                              pressed && styles.primaryButtonPressed,
                            ]}
                            onPress={addSelectedToCart}>
                            <Text style={styles.primaryButtonText}>Adicionar ao carrinho</Text>
                          </Pressable>
                        </View>
                      )}

                      <View style={styles.gridWrap}>
                        {categoryError && !showSearch ? (
                          <Text style={styles.categoryErrorText}>{categoryError}</Text>
                        ) : null}

                        {(categoryProductsLoading && !showSearch) || (searching && showSearch) ? (
                          <View style={styles.loadingGrid}>
                            <ActivityIndicator size="large" color="#16a34a" />
                          </View>
                        ) : productsToShow.length === 0 && (showSearch ? !searching : !categoryProductsLoading) ? (
                          <Text style={styles.emptyText}>
                            {showSearch ? 'Nenhum produto encontrado para essa pesquisa.' : 'Sem produtos para esta categoria.'}
                          </Text>
                        ) : (
                          <FlatList
                            data={productsToShow}
                            keyExtractor={item => String(item.id)}
                            renderItem={renderProductCard}
                            numColumns={productGridColumns}
                            scrollEnabled={true}
                            contentContainerStyle={styles.productGridContent}
                            showsVerticalScrollIndicator={false}
                          />
                        )}
                      </View>
                    </View>

                    <View style={[styles.categoryBar, Platform.OS === 'web' && styles.categoryBarWebLandscape]}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.categoryScroll}>
                        {categoriesBar.map(label => {
                          const isActive = (label === 'Todas' && activeCategory === null) || activeCategory === label;
                          return (
                            <Pressable
                              key={label}
                              style={({ pressed }) => [
                                styles.categoryButton,
                                isActive && styles.categoryButtonActive,
                                pressed && styles.categoryButtonPressed,
                              ]}
                              onPress={() => onCategoryPress(label)}>
                              <Text style={[styles.categoryButtonText, isActive && styles.categoryButtonTextActive]}>
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>

                  <View style={[styles.paymentPanel, Platform.OS === 'web' && styles.paymentPanelWeb]}>
                    <View style={styles.paymentSummaryBlock}>
                      <Text style={styles.panelTitle}>Pagamento</Text>
                      <View style={styles.paymentTotalRow}>
                        <Text style={styles.paymentTotalLabel}>Total</Text>
                        <Text style={styles.paymentTotalValue}>{total.toFixed(2)} Kz</Text>
                      </View>
                    </View>

                    <View style={styles.paymentMethodSection}>
                      <Text style={styles.blockLabel}>Método</Text>
                      <PosPaymentMethodButtons paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />
                    </View>

                    <PaymentCartLines
                      cart={cart}
                      cartListNeedsScroll={cartListNeedsScroll}
                      listVariant="wide"
                      fillAvailableHeight
                      lineUnitPrice={lineUnitPrice}
                      updateCartQty={updateCartQty}
                      removeFromCart={removeFromCart}
                      hasInsufficientStock={hasInsufficientStock}
                      showStockWarning={showStockWarning}
                      setShowStockWarning={setShowStockWarning}
                    />

                    <View style={[styles.paymentAmountBlock, styles.paymentAmountTopSep]}>
                      {renderSimplePaymentAmount()}
                    </View>

                    <View style={styles.paymentFinalBlock}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.confirmButton,
                          styles.confirmButtonMobile,
                          pressed && styles.confirmButtonPressed,
                          (!canConfirm || confirming) && styles.confirmButtonDisabled,
                        ]}
                        onPress={confirmSale}
                        disabled={!canConfirm || confirming}>
                        <Text style={styles.confirmButtonText}>
                          {confirming ? 'A registar...' : 'Registar venda'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={[styles.posColumnLayout, isPhone && styles.posColumnLayoutMobile]}>
                  <View
                    style={[
                      styles.productPanel,
                      isPhone ? styles.productPanelMobile : styles.productPanelTabletPortrait,
                    ]}>
                    <View style={styles.productPanelHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.panelTitle}>Produtos</Text>
                        <Text style={styles.panelSubtitle}>
                          {showSearch ? 'Resultados da pesquisa' : activeCategory ? `Categoria: ${activeCategory}` : 'Todos os produtos'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.searchRow}>
                      <Pressable
                        style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
                        onPress={onScanPress}>
                        <Text style={styles.scanButtonText}>Scan</Text>
                      </Pressable>

                      <TextInput
                        style={styles.searchInput}
                        placeholder="Nome ou SKU do produto"
                        placeholderTextColor="#6b7280"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={doSearch}
                        returnKeyType="search"
                      />

                      <Pressable
                        style={({ pressed }) => [styles.searchButton, pressed && styles.searchButtonPressed]}
                        onPress={doSearch}
                        disabled={searching}>
                        <Text style={styles.searchButtonText}>{searching ? '...' : 'Procurar'}</Text>
                      </Pressable>
                    </View>

                    {selectedProduct && (
                      <View style={styles.manualCard}>
                        <Text style={styles.manualTitle}>Produto seleccionado</Text>
                        <Text style={styles.manualProductName}>{selectedProduct.name}</Text>
                        <Text style={styles.manualProductMeta}>
                          SKU: {selectedProduct.sku} · Stock: {selectedProduct.stock_quantity}
                        </Text>
                        <Text style={styles.manualProductMeta}>
                          Preço base: {Number(selectedProduct.selling_price).toFixed(2)} Kz
                        </Text>

                        {isPackProduct(selectedProduct) && (
                          <View style={styles.sellAsRow}>
                            <Text style={styles.label}>Vender por</Text>
                            <View style={styles.sellAsButtons}>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.posChip,
                                  sellAsChoice === 'box' && styles.posChipActive,
                                  pressed && styles.chipPressed,
                                ]}
                                onPress={() => setSellAsChoice('box')}>
                                <Text
                                  style={[styles.chipText, sellAsChoice === 'box' && styles.chipTextActive]}>
                                  {selectedProduct.pack_name || 'Caixa'}
                                </Text>
                              </Pressable>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.posChip,
                                  sellAsChoice === 'unit' && styles.posChipActive,
                                  pressed && styles.chipPressed,
                                ]}
                                onPress={() => setSellAsChoice('unit')}>
                                <Text
                                  style={[
                                    styles.chipText,
                                    sellAsChoice === 'unit' && styles.chipTextActive,
                                  ]}>
                                  {selectedProduct.unit_name || 'Unidade'}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        )}

                        <View style={styles.field}>
                          <Text style={styles.label}>Quantidade</Text>
                          <TextInput
                            style={styles.posInput}
                            keyboardType="number-pad"
                            value={selectedQty}
                            onChangeText={setSelectedQty}
                          />
                        </View>

                        <Pressable
                          style={({ pressed }) => [
                            styles.primaryButton,
                            pressed && styles.primaryButtonPressed,
                          ]}
                          onPress={addSelectedToCart}>
                          <Text style={styles.primaryButtonText}>Adicionar ao carrinho</Text>
                        </Pressable>
                      </View>
                    )}

                    <View style={[styles.gridWrap, styles.gridWrapMobile]}>
                      {categoryError && !showSearch ? (
                        <Text style={styles.categoryErrorText}>{categoryError}</Text>
                      ) : null}

                      {(categoryProductsLoading && !showSearch) || (searching && showSearch) ? (
                        <View style={styles.loadingGrid}>
                          <ActivityIndicator size="large" color="#16a34a" />
                        </View>
                      ) : productsToShow.length === 0 && (showSearch ? !searching : !categoryProductsLoading) ? (
                        <Text style={styles.emptyText}>
                          {showSearch ? 'Nenhum produto encontrado para essa pesquisa.' : 'Sem produtos para esta categoria.'}
                        </Text>
                      ) : (
                        <FlatList
                          data={productsToShow}
                          keyExtractor={item => String(item.id)}
                          renderItem={renderProductCard}
                          numColumns={productGridColumns}
                          scrollEnabled={true}
                          contentContainerStyle={styles.productGridContent}
                          showsVerticalScrollIndicator={false}
                        />
                      )}
                    </View>
                  </View>

                  <View
                    style={[
                      styles.paymentPanel,
                      isPhone ? styles.paymentPanelMobile : styles.paymentPanelTabletPortrait,
                      Platform.OS === 'web' && !isPhone && styles.paymentPanelWeb,
                    ]}>
                    <View style={styles.paymentSummaryBlock}>
                      <Text style={styles.panelTitle}>Pagamento</Text>
                      <View style={styles.paymentTotalRow}>
                        <Text style={styles.paymentTotalLabel}>Total</Text>
                        <Text style={styles.paymentTotalValue}>{total.toFixed(2)} Kz</Text>
                      </View>
                    </View>

                    <View style={styles.paymentMethodSection}>
                      <Text style={styles.blockLabel}>Método</Text>
                      <PosPaymentMethodButtons paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />
                    </View>

                    <PaymentCartLines
                      cart={cart}
                      cartListNeedsScroll={cartListNeedsScroll}
                      listVariant={isPhone ? 'stack' : 'wide'}
                      fillAvailableHeight={false}
                      lineUnitPrice={lineUnitPrice}
                      updateCartQty={updateCartQty}
                      removeFromCart={removeFromCart}
                      hasInsufficientStock={hasInsufficientStock}
                      showStockWarning={showStockWarning}
                      setShowStockWarning={setShowStockWarning}
                    />

                    <View style={[styles.paymentAmountBlock, styles.paymentAmountTopSep]}>
                      {renderSimplePaymentAmount()}
                    </View>

                    <View style={styles.paymentFinalBlock}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.confirmButton,
                          pressed && styles.confirmButtonPressed,
                          (!canConfirm || confirming) && styles.confirmButtonDisabled,
                        ]}
                        onPress={confirmSale}
                        disabled={!canConfirm || confirming}>
                        <Text style={styles.confirmButtonText}>
                          {confirming ? 'A registar...' : 'Registar venda'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.categoryBar,
                      isPhone ? styles.categoryBarMobile : undefined,
                    ]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                      {categoriesBar.map(label => {
                        const isActive =
                          (label === 'Todas' && activeCategory === null) || activeCategory === label;
                        return (
                          <Pressable
                            key={label}
                            style={({ pressed }) => [
                              styles.categoryButton,
                              isActive && styles.categoryButtonActive,
                              pressed && styles.categoryButtonPressed,
                            ]}
                            onPress={() => onCategoryPress(label)}>
                            <Text
                              style={[styles.categoryButtonText, isActive && styles.categoryButtonTextActive]}>
                              {label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
              )) : (
                <ScrollView style={styles.mobileScroll} contentContainerStyle={styles.mobileScrollContent} showsVerticalScrollIndicator={false}>
                  <View style={styles.mobilePosLayout}>
                  <View style={[styles.productPanel, styles.productPanelMobile]}>
                    <View style={styles.productPanelHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.panelTitle}>Produtos</Text>
                        <Text style={styles.panelSubtitle}>
                          {showSearch
                            ? 'Resultados da pesquisa'
                            : activeCategory
                              ? `Categoria: ${activeCategory}`
                              : 'Todos os produtos'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.searchRow}>
                      <Pressable
                        style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
                        onPress={onScanPress}>
                        <Text style={styles.scanButtonText}>Scan</Text>
                      </Pressable>

                      <TextInput
                        style={styles.searchInput}
                        placeholder="Nome ou SKU do produto"
                        placeholderTextColor="#6b7280"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={doSearch}
                        returnKeyType="search"
                      />

                      <Pressable
                        style={({ pressed }) => [styles.searchButton, pressed && styles.searchButtonPressed]}
                        onPress={doSearch}
                        disabled={searching}>
                        <Text style={styles.searchButtonText}>{searching ? '...' : 'Procurar'}</Text>
                      </Pressable>
                    </View>

                    <View style={[styles.categoryBar, styles.categoryBarMobile]}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ width: '100%' }}
                        contentContainerStyle={styles.categoryScroll}>
                        {categoriesBar.map(label => {
                          const isActive = (label === 'Todas' && activeCategory === null) || activeCategory === label;
                          return (
                            <Pressable
                              key={label}
                              style={({ pressed }) => [
                                styles.categoryButton,
                                isActive && styles.categoryButtonActive,
                                pressed && styles.categoryButtonPressed,
                              ]}
                              onPress={() => onCategoryPress(label)}>
                              <Text
                                style={[
                                  styles.categoryButtonText,
                                  isActive && styles.categoryButtonTextActive,
                                ]}
                                numberOfLines={1}
                                ellipsizeMode="tail">
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>

                    {selectedProduct && (
                      <View style={styles.manualCard}>
                        <Text style={styles.manualTitle}>Produto seleccionado</Text>
                        <Text style={styles.manualProductName}>{selectedProduct.name}</Text>
                        <Text style={styles.manualProductMeta}>SKU: {selectedProduct.sku} · Stock: {selectedProduct.stock_quantity}</Text>
                        <Text style={styles.manualProductMeta}>
                          Preço base: {Number(selectedProduct.selling_price).toFixed(2)} Kz
                        </Text>

                        {isPackProduct(selectedProduct) && (
                          <View style={styles.sellAsRow}>
                            <Text style={styles.label}>Vender por</Text>
                            <View style={styles.sellAsButtons}>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.posChip,
                                  sellAsChoice === 'box' && styles.posChipActive,
                                  pressed && styles.chipPressed,
                                ]}
                                onPress={() => setSellAsChoice('box')}>
                                <Text style={[styles.chipText, sellAsChoice === 'box' && styles.chipTextActive]}>
                                  {selectedProduct.pack_name || 'Caixa'}
                                </Text>
                              </Pressable>
                              <Pressable
                                style={({ pressed }) => [
                                  styles.posChip,
                                  sellAsChoice === 'unit' && styles.posChipActive,
                                  pressed && styles.chipPressed,
                                ]}
                                onPress={() => setSellAsChoice('unit')}>
                                <Text style={[styles.chipText, sellAsChoice === 'unit' && styles.chipTextActive]}>
                                  {selectedProduct.unit_name || 'Unidade'}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        )}

                        <View style={styles.field}>
                          <Text style={styles.label}>Quantidade</Text>
                          <TextInput style={styles.posInput} keyboardType="number-pad" value={selectedQty} onChangeText={setSelectedQty} />
                        </View>

                        <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]} onPress={addSelectedToCart}>
                          <Text style={styles.primaryButtonText}>Adicionar ao carrinho</Text>
                        </Pressable>
                      </View>
                    )}

                    <View style={[styles.gridWrap, styles.gridWrapMobile]} onLayout={e => setMobilePagerWidth(e.nativeEvent.layout.width)}>
                      {categoryError && !showSearch ? <Text style={styles.categoryErrorText}>{categoryError}</Text> : null}

                      {(categoryProductsLoading && !showSearch) || (searching && showSearch) ? (
                        <View style={styles.loadingGrid}>
                          <ActivityIndicator size="large" color="#16a34a" />
                        </View>
                      ) : productsToShow.length === 0 && (showSearch ? !searching : !categoryProductsLoading) ? (
                        <Text style={styles.emptyText}>
                          {showSearch ? 'Nenhum produto encontrado para essa pesquisa.' : 'Sem produtos para esta categoria.'}
                        </Text>
                      ) : (
                        <FlatList
                          data={mobileProductPages}
                          keyExtractor={(_, idx) => String(idx)}
                          horizontal
                          pagingEnabled
                          showsHorizontalScrollIndicator={false}
                          style={{ width: '100%' }}
                          renderItem={({ item: pageItems }) => {
                            const pageWidth = mobilePagerWidth || Math.max(0, width - 24);
                            return (
                              <View style={{ width: pageWidth }}>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                                  {pageItems.map(p => (
                                    <View key={p.id} style={{ width: '33.333%', padding: 4 }}>
                                      {renderProductCard({ item: p })}
                                    </View>
                                  ))}
                                </View>
                              </View>
                            );
                          }}
                        />
                      )}
                    </View>
                  </View>

                  <View style={[styles.paymentPanel, styles.paymentPanelMobileStack, Platform.OS === 'web' && styles.paymentPanelWebMobile]}>
                    <View style={styles.paymentSummaryBlock}>
                      <Text style={styles.panelTitle}>Pagamento</Text>
                      <View style={styles.paymentTotalRow}>
                        <Text style={styles.paymentTotalLabel}>Total</Text>
                        <Text style={styles.paymentTotalValue}>{total.toFixed(2)} Kz</Text>
                      </View>
                    </View>

                    <View style={styles.paymentMethodSection}>
                      <Text style={styles.blockLabel}>Método</Text>
                      <PosPaymentMethodButtons paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} />
                    </View>

                    <PaymentCartLines
                      cart={cart}
                      cartListNeedsScroll={cartListNeedsScroll}
                      listVariant="stack"
                      fillAvailableHeight={false}
                      lineUnitPrice={lineUnitPrice}
                      updateCartQty={updateCartQty}
                      removeFromCart={removeFromCart}
                      hasInsufficientStock={hasInsufficientStock}
                      showStockWarning={showStockWarning}
                      setShowStockWarning={setShowStockWarning}
                    />

                    <View style={[styles.paymentAmountBlock, styles.paymentAmountTopSep]}>
                      {renderSimplePaymentAmount()}
                    </View>

                    <View style={styles.paymentFinalBlock}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.confirmButton,
                          pressed && styles.confirmButtonPressed,
                          (!canConfirm || confirming) && styles.confirmButtonDisabled,
                        ]}
                        onPress={confirmSale}
                        disabled={!canConfirm || confirming}>
                        <Text style={styles.confirmButtonText}>
                          {confirming ? 'A registar...' : 'Registar venda'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  </View>
                </ScrollView>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#d1d5db',
  },
  keyboardAvoid: {
    flex: 1,
  },
  screen: {
    flex: 1,
    padding: 8,
    gap: 8,
    width: '100%',
    flexDirection: 'column',
  },
  screenMobile: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },

  sessionCard: {
    borderRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },

  blockCard: {
    borderRadius: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fb923c',
    backgroundColor: '#fff7ed',
    gap: 10,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9a3412',
  },
  blockText: {
    fontSize: 13,
    color: '#9a3412',
    lineHeight: 18,
  },

  primaryButton: {
    height: 48,
    borderRadius: 4,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonPressed: {
    backgroundColor: '#15803d',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },

  errorBox: {
    borderRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fee2e2',
  },
  errorTitle: {
    fontWeight: '800',
    color: '#991b1b',
    marginBottom: 4,
  },
  errorText: {
    color: '#991b1b',
    fontSize: 13,
    lineHeight: 18,
  },
  noticeBox: {
    borderRadius: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  noticeText: {
    flex: 1,
    color: '#1e3a8a',
    fontSize: 13,
    fontWeight: '700',
  },
  sellModeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sellModeCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 10,
  },
  sellModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sellModeTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  sellModeSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '700',
  },
  sellModePriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sellModePriceText: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
  },
  sellModeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sellModeUnitRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  sellModePrimary: {
    height: 40,
    borderRadius: 4,
    paddingHorizontal: 16,
  },
  inlineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  inlineCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  inlineCloseButtonText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
  },

  successBox: {
    borderRadius: 4,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#dcfce7',
  },
  successText: {
    color: '#14532d',
    fontSize: 13,
    fontWeight: '700',
  },

  posRowLayout: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  posRowLayoutWeb: {
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 0,
  },
  posColumnLayout: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
  },
  posColumnLayoutMobile: {
    gap: 6,
  },

  /** Sem flex:1 — dentro do ScrollView do telemóvel, flex:1 estica ao viewport e deixa «buraco» branco + layout RN-web partido. */
  mobilePosLayout: {
    width: '100%',
    flexDirection: 'column',
    gap: 8,
  },

  mobileScroll: {
    flex: 1,
  },
  mobileScrollContent: {
    width: '100%',
    flexDirection: 'column',
    gap: 8,
    paddingBottom: 16,
  },

  leftArea: {
    flex: 0.75,
    minWidth: 280,
    flexDirection: 'column',
    gap: 8,
  },
  leftAreaWeb: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    gap: 8,
  },

  productPanel: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
    padding: 8,
    gap: 6,
  },
  productPanelWebLandscape: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  categoryBar: {
    flex: 0.1,
    minHeight: 56,
    maxHeight: 56,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  categoryBarWebLandscape: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    height: 56,
    minHeight: 56,
    maxHeight: 56,
  },

  paymentPanel: {
    flex: 0.25,
    minWidth: 240,
    maxWidth: 300,
    height: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#475569',
    padding: 8,
    gap: 8,
    flexDirection: 'column',
    minHeight: 0,
    alignSelf: 'stretch',
  },
  paymentPanelWeb: {
    flex: 0.34,
    minWidth: 280,
    maxWidth: 460,
    alignSelf: 'stretch',
  },
  paymentPanelWebMobile: {
    maxWidth: '100%' as const,
    width: '100%' as const,
    alignSelf: 'stretch',
  },

  panelTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: 0.2,
  },
  panelSubtitle: {
    marginTop: 2,
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  productPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  summaryTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: '#cbd5e1',
    borderBottomWidth: 1,
    borderBottomColor: '#475569',
  },
  th: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1e293b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  thName: { flex: 2, minWidth: 0 },
  thQty: { minWidth: 96, maxWidth: 112, textAlign: 'center', flexGrow: 0, flexShrink: 0 },
  thUnit: { flex: 1, textAlign: 'right', minWidth: 0 },
  thSubtotal: { flex: 1, textAlign: 'right', minWidth: 0 },
  thRemove: { width: 44, textAlign: 'center', flexShrink: 0 },

  /** Web cart header row: outer gap; cells are Views (CartTableHeaderRow), not flex Text. */
  summaryTableHeaderWebCart: {
    gap: 4,
    paddingHorizontal: 4,
  },
  cartThProd: {
    flex: 1,
    flexShrink: 1,
    minWidth: 56,
    maxWidth: 280,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  cartThQty: {
    width: 100,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartThUnit: {
    width: 74,
    minWidth: 74,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  cartThTotal: {
    width: 76,
    minWidth: 76,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  cartThRemove: {
    width: 40,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartThUnitText: {
    textAlign: 'right',
    width: '100%',
  },
  cartThTotalText: {
    textAlign: 'right',
    width: '100%',
  },
  summaryRowWebCart: {
    gap: 6,
    marginBottom: 0,
    paddingVertical: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
  },
  /** Altura fixa por linha — alinhar com PAYMENT_CART_ROW_HEIGHT no componente. */
  paymentCartRowFixed: {
    height: 50,
    minHeight: 50,
    maxHeight: 50,
    paddingVertical: 0,
    overflow: 'hidden',
  },
  colNameWebCart: {
    flex: 1,
    flexShrink: 1,
    minWidth: 80,
    maxWidth: 300,
  },
  colQtyWebCart: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 100,
    width: 100,
  },
  colUnitWebCart: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 74,
    width: 74,
    alignItems: 'flex-end',
  },
  colSubtotalWebCart: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 76,
    width: 76,
    alignItems: 'flex-end',
  },

  /** RN-web: conteúdo do ScrollView do carrinho não deve esticar com flexGrow. */
  summaryListContentWeb: {
    flexGrow: 0,
    width: '100%',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    lineHeight: 18,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#f97316',
    fontWeight: '800',
  },
  warningRow: {
    marginBottom: 8,
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minHeight: 52,
    paddingVertical: 4,
    paddingHorizontal: 4,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  colName: { flex: 2, minWidth: 0, paddingRight: 4 },
  colQty: {
    flexGrow: 0,
    flexShrink: 0,
    width: 100,
    maxWidth: 118,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colUnit: { flex: 1, minWidth: 0, alignItems: 'flex-end', justifyContent: 'center' },
  colSubtotal: { flex: 1, minWidth: 0, alignItems: 'flex-end', justifyContent: 'center' },

  summaryItemName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  summaryItemMeta: {
    marginTop: 1,
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  summaryPriceText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
  },
  summarySubtotalText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '800',
  },

  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexWrap: 'nowrap',
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  qtyButtonText: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 18,
  },
  qtyText: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 13,
    minWidth: 18,
    textAlign: 'center',
  },

  removeButton: {
    width: 40,
    height: 36,
    borderRadius: 4,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dc2626',
    flexShrink: 0,
  },
  removeButtonText: {
    color: '#b91c1c',
    fontWeight: '900',
    fontSize: 12,
  },

  summaryFooter: {
    paddingTop: 8,
    paddingRight: 6,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryFooterLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  summaryFooterValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#16a34a',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
  },
  scanButton: {
    height: 40,
    width: 64,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#15803d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonPressed: {
    backgroundColor: '#f1f5f9',
  },
  scanButtonText: {
    color: '#15803d',
    fontWeight: '900',
    fontSize: 12,
  },

  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '600',
  },
  searchButton: {
    height: 40,
    width: 88,
    borderRadius: 4,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonPressed: {
    backgroundColor: '#0f172a',
  },
  searchButtonText: {
    color: '#ffffff',
    fontWeight: '900',
  },

  gridWrap: {
    flex: 1,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  gridWrapMobile: {
    flex: 0,
    overflow: 'hidden',
  },
  loadingGrid: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryErrorText: {
    color: '#991b1b',
    fontWeight: '800',
    fontSize: 13,
    paddingVertical: 6,
  },
  productGridContent: {
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  productGridContentMobile: {
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 6,
  },

  productCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: '#ffffff',
    padding: 8,
    margin: 3,
    gap: 4,
    justifyContent: 'space-between',
  },
  productCardMobile: {
    flex: 0,
    width: '100%',
    minHeight: 92,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: '#ffffff',
    padding: 6,
    margin: 0,
    gap: 4,
    justifyContent: 'space-between',
  },
  productCardPressed: {
    backgroundColor: '#f9fafb',
  },
  productCardPressedMobile: {
    backgroundColor: '#f9fafb',
  },
  productBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 2,
  },
  productBadgeText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 11,
  },

  productCardName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    flexShrink: 1,
  },
  productCardMeta: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
  },
  productCardSku: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '700',
  },

  manualCard: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: '#e2e8f0',
    padding: 8,
    gap: 6,
    marginBottom: 6,
  },
  manualTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },
  manualProductName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  manualProductMeta: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    marginTop: 2,
  },
  sellAsRow: {
    marginTop: 2,
    gap: 6,
  },
  sellAsButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '800',
  },
  posChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#e5e7eb',
  },
  posChipActive: {
    backgroundColor: '#15803d',
    borderColor: '#14532d',
  },
  paymentChip: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  /** Web + paymentRow: não usar width:100% por chip (paymentChip); evita largura 0% e texto invisível. */
  posChipWeb: {
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipText: {
    fontSize: 12,
    color: '#1e293b',
    fontWeight: '800',
  },
  chipTextActive: {
    color: '#ffffff',
  },

  field: {
    marginTop: 6,
    gap: 6,
  },
  posInput: {
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    width: '100%',
    maxWidth: '100%',
  },

  categoryScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  categoryButton: {
    height: 40,
    minWidth: 96,
    maxWidth: 160,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  categoryButtonActive: {
    backgroundColor: '#15803d',
    borderColor: '#14532d',
  },
  categoryButtonPressed: {
    opacity: 0.9,
  },
  categoryButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  categoryButtonTextActive: {
    color: '#ffffff',
  },

  paymentSummaryBlock: {
    gap: 6,
  },
  paymentDivider: {
    height: 1,
    backgroundColor: '#eef2f7',
    width: '100%',
  },
  paymentAmountBlock: {
    gap: 10,
    paddingVertical: 6,
    flexShrink: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  amountLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
  },
  amountValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#166534',
  },
  amountValueSecondary: {
    fontSize: 20,
    fontWeight: '900',
    color: '#9ca3af',
  },
  paymentFinalBlock: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    flexShrink: 0,
    width: '100%',
    alignSelf: 'stretch',
  },
  panelTitleSmall: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  paymentTotalRow: {
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#64748b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentTotalLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
  paymentTotalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#166534',
  },

  paymentBlock: {
    flex: 1,
    gap: 8,
  },
  /** Painéis com height: auto (stack mobile/retrato): flex:1 no bloco Método colapsa no web e esconde os chips. */
  paymentBlockStack: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    width: '100%',
  },
  paymentBlockMobile: {
    flex: 0,
    width: '100%',
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  paymentBlockTopSep: {
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    paddingTop: 10,
    marginTop: 6,
    backgroundColor: 'transparent',
  },
  paymentAmountTopSep: {
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    paddingTop: 10,
    marginTop: 6,
    backgroundColor: 'transparent',
  },
  paymentMethodSection: {
    width: '100%',
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    backgroundColor: '#f8fafc',
  },
  paymentMethodTwoRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    alignSelf: 'stretch',
  },
  paymentMethodButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  paymentMethodButtonActive: {
    backgroundColor: '#15803d',
    borderColor: '#14532d',
  },
  paymentMethodButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
  },
  paymentMethodButtonTextActive: {
    color: '#ffffff',
  },
  posInputReadonly: {
    backgroundColor: '#e2e8f0',
    color: '#475569',
  },
  paymentCartBlock: {
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    paddingTop: 10,
    marginTop: 8,
    marginBottom: 10,
    width: '100%',
    backgroundColor: 'transparent',
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  paymentCartHeaderBlock: {
    width: '100%',
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  paymentCartTableOuter: {
    width: '100%',
    alignSelf: 'stretch',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#64748b',
    borderRadius: 4,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  paymentCartTableHeaderWrap: {
    width: '100%',
    flexShrink: 0,
  },
  paymentCartRowsScroll: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
  },
  paymentCartRowsScrollContent: {
    paddingTop: 4,
    paddingBottom: 4,
    flexGrow: 0,
    width: '100%',
  },
  paymentCartTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 4,
    backgroundColor: 'transparent',
    letterSpacing: 0.3,
  },
  paymentCartHint: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 6,
  },
  paymentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  paymentRowTablet: {
    flexDirection: 'column',
    alignItems: 'stretch',
    flexWrap: 'nowrap',
    gap: 8,
  },

  secondaryButton: {
    height: 44,
    borderRadius: 4,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonPressed: {
    backgroundColor: '#e5e7eb',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 13,
    textAlign: 'center',
  },

  secondaryButtonSmall: {
    height: 36,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
    borderWidth: 1,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  splitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  splitMethodCol: {
    flex: 1.1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  splitAmountCol: {
    flex: 0.9,
  },

  splitSummaryText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    marginTop: 8,
  },

  confirmButton: {
    height: 52,
    borderRadius: 4,
    backgroundColor: '#15803d',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    width: '100%',
    borderWidth: 1,
    borderColor: '#14532d',
  },
  confirmButtonMobile: {
    height: 52,
    marginTop: 8,
  },
  confirmButtonPressed: {
    backgroundColor: '#166534',
  },
  confirmButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  confirmButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 16,
  },

  productPanelMobile: {
    flex: 0,
    minHeight: 0,
  },
  productPanelTabletPortrait: {
    flex: 1,
    minHeight: 0,
  },

  paymentPanelMobile: {
    flex: 0,
    minWidth: 0,
    maxWidth: 9999,
    height: 'auto',
    padding: 8,
    gap: 8,
    flexDirection: 'column',
    width: '100%',
  },
  paymentPanelMobileStack: {
    flex: 0,
    minWidth: 0,
    maxWidth: 9999,
    height: 'auto',
    padding: 8,
    gap: 8,
    alignSelf: 'stretch',
    flexDirection: 'column',
    width: '100%',
  },
  paymentPanelTabletPortrait: {
    flex: 0,
    minWidth: 0,
    maxWidth: 9999,
    height: 'auto',
    flexDirection: 'column',
    width: '100%',
  },

  categoryBarMobile: {
    flex: 0,
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    minHeight: 60,
    maxHeight: 66,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
});

