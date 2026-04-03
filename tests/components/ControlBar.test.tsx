import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ControlBar } from '@/components/ControlBar';
import type { FolderItem } from '@/types';

const makeFolders = (): FolderItem[] => [
  { id: '1', name: 'Work', icon: null, color: 'blue', is_system: false, item_count: 5 },
  { id: '2', name: 'Personal', icon: null, color: 'green', is_system: false, item_count: 3 },
];

describe('ControlBar', () => {
  const defaultProps = {
    folders: makeFolders(),
    selectedFolder: null,
    onSelectFolder: vi.fn(),
    onSearchClick: vi.fn(),
    onAddClick: vi.fn(),
    onMoreClick: vi.fn(),
    showSearch: true,
    searchQuery: '',
    onSearchChange: vi.fn(),
    isDragging: false,
    dragTargetFolderId: null,
    onDragHover: vi.fn(),
    onDragLeave: vi.fn(),
    totalClipCount: 10,
  };

  it('renders search input when showSearch is true', () => {
    render(<ControlBar {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search clips...')).toBeInTheDocument();
  });

  it('renders All category with total count', () => {
    render(<ControlBar {...defaultProps} />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders folder tabs', () => {
    render(<ControlBar {...defaultProps} />);
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('renders folder item counts', () => {
    render(<ControlBar {...defaultProps} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onSelectFolder when folder is clicked', () => {
    const onSelectFolder = vi.fn();
    render(<ControlBar {...defaultProps} onSelectFolder={onSelectFolder} />);
    fireEvent.click(screen.getByText('Work'));
    expect(onSelectFolder).toHaveBeenCalledWith('1');
  });

  it('calls onSearchChange when typing in search', () => {
    const onSearchChange = vi.fn();
    render(<ControlBar {...defaultProps} onSearchChange={onSearchChange} />);
    const input = screen.getByPlaceholderText('Search clips...');
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(onSearchChange).toHaveBeenCalledWith('hello');
  });

  it('calls onAddClick when add button clicked', () => {
    const onAddClick = vi.fn();
    render(<ControlBar {...defaultProps} onAddClick={onAddClick} />);
    const buttons = document.querySelectorAll('button');
    const addBtn = Array.from(buttons).find(b => b.className.includes('emerald'));
    if (addBtn) fireEvent.click(addBtn);
    expect(onAddClick).toHaveBeenCalled();
  });

  it('calls onMoreClick when more button clicked', () => {
    const onMoreClick = vi.fn();
    render(<ControlBar {...defaultProps} onMoreClick={onMoreClick} />);
    const buttons = document.querySelectorAll('button');
    const moreBtn = Array.from(buttons).find(b => b.className.includes('amber'));
    if (moreBtn) fireEvent.click(moreBtn);
    expect(onMoreClick).toHaveBeenCalled();
  });

  it('filters folders by search query', () => {
    render(<ControlBar {...defaultProps} searchQuery="Work" />);
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
    // Personal should be filtered out
    expect(screen.queryByText('Personal')).not.toBeInTheDocument();
  });

  it('shows content type filters when search is shown', () => {
    render(<ControlBar {...defaultProps} showSearch={true} />);
    const buttons = document.querySelectorAll('button[title]');
    const titles = Array.from(buttons).map(b => b.getAttribute('title'));
    expect(titles).toContain('Text');
    expect(titles).toContain('Image');
  });

  it('does not show search input when showSearch is false', () => {
    render(<ControlBar {...defaultProps} showSearch={false} />);
    expect(screen.queryByPlaceholderText('Search clips...')).not.toBeInTheDocument();
  });

  it('does not show content type filters when search is hidden', () => {
    render(<ControlBar {...defaultProps} showSearch={false} />);
    const buttons = document.querySelectorAll('button[title]');
    const titles = Array.from(buttons).map(b => b.getAttribute('title'));
    expect(titles).not.toContain('Text');
    expect(titles).not.toContain('Image');
  });

  it('calls onSelectFolder with null when All is clicked', () => {
    const onSelectFolder = vi.fn();
    render(<ControlBar {...defaultProps} onSelectFolder={onSelectFolder} selectedFolder="1" />);
    fireEvent.click(screen.getByText('All'));
    expect(onSelectFolder).toHaveBeenCalledWith(null);
  });

  it('closes search on Escape key in input', () => {
    const onSearchClick = vi.fn();
    render(<ControlBar {...defaultProps} onSearchClick={onSearchClick} />);
    const input = screen.getByPlaceholderText('Search clips...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSearchClick).toHaveBeenCalled();
  });

  // === Incognito mode tests ===

  it('shows incognito button when onToggleIncognito is provided', () => {
    render(<ControlBar {...defaultProps} onToggleIncognito={vi.fn()} isIncognito={false} />);
    const btn = screen.getByTitle('Enable incognito mode');
    expect(btn).toBeInTheDocument();
  });

  it('shows active incognito styling when incognito is on', () => {
    render(<ControlBar {...defaultProps} onToggleIncognito={vi.fn()} isIncognito={true} />);
    const btn = screen.getByTitle('Incognito ON — clipboard not recorded');
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('bg-red-500');
  });

  it('calls onToggleIncognito when incognito button clicked', () => {
    const onToggleIncognito = vi.fn();
    render(<ControlBar {...defaultProps} onToggleIncognito={onToggleIncognito} isIncognito={false} />);
    fireEvent.click(screen.getByTitle('Enable incognito mode'));
    expect(onToggleIncognito).toHaveBeenCalledTimes(1);
  });

  it('does not show incognito button when handler not provided', () => {
    render(<ControlBar {...defaultProps} />);
    expect(screen.queryByTitle('Enable incognito mode')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Incognito/)).not.toBeInTheDocument();
  });

  // === ARIA accessibility tests ===

  it('has role="tablist" on folder container', () => {
    const { container } = render(<ControlBar {...defaultProps} />);
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist).toBeInTheDocument();
  });

  it('has aria-label on tablist', () => {
    const { container } = render(<ControlBar {...defaultProps} />);
    const tablist = container.querySelector('[role="tablist"]');
    expect(tablist?.getAttribute('aria-label')).toBe('Clip folders');
  });
});
