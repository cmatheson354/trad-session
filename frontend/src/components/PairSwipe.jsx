import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api.js'
import abcjs from 'abcjs'

function SheetPreview({ abc }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current || !abc?.trim()) return
    abcjs.renderAbc(ref.current, abc, {
      scale: 0.8, staffwidth: 280, responsive: 'resize',
      paddingtop: 2, paddingbottom: 2, paddingleft: 0, paddingright: 0,
    })
  }, [abc])
  if (!abc?.trim()) return null
  return <div ref={ref} className="overflow-hidden opacity-70" />
}

function SwipeCard({ tune, onVote, offset }) {
  const cardRef = useRef(null)
  const [drag, setDrag] = useState({ active: false, startX: 0, dx: 0 })

  const handleStart = (clientX) => {
    setDrag({ active: true, startX: clientX, dx: 0 })
  }
  const handleMove = (clientX) => {
    if (!drag.active) return
    setDrag(d => ({ ...d, dx: clientX - d.startX }))
  }
  const handleEnd = () => {
    if (!drag.active) return
    const threshold = 80
    if (drag.dx > threshold) onVote(1)
    else if (drag.dx < -threshold) onVote(0)
    setDrag({ active: false, startX: 0, dx: 0 })
  }

  const rotation = drag.dx * 0.08
  const opacity = Math.max(0, 1 - Math.abs(drag.dx) / 300)
  const transform = `translateX(${drag.dx}px) rotate(${rotation}deg) scale(${offset === 0 ? 1 : 0.95 - offset * 0.02})`
  const zIndex = 10 - offset

  return (
    <div
      ref={cardRef}
      className={`absolute inset-0 bg-white rounded-2xl shadow-xl border border-gray-200 p-6 flex flex-col select-none ${offset === 0 ? 'cursor-grab' : ''}`}
      style={{ transform, zIndex, opacity: offset === 0 ? opacity : 0.5 - offset * 0.15 }}
      onMouseDown={offset === 0 ? (e) => handleStart(e.clientX) : undefined}
      onMouseMove={offset === 0 ? (e) => handleMove(e.clientX) : undefined}
      onMouseUp={offset === 0 ? handleEnd : undefined}
      onMouseLeave={offset === 0 ? handleEnd : undefined}
      onTouchStart={offset === 0 ? (e) => handleStart(e.touches[0].clientX) : undefined}
      onTouchMove={offset === 0 ? (e) => handleMove(e.touches[0].clientX) : undefined}
      onTouchEnd={offset === 0 ? handleEnd : undefined}
    >
      {offset === 0 && drag.active && (
        <>
          {drag.dx > 40 && (
            <div className="absolute top-4 left-4 bg-green-500 text-white font-bold text-xl px-4 py-1 rounded-lg rotate-[-12deg] shadow-lg">
              YES
            </div>
          )}
          {drag.dx < -40 && (
            <div className="absolute top-4 right-4 bg-red-500 text-white font-bold text-xl px-4 py-1 rounded-lg rotate-[12deg] shadow-lg">
              NO
            </div>
          )}
        </>
      )}

      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-3">{tune.title}</h2>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-medium px-3 py-1 rounded-full bg-green-100 text-green-800 capitalize">
            {tune.tune_type?.replace('_', ' ')}
          </span>
          {tune.tune_key && (
            <span className="font-mono text-sm bg-gray-100 rounded px-2 py-1">{tune.tune_key}</span>
          )}
          {tune.mode && (
            <span className="text-sm text-gray-500 capitalize">{tune.mode}</span>
          )}
        </div>
        <SheetPreview abc={tune.abc_notation} />
      </div>
    </div>
  )
}

function NamePrompt({ onSubmit }) {
  const [name, setName] = useState('')
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="text-4xl mb-4">🎵</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">What's your name?</h2>
        <p className="text-sm text-gray-500 mb-6">So the host knows who's swiping</p>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSubmit(name.trim())}
          placeholder="Your name"
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-center text-lg focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
          autoFocus
        />
        <button
          onClick={() => name.trim() && onSubmit(name.trim())}
          disabled={!name.trim()}
          className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-colors"
        >
          Let's go
        </button>
      </div>
    </div>
  )
}

