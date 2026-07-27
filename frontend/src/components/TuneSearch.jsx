import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

const TYPE_COLORS = {
  reel:       'bg-green-100 text-green-800',
  jig:        'bg-blue-100 text-blue-800',
  'slip jig': 'bg-purple-100 text-purple-800',
  hornpipe:   'bg-red-100 text-red-800',
  polka:      'bg-orange-100 text-orange-800',
  waltz:      'bg-teal-100 text-teal-800',
  air:        'bg-indigo-100 text-indigo-800',
  mazurka:    'bg-pink-100 text-pink-800',
  march:      'bg-amber-100 text-amber-800',
}

// "Dmajor" / "Edor" → { key: "D", mode: "major" }
function parseMode(str) {
  if (!str) return { key: '', mode: '' }
  const modeMap = [
    ['mixolydian', 'mixolydian'], ['dorian', 'dorian'], ['aeolian', 'aeolian'],
    ['lydian', 'lydian'], ['locrian', 'locrian'], ['major', 'major'], ['minor', 'minor'],
    ['mix', 'mixolydian'], ['dor', 'dorian'], ['aeo', 'aeolian'],
    ['lyd', 'lydian'], ['loc', 'locrian'], ['maj', 'major'], ['min', 'minor'],
  ]
  const lower = str.toLowerCase()
  for (const [suffix, mode] of modeMap) {
    if (lower.endsWith(suffix)) {
      return { key: str.slice(0, str.length - suffix.length), mode }
    }
  }
  return { key: str, mode: '' }
}

function normaliseType(t) {
  return (t || 'reel').replace(/\s+/g, '_').toLowerCase()
}

export default function TuneSearch({ onSelect, onPlay, onClose, onManualAdd }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [adding,  setAdding]  = useState(null)
  const [added,   setAdded]   = useState(new Set())
  // Per-item play state: id → 'loading' | 'playing'
  const [playState, setPlayState]   = useState({})
  // Cache fetched details to avoid re-fetching
  const detailCache = useRef({})

  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (query.length < 2) { setResults([]); setError(''); return }
    const t = setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const data = await api.thesession.search(query)
        setResults(Array.isArray(data) ? data : [])
        if (!Array.isArray(data)) setError('Search failed — The Session may be unavailable.')
      } catch (e) {
        setError('Search failed: ' + e.message); setResults([])
      } finally { setLoading(false) }
    }, 350)
    return () => clearTimeout(t)
  }, [query])

  const fetchDetail = async (item) => {
    if (detailCache.current[item.id]) return detailCache.current[item.id]
    const detail = await api.thesession.getTune(item.id)
    detailCache.current[item.id] = detail
    return detail
  }

  const handleAdd = async (item) => {
    setAdding(item.id)
    try {
      const detail = await fetchDetail(item)
      const { key, mode } = parseMode(detail.mode || '')
      onSelect({
        title: detail.name || item.name,
        tune_type: normaliseType(detail.type || item.type),
        tune_key: key || null,
        mode: mode || null,
        abc_notation: detail.abc || null,
        thesession_id: item.id,
        status: 'want_to_learn',
        notes: null,
      })
      setAdded(prev => new Set([...prev, item.id]))
    } catch (e) {
      alert('Could not fetch tune details: ' + e.message)
    } finally { setAdding(null) }
  }

  const handlePlay = async (item) => {
    setPlayState(prev => ({ ...prev, [item.id]: 'loading' }))
    try {
      const detail = await fetchDetail(item)
      if (!detail.abc) {
        setPlayState(prev => ({ ...prev, [item.id]: null }))
        alert('No ABC notation available for this tune on The Session.')
        return
      }
      setPlayState(prev => ({ ...prev, [item.id]: 'ready' }))
      onPlay({ title: item.name, abc: detail.abc })
    } catch (e) {
      setPlayState(prev => ({ ...prev, [item.id]: null }))
      alert('Could not load tune: ' + e.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-green-800 text-white rounded-t-2xl px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold">Find a Tune</h2>
            <p className="text-green-300 text-sm">Search The Session for tunes to add</p>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Search input */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Morning Dew, Toss the Feathers, Kesh Jig…"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            {loading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs animate-pulse">searching…</span>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {error && <div className="px-6 py-4 text-sm text-red-600 bg-red-50">{error}</div>}

          {!loading && query.length >= 2 && results.length === 0 && !error && (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">No tunes found for "{query}"</div>
          )}
          {query.length < 2 && (
            <div className="px-6 py-10 text-center text-gray-400 text-sm">Type at least 2 characters to search</div>
          )}

          {results.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {results.map(item => {
                const isAdding  = adding === item.id
                const isAdded   = added.has(item.id)
                const ps        = playState[item.id]
                return (
                  <li key={item.id} className="px-6 py-3 flex items-center gap-2 hover:bg-gray-50">
                    {/* Play button */}
                    <button
                      onClick={() => handlePlay(item)}
                      disabled={ps === 'loading'}
                      className="w-7 h-7 rounded-full bg-green-700 hover:bg-green-600 text-white flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                      title="Preview"
                    >
                      {ps === 'loading'
                        ? <span className="text-xs animate-pulse">…</span>
                        : <span className="text-xs ml-0.5">▶</span>}
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.type && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[item.type] ?? 'bg-gray-100 text-gray-700'}`}>
                            {item.type}
                          </span>
                        )}
                        {item.alias && (
                          <span className="text-xs text-gray-400 italic truncate max-w-32">aka {item.alias}</span>
                        )}
                      </div>
                    </div>

                    {/* Add button */}
                    <button
                      onClick={() => handleAdd(item)}
                      disabled={isAdding || isAdded}
                      className={`shrink-0 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        isAdded
                          ? 'bg-green-100 text-green-700 cursor-default'
                          : 'bg-green-700 hover:bg-green-600 text-white disabled:opacity-50'
                      }`}
                    >
                      {isAdding ? '…' : isAdded ? 'Added ✓' : 'Add'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={onManualAdd}
            className="text-sm text-green-700 hover:text-green-900 border border-green-300 hover:border-green-500 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>✏️</span> Manual Add
          </button>
          {results.length > 0 && (
            <span className="text-xs text-gray-400">
              Results from{' '}
              <a href="https://thesession.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
                thesession.org
              </a>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
