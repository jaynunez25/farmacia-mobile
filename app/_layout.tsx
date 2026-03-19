import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import LoginScreen from './login';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617' }}>
        <ActivityIndicator size="large" color="#16a34a" />
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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
