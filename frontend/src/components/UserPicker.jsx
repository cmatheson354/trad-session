// Full-screen user picker — shown on first load when no user is selected,
// or when switching users from the header.
import { useState } from 'react'
import { api } from '../api.js'

const AVATARS = {
  Chris: '🪈',
  Tre:   '🎸',
}
const COLORS = {
  Chris: 'from-green-800 to-green-600',
  Tre:   'from-blue-800  to-blue-600',
}

export default function UserPicker({ users, onPicked, overlay = false }) {
  const [loading, setLoading] = useState(null)

  const pick = async (user) => {
    setLoading(user.id)
    try {
      await api.users.switchUser(user.id)
      onPicked(user)
    } finally {
      setLoading(null)
    }
  }

  const content = (
    <div className={`flex flex-col items-center justify-center gap-8 p-8 ${overlay ? '' : 'min-h-screen'}`}>
      <div className="text-center space-y-2">
        <div className="text-5xl">🎵</div>
        <h1 className="text-3xl font-bold text-white">Trad Session</h1>
        <p className="text-green-300 text-sm">Who's playing today?</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-5 w-full max-w-sm sm:max-w-md">
        {users.map(user => (
          <button
            key={user.id}
            onClick={() => pick(user)}
            disabled={loading !== null}
            className={`flex-1 bg-gradient-to-br ${COLORS[user.name] || 'from-gray-700 to-gray-600'} 
              text-white rounded-2xl p-8 flex flex-col items-center gap-3 shadow-xl
              hover:scale-105 active:scale-95 transition-transform disabled:opacity-60`}
          >
            <span className="text-6xl">{loading === user.id ? '⏳' : (AVATARS[user.name] || '🎵')}</span>
            <span className="text-2xl font-bold">{user.name}</span>
          </button>
        ))}
      </div>
    </div>
  )

  if (overlay) {
    return (
      <div className="fixed inset-0 bg-gray-900/95 z-50 flex items-center justify-center" >
        {content}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-green-900">
      {content}
    </div>
  )
}
