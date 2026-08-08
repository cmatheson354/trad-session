import { useEffect, useRef, useState } from 'react'
import { loadAbcjs } from '../abcjsLoader.js'
import { INSTRUMENTS, loadPrefs } from '../constants.js'
import { stopAll, registerSynth, unregisterSynth } from '../audioManager.js'
import { resumeAudio, getEngine } from '../fluidSynth.js'

function buildAbc(notation, program) {
  if (!notation?.trim()) return null
  const midi = `%%MIDI program ${program}`
  const trimmed = notation.trim()
  if (/^X:/m.test(trimmed)) return trimmed.replace(/^(X:[^\n]*)/m, `$1\n${midi}`)
  return `X:1\nM:4/4\nL:1/8\nK:C\n${midi}\n${trimmed}`
}

export default function MiniPlayer({ title, abc, onClose, instrument: instrumentProp, speed: speedProp, isSnippet, onHandoff }) {
  const abcjsRef     = useRef(null)
  const abcSynthRef  = useRef(null)   // active abcjs synth instance (null when using FluidSynth)
  const pollRef      = useRef(null)
  const elapsedRef   = useRef(0)
  const durationRef  = useRef(0)
  const startTimeRef = useRef(null)
  const totalTicksRef = useRef(0)
  const mountedRef   = useRef(true)

  const prefs = loadPrefs()
  const [instrument, setInstrument] = useState(instrumentProp ?? prefs.instrument ?? 73)
  const [speed,      setSpeed]      = useState(speedProp      ?? prefs.speed      ?? 100)
  const [status,     setStatus]     = useState('loading')
  const [elapsed,    setElapsed]    = useState(0)

  useEffect(() => { if (instrumentProp !== undefined) setInstrument(instrumentProp) }, [instrumentProp]) // eslint-disable-line
  useEffect(() => { if (speedProp !== undefined) setSpeed(speedProp) }, [speedProp]) // eslint-disable-line

  useEffect(() => {
    loadAbcjs().then(lib => { abcjsRef.current = lib })
  }, [])

  useEffect(() => () => {
    mountedRef.current = false
    const eng = getEngine()
    if (eng && onHandoff && totalTicksRef.current > 0 && startTimeRef.current != null) {
      onHandoff((Date.now() - startTimeRef.current) / 1000, totalTicksRef.current)
    } else if (abcSynthRef.current && onHandoff && durationRef.current > 0) {
      onHandoff(elapsedRef.current, durationRef.current)
    }
    _stop()
    stopAll()
  }, []) // eslint-disable-line

  useEffect(() => {
    if (status !== 'error') return
    const t = setTimeout(() => { _stop(); onClose() }, 2500)
    return () => clearTimeout(t)
  }, [status]) // eslint-disable-line

  useEffect(() => {
    if (status !== 'stopped' || !isSnippet) return
    const t = setTimeout(() => onClose(), 600)
    return () => clearTimeout(t)
  }, [status, isSnippet]) // eslint-disable-line

  useEffect(() => {
    if (status === 'loading') return
    _play(instrument, speed)
  }, [instrument, speed]) // eslint-disable-line

  useEffect(() => {
    mountedRef.current = true
    _play(instrument, speed)
    return () => { mountedRef.current = false; _stop(); stopAll() }
  }, [abc]) // eslint-disable-line

  function _stop() {
    clearInterval(pollRef.current)
    const eng = getEngine()
    if (eng) { try { eng.synth.stopPlayer() } catch (_) {} }
    if (abcSynthRef.current) {
      const s = abcSynthRef.current
      clearInterval(s._poll)
      clearTimeout(s._timer)
      unregisterSynth(s._stopFn)
      s.stop?.()
      abcSynthRef.current = null
    }
    setStatus('stopped')
  }

  async function _play(prog, spd) {
    _stop()
    if (!abc?.trim()) { setStatus('error'); return }
    setStatus('loading')

    const eng = getEngine()
    if (eng) {
      await _playFluid(eng, prog, spd)
    } else {
      await _playAbcjs(prog, spd)
    }
  }

  async function _playAbcjs(prog, spd) {
    const abcjs = abcjsRef.current
    if (!abcjs?.synth?.supportsAudio()) { setStatus('error'); return }

    const builtAbc = buildAbc(abc, prog)
    if (!builtAbc) { setStatus('error'); return }

    const visualObjs = abcjs.renderAbc('mini-player-hidden', builtAbc, { add_classes: false })
    if (!visualObjs?.length) { setStatus('error'); return }

    const msPerMeasure = visualObjs[0].millisecondsPerMeasure?.() * (100 / spd)
    const synth = new abcjs.synth.CreateSynth()

    const stopFn = () => {
      clearInterval(synth._poll)
      clearTimeout(synth._timer)
      synth.stop?.()
      if (abcSynthRef.current === synth) { abcSynthRef.current = null; setStatus('stopped') }
    }
    synth._stopFn = stopFn
    abcSynthRef.current = synth
    registerSynth(stopFn, 'abcjs-mini')

    let active = true
    try {
      await synth.init({
        visualObj: visualObjs[0],
        ...(msPerMeasure ? { millisecondsPerMeasure: msPerMeasure } : {}),
        onEnded: () => {
          if (!active) return
          clearInterval(synth._poll); clearTimeout(synth._timer)
          if (abcSynthRef.current === synth) abcSynthRef.current = null
          if (mountedRef.current) {
            setStatus('stopped')
            if (isSnippet) setTimeout(() => { if (mountedRef.current) onClose() }, 600)
          }
        },
      })
      await synth.prime()
      if (!active || !mountedRef.current) { stopFn(); return }

      durationRef.current = synth.duration > 0 ? synth.duration : 0
      synth.start()
      setStatus('playing')
      setElapsed(0); elapsedRef.current = 0
      startTimeRef.current = Date.now()

      const poll = setInterval(() => {
        if (!active || abcSynthRef.current !== synth) { clearInterval(poll); return }
        const t = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setElapsed(t); elapsedRef.current = t
      }, 500)
      synth._poll = poll

      if (synth.duration > 0) {
        synth._timer = setTimeout(() => {
          if (!active || abcSynthRef.current !== synth) return
          clearInterval(poll)
          abcSynthRef.current = null
          if (mountedRef.current) { setStatus('stopped'); if (isSnippet) setTimeout(() => { if (mountedRef.current) onClose() }, 600) }
        }, synth.duration * 1000 + 400)
      }
    } catch (e) {
      if (active && mountedRef.current) setStatus('error')
    }
    return () => { active = false }
  }

  async function _playFluid(eng, prog, spd) {
    if (!mountedRef.current) return
    await resumeAudio()

    const abcjs = abcjsRef.current
    if (!abcjs) { setStatus('error'); return }

    const builtAbc = buildAbc(abc, prog)
    if (!builtAbc) { setStatus('error'); return }

    const visual = abcjs.renderAbc('mini-player-hidden', builtAbc, { add_classes: false })
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
      console.error('MiniPlayer FluidSynth:', err)
      if (mountedRef.current) setStatus('error')
      return
    }

    if (!mountedRef.current) { eng.synth.stopPlayer(); return }

    startTimeRef.current = Date.now()
    setStatus('playing')
    setElapsed(0)

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

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-green-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 min-w-72 max-w-lg">
      <div id="mini-player-hidden" style={{ display: 'none' }} />
      <button
        onClick={() => status === 'playing' ? _stop() : _play(instrument, speed)}
        className="w-8 h-8 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center shrink-0 transition-colors"
      >
        {status === 'loading' ? <span className="text-xs animate-pulse">♩</span>
          : status === 'playing' ? <span className="text-xs">■</span>
          : <span className="text-xs ml-0.5">▶</span>}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{title}</p>
        <p className="text-xs text-green-300">
          {status === 'loading' && 'Loading…'}
          {status === 'playing' && `${isSnippet ? 'snippet · ' : ''}${instrLabel} · ${speed}% · ${elapsed}s`}
          {status === 'stopped' && `${instrLabel} · ${speed}%`}
          {status === 'error'   && 'Audio error — closing…'}
        </p>
      </div>
      <button onClick={() => { _stop(); onClose() }} className="text-green-400 hover:text-white text-lg leading-none shrink-0">✕</button>
    </div>
  )
}
