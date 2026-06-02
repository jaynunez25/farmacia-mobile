import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '@/contexts/AuthContext';
import { createCaptureJobFromUri, getCaptureJob, resolveApiMediaUrl } from '@/services/aiCapture';
import { api } from '@/services/api';
import { saveCaptureDraft } from '@/utils/captureDraft';
import { getErrorMessage } from '@/utils/errorMessage';
import { mapCaptureJobToFormDraft } from '@/utils/mapCaptureJobToForm';
import { applyCaptureJobImagesToProduct } from '@/utils/productPhotoFromCapture';
import { isAdminRole } from '@/utils/roles';

type Step = 'pick' | 'processing';

export default function ProdutoCapturaScreen() {
  const router = useRouter();
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const existingProductId =
    productId && /^\d+$/.test(productId) ? Number(productId) : null;
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('pick');
  const [error, setError] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [processedThumbUri, setProcessedThumbUri] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (user && !isAdminRole(user.role)) {
      router.replace('/(tabs)/stock');
    }
  }, [user, router]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const finishWithJob = async (jobId: number) => {
    setStatusText('A analisar embalagem…');
    const poll = async () => {
      try {
        const job = await getCaptureJob(jobId);
        if (job.status === 'processing') {
          setStatusText('A preparar imagem e a ler texto…');
        }
        if (job.status === 'completed') {
          stopPoll();
          const formPartial = mapCaptureJobToFormDraft(job);
          await saveCaptureDraft({
            form: formPartial,
            needsReview: job.needs_review,
            overallConfidence: job.overall_confidence,
            ocrPreview: job.ocr_raw_text,
            createdAt: new Date().toISOString(),
            captureJobId: job.id,
          });
          if (existingProductId != null) {
            try {
              await applyCaptureJobImagesToProduct(job, existingProductId);
            } catch (e) {
              setError(getErrorMessage(e));
              setStep('pick');
              return;
            }
            router.replace({
              pathname: '/produto-editar',
              params: { id: String(existingProductId) },
            });
            return;
          }
          router.replace('/produto-criar');
          return;
        }
        if (job.status === 'failed') {
          stopPoll();
          setError(job.error_message || 'Processamento falhou.');
          setStep('pick');
        }
      } catch (e) {
        stopPoll();
        setError(getErrorMessage(e));
        setStep('pick');
      }
    };
    void poll();
    pollRef.current = setInterval(() => void poll(), 700);
  };

  const processUri = async (uri: string, mimeType?: string) => {
    setError(null);
    setPreviewUri(uri);
    setProcessedThumbUri(null);
    setStep('processing');
    setStatusText('A enviar imagem…');
    try {
      const { job_id } = await createCaptureJobFromUri(uri, mimeType ?? 'image/jpeg');
      setStatusText('A preparar imagem POS (fundo branco, WEBP) e a ler embalagem…');
      await finishWithJob(job_id);
    } catch (e) {
      setError(getErrorMessage(e));
      setStep('pick');
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
    await processUri(asset.uri, asset.mimeType ?? 'image/jpeg');
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
    await processUri(asset.uri, asset.mimeType ?? 'image/jpeg');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Captura AI</Text>
        <Text style={styles.subtitle}>
          {existingProductId != null
            ? 'Fotografe a embalagem para actualizar a foto POS e sugerir nome, forma e notas no ecrã de edição.'
            : 'Fotografe a embalagem. A IA sugere nome, forma e imagem — preços e stock preenches no formulário habitual (igual a «Novo produto»).'}
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {step === 'pick' && (
          <View style={styles.actions}>
            <Pressable style={styles.primaryBtn} onPress={() => void pickCamera()}>
              <Text style={styles.primaryBtnText}>Tirar fotografia</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => void pickLibrary()}>
              <Text style={styles.secondaryBtnText}>Escolher da galeria</Text>
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={() => router.push('/produto-criar')}>
              <Text style={styles.linkBtnText}>Criar produto manualmente</Text>
            </Pressable>
          </View>
        )}

        {step === 'processing' && (
          <View style={styles.processing}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.processingText}>{statusText}</Text>
            {processedThumbUri ? (
              <>
                <Text style={styles.processingHint}>Imagem POS (300×300 WEBP)</Text>
                <Image
                  source={{ uri: processedThumbUri }}
                  style={styles.processedThumb}
                  resizeMode="contain"
                />
              </>
            ) : previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="contain" />
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, color: '#64748B', marginBottom: 20 },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#991B1B', fontSize: 14 },
  actions: { gap: 12 },
  primaryBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryBtnText: { color: '#0F172A', fontSize: 16, fontWeight: '600' },
  linkBtn: { paddingVertical: 12, alignItems: 'center' },
  linkBtnText: { color: '#2563EB', fontSize: 15 },
  processing: { alignItems: 'center', gap: 16, paddingTop: 24 },
  processingText: { color: '#64748B', fontSize: 15, textAlign: 'center' },
  processingHint: { color: '#0F172A', fontSize: 13, fontWeight: '600' },
  processedThumb: {
    width: 300,
    height: 300,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  preview: { width: 220, height: 220, borderRadius: 12, backgroundColor: '#fff' },
});
