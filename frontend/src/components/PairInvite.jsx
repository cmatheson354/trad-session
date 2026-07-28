import { useState, useEffect } from 'react'
import { api } from '../api.js'

export default function PairInvite({ onClose }) {
  const [invites, setInvites] = useState([])
  const [prompt, setPrompt] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(null)
  const [player, setPlayer] = useState(null)
  const [editName, setEditName] = useState(false)
  const [nameInput, setNameInput] = useState('')

  useEffect(() => {
    api.pair.me().then(r => {
      setPlayer(r.player)
      setNameInput(r.player.display_name === 'Anonymous' ? '' : r.player.display_name)
    })
    api.pair.listInvites().then(setInvites)
  }, [])

  const saveName = async () => {
    if (!nameInput.trim()) return
    const r = await api.pair.updateMe(nameInput.trim())
    setPlayer(r.player)
    setEditName(false)
  }

  const create = async () => {
    setCreating(true)
    const inv = await api.pair.createInvite(prompt.trim() || null)
    setInvites(prev => [inv, ...prev])
    setPrompt('')
    setCreating(false)
  }

  const copyLink = (code) => {
    const url = `${window.location.origin}/pair/${code}`
    navigator.clipboard.writeText(url)
    setCopied(code)
    setTimeout(() => setCopied(null), 2000)
  }

  const deleteInvite = async (code) => {
    await api.pair.deleteInvite(code)
    setInvites(prev => prev.filter(i => i.code !== code))
  }

  const viewResults = (code) => {
    window.open(`/pair/${code}/results`, '_blank')
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Tune Pairing</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Player identity */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Your name</p>
                {editName ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveName()}
                      className="border border-gray-300 rounded px-2 py-1 text-sm w-40 focus:outline-none focus:ring-1 focus:ring-green-500"
                      autoFocus
                    />
                    <button onClick={saveName} className="text-green-700 text-sm font-medium">Save</button>
                  </div>
                ) : (
                  <p className="font-medium text-gray-900">{player?.display_name || '...'}</p>
                )}
              </div>
              {!editName && (
                <button onClick={() => setEditName(true)} className="text-sm text-green-700 hover:underline">Edit</button>
              )}
            </div>
          </div>

          {/* Create invite */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Create an invite</h3>
            <input
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="What's this for? (optional)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
            />
            <p className="text-xs text-gray-400 mb-3">
              Others will swipe through your "Know It" and "Performance Ready" tunes
            </p>
            <button
              onClick={create}
              disabled={creating}
              className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl transition-colors text-sm"
            >
              {creating ? 'Creating...' : 'Create Invite'}
            </button>
          </div>

          {/* Existing invites */}
          {invites.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Your invites</h3>
              <div className="space-y-3">
                {invites.map(inv => (
                  <div key={inv.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-bold text-green-700">{inv.code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {inv.status}
                      </span>
                    </div>
                    {inv.prompt && <p className="text-sm text-gray-600 mb-2">"{inv.prompt}"</p>}
                    <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                      {inv.voters?.length > 0 && (
                        <span>{inv.voters.map(v => v.display_name).join(', ')} swiped</span>
                      )}
                      {inv.yes_count > 0 && <span>&middot; {inv.yes_count} yes votes</span>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyLink(inv.code)}
                        className="flex-1 text-sm py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors font-medium"
                      >
                        {copied === inv.code ? 'Copied!' : 'Copy Link'}
                      </button>
                      {inv.voters?.length > 0 && (
                        <button
                          onClick={() => viewResults(inv.code)}
                          className="flex-1 text-sm py-1.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-800 transition-colors font-medium"
                        >
                          Results
                        </button>
                      )}
                      <button
                        onClick={() => deleteInvite(inv.code)}
                        className="text-sm py-1.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
