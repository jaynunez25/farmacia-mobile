import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuração única para web (Vercel), Expo Go (dev) e Play Store (EAS).
 * Produção Android: EXPO_PUBLIC_API_URL vem do perfil `production` em eas.json.
 */
const PRODUCTION_API_URL = 'https://farmacia-stock-production.up.railway.app';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Pharmaos',
  slug: 'farmacia-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'farmaciamobile',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.farmacianunes.mobile',
  },
  android: {
    package: 'com.farmacianunes.mobile',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#2563EB',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    edgeToEdgeEnabled: true,
    permissions: ['android.permission.CAMERA', 'android.permission.INTERNET'],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-image-picker',
      {
        cameraPermission: 'Permitir fotografar embalagens de produtos para o inventário.',
        photosPermission: 'Permitir escolher fotos de produtos da galeria.',
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/pharmaos-logo.png',
        imageWidth: 320,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
        dark: { backgroundColor: '#ffffff' },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'dfdacc2d-385a-4348-a036-030b81c52879',
    },
    // Documentação / debug; a app usa process.env.EXPO_PUBLIC_API_URL em runtime
    productionApiUrl: process.env.EXPO_PUBLIC_API_URL?.trim() || PRODUCTION_API_URL,
  },
});
