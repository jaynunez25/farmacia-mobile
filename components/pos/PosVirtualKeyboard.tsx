import { Pressable, StyleSheet, Text, View } from 'react-native';

export type PosKeyboardMode = 'text' | 'numeric';
export type PosKeyboardAction = 'backspace' | 'clear' | 'space' | 'close';

const NUMERIC_ROWS: (string | PosKeyboardAction)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'backspace'],
];

const TEXT_ROWS: (string | PosKeyboardAction)[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

type PosVirtualKeyboardProps = {
  visible: boolean;
  mode: PosKeyboardMode;
  onKeyPress: (key: string | PosKeyboardAction) => void;
  onClose: () => void;
};

function isActionKey(key: string | PosKeyboardAction): key is PosKeyboardAction {
  return key === 'backspace' || key === 'clear' || key === 'space' || key === 'close';
}

function keyLabel(key: string | PosKeyboardAction): string {
  if (key === 'backspace') return '←';
  if (key === 'clear') return 'C';
  if (key === 'space') return 'Espaço';
  if (key === 'close') return 'Fechar';
  return key;
}

export function PosVirtualKeyboard({ visible, mode, onKeyPress, onClose }: PosVirtualKeyboardProps) {
  if (!visible) return null;
  const rows = mode === 'numeric' ? NUMERIC_ROWS : TEXT_ROWS;
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.keyboardShell}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{mode === 'numeric' ? 'Teclado Numérico' : 'Teclado'}</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.keyPressed]}>
            <Text style={styles.closeButtonText}>Fechar</Text>
          </Pressable>
        </View>
        {rows.map((row, rowIndex) => (
          <View style={styles.row} key={`${mode}-${rowIndex}`}>
            {row.map(key => (
              <Pressable
                key={String(key)}
                onPress={() => onKeyPress(key)}
                style={({ pressed }) => [
                  styles.key,
                  isActionKey(key) && styles.keyAction,
                  pressed && styles.keyPressed,
                ]}>
                <Text style={styles.keyText}>{keyLabel(key)}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        <View style={styles.footerRow}>
          {mode === 'text' && (
            <Pressable
              onPress={() => onKeyPress('space')}
              style={({ pressed }) => [styles.footerButton, styles.footerSpace, pressed && styles.keyPressed]}>
              <Text style={styles.keyText}>Espaço</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => onKeyPress('backspace')}
            style={({ pressed }) => [styles.footerButton, styles.keyAction, pressed && styles.keyPressed]}>
            <Text style={styles.keyText}>←</Text>
          </Pressable>
          <Pressable
            onPress={() => onKeyPress('clear')}
            style={({ pressed }) => [styles.footerButton, styles.keyAction, pressed && styles.keyPressed]}>
            <Text style={styles.keyText}>C</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    zIndex: 1000,
  },
  keyboardShell: {
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: '#f8fafc',
    padding: 10,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  closeButton: {
    minHeight: 38,
    minWidth: 88,
    borderWidth: 1,
    borderColor: '#64748b',
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  keyAction: {
    backgroundColor: '#e2e8f0',
    borderColor: '#64748b',
  },
  keyPressed: {
    opacity: 0.85,
  },
  keyText: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0f172a',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  footerButton: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerSpace: {
    flex: 2,
  },
});
