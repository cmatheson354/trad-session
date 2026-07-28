import { useEffect, useRef, useState } from 'react'
import abcjs from 'abcjs'
import { INSTRUMENTS, loadPrefs } from '../constants.js'
import { registerSynth, unregisterSynth, stopAll } from '../audioManager.js'

function buildAbc(notation, program) {
  if (!notation?.trim()) return null
  return `%%MIDI program ${program}\n${notation.trim()}`
}

export default function MiniPlayer({ title, abc, onClose, instrument: instrumentProp, speed: speedProp, isSnippet }) {
  const hiddenId  = 'mini-player-hidden-notation'
  const synthRef  = useRef(null)
  const [status,  setStatus]  = useState('loading')
  const [elapsed, setElapsed] = useState(0)

  const prefs = loadPrefs()
  const [instrument, setInstrument] = useState(instrumentProp ?? prefs.instrument ?? 73)
  const [speed,      setSpeed]      = useState(speedProp      ?? prefs.speed      ?? 100)

  useEffect(() => { if (instrumentProp !== undefined) setInstrument(instrumentProp) }, [instrumentProp]) // eslint-disable-line
  useEffect(() => { if (speedProp !== undefined)      setSpeed(speedProp)           }, [speedProp])      // eslint-disable-line

  useEffect(() => () => stopAll(), []) // eslint-disable-line

  const markStopped = (synth) => {
    // Only update state if this synth is still the active one
    if (synthRef.current === synth) {
      synthRef.current = null
    }
    setStatus('stopped')
  }

  const stop = () => {
    clearInterval(synthRef.current?._poll)
    clearTimeout(synthRef.current?._durationTimer)
    if (synthRef.current) {
      unregisterSynth(synthRef.current._stopFn)
      synthRef.current.stop?.()
      synthRef.current = null
    }
    setStatus('stopped')
  }

  const play = async (prog, spd) => {
    stop()
    if (!abc?.trim() || !abcjs.synth.supportsAudio()) { setStatus('error'); return }
    setStatus('loading')

    const builtAbc = buildAbc(abc, prog)
    const visualObjs = abcjs.renderAbc(hiddenId, builtAbc, { add_classes: false })
    if (!visualObjs?.length) { setStatus('error'); return }

    const msPerMeasure = visualObjs[0].millisecondsPerMeasure
      ? visualObjs[0].millisecondsPerMeasure() * (100 / spd)
      : undefined

    const synth = new abcjs.synth.CreateSynth()

    // stopFn is called by audioManager when another player starts — must update UI state
    const stopFn = () => {
      clearInterval(synth._poll)
      clearTimeout(synth._durationTimer)
      synth.stop?.()
      markStopped(synth)
    }
    synth._stopFn = stopFn
    synthRef.current = synth
    registerSynth(stopFn, 'synth')

    let active = true
    try {
      await synth.init({
        visualObj: visualObjs[0],
        ...(msPerMeasure ? { millisecondsPerMeasure: msPerMeasure } : {}),
        onEnded: () => {
          if (!active) return
          clearInterval(synth._poll)
          clearTimeout(synth._durationTimer)
          markStopped(synth)
        },
      })
      await synth.prime()
      if (!active) return

      const durationMs = synth.duration > 0 ? synth.duration * 1000 : null
      synth.start()
      setStatus('playing')
      setElapsed(0)

      const startTime = Date.now()
      const poll = setInterval(() => {
        if (!active || !synthRef.current) { clearInterval(poll); return }
        const t = Math.floor((Date.now() - startTime) / 1000)
        setElapsed(t)
        // Last-resort fallback: if we've run past expected duration, stop
        if (durationMs && t * 1000 > durationMs + 800) {
          clearInterval(poll)
          markStopped(synth)
        }
      }, 500)
      synth._poll = poll

      // Primary fallback timer (fires if onEnded doesn't)
      if (durationMs) {
        const timer = setTimeout(() => {
          if (!active || synthRef.current !== synth) return
          clearInterval(synth._poll)
          markStopped(synth)
        }, durationMs + 400)
        synth._durationTimer = timer
      }
    } catch (e) {
      if (active) setStatus('error')
    }

    return () => { active = false }
  }

  useEffect(() => {
    let cleanup
    play(instrument, speed).then(fn => { cleanup = fn })
    return () => {
      cleanup?.()
      clearInterval(synthRef.current?._poll)
      if (synthRef.current) {
        unregisterSynth(synthRef.current._stopFn)
        synthRef.current.stop?.()
        synthRef.current = null
      }
    }
  }, [abc]) // eslint-disable-line

  useEffect(() => {
    if (status !== 'error') return
    const t = setTimeout(() => { stop(); onClose() }, 2500)
    return () => clearTimeout(t)
  }, [status]) // eslint-disable-line

  // Auto-close snippet once stopped
  useEffect(() => {
    if (status !== 'stopped' || !isSnippet) return
    const t = setTimeout(() => onClose(), 600)
    return () => clearTimeout(t)
  }, [status, isSnippet]) // eslint-disable-line

  useEffect(() => {
    if (status === 'playing' || status === 'loading') play(instrument, speed)
  }, [instrument, speed]) // eslint-disable-line

  const instrLabel = INSTRUMENTS.find(i => i.program === instrument)?.label ?? '?'

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-green-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 min-w-72 max-w-lg">
      <div id={hiddenId} style={{ display: 'none' }} />

      <button
        onClick={() => status === 'playing' ? stop() : play(instrument, speed)}
        className="w-8 h-8 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center shrink-0 transition-colors"
      >
        {status === 'loading' ? (
          <span className="text-xs animate-pulse">…</span>
        ) : status === 'playing' ? (
          <span className="text-xs">■</span>
        ) : (
          <span className="text-xs ml-0.5">▶</span>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{title}</p>
        <p className="text-xs text-green-300">
          {status === 'loading' && 'Loading…'}
          {status === 'playing' && `${isSnippet ? 'snippet · ' : ''}${instrLabel} · ${speed}% · ${elapsed}s`}
          {status === 'stopped' && `${instrLabel} · ${speed}%`}
          {status === 'error'   && 'No audio — closing…'}
        </p>
      </div>

      <button onClick={() => { stop(); onClose() }} className="text-green-400 hover:text-white text-lg leading-none shrink-0">✕</button>
    </div>
  )
}
