import { useState, useEffect } from 'react'
import { api } from '../api.js'

const ALL_STATUSES = [
  { value: 'want_to_learn', label: 'Want to Learn' },
  { value: 'learning',      label: 'Learning' },
  { value: 'know_it',       label: 'Know It' },
  { value: 'performance_ready', label: 'Performance Ready' },
]

export default function ShareModal({ onClose, statusLabels }) {
  const [token,    setToken]    = useState(null)
  const [label,    setLabel]    = useState('My Trad Tune List')
  const [statuses, setStatuses] = useState(['know_it','performance_ready'])
  const [loading,  setLoading]  = useState(true)
  const [copied,   setCopied]   = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const load = async () => {
      const [tok, cfg] = await Promise.all([
        api.share.getToken(),
        api.share.getConfig(),
      ])
      setToken(tok.token)
      if (cfg.share_statuses) setStatuses(cfg.share_statuses.split(','))
      if (cfg.share_label) setLabel(cfg.share_label)
      setLoading(false)
    }
    load()
  }, [])

  const shareUrl = token
    ? `${window.location.protocol}//${window.location.host}/share/${token}`
    : null

  const generate = async () => {
    setLoading(true)
    await api.share.saveConfig({ share_label: label, share_statuses: statuses.join(',') })
    const r = await api.share.generateToken()
    setToken(r.token)
    setLoading(false)
  }

  const revoke = async () => {
    setRevoking(true)
    await api.share.revokeToken()
    setToken(null)
    setRevoking(false)
    setConfirming(false)
  }

  const save = async () => {
    await api.share.saveConfig({ share_label: label, share_statuses: statuses.join(',') })
  }

  const copy = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleStatus = (v) => {
    setStatuses(prev => prev.includes(v) ? prev.filter(s => s !== v) : [...prev, v])
  }

  const labelFor = (v) => statusLabels?.[v] || ALL_STATUSES.find(s => s.value === v)?.label || v

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}>
      <div className="bg-gray-900 text-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-bold">🔗 Share Tune List</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading…</div>
          ) : (
            <>
              {/* Label */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Page title shown to visitors</label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"/>
              </div>

              {/* Status filter */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">Share tunes with these statuses</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_STATUSES.map(s => (
                    <button key={s.value}
                      onClick={() => toggleStatus(s.value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        statuses.includes(s.value)
                          ? 'bg-emerald-700 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}>
                      {labelFor(s.value)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Current link */}
              {shareUrl ? (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-400">Share link</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={shareUrl}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-emerald-300 font-mono truncate"/>
                    <button onClick={copy}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                        copied ? 'bg-emerald-700' : 'bg-gray-700 hover:bg-gray-600'
                      }`}>
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Anyone with this link can view your tune list (read-only). No login required.</p>

                  <div className="flex gap-2 pt-1">
                    <button onClick={async () => { await save(); await generate() }}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold bg-gray-700 hover:bg-gray-600 transition-colors">
                      Update & Regenerate
                    </button>
                    {confirming ? (
                      <>
                        <button onClick={revoke} disabled={revoking}
                          className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-700 hover:bg-red-600 transition-colors">
                          {revoking ? '…' : 'Confirm Revoke'}
                        </button>
                        <button onClick={() => setConfirming(false)}
                          className="px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirming(true)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 border border-red-800 text-red-400 hover:bg-red-900 hover:text-red-300 transition-colors">
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <p className="text-sm text-gray-400">No share link active. Generate one to share your tune list.</p>
                  <button onClick={() => { save(); generate() }}
                    className="w-full py-3 rounded-xl text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 transition-colors">
                    Generate Share Link
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
