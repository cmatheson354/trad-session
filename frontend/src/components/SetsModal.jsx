import { useState, useEffect } from 'react'
import { api } from '../api.js'

const TUNE_TYPES = ['mixed','reel','jig','slip_jig','hornpipe','polka','waltz','air','mazurka','march']

export default function SetsModal({ allTunes, set: editingSet, onSave, onClose }) {
  const isNew = !editingSet?.id
  const [name, setName] = useState(editingSet?.name ?? '')
  const [tuneType, setTuneType] = useState(editingSet?.tune_type ?? 'mixed')
  const [selectedIds, setSelectedIds] = useState(editingSet?.tunes?.map(t => t.id) ?? [])
  const [saving, setSaving] = useState(false)

  // Filter available tunes by type if not mixed
  const available = tuneType === 'mixed'
    ? allTunes
    : allTunes.filter(t => t.tune_type === tuneType)

  const toggleTune = (id) => {
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  }

  const moveUp = (idx) => {
    if (idx === 0) return
    const next = [...selectedIds]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setSelectedIds(next)
  }
  const moveDown = (idx) => {
    if (idx === selectedIds.length - 1) return
    const next = [...selectedIds]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setSelectedIds(next)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { name, tune_type: tuneType, tune_ids: selectedIds }
      const result = isNew
        ? await api.sets.create(payload)
        : await api.sets.update(editingSet.id, payload)
      onSave(result)
      onClose()
    } finally { setSaving(false) }
  }

  const displayName = name || (selectedIds.length > 0
    ? (allTunes.find(t => t.id === selectedIds[0])?.title ?? '') + ' Set'
    : 'New Set')

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-green-800 text-white rounded-t-2xl px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold">{isNew ? 'New Set' : 'Edit Set'}</h2>
            <p className="text-green-300 text-sm truncate max-w-xs">{displayName}</p>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Set Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={displayName}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* Type filter */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Tune Type</label>
            <select
              value={tuneType}
              onChange={e => { setTuneType(e.target.value); setSelectedIds([]) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {TUNE_TYPES.map(t => (
                <option key={t} value={t}>{t === 'mixed' ? 'Mixed (any type)' : t.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          {/* Order */}
          {selectedIds.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">Order</label>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {selectedIds.map((id, idx) => {
                  const tune = allTunes.find(t => t.id === id)
                  return (
                    <div key={id} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-xs text-gray-400 w-4">{idx + 1}</span>
                      <span className="flex-1 text-sm truncate">{tune?.title}</span>
                      <button onClick={() => moveUp(idx)} className="text-gray-400 hover:text-gray-700 text-xs px-1">↑</button>
                      <button onClick={() => moveDown(idx)} className="text-gray-400 hover:text-gray-700 text-xs px-1">↓</button>
                      <button onClick={() => toggleTune(id)} className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Available tunes */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1">
              Add Tunes {tuneType !== 'mixed' && `(${tuneType} only)`}
            </label>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {available.filter(t => !selectedIds.includes(t.id)).map(tune => (
                <button
                  key={tune.id}
                  onClick={() => toggleTune(tune.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-green-50 text-left transition-colors"
                >
                  <span className="flex-1 text-sm truncate">{tune.title}</span>
                  <span className="text-xs text-gray-400 capitalize">{tune.tune_key}</span>
                  <span className="text-green-500 text-xs">+ Add</span>
                </button>
              ))}
              {available.filter(t => !selectedIds.includes(t.id)).length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-3 text-center">
                  {available.length === 0 ? `No ${tuneType} tunes in your library` : 'All tunes added'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 flex gap-3 shrink-0">
          <button
            onClick={handleSave}
            disabled={saving || selectedIds.length === 0}
            className="bg-green-700 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : isNew ? 'Create Set' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      </div>
    </div>
  )
}
