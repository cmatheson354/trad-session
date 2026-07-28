import { useState, useEffect } from 'react'
import { colorFor } from './FriendsModal.jsx'
import { api } from '../api.js'
import AbcRenderer from './AbcRenderer.jsx'
import RecordingPanel from './RecordingPanel.jsx'


const STATUS_NEXT = {
  want_to_learn:     'learning',
  learning:          'know_it',
  know_it:           'performance_ready',
}
const DEFAULT_STATUS_LABEL = {
  want_to_learn: 'Want to Learn', learning: 'Learning',
  know_it: 'Know It', performance_ready: 'Performance Ready',
}
const STATUS_NEXT_LABEL = {
  want_to_learn:     'Start Learning',
  learning:          'Mark as Know It',
  know_it:           'Mark Performance Ready',
}
const STATUS_BADGE = {
  want_to_learn:      'bg-gray-100 text-gray-700',
  learning:           'bg-blue-100 text-blue-700',
  know_it:            'bg-green-100 text-green-700',
  performance_ready:  'bg-yellow-100 text-yellow-700',
}


// Key transpose helpers for display
const _SHARP_SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const _FLAT_SCALE  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
const _FLAT_SEMI   = new Set([5,10,3,8,1,6])
const _KEY_SEMI    = {C:0,G:7,D:2,A:9,E:4,B:11,'F#':6,'C#':1,F:5,Bb:10,Eb:3,Ab:8,Db:1,Gb:6}
function computeResultKey(keyStr, mode, semitones) {
  if (!keyStr || semitones === 0) return null
  const root = keyStr.trim().match(/^([A-Ga-g][#b]?)/)?.[1] ?? 'C'
  const rootU = root.charAt(0).toUpperCase() + root.slice(1)
  const baseSemi = _KEY_SEMI[rootU] ?? 0
  const newSemi = ((baseSemi + semitones) % 12 + 12) % 12
  const useSharps = !_FLAT_SEMI.has(newSemi)
  const newRoot = (useSharps ? _SHARP_SCALE : _FLAT_SCALE)[newSemi]
  const modeLabel = mode ? ' ' + mode : ''
  return newRoot + modeLabel
}

const INTERVAL_NAMES = {
  0:'Original', 1:'↑ min 2nd', 2:'↑ Maj 2nd', 3:'↑ min 3rd', 4:'↑ Maj 3rd',
  5:'↑ 4th', 6:'↑ Tritone', 7:'↑ 5th', 8:'↑ min 6th', 9:'↑ Maj 6th',
  10:'↑ min 7th', 11:'↑ Maj 7th', 12:'↑ Octave',
  '-1':'↓ min 2nd', '-2':'↓ Maj 2nd', '-3':'↓ min 3rd', '-4':'↓ Maj 3rd',
  '-5':'↓ 4th', '-6':'↓ Tritone', '-7':'↓ 5th', '-8':'↓ min 6th',
  '-9':'↓ Maj 6th', '-10':'↓ min 7th', '-11':'↓ Maj 7th', '-12':'↓ Octave',
}

export default function TuneModal({ tune, onClose, onEdit, onDelete, onPracticed, notationView = "sheet", instrument, speed, statusLabels = {}, onStartRecording }) {
  const [practiceLog, setPracticeLog] = useState([])
  const [logNotes, setLogNotes] = useState('')
  const [logging, setLogging] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [transposeBy, setTransposeBy] = useState(0)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [savingTranspose, setSavingTranspose] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [tuneFriends,   setTuneFriends]   = useState([])
  const [allFriends,    setAllFriends]    = useState([])
  const [showAddFriend, setShowAddFriend]  = useState(false)

  useEffect(() => {
    api.practice.list(tune.id).then(setPracticeLog).catch(console.error)
    api.tuneFriends.list(tune.id).then(setTuneFriends).catch(console.error)
    api.friends.list().then(setAllFriends).catch(console.error)
  }, [tune.id])

  const handleLogPractice = async () => {
    setLogging(true)
    try {
      await api.practice.log(tune.id, { notes: logNotes || undefined })
      const [updated, logs] = await Promise.all([
        api.tunes.get(tune.id),
        api.practice.list(tune.id),
      ])
      setPracticeLog(logs)
      setLogNotes('')
      setShowLog(false)
      onPracticed(updated)
    } finally {
      setLogging(false)
    }
  }

  const handleAdvanceStatus = async () => {
    const next = STATUS_NEXT[tune.status]
    if (!next) return
    const updated = await api.tunes.update(tune.id, { ...tune, status: next })
    onPracticed(updated)
  }


  const handleSaveTranspose = async () => {
    setSavingTranspose(true)
    try {
      const resultKey = computeResultKey(tune.tune_key, tune.mode, transposeBy)
      const baseTitle = tune.title.replace(/\s*\([^)]*\)\s*$/, '').trim()
      const newTitle = resultKey ? `${baseTitle} (${resultKey})` : tune.title
      const updated = await api.tunes.transpose(tune.id, transposeBy, newTitle)
      onEdit && onEdit(updated)
      setTransposeBy(0)
      setShowSaveConfirm(false)
    } catch(e) {
      alert('Transpose failed: ' + e.message)
    } finally {
      setSavingTranspose(false)
    }
  }

  const typeLabel = tune.tune_type.replace('_', ' ')
  const sessionUrl = tune.thesession_id
    ? `https://thesession.org/tunes/${tune.thesession_id}`
    : null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-green-800 text-white rounded-t-2xl px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{tune.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-green-300 text-sm capitalize">{typeLabel}</span>
              {tune.tune_key && (
                <>
                  <span className="text-green-500">·</span>
                  <span className="text-green-300 text-sm">{tune.tune_key}</span>
                </>
              )}
              {tune.mode && (
                <>
                  <span className="text-green-500">·</span>
                  <span className="text-green-300 text-sm capitalize">{tune.mode}</span>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-green-300 hover:text-white text-2xl leading-none mt-0.5">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${STATUS_BADGE[tune.status]}`}>
              {(statusLabels[tune.status] ?? DEFAULT_STATUS_LABEL[tune.status] ?? tune.status)}
            </span>
            {STATUS_NEXT[tune.status] && (
              <button
                onClick={handleAdvanceStatus}
                className="text-sm text-green-700 hover:text-green-900 underline"
              >
                {(() => {
                  const nextStatus = STATUS_NEXT[tune.status]
                  const nextLabel = statusLabels[nextStatus] || DEFAULT_STATUS_LABEL[nextStatus] || nextStatus
                  return `Mark as ${nextLabel}`
                })()} &rarr;
              </button>
            )}
            {tune.last_practiced && (
              <span className="text-sm text-gray-400 ml-auto">
                Last practiced: {tune.last_practiced}
              </span>
            )}
          </div>

          {/* Sheet Music / ABC Notation + Player */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              {notationView === 'abc' ? 'ABC Notation' : 'Sheet Music'}
            </h3>
            {notationView === 'abc' && tune.abc_notation?.trim() && (
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-mono text-gray-700 whitespace-pre-wrap break-all leading-relaxed mb-3">
                {tune.abc_notation.trim()}
              </pre>
            )}
            <AbcRenderer
              notation={tune.abc_notation}
              tuneId={tune.id}
              instrument={instrument}
              speed={speed}
              hideSheet={notationView === 'abc'}
              transpose={transposeBy}
            />
          </div>


          {/* Friends */}
          {(tuneFriends.length > 0 || allFriends.length > 0) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Friends</h3>
                <button
                  onClick={() => setShowAddFriend(v => !v)}
                  className="text-xs text-green-700 hover:text-green-900"
                >
                  {showAddFriend ? 'Cancel' : '+ Tag friend'}
                </button>
              </div>
              {showAddFriend && (
                <div className="mb-2">
                  <select
                    defaultValue=""
                    onChange={async e => {
                      const fid = parseInt(e.target.value)
                      if (!fid) return
                      await api.tuneFriends.add(tune.id, fid)
                      const updated = await api.tuneFriends.list(tune.id)
                      setTuneFriends(updated)
                      setShowAddFriend(false)
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select a friend…</option>
                    {allFriends
                      .filter(f => !tuneFriends.find(tf => tf.id === f.id))
                      .map(f => <option key={f.id} value={f.id}>{f.name}</option>)
                    }
                  </select>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {tuneFriends.map(f => {
                  const c = colorFor(f.color)
                  return (
                    <span
                      key={f.id}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}
                    >
                      {f.name}
                      <button
                        onClick={async () => {
                          await api.tuneFriends.remove(tune.id, f.id)
                          setTuneFriends(ts => ts.filter(t => t.id !== f.id))
                        }}
                        className="opacity-50 hover:opacity-100 leading-none"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </span>
                  )
                })}
                {tuneFriends.length === 0 && !showAddFriend && (
                  <p className="text-xs text-gray-400">Not linked to any friends yet.</p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {tune.notes && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{tune.notes}</p>
            </div>
          )}

          {/* Metadata */}
          {(tune.source || tune.created_at) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
              {tune.source && (
                <span>📖 <span className="text-gray-600">{tune.source}</span></span>
              )}
              {tune.created_at && (
                <span>📅 Added <span className="text-gray-600">{tune.created_at.slice(0, 10)}</span></span>
              )}
            </div>
          )}

          {/* External links */}
          <div className="flex flex-wrap gap-3">
            {sessionUrl && (
              <a href={sessionUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-green-700 hover:text-green-900 underline">
                The Session &rarr;
              </a>
            )}
            <a
              href={"https://www.youtube.com/results?search_query=" + encodeURIComponent(tune.title + ' irish trad')}
              target="_blank" rel="noopener noreferrer"
              className="text-sm text-red-600 hover:text-red-800 underline">
              YouTube &rarr;
            </a>
          </div>

          {/* Practice Log */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Practice Log</h3>
              <button
                onClick={() => setShowLog(!showLog)}
                className="text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-1 rounded-lg transition-colors"
              >
                + Log Practice
              </button>
            </div>

            {showLog && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
                <textarea
                  placeholder="Optional notes..."
                  value={logNotes}
                  onChange={e => setLogNotes(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleLogPractice}
                    disabled={logging}
                    className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {logging ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setShowLog(false)} className="text-sm text-gray-500 hover:text-gray-700">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {practiceLog.length === 0 ? (
              <p className="text-sm text-gray-400">No sessions logged yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-32 overflow-y-auto">
                {practiceLog.map(log => (
                  <li key={log.id} className="flex items-start gap-3 text-sm">
                    <span className="text-gray-400 shrink-0 font-mono text-xs mt-0.5">{log.practiced_at}</span>
                    {log.notes && <span className="text-gray-600">{log.notes}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recordings */}
          <div className="border-t border-gray-100 pt-4">
            <RecordingPanel tuneId={tune.id} tuneTitle={tune.title} onStartRecording={onStartRecording} />
          </div>

          {/* Edit / Delete */}
          <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
            <button
              onClick={() => onEdit(tune)}
              className="text-sm text-gray-600 hover:text-gray-800 border border-gray-300 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors"
            >
              Edit
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-600">Sure?</span>
                <button
                  onClick={() => onDelete(tune.id)}
                  className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
