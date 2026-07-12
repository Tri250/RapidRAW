import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

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

export const EditHistoryPanel: React.FC<EditHistoryPanelProps> = ({ isOpen, onClose, onHistorySelect }) => {
  const [historyTree, setHistoryTree] = useState<string>('');
  const [historySummary, setHistorySummary] = useState<HistoryNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // 初始化编辑历史
  useEffect(() => {
    if (isOpen && !historyTree) {
      initHistory();
    }
  }, [isOpen]);

  const initHistory = async () => {
    try {
      const tree = await invoke<string>('edit_history_new');
      setHistoryTree(tree);
      await refreshSummary(tree);
    } catch (e) {
      console.error('初始化编辑历史失败:', e);
    }
  };

  const refreshSummary = async (tree: string) => {
    try {
      const summaryJson = await invoke<string>('edit_history_get_summary', { treeJson: tree });
      const summary = JSON.parse(summaryJson) as HistoryNode[];
      setHistorySummary(summary);
    } catch (e) {
      console.error('获取历史摘要失败:', e);
    }
  };

  const handlePushEdit = useCallback(async (editType: string, editData: string, label?: string) => {
    try {
      const newTree = await invoke<string>('edit_history_push', {
        treeJson: historyTree,
        editType,
        editData,
        label: label || null,
      });
      setHistoryTree(newTree);
      await refreshSummary(newTree);
    } catch (e) {
      console.error('推送编辑操作失败:', e);
    }
  }, [historyTree]);

  const handleUndo = async () => {
    try {
      const newTree = await invoke<string>('edit_history_undo', { treeJson: historyTree });
      setHistoryTree(newTree);
      await refreshSummary(newTree);
      const summary = await getSummary(newTree);
      const current = summary.find(n => n.is_current);
      if (current && onHistorySelect) onHistorySelect(current.id);
    } catch (e) {
      console.error('撤销失败:', e);
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
      console.error('重做失败:', e);
    }
  };

  const handleSwitchTo = async (nodeId: number) => {
    try {
      const newTree = await invoke<string>('edit_history_switch_to', { treeJson: historyTree, nodeId });
      setHistoryTree(newTree);
      await refreshSummary(newTree);
      if (onHistorySelect) onHistorySelect(nodeId);
    } catch (e) {
      console.error('切换历史节点失败:', e);
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
      console.error('创建分支失败:', e);
    }
  };

  const handleCollapseBranch = async (branchNodeId: number) => {
    try {
      const newTree = await invoke<string>('edit_history_collapse_branch', {
        treeJson: historyTree,
        branchNodeId,
      });
      setHistoryTree(newTree);
      await refreshSummary(newTree);
    } catch (e) {
      console.error('折叠分支失败:', e);
    }
  };

  const getSummary = async (tree: string): Promise<HistoryNode[]> => {
    const summaryJson = await invoke<string>('edit_history_get_summary', { treeJson: tree });
    return JSON.parse(summaryJson) as HistoryNode[];
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getEditTypeIcon = (editType: string): string => {
    switch (editType) {
      case '初始状态': return '🏠';
      case '调整变更': return '🎨';
      case '裁剪': return '✂️';
      case '蒙版编辑': return '🎭';
      case '批量操作': return '📦';
      default:
        if (editType.startsWith('应用预设')) return '⚡';
        return '📝';
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: '280px',
      backgroundColor: 'rgba(18, 20, 26, 0.97)',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      color: '#e0e0e0',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* 头部 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600 }}>编辑历史</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={handleUndo}
            disabled={!historySummary.some(n => n.is_current && n.id !== 1)}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              color: '#e0e0e0',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
            title="撤销"
          >
            ↩ 撤销
          </button>
          <button
            onClick={handleRedo}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              color: '#e0e0e0',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
            title="重做"
          >
            ↪ 重做
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '2px 6px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 历史列表 */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 0',
      }}>
        {historySummary.map((node, index) => (
          <div key={node.id}>
            {/* 连接线 */}
            {index > 0 && (
              <div style={{
                marginLeft: '28px',
                width: '2px',
                height: '12px',
                backgroundColor: node.is_current ? '#4a9eff' : 'rgba(255,255,255,0.15)',
              }} />
            )}

            {/* 节点 */}
            <div
              onClick={() => handleSwitchTo(node.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                cursor: 'pointer',
                backgroundColor: node.is_current ? 'rgba(74, 158, 255, 0.15)' : 'transparent',
                borderLeft: node.is_current ? '3px solid #4a9eff' : '3px solid transparent',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!node.is_current) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (!node.is_current) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }
              }}
            >
              {/* 节点图标 */}
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                backgroundColor: node.is_current ? '#4a9eff' : node.is_branch_point ? 'rgba(255,180,0,0.3)' : 'rgba(255,255,255,0.08)',
                flexShrink: 0,
              }}>
                {node.is_branch_point ? '⑂' : getEditTypeIcon(node.edit_type)}
              </div>

              {/* 节点信息 */}
              <div style={{ marginLeft: '10px', flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: node.is_current ? 600 : 400,
                  color: node.is_current ? '#4a9eff' : '#ccc',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {node.label}
                </div>
                <div style={{
                  fontSize: '11px',
                  color: '#888',
                  marginTop: '2px',
                }}>
                  {formatTime(node.timestamp)}
                  {node.branch_count > 1 && ` · ${node.branch_count}个分支`}
                </div>
              </div>

              {/* 分支操作 */}
              {node.is_branch_point && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const name = prompt('输入分支名称:', `分支-${Date.now() % 1000}`);
                    if (name) handleCreateBranch(node.id, name);
                  }}
                  style={{
                    background: 'rgba(255,180,0,0.15)',
                    border: '1px solid rgba(255,180,0,0.3)',
                    borderRadius: '3px',
                    color: '#ffb400',
                    fontSize: '10px',
                    padding: '2px 6px',
                    cursor: 'pointer',
                  }}
                >
                  +分支
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 底部统计 */}
      <div style={{
        padding: '8px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        fontSize: '11px',
        color: '#666',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>{historySummary.length} 步操作</span>
        <span>{historySummary.filter(n => n.is_branch_point).length} 个分支点</span>
      </div>
    </div>
  );
};

export default EditHistoryPanel;
