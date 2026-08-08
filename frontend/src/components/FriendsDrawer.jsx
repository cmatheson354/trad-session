import { useState, useEffect } from 'react'
import { api } from '../api.js'

// FriendsDrawer — user switcher, account, connected players, friend connect
export default function FriendsDrawer({
  onClose,
  currentUser,
  users,
  onSwitchUser,
  userFriends,
  onUserFriendsChange,
  onShare,
  onPairInvite,
  onMatcher,
  onFriendsModal,  // legacy
}) {
  const [shareToken, setShareToken] = useState(null)
  const [copied, setCopied] = useState(false)
  const [removing, setRemoving] = useState(null)

  useEffect(() => {
    api.share.getToken().then(r => setShareToken(r.token)).catch(() => {})
  }, [])

  const friendConnectUrl = shareToken
    ? `${window.location.protocol}//${window.location.host}/?connect=${shareToken}`
    : null

  const generateToken = async () => {
    const r = await api.share.generateToken()
    setShareToken(r.token)
  }

  const copyConnect = () => {
    if (!friendConnectUrl) return
    navigator.clipboard.writeText(friendConnectUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const removeFriend = async (f) => {
    setRemoving(f.id)
    try {
      await api.userFriends.remove(f.id)
      onUserFriendsChange(prev => prev.filter(x => x.id !== f.id))
    } finally {
      setRemoving(null)
    }
  }

  const STATUS_COLOR = {
    want_to_learn:     'bg-red-600 text-white',
    learning:          'bg-orange-500 text-white',
    know_it:           'bg-green-600 text-white',
    performance_ready: 'bg-yellow-500 text-black',
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 text-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 sticky top-0 bg-gray-900 rounded-t-2xl z-10">
          <h2 className="text-base font-bold">👥 Friends & Account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-[75vh]">

          {/* Account / user switcher */}
          {users && users.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Account</p>
              <div className="flex gap-2">
                {users.map(u => (
                  <button key={u.id}
                    onClick={() => { onSwitchUser(u); onClose() }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      currentUser?.id === u.id
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}>
                    {u.name === 'Chris' ? '🪈' : u.name === 'Tre' ? '🎸' : '👤'} {u.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Connected friends */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Connected Players</p>
            {userFriends.length === 0 ? (
              <p className="text-sm text-gray-500 py-2">No friends connected yet. Share your connect link below.</p>
            ) : (
              <div className="space-y-2">
                {userFriends.map(f => (
                  <div key={f.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2.5">
                    <span className="text-sm font-medium">
                      {f.name === 'Chris' ? '🪈' : f.name === 'Tre' ? '🎸' : '👤'} {f.name}
                    </span>
                    <button
                      onClick={() => removeFriend(f)}
                      disabled={removing === f.id}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40">
                      {removing === f.id ? '…' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Friend connect link */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Friend Connect Link</p>
            {friendConnectUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input readOnly value={friendConnectUrl}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-emerald-300 font-mono truncate"/>
                  <button onClick={copyConnect}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${copied ? 'bg-emerald-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
                    {copied ? '✓' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-gray-500">Send this to another player — they tap it to connect with you.</p>
              </div>
            ) : (
              <button onClick={generateToken}
                className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-sm font-semibold transition-colors">
                Generate Connect Link
              </button>
            )}
          </div>

          {/* Tune list share */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Share & Discover</p>
            <div className="space-y-2">
              <button onClick={() => { onShare(); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-200 transition-colors text-left">
                <span>🔗</span><span>Share Tune List</span>
              </button>
              <button onClick={() => { onMatcher(); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-200 transition-colors text-left">
                <span>🔀</span><span>Session Matcher — find tunes everyone knows</span>
              </button>
              <button onClick={() => { onPairInvite(); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-medium text-gray-200 transition-colors text-left">
                <span>🤝</span><span>Tune Pairing</span>
              </button>
            </div>
          </div>

          {/* Badge legend */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Badge Colours</p>
            <div className="flex flex-wrap gap-2">
              {[
                { s: 'want_to_learn', label: 'Want to Learn' },
                { s: 'learning', label: 'Learning' },
                { s: 'know_it', label: 'Know It' },
                { s: 'performance_ready', label: 'Performance Ready' },
              ].map(({ s, label }) => (
                <span key={s} className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLOR[s]}`}>{label}</span>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
