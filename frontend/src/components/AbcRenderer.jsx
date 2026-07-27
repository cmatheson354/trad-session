import { useEffect, useRef, useState } from 'react'
import abcjs from 'abcjs'
import 'abcjs/abcjs-audio.css'
import { INSTRUMENTS, SPEEDS, loadPrefs } from '../constants.js'
import { registerSynth, unregisterSynth, stopAll } from '../audioManager.js'

function buildAbc(notation, program) {
  if (!notation?.trim()) return null
  return `%%MIDI program ${program}\n${notation.trim()}`
}

export default function AbcRenderer({ notation, tuneId, instrument: instrumentProp, speed: speedProp, hideSheet = false, transpose = 0 }) {
  const notationId = `abc-notation-${tuneId}`
  const playerId   = `abc-player-${tuneId}`
  const synthRef   = useRef(null)
  const visualRef  = useRef(null)

  const prefs = loadPrefs()
  const [instrument, setInstrument] = useState(instrumentProp ?? prefs.instrument ?? 73)
  const [speed,      setSpeed]      = useState(speedProp      ?? prefs.speed      ?? 100)
  const [transposeBy, setTransposeBy] = useState(transpose)

  const destroySynth = () => {
    if (synthRef.current) {
      unregisterSynth(synthRef.current._stopFn)
      synthRef.current.destroy()
      synthRef.current = null
    }
  }

  const initSynth = (visualObjs, prog, spd) => {
    if (!visualObjs?.length || !abcjs.synth.supportsAudio()) return
    destroySynth()

    const synth = new abcjs.synth.SynthController()
    synthRef.current = synth

    // Register stop fn with global manager
    const stopFn = () => { try { synth.pause?.(); } catch(_){} try { synth.destroy(); } catch(_){} }
    synth._stopFn = stopFn
    registerSynth(stopFn, 'controller')

    synth.load(`#${playerId}`, null, {
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
    if (!notation?.trim()) return
    const abc = buildAbc(notation, prog)
    const visualObjs = abcjs.renderAbc(notationId, abc, {
      responsive: 'resize', add_classes: true,
      visualTranspose: transposeBy,
      wrap: { minSpacing: 1.8, maxSpacing: 2.7, preferredMeasuresPerLine: 4 },
    })
    visualRef.current = visualObjs
    initSynth(visualObjs, prog, spd)
  }

  useEffect(() => {
    render(instrument, speed)
    return () => destroySynth()
  }, [notation, instrument, speed, transposeBy]) // eslint-disable-line

  // Guaranteed stop on unmount, regardless of how the parent closes
  useEffect(() => () => stopAll(), []) // eslint-disable-line

  useEffect(() => { if (instrumentProp !== undefined) setInstrument(instrumentProp) }, [instrumentProp]) // eslint-disable-line
  useEffect(() => { if (speedProp !== undefined)      setSpeed(speedProp)           }, [speedProp])      // eslint-disable-line
  useEffect(() => { setTransposeBy(transpose) }, [transpose]) // eslint-disable-line

  const handleMidiDownload = () => {
    if (!notation) return
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

      {hideSheet
        ? <div id={notationId} style={{ display: 'none' }} />
        : <div className="bg-white rounded-lg border border-gray-200 p-3 overflow-x-auto">
            <div id={notationId} className="abc-render min-h-16" />
          </div>
      }

      <div id={playerId} className="rounded-lg overflow-hidden" />
    </div>
  )
}
