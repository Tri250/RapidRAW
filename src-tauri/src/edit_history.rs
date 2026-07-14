//! RapidRAW 可分支编辑历史系统
//!
//! 参考 AlcedoStudio 的分支编辑历史设计：
//! - 树形历史结构（非线性的 undo/redo）
//! - 从任意节点创建分支
//! - 分支切换、合并
//! - 增量快照存储（仅存储 delta，节省空间）
//! - 序列化到 .rrdata 侧车文件

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 编辑历史节点唯一标识
pub type NodeId = u64;

/// 编辑历史树
///
/// 每个节点存储相对于父节点的编辑操作差异（delta），
/// 而非完整快照，显著减少 Android 端的存储开销。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditHistoryTree {
    /// 所有节点（NodeId → Node）
    nodes: HashMap<NodeId, HistoryNode>,
    /// 当前活跃节点
    current_node: NodeId,
    /// 根节点（初始状态）
    root_node: NodeId,
    /// 下一个节点 ID
    next_id: NodeId,
    /// 分支名称映射
    branch_names: HashMap<NodeId, String>,
}

/// 历史节点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryNode {
    /// 节点 ID
    pub id: NodeId,
    /// 父节点 ID（根节点为 None）
    pub parent: Option<NodeId>,
    /// 子节点列表（支持多个分支）
    pub children: Vec<NodeId>,
    /// 编辑操作（相对于父节点的差异）
    pub edit: EditOperation,
    /// 创建时间戳
    pub timestamp: u64,
    /// 节点标签（用户可自定义）
    pub label: Option<String>,
    /// 是否为分支点（有多个子节点）
    pub is_branch_point: bool,
}

/// 编辑操作（增量差异）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EditOperation {
    /// 初始状态（根节点）
    Initial,
    /// 调整变更
    AdjustmentChange {
        /// 变更的调整项键值对
        changed_keys: Vec<(String, String)>,
    },
    /// 裁剪变更
    CropChange {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        angle: f32,
    },
    /// 蒙版变更
    MaskChange {
        mask_id: String,
        operation: MaskOperation,
        data: Vec<u8>,
    },
    /// 批量操作（多个编辑合并）
    Batch {
        operations: Vec<EditOperation>,
    },
    /// 预设应用
    PresetApplied {
        preset_name: String,
        previous_state: Vec<(String, String)>,
    },
}

/// 蒙版操作
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MaskOperation {
    Create,
    Update,
    Delete,
    Move,
    Duplicate,
}

impl EditHistoryTree {
    /// 创建新的编辑历史树
    pub fn new() -> Self {
        let root_id = 1;
        let root_node = HistoryNode {
            id: root_id,
            parent: None,
            children: Vec::new(),
            edit: EditOperation::Initial,
            timestamp: Self::current_timestamp(),
            label: Some("初始状态".to_string()),
            is_branch_point: false,
        };

        let mut nodes = HashMap::new();
        nodes.insert(root_id, root_node);

        Self {
            nodes,
            current_node: root_id,
            root_node: root_id,
            next_id: 2,
            branch_names: HashMap::new(),
        }
    }

    /// 在当前节点后添加编辑操作
    pub fn push_edit(&mut self, edit: EditOperation, label: Option<String>) -> NodeId {
        let new_id = self.next_id;
        self.next_id += 1;

        let new_node = HistoryNode {
            id: new_id,
            parent: Some(self.current_node),
            children: Vec::new(),
            edit,
            timestamp: Self::current_timestamp(),
            label,
            is_branch_point: false,
        };

        // 更新父节点的子节点列表
        if let Some(parent) = self.nodes.get_mut(&self.current_node) {
            parent.children.push(new_id);
            // 如果父节点现在有多个子节点，标记为分支点
            if parent.children.len() > 1 {
                parent.is_branch_point = true;
            }
        }

        self.nodes.insert(new_id, new_node);
        self.current_node = new_id;
        new_id
    }

    /// 从指定节点创建分支
    pub fn create_branch(&mut self, from_node: NodeId, branch_name: String) -> Option<NodeId> {
        if !self.nodes.contains_key(&from_node) {
            return None;
        }

        // 分支节点不需要创建新节点，只需标记当前节点为分支起始点
        self.branch_names.insert(from_node, branch_name.clone());

        // 切换到该节点
        self.current_node = from_node;
        Some(from_node)
    }

