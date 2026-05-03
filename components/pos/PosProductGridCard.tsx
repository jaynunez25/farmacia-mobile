import { memo, useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { resolveApiMediaUrl } from '@/services/api';
import type { Product } from '@/types';
import { formatCurrency } from '@/utils/currency';

function shelfLine(p: Product): string {
  const s = (p.shelf_display || p.shelf_location || p.location || '').trim();
  return s.length > 0 ? s : '—';
}

function productBadge(p: Product) {
  if (p.is_expired) return { text: 'Expirado', bg: '#dc2626' } as const;
  if (p.is_expiring_soon) return { text: 'Expira', bg: '#f97316' } as const;
  if (p.stock_quantity <= p.minimum_stock) return { text: 'Baixo stock', bg: '#eab308' } as const;
  return null;
}

/** Image band height: ~120px tablet; slightly shorter on phone grid cells. */
const IMAGE_BAND_TABLET = 120;
const IMAGE_BAND_COMPACT = 100;
const IMAGE_MAX_W = 150;
const IMAGE_MAX_H = 110;

export const PosProductGridCard = memo(function PosProductGridCard({
  product,
  onPress,
  compact,
}: {
  product: Product;
  onPress: (p: Product) => void;
  compact?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const badge = productBadge(product);
  const thumbRaw = (product.thumbnail_url ?? '').trim();
  const uri = thumbRaw && !imgFailed ? resolveApiMediaUrl(thumbRaw) : null;

  useEffect(() => {
    setImgFailed(false);
  }, [thumbRaw]);

  const imageBandHeight = compact ? IMAGE_BAND_COMPACT : IMAGE_BAND_TABLET;
  const dosage = (product.dosage || '').trim();
  const form = (product.form || '').trim();
  const shelf = shelfLine(product);
  const stockN = Math.max(0, Math.floor(Number(product.stock_quantity) || 0));
  const handleImgError = useCallback(() => setImgFailed(true), []);

  return (
    <Pressable
      style={({ pressed }) => [
        compact ? styles.cardMobile : styles.card,
        pressed && (compact ? styles.cardPressedMobile : styles.cardPressed),
        badge ? styles.cardBorderSoft : null,
      ]}
      onPress={() => onPress(product)}
      accessible
      accessibilityRole="button">
      <View style={[styles.mediaWrap, { height: imageBandHeight }]}>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={styles.badgeText}>{badge.text}</Text>
          </View>
        ) : null}
        <View style={styles.mediaInner}>
          {uri ? (
            <Image
              key={uri}
              source={{ uri }}
              style={styles.mediaImage}
              resizeMode="contain"
              onError={handleImgError}
            />
          ) : (
            <View style={styles.mediaPlaceholder} />
          )}
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.bodyTexts}>
          <Text style={styles.name} numberOfLines={compact ? 2 : 2} ellipsizeMode="tail">
            {product.name}
          </Text>
          {dosage.length > 0 ? (
            <Text style={styles.dosage} numberOfLines={1}>
              {dosage}
            </Text>
          ) : null}
          {form.length > 0 ? (
            <Text style={styles.sub} numberOfLines={1} ellipsizeMode="tail">
              {form}
            </Text>
          ) : null}
          <Text style={styles.sub} numberOfLines={1} ellipsizeMode="tail">
            {shelf}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {`${formatCurrency(Number(product.selling_price))} · Stock ${stockN}`}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 248,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: '#ffffff',
    margin: 3,
    overflow: 'hidden',
  },
  cardMobile: {
    flex: 0,
    width: '100%',
    minHeight: 228,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: '#ffffff',
    margin: 0,
    overflow: 'hidden',
  },
  cardBorderSoft: {
    borderColor: '#e5e7eb',
  },
  cardPressed: {
    backgroundColor: '#f9fafb',
  },
  cardPressedMobile: {
    backgroundColor: '#f9fafb',
  },
  mediaWrap: {
    width: '100%',
    backgroundColor: '#f1f5f9',
    position: 'relative',
  },
  mediaInner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  mediaImage: {
    width: IMAGE_MAX_W,
    height: IMAGE_MAX_H,
    maxWidth: '100%',
    maxHeight: '100%',
  },
  mediaPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
  },
  badge: {
    position: 'absolute',
    top: 4,
    left: 4,
    zIndex: 2,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 11,
  },
  body: {
    flex: 1,
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    minHeight: 0,
    justifyContent: 'space-between',
  },
  bodyTexts: {
    gap: 3,
    flexShrink: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    flexShrink: 1,
  },
  dosage: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f766e',
  },
  sub: {
    fontSize: 10,
    lineHeight: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
});