function Results({ code }) {
  const [data, setData] = useState(null)
  const [savedFriend, setSavedFriend] = useState(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api.pair.results(code).then(setData)
  }, [code])

  const saveAsSwipeFriend = async () => {
    if (!data) return
    setSaving(true)
    try {
      const name = data.voters[0]?.display_name || 'Session friend'
      const friend = await api.friends.create({ name, type: 'person', color: 'teal' })
      const ids = data.matched_tunes.map(t => t.id)
      if (ids.length) await api.friends.addTunes(friend.id, ids, 'swipe')
      setSavedFriend(name)
    } catch(e) { console.error(e) }
    setSaving(false)
  }

  if (!data) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" /></div>

  const { matched_tunes, total_tunes, voters, owner, invite } = data
  const byType = {}
  matched_tunes.forEach(t => {
    const type = t.tune_type?.replace('_', ' ') || 'other'
    if (!byType[type]) byType[type] = []
    byType[type].push(t)
  })

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white p-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8 pt-8">
          <div className="text-5xl mb-3">🎶</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {matched_tunes.length} tune{matched_tunes.length !== 1 ? 's' : ''} matched!
          </h1>
          <p className="text-gray-500 text-sm">
            Out of {total_tunes} &middot; {voters.map(v => v.display_name).join(', ')} + {owner?.display_name || 'host'}
          </p>
          {invite.prompt && <p className="text-green-700 font-medium mt-2">"{invite.prompt}"</p>}
        </div>

        {matched_tunes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-3">😅</div>
            <p>No common tunes found. Time to learn some together!</p>
          </div>
        ) : (
          Object.entries(byType).map(([type, tunes]) => (
            <div key={type} className="mb-6">
              <h3 className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2 px-1">
                {type}s ({tunes.length})
              </h3>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {tunes.map(t => (
                  <div key={t.id} className="px-4 py-3 flex items-center justify-between">
                    <span className="font-medium text-gray-900">{t.title}</span>
                    <span className="text-xs text-gray-400 font-mono">
                      {[t.tune_key, t.mode].filter(Boolean).join(' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        {data?.voters?.length > 0 && matched_tunes.length > 0 && (
          <div className="mt-6 text-center">
            {savedFriend ? (
              <p className="text-sm text-green-700">✓ Saved {savedFriend} as a friend with {matched_tunes.length} tune{matched_tunes.length !== 1 ? 's' : ''}</p>
            ) : (
              <button
                onClick={saveAsSwipeFriend}
                disabled={saving}
                className="text-sm bg-green-700 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
              >
                {saving ? 'Saving…' : `+ Save ${data.voters[0]?.display_name || 'them'} as a friend`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PairSwipe({ code }) {
  const [invite, setInvite] = useState(null)
  const [player, setPlayer] = useState(null)
  const [needsName, setNeedsName] = useState(false)
  const [queue, setQueue] = useState([])
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const me = await api.pair.me()
        if (cancelled) return
        setPlayer(me.player)
        const inv = await api.pair.getInvite(code)
        if (cancelled) return
        setInvite(inv)
        if (me.player.display_name === 'Anonymous') {
          setNeedsName(true)
        } else {
          const unvoted = inv.tunes.filter(t => !(t.id in inv.my_votes))
          setQueue(unvoted)
          setProgress(inv.tunes.length - unvoted.length)
          if (unvoted.length === 0) setDone(true)
        }
      } catch {
        if (!cancelled) setError('Invite not found or expired')
      }
    }
    init()
    return () => { cancelled = true }
  }, [code])

  const handleName = async (name) => {
    const resp = await api.pair.updateMe(name)
    setPlayer(resp.player)
    setNeedsName(false)
    if (invite) {
      const unvoted = invite.tunes.filter(t => !(t.id in invite.my_votes))
      setQueue(unvoted)
      setProgress(invite.tunes.length - unvoted.length)
      if (unvoted.length === 0) setDone(true)
    }
  }

  const handleVote = useCallback(async (vote) => {
    if (!queue.length) return
    const tune = queue[0]
    await api.pair.vote(code, tune.id, vote)
    setQueue(q => q.slice(1))
    setProgress(p => p + 1)
    if (queue.length <= 1) setDone(true)
  }, [queue, code])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-red-50 to-white p-4">
        <div className="text-center">
          <div className="text-4xl mb-3">😕</div>
          <p className="text-gray-700 font-medium">{error}</p>
        </div>
      </div>
    )
  }

  if (!invite || !player) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" /></div>
  }

  if (needsName) return <NamePrompt onSubmit={handleName} />
  if (done) return <Results code={code} />

  const total = invite.tunes.length

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col">
      <div className="text-center pt-6 pb-2 px-4">
        <p className="text-sm text-gray-500">{invite.owner?.display_name || 'Someone'}'s tunes</p>
        {invite.prompt && <p className="text-green-700 font-medium text-sm">"{invite.prompt}"</p>}
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="h-1.5 flex-1 max-w-xs bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all duration-300 rounded-full" style={{ width: `${(progress / total) * 100}%` }} />
          </div>
          <span className="text-xs text-gray-400 font-mono">{progress}/{total}</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-4">
        <div className="relative w-full max-w-sm h-96">
          {queue.slice(0, 3).map((tune, i) => (
            <SwipeCard
              key={tune.id}
              tune={tune}
              offset={i}
              onVote={i === 0 ? handleVote : () => {}}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 pb-8">
        <button
          onClick={() => handleVote(0)}
          className="w-16 h-16 rounded-full bg-red-100 hover:bg-red-200 text-red-600 text-2xl font-bold flex items-center justify-center shadow-lg transition-colors"
          title="No"
        >
          ✕
        </button>
        <button
          onClick={() => handleVote(1)}
          className="w-16 h-16 rounded-full bg-green-100 hover:bg-green-200 text-green-600 text-2xl font-bold flex items-center justify-center shadow-lg transition-colors"
          title="Yes"
        >
          ✓
        </button>
      </div>
    </div>
  )
}
