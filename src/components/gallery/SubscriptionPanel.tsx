import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  RefreshCw,
  Check,
  AlertCircle,
  Globe,
  ToggleLeft,
  ToggleRight,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useSubscriptionStore } from '../../store/useSubscriptionStore';

export function SubscriptionPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const {
    subscriptions,
    isAutoUpdateEnabled,
    addSubscription,
    removeSubscription,
    toggleSubscription,
    checkSubscriptionUpdate,
    checkAllUpdates,
    updateSubscription,
    setAutoUpdate,
  } = useSubscriptionStore();

  const handleAdd = useCallback(async () => {
    if (!newUrl.trim()) return;
    const success = await addSubscription(newUrl.trim());
    if (success) {
      setNewUrl('');
      setShowAddForm(false);
    }
  }, [newUrl, addSubscription]);

  const handleRefreshAll = useCallback(async () => {
    await checkAllUpdates();
  }, [checkAllUpdates]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <RefreshCw className="w-3.5 h-3.5 text-blue-400" />;
      case 'updating':
        return <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />;
      case 'checking':
        return <RefreshCw className="w-3.5 h-3.5 text-zinc-400 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Check className="w-3.5 h-3.5 text-green-400" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'available':
        return 'Update available';
      case 'updating':
        return 'Updating...';
      case 'checking':
        return 'Checking...';
      case 'error':
        return 'Error';
      default:
        return 'Up to date';
    }
  };

  return (
    <div className="border-b border-zinc-800">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">Subscriptions</span>
          <span className="text-xs text-zinc-500">({subscriptions.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRefreshAll();
            }}
            className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Check all for updates"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-2">
              {/* Subscription List */}
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    sub.isEnabled
                      ? 'bg-zinc-800/50 border-zinc-700'
                      : 'bg-zinc-900/50 border-zinc-800 opacity-60'
                  }`}
                >
                  {/* Toggle */}
                  <button
                    onClick={() => toggleSubscription(sub.id)}
                    className="shrink-0"
                  >
                    {sub.isEnabled ? (
                      <ToggleRight className="w-5 h-5 text-blue-500" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-zinc-600" />
                    )}
                  </button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-zinc-200 truncate">{sub.name}</span>
                      {sub.isDefault && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-700 text-zinc-400 uppercase">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {statusIcon(sub.updateStatus)}
                      <span className="text-[11px] text-zinc-500">
                        {statusLabel(sub.updateStatus)}
                        {sub.presetCount > 0 && ` · ${sub.presetCount} presets`}
                        {sub.build > 0 && ` · v${sub.build}`}
                      </span>
                    </div>
                    {sub.errorMessage && (
                      <p className="text-[11px] text-red-400 mt-0.5 truncate">{sub.errorMessage}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {sub.updateStatus === 'available' && (
                      <button
                        onClick={() => updateSubscription(sub.id)}
                        className="p-1 rounded hover:bg-zinc-700 text-blue-400 hover:text-blue-300 transition-colors"
                        title="Update now"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => checkSubscriptionUpdate(sub.id)}
                      className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Check for updates"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    {!sub.isDefault && (
                      <button
                        onClick={() => removeSubscription(sub.id)}
                        className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add New */}
              {showAddForm ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700">
                  <input
                    type="text"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://example.com/presets.json"
                    className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    autoFocus
                  />
                  <button
                    onClick={handleAdd}
                    className="p-1 rounded hover:bg-zinc-700 text-green-400 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false);
                      setNewUrl('');
                    }}
                    className="p-1 rounded hover:bg-zinc-700 text-zinc-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors text-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Subscription
                </button>
              )}

              {/* Auto-update toggle */}
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-xs text-zinc-500">Auto-update on startup</span>
                <button onClick={() => setAutoUpdate(!isAutoUpdateEnabled)}>
                  {isAutoUpdateEnabled ? (
                    <ToggleRight className="w-4 h-4 text-blue-500" />
                  ) : (
                    <ToggleLeft className="w-4 h-4 text-zinc-600" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
