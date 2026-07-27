import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import { BrowserQRCodeReader } from '@zxing/browser'
import { api } from '../api.js'

// ── Tune normalisation (mirrors backend logic) ─────────────────────────────
function normalise(title) {
  if (!title) return ''
  let s = title.toLowerCase()
  // strip leading articles
  s = s.replace(/^(the|a|an)\s+/i, '')
  // NFD → strip combining chars
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // keep alphanumeric + spaces
  s = s.replace(/[^a-z0-9 ]/g, '')
  return s.trim()
}

function tokenOverlap(a, b) {
  const ta = new Set(a.split(' ').filter(Boolean))
  const tb = new Set(b.split(' ').filter(Boolean))
  let common = 0
  ta.forEach(t => { if (tb.has(t)) common++ })
  return common / Math.max(ta.size, tb.size, 1)
}

function tunesMatch(a, b) {
  // same type required
  if (a.tune_type !== b.tune_type) return false
  const na = normalise(a.title)
  const nb = normalise(b.title)
  if (na === nb) return true
  // prefix or 70% token overlap
  if (na.startsWith(nb) || nb.startsWith(na)) return true
  return tokenOverlap(na, nb) >= 0.7
}

// For each of my tunes, find which players also have a matching tune
function computeOverlap(myTunes, players) {
  if (!players.length) return []
  const results = []
  for (const mine of myTunes) {
    const matches = []
    let allMatch = true
    for (const p of players) {
      const found = p.tunes.find(t => tunesMatch(mine, t))
      if (found) matches.push({ player: p.label, tune: found })
      else allMatch = false
    }
    if (matches.length > 0) {
      results.push({
        tune: mine,
        matches,
        matchCount: matches.length + 1, // +1 for me
        totalPlayers: players.length + 1,
        allMatch,
      })
    }
  }
  // Sort: all players first, then by match count desc, then title
  results.sort((a, b) => b.matchCount - a.matchCount || a.tune.title.localeCompare(b.tune.title))
  return results
}

// Extract token from a share URL
function tokenFromUrl(url) {
  try {
    const u = new URL(url)
    const m = u.pathname.match(/\/share\/([^/]+)$/)
    return m ? m[1] : null
  } catch { return null }
}

