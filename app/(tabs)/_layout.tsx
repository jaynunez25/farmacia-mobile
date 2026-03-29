import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { normalizeAppRole } from '@/utils/roles';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const r = user?.role != null ? normalizeAppRole(user.role) : null;
  /** Caixa + Vendas: admin e caixa (não stock_auditor). */
  const showCaixaVendas = r == null || r === 'admin' || r === 'cashier';
  /** Ponto: apenas auditor de stock (geolocalização). Admin e caixa não usam ponto. */
  const showPonto = r === 'stock_auditor';
  const showRelatoriosTab = r == null || r === 'admin' || r === 'stock_auditor';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="speedometer" color={color} />,
        }}
      />
      <Tabs.Screen
        name="ponto"
        options={{
          title: 'Ponto',
          href: showPonto ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="clock.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="caixa"
        options={{
          title: 'Caixa',
          href: showCaixaVendas ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="banknote.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="vendas"
        options={{
          title: 'Vendas',
          href: showCaixaVendas ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="cart.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Stock',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="shippingbox.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="alertas"
        options={{
          title: 'Alertas',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="bell.badge.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="relatorios"
        options={{
          title: 'Relatórios',
          href: showRelatoriosTab ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="doc.text.magnifyingglass" color={color} />,
        }}
      />
    </Tabs>
  );
}
