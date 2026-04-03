import { useState } from 'react';

export function useFolderModal() {
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename'>('create');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderColor, setEditingFolderColor] = useState<string | null>(null);
  const [editingFolderIcon, setEditingFolderIcon] = useState<string | null>(null);

  const openCreateModal = () => {
    setFolderModalMode('create');
    setNewFolderName('');
    setEditingFolderColor(null);
    setEditingFolderIcon(null);
    setShowAddFolderModal(true);
  };

  const openRenameModal = (folderId: string, name: string, color: string | null, icon: string | null) => {
    setFolderModalMode('rename');
    setEditingFolderId(folderId);
    setNewFolderName(name);
    setEditingFolderColor(color);
    setEditingFolderIcon(icon);
    setShowAddFolderModal(true);
  };

  const closeModal = () => {
    setShowAddFolderModal(false);
    setNewFolderName('');
  };

  return {
    showAddFolderModal,
    newFolderName,
    folderModalMode,
    editingFolderId,
    editingFolderColor,
    editingFolderIcon,
    openCreateModal,
    openRenameModal,
    closeModal,
  };
}
