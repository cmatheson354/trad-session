import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

// ── helpers (mirrors TuneSearch) ───────────────────────────────────────────
function parseMode(str) {
  if (!str) return { key: '', mode: '' }
  const modeMap = [
    ['mixolydian','mixolydian'],['dorian','dorian'],['aeolian','aeolian'],
    ['lydian','lydian'],['locrian','locrian'],['major','major'],['minor','minor'],
    ['mix','mixolydian'],['dor','dorian'],['aeo','aeolian'],
    ['lyd','lydian'],['loc','locrian'],['maj','major'],['min','minor'],
  ]
  const lower = str.toLowerCase()
  for (const [suffix, mode] of modeMap) {
    if (lower.endsWith(suffix)) return { key: str.slice(0, str.length - suffix.length), mode }
  }
  return { key: str, mode: '' }
}
function normaliseType(t) { return (t || 'reel').replace(/\s+/g, '_').toLowerCase() }

// ── ImportExportModal ──────────────────────────────────────────────────────
export default function ImportExportModal({ onClose, onImported, existingTunes, initialTab = 'import' }) {
  const [tab, setTab] = useState(initialTab)

  // ── Import state ──────────────────────────────────────────────────────
  const [step,     setStep]    = useState('input')   // input | searching | review | adding | done
  const [text,     setText]    = useState('')
  const [matches,  setMatches] = useState([])        // {query,match,selected,alreadyOwned}
  const [progress, setProgress]= useState({ done: 0, total: 0 })
  const [searchProgress, setSearchProgress] = useState({ done: 0, total: 0 })
  const abortRef = useRef(false)

  // ── Export state ──────────────────────────────────────────────────────
  const [exportText,  setExportText]  = useState('')
  const [withDetails, setWithDetails] = useState(false)
  const [copied,      setCopied]      = useState(false)

  useEffect(() => {
    if (tab === 'export') loadExport()
  }, [tab, withDetails]) // eslint-disable-line

  const loadExport = async () => {
    const tunes = await api.tunes.list().catch(() => [])
    if (withDetails) {
      setExportText(tunes.map(t => {
        const parts = [t.tune_type?.replace('_', ' ')]
        if (t.tune_key) parts.push(t.tune_key)
        if (t.mode)     parts.push(t.mode)
        return `${t.title} (${parts.filter(Boolean).join(', ')})`
      }).join(', '))
    } else {
      setExportText(tunes.map(t => t.title).join(', '))
    }
  }

  const handleSearch = async () => {
    const names = text.split(',').map(s => s.trim()).filter(Boolean)
    if (!names.length) return
    abortRef.current = false
    setStep('searching')
    setSearchProgress({ done: 0, total: names.length })

    const existingTitles = new Set(existingTunes.map(t => t.title.toLowerCase()))
    const results = []

    for (let i = 0; i < names.length; i += 5) {
      if (abortRef.current) break
      const batch = names.slice(i, i + 5)
      const batchResults = await Promise.all(batch.map(async name => {
        // strip parenthetical detail if present e.g. "The Kesh Jig (jig, G major)"
        const cleanName = name.replace(/\s*\(.*?\)\s*$/, '').trim()
        try {
          const res = await api.thesession.search(cleanName)
          const match = Array.isArray(res) && res.length > 0 ? res[0] : null
          const alreadyOwned = match ? existingTitles.has(match.name.toLowerCase()) : false
          return { query: name, cleanName, match, selected: !!match && !alreadyOwned, alreadyOwned }
        } catch {
          return { query: name, cleanName, match: null, selected: false, alreadyOwned: false }
        }
      }))
      results.push(...batchResults)
      setSearchProgress({ done: Math.min(i + 5, names.length), total: names.length })
      if (i + 5 < names.length) await new Promise(r => setTimeout(r, 250))
    }

    setMatches(results)
    setStep('review')
  }

  const toggleMatch = (idx) => {
    setMatches(prev => prev.map((m, i) => i === idx ? { ...m, selected: !m.selected } : m))
  }

  const handleAdd = async () => {
    const toAdd = matches.filter(m => m.selected && m.match)
    if (!toAdd.length) return
    setProgress({ done: 0, total: toAdd.length })
    setStep('adding')

    for (let i = 0; i < toAdd.length; i++) {
      const m = toAdd[i]
      try {
        const detail = await api.thesession.getTune(m.match.id)
        const { key, mode } = parseMode(detail.mode || '')
        await api.tunes.create({
          title: detail.name || m.match.name,
          tune_type: normaliseType(detail.type || m.match.type),
          tune_key: key || null,
          mode: mode || null,
          abc_notation: detail.abc || null,
          thesession_id: m.match.id,
          status: 'want_to_learn',
        })
      } catch (e) {
        console.error('Failed to add', m.query, e)
      }
      setProgress({ done: i + 1, total: toAdd.length })
    }

    onImported()
    setStep('done')
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(exportText).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const blob = new Blob([exportText], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'trad-tunes.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const selectedCount = matches.filter(m => m.selected).length
  const foundCount    = matches.filter(m => m.match).length

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-green-800 text-white rounded-t-2xl px-6 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold">Import / Export</h2>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 shrink-0">
          {['import','export'].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t === 'import') setStep('input') }}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? 'text-green-700 border-b-2 border-green-700 bg-green-50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'import' ? '⬇ Import' : '⬆ Export'}
            </button>
          ))}
        </div>

        {/* ── IMPORT TAB ── */}
        {tab === 'import' && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {step === 'input' && (
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600">
                  Paste a comma-separated list of tune names. Each will be searched on The Session — review the matches before adding.
                </p>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="The Kesh Jig, Morning Dew, Toss the Feathers, Cooley's Reel, ..."
                  rows={6}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y font-mono"
                  autoFocus
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">
                    {text.split(',').filter(s => s.trim()).length} tune{text.split(',').filter(s => s.trim()).length !== 1 ? 's' : ''} detected
                  </span>
                  <button
                    onClick={handleSearch}
                    disabled={!text.trim()}
                    className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-40"
                  >
                    Search The Session →
                  </button>
                </div>
              </div>
            )}

            {step === 'searching' && (
              <div className="p-10 text-center space-y-3">
                <p className="text-gray-600 font-medium">Searching The Session…</p>
                <div className="w-full bg-gray-100 rounded-full h-2 max-w-xs mx-auto">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${searchProgress.total ? (searchProgress.done / searchProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400">{searchProgress.done} / {searchProgress.total}</p>
              </div>
            )}

            {step === 'review' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0">
                  <span className="text-sm text-gray-600">
                    <strong>{foundCount}</strong> of <strong>{matches.length}</strong> found · <strong>{selectedCount}</strong> selected
                  </span>
                  <button onClick={() => setStep('input')} className="ml-auto text-sm text-gray-400 hover:text-gray-600 underline">
                    ← Back
                  </button>
                </div>
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-500 w-8">
                          <input
                            type="checkbox"
                            checked={matches.every(m => m.selected || !m.match || m.alreadyOwned)}
                            onChange={e => setMatches(prev => prev.map(m =>
                              m.match && !m.alreadyOwned ? { ...m, selected: e.target.checked } : m
                            ))}
                            className="rounded"
                          />
                        </th>
                        <th className="px-4 py-2 text-left font-medium text-gray-500">Your Input</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-500">Best Match</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-500">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {matches.map((m, i) => (
                        <tr key={i} className={`${!m.match || m.alreadyOwned ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={m.selected}
                              disabled={!m.match || m.alreadyOwned}
                              onChange={() => toggleMatch(i)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-2 text-gray-500 italic truncate max-w-32">{m.cleanName}</td>
                          <td className="px-4 py-2 font-medium text-gray-900">
                            {m.alreadyOwned
                              ? <span className="text-blue-600">{m.match.name} <span className="text-xs font-normal">(already in library)</span></span>
                              : m.match
                                ? m.match.name
                                : <span className="text-red-400">Not found</span>
                            }
                          </td>
                          <td className="px-4 py-2 text-gray-400 capitalize">{m.match?.type ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                  <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 border border-gray-300 rounded-lg">
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={selectedCount === 0}
                    className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-40"
                  >
                    Add {selectedCount} tune{selectedCount !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}

            {step === 'adding' && (
              <div className="p-10 text-center space-y-3">
                <p className="text-gray-600 font-medium">Adding tunes…</p>
                <div className="w-full bg-gray-100 rounded-full h-2 max-w-xs mx-auto">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400">{progress.done} / {progress.total}</p>
              </div>
            )}

            {step === 'done' && (
              <div className="p-10 text-center space-y-4">
                <p className="text-5xl">✅</p>
                <p className="text-lg font-semibold text-gray-800">
                  {progress.total} tune{progress.total !== 1 ? 's' : ''} added!
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => { setText(''); setMatches([]); setStep('input') }}
                    className="text-sm text-green-700 underline hover:text-green-900"
                  >
                    Import more
                  </button>
                  <button
                    onClick={onClose}
                    className="bg-green-700 hover:bg-green-600 text-white font-semibold px-5 py-2 rounded-lg transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── EXPORT TAB ── */}
        {tab === 'export' && (
          <div className="p-6 space-y-4 flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-3 shrink-0">
              <p className="text-sm text-gray-600">Your tune list as comma-separated text.</p>
              <label className="ml-auto flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={withDetails}
                  onChange={e => setWithDetails(e.target.checked)}
                  className="rounded"
                />
                Include type &amp; key
              </label>
            </div>
            <textarea
              value={exportText}
              readOnly
              rows={10}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 font-mono resize-none flex-1"
            />
            <div className="flex gap-3 shrink-0">
              <button
                onClick={handleCopy}
                className={`flex-1 font-semibold py-2 rounded-lg transition-colors ${
                  copied
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : 'bg-green-700 hover:bg-green-600 text-white'
                }`}
              >
                {copied ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Download .txt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
