export const IMAGE_DELETE_DAY_OPTIONS = [7, 14, 30, 60, 90, 180, 365];
export const CLIP_DELETE_DAY_OPTIONS = [0, 7, 14, 30, 60, 90, 180, 365];
export const MAX_ITEM_OPTIONS = [0, 500, 1000, 2000, 5000, 10000];

export const INTERFACE_THEMES = [
  {
    id: 'default',
    label: 'Default',
    descriptionKey: 'themeDesc.default',
    categoryKey: 'themeCategory.balanced',
    swatches: ['#6d28d9', '#2b2d30', '#171a1e'],
  },
  {
    id: 'glass',
    label: 'Glass',
    descriptionKey: 'themeDesc.glass',
    categoryKey: 'themeCategory.balanced',
    swatches: ['#22d3ee', '#1d4ed8', '#0f172a'],
  },
  {
    id: 'graphite',
    label: 'Graphite',
    descriptionKey: 'themeDesc.graphite',
    categoryKey: 'themeCategory.focus',
    swatches: ['#10b981', '#2f3338', '#121417'],
  },
  {
    id: 'ember',
    label: 'Ember',
    descriptionKey: 'themeDesc.ember',
    categoryKey: 'themeCategory.balanced',
    swatches: ['#f97316', '#3a2a25', '#151821'],
  },
  {
    id: 'mint',
    label: 'Mint',
    descriptionKey: 'themeDesc.mint',
    categoryKey: 'themeCategory.balanced',
    swatches: ['#14b8a6', '#12342f', '#0b1720'],
  },
  {
    id: 'mono',
    label: 'Mono',
    descriptionKey: 'themeDesc.mono',
    categoryKey: 'themeCategory.focus',
    swatches: ['#3b82f6', '#2a2d31', '#111318'],
  },
  {
    id: 'aurora',
    label: 'Aurora',
    descriptionKey: 'themeDesc.aurora',
    categoryKey: 'themeCategory.balanced',
    swatches: ['#06b6d4', '#8b5cf6', '#10202a'],
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    descriptionKey: 'themeDesc.cobalt',
    categoryKey: 'themeCategory.balanced',
    swatches: ['#2563eb', '#f59e0b', '#0f172a'],
  },
  {
    id: 'rose',
    label: 'Rose',
    descriptionKey: 'themeDesc.rose',
    categoryKey: 'themeCategory.balanced',
    swatches: ['#e11d48', '#fb7185', '#21141a'],
  },
  {
    id: 'solar',
    label: 'Solar',
    descriptionKey: 'themeDesc.solar',
    categoryKey: 'themeCategory.balanced',
    swatches: ['#ca8a04', '#0ea5e9', '#1c1917'],
  },
  {
    id: 'forest',
    label: 'Forest',
    descriptionKey: 'themeDesc.forest',
    categoryKey: 'themeCategory.focus',
    swatches: ['#16a34a', '#84cc16', '#111b14'],
  },
  {
    id: 'circuit',
    label: 'Circuit',
    descriptionKey: 'themeDesc.circuit',
    categoryKey: 'themeCategory.focus',
    swatches: ['#84cc16', '#22c55e', '#08110c'],
  },
  {
    id: 'cyber',
    label: 'Cyber',
    descriptionKey: 'themeDesc.cyber',
    categoryKey: 'themeCategory.colorful',
    swatches: ['#22d3ee', '#f472b6', '#0b1020'],
  },
  {
    id: 'synthwave',
    label: 'Synth',
    descriptionKey: 'themeDesc.synthwave',
    categoryKey: 'themeCategory.colorful',
    swatches: ['#a855f7', '#fb7185', '#f59e0b'],
  },
  {
    id: 'candy',
    label: 'Candy',
    descriptionKey: 'themeDesc.candy',
    categoryKey: 'themeCategory.colorful',
    swatches: ['#ec4899', '#5eead4', '#fdf2f8'],
  },
  {
    id: 'ocean',
    label: 'Ocean',
    descriptionKey: 'themeDesc.ocean',
    categoryKey: 'themeCategory.colorful',
    swatches: ['#0284c7', '#2dd4bf', '#082f49'],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    descriptionKey: 'themeDesc.sunset',
    categoryKey: 'themeCategory.colorful',
    swatches: ['#f97316', '#e11d48', '#6d28d9'],
  },
  {
    id: 'royal',
    label: 'Royal',
    descriptionKey: 'themeDesc.royal',
    categoryKey: 'themeCategory.colorful',
    swatches: ['#2563eb', '#facc15', '#312e81'],
  },
  {
    id: 'ice',
    label: 'Ice',
    descriptionKey: 'themeDesc.ice',
    categoryKey: 'themeCategory.colorful',
    swatches: ['#38bdf8', '#818cf8', '#f8fafc'],
  },
  {
    id: 'bloom',
    label: 'Bloom',
    descriptionKey: 'themeDesc.bloom',
    categoryKey: 'themeCategory.colorful',
    swatches: ['#d946ef', '#22c55e', '#fef08a'],
  },
] as const;

