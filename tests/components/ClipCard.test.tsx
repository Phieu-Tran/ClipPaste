import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipCard } from '@/components/ClipCard';
import type { ClipboardItem } from '@/types';

const makeClip = (overrides: Partial<ClipboardItem> = {}): ClipboardItem => ({
  id: '1',
  clip_type: 'text',
  content: 'Hello World',
  preview: 'Hello World',
  folder_id: null,
  created_at: '2024-01-01T00:00:00Z',
  source_app: 'VS Code',
  source_icon: null,
  metadata: null,
  is_pinned: false,
  subtype: null,
  note: null,
  paste_count: 0,
  is_sensitive: false,
  ...overrides,
});

describe('ClipCard', () => {
  const defaultProps = {
    clip: makeClip(),
    isSelected: false,
    onSelect: vi.fn(),
    onPaste: vi.fn(),
    onCopy: vi.fn(),
    onPin: vi.fn(),
  };

  it('renders text content', () => {
    render(<ClipCard {...defaultProps} />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('shows source app name in header', () => {
    render(<ClipCard {...defaultProps} />);
    expect(screen.getByText('VS Code')).toBeInTheDocument();
  });

  it('shows clip_type when no source_app', () => {
    const clip = makeClip({ source_app: null });
    render(<ClipCard {...defaultProps} clip={clip} />);
    expect(screen.getByText('TEXT')).toBeInTheDocument();
  });

  it('calls onSelect on click', () => {
    const onSelect = vi.fn();
    render(<ClipCard {...defaultProps} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Hello World').closest('[data-clip-id]')!.querySelector('[draggable]')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onPaste on double click', () => {
    const onPaste = vi.fn();
    render(<ClipCard {...defaultProps} onPaste={onPaste} />);
    const card = screen.getByText('Hello World').closest('[data-clip-id]')!.querySelector('[draggable]')!;
    fireEvent.doubleClick(card);
    expect(onPaste).toHaveBeenCalledTimes(1);
  });

  it('shows character count for text clips', () => {
    render(<ClipCard {...defaultProps} />);
    expect(screen.getByText('11 chars')).toBeInTheDocument();
  });

  it('shows image size from metadata for image clips', () => {
    const clip = makeClip({
      clip_type: 'image',
      content: 'C:\\Users\\test\\images\\abc123.png',
      metadata: JSON.stringify({ width: 100, height: 100, format: 'png', size_bytes: 5120 }),
    });
    render(<ClipCard {...defaultProps} clip={clip} />);
    expect(screen.getByText('5KB')).toBeInTheDocument();
  });

  it('renders image element for image clips with asset URL', () => {
    const clip = makeClip({
      clip_type: 'image',
      content: 'C:\\Users\\test\\images\\abc123.png',
    });
    render(<ClipCard {...defaultProps} clip={clip} />);
    const img = screen.getByRole('img', { name: 'Clipboard Image' });
    expect(img).toBeInTheDocument();
    // Uses convertFileSrc() which produces asset://localhost/... URL
    expect(img.getAttribute('src')).toContain('asset://');
  });

  it('truncates long text content to PREVIEW_CHAR_LIMIT', () => {
    const longContent = 'A'.repeat(500);
    const clip = makeClip({ content: longContent });
    const { container } = render(<ClipCard {...defaultProps} clip={clip} />);
    // ClipCard uses substring(0, PREVIEW_CHAR_LIMIT=300)
    const span = container.querySelector('pre span');
    expect(span?.textContent?.length).toBe(300);
  });

  it('has data-clip-id attribute', () => {
    const { container } = render(<ClipCard {...defaultProps} />);
    const el = container.querySelector('[data-clip-id="1"]');
    expect(el).toBeInTheDocument();
  });

  it('applies selected styling', () => {
    const { container } = render(<ClipCard {...defaultProps} isSelected={true} />);
    const card = container.querySelector('[draggable]');
    expect(card?.className).toContain('ring-blue-500');
  });

  it('shows pin button when showPin is true', () => {
    render(<ClipCard {...defaultProps} showPin={true} />);
    const pinButton = screen.getByTitle('Pin');
    expect(pinButton).toBeInTheDocument();
  });

  it('shows Unpin title when clip is pinned', () => {
    const clip = makeClip({ is_pinned: true });
    render(<ClipCard {...defaultProps} clip={clip} showPin={true} />);
    const pinButton = screen.getByTitle('Unpin');
    expect(pinButton).toBeInTheDocument();
  });

  it('calls onPin when pin button is clicked', () => {
    const onPin = vi.fn();
    render(<ClipCard {...defaultProps} onPin={onPin} showPin={true} />);
    fireEvent.click(screen.getByTitle('Pin'));
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it('calls onContextMenu on right-click', () => {
    const onContextMenu = vi.fn();
    render(<ClipCard {...defaultProps} onContextMenu={onContextMenu} />);
    const card = screen.getByText('Hello World').closest('[data-clip-id]')!.querySelector('[draggable]')!;
    fireEvent.contextMenu(card);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it('sets draggable attribute', () => {
    const { container } = render(<ClipCard {...defaultProps} />);
    const card = container.querySelector('[draggable="true"]');
    expect(card).toBeInTheDocument();
  });

  it('shows source icon when available', () => {
    const clip = makeClip({ source_icon: 'dGVzdA==' });
    render(<ClipCard {...defaultProps} clip={clip} />);
    const icons = document.querySelectorAll('img');
    const sourceIcon = Array.from(icons).find(img => img.src.includes('data:image/png;base64,dGVzdA=='));
    expect(sourceIcon).toBeDefined();
  });

  // === Sensitive content tests ===

  it('shows sensitive shield badge for sensitive clips', () => {
    const clip = makeClip({ is_sensitive: true });
    render(<ClipCard {...defaultProps} clip={clip} />);
    // ShieldAlert icon renders inside a span with red styling
    const badge = document.querySelector('.text-red-400');
    expect(badge).toBeInTheDocument();
  });

  it('applies sensitive-blur class to content of sensitive clips', () => {
    const clip = makeClip({ is_sensitive: true });
    const { container } = render(<ClipCard {...defaultProps} clip={clip} />);
    const contentArea = container.querySelector('.sensitive-blur');
    expect(contentArea).toBeInTheDocument();
  });

  it('does not apply sensitive-blur to non-sensitive clips', () => {
    const clip = makeClip({ is_sensitive: false });
    const { container } = render(<ClipCard {...defaultProps} clip={clip} />);
    const contentArea = container.querySelector('.sensitive-blur');
    expect(contentArea).not.toBeInTheDocument();
  });

  // === ARIA accessibility tests ===

  it('has role="option" on container', () => {
    const { container } = render(<ClipCard {...defaultProps} />);
    const option = container.querySelector('[role="option"]');
    expect(option).toBeInTheDocument();
  });

  it('sets aria-selected when selected', () => {
    const { container } = render(<ClipCard {...defaultProps} isSelected={true} />);
    const option = container.querySelector('[role="option"]');
    expect(option?.getAttribute('aria-selected')).toBe('true');
  });

  it('sets aria-selected false when not selected', () => {
    const { container } = render(<ClipCard {...defaultProps} isSelected={false} />);
    const option = container.querySelector('[role="option"]');
    expect(option?.getAttribute('aria-selected')).toBe('false');
  });

  it('has aria-label with clip info', () => {
    const { container } = render(<ClipCard {...defaultProps} />);
    const option = container.querySelector('[role="option"]');
    expect(option?.getAttribute('aria-label')).toContain('VS Code');
    expect(option?.getAttribute('aria-label')).toContain('Hello World');
  });

  it('includes sensitive warning in aria-label for sensitive clips', () => {
    const clip = makeClip({ is_sensitive: true });
    const { container } = render(<ClipCard {...defaultProps} clip={clip} />);
    const option = container.querySelector('[role="option"]');
    expect(option?.getAttribute('aria-label')).toContain('Sensitive content');
  });

  // === Note display tests ===

  it('shows note banner when clip has a note', () => {
    const clip = makeClip({ note: 'Important clip' });
    render(<ClipCard {...defaultProps} clip={clip} />);
    expect(screen.getByText('Important clip')).toBeInTheDocument();
  });

  it('does not show note banner when clip has no note', () => {
    const clip = makeClip({ note: null });
    const { container } = render(<ClipCard {...defaultProps} clip={clip} />);
    const noteBanner = container.querySelector('.text-amber-400\\/70');
    // Note banner should not exist or be empty
    const noteItalic = container.querySelector('span.italic');
    expect(noteItalic).not.toBeInTheDocument();
  });

  // === Subtype badge tests ===

  it('shows URL badge for url subtype', () => {
    const clip = makeClip({ subtype: 'url', content: 'https://example.com' });
    render(<ClipCard {...defaultProps} clip={clip} />);
    expect(screen.getByText('URL')).toBeInTheDocument();
  });

  it('shows Email badge for email subtype', () => {
    const clip = makeClip({ subtype: 'email', content: 'user@example.com' });
    const { container } = render(<ClipCard {...defaultProps} clip={clip} />);
    // The badge is in the header with uppercase styling
    const badge = container.querySelector('.text-emerald-400');
    expect(badge).toBeInTheDocument();
  });

  it('shows color swatch for color subtype', () => {
    const clip = makeClip({ subtype: 'color', content: '#ff0000' });
    render(<ClipCard {...defaultProps} clip={clip} />);
    expect(screen.getByText('#ff0000')).toBeInTheDocument();
  });

  // === Multi-select tests ===

  it('shows multi-select index badge', () => {
    render(<ClipCard {...defaultProps} isMultiSelected={true} multiSelectIndex={2} />);
    expect(screen.getByText('3')).toBeInTheDocument(); // 0-indexed + 1
  });

  it('applies multi-selected styling', () => {
    const { container } = render(<ClipCard {...defaultProps} isMultiSelected={true} />);
    const card = container.querySelector('[draggable]');
    expect(card?.className).toContain('ring-blue-500/40');
  });

  // === Paste count tests ===

  it('shows paste count when > 0', () => {
    const clip = makeClip({ paste_count: 5 });
    render(<ClipCard {...defaultProps} clip={clip} />);
    expect(screen.getByText('×5')).toBeInTheDocument();
  });

  it('does not show paste count when 0', () => {
    const clip = makeClip({ paste_count: 0 });
    render(<ClipCard {...defaultProps} clip={clip} />);
    expect(screen.queryByText('×0')).not.toBeInTheDocument();
  });
});
