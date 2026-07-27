const TUNE_TYPES = ['reel', 'jig', 'slip_jig', 'hornpipe', 'polka', 'waltz', 'air', 'mazurka', 'march']
const KEYS = ['D', 'G', 'A', 'E', 'Bm', 'Em', 'Am', 'C', 'F', 'Bb', 'Eb', 'Ab']

export default function FilterBar({ filters, onChange }) {
  const update = (key, val) => onChange(f => ({ ...f, [key]: val }))

  return (
    <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
      <input
        type="text"
        placeholder="Search tunes..."
        value={filters.q}
        onChange={e => update('q', e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
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
    </div>
  )
}
