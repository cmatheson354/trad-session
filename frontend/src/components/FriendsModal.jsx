import { useState, useEffect } from 'react'
import { api } from '../api.js'

export const FRIEND_COLORS = [
  { value: 'green',  bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500'  },
  { value: 'blue',   bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-500'   },
  { value: 'purple', bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' },
  { value: 'orange', bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
  { value: 'red',    bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500'    },
  { value: 'teal',   bg: 'bg-teal-100',   text: 'text-teal-800',   dot: 'bg-teal-500'   },
  { value: 'pink',   bg: 'bg-pink-100',   text: 'text-pink-800',   dot: 'bg-pink-500'   },
  { value: 'amber',  bg: 'bg-amber-100',  text: 'text-amber-800',  dot: 'bg-amber-500'  },
]

export function colorFor(colorName) {
  return FRIEND_COLORS.find(c => c.value === colorName) ?? FRIEND_COLORS[0]
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {FRIEND_COLORS.map(c => (
        <button
          key={c.value}
          onClick={() => onChange(c.value)}
          className={`w-6 h-6 rounded-full ${c.dot} ${value === c.value ? 'ring-2 ring-offset-2 ring-gray-400' : ''} transition-all`}
        />
      ))}
    </div>
  )
}

function FriendDetail({ friend, onBack, onUpdate, onDelete }) {
  const [tunes, setTunes] = useState(friend.tunes || [])
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(friend.name)
  const [type, setType] = useState(friend.type)
  const [color, setColor] = useState(friend.color)
  const [notes, setNotes] = useState(friend.notes || '')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const c = colorFor(friend.color)

  const handleSave = async () => {
    setSaving(true)
    const updated = await api.friends.update(friend.id, { name, type, color, notes: notes || null })
    setSaving(false)
    setEditing(false)
    onUpdate(updated)
  }

  const handleRemoveTune = async (tuneId) => {
    await api.friends.removeTune(friend.id, tuneId)
    setTunes(ts => ts.filter(t => t.id !== tuneId))
  }

  const handleDelete = async () => {
    await api.friends.delete(friend.id)
    onDelete(friend.id)
    onBack()
  }

  const VIA_LABEL = { manual: 'manual', swipe: '🤝 swipe', qr: '📷 QR' }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-5 border-b border-gray-100">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 text-lg leading-none">←</button>
        <span className={`w-3 h-3 rounded-full ${c.dot}`} />
        <h3 className="font-bold text-gray-900 flex-1">{friend.name}</h3>
        <button onClick={() => setEditing(e => !e)} className="text-sm text-green-700 hover:underline">
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {editing ? (
          <div className="space-y-3 bg-gray-50 rounded-xl p-4">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Name"
            />
            <div className="flex gap-3">
              {['person', 'venue'].map(t => (
                <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" checked={type === t} onChange={() => setType(t)} className="accent-green-600" />
                  <span className="capitalize">{t}</span>
                </label>
              ))}
            </div>
            <ColorPicker value={color} onChange={setColor} />
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-2 rounded-xl text-sm transition-colors"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          friend.notes && <p className="text-sm text-gray-500 italic">{friend.notes}</p>
        )}

        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Tunes ({tunes.length})
          </h4>
          {tunes.length === 0 ? (
            <p className="text-sm text-gray-400">No tunes linked yet. Tag this friend from a tune's detail view, or use the swipe / QR features.</p>
          ) : (
            <div className="space-y-1">
              {tunes.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-2 border-b border-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400 capitalize">{t.tune_type?.replace('_', ' ')} {t.tune_key ? `· ${t.tune_key}` : ''}</p>
                  </div>
                  {t.added_via && t.added_via !== 'manual' && (
                    <span className="text-xs text-gray-400">{VIA_LABEL[t.added_via] || t.added_via}</span>
                  )}
                  <button
                    onClick={() => handleRemoveTune(t.id)}
                    className="text-gray-300 hover:text-red-400 text-sm shrink-0 transition-colors"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Delete friend…
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-600">Remove {friend.name} and all their tune links?</span>
              <button onClick={handleDelete} className="text-sm bg-red-600 text-white px-3 py-1 rounded-lg">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-sm text-gray-500">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FriendsModal({ onClose, onFriendsChange }) {
  const [friends, setFriends] = useState([])
  const [selected, setSelected] = useState(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('person')
  const [color, setColor] = useState('green')

  useEffect(() => {
    api.friends.list().then(setFriends)
  }, [])

  const notify = (updated) => {
    onFriendsChange && onFriendsChange(updated)
  }

  const handleCreate = async () => {
    if (!name.trim()) return
    const f = await api.friends.create({ name: name.trim(), type, color })
    const updated = [...friends, f].sort((a, b) => a.name.localeCompare(b.name))
    setFriends(updated)
    notify(updated)
    setName('')
    setType('person')
    setColor('green')
    setCreating(false)
  }

  const handleUpdate = (updated) => {
    const next = friends.map(f => f.id === updated.id ? updated : f)
      .sort((a, b) => a.name.localeCompare(b.name))
    setFriends(next)
    setSelected(updated)
    notify(next)
  }

  const handleDelete = (id) => {
    const next = friends.filter(f => f.id !== id)
    setFriends(next)
    notify(next)
  }

  const openFriend = async (f) => {
    const detail = await api.friends.get(f.id)
    setSelected(detail)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {selected ? (
          <FriendDetail
            friend={selected}
            onBack={() => setSelected(null)}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ) : (
          <>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Friends</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCreating(c => !c)}
                  className="text-sm text-green-700 hover:text-green-900 font-medium"
                >
                  {creating ? 'Cancel' : '+ Add'}
                </button>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {creating && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="Name (person or venue)"
                    autoFocus
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <div className="flex gap-3">
                    {['person', 'venue'].map(t => (
                      <label key={t} className="flex items-center gap-1.5 text-sm cursor-pointer">
                        <input type="radio" checked={type === t} onChange={() => setType(t)} className="accent-green-600" />
                        <span className="capitalize">{t === 'person' ? '👤 Person' : '🏠 Venue'}</span>
                      </label>
                    ))}
                  </div>
                  <ColorPicker value={color} onChange={setColor} />
                  <button
                    onClick={handleCreate}
                    disabled={!name.trim()}
                    className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-2 rounded-xl text-sm transition-colors"
                  >
                    Add Friend
                  </button>
                </div>
              )}

              {friends.length === 0 && !creating ? (
                <div className="text-center py-10 text-gray-400">
                  <p className="text-3xl mb-2">👥</p>
                  <p className="text-sm">No friends yet.</p>
                  <p className="text-xs mt-1">Add people or venues and tag tunes to them.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {friends.map(f => {
                    const c = colorFor(f.color)
                    return (
                      <button
                        key={f.id}
                        onClick={() => openFriend(f)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                      >
                        <span className={`w-3 h-3 rounded-full shrink-0 ${c.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{f.name}</p>
                          <p className="text-xs text-gray-400 capitalize">{f.type} · {f.tune_count} tune{f.tune_count !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-gray-300 text-sm">›</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
