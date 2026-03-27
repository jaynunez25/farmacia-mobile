import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { PharmaosSplashIntro } from '@/components/pharmaos-splash-intro';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import LoginScreen from './login';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const [introDone, setIntroDone] = useState(false);
  const { isLoading, isAuthenticated } = useAuth();

  const handleIntroFinish = useCallback(() => {
    setIntroDone(true);
  }, []);

  if (!introDone) {
    return <PharmaosSplashIntro onFinish={handleIntroFinish} />;
  }

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F8FAFC',
        }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="produtos" options={{ title: 'Produtos' }} />
      <Stack.Screen name="produto" options={{ title: 'Produto' }} />
      <Stack.Screen name="produto-criar" options={{ title: 'Novo produto' }} />
      <Stack.Screen name="produto-editar" options={{ title: 'Editar produto' }} />
      <Stack.Screen name="utilizadores" options={{ title: 'Utilizadores' }} />
      <Stack.Screen name="utilizador-criar" options={{ title: 'Novo utilizador' }} />
      <Stack.Screen name="utilizador-editar" options={{ title: 'Editar utilizador' }} />
      <Stack.Screen name="historico-vendas" options={{ title: 'Histórico de vendas' }} />
      <Stack.Screen name="historico-caixa" options={{ title: 'Histórico de caixa' }} />
      <Stack.Screen name="incidentes" options={{ title: 'Incidentes' }} />
      <Stack.Screen name="relatorios" options={{ title: 'Relatórios' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void SplashScreen.preventAutoHideAsync();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
