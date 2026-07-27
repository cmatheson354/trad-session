import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import RecordingPlayer from './RecordingPlayer.jsx'

function formatBytes(b) {
  if (!b) return ''
  if (b < 1024) return `${b}B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)}KB`
  return `${(b / 1048576).toFixed(1)}MB`
}

function formatDate(dt) {
  if (!dt) return ''
  return dt.slice(0, 16).replace('T', ' ')
}

const TYPE_LABEL = { self: '🎤 Self', other: '👂 Other' }
const TYPE_BTN = 'px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors'

function TypeToggle({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {['self', 'other'].map(t => (
        <button key={t} onClick={() => onChange(t)}
          className={`${TYPE_BTN} ${value === t
            ? 'bg-green-700 text-white border-green-700'
            : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'}`}>
          {TYPE_LABEL[t]}
        </button>
      ))}
    </div>
  )
}

function RecordingItem({ rec, onUpdated, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(rec.notes ?? '')
  const [type, setType] = useState(rec.recording_type ?? 'self')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await api.recordings.patch(rec.id, { notes: note || null, recording_type: type })
      onUpdated(updated)
      setEditing(false)
    } finally { setSaving(false) }
  }

  const handleCancel = () => {
    setNote(rec.notes ?? '')
    setType(rec.recording_type ?? 'self')
    setEditing(false)
  }

  return (
    <li className="bg-gray-50 rounded-lg p-2.5 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-mono">{formatDate(rec.recorded_at)}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
              (rec.recording_type ?? 'self') === 'self' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
            }`}>{TYPE_LABEL[rec.recording_type ?? 'self']}</span>
          </div>
          {!editing && (
            rec.notes
              ? <p className="text-sm text-gray-700 mt-0.5">{rec.notes}</p>
              : <p className="text-sm text-gray-400 italic mt-0.5">{rec.original_name || 'recording'}{rec.file_size ? ` · ${formatBytes(rec.file_size)}` : ''}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editing && !confirmDelete && (
            <button onClick={() => setEditing(true)} className="text-xs text-gray-300 hover:text-gray-600 px-1">✏️</button>
          )}
          {!editing && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-300 hover:text-red-400 px-1">✕</button>
          )}
          {confirmDelete && (
            <>
              <button onClick={async () => { await api.recordings.delete(rec.id); onDeleted(rec.id) }}
                className="text-xs bg-red-600 text-white px-2 py-1 rounded">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600 px-1">Cancel</button>
            </>
          )}
        </div>
      </div>
      {editing && (
        <div className="space-y-2 pt-1">
          <TypeToggle value={type} onChange={setType} />
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note…"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={handleCancel} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}
      <RecordingPlayer src={api.recordings.audioUrl(rec.id)} />
    </li>
  )
}

export default function RecordingPanel({ tuneId, tuneTitle, onStartRecording }) {
  const [recordings, setRecordings] = useState([])
  const [recType, setRecType] = useState('self')
  const [noteText, setNoteText] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => { load() }, [tuneId])

  const load = async () => setRecordings(await api.recordings.listForTune(tuneId).catch(() => []))

  const handleStartBg = () => {
    onStartRecording && onStartRecording({ tuneId, tuneTitle, label: noteText, recType })
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('audio', file, file.name)
      fd.append('recording_type', recType)
      if (noteText.trim()) fd.append('notes', noteText.trim())
      await api.recordings.uploadForTune(tuneId, fd)
      await load()
      setNoteText('')
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally { setUploading(false); e.target.value = '' }
  }

  const handleUpdated = (updated) => setRecordings(rs => rs.map(r => r.id === updated.id ? updated : r))
  const handleDeleted = (id) => setRecordings(rs => rs.filter(r => r.id !== id))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Recordings {recordings.length > 0 && `(${recordings.length})`}
        </h3>
      </div>
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <TypeToggle value={recType} onChange={setRecType} />
          <input type="text" value={noteText} onChange={e => setNoteText(e.target.value)}
            placeholder="Label (optional)"
            className="flex-1 min-w-28 border border-gray-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleStartBg}
            className="flex items-center gap-1.5 text-sm bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg transition-colors">
            <span className="w-2 h-2 rounded-full bg-white" /> Record
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="text-sm border border-gray-300 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
            Upload
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
        </div>
        {uploading && <div className="text-sm text-gray-400">Saving…</div>}
      </div>
      {recordings.length === 0 && !uploading
        ? <p className="text-sm text-gray-400">No recordings yet.</p>
        : <ul className="space-y-2 max-h-72 overflow-y-auto">
            {recordings.map(rec => (
              <RecordingItem key={rec.id} rec={rec} onUpdated={handleUpdated} onDeleted={handleDeleted} />
            ))}
          </ul>
      }
    </div>
  )
}
