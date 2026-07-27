import { useRef, useState, useEffect, useCallback } from 'react'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

function fmt(s) {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function RecordingPlayer({ src }) {
  const audioRef  = useRef(null)
  const rafRef    = useRef(null)

  const [playing,   setPlaying]   = useState(false)
  const [current,   setCurrent]   = useState(0)
  const [duration,  setDuration]  = useState(0)
  const [speed,     setSpeed]     = useState(1)
  const [loopA,     setLoopA]     = useState(null)  // seconds
  const [loopB,     setLoopB]     = useState(null)  // seconds
  const [loopPhase, setLoopPhase] = useState('idle') // idle | a_set | active

  // Sync speed to audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  // Loop enforcement via requestAnimationFrame (more precise than timeupdate)
  const loopTick = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    setCurrent(el.currentTime)
    if (loopA !== null && loopB !== null && el.currentTime >= loopB) {
      el.currentTime = loopA
    }
    rafRef.current = requestAnimationFrame(loopTick)
  }, [loopA, loopB])

  useEffect(() => {
    if (playing) {
      rafRef.current = requestAnimationFrame(loopTick)
    } else {
      cancelAnimationFrame(rafRef.current)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, loopTick])

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) {
      // If loop active, jump to A
      if (loopA !== null && loopB !== null) el.currentTime = loopA
      el.play()
      setPlaying(true)
    } else {
      el.pause()
      setPlaying(false)
    }
  }

  const handleLoopTap = () => {
    const el = audioRef.current
    if (!el) return
    if (loopPhase === 'idle' || loopPhase === 'active') {
      // Set A point
      setLoopA(el.currentTime)
      setLoopB(null)
      setLoopPhase('a_set')
    } else if (loopPhase === 'a_set') {
      const b = el.currentTime
      if (b <= loopA) {
        // Tapped before A — reset
        setLoopA(null); setLoopB(null); setLoopPhase('idle')
        return
      }
      setLoopB(b)
      setLoopPhase('active')
      // Jump to A and play
      el.currentTime = loopA
      el.play(); setPlaying(true)
    }
  }

  const clearLoop = () => {
    setLoopA(null); setLoopB(null); setLoopPhase('idle')
  }

  const seek = (e) => {
    const el = audioRef.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    el.currentTime = pct * duration
    setCurrent(el.currentTime)
  }

  const progress = duration ? current / duration : 0
  const loopAFrac = duration && loopA !== null ? loopA / duration : null
  const loopBFrac = duration && loopB !== null ? loopB / duration : null

  const loopBtnLabel = loopPhase === 'idle'   ? '⟳ Set A'
                     : loopPhase === 'a_set'  ? '⟳ Set B'
                     : '⟳ Loop'

  const loopBtnStyle = loopPhase === 'active'
    ? 'bg-purple-600 text-white border-purple-600'
    : loopPhase === 'a_set'
    ? 'bg-purple-100 text-purple-700 border-purple-300 animate-pulse'
    : 'border-gray-300 text-gray-500 hover:border-purple-400'

  return (
    <div className="space-y-1.5 mt-1">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onEnded={() => {
          if (loopA !== null && loopB !== null) {
            audioRef.current.currentTime = loopA
            audioRef.current.play()
          } else {
            setPlaying(false)
          }
        }}
        className="hidden"
      />

      {/* Seek bar */}
      <div className="relative h-6 flex items-center cursor-pointer group" onClick={seek}>
        <div className="w-full h-1.5 bg-gray-200 rounded-full relative">
          {/* Loop region highlight */}
          {loopAFrac !== null && loopBFrac !== null && (
            <div
              className="absolute h-full bg-purple-200 rounded-full"
              style={{ left: `${loopAFrac * 100}%`, width: `${(loopBFrac - loopAFrac) * 100}%` }}
            />
          )}
          {/* Playhead */}
          <div
            className="absolute h-full bg-green-600 rounded-full transition-none"
            style={{ width: `${progress * 100}%` }}
          />
          {/* Loop markers */}
          {loopAFrac !== null && (
            <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-purple-600 rounded"
              style={{ left: `${loopAFrac * 100}%` }} />
          )}
          {loopBFrac !== null && (
            <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-purple-600 rounded"
              style={{ left: `${loopBFrac * 100}%` }} />
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Play/Pause */}
        <button onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-green-700 hover:bg-green-600 text-white flex items-center justify-center shrink-0 transition-colors">
          {playing ? '⏸' : '▶'}
        </button>

        {/* Time */}
        <span className="text-xs font-mono text-gray-400 tabular-nums w-16 shrink-0">
          {fmt(current)} / {fmt(duration)}
        </span>

        {/* Speed */}
        <div className="flex items-center gap-0.5 flex-wrap">
          {SPEEDS.map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                speed === s
                  ? 'bg-green-700 text-white'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
              }`}>
              {s}×
            </button>
          ))}
        </div>

        {/* Loop button */}
        <button onClick={handleLoopTap}
          className={`text-xs px-2 py-1 rounded-lg border transition-colors ml-auto ${loopBtnStyle}`}>
          {loopBtnLabel}
        </button>

        {/* Clear loop */}
        {loopPhase !== 'idle' && (
          <button onClick={clearLoop} className="text-xs text-gray-300 hover:text-gray-600">✕</button>
        )}
      </div>

      {/* Speed pitch warning */}
      {speed !== 1 && (
        <p className="text-xs text-amber-600">⚠ Pitch shifts at non-1× speed (phase 2 will fix this)</p>
      )}

      {/* Loop status */}
      {loopPhase === 'a_set' && (
        <p className="text-xs text-purple-600">A set at {fmt(loopA)} — play to a point then tap Set B</p>
      )}
      {loopPhase === 'active' && (
        <p className="text-xs text-purple-600">Looping {fmt(loopA)} → {fmt(loopB)}</p>
      )}
    </div>
  )
}
