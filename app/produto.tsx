import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/contexts/AuthContext';
import type { Product } from '@/types';
import { api, resolveApiMediaUrl } from '@/services/api';
import { getErrorMessage } from '@/utils/errorMessage';
import { uploadProductPhotoDirect } from '@/utils/productPhotoUpload';
import { isAdminRole, isStockAuditorRole } from '@/utils/roles';

export default function ProdutoDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const canEditProduct = isAdminRole(user?.role);
  const canDeleteProduct = isAdminRole(user?.role) || isStockAuditorRole(user?.role);
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  const loadProduct = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.products.get(Number(id));
      setProduct(data);
      setImageFailed(false);
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  useFocusEffect(
    useCallback(() => {
      if (!id || loading) return;
      void (async () => {
        try {
          const data = await api.products.get(Number(id));
          setProduct(data);
          setImageFailed(false);
        } catch {
          /* mantém estado anterior */
        }
      })();
    }, [id, loading]),
  );

  const imageRaw = product
    ? (product.image_url ?? '').trim() || (product.thumbnail_url ?? '').trim()
    : '';
  const imageUri =
    imageRaw && !imageFailed
      ? `${resolveApiMediaUrl(imageRaw)}?v=${encodeURIComponent(String(product?.updated_at ?? product?.id ?? ''))}`
      : null;

  const handlePhotoFromUri = async (uri: string, mimeType?: string) => {
    if (!product) return;
    setUploadingPhoto(true);
    setPhotoStatus('A enviar para o servidor…');
    try {
      const updated = await uploadProductPhotoDirect(
        product.id,
        uri,
        mimeType ?? 'image/jpeg',
        setPhotoStatus,
      );
      setProduct(updated);
      setImageFailed(false);
      setPhotoStatus(null);
      Alert.alert(
        'Fotografia guardada',
        'Imagem guardada no servidor. Não foi usada IA nem Photoroom.',
      );
    } catch (err) {
      Alert.alert('Não foi possível guardar', getErrorMessage(err));
      setPhotoStatus(null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const pickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Câmara', 'Permissão de câmara necessária para fotografar produtos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await handlePhotoFromUri(asset.uri, asset.mimeType ?? 'image/jpeg');
  };

  const pickLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Galeria', 'Permissão da galeria necessária.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await handlePhotoFromUri(asset.uri, asset.mimeType ?? 'image/jpeg');
  };

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
    try {
      await api.products.delete(Number(id));
      Alert.alert('Produto apagado', 'O produto foi removido ou desactivado no stock.', [
        {
          text: 'OK',
          onPress: () => router.replace('/(tabs)/stock'),
        },
      ]);
    } catch (err) {
      Alert.alert('Não foi possível apagar', getErrorMessage(err));
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

      {loadError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Não foi possível carregar o produto</Text>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      )}

      {!loading && !loadError && product && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.mainRow}>
            <View style={styles.detailsCol}>
              <Text style={styles.title}>{product.name}</Text>
              <Text style={styles.meta}>SKU: {product.sku}</Text>
              {product.barcode && <Text style={styles.meta}>Código: {product.barcode}</Text>}
              <Text style={styles.meta}>
                Prateleira: {product.shelf_stock_quantity ?? 0} · Storage:{' '}
                {product.warehouse_stock_quantity ?? 0} · Total: {product.stock_quantity}
              </Text>
              <Text style={styles.meta}>Stock mínimo (alertas): {product.minimum_stock}</Text>
              {product.documentary_name ? (
                <Text style={styles.meta}>Nome documental: {product.documentary_name}</Text>
              ) : null}
              {product.boxes != null ? <Text style={styles.meta}>Caixas: {product.boxes}</Text> : null}
              {product.blisters != null ? (
                <Text style={styles.meta}>Blisters: {product.blisters}</Text>
              ) : null}
              {product.loose_units != null ? (
                <Text style={styles.meta}>Unidades soltas: {product.loose_units}</Text>
              ) : null}
              {product.notes ? <Text style={styles.meta}>Notas: {product.notes}</Text> : null}
              {product.needs_audit_review ? (
                <Text style={styles.auditBadge}>Precisa revisão de auditoria</Text>
              ) : null}
            </View>

            {canEditProduct ? (
              <View style={styles.photoCol}>
                <Text style={styles.photoLabel}>Fotografia</Text>
                <View style={styles.photoFrame}>
                  {imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
                      style={styles.photoImage}
                      resizeMode="contain"
                      onError={() => setImageFailed(true)}
                    />
                  ) : (
                    <Text style={styles.photoPlaceholder}>Sem foto</Text>
                  )}
                  {uploadingPhoto ? (
                    <View style={styles.photoOverlay}>
                      <ActivityIndicator color="#fff" />
                      {photoStatus ? (
                        <Text style={styles.photoOverlayText}>{photoStatus}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.photoBtn,
                    (pressed || uploadingPhoto) && styles.photoBtnPressed,
                  ]}
                  disabled={uploadingPhoto}
                  onPress={() => void pickLibrary()}>
                  <Text style={styles.photoBtnText}>Carregar fotografia</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.photoBtnSecondary,
                    (pressed || uploadingPhoto) && styles.photoBtnPressed,
                  ]}
                  disabled={uploadingPhoto}
                  onPress={() => void pickCamera()}>
                  <Text style={styles.photoBtnSecondaryText}>Tirar fotografia</Text>
                </Pressable>
                <Text style={styles.photoHint}>
                  Upload directo para o servidor (base de dados). Sem Photoroom, sem IA, sem ChatGPT —
                  usa a imagem que já preparaste.
                </Text>
              </View>
            ) : imageUri ? (
              <View style={styles.photoCol}>
                <Text style={styles.photoLabel}>Fotografia</Text>
                <View style={styles.photoFrame}>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.photoImage}
                    resizeMode="contain"
                    onError={() => setImageFailed(true)}
                  />
                </View>
              </View>
            ) : null}
          </View>

          {canEditProduct || canDeleteProduct ? (
            <View style={styles.actionsRow}>
              {canEditProduct ? (
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={() =>
                    router.push({
                      pathname: '/produto-editar',
                      params: { id: String(product.id) },
                    })
                  }>
                  <Text style={styles.buttonText}>Editar</Text>
                </Pressable>
              ) : null}

              {canDeleteProduct ? (
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
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    marginBottom: 24,
  },
  detailsCol: {
    flex: 1,
    minWidth: 220,
    gap: 4,
  },
  photoCol: {
    width: 200,
    minWidth: 180,
    gap: 10,
  },
  photoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  photoFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#374151',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    gap: 8,
  },
  photoOverlayText: {
    color: '#e5e7eb',
    fontSize: 12,
    textAlign: 'center',
  },
  photoBtn: {
    borderRadius: 10,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    alignItems: 'center',
  },
  photoBtnSecondary: {
    borderRadius: 10,
    backgroundColor: '#1f2937',
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  photoBtnPressed: {
    opacity: 0.85,
  },
  photoBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  photoBtnSecondaryText: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  photoHint: {
    fontSize: 11,
    lineHeight: 16,
    color: '#6b7280',
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
  auditBadge: {
    marginTop: 8,
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '700',
  },
  errorBox: {
    margin: 16,
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
