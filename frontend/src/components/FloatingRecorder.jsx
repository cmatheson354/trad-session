import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// target: { tuneId: number|null, tuneTitle: string|null, label: string, recType: string }
export default function FloatingRecorder({ target, onSaved, onClear }) {
  const [phase, setPhase] = useState('idle') // idle | armed | recording | saving
  const [elapsed, setElapsed] = useState(0)
  const [label, setLabel] = useState('')
  const [recType, setRecType] = useState('self')
  const [showArmed, setShowArmed] = useState(false)

  const recorderRef = useRef(null)
  const chunksRef   = useRef([])
  const timerRef    = useRef(null)
  const streamRef   = useRef(null)

  // When a new target arrives (triggered from outside), arm it
  useEffect(() => {
    if (!target) return
    setLabel(target.label || '')
    setRecType(target.recType || 'self')
    setPhase('armed')
    setShowArmed(true)
  }, [target])

  // Cleanup on unmount
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    clearInterval(timerRef.current)
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        clearInterval(timerRef.current)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setPhase('saving')
        try {
          const fd = new FormData()
          const filename = target?.tuneId
            ? `tune-${target.tuneId}-recording.webm`
            : 'session-recording.webm'
          fd.append('audio', blob, filename)
          fd.append('recording_type', recType)
          if (label.trim()) fd.append('notes', label.trim())

          if (target?.tuneId) {
            await api.recordings.uploadForTune(target.tuneId, fd)
          } else {
            await api.recordings.uploadSession(fd)
          }
          onSaved && onSaved(target?.tuneId)
        } catch (err) {
          alert('Failed to save recording: ' + err.message)
        } finally {
          setPhase('idle')
          setElapsed(0)
          setLabel('')
          onClear && onClear()
        }
      }

      recorder.start(500)
      setPhase('recording')
      setShowArmed(false)
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } catch (err) {
      alert('Microphone access denied: ' + err.message)
      setPhase('idle')
      onClear && onClear()
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    clearInterval(timerRef.current)
  }

  const dismiss = () => {
    setPhase('idle')
    setShowArmed(false)
    onClear && onClear()
  }

  if (phase === 'idle' && !showArmed) return null

  // Armed state: popover to confirm before starting
  if (phase === 'armed' && showArmed) {
    return (
      <div className="fixed bottom-20 right-4 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 w-72">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-gray-800 text-sm">
            🎙 {target?.tuneTitle ? `Recording: ${target.tuneTitle}` : 'Session Recording'}
          </span>
          <button onClick={dismiss} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>
        <div className="space-y-2 mb-3">
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <div className="flex gap-1">
            {['self', 'other'].map(t => (
              <button key={t} onClick={() => setRecType(t)}
                className={`flex-1 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  recType === t ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'
                }`}>
                {t === 'self' ? '🎤 Self' : '👂 Other'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={startRecording}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm font-medium transition-colors">
          <span className="w-2 h-2 rounded-full bg-white" /> Start Recording
        </button>
      </div>
    )
  }

  // Recording in progress — persistent floating pill
  if (phase === 'recording') {
    return (
      <div className="fixed bottom-20 right-4 z-50 flex items-center gap-3 bg-red-600 text-white rounded-full shadow-2xl px-4 py-2.5 animate-pulse-slow">
        <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse shrink-0" />
        <div className="text-sm leading-tight">
          <div className="font-semibold tabular-nums">{formatTime(elapsed)}</div>
          {target?.tuneTitle && <div className="text-red-200 text-xs truncate max-w-32">{target.tuneTitle}</div>}
        </div>
        <button onClick={stopRecording}
          className="bg-red-800 hover:bg-red-900 rounded-full px-3 py-1 text-xs font-medium ml-1 transition-colors">
          Stop
        </button>
      </div>
    )
  }

  // Saving
  if (phase === 'saving') {
    return (
      <div className="fixed bottom-20 right-4 z-50 flex items-center gap-2 bg-gray-800 text-white rounded-full shadow-2xl px-4 py-2.5">
        <span className="animate-spin text-sm">⏳</span>
        <span className="text-sm">Saving recording…</span>
      </div>
    )
  }

  return null
}
