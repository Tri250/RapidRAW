import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Undo2, Redo2, GitBranch, Circle, SlidersHorizontal, Crop, Sparkles, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import Text from '../../ui/Text';
import { TextColors, TextVariants, TextWeights } from '../../../types/typography';

interface HistoryNode {
  id: number;
  label: string;
  edit_type: string;
  timestamp: number;
  is_current: boolean;
  is_branch_point: boolean;
  branch_count: number;
}

interface EditHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onHistorySelect?: (nodeId: number) => void;
}

function getEditTypeIcon(editType: string) {
  switch (editType) {
    case 'initial_state':
      return Circle;
    case 'adjustment':
      return SlidersHorizontal;
    case 'crop':
      return Crop;
    case 'mask_edit':
      return Sparkles;
    case 'batch_operation':
      return Package;
    default:
      if (editType.startsWith('preset_')) return Sparkles;
      return Circle;
  }
}

export const EditHistoryPanel: React.FC<EditHistoryPanelProps> = ({ isOpen, onClose, onHistorySelect }) => {
  const { t } = useTranslation();
  const [historyTree, setHistoryTree] = useState<string>('');
  const [historySummary, setHistorySummary] = useState<HistoryNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && !historyTree) {
      initHistory();
    }
  }, [isOpen]);

  const initHistory = async () => {
    try {
      setIsLoading(true);
      const tree = await invoke<string>('edit_history_new');
      setHistoryTree(tree);
      await refreshSummary(tree);
    } catch (e) {
      console.error('Failed to initialize edit history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSummary = async (tree: string) => {
    try {
      const summaryJson = await invoke<string>('edit_history_get_summary', { treeJson: tree });
      const summary = JSON.parse(summaryJson) as HistoryNode[];
      setHistorySummary(summary);
    } catch (e) {
      console.error('Failed to get history summary:', e);
    }
  };

  const getSummary = async (tree: string): Promise<HistoryNode[]> => {
    const summaryJson = await invoke<string>('edit_history_get_summary', { treeJson: tree });
    return JSON.parse(summaryJson) as HistoryNode[];
  };

  const handleUndo = async () => {
    try {
      const newTree = await invoke<string>('edit_history_undo', { treeJson: historyTree });
      setHistoryTree(newTree);
      await refreshSummary(newTree);
      const summary = await getSummary(newTree);
      const current = summary.find(n => n.is_current);
      if (current && onHistorySelect) onHistorySelect(current.id);
    } catch (e) {
      console.error('Undo failed:', e);
    }
  };

  const handleRedo = async () => {
    try {
      const newTree = await invoke<string>('edit_history_redo', { treeJson: historyTree });
      setHistoryTree(newTree);
      await refreshSummary(newTree);
      const summary = await getSummary(newTree);
      const current = summary.find(n => n.is_current);
      if (current && onHistorySelect) onHistorySelect(current.id);
    } catch (e) {
      console.error('Redo failed:', e);
    }
  };

  const handleSwitchTo = async (nodeId: number) => {
    try {
      const newTree = await invoke<string>('edit_history_switch_to', { treeJson: historyTree, nodeId });
      setHistoryTree(newTree);
      await refreshSummary(newTree);
      if (onHistorySelect) onHistorySelect(nodeId);
    } catch (e) {
      console.error('Switch to history node failed:', e);
    }
  };

  const handleCreateBranch = async (fromNodeId: number, branchName: string) => {
    try {
      const newTree = await invoke<string>('edit_history_create_branch', {
        treeJson: historyTree,
        fromNodeId,
        branchName,
      });
      setHistoryTree(newTree);
      await refreshSummary(newTree);
    } catch (e) {
      console.error('Create branch failed:', e);
    }
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const canUndo = historySummary.some(n => n.is_current && n.id !== 1);
  const currentNodeIndex = historySummary.findIndex(n => n.is_current);
  const canRedo = currentNodeIndex >= 0 && currentNodeIndex < historySummary.length - 1;
  const branchCount = historySummary.filter(n => n.is_branch_point).length;

  if (!isOpen) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Title bar */}
      <div className="p-4 flex justify-between items-center shrink-0 border-b border-surface">
        <Text variant={TextVariants.title}>{t('editor.history.title')}</Text>
        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className={clsx(
              'p-1.5 rounded-md transition-colors',
              canUndo
                ? 'text-text-secondary hover:bg-surface hover:text-text-primary'
                : 'text-text-tertiary cursor-not-allowed',
            )}
            data-tooltip={t('editor.history.undo')}
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            className={clsx(
              'p-1.5 rounded-md transition-colors',
              canRedo
                ? 'text-text-secondary hover:bg-surface hover:text-text-primary'
                : 'text-text-tertiary cursor-not-allowed',
            )}
            data-tooltip={t('editor.history.redo')}
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>

      {/* History list */}
      <div className="grow overflow-y-auto p-4 custom-scrollbar">
        {isLoading ? (
          <Text variant={TextVariants.body} color={TextColors.secondary} className="text-center mt-4">
            ...
          </Text>
        ) : historySummary.length === 0 ? (
          <Text variant={TextVariants.body} color={TextColors.secondary} className="text-center mt-4">
            {t('editor.history.noHistory')}
          </Text>
        ) : (
          <div className="flex flex-col">
            {historySummary.map((node, index) => {
              const Icon = getEditTypeIcon(node.edit_type);
              const isLast = index === historySummary.length - 1;
              return (
                <div key={node.id}>
                  {/* Timeline connector line */}
                  {!isLast && (
                    <div
                      className={clsx(
                        'ml-[11px] w-0.5 h-3',
                        node.is_current ? 'bg-accent' : 'bg-surface',
                      )}
                    />
                  )}

                  {/* Node row */}
                  <div
                    onClick={() => handleSwitchTo(node.id)}
                    className={clsx(
                      'flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors',
                      node.is_current
                        ? 'bg-accent/10 border-l-2 border-accent'
                        : 'hover:bg-card-active border-l-2 border-transparent',
                    )}
                  >
                    {/* Icon circle */}
                    <div
                      className={clsx(
                        'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                        node.is_current
                          ? 'bg-accent text-accent-foreground'
                          : node.is_branch_point
                            ? 'bg-amber-500/20 text-amber-500'
                            : 'bg-surface text-text-secondary',
                      )}
                    >
                      {node.is_branch_point ? (
                        <GitBranch size={12} />
                      ) : (
                        <Icon size={12} />
                      )}
                    </div>

                    {/* Node info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Text
                          as="span"
                          variant={TextVariants.small}
                          weight={node.is_current ? TextWeights.semibold : TextWeights.normal}
                          color={node.is_current ? TextColors.accent : TextColors.primary}
                          className="truncate"
                        >
                          {node.label}
                        </Text>
                        {node.is_current && (
                          <span className="text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
                            {t('editor.history.current')}
                          </span>
                        )}
                      </div>
                      <Text as="span" variant={TextVariants.small} color={TextColors.secondary}>
                        {formatTime(node.timestamp)}
                        {node.branch_count > 1 && ` · ${node.branch_count} ${t('editor.history.branches', { count: node.branch_count })}`}
                      </Text>
                    </div>

                    {/* Branch action */}
                    {node.is_branch_point && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const name = prompt(t('editor.history.branchName'));
                          if (name) handleCreateBranch(node.id, name);
                        }}
                        className="p-1 rounded text-amber-500 hover:bg-amber-500/10 transition-colors shrink-0"
                        data-tooltip={t('editor.history.createBranch')}
                      >
                        <GitBranch size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="shrink-0 border-t border-surface p-3">
        <div className="flex justify-between">
          <Text variant={TextVariants.small} color={TextColors.secondary}>
            {t('editor.history.steps', { count: historySummary.length })}
          </Text>
          <Text variant={TextVariants.small} color={TextColors.secondary}>
            {t('editor.history.branches', { count: branchCount })}
          </Text>
        </div>
      </div>
    </div>
  );
};

export default EditHistoryPanel;
