import { useState, useEffect, useRef, useCallback } from 'react'

// Note names and frequencies
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const A4 = 440

function freqToNote(freq) {
  if (!freq || freq < 20) return null
  const semitones = 12 * Math.log2(freq / A4)
  const rounded = Math.round(semitones)
  const cents = Math.round((semitones - rounded) * 100)
  const noteIndex = ((rounded % 12) + 12 + 9) % 12  // A=0 offset to C=0
  const noteIndexC = ((rounded + 9) % 12 + 12) % 12
  const noteName = NOTE_NAMES[noteIndexC]
  const octave = Math.floor((rounded + 9) / 12) + 4
  return { noteName, octave, cents, freq: Math.round(freq) }
}

// Autocorrelation pitch detection
function detectPitch(buffer, sampleRate) {
  const size = buffer.length
  let rms = 0
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i]
  rms = Math.sqrt(rms / size)
  if (rms < 0.01) return null  // silence

  // Autocorrelation
  const corr = new Float32Array(size)
  for (let lag = 0; lag < size; lag++) {
    let sum = 0
    for (let i = 0; i < size - lag; i++) sum += buffer[i] * buffer[i + lag]
    corr[lag] = sum
  }

  // Find first dip then first peak
  let d = 0
  while (d < size && corr[d] > corr[d + 1]) d++
  let maxVal = -Infinity, maxPos = -1
  for (let i = d; i < size; i++) {
    if (corr[i] > maxVal) { maxVal = corr[i]; maxPos = i }
  }
  if (maxPos < 1 || maxVal < corr[0] * 0.5) return null

  // Parabolic interpolation for sub-sample accuracy
  const x1 = corr[maxPos - 1], x2 = corr[maxPos], x3 = corr[maxPos + 1]
  const a = (x1 + x3 - 2 * x2) / 2
  const b = (x3 - x1) / 2
  const refined = a !== 0 ? maxPos - b / (2 * a) : maxPos

  const freq = sampleRate / refined
  if (freq < 50 || freq > 2000) return null
  return freq
}

const CENTS_MAX = 50

export default function Tuner({ onClose }) {
  const [active,   setActive]   = useState(false)
  const [note,     setNote]     = useState(null)
  const [error,    setError]    = useState(null)

  const audioCtxRef  = useRef(null)
  const analyserRef  = useRef(null)
  const streamRef    = useRef(null)
  const rafRef       = useRef(null)
  const bufferRef    = useRef(null)

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    streamRef.current = null
    setActive(false)
    setNote(null)
  }, [])

  useEffect(() => () => stop(), [stop])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyserRef.current = analyser
      analyser.fftSize = 2048
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      bufferRef.current = new Float32Array(analyser.fftSize)

      const tick = () => {
        analyser.getFloatTimeDomainData(bufferRef.current)
        const freq = detectPitch(bufferRef.current, ctx.sampleRate)
        setNote(freq ? freqToNote(freq) : null)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
      setActive(true)
      setError(null)
    } catch (e) {
      setError('Mic access denied: ' + e.message)
    }
  }

  // Cents to needle angle: -50 cents = -90deg, 0 = 0, +50 = +90
  const needleAngle = note ? Math.max(-90, Math.min(90, (note.cents / CENTS_MAX) * 90)) : 0
  const inTune = note && Math.abs(note.cents) <= 8
  const sharp  = note && note.cents > 8
  const flat   = note && note.cents < -8

  const noteColor = inTune ? 'text-green-500' : sharp ? 'text-red-400' : flat ? 'text-blue-400' : 'text-gray-300'
  const arcColor  = inTune ? '#22c55e' : sharp ? '#f87171' : '#60a5fa'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 text-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold">🎙 Chromatic Tuner</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 flex flex-col items-center gap-6">
          {/* Dial */}
          <div className="relative w-64 h-36 select-none">
            {/* Arc background */}
            <svg viewBox="0 0 200 110" className="w-full">
              {/* Background arc */}
              <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#374151" strokeWidth="8" strokeLinecap="round"/>
              {/* Flat zone (blue) */}
              <path d="M 10 100 A 90 90 0 0 1 55 28" fill="none" stroke="#1d4ed8" strokeWidth="4" strokeLinecap="round" opacity="0.4"/>
              {/* In-tune zone (green center) */}
              <path d="M 85 11 A 90 90 0 0 1 115 11" fill="none" stroke="#16a34a" strokeWidth="8" strokeLinecap="round" opacity="0.6"/>
              {/* Sharp zone (red) */}
              <path d="M 145 28 A 90 90 0 0 1 190 100" fill="none" stroke="#b91c1c" strokeWidth="4" strokeLinecap="round" opacity="0.4"/>
              {/* Tick marks */}
              {[-4,-3,-2,-1,0,1,2,3,4].map(i => {
                const angle = (i / 4) * 90 * Math.PI / 180
                const cx = 100 - 90 * Math.sin(angle)
                const cy = 100 - 90 * Math.cos(angle)
                const cx2 = 100 - 78 * Math.sin(angle)
                const cy2 = 100 - 78 * Math.cos(angle)
                return <line key={i} x1={cx} y1={cy} x2={cx2} y2={cy2}
                  stroke={i===0?'#4ade80':'#6b7280'} strokeWidth={i===0?2:1}/>
              })}
              {/* Needle */}
              {active && (
                <g transform={`rotate(${needleAngle}, 100, 100)`}>
                  <line x1="100" y1="100" x2="100" y2="18" stroke={arcColor} strokeWidth="3" strokeLinecap="round"/>
                  <circle cx="100" cy="100" r="5" fill={arcColor}/>
                </g>
              )}
              {!active && (
                <g>
                  <line x1="100" y1="100" x2="100" y2="18" stroke="#4b5563" strokeWidth="3" strokeLinecap="round"/>
                  <circle cx="100" cy="100" r="5" fill="#4b5563"/>
                </g>
              )}
              {/* Labels */}
              <text x="8" y="108" fill="#60a5fa" fontSize="9" textAnchor="middle">♭</text>
              <text x="100" y="8" fill="#4ade80" fontSize="9" textAnchor="middle">♩</text>
              <text x="192" y="108" fill="#f87171" fontSize="9" textAnchor="middle">♯</text>
            </svg>
          </div>

          {/* Note display */}
          <div className="text-center space-y-1 min-h-20 flex flex-col items-center justify-center">
            {note ? (
              <>
                <div className={`text-6xl font-bold font-mono leading-none ${noteColor}`}>
                  {note.noteName}
                  <span className="text-3xl text-gray-400">{note.octave}</span>
                </div>
                <div className="text-sm font-mono text-gray-400 tabular-nums">
                  {note.freq} Hz
                </div>
                <div className={`text-sm font-semibold tabular-nums ${noteColor}`}>
                  {note.cents === 0 ? '✓ In tune' : note.cents > 0 ? `+${note.cents}¢ sharp` : `${note.cents}¢ flat`}
                </div>
              </>
            ) : active ? (
              <p className="text-gray-500 text-sm">Play a note…</p>
            ) : (
              <p className="text-gray-500 text-sm">Tap to start</p>
            )}
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          {/* Control */}
          <button
            onClick={active ? stop : start}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
              active
                ? 'bg-red-700 hover:bg-red-600 text-white'
                : 'bg-green-700 hover:bg-green-600 text-white'
            }`}>
            {active ? '⏹ Stop' : '🎙 Start Tuner'}
          </button>

          <p className="text-xs text-gray-600 text-center">
            Chromatic · A4 = 440 Hz · requires microphone
          </p>
        </div>
      </div>
    </div>
  )
}
