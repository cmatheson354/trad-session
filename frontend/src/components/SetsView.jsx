import { useState, useEffect } from 'react'
import { api } from '../api.js'
import SetCard from './SetCard.jsx'
import SetsModal from './SetsModal.jsx'

export default function SetsView({ allTunes, onPlaySet }) {
  const [sets, setSets] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingSet, setEditingSet] = useState(null)
  const [showModal, setShowModal] = useState(false)

  const load = async () => {
    setLoading(true)
    setSets(await api.sets.list().catch(() => []))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSave = (saved) => {
    setSets(prev => {
      const exists = prev.find(s => s.id === saved.id)
      return exists ? prev.map(s => s.id === saved.id ? saved : s) : [saved, ...prev]
    })
  }

  const handleDelete = async (set) => {
    if (!confirm(`Delete "${set.name || 'this set'}"?`)) return
    await api.sets.delete(set.id)
    setSets(prev => prev.filter(s => s.id !== set.id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{sets.length} set{sets.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => { setEditingSet(null); setShowModal(true) }}
          className="bg-green-700 hover:bg-green-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <span>+</span> New Set
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-gray-400">Loading sets…</div>
      ) : sets.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4">🎶</p>
          <p className="text-lg">No sets yet.</p>
          <p className="text-sm mt-2">Group your tunes into sets to practice and play them together.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4">
          {sets.map(set => (
            <SetCard
              key={set.id}
              set={set}
              onClick={() => { setEditingSet(set); setShowModal(true) }}
              onEdit={s => { setEditingSet(s); setShowModal(true) }}
              onPlay={onPlaySet}
            />
          ))}
        </div>
      )}

      {showModal && (
        <SetsModal
          allTunes={allTunes}
          set={editingSet}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingSet(null) }}
        />
      )}
    </div>
  )
}
