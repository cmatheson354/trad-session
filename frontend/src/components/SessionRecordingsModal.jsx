import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import RecordingPlayer from './RecordingPlayer.jsx'

function formatDate(dt) {
  if (!dt) return ''
  return dt.slice(0, 16).replace('T', ' ')
}

function formatBytes(b) {
  if (!b) return ''
  if (b < 1048576) return `${(b / 1024).toFixed(0)}KB`
  return `${(b / 1048576).toFixed(1)}MB`
}

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function SessionRecordingsModal({ onClose }) {
  const [recordings, setRecordings] = useState([])
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [noteText, setNoteText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      clearInterval(timerRef.current)
    }
  }, [])

  const load = async () => {
    const data = await api.recordings.listSession().catch(() => [])
    setRecordings(data)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        clearInterval(timerRef.current)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setUploading(true)
        try {
          const fd = new FormData()
          fd.append('audio', blob, 'session-recording.webm')
          if (noteText.trim()) fd.append('notes', noteText.trim())
          await api.recordings.uploadSession(fd)
          await load()
          setNoteText('')
        } finally {
          setUploading(false)
          setIsRecording(false)
          setElapsed(0)
        }
      }

      recorder.start(500)
      setIsRecording(true)
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } catch (err) {
      alert('Microphone access denied: ' + err.message)
    }
  }

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    clearInterval(timerRef.current)
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('audio', file, file.name)
      if (noteText.trim()) fd.append('notes', noteText.trim())
      await api.recordings.uploadSession(fd)
      await load()
      setNoteText('')
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (id) => {
    await api.recordings.delete(id).catch(console.error)
    await load()
    setConfirmDelete(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-green-800 text-white rounded-t-2xl px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold">Session Recordings</h2>
            <p className="text-green-300 text-sm">Tunes from a session — not tied to a specific tune</p>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Controls */}
          <div className="space-y-2">
            <input
              type="text"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Label this recording (e.g. 'Thursday session, The Cobbler's Jig')"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex gap-2">
              {!isRecording ? (
                <>
                  <button
                    onClick={startRecording}
                    disabled={uploading}
                    className="flex items-center gap-1.5 text-sm bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <span className="w-2 h-2 rounded-full bg-white" />
                    Record
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-sm border border-gray-300 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Upload File
                  </button>
                  <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                </>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 text-sm bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg"
                >
                  <span className="w-2 h-2 rounded bg-white" />
                  Stop · {formatTime(elapsed)}
                </button>
              )}
              {uploading && <span className="text-sm text-gray-400 self-center">Saving...</span>}
            </div>
          </div>

          {/* List */}
          {recordings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No session recordings yet.</p>
          ) : (
            <ul className="space-y-3">
              {recordings.map(rec => (
                <li key={rec.id} className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {rec.notes ? (
                        <p className="text-sm font-medium text-gray-800 truncate">{rec.notes}</p>
                      ) : (
                        <p className="text-sm text-gray-400 italic truncate">{rec.original_name}</p>
                      )}
                      <p className="text-xs text-gray-400">{formatDate(rec.recorded_at)} {rec.file_size ? `· ${formatBytes(rec.file_size)}` : ''}</p>
                    </div>
                    <div className="shrink-0">
                      {confirmDelete === rec.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => handleDelete(rec.id)} className="text-xs bg-red-600 text-white px-2 py-0.5 rounded">Delete</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(rec.id)} className="text-xs text-gray-300 hover:text-red-400 px-1">✕</button>
                      )}
                    </div>
                  </div>
                  <RecordingPlayer src={api.recordings.audioUrl(rec.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
