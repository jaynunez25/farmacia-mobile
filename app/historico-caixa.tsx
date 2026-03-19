import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HistoricoCaixaScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Histórico de caixa</ThemedText>
        <ThemedText>Fechos e movimentos de caixa anteriores.</ThemedText>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">Registos</ThemedText>
        <ThemedText>Nenhum fecho de caixa registado.</ThemedText>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  section: {
    gap: 8,
  },
});

