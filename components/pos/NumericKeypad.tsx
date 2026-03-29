import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

const ROWS: NumericKeypadAction[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'backspace'],
];

export type NumericKeypadAction = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'clear' | 'backspace';

export function applyNumericKeypadKey(
  current: string,
  action: NumericKeypadAction,
  maxLength?: number,
): string {
  if (action === 'clear') {
    return '';
  }
  if (action === 'backspace') {
    return current.slice(0, -1);
  }
  const next = current + action;
  if (maxLength != null && next.length > maxLength) {
    return current;
  }
  return next;
}

type NumericKeypadProps = {
  onKeyPress: (key: NumericKeypadAction) => void;
  disabled?: boolean;
  variant?: 'default' | 'compact';
  style?: StyleProp<ViewStyle>;
};

const LABELS: Record<NumericKeypadAction, string> = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  clear: 'C',
  backspace: '←',
};

export function NumericKeypad({ onKeyPress, disabled = false, variant = 'default', style }: NumericKeypadProps) {
  const s = variant === 'compact' ? stylesCompact : stylesDefault;
  return (
    <View style={[s.wrap, style]}>
      {ROWS.map((row, ri) => (
        <View key={ri} style={s.row}>
          {row.map(key => (
            <Pressable
              key={key}
              disabled={disabled}
              onPress={() => onKeyPress(key)}
              style={({ pressed }) => [
                s.key,
                (key === 'clear' || key === 'backspace') && s.keyAlt,
                disabled && s.keyDisabled,
                !disabled && pressed && s.keyPressed,
              ]}
              accessibilityLabel={
                key === 'clear' ? 'Limpar' : key === 'backspace' ? 'Apagar último dígito' : `Dígito ${key}`
              }
              accessibilityRole="button">
              <Text style={[s.keyText, disabled && s.keyTextDisabled]}>{LABELS[key]}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

type ReadOnlyNumericReadoutProps = {
  value: string;
  masked?: boolean;
  placeholder?: string;
  placeholderTextColor?: string;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function ReadOnlyNumericReadout({
  value,
  masked,
  placeholder = ' ',
  placeholderTextColor,
  editable = true,
  style,
  textStyle,
}: ReadOnlyNumericReadoutProps) {
  const display = masked ? (value.length > 0 ? '\u2022'.repeat(value.length) : '') : value;
  const showPlaceholder = !display;
  return (
    <View
      style={[readoutStyles.box, !editable && readoutStyles.boxMuted, style]}
      accessibilityElementsHidden={masked}
      importantForAccessibility={masked ? 'no-hide-descendants' : 'auto'}>
      <Text
        style={[
          readoutStyles.text,
          !editable && readoutStyles.textMuted,
          textStyle,
          showPlaceholder && placeholderTextColor ? { color: placeholderTextColor } : null,
        ]}
        numberOfLines={1}
        selectable={false}>
        {showPlaceholder ? placeholder : display}
      </Text>
    </View>
  );
}

const readoutStyles = StyleSheet.create({
  box: {
    width: '100%',
    minHeight: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  boxMuted: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  textMuted: {
    color: '#9ca3af',
  },
});

const stylesDefault = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 10,
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  key: {
    flex: 1,
    minHeight: 54,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyAlt: {
    backgroundColor: '#e2e8f0',
    borderColor: '#64748b',
  },
  keyPressed: {
    opacity: 0.92,
  },
  keyDisabled: {
    opacity: 0.45,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  keyTextDisabled: {
    color: '#64748b',
  },
});

const stylesCompact = StyleSheet.create({
  wrap: {
    width: '100%',
    gap: 6,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  key: {
    flex: 1,
    minHeight: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyAlt: {
    backgroundColor: '#e2e8f0',
    borderColor: '#64748b',
  },
  keyPressed: {
    opacity: 0.92,
  },
  keyDisabled: {
    opacity: 0.45,
  },
  keyText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  keyTextDisabled: {
    color: '#64748b',
  },
});
