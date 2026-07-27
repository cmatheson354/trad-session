import { useState } from 'react'
import { DEFAULT_STATUS_LABELS, saveStatusLabels, loadDupePrefs, saveDupePrefs } from '../constants.js'

const STATUSES = ['want_to_learn', 'learning', 'know_it', 'performance_ready']
const STATUS_COLORS = {
  want_to_learn: 'text-gray-600',
  learning: 'text-blue-600',
  know_it: 'text-green-600',
  performance_ready: 'text-yellow-600',
}

export default function UserSettings({ statusLabels, onSave, onClose, sameKeyIsDupe, onChangeSameKeyIsDupe }) {
  const [labels, setLabels] = useState({ ...statusLabels })
  const [sameKey, setSameKey] = useState(sameKeyIsDupe ?? true)

  const handleSave = () => {
    saveStatusLabels(labels)
    saveDupePrefs({ sameKeyIsDupe: sameKey })
    onSave(labels)
    onChangeSameKeyIsDupe && onChangeSameKeyIsDupe(sameKey)
    onClose()
  }

  const handleReset = () => setLabels({ ...DEFAULT_STATUS_LABELS })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-green-800 text-white rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Settings</h2>
            <p className="text-green-300 text-sm">Customise your learning level labels</p>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">Rename each learning level to suit your own vocabulary.</p>

          {STATUSES.map(s => (
            <div key={s} className="flex items-center gap-3">
              <span className={`text-xs font-mono w-32 shrink-0 ${STATUS_COLORS[s]}`}>
                {DEFAULT_STATUS_LABELS[s]}
              </span>
              <input
                type="text"
                value={labels[s]}
                onChange={e => setLabels(l => ({ ...l, [s]: e.target.value }))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder={DEFAULT_STATUS_LABELS[s]}
              />
            </div>
          ))}

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Duplicate Detection</p>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setSameKey(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                  sameKey ? 'bg-yellow-500' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  sameKey ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-gray-600">Same tune, different key = duplicate</span>
            </label>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              className="bg-green-700 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