export const QUICK_THEME_IDS = ['default', 'glass', 'aurora', 'cyber', 'sunset', 'candy'] as const;

export const THEME_GROUPS = [
  {
    labelKey: 'themeCategory.balanced',
    themeIds: ['default', 'glass', 'ember', 'mint', 'aurora', 'cobalt', 'rose', 'solar'],
  },
  {
    labelKey: 'themeCategory.colorful',
    themeIds: ['cyber', 'synthwave', 'candy', 'ocean', 'sunset', 'royal', 'ice', 'bloom'],
  },
  {
    labelKey: 'themeCategory.focus',
    themeIds: ['graphite', 'mono', 'forest', 'circuit'],
  },
] as const;

export type InterfaceThemeOption = (typeof INTERFACE_THEMES)[number];

export function ThemeMiniPreview({
  themeOption,
  compact = false,
}: {
  themeOption: InterfaceThemeOption;
  compact?: boolean;
}) {
  const [primary, accent, surface] = themeOption.swatches;
  return (
    <span
      className={`block overflow-hidden rounded-md border border-border/60 ring-1 ring-white/5 ${
        compact ? 'h-10' : 'h-[76px]'
      }`}
      style={{
        background: `linear-gradient(135deg, ${surface}, ${accent}33 58%, ${primary}22)`,
      }}
      aria-hidden="true"
    >
      <span
        className={`flex items-center gap-1 border-b px-1.5 ${compact ? 'h-3' : 'h-5'}`}
        style={{ borderColor: `${primary}44`, backgroundColor: `${surface}cc` }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: primary }} />
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        <span
          className="ml-auto h-1 w-5 rounded-full"
          style={{ backgroundColor: `${primary}88` }}
        />
      </span>
      <span
        className={`grid flex-1 gap-1 ${compact ? 'grid-cols-[0.7fr_1fr] p-1' : 'grid-cols-[0.64fr_1fr] p-1.5'}`}
      >
        <span className="space-y-1">
          <span className="block h-1.5 rounded-full" style={{ backgroundColor: `${primary}dd` }} />
          <span
            className="block h-1.5 w-3/4 rounded-full"
            style={{ backgroundColor: `${accent}aa` }}
          />
          {!compact && (
            <span className="grid grid-cols-3 gap-0.5 pt-1">
              {themeOption.swatches.map((swatch) => (
                <span
                  key={`${themeOption.id}-preview-${swatch}`}
                  className="h-3 rounded-sm"
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </span>
          )}
        </span>
        <span className="space-y-1">
          <span
            className={`${compact ? 'h-3' : 'h-5'} block rounded border`}
            style={{ borderColor: `${primary}66`, backgroundColor: `${primary}22` }}
          />
          <span
            className={`${compact ? 'h-3' : 'h-5'} block rounded border`}
            style={{ borderColor: `${accent}55`, backgroundColor: `${accent}1f` }}
          />
        </span>
      </span>
    </span>
  );
}

export const FONT_OPTIONS = [
  { id: 'system', labelKey: 'font.system' },
  { id: 'rounded', labelKey: 'font.rounded' },
  { id: 'mono', labelKey: 'font.mono' },
  { id: 'readable', labelKey: 'font.readable' },
] as const;

export const DENSITY_OPTIONS = [
  { id: 'comfortable', labelKey: 'density.comfortable' },
  { id: 'compact', labelKey: 'density.compact' },
] as const;

export const WINDOW_EFFECTS = [
  {
    id: 'best',
    label: 'Auto',
    descriptionKey: 'effectDesc.best',
    nativeEffect: 'best',
    preview: 'from-primary/80 via-cyan-300/40 to-white/10',
  },
  {
    id: 'best_glow',
    label: 'Auto Glow',
    descriptionKey: 'effectDesc.best_glow',
    nativeEffect: 'best',
    preview: 'from-violet-400/80 via-cyan-300/45 to-emerald-300/25',
  },
  {
    id: 'mica_alt',
    label: 'Tabbed',
    descriptionKey: 'effectDesc.mica_alt',
    nativeEffect: 'mica_alt',
    preview: 'from-sky-400/70 via-cyan-300/35 to-white/10',
  },
  {
    id: 'mica_alt_luxe',
    label: 'Luxe',
    descriptionKey: 'effectDesc.mica_alt_luxe',
    nativeEffect: 'mica_alt',
    preview: 'from-amber-300/75 via-slate-200/25 to-violet-400/25',
  },
  {
    id: 'mica',
    label: 'Mica',
    descriptionKey: 'effectDesc.mica',
    nativeEffect: 'mica',
    preview: 'from-indigo-400/65 via-violet-400/30 to-white/10',
  },
  {
    id: 'mica_soft',
    label: 'Soft',
    descriptionKey: 'effectDesc.mica_soft',
    nativeEffect: 'mica',
    preview: 'from-slate-300/50 via-emerald-300/25 to-blue-300/20',
  },
  {
    id: 'acrylic',
    label: 'Acrylic',
    descriptionKey: 'effectDesc.acrylic',
    nativeEffect: 'acrylic',
    preview: 'from-teal-300/70 via-blue-400/30 to-white/10',
  },
  {
    id: 'acrylic_frost',
    label: 'Frost',
    descriptionKey: 'effectDesc.acrylic_frost',
    nativeEffect: 'acrylic',
    preview: 'from-white/70 via-cyan-200/35 to-slate-400/20',
  },
  {
    id: 'acrylic_tint',
    label: 'Prism',
    descriptionKey: 'effectDesc.acrylic_tint',
    nativeEffect: 'acrylic',
    preview: 'from-cyan-300/70 via-fuchsia-300/35 to-amber-200/25',
  },
  {
    id: 'blur',
    label: 'Blur',
    descriptionKey: 'effectDesc.blur',
    nativeEffect: 'blur',
    preview: 'from-slate-300/60 via-slate-500/30 to-white/10',
  },
  {
    id: 'blur_vivid',
    label: 'Vivid',
    descriptionKey: 'effectDesc.blur_vivid',
    nativeEffect: 'blur',
    preview: 'from-blue-400/75 via-emerald-300/35 to-rose-300/20',
  },
  {
    id: 'clear',
    label: 'Clear',
    descriptionKey: 'effectDesc.clear',
    nativeEffect: 'clear',
    preview: 'from-zinc-500/30 via-zinc-300/20 to-zinc-950/10',
  },
  {
    id: 'clear_focus',
    label: 'Focus',
    descriptionKey: 'effectDesc.clear_focus',
    nativeEffect: 'clear',
    preview: 'from-zinc-200/70 via-slate-500/30 to-primary/25',
  },
  {
    id: 'clear_neon',
    label: 'Neon',
    descriptionKey: 'effectDesc.clear_neon',
    nativeEffect: 'clear',
    preview: 'from-lime-300/75 via-emerald-400/35 to-zinc-950/30',
  },
] as const;
