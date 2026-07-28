import { isAbcSearch } from '../abcSearch.js'

const TUNE_TYPES = ['reel', 'jig', 'slip_jig', 'hornpipe', 'polka', 'waltz', 'air', 'mazurka', 'march']
const KEYS = ['D', 'G', 'A', 'E', 'Bm', 'Em', 'Am', 'C', 'F', 'Bb', 'Eb', 'Ab']

export default function FilterBar({ filters, onChange, friends = [] }) {
  const update = (key, val) => onChange(f => ({ ...f, [key]: val }))
  const abcMode = isAbcSearch(filters.q)

  return (
    <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
      <div className="relative flex-1 min-w-40">
        <input
          type="text"
          placeholder="Search by title or notes (e.g. GDEG…)"
          value={filters.q}
          onChange={e => update('q', e.target.value)}
          className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent pr-16 font-mono ${
            abcMode
              ? 'border-green-400 focus:ring-green-500 bg-green-50'
              : 'border-gray-300 focus:ring-green-500 bg-white'
          }`}
        />
        {abcMode && (
          <span
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-green-700 font-semibold bg-green-100 px-1.5 py-0.5 rounded pointer-events-none"
            title="Searching by first notes"
          >
            ♩ notes
          </span>
        )}
      </div>
      <select
        value={filters.type}
        onChange={e => update('type', e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
      >
        <option value="">All Types</option>
        {TUNE_TYPES.map(t => (
          <option key={t} value={t}>{t.replace('_', ' ')}</option>
        ))}
      </select>
      <select
        value={filters.key}
        onChange={e => update('key', e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
      >
        <option value="">All Keys</option>
        {KEYS.map(k => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      {(filters.q || filters.type || filters.key || filters.status) && (
        <button
          onClick={() => onChange({ q: '', status: '', type: '', key: '' })}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Clear
        </button>
      )}
      {friends.length > 0 && (
        <select
          value={filters.friend_id || ''}
          onChange={e => update('friend_id', e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          <option value="">All friends</option>
          {friends.map(f => (
            <option key={f.id} value={String(f.id)}>{f.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
