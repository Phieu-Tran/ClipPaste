import { useEffect, useState } from 'react';

const INTERFACE_THEME_CLASSES = [
  'theme-default',
  'theme-glass',
  'theme-graphite',
  'theme-ember',
  'theme-mint',
  'theme-mono',
  'theme-aurora',
  'theme-cobalt',
  'theme-rose',
  'theme-solar',
  'theme-forest',
  'theme-circuit',
];
const FONT_CLASSES = ['font-system', 'font-rounded', 'font-mono-ui', 'font-readable'];
const DENSITY_CLASSES = ['density-comfortable', 'density-compact'];
const WINDOW_EFFECT_CLASSES = [
  'effect-auto',
  'effect-glow',
  'effect-tabbed',
  'effect-luxe',
  'effect-mica',
  'effect-soft',
  'effect-acrylic',
  'effect-frost',
  'effect-prism',
  'effect-blur',
  'effect-vivid',
  'effect-clear',
  'effect-focus',
  'effect-neon',
];

const INTERFACE_THEME_CLASS_BY_VALUE: Record<string, string> = {
  default: 'theme-default',
  glass: 'theme-glass',
  graphite: 'theme-graphite',
  ember: 'theme-ember',
  mint: 'theme-mint',
  mono: 'theme-mono',
  aurora: 'theme-aurora',
  cobalt: 'theme-cobalt',
  rose: 'theme-rose',
  solar: 'theme-solar',
  forest: 'theme-forest',
  circuit: 'theme-circuit',
};

const FONT_CLASS_BY_VALUE: Record<string, string> = {
  system: 'font-system',
  rounded: 'font-rounded',
  mono: 'font-mono-ui',
  readable: 'font-readable',
};

const DENSITY_CLASS_BY_VALUE: Record<string, string> = {
  comfortable: 'density-comfortable',
  compact: 'density-compact',
};

const WINDOW_EFFECT_CLASS_BY_VALUE: Record<string, string> = {
  best: 'effect-auto',
  best_glow: 'effect-glow',
  mica_alt: 'effect-tabbed',
  mica_alt_luxe: 'effect-luxe',
  mica: 'effect-mica',
  mica_soft: 'effect-soft',
  acrylic: 'effect-acrylic',
  acrylic_frost: 'effect-frost',
  acrylic_tint: 'effect-prism',
  blur: 'effect-blur',
  blur_vivid: 'effect-vivid',
  clear: 'effect-clear',
  clear_focus: 'effect-focus',
  clear_neon: 'effect-neon',
};

export function useTheme(
  theme: string,
  interfaceTheme = 'default',
  fontFamily = 'system',
  uiDensity = 'comfortable',
  windowEffect = 'clear'
) {
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : (theme as 'light' | 'dark')
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    const getSystemTheme = () =>
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    const applyTheme = (t: string) => {
      const currentSystemTheme = getSystemTheme();
      if (t === 'system') {
        root.classList.add(currentSystemTheme);
        setEffectiveTheme(currentSystemTheme);
      } else {
        root.classList.add(t);
        setEffectiveTheme(t as 'light' | 'dark');
      }
    };

    applyTheme(theme);

    root.classList.remove(
      ...INTERFACE_THEME_CLASSES,
      ...FONT_CLASSES,
      ...DENSITY_CLASSES,
      ...WINDOW_EFFECT_CLASSES
    );
    root.classList.add(
      INTERFACE_THEME_CLASS_BY_VALUE[interfaceTheme] ?? INTERFACE_THEME_CLASS_BY_VALUE.default,
      FONT_CLASS_BY_VALUE[fontFamily] ?? FONT_CLASS_BY_VALUE.system,
      DENSITY_CLASS_BY_VALUE[uiDensity] ?? DENSITY_CLASS_BY_VALUE.comfortable,
      WINDOW_EFFECT_CLASS_BY_VALUE[windowEffect] ?? WINDOW_EFFECT_CLASS_BY_VALUE.clear
    );

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        root.classList.remove('light', 'dark');
        applyTheme('system');
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [fontFamily, interfaceTheme, theme, uiDensity, windowEffect]);

  return effectiveTheme;
}
