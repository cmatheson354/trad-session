import { useState, useEffect } from 'react'
import { api } from '../api.js'

export default function FriendConnectModal({ token, onClose, onConnected }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.userFriends.connectInfo(token)
      .then(setInfo)
      .catch(e => setError(e.message ?? 'Invalid link'))
      .finally(() => setLoading(false))
  }, [token]) // eslint-disable-line

  const connect = async () => {
    setConnecting(true)
    try {
      const r = await api.userFriends.connect(token)
      setDone(true)
      setTimeout(() => onConnected(r.connected_with), 1200)
    } catch (e) {
      setError(e.message ?? 'Connection failed')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="text-center space-y-4">
          <div className="text-4xl">👥</div>
          {loading && <p className="text-gray-500">Loading…</p>}
          {error && (
            <>
              <p className="text-red-600 font-semibold">{error}</p>
              <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium">Close</button>
            </>
          )}
          {!loading && !error && info && (
            <>
              {done ? (
                <div className="space-y-2">
                  <div className="text-3xl">🎉</div>
                  <p className="font-bold text-green-700">Connected with {info.owner?.name}!</p>
                  <p className="text-sm text-gray-500">You'll now see each other's tune progress.</p>
                </div>
              ) : info.is_self ? (
                <>
                  <p className="font-semibold text-gray-700">That's your own link!</p>
                  <p className="text-sm text-gray-500">Share it with another player to connect as friends.</p>
                  <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium">Close</button>
                </>
              ) : info.already_friends ? (
                <>
                  <p className="font-semibold text-gray-700">Already friends with {info.owner?.name}!</p>
                  <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium">Close</button>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-800">Connect with {info.owner?.name}?</h2>
                  <p className="text-sm text-gray-500">
                    You'll see each other's tune progress as coloured badges on your cards, and a "Friends' Tunes" section for tunes they know that you haven't added yet.
                  </p>
                  <div className="flex gap-3 pt-2">
                    <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium transition-colors">
                      Not now
                    </button>
                    <button onClick={connect} disabled={connecting}
                      className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors disabled:opacity-60">
                      {connecting ? 'Connecting…' : `Connect with ${info.owner?.name}`}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
