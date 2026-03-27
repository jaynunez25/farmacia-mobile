/**
 * Pharmaos intro splash — single full-bleed animated image (no wrapper “card”).
 * Logo is drawn with resizeMode "contain" as large as possible on the screen.
 *
 * If you still see a light rectangle: it is almost certainly baked into the PNG asset.
 * Use a transparent-background PNG (only the mark + wordmark, no canvas block).
 *
 * Tuning:
 * - SPLASH_TOTAL_DURATION_MS — total time splash stays visible before handoff (~1.5–2s)
 * - SPLASH_BACKGROUND — letterbox / screen fill behind the contained bitmap
 * - BREATH_SCALE_PEAK — pulse intensity (how far past 1.0 the logo scales)
 * - BREATH_IN_MS / BREATH_OUT_MS — breath speed (longer = slower)
 * - BREATH_DELAY_MS — calm hold after entry before the end breath starts
 */
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

/** Total time the splash stays visible before handing off to the app flow. */
export const SPLASH_TOTAL_DURATION_MS = 2000;

/** Flat full-screen fill (same pixel behind letterboxing as the “page” background). */
export const SPLASH_BACKGROUND = '#FFFFFF';

const LOGO_SOURCE = require('../assets/images/pharmaos-logo.png');

const FADE_IN_MS = 520;
const SCALE_SPRING = { friction: 9, tension: 72 } as const;

/** Subtle end-of-intro breath: peak scale (keep ≤ ~1.06). */
const BREATH_SCALE_PEAK = 1.05;
/** Pause after fade+spring before the slow breath (positions pulse near the end). */
const BREATH_DELAY_MS = 400;
/** Slow ease in/out for premium feel (sinusoidal, not snappy). */
const EASE_BREATH = Easing.inOut(Easing.sin);
/** Duration to scale 1 → peak (ms). */
const BREATH_IN_MS = 450;
/** Duration to scale peak → 1 (ms). */
const BREATH_OUT_MS = 450;

type Props = {
  onFinish: () => void;
};

export function PharmaosSplashIntro({ onFinish }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const finishedRef = useRef(false);

  useLayoutEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_IN_MS,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          ...SCALE_SPRING,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(BREATH_DELAY_MS),
      Animated.timing(scale, {
        toValue: BREATH_SCALE_PEAK,
        duration: BREATH_IN_MS,
        easing: EASE_BREATH,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: BREATH_OUT_MS,
        easing: EASE_BREATH,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    const timer = setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish();
    }, SPLASH_TOTAL_DURATION_MS);

    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [onFinish, opacity, scale]);

  return (
    <Animated.Image
      source={LOGO_SOURCE}
      style={[styles.hero, { opacity, transform: [{ scale }] }]}
      resizeMode="contain"
      accessible
      accessibilityLabel="Pharmaos"
      accessibilityRole="image"
    />
  );
}

const styles = StyleSheet.create({
  hero: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    backgroundColor: SPLASH_BACKGROUND,
  },
});
