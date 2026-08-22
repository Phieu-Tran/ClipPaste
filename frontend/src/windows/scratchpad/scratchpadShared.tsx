export type SortMode = 'manual' | 'alpha' | 'recent';

export type ViewMode = 'collapsed' | 'list' | 'paste' | 'edit';

/** Window layouts: side panel, centered modal, or collapsed hover tab. */
export type WindowLayout = 'side' | 'center' | 'collapsed';

export const COLLAPSED_WIDTH = 16;
export const COLLAPSED_HEIGHT = 100;
export const EXPANDED_WIDTH = 320;
export const MODAL_WIDTH = 680;
export const MODAL_HEIGHT = 520;

/**
 * Render simple markdown inline: **bold**, *italic*, `code`, and leading "- " or "* " bullets.
 * Deliberately minimal — no full parser, no links or headings.
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let match: RegExpExecArray | null;
  let last = 0;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const tok = match[0];
    if (tok.startsWith('**') && tok.endsWith('**')) {
      out.push(
        <strong key={`b${key++}`} className="font-semibold text-foreground/90">
          {tok.slice(2, -2)}
        </strong>
      );
    } else if (tok.startsWith('`') && tok.endsWith('`')) {
      out.push(
        <code key={`c${key++}`} className="rounded bg-white/10 px-1 font-mono text-[10px]">
          {tok.slice(1, -1)}
        </code>
      );
    } else {
      out.push(
        <em key={`i${key++}`} className="italic">
          {tok.slice(1, -1)}
        </em>
      );
    }
    last = match.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length > 0 ? out : [text];
}

export function renderMarkdownPreview(content: string): React.ReactNode {
  // Split by newlines, apply bullet formatting per line
  const lines = content.split('\n');
  return lines.map((line, idx) => {
    const bullet = /^\s*[-*]\s+/.exec(line);
    if (bullet) {
      const rest = line.slice(bullet[0].length);
      return (
        <span key={idx} className="block">
          <span className="text-primary/70">• </span>
          {renderInlineMarkdown(rest)}
        </span>
      );
    }
    return (
      <span key={idx} className="block">
        {renderInlineMarkdown(line)}
      </span>
    );
  });
}

export const NOTE_COLORS: { key: string; dot: string; rgb: string }[] = [
  { key: 'red', dot: 'bg-red-400', rgb: '248,113,113' },
  { key: 'orange', dot: 'bg-orange-400', rgb: '251,146,60' },
  { key: 'amber', dot: 'bg-amber-400', rgb: '251,191,36' },
  { key: 'green', dot: 'bg-green-400', rgb: '74,222,128' },
  { key: 'teal', dot: 'bg-teal-400', rgb: '45,212,191' },
  { key: 'blue', dot: 'bg-blue-400', rgb: '96,165,250' },
  { key: 'violet', dot: 'bg-violet-400', rgb: '167,139,250' },
  { key: 'pink', dot: 'bg-pink-400', rgb: '244,114,182' },
];

export function getNoteColorStyle(color: string | null): React.CSSProperties {
  if (!color) return {};
  const c = NOTE_COLORS.find((n) => n.key === color);
  if (!c) return {};
  return {
    background: `linear-gradient(135deg, rgba(${c.rgb},0.12), rgba(${c.rgb},0.04))`,
    borderLeft: `5px solid rgba(${c.rgb},0.7)`,
  };
}
