import { useEffect, useRef, useState } from 'react'
import 'abcjs/abcjs-audio.css'
import { loadAbcjs } from '../abcjsLoader.js'
import { INSTRUMENTS, SPEEDS, loadPrefs } from '../constants.js'
import { registerSynth, unregisterSynth, stopAll } from '../audioManager.js'

function buildAbc(notation, program) {
  if (!notation?.trim()) return null
  return `%%MIDI program ${program}\n${notation.trim()}`
}


function makeCursorControl(notationId) {
  return {
    beatSubdivisions: 2,
    onStart() {},
    onFinished() {
      document.querySelectorAll(`#${notationId} .abcjs-highlight`).forEach(
        el => el.classList.remove('abcjs-highlight')
      )
    },
    onBeat() {},
    onEvent(ev) {
      document.querySelectorAll(`#${notationId} .abcjs-highlight`).forEach(
        el => el.classList.remove('abcjs-highlight')
      )
      if (!ev.elements) return
      ev.elements.forEach(voice => voice?.forEach(el => el.classList.add('abcjs-highlight')))
    },
  }
}

export default function AbcRenderer({ notation, tuneId, instrument: instrumentProp, speed: speedProp, hideSheet = false, transpose = 0 }) {
  const notationId = `abc-notation-${tuneId}`
  const playerId   = `abc-player-${tuneId}`
  const synthRef   = useRef(null)
  const visualRef  = useRef(null)
  const abcjsRef   = useRef(null)
  const cursorRef   = useRef(null)
  const [abcjsReady, setAbcjsReady] = useState(false)

  const prefs = loadPrefs()
  const [instrument, setInstrument] = useState(instrumentProp ?? prefs.instrument ?? 73)
  const [speed,      setSpeed]      = useState(speedProp      ?? prefs.speed      ?? 100)
  const [transposeBy, setTransposeBy] = useState(transpose)

  useEffect(() => {
    loadAbcjs().then(lib => {
      abcjsRef.current = lib
      setAbcjsReady(true)
    })
  }, []) // eslint-disable-line

  const destroySynth = () => {
    if (synthRef.current) {
      document.querySelectorAll(`#${notationId} .abcjs-highlight`).forEach(
        el => el.classList.remove('abcjs-highlight')
      )
      unregisterSynth(synthRef.current._stopFn)
      synthRef.current.destroy()
      synthRef.current = null
    }
  }

  const initSynth = (visualObjs, prog, spd) => {
    const abcjs = abcjsRef.current
    if (!visualObjs?.length || !abcjs.synth.supportsAudio()) return
    destroySynth()

    const synth = new abcjs.synth.SynthController()
    synthRef.current = synth

    // Register stop fn with global manager
    const stopFn = () => { try { synth.pause?.(); } catch(_){} try { synth.destroy(); } catch(_){} }
    synth._stopFn = stopFn
    registerSynth(stopFn, 'controller')

    synth.load(`#${playerId}`, cursorRef.current, {
      displayLoop: true, displayRestart: true, displayPlay: true,
      displayProgress: true, displayWarp: false,
    })
    const msPerMeasure = visualObjs[0].millisecondsPerMeasure
      ? visualObjs[0].millisecondsPerMeasure() * (100 / spd)
      : undefined
    synth.setTune(visualObjs[0], false, {
      ...(msPerMeasure ? { millisecondsPerMeasure: msPerMeasure } : {}),
    }).catch(console.error)
  }

  const render = (prog, spd) => {
    const abcjs = abcjsRef.current
    if (!abcjs || !notation?.trim()) return
    const abc = buildAbc(notation, prog)
    const visualObjs = abcjs.renderAbc(notationId, abc, {
      add_classes: true,
      staffwidth: 560,
      visualTranspose: transposeBy,
      wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
    })
    visualRef.current = visualObjs
    cursorRef.current = makeCursorControl(notationId)
    initSynth(visualObjs, prog, spd)
  }

  useEffect(() => {
    if (!abcjsReady) return
    render(instrument, speed)
    return () => destroySynth()
  }, [abcjsReady, notation, instrument, speed, transposeBy]) // eslint-disable-line

  // Guaranteed stop on unmount, regardless of how the parent closes
  useEffect(() => () => stopAll(), []) // eslint-disable-line

  useEffect(() => { if (instrumentProp !== undefined) setInstrument(instrumentProp) }, [instrumentProp]) // eslint-disable-line
  useEffect(() => { if (speedProp !== undefined)      setSpeed(speedProp)           }, [speedProp])      // eslint-disable-line
  useEffect(() => { setTransposeBy(transpose) }, [transpose]) // eslint-disable-line

  const handleMidiDownload = () => {
    const abcjs = abcjsRef.current
    if (!notation || !abcjs) return
    const midi = abcjs.synth.getMidiFile(buildAbc(notation, instrument), { midiOutputType: 'encoded' })
    const a = document.createElement('a')
    a.href = 'data:audio/midi;base64,' + midi
    a.download = `tune-${tuneId}.mid`
    a.click()
  }

  if (!notation?.trim()) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-400 border border-dashed border-gray-200">
        <p className="text-4xl mb-2">♩</p>
        <p className="text-sm">No ABC notation added yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400">
          {INSTRUMENTS.find(i => i.program === instrument)?.label ?? 'Tin Whistle'} · {speed}%
        </span>
        <button
          onClick={handleMidiDownload}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Download MIDI
        </button>
      </div>

      {!abcjsReady && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-center justify-center gap-2 text-gray-400 text-sm">
          <span className="animate-spin inline-block">♩</span> Loading notation…
        </div>
      )}

      {hideSheet
        ? <div id={notationId} style={{ display: 'none' }} />
        : <div className={`bg-white rounded-lg border border-gray-200 p-3 overflow-x-auto${abcjsReady ? '' : ' hidden'}`}>
            <div id={notationId} className="abc-render min-h-16" />
          </div>
      }

      <div id={playerId} className="rounded-lg overflow-hidden" />
    </div>
  )
}
