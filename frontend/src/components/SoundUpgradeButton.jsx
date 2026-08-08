import { useState, useCallback } from 'react'
import { initEngine, getEngine, isSfCached, clearSfCache, SF_OPTIONS, getSfKey } from '../soundManager.js'

export default function SoundUpgradeButton({ className = '' }) {
  const [sfKey,    setSfKey]    = useState(() => getSfKey())
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState(null)
  const [error,    setError]    = useState(null)
  const [engine,   setEngine]   = useState(() => getEngine())
  const [cached,   setCached]   = useState(() => isSfCached(getSfKey()))

  const handleLoad = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      await initEngine({
        onProgress: (pct) => setProgress(pct),
        onReady: () => { setEngine(getEngine()); setCached(isSfCached(getSfKey())); setLoading(false); setProgress(null) },
        onError: (msg) => { setError(msg); setLoading(false); setProgress(null) },
      })
    } catch (e) {
      setError(e.message || 'Load failed')
      setLoading(false); setProgress(null)
    }
  }, [])

  const handleClear = useCallback(async () => {
    try {
      clearSfCache(sfKey)
      setCached(false)
    } catch (e) {
      setError(e.message || 'Clear failed')
    }
  }, [sfKey])

  const fluidActive = !!engine

  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}>
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audio Engine</p>
      </div>

      {/* Tier 0 */}
      <div className={`px-4 py-3 flex items-start gap-3 border-b border-gray-100 ${fluidActive ? 'opacity-60' : ''}`}>
        <div className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-green-100 text-green-700 text-xs font-bold">0</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">Built-in Web Audio <span className="text-xs font-normal text-gray-500">(abcjs)</span></p>
          <p className="text-xs text-gray-500 mt-0.5">No download · Always available · Good for previews</p>
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${fluidActive ? 'bg-gray-100 text-gray-400' : 'bg-green-100 text-green-700'}`}>
          {fluidActive ? 'Standby' : '✓ Active'}
        </span>
      </div>

      {/* Tier 1 */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-blue-100 text-blue-700 text-xs font-bold">1</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">FluidSynth WASM + SF3</p>
          <p className="text-xs text-gray-500 mt-0.5">High-quality sample synthesis · 23 MB download</p>
          <div className="mt-1">
            <select
              value={sfKey}
              onChange={e => { setSfKey(e.target.value); setEngine(null) }}
              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-700"
              disabled={loading || fluidActive}
            >
              {SF_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          {loading && progress != null && (
            <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {fluidActive ? (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">✓ Active</span>
          ) : loading ? (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-500 animate-pulse">Loading…</span>
          ) : (
            <button
              onClick={handleLoad}
              className="text-xs px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
            >
              {cached ? 'Load ⚡' : 'Pre-load ⬇'}
            </button>
          )}
          {cached && !fluidActive && !loading && (
            <button onClick={handleClear} className="text-xs text-gray-400 hover:text-red-500 transition-colors" title="Clear cache">
              🗑 Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
