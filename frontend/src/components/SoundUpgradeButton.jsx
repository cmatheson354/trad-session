import { useState, useEffect } from 'react'
import { SF_OPTIONS, getSfKey, isSfCached, clearSfCache, initEngine } from '../soundManager.js'

export default function SoundUpgradeButton() {
  const [cached,   setCached]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState(0)
  const [open,     setOpen]     = useState(false)
  const [error,    setError]    = useState(null)
  const [done,     setDone]     = useState(false)

  useEffect(() => { isSfCached().then(v => { setCached(v); if (v) setDone(true) }) }, [])

  const handlePreload = async () => {
    setLoading(true)
    setProgress(0)
    setError(null)
    try {
      await initEngine({
        onStage: stage => { if (stage === 'ready') setDone(true) },
        onSfProgress: pct => setProgress(pct),
      })
      setCached(true)
      setOpen(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    await clearSfCache()
    setCached(false)
    setDone(false)
  }

  const opt  = SF_OPTIONS[getSfKey()] || SF_OPTIONS.fluid
  const icon = done ? '🔊' : '🔈'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Sound quality"
        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-1 transition-colors"
      >
        {icon} <span className="hidden sm:inline">Sound</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-76 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Audio Engine</p>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 space-y-1">
            <p className="text-xs text-gray-600 font-medium">FluidSynth WASM + SF3 SoundFont</p>
            <p className="text-xs text-gray-400">High-quality sample-based synthesis, fully client-side rendered.</p>
          </div>

          <div className={`rounded-lg border p-2.5 ${done ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  {opt.label}
                  {done && <span className="ml-1.5 text-xs text-green-600 font-medium">✓ Cached</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                <p className="text-xs text-gray-400 mt-0.5">{opt.size} · downloads on first play</p>
              </div>
              {cached ? (
                <button
                  onClick={handleClear}
                  className="shrink-0 text-xs px-2 py-1 rounded-md bg-red-50 text-red-600 hover:bg-red-100"
                  title="Clear cached soundfont"
                >🗑</button>
              ) : loading ? (
                <div className="text-xs text-green-600 shrink-0 text-right">
                  <div className="font-medium">{progress}%</div>
                  <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                    <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handlePreload}
                  className="shrink-0 text-xs bg-green-600 text-white px-2.5 py-1 rounded-md hover:bg-green-700 font-medium"
                >
                  ⬇ Pre-load
                </button>
              )}
            </div>
            {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
          </div>

          <p className="text-xs text-gray-400 px-1">
            Soundfont loads automatically on first play. Pre-load it here for instant start.
          </p>
        </div>
      )}
    </div>
  )
}