// ── Main component ─────────────────────────────────────────────────────────
export default function SessionMatcher({ onClose, statusLabels }) {
  const [tab,      setTab]      = useState('qr')   // 'qr' | 'scan' | 'overlap'
  const [myUrl,    setMyUrl]    = useState(null)
  const [qrCanvas, setQrCanvas] = useState(null)
  const [players,  setPlayers]  = useState([])     // [{label, tunes}]
  const [myTunes,  setMyTunes]  = useState([])
  const [scanning, setScanning] = useState(false)
  const [scanMsg,  setScanMsg]  = useState('')
  const [loading,  setLoading]  = useState(true)
  const [genning,  setGenning]  = useState(false)

  const videoRef  = useRef(null)
  const readerRef = useRef(null)
  const controlsRef = useRef(null)

  // Load or generate share token + own tunes
  useEffect(() => {
    const init = async () => {
      // Get own tunes (know_it + performance_ready)
      const tunes = await api.tunes.list()
      setMyTunes(tunes.filter(t => ['know_it','performance_ready'].includes(t.status)))

      // Get/create share token
      let { token } = await api.share.getToken()
      if (!token) {
        await api.share.saveConfig({
          share_statuses: 'know_it,performance_ready',
          share_label: 'My Trad Tunes',
        })
        const r = await api.share.generateToken()
        token = r.token
      }
      const url = `${window.location.protocol}//${window.location.host}/share/${token}`
      setMyUrl(url)

      // Generate QR image
      try {
        const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: '#ffffff', light: '#0f172a' } })
        setQrCanvas(dataUrl)
      } catch (e) { console.error(e) }
      setLoading(false)
    }
    init()
  }, [])

  // Scan a QR code
  const startScan = useCallback(async () => {
    setScanning(true)
    setScanMsg('Point camera at another player\'s QR code…')
    try {
      const reader = new BrowserQRCodeReader()
      readerRef.current = reader
      const devices = await BrowserQRCodeReader.listVideoInputDevices()
      const deviceId = devices.find(d => /back|rear|environment/i.test(d.label))?.deviceId
        || devices[devices.length - 1]?.deviceId
      const controls = await reader.decodeFromVideoDevice(deviceId, videoRef.current, async (result, err) => {
        if (!result) return
        const url = result.getText()
        const token = tokenFromUrl(url)
        if (!token) { setScanMsg('❌ Not a valid Trad Session QR code'); return }
        if (players.find(p => p.url === url)) { setScanMsg('Already added'); return }
        setScanMsg('⏳ Fetching their tune list…')
        try {
          const resp = await fetch(url + '?format=json')
          const data = await resp.json()
          const newPlayer = { label: data.label || 'Player', url, tunes: data.tunes || [] }
          setPlayers(prev => [...prev, newPlayer])
          setScanMsg(`✓ Added "${newPlayer.label}" (${newPlayer.tunes.length} tunes)`)
          setTimeout(() => { stopScan(); setTab('overlap') }, 1200)
        } catch { setScanMsg('❌ Could not fetch their tune list') }
      })
      controlsRef.current = controls
    } catch (e) {
      setScanMsg('❌ Camera error: ' + e.message)
      setScanning(false)
    }
  }, [players])

  const stopScan = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setScanning(false)
    setScanMsg('')
  }, [])

  useEffect(() => () => stopScan(), [stopScan])

  const overlap = computeOverlap(myTunes, players)
  const allMatch = overlap.filter(r => r.allMatch)
  const partial  = overlap.filter(r => !r.allMatch)

  const typeColor = { reel:'bg-blue-900 text-blue-300', jig:'bg-green-900 text-green-300', hornpipe:'bg-purple-900 text-purple-300', polka:'bg-orange-900 text-orange-300' }
  const typeBadge = (t) => `px-1.5 py-0.5 rounded text-xs font-medium ${typeColor[t] || 'bg-gray-700 text-gray-300'}`

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}>
      <div className="bg-gray-900 text-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold">🤝 Session Matcher</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 flex-shrink-0">
          {[['qr','📱 My QR'],['scan','📷 Scan'],['overlap',`🎵 Overlap${overlap.length ? ` (${overlap.length})` : ''}`]].map(([t,label]) => (
            <button key={t} onClick={() => { if (t !== 'scan' && scanning) stopScan(); setTab(t) }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab===t ? 'text-emerald-400 border-b-2 border-emerald-400' : 'text-gray-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : tab === 'qr' ? (
            <div className="p-6 flex flex-col items-center gap-4">
              <p className="text-sm text-gray-400 text-center">
                Show this QR code to other players so they can scan your tune list.
              </p>
              {qrCanvas ? (
                <div className="bg-gray-800 p-4 rounded-2xl">
                  <img src={qrCanvas} alt="QR Code" className="w-48 h-48 rounded-lg"/>
                </div>
              ) : <div className="w-48 h-48 bg-gray-800 rounded-2xl flex items-center justify-center text-gray-500">…</div>}
              <p className="text-xs text-gray-500 text-center max-w-xs break-all font-mono">{myUrl}</p>
              <p className="text-xs text-gray-600 text-center">
                Sharing: Know It & Performance Ready tunes only
              </p>
              {players.length > 0 && (
                <div className="w-full bg-gray-800 rounded-xl p-3">
                  <p className="text-xs font-semibold text-gray-400 mb-2">Players added ({players.length})</p>
                  {players.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1">
                      <span className="text-gray-300">{p.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{p.tunes.length} tunes</span>
                        <button onClick={() => setPlayers(prev => prev.filter((_,j) => j !== i))}
                          className="text-red-400 hover:text-red-300 text-xs">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setTab('scan')}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 transition-colors">
                📷 Scan Another Player
              </button>
            </div>

          ) : tab === 'scan' ? (
            <div className="p-4 flex flex-col items-center gap-4">
              <p className="text-sm text-gray-400 text-center">
                Scan another player's QR code from their "My QR" tab.
              </p>
              <div className="relative w-full max-w-xs aspect-square bg-black rounded-2xl overflow-hidden">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline/>
                {/* Corner guides */}
                {scanning && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 relative">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"/>
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"/>
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"/>
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"/>
                    </div>
                  </div>
                )}
                {!scanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-gray-500 text-4xl">📷</span>
                  </div>
                )}
              </div>
              {scanMsg && (
                <p className={`text-sm text-center ${scanMsg.startsWith('✓') ? 'text-emerald-400' : scanMsg.startsWith('❌') ? 'text-red-400' : 'text-gray-300'}`}>
                  {scanMsg}
                </p>
              )}
              <button
                onClick={scanning ? stopScan : startScan}
                className={`w-full max-w-xs py-3 rounded-xl text-sm font-semibold transition-colors ${
                  scanning ? 'bg-red-700 hover:bg-red-600' : 'bg-emerald-700 hover:bg-emerald-600'
                }`}>
                {scanning ? '⏹ Stop' : '▶ Start Camera'}
              </button>
              {players.length > 0 && (
                <button onClick={() => { stopScan(); setTab('overlap') }}
                  className="text-sm text-emerald-400 hover:text-emerald-300 underline">
                  View overlap ({players.length} player{players.length > 1 ? 's' : ''} scanned) →
                </button>
              )}
            </div>

          ) : /* overlap tab */ (
            <div className="p-4 space-y-4">
              {players.length === 0 ? (
                <div className="text-center py-8 space-y-3">
                  <p className="text-gray-400 text-sm">No players scanned yet.</p>
                  <button onClick={() => setTab('scan')}
                    className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm font-medium">
                    📷 Scan a Player
                  </button>
                </div>
              ) : overlap.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">No tunes in common! Maybe scan more players or check statuses.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      {players.length + 1} players · {myTunes.length} your tunes
                    </p>
                    <button onClick={() => setTab('scan')}
                      className="text-xs text-emerald-400 hover:text-emerald-300">
                      + Add player
                    </button>
                  </div>

                  {allMatch.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-2">
                        ✓ Everyone Knows ({allMatch.length})
                      </h3>
                      <div className="space-y-1">
                        {allMatch.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-800/30 rounded-lg px-3 py-2">
                            <span className="flex-1 text-sm text-white">{r.tune.title}</span>
                            <span className={typeBadge(r.tune.tune_type)}>{r.tune.tune_type}</span>
                            <span className="text-xs text-gray-400">{r.tune.tune_key || ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {partial.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-yellow-400 uppercase tracking-wide mb-2">
                        ◐ Partial Match ({partial.length})
                      </h3>
                      <div className="space-y-1">
                        {partial.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2">
                            <span className="flex-1 text-sm text-gray-200">{r.tune.title}</span>
                            <span className={typeBadge(r.tune.tune_type)}>{r.tune.tune_type}</span>
                            <span className="text-xs text-yellow-400 font-mono">{r.matchCount}/{r.totalPlayers}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
