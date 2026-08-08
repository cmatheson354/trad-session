import { useEffect, useRef, useState } from 'react'
import { loadAbcjs } from '../abcjsLoader.js'
import { INSTRUMENTS, loadPrefs } from '../constants.js'
import { stopAll, registerSynth } from '../audioManager.js'
import { initEngine, resumeAudio, getEngine } from '../fluidSynth.js'

function buildAbc(notation, program) {
  if (!notation?.trim()) return null
  const midi    = `%%MIDI program ${program}`
  const trimmed = notation.trim()
  if (/^X:/m.test(trimmed)) return trimmed.replace(/^(X:[^\n]*)/m, `$1\n${midi}`)
  return `X:1\nM:4/4\nL:1/8\nK:C\n${midi}\n${trimmed}`
}

export default function MiniPlayer({ title, abc, onClose, instrument: instrumentProp, speed: speedProp, isSnippet, onHandoff }) {
  const mountedRef   = useRef(true)
  const pollRef      = useRef(null)
  const startTimeRef = useRef(null)
  const totalTicksRef = useRef(0)
  const abcjsRef     = useRef(null)

  const prefs = loadPrefs()
  const [instrument, setInstrument] = useState(instrumentProp ?? prefs.instrument ?? 73)
  const [speed,      setSpeed]      = useState(speedProp      ?? prefs.speed      ?? 100)
  const [status,     setStatus]     = useState('loading')
  const [elapsed,    setElapsed]    = useState(0)
  const [sfPct,      setSfPct]      = useState(0)

  useEffect(() => { if (instrumentProp !== undefined) setInstrument(instrumentProp) }, [instrumentProp]) // eslint-disable-line
  useEffect(() => { if (speedProp !== undefined)      setSpeed(speedProp)           }, [speedProp])      // eslint-disable-line

  // Re-play when instrument/speed changes mid-session
  useEffect(() => {
    if (status === 'loading' || status === 'sf_loading') return
    _play(instrument, speed)
  }, [instrument, speed]) // eslint-disable-line

  useEffect(() => {
    loadAbcjs().then(lib => { abcjsRef.current = lib })
  }, []) // eslint-disable-line

  useEffect(() => {
    _play(instrument, speed)
    return () => {
      mountedRef.current = false
      clearInterval(pollRef.current)
      // Report handoff position if caller wants it
      const e = getEngine()
      if (e && onHandoff && totalTicksRef.current > 0 && startTimeRef.current != null) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000
        onHandoff(elapsed, totalTicksRef.current)
      }
      stopAll()
    }
  }, [abc]) // eslint-disable-line

  async function _play(prog, spd) {
    clearInterval(pollRef.current)
    if (!abc?.trim()) { setStatus('error'); return }

    setStatus('loading')

    let eng = getEngine()
    if (!eng) {
      try {
        eng = await initEngine({
          onStage: stage => {
            if (!mountedRef.current) return
            if (stage === 'soundfont') setStatus('sf_loading')
            if (stage === 'ready')     setStatus('loading')
          },
          onSfProgress: pct => { if (mountedRef.current) setSfPct(pct) },
        })
      } catch (err) {
        console.error('MiniPlayer FluidSynth init:', err)
        if (mountedRef.current) { setStatus('error'); setTimeout(() => { if (mountedRef.current) onClose() }, 2500) }
        return
      }
    }

    if (!mountedRef.current) return
    await resumeAudio()

    // Build MIDI via abcjs
    const abcjs = abcjsRef.current
    if (!abcjs) { setStatus('error'); return }

    const builtAbc = buildAbc(abc, prog)
    if (!builtAbc) { setStatus('error'); return }

    // Render to get timing info
    const hiddenEl = document.getElementById('mini-player-hidden')
    if (!hiddenEl) { setStatus('error'); return }
    const visual = abcjs.renderAbc(hiddenEl, builtAbc, { add_classes: false })
    if (!visual?.length) { setStatus('error'); return }

    const msNat = visual[0].millisecondsPerMeasure?.() || 0
    const midiOpts = { midiOutputType: 'array' }
    if (msNat > 0) midiOpts.millisecondsPerMeasure = msNat * (100 / spd)
    const midiArr = abcjs.synth.getMidiFile(builtAbc, midiOpts)
    if (!midiArr) { setStatus('error'); return }

    stopAll()
    registerSynth(() => { try { eng.synth.stopPlayer() } catch (_) {} }, 'fluid-mini')

    try {
      await eng.synth.resetPlayer()
      await eng.synth.addSMFDataToPlayer(midiArr.buffer)

      const totalTicks = await eng.synth.retrievePlayerTotalTicks()
      totalTicksRef.current = totalTicks

      await eng.synth.playPlayer()
    } catch (err) {
      console.error('MiniPlayer playback:', err)
      if (mountedRef.current) { setStatus('error'); setTimeout(() => { if (mountedRef.current) onClose() }, 2500) }
      return
    }

    if (!mountedRef.current) { eng.synth.stopPlayer(); return }

    startTimeRef.current = Date.now()
    setStatus('playing')
    setElapsed(0)

    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) { clearInterval(pollRef.current); return }
      const e = getEngine()
      if (!e?.synth) { clearInterval(pollRef.current); return }
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      try {
        const cur = await e.synth.retrievePlayerCurrentTick()
        const tot = totalTicksRef.current || 1
        if (!e.synth.isPlayerPlaying() && cur >= tot - 10) {
          clearInterval(pollRef.current)
          if (mountedRef.current) {
            setStatus('stopped')
            if (isSnippet) setTimeout(() => { if (mountedRef.current) onClose() }, 600)
          }
        }
      } catch (_) {}
    }, 500)
  }

  const instrLabel = INSTRUMENTS.find(i => i.program === instrument)?.label ?? '?'
  const isLoading  = status === 'loading' || status === 'sf_loading'

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-green-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 min-w-72 max-w-lg">
      <div id="mini-player-hidden" style={{ display: 'none' }} />
      <button
        onClick={() => status === 'playing'
          ? (getEngine()?.synth?.stopPlayer(), clearInterval(pollRef.current), setStatus('stopped'))
          : _play(instrument, speed)
        }
        className="w-8 h-8 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center shrink-0 transition-colors"
      >
        {isLoading
          ? <span className="text-xs animate-pulse">♩</span>
          : status === 'playing' ? <span className="text-xs">■</span>
          : <span className="text-xs ml-0.5">▶</span>}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{title}</p>
        <p className="text-xs text-green-300">
          {status === 'sf_loading' && `Downloading soundfont… ${sfPct}%`}
          {status === 'loading'    && 'Loading…'}
          {status === 'playing'    && `${isSnippet ? 'snippet · ' : ''}${instrLabel} · ${speed}% · ${elapsed}s`}
          {status === 'stopped'    && `${instrLabel} · ${speed}%`}
          {status === 'error'      && 'Audio error — closing…'}
        </p>
      </div>
      <button onClick={() => { stopAll(); clearInterval(pollRef.current); onClose() }} className="text-green-400 hover:text-white text-lg leading-none shrink-0">✕</button>
    </div>
  )
}