    /// 切换到指定节点
    pub fn switch_to_node(&mut self, node_id: NodeId) -> Result<(), String> {
        if !self.nodes.contains_key(&node_id) {
            return Err(format!("节点 {} 不存在", node_id));
        }

        self.current_node = node_id;
        Ok(())
    }

    /// 撤销（沿父链回退一步）
    pub fn undo(&mut self) -> Option<NodeId> {
        let current = self.nodes.get(&self.current_node)?;
        let parent_id = current.parent?;

        self.current_node = parent_id;
        Some(parent_id)
    }

    /// 重做（沿第一个子节点前进一步）
    pub fn redo(&mut self) -> Option<NodeId> {
        let current = self.nodes.get(&self.current_node)?;
        let first_child = *current.children.first()?;

        self.current_node = first_child;
        Some(first_child)
    }

    /// 获取从根节点到当前节点的完整编辑序列
    pub fn get_edit_path(&self) -> Vec<&EditOperation> {
        let mut path = Vec::new();
        let mut node_id = self.current_node;

        loop {
            if let Some(node) = self.nodes.get(&node_id) {
                path.push(&node.edit);
                if let Some(parent) = node.parent {
                    node_id = parent;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        path.reverse();
        path
    }

    /// 获取当前节点的所有分支子节点
    pub fn get_branches(&self) -> Vec<(NodeId, &HistoryNode)> {
        if let Some(current) = self.nodes.get(&self.current_node) {
            current.children.iter()
                .filter_map(|id| self.nodes.get(id).map(|node| (*id, node)))
                .collect()
        } else {
            Vec::new()
        }
    }

    /// 折叠/合并分支（将指定子分支的编辑合并到当前节点）
    pub fn collapse_branch(&mut self, branch_node_id: NodeId) -> Result<(), String> {
        if !self.nodes.contains_key(&branch_node_id) {
            return Err(format!("分支节点 {} 不存在", branch_node_id));
        }

        // 将该分支节点作为当前节点的唯一子节点
        let current = self.nodes.get_mut(&self.current_node)
            .ok_or("当前节点不存在")?;

        current.children.clear();
        current.children.push(branch_node_id);
        current.is_branch_point = false;

        // 更新分支节点的父节点
        if let Some(branch_node) = self.nodes.get_mut(&branch_node_id) {
            branch_node.parent = Some(self.current_node);
        }

        Ok(())
    }

    /// 获取指定节点的完整编辑序列（用于恢复到该节点）
    pub fn get_edit_path_to(&self, target: NodeId) -> Vec<&EditOperation> {
        let mut path = Vec::new();
        let mut node_id = target;

        loop {
            if let Some(node) = self.nodes.get(&node_id) {
                path.push(&node.edit);
                if let Some(parent) = node.parent {
                    node_id = parent;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        path.reverse();
        path
    }

    /// 获取历史摘要（用于 UI 展示）
    pub fn get_history_summary(&self) -> Vec<HistorySummary> {
        let mut summaries = Vec::new();
        let mut node_id = self.current_node;

        // 从当前节点回溯到根节点
        loop {
            if let Some(node) = self.nodes.get(&node_id) {
                summaries.push(HistorySummary {
                    node_id: node.id,
                    label: node.label.clone().unwrap_or_else(|| format!("编辑 {}", node.id)),
                    edit_type: node.edit.type_name(),
                    timestamp: node.timestamp,
                    is_current: node.id == self.current_node,
                    is_branch_point: node.is_branch_point,
                    branch_count: node.children.len(),
                });

                if let Some(parent) = node.parent {
                    node_id = parent;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        summaries.reverse();
        summaries
    }

    /// 获取所有分支点
    pub fn get_branch_points(&self) -> Vec<(NodeId, &HistoryNode)> {
        self.nodes.iter()
            .filter(|(_, node)| node.is_branch_point)
            .map(|(id, node)| (*id, node))
            .collect()
    }

    /// 节点总数
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// 当前节点 ID
    pub fn current_node_id(&self) -> NodeId {
        self.current_node
    }

    /// 是否可以撤销
    pub fn can_undo(&self) -> bool {
        self.nodes.get(&self.current_node)
            .and_then(|n| n.parent)
            .is_some()
    }

    /// 是否可以重做
    pub fn can_redo(&self) -> bool {
        self.nodes.get(&self.current_node)
            .map(|n| !n.children.is_empty())
            .unwrap_or(false)
    }

    fn current_timestamp() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
}

impl Default for EditHistoryTree {
    fn default() -> Self {
        Self::new()
    }
}

/// 历史摘要（用于 UI 展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistorySummary {
    pub node_id: NodeId,
    pub label: String,
    pub edit_type: String,
    pub timestamp: u64,
    pub is_current: bool,
    pub is_branch_point: bool,
    pub branch_count: usize,
}

impl EditOperation {
    /// 获取编辑操作的显示名称
    pub fn type_name(&self) -> String {
        match self {
            EditOperation::Initial => "初始状态".to_string(),
            EditOperation::AdjustmentChange { .. } => "调整变更".to_string(),
            EditOperation::CropChange { .. } => "裁剪".to_string(),
            EditOperation::MaskChange { .. } => "蒙版编辑".to_string(),
            EditOperation::Batch { .. } => "批量操作".to_string(),
            EditOperation::PresetApplied { preset_name, .. } => {
                format!("应用预设: {}", preset_name)
            }
        }
    }

    /// 估算增量大小（字节）
    pub fn estimated_size(&self) -> usize {
        match self {
            EditOperation::Initial => 0,
            EditOperation::AdjustmentChange { changed_keys } => {
                changed_keys.len() * 64 // 每个键值对约 64 字节
            }
            EditOperation::CropChange { .. } => 32, // 5 个 f32
            EditOperation::MaskChange { data, .. } => data.len() + 64,
            EditOperation::Batch { operations } => {
                operations.iter().map(|op| op.estimated_size()).sum()
            }
            EditOperation::PresetApplied { previous_state, .. } => {
                previous_state.len() * 64 + 128
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_history() {
        let tree = EditHistoryTree::new();
        assert_eq!(tree.node_count(), 1);
        assert_eq!(tree.current_node_id(), 1);
        assert!(!tree.can_undo());
        assert!(!tree.can_redo());
    }

    #[test]
    fn test_push_and_undo() {
        let mut tree = EditHistoryTree::new();

        let node2 = tree.push_edit(
            EditOperation::AdjustmentChange {
                changed_keys: vec![("exposure".into(), "1.0".into())],
            },
            Some("曝光+1".into()),
        );

        assert_eq!(tree.node_count(), 2);
        assert!(tree.can_undo());

        let undone = tree.undo();
        assert_eq!(undone, Some(1));
        assert_eq!(tree.current_node_id(), 1);
        assert!(tree.can_redo());

        let redone = tree.redo();
        assert_eq!(redone, Some(2));
        assert_eq!(tree.current_node_id(), 2);
    }

    #[test]
    fn test_branching() {
        let mut tree = EditHistoryTree::new();

        // 创建分支点
        let node2 = tree.push_edit(
            EditOperation::AdjustmentChange {
                changed_keys: vec![("exposure".into(), "1.0".into())],
            },
            Some("曝光+1".into()),
        );

        // 回到根节点
        tree.switch_to_node(1).unwrap();

        // 创建另一个分支
        let node3 = tree.push_edit(
            EditOperation::CropChange {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
                angle: 0.0,
            },
            Some("裁剪".into()),
        );

        // 根节点应该有两个子节点
        let branches = tree.get_branches();
        assert_eq!(branches.len(), 2);
    }

    #[test]
    fn test_edit_path() {
        let mut tree = EditHistoryTree::new();

        tree.push_edit(
            EditOperation::AdjustmentChange {
                changed_keys: vec![("exposure".into(), "1.0".into())],
            },
            None,
        );

        tree.push_edit(
            EditOperation::CropChange {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
                angle: 45.0,
            },
            None,
        );

        let path = tree.get_edit_path();
        assert_eq!(path.len(), 3); // Initial + 2 edits
    }

    #[test]
    fn test_estimated_size() {
        let edit = EditOperation::AdjustmentChange {
            changed_keys: vec![("exposure".into(), "1.0".into())],
        };
        assert!(edit.estimated_size() > 0);
        assert!(edit.estimated_size() < 1024); // 应该小于 1KB
    }
}