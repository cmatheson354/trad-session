import { isAbcSearch } from '../abcSearch.js'

const TUNE_TYPES = ['reel', 'jig', 'slip_jig', 'hornpipe', 'polka', 'waltz', 'air', 'mazurka', 'march']
const KEYS = ['D', 'G', 'A', 'E', 'Bm', 'Em', 'Am', 'C', 'F', 'Bb', 'Eb', 'Ab']

const SORT_OPTIONS = [
  { value: 'title_asc',  label: 'A → Z' },
  { value: 'title_desc', label: 'Z → A' },
  { value: 'newest',     label: 'Newest' },
  { value: 'oldest',     label: 'Oldest' },
  { value: 'practiced',  label: 'Last Practiced' },
  { value: 'random',     label: '🎲 Random' },
]

export default function FilterBar({ filters, onChange, friends = [], userFriends = [], sort = 'title_asc', onSortChange, onReshuffle, partsFilter = '', onPartsChange, onAddNew, tuneCount = null, searchQ, onSearchChange, onSearchCommit }) {
  const update = (key, val) => onChange(f => ({ ...f, [key]: val }))
  // Use live searchQ for the input value if provided, else fall back to filters.q
  const inputVal = searchQ !== undefined ? searchQ : filters.q
  const abcMode = isAbcSearch(inputVal)
  const hasQuery = inputVal && inputVal.trim().length > 0
  const noResults = hasQuery && tuneCount === 0

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') onSearchCommit?.()
  }

  return (
    <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
      <div className="relative flex-1 min-w-40">
        <input
          type="text"
          placeholder="Search by title or notes (e.g. GDEG…)"
          value={inputVal}
          onChange={e => onSearchChange ? onSearchChange(e.target.value) : update('q', e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className={`w-full border rounded-lg pl-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent pr-8 font-mono ${
            abcMode
              ? 'border-green-400 focus:ring-green-500 bg-green-50'
              : 'border-gray-300 focus:ring-green-500 bg-white'
          }`}
        />
        {abcMode ? (
          <span
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-green-700 font-semibold bg-green-100 px-1.5 py-0.5 rounded pointer-events-none"
            title="Searching by first notes"
          >
            ♩ notes
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onSearchCommit?.()}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-green-600 transition-colors z-10"
            title="Search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>
        )}
      </div>
      {/* Show add button when there's a query typed — prominent if no results, subtle otherwise */}
      {hasQuery && onAddNew && (
        <button
          onClick={() => onAddNew(inputVal.trim())}
          title={`Add "${inputVal.trim()}" as a new tune`}
          className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
            noResults
              ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
              : 'border-green-400 text-green-700 hover:bg-green-50'
          }`}
        >
          <span>＋</span>
          <span>{noResults ? `Add "${inputVal.trim()}"` : 'Add new'}</span>
        </button>
      )}
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
      <select
        value={partsFilter}
        onChange={e => onPartsChange?.(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
      >
        <option value="">All Parts</option>
        <option value="2">2 parts</option>
        <option value="3">3 parts</option>
        <option value="4+">4+ parts</option>
      </select>
      <div className="flex items-center gap-1.5">
        <select
          value={sort}
          onChange={e => onSortChange?.(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {sort === 'random' && (
          <button
            onClick={onReshuffle}
            className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm hover:bg-gray-50 transition-colors"
            title="Shuffle again"
          >
            🎲
          </button>
        )}
      </div>
      {(inputVal || filters.type || filters.key || filters.status) && (
        <button
          onClick={() => { onChange({ q: '', status: '', type: '', key: '' }); onSearchChange?.('') }}
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
      {userFriends.length > 0 && (
        <select
          value={filters.user_friend_id || ''}
          onChange={e => update('user_friend_id', e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
        >
          <option value="">All players</option>
          {userFriends.map(f => (
            <option key={f.id} value={String(f.id)}>🎵 {f.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}
