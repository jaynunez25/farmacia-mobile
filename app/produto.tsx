import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/types';
import { api } from '@/services/api';
import { getErrorMessage } from '@/utils/errorMessage';
import { isAdminRole } from '@/utils/roles';

export default function ProdutoDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const canManageProducts = isAdminRole(user?.role);
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await api.products.get(Number(id));
        if (!isMounted) return;
        setProduct(data);
      } catch (err) {
        if (!isMounted) return;
        setError(getErrorMessage(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [id]);

  const confirmDelete = () => {
    if (!id) return;
    Alert.alert(
      'Apagar produto',
      'Tens a certeza que queres apagar este produto? Esta acção não pode ser anulada.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: handleDelete,
        },
      ],
    );
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    setError(null);
    try {
      await api.products.delete(Number(id));
      Alert.alert('Produto apagado', 'O produto foi removido do stock.', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/stock'),
        },
      ]);
      router.replace('/(tabs)/stock');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Não foi possível carregar o produto</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && product && (
        <>
          <View style={styles.content}>
            <Text style={styles.title}>{product.name}</Text>
            <Text style={styles.meta}>SKU: {product.sku}</Text>
            {product.barcode && <Text style={styles.meta}>Código: {product.barcode}</Text>}
            <Text style={styles.meta}>Stock actual: {product.stock_quantity}</Text>
            <Text style={styles.meta}>Stock mínimo: {product.minimum_stock}</Text>
          </View>

          {canManageProducts ? (
            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: '/produto-editar',
                    params: { id: String(product.id) },
                  })
                }>
                <Text style={styles.buttonText}>Editar</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.buttonDelete,
                  (pressed || deleting) && styles.buttonDeletePressed,
                ]}
                disabled={deleting}
                onPress={confirmDelete}>
                <Text style={styles.buttonDeleteText}>
                  {deleting ? 'A apagar...' : 'Apagar produto'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
    paddingHorizontal: 16,
    paddingTop: 16,
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
    marginBottom: 8,
  },
  meta: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
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
  content: {
    gap: 4,
    marginBottom: 24,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: '#111827',
  },
  buttonText: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDelete: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#7f1d1d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDeletePressed: {
    backgroundColor: '#991b1b',
  },
  buttonDeleteText: {
    color: '#fee2e2',
    fontSize: 15,
    fontWeight: '600',
  },
});

