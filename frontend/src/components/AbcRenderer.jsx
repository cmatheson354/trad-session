import { useEffect, useRef, useState, useCallback } from 'react'
import 'abcjs/abcjs-audio.css'
import { loadAbcjs } from '../abcjsLoader.js'
import { INSTRUMENTS, loadPrefs } from '../constants.js'
import { stopAll, registerSynth } from '../audioManager.js'
import { initEngine, resumeAudio, getEngine, SF_OPTIONS, getSfKey } from '../fluidSynth.js'

// ─── ABC helpers ──────────────────────────────────────────────────────────────

function buildAbc(notation, program, tuneKey, mode, tuneType) {
  if (!notation?.trim()) return null
  const trimmed = notation.trim()
  const midi    = `%%MIDI program ${program}`
  if (/^X:/m.test(trimmed)) return trimmed.replace(/^(X:[^\n]*)/m, `$1\n${midi}`)
  const METER  = { reel: '4/4', jig: '6/8', 'slip jig': '9/8', hornpipe: '4/4', polka: '2/4', waltz: '3/4', march: '4/4' }
  const meter  = METER[tuneType] ?? '4/4'
  const keyStr = tuneKey
    ? `${tuneKey}${mode && mode !== 'major' ? mode.charAt(0).toUpperCase() + mode.slice(1) : ''}`
    : 'D'
  return `X:1\nM:${meter}\nL:1/8\nK:${keyStr}\n${midi}\n${trimmed}`
}

// ─── ABC text view with live note highlight ───────────────────────────────────

function AbcTextHighlight({ notation, startChar, endChar }) {
  if (!notation?.trim()) return null
  const pre  = notation.slice(0, startChar ?? notation.length)
  const hi   = startChar != null ? notation.slice(startChar, endChar ?? startChar + 1) : ''
  const post = startChar != null ? notation.slice(endChar ?? startChar + 1) : ''
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-3 overflow-x-auto">
      <pre className="font-mono text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">
        {pre}
        {hi && <mark style={{ background: '#FFBF00', color: '#000', borderRadius: 2, padding: '0 1px' }}>{hi}</mark>}
        {post}
      </pre>
    </div>
  )
}

// ─── Player controls bar ──────────────────────────────────────────────────────

