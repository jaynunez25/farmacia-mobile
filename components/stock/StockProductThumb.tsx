import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { resolveApiMediaUrl } from '@/services/api';
import type { Product } from '@/types';

type Props = {
  product: Product;
  size?: number;
};

/** Thumbnail for stock list — Railway /products/thumbnails/… */
export function StockProductThumb({ product, size = 84 }: Props) {
  const [failed, setFailed] = useState(false);
  const thumb = (product.thumbnail_url ?? '').trim();
  const image = (product.image_url ?? '').trim();
  // Prefer full image when available — easier to read on stock rows
  const raw = image || thumb;
  const uri = raw && !failed ? resolveApiMediaUrl(raw) : null;

  useEffect(() => {
    setFailed(false);
  }, [raw]);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              transform: [{ scale: 1.28 }],
            },
          ]}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={styles.placeholder}>—</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    backgroundColor: '#ffffff',
  },
  placeholder: {
    color: '#6b7280',
    fontSize: 18,
    fontWeight: '600',
  },
});
