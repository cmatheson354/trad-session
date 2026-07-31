import { useState } from 'react'

const TUNE_TYPES = ['reel', 'jig', 'slip_jig', 'hornpipe', 'polka', 'waltz', 'air', 'mazurka', 'march']
const KEYS = ['D', 'G', 'A', 'E', 'Bm', 'Em', 'Am', 'C', 'F', 'Bb', 'Eb', 'Ab']
const MODES = ['major', 'dorian', 'mixolydian', 'minor', 'aeolian', 'lydian']
const DEFAULT_STATUS_OPTIONS = [
  { value: 'want_to_learn', label: 'Want to Learn' },
  { value: 'learning', label: 'Learning' },
  { value: 'know_it', label: 'Know It' },
  { value: 'performance_ready', label: 'Performance Ready' },
]

const ABC_PLACEHOLDER = `X:1
T:Tune Title
M:6/8
L:1/8
R:jig
K:D
|:dAA BAA|dAA AGE|FDD EDD|FDD EFG|
dAA BAA|dAA ABA|GEE FEE|EDD D3:|`

export default function TuneForm({ tune, onSave, onClose, statusLabels = {} }) {
  const [form, setForm] = useState({
    title: tune?.title ?? '',
    tune_type: tune?.tune_type ?? 'reel',
    tune_key: tune?.tune_key ?? '',
    mode: tune?.mode ?? '',
    abc_notation: tune?.abc_notation ?? '',
    thesession_id: tune?.thesession_id ?? '',
    status: tune?.status ?? 'want_to_learn',
    notes: tune?.notes ?? '',
    source: tune?.source ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({
        ...form,
        thesession_id: form.thesession_id ? parseInt(form.thesession_id) : null,
        tune_key: form.tune_key || null,
        mode: form.mode || null,
        abc_notation: form.abc_notation || null,
        notes: form.notes || null,
        source: form.source || null,
      })
    } catch (e) {
      setError('Failed to save tune. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-green-800 text-white rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{tune ? 'Edit Tune' : 'Add Tune'}</h2>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => update('title', e.target.value)}
              placeholder="e.g. The Morning Dew"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.tune_type}
                onChange={e => update('tune_type', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white capitalize"
              >
                {TUNE_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => update('status', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                {DEFAULT_STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{statusLabels[s.value] || s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Key</label>
              <select
                value={form.tune_key}
                onChange={e => update('tune_key', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                <option value="">—</option>
                {KEYS.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
              <select
                value={form.mode}
                onChange={e => update('mode', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                <option value="">—</option>
                {MODES.map(m => (
                  <option key={m} value={m} className="capitalize">{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ABC Notation
              <a
                href="https://abcnotation.com/wiki/abc:standard:v2.1"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-xs text-green-600 hover:underline font-normal"
              >
                What is ABC?
              </a>
            </label>
            <textarea
              value={form.abc_notation}
              onChange={e => update('abc_notation', e.target.value)}
              placeholder={ABC_PLACEHOLDER}
              rows={6}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              The Session ID
              <span className="ml-2 text-xs text-gray-400 font-normal">from thesession.org/tunes/&lt;id&gt;</span>
            </label>
            <input
              type="number"
              value={form.thesession_id}
              onChange={e => update('thesession_id', e.target.value)}
              placeholder="e.g. 10009"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
            <input
              type="text"
              value={form.source}
              onChange={e => update('source', e.target.value)}
              placeholder="e.g. Kingston Slow Session Book, Hartford Tune Book, The Session"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder="Personal notes, tricky bits, fingering tips..."
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-green-700 hover:bg-green-600 text-white font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : tune ? 'Save Changes' : 'Add Tune'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