function PlayerBar({ state, progress, loop, sfPct, onPlay, onPause, onStop, onSeek, onLoopToggle }) {
  const isLoading = ['init_worklet', 'init_sf', 'loading_midi'].includes(state)
  const isPlaying = state === 'playing'
  const canStop   = state === 'playing' || state === 'paused'

  return (
    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      {/* Play / Pause */}
      <button
        disabled={isLoading && state !== 'init_sf'}
        onClick={isPlaying ? onPause : onPlay}
        className="w-7 h-7 rounded-full bg-green-600 hover:bg-green-500 disabled:bg-gray-300 text-white flex items-center justify-center shrink-0 transition-colors text-xs"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isLoading
          ? <span className="animate-pulse text-base leading-none">♩</span>
          : isPlaying ? '⏸' : '▶'}
      </button>

      {/* Stop */}
      <button
        disabled={!canStop}
        onClick={onStop}
        className="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-30 text-gray-700 flex items-center justify-center shrink-0 transition-colors text-xs"
        title="Stop"
      >⏹</button>

      {/* Progress / loading feedback */}
      <div className="flex-1 min-w-0">
        {state === 'init_sf' ? (
          <div className="space-y-0.5">
            <p className="text-xs text-gray-500 leading-none">Downloading soundfont… {sfPct}%</p>
            <div className="w-full h-1.5 bg-gray-200 rounded-full">
              <div className="h-1.5 bg-green-500 rounded-full transition-all duration-300" style={{ width: `${sfPct}%` }} />
            </div>
          </div>
        ) : state === 'init_worklet' ? (
          <p className="text-xs text-gray-400">Initialising audio engine…</p>
        ) : state === 'loading_midi' ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <div
            className="w-full h-2 bg-gray-200 rounded-full cursor-pointer group"
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect()
              onSeek((e.clientX - r.left) / r.width)
            }}
            title="Seek"
          >
            <div
              className="h-2 bg-green-500 group-hover:bg-green-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Loop */}
      <button
        onClick={onLoopToggle}
        className={`text-xs px-1.5 py-0.5 rounded transition-colors ${loop ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:text-gray-600'}`}
        title={loop ? 'Loop on' : 'Loop off'}
      >🔁</button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AbcRenderer({
  notation, tuneId, tuneKey, mode, tuneType,
  instrument: instrumentProp,
  speed:      speedProp,
  hideSheet   = false,
  transpose   = 0,
  autoSeekTo  = null,
}) {
  const notationId    = `abc-notation-${tuneId}`
  const containerRef  = useRef(null)
  const abcjsRef      = useRef(null)
  const visualRef     = useRef(null)
  const tcRef         = useRef(null)       // TimingCallbacks instance
  const pausedTickRef = useRef(null)
  const totalTicksRef = useRef(null)
  const pollRef       = useRef(null)
  const mountedRef    = useRef(true)

  const [abcjsReady,  setAbcjsReady]  = useState(false)
  const [playerState, setPlayerState] = useState('idle')
  const [sfPct,       setSfPct]       = useState(0)
  const [progress,    setProgress]    = useState(0)
  const [loop,        setLoop]        = useState(false)
  const [hlStart,     setHlStart]     = useState(null)
  const [hlEnd,       setHlEnd]       = useState(null)

  const prefs = loadPrefs()
  const [instrument,  setInstrument]  = useState(instrumentProp ?? prefs.instrument ?? 73)
  const [speed,       setSpeed]       = useState(speedProp      ?? prefs.speed      ?? 100)
  const [transposeBy, setTransposeBy] = useState(transpose)

  // ── abcjs lazy load ──────────────────────────────────────────────────────
  useEffect(() => {
    loadAbcjs().then(lib => { abcjsRef.current = lib; setAbcjsReady(true) })
    return () => { mountedRef.current = false }
  }, []) // eslint-disable-line

  // ── Re-render notation when inputs change ────────────────────────────────
  useEffect(() => {
    if (!abcjsReady || !notation?.trim()) return
    const abc = buildAbc(notation, instrument, tuneKey, mode, tuneType)
    if (!abc) return
    const width  = Math.max(200, (containerRef.current?.clientWidth ?? 560) - 32)
    const visual = abcjsRef.current.renderAbc(notationId, abc, {
      add_classes: true,
      staffwidth: width,
      visualTranspose: transposeBy,
      wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
    })
    visualRef.current = visual
    // Reset player when notation/speed changes
    _clearPlayback()
    setPlayerState('ready')
    setProgress(0)
    pausedTickRef.current = null
  }, [abcjsReady, notation, instrument, speed, transposeBy, tuneKey, mode, tuneType]) // eslint-disable-line

  // ── Sync external props ──────────────────────────────────────────────────
  useEffect(() => { if (instrumentProp !== undefined) setInstrument(instrumentProp) }, [instrumentProp]) // eslint-disable-line
  useEffect(() => { if (speedProp !== undefined)      setSpeed(speedProp)           }, [speedProp])      // eslint-disable-line
  useEffect(() => { setTransposeBy(transpose) }, [transpose]) // eslint-disable-line

  // ── Unmount cleanup ──────────────────────────────────────────────────────
  useEffect(() => () => {
    mountedRef.current = false
    clearInterval(pollRef.current)
    if (tcRef.current) { tcRef.current.stop(); tcRef.current = null }
    stopAll()
  }, []) // eslint-disable-line

  // ── Internal helpers ─────────────────────────────────────────────────────

  function _clearPlayback() {
    clearInterval(pollRef.current)
    if (tcRef.current) { tcRef.current.stop(); tcRef.current = null }
    document.querySelectorAll(`#${notationId} .abcjs-highlight`)
      .forEach(el => el.classList.remove('abcjs-highlight'))
    setHlStart(null); setHlEnd(null)
    const e = getEngine()
    if (e?.synth) { try { e.synth.stopPlayer() } catch (_) {} }
  }

  function _buildMidiArray() {
    const abcjs  = abcjsRef.current
    const visual = visualRef.current
    if (!abcjs || !visual?.length || !notation?.trim()) return null
    const abc   = buildAbc(notation, instrument, tuneKey, mode, tuneType)
    const msNat = visual[0].millisecondsPerMeasure?.() || 0
    const opts  = { midiOutputType: 'array' }
    if (msNat > 0) opts.millisecondsPerMeasure = msNat * (100 / speed)
    return abcjs.synth.getMidiFile(abc, opts)
  }

  async function _loadAndPlay({ seekTick = null, seekPct = 0, fromPaused = false } = {}) {
    const abcjs  = abcjsRef.current
    const visual = visualRef.current
    if (!abcjs || !visual?.length) return

    // Init engine on first use
    let eng = getEngine()
    if (!eng) {
      if (!mountedRef.current) return
      setPlayerState('init_worklet')
      try {
        eng = await initEngine({
          onStage: stage => {
            if (!mountedRef.current) return
            if (stage === 'soundfont') setPlayerState('init_sf')
            if (stage === 'loading')   setPlayerState('loading_midi')
          },
          onSfProgress: pct => { if (mountedRef.current) setSfPct(pct) },
        })
      } catch (err) {
        console.error('FluidSynth init:', err)
        if (mountedRef.current) setPlayerState('error')
        return
      }
    }

    if (!mountedRef.current) return
    setPlayerState('loading_midi')
    await resumeAudio()

    const midiArr = _buildMidiArray()
    if (!midiArr) { setPlayerState('error'); return }

    // Hand off to audioManager so only one player is active
    stopAll()
    registerSynth(() => { try { eng.synth.stopPlayer() } catch (_) {} }, 'fluid')

    try {
      await eng.synth.resetPlayer()
      await eng.synth.addSMFDataToPlayer(midiArr.buffer)
      eng.synth.setPlayerLoop(loop ? -1 : 0)

      const totalTicks = await eng.synth.retrievePlayerTotalTicks()
      totalTicksRef.current = totalTicks

      // Resolve start tick
      let startTick = 0
      if (seekTick != null)     startTick = seekTick
      else if (fromPaused && pausedTickRef.current != null) startTick = pausedTickRef.current
      else if (autoSeekTo != null && autoSeekTo > 0 && autoSeekTo < 1)
        startTick = Math.round(autoSeekTo * totalTicks)

      if (startTick > 0) eng.synth.seekPlayer(startTick)
      await eng.synth.playPlayer()
    } catch (err) {
      console.error('Playback error:', err)
      if (mountedRef.current) setPlayerState('error')
      return
    }

    if (!mountedRef.current) { eng.synth.stopPlayer(); return }

    // ── TimingCallbacks at scaled BPM ──────────────────────────────────────
    const naturalBpm = visual[0]?.getBpm?.(visual[0].metaText?.tempo) || 120
    const scaledBpm  = naturalBpm * (speed / 100)
    const startPct   = totalTicksRef.current > 0
      ? (fromPaused && pausedTickRef.current ? pausedTickRef.current / totalTicksRef.current : seekPct)
      : 0

    if (tcRef.current) { tcRef.current.stop(); tcRef.current = null }
    const tc = new abcjs.TimingCallbacks(visual[0], {
      qpm: scaledBpm,
      beatSubdivisions: 2,
      eventCallback: ev => {
        document.querySelectorAll(`#${notationId} .abcjs-highlight`)
          .forEach(el => el.classList.remove('abcjs-highlight'))
        if (ev?.elements) {
          ev.elements.forEach(voice => voice?.forEach(el => el.classList.add('abcjs-highlight')))
          setHlStart(ev.startChar ?? null)
          setHlEnd(ev.endChar ?? null)
        } else {
          setHlStart(null); setHlEnd(null)
        }
        return true
      },
    })
    tcRef.current = tc
    tc.start(startPct)

    pausedTickRef.current = null
    setPlayerState('playing')

    // ── Progress polling ──────────────────────────────────────────────────
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) { clearInterval(pollRef.current); return }
      const e = getEngine()
      if (!e?.synth) { clearInterval(pollRef.current); return }
      try {
        const cur = await e.synth.retrievePlayerCurrentTick()
        const tot = totalTicksRef.current || 1
        setProgress(cur / tot)
        if (!e.synth.isPlayerPlaying() && cur >= tot - 10) {
          clearInterval(pollRef.current)
          if (tcRef.current) { tcRef.current.stop(); tcRef.current = null }
          document.querySelectorAll(`#${notationId} .abcjs-highlight`)
            .forEach(el => el.classList.remove('abcjs-highlight'))
          if (mountedRef.current) { setProgress(0); setPlayerState('stopped') }
        }
      } catch (_) {}
    }, 200)
  }

  // ── Player actions ────────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    _loadAndPlay({ fromPaused: playerState === 'paused' })
  }, [playerState, loop, speed, instrument, notation, transposeBy]) // eslint-disable-line

  const handlePause = useCallback(async () => {
    clearInterval(pollRef.current)
    if (tcRef.current) { tcRef.current.pause(); }
    const e = getEngine()
    if (e?.synth) {
      try {
        pausedTickRef.current = await e.synth.retrievePlayerCurrentTick()
        e.synth.stopPlayer()
      } catch (_) {}
    }
    if (mountedRef.current) setPlayerState('paused')
  }, [])

  const handleStop = useCallback(() => {
    _clearPlayback()
    pausedTickRef.current = null
    setProgress(0)
    setPlayerState('stopped')
  }, []) // eslint-disable-line

  const handleSeek = useCallback(async pct => {
    const e   = getEngine()
    const tot = totalTicksRef.current
    if (!e?.synth || !tot) return
    const tick = Math.round(pct * tot)
    if (playerState === 'playing') {
      e.synth.stopPlayer()
      clearInterval(pollRef.current)
      if (tcRef.current) { tcRef.current.stop(); tcRef.current = null }
      await _loadAndPlay({ seekTick: tick, seekPct: pct })
    } else if (playerState === 'paused') {
      pausedTickRef.current = tick
      setProgress(pct)
    }
  }, [playerState, loop, speed]) // eslint-disable-line

  const handleLoopToggle = useCallback(() => {
    setLoop(v => {
      const next = !v
      const e = getEngine()
      if (e?.synth) { try { e.synth.setPlayerLoop(next ? -1 : 0) } catch (_) {} }
      return next
    })
  }, [])

  const handleMidiDownload = () => {
    const abcjs = abcjsRef.current
    if (!notation || !abcjs) return
    const abc  = buildAbc(notation, instrument, tuneKey, mode, tuneType)
    const midi = abcjs.synth.getMidiFile(abc, { midiOutputType: 'encoded' })
    const a    = document.createElement('a')
    a.href     = 'data:audio/midi;base64,' + midi
    a.download = `tune-${tuneId}.mid`
    a.click()
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!notation?.trim()) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-400 border border-dashed border-gray-200">
        <p className="text-4xl mb-2">♩</p>
        <p className="text-sm">No ABC notation added yet</p>
      </div>
    )
  }

  const sfOpt = SF_OPTIONS[getSfKey()] || SF_OPTIONS.fluid

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">
          {INSTRUMENTS.find(i => i.program === instrument)?.label ?? 'Tin Whistle'} · {speed}%
          {' · '}<span className="text-gray-300">{sfOpt.label}</span>
        </span>
        <button
          onClick={handleMidiDownload}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Download MIDI
        </button>
      </div>

      {/* Notation loading placeholder */}
      {!abcjsReady && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-center justify-center gap-2 text-gray-400 text-sm">
          <span className="animate-spin inline-block">♩</span> Loading notation…
        </div>
      )}

      {/* Sheet music or off-screen div (needed for TimingCallbacks) */}
      <div
        ref={containerRef}
        id={notationId}
        className={hideSheet ? '' : `abc-render bg-white rounded-lg border border-gray-200 p-3 overflow-x-auto min-h-16${abcjsReady ? '' : ' hidden'}`}
        style={hideSheet ? { position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none' } : {}}
      />

      {/* ABC text view with live highlight */}
      {hideSheet && <AbcTextHighlight notation={notation} startChar={hlStart} endChar={hlEnd} />}

      {/* Custom player controls */}
      {abcjsReady && (
        <PlayerBar
          state={playerState}
          progress={progress}
          loop={loop}
          sfPct={sfPct}
          onPlay={handlePlay}
          onPause={handlePause}
          onStop={handleStop}
          onSeek={handleSeek}
          onLoopToggle={handleLoopToggle}
        />
      )}

      {playerState === 'error' && (
        <p className="text-xs text-red-500 text-center">Audio error — check browser console.</p>
      )}
    </div>
  )
}
