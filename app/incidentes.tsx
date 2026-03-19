import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function IncidentesScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">Incidentes</ThemedText>
        <ThemedText>Registo de ocorrências e não conformidades.</ThemedText>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">Incidentes recentes</ThemedText>
        <ThemedText>Sem incidentes registados.</ThemedText>
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

