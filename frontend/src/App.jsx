import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { api } from './api.js'
import { isAbcSearch, filterByNotes, countParts } from './abcSearch.js'
import { loadStatusLabels, loadDupePrefs, saveDupePrefs } from './constants.js'
import TuneGrid from './components/TuneGrid.jsx'
import TuneModal from './components/TuneModal.jsx'
import TuneForm from './components/TuneForm.jsx'
import TuneSearch from './components/TuneSearch.jsx'
import StatsBar from './components/StatsBar.jsx'
import FilterBar from './components/FilterBar.jsx'
import SessionRecordingsModal from './components/SessionRecordingsModal.jsx'
import MiniPlayer from './components/MiniPlayer.jsx'
import { parseFirst8, buildSnippetAbc } from './components/TuneSnippet.jsx'
import ImportExportModal from './components/ImportExportModal.jsx'
import ListMenu from './components/ListMenu.jsx'
import SetsView from './components/SetsView.jsx'
import UserSettings from './components/UserSettings.jsx'
import FloatingRecorder from './components/FloatingRecorder.jsx'
import DupeReviewModal from './components/DupeReviewModal.jsx'
import Tuner from './components/Tuner.jsx'
import ShareModal from './components/ShareModal.jsx'
import FriendConnectModal from './components/FriendConnectModal.jsx'
import SessionMatcher from './components/SessionMatcher.jsx'
import PairSwipe from './components/PairSwipe.jsx'
import PairInvite from './components/PairInvite.jsx'
import FriendsModal from './components/FriendsModal.jsx'
import UserPicker from './components/UserPicker.jsx'
import SoundUpgradeButton from './components/SoundUpgradeButton.jsx'
import PlayerDrawer from './components/PlayerDrawer.jsx'
import ToolsDrawer from './components/ToolsDrawer.jsx'
import FriendsDrawer from './components/FriendsDrawer.jsx'
import AddDrawer from './components/AddDrawer.jsx'

const CACHE_KEY = 'trad-tunes-cache'

export default function App() {
  const [tunes,           setTunes]          = useState([])
  const [stats,           setStats]          = useState(null)
  // Current user — null means not yet picked (shows UserPicker)
  const [currentUser,     setCurrentUser]    = useState(null)
  const [users,           setUsers]          = useState([])
  const [showUserPicker,  setShowUserPicker] = useState(false)
  const [filters,         setFilters]        = useState({ q: '', status: '', type: '', key: '', friend_id: '', user_friend_id: '' })
  // searchQ: live input value (updates on every keystroke)
  // filters.q: debounced — only updates after 500ms pause or Enter
  const [searchQ,         setSearchQ]        = useState('')
  const [selectedTune,    setSelectedTune]   = useState(null)
  const [showForm,        setShowForm]       = useState(false)
  const [showSearch,      setShowSearch]     = useState(false)
  const [editingTune,     setEditingTune]    = useState(null)
  const [prefillData,     setPrefillData]    = useState(null)
  const [showSessions,    setShowSessions]   = useState(false)
  const [loading,         setLoading]        = useState(true)
  const [isOffline,       setIsOffline]      = useState(false)
  const [miniPlayer,      setMiniPlayer]     = useState(null)
  const handoffAtRef = useRef(null)   // { elapsed, duration } for mode-2 handoff
  const [showListMenu,    setShowListMenu]   = useState(false)
  const [showImport,      setShowImport]     = useState(false)
  const [showExport,      setShowExport]     = useState(false)
  const [showSettings,    setShowSettings]   = useState(false)
  const [recorderTarget,  setRecorderTarget]  = useState(null)
  const [showDupes,       setShowDupes]       = useState(false)
  const [dupesToast,      setDupesToast]      = useState(null) // {count, tuneId}
  const [showTuner,       setShowTuner]       = useState(false)
  const [showShare,       setShowShare]       = useState(false)
  const [showMatcher,     setShowMatcher]     = useState(false)
  const [showPairInvite, setShowPairInvite]  = useState(false)
  const [showFriends,    setShowFriends]     = useState(false)
  const [friends,        setFriends]         = useState([])
  const [userFriends,    setUserFriends]     = useState([])
  const [friendsTunes,   setFriendsTunes]    = useState([])
  const [connectToken,   setConnectToken]    = useState(null)  // ?connect= URL param
  const [showPlayerDrawer,  setShowPlayerDrawer]  = useState(false)
  const [showToolsDrawer,   setShowToolsDrawer]   = useState(false)
  const [showFriendsDrawer, setShowFriendsDrawer] = useState(false)
  const [showAddDrawer,     setShowAddDrawer]     = useState(false)
  const [addDrawerTitle,    setAddDrawerTitle]    = useState('')
  const [addSearchQuery,    setAddSearchQuery]    = useState('')
  const [sort,           setSort]            = useState('title_asc')
  const [shuffleKey,     setShuffleKey]      = useState(0)
  const [partsFilter,    setPartsFilter]     = useState('')
  const [sameKeyIsDupe,   setSameKeyIsDupe]   = useState(() => (loadDupePrefs().sameKeyIsDupe ?? true))
  const [tapMode,         setTapMode]        = useState(false)
  const [practiceMode,    setPracticeMode]    = useState(() => localStorage.getItem('trad-practice-mode') === 'true')
  const CLICK_MODES = ['snippet', 'full', 'details']
  const CLICK_MODE_LABELS = { snippet: '🎵 Snippet', full: '🎵 Full', details: '📋 Details' }
  const [clickMode, setClickMode] = useState(() => localStorage.getItem('trad-click-mode') ?? 'snippet')
  const cycleClickMode = () => setClickMode(m => {
    const next = CLICK_MODES[(CLICK_MODES.indexOf(m) + 1) % CLICK_MODES.length]
    localStorage.setItem('trad-click-mode', next)
    return next
  })
  const [statusLabels,    setStatusLabels]   = useState(() => loadStatusLabels())
  const [viewMode,        setViewMode]       = useState('tunes') // 'tunes' | 'sets'
  const [notationView,    setNotationView]   = useState(
    () => localStorage.getItem('notationView') ?? 'sheet'
  )


  const toggleNotationView = () =>
    setNotationView(v => {
      const next = v === 'sheet' ? 'abc' : 'sheet'
      localStorage.setItem('notationView', next)
      return next
    })

  const [instrument, setInstrument] = useState(
    () => Number(JSON.parse(localStorage.getItem('trad-player-prefs') || '{}').instrument ?? 73)
  )

  const cycleInstrument = () => {
    // Import INSTRUMENTS inline to avoid circular dep at top level
    const INSTRUMENTS = [
      { label: 'Tin Whistle', program: 73 },
      { label: 'Fiddle',      program: 40 },
      { label: 'Harp',        program: 46 },
      { label: 'Harmonica',   program: 22 },
      { label: 'Banjo',       program: 105 },
    ]
    setInstrument(curr => {
      const idx = INSTRUMENTS.findIndex(i => i.program === curr)
      const next = INSTRUMENTS[(idx + 1) % INSTRUMENTS.length]
      const prefs = JSON.parse(localStorage.getItem('trad-player-prefs') || '{}')
      localStorage.setItem('trad-player-prefs', JSON.stringify({ ...prefs, instrument: next.program }))
      return next.program
    })
  }

  const INSTRUMENTS = [
    { label: 'Tin Whistle', program: 73 },
    { label: 'Fiddle',      program: 40 },
    { label: 'Harp',        program: 46 },
    { label: 'Harmonica',   program: 22 },
    { label: 'Banjo',       program: 105 },
  ]
  const instrLabel = INSTRUMENTS.find(i => i.program === instrument)?.label ?? 'Tin Whistle'

  const SPEEDS = [
    { label: '25%',  value: 25 },
    { label: '50%',  value: 50 },
    { label: '75%',  value: 75 },
    { label: '100%', value: 100 },
    { label: '200%', value: 200 },
  ]
  const [speed, setSpeed] = useState(
    () => Number(JSON.parse(localStorage.getItem('trad-player-prefs') || '{}').speed ?? 100)
  )
  const cycleSpeed = () => {
    setSpeed(curr => {
      const idx = SPEEDS.findIndex(s => s.value === curr)
      const next = SPEEDS[(idx + 1) % SPEEDS.length]
      const prefs = JSON.parse(localStorage.getItem('trad-player-prefs') || '{}')
      localStorage.setItem('trad-player-prefs', JSON.stringify({ ...prefs, speed: next.value }))
      return next.value
    })
  }
  const speedLabel = SPEEDS.find(s => s.value === speed)?.label ?? '100%'

  const pickInstrument = (program) => {
    const prefs = JSON.parse(localStorage.getItem('trad-player-prefs') || '{}')
    localStorage.setItem('trad-player-prefs', JSON.stringify({ ...prefs, instrument: program }))
    setInstrument(program)
  }
  const pickSpeed = (val) => {
    const prefs = JSON.parse(localStorage.getItem('trad-player-prefs') || '{}')
    localStorage.setItem('trad-player-prefs', JSON.stringify({ ...prefs, speed: val }))
    setSpeed(val)
  }

  const noFiltersActive = !filters.q && !filters.status && !filters.type && !filters.key && !filters.friend_id

  // Debounce text search: commit searchQ → filters.q after 500ms idle
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(f => ({ ...f, q: searchQ }))
    }, 500)
    return () => clearTimeout(t)
  }, [searchQ])

  const filteredByParts = useMemo(() => {
    if (!partsFilter) return tunes
    return tunes.filter(t => {
      const n = countParts(t.abc_notation)
      if (partsFilter === '4+') return n !== null && n >= 4
      return n === Number(partsFilter)
    })
  }, [tunes, partsFilter]) // eslint-disable-line

  const sortedTunes = useMemo(() => {
    const arr = [...filteredByParts]
    switch (sort) {
      case 'title_desc': return arr.sort((a, b) => b.title.localeCompare(a.title))
      case 'newest':     return arr.sort((a, b) => b.id - a.id)
      case 'oldest':     return arr.sort((a, b) => a.id - b.id)
      case 'practiced':  return arr.sort((a, b) => {
        if (!a.last_practiced_at && !b.last_practiced_at) return 0
        if (!a.last_practiced_at) return 1
        if (!b.last_practiced_at) return -1
        return b.last_practiced_at.localeCompare(a.last_practiced_at)
      })
      case 'random': {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]]
        }
        return arr
      }
      default: return arr.sort((a, b) => a.title.localeCompare(b.title))
    }
  }, [filteredByParts, sort, shuffleKey]) // eslint-disable-line

  const loadTunes = useCallback(async () => {
    try {
      let data
      if (isAbcSearch(filters.q)) {
        const all = await api.tunes.list({ ...filters, q: '' })
        data = filterByNotes(all, filters.q)
      } else {
        data = await api.tunes.list(filters)
      }
      setTunes(data)
      setIsOffline(false)
      if (noFiltersActive) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch (_) {}
      }
    } catch (e) {
      console.error('Failed to load tunes', e)
      setIsOffline(true)
    }
  }, [filters]) // eslint-disable-line

  const loadStats = useCallback(async () => {
    try { setStats(await api.stats()) }
    catch (e) { console.error('Failed to load stats', e) }
  }, [])

  useEffect(() => {
    // Bootstrap user list + current user from server
    Promise.all([api.users.list(), api.users.me()]).then(([ul, me]) => {
      setUsers(ul)
      if (me && me.id) {
        setCurrentUser(me)
      }
      // if server has no user set (null/error), show picker
    }).catch(() => {
      // Couldn't reach /api/users — assume single-user mode, don't block
      setCurrentUser({ id: 1, name: 'Chris' })
    })
    // Load user-to-user friends
    api.userFriends.list().then(setUserFriends).catch(() => {})
    // Load friends' tunes (tunes friends have that I don't)
    api.friendsTunes.list().then(setFriendsTunes).catch(() => {})
    // Check for ?connect=<token> in URL for friend connect flow
    const params = new URLSearchParams(window.location.search)
    const ct = params.get('connect')
    if (ct) {
      setConnectToken(ct)
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    // Show cached tunes immediately, then revalidate in background
    if (noFiltersActive) {
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) { setTunes(JSON.parse(cached)); setLoading(false) }
      } catch (_) {}
    }
    setLoading(prev => prev)  // keep spinner if no cache
    loadTunes().finally(() => setLoading(false))
  }, [loadTunes]) // eslint-disable-line

  useEffect(() => { loadStats() }, [loadStats, tunes])

  const handleSave = async (data) => {
    if (editingTune) {
      const updated = await api.tunes.update(editingTune.id, data)
      setTunes(tunes.map(t => t.id === updated.id ? updated : t))
      if (selectedTune?.id === updated.id) setSelectedTune(updated)
    } else {
      const created = await api.tunes.create(data)
      setTunes([...tunes, created].sort((a, b) => a.title.localeCompare(b.title)))
      if (created.potential_dupes && created.potential_dupes.length > 0) {
        setDupesToast({ count: created.potential_dupes.length, tuneTitle: created.title })
        setTimeout(() => setDupesToast(null), 8000)
      }
    }
    setShowForm(false); setEditingTune(null); setPrefillData(null)
    loadStats()
  }

  const handleDelete = async (id) => {
    await api.tunes.delete(id)
    setTunes(tunes.filter(t => t.id !== id))
    setSelectedTune(null)
    loadStats()
  }

  const handleEdit = (tune) => {
    setEditingTune(tune); setShowForm(true); setSelectedTune(null)
  }

  const handlePracticed = (updatedTune) => {
    setTunes(tunes.map(t => t.id === updatedTune.id ? updatedTune : t))
    setSelectedTune(updatedTune)
    loadStats()
  }

  const handleSearchSelect = (tuneData) => {
    setPrefillData(tuneData); setShowSearch(false)
    setEditingTune(null); setShowForm(true)
  }

  const handleMiniPlay = (data) => {
    setMiniPlayer({ title: data.title ?? data.name, abc: data.abc ?? data.abc_notation, isSnippet: data._isSnippet ?? false })
  }

  const STATUSES = ['want_to_learn', 'learning', 'know_it', 'performance_ready']
  const lastCardClick = useRef({ id: null, time: 0 })

  const handleCardClick = async (tune) => {
    if (tapMode) {
      const idx = STATUSES.indexOf(tune.status)
      const next = STATUSES[(idx + 1) % STATUSES.length]
      const updated = await api.tunes.update(tune.id, { ...tune, status: next })
      setTunes(ts => ts.map(t => t.id === updated.id ? updated : t))
      loadStats()
      return
    }

    // Mode: details → always open immediately
    if (clickMode === 'details') {
      handoffAtRef.current = null
      setMiniPlayer(null)
      setSelectedTune(tune)
      return
    }

    const now = Date.now()
    const prev = lastCardClick.current
    const isSecondClick = prev.id === tune.id && now - prev.time < 3000

    if (isSecondClick) {
      // Second click → open detail modal, triggering handoff if mode=full and playing
      lastCardClick.current = { id: null, time: 0 }
      setSelectedTune(tune)
      // MiniPlayer unmount will call onHandoff → handoffAtRef will be set before TuneModal renders
      setMiniPlayer(null)
    } else {
      lastCardClick.current = { id: tune.id, time: now }
      handoffAtRef.current = null
      if (clickMode === 'snippet') {
        if (tune.abc_notation?.trim()) {
          const parsed = parseFirst8(tune.abc_notation, 10)
          const snippetAbc = parsed
            ? buildSnippetAbc(parsed.bodySlice, tune.tune_type, tune.tune_key, tune.mode)
            : tune.abc_notation
          handleMiniPlay({ ...tune, abc_notation: snippetAbc, _isSnippet: true })
        }
      } else {
        // mode = 'full' — play entire tune (wrap with headers so key/meter are correct)
        if (tune.abc_notation?.trim()) {
          const fullAbc = buildSnippetAbc(tune.abc_notation, tune.tune_type, tune.tune_key, tune.mode)
          handleMiniPlay({ ...tune, abc_notation: fullAbc, _isSnippet: false })
        }
      }
    }
  }

  const handlePlaySet = (set) => {
    // Play tunes in set sequentially via mini player (start with first tune with abc)
    const first = set.tunes.find(t => t.abc_notation?.trim())
    if (first) setMiniPlayer({ title: (set.name || set.tunes[0].title + ' Set') + ' — ' + first.title, abc: first.abc_notation })
  }

  const handleChangeSameKeyIsDupe = (val) => {
    setSameKeyIsDupe(val)
    saveDupePrefs({ sameKeyIsDupe: val })
  }

  const handleImported = () => {
    loadTunes()
    loadStats()
  }

  const handleQuickAdd = async (title) => {
    try {
      const created = await api.tunes.create({ title })
      setTunes(ts => [...ts, created].sort((a, b) => a.title.localeCompare(b.title)))
      loadStats()
      if (created.potential_dupes && created.potential_dupes.length > 0) {
        setDupesToast({ count: created.potential_dupes.length, tuneTitle: created.title })
        setTimeout(() => setDupesToast(null), 8000)
      }
    } catch (e) { console.error('Quick add failed', e) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          {/* Top row: logo + primary actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl sm:text-3xl">🎵</span>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight">Trad Session</h1>
                <p className="text-green-300 text-xs sm:text-sm hidden sm:block">Irish Trad Tune Tracker</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
            </div>
          </div>
          {/* Second row: core actions + drawer launchers */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {/* Instrument cycle */}
            <button
              onClick={cycleInstrument}
              className="text-green-300 hover:text-white border border-green-600 hover:border-green-400 font-medium px-2.5 py-1.5 rounded-lg transition-colors text-xs flex items-center gap-1"
              title="Cycle instrument"
            >
              🎵 {instrLabel}
            </button>
            {/* Speed cycle — also accessible in Player drawer */}
            <button
              onClick={cycleSpeed}
              className="text-green-300 hover:text-white border border-green-600 hover:border-green-400 font-medium px-2.5 py-1.5 rounded-lg transition-colors text-xs flex items-center gap-1"
              title="Cycle playback speed"
            >
              ⏩ {speedLabel}
            </button>
            {/* Click mode cycle */}
            <button
              onClick={cycleClickMode}
              className="text-green-300 hover:text-white border border-green-600 hover:border-green-400 font-medium px-2.5 py-1.5 rounded-lg transition-colors text-xs flex items-center gap-1"
              title="Cycle card tap action: Snippet → Full → Details"
            >
              {CLICK_MODE_LABELS[clickMode]}
            </button>
            {/* 🎵 Player drawer */}
            <button
              onClick={() => setShowPlayerDrawer(true)}
              className="text-green-300 hover:text-white border border-green-600 hover:border-green-400 font-medium px-2.5 py-1.5 rounded-lg transition-colors text-xs flex items-center gap-1"
              title="Player settings"
            >
              🎵
            </button>
            {/* 👥 Friends & Account drawer */}
            <button
              onClick={() => setShowFriendsDrawer(true)}
              className="text-green-300 hover:text-white border border-green-600 hover:border-green-400 font-medium px-2.5 py-1.5 rounded-lg transition-colors text-xs flex items-center gap-1"
              title="Friends & Account"
            >
              👥
            </button>
            {/* 🎤 Tools drawer */}
            <button
              onClick={() => setShowToolsDrawer(true)}
              className="text-green-300 hover:text-white border border-green-600 hover:border-green-400 font-medium px-2.5 py-1.5 rounded-lg transition-colors text-xs flex items-center gap-1"
              title="Tools"
            >
              🎤
            </button>
            {/* Tunes / Sets toggle */}
            <div className="flex rounded-lg overflow-hidden border border-green-600">
              <button
                onClick={() => setViewMode('tunes')}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'tunes' ? 'bg-green-600 text-white' : 'text-green-300 hover:text-white hover:bg-green-700'}`}
              >
                🎵 Tunes
              </button>
              <button
                onClick={() => setViewMode('sets')}
                className={`px-2.5 py-1.5 text-xs font-medium border-l border-green-600 transition-colors ${viewMode === 'sets' ? 'bg-green-600 text-white' : 'text-green-300 hover:text-white hover:bg-green-700'}`}
              >
                🎼 Sets
              </button>
            </div>
            {/* 📋 List menu */}
            <div className="relative">
              <button
                onClick={() => setShowListMenu(v => !v)}
                className={`border font-medium px-2.5 py-1.5 rounded-lg transition-colors text-xs flex items-center gap-1 ${showListMenu ? 'border-green-400 text-white bg-green-700' : 'text-green-300 hover:text-white border-green-600 hover:border-green-400'}`}
              >
                📋 List
              </button>
              {showListMenu && (
                <ListMenu
                  onSets={() => setViewMode('sets')}
                  onImport={() => setShowImport(true)}
                  onExport={() => setShowExport(true)}
                  onDupes={() => setShowDupes(true)}
                  onClose={() => setShowListMenu(false)}
                />
              )}
            </div>
          </div>
        </div>
      </header>

      {tapMode && (
        <div className="bg-yellow-400 text-yellow-900 text-center text-xs font-semibold py-1.5 px-4">
          👆 Tap mode — tap any card to cycle its learning level. Tap 📋 List to turn off.
        </div>
      )}
      {practiceMode && (
        <div className="bg-emerald-600 text-white text-center text-xs font-semibold py-1.5 px-4">
          🎵 Practice mode — opening a tune automatically logs it as practiced. Tap 📋 List to turn off.
        </div>
      )}
      {isOffline && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-1.5 px-4">
          Offline — showing cached tunes
        </div>
      )}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4">
        {stats && (
          <StatsBar
            stats={stats}
            activeStatus={filters.status} statusLabels={statusLabels}
            onStatusClick={s => setFilters(f => ({ ...f, status: f.status === s ? '' : s }))}
          />
        )}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          searchQ={searchQ}
          onSearchChange={(val) => {
            setSearchQ(val)
            // Instant clear when emptied
            if (!val) setFilters(f => ({ ...f, q: '' }))
          }}
          onSearchCommit={() => setFilters(f => ({ ...f, q: searchQ }))}
          friends={friends}
          userFriends={userFriends}
          sort={sort}
          onSortChange={setSort}
          onReshuffle={() => setShuffleKey(k => k + 1)}
          partsFilter={partsFilter}
          onPartsChange={setPartsFilter}
          tuneCount={tunes.length}
          onAddNew={(title) => { setAddDrawerTitle(title); setShowAddDrawer(true) }}
        />

        {viewMode === 'sets' ? (
          <SetsView allTunes={tunes} onPlaySet={handlePlaySet} />
        ) : loading ? (
          <div className="flex justify-center py-20 text-gray-400">Loading tunes…</div>
        ) : tunes.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-5xl mb-4">🎶</p>
            <p className="text-lg">No tunes found.</p>
            <p className="text-sm mt-2">
              <button onClick={() => setShowSearch(true)} className="text-green-600 underline hover:text-green-800">
                Search The Session
              </button>
              {' '}to find and add tunes, or{' '}
              <button onClick={() => { setEditingTune(null); setPrefillData(null); setShowForm(true) }} className="text-green-600 underline hover:text-green-800">
                add one manually
              </button>.
            </p>
          </div>
        ) : (
          <>
            <TuneGrid tunes={sortedTunes} onSelect={handleCardClick} notationView={notationView} statusLabels={statusLabels} tapMode={tapMode} />
            {friendsTunes.length > 0 && !filters.status && !filters.user_friend_id && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">👥 Friends&apos; Tunes</h2>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{friendsTunes.length}</span>
                </div>
                <TuneGrid tunes={friendsTunes} onSelect={(tune) => setSelectedTune(tune)} notationView={notationView} statusLabels={statusLabels} tapMode={false} />
              </div>
            )}
          </>
        )}
      </main>

      {selectedTune && (
        <TuneModal
          tune={selectedTune}
          onClose={() => { setSelectedTune(null); handoffAtRef.current = null }}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onPracticed={handlePracticed}
          notationView={notationView}
          instrument={instrument}
          speed={speed}
          statusLabels={statusLabels}
          onStartRecording={setRecorderTarget}
          autoLogPractice={practiceMode}
          autoSeekTo={handoffAtRef.current}
        />
      )}

      {showSearch && (
        <TuneSearch
          onSelect={handleSearchSelect}
          onPlay={handleMiniPlay}
          onClose={() => { setShowSearch(false); setAddSearchQuery('') }}
          onManualAdd={() => { setShowSearch(false); setAddSearchQuery(''); setEditingTune(null); setPrefillData(null); setShowForm(true) }}
          initialQuery={addSearchQuery}
        />
      )}

      {showAddDrawer && (
        <AddDrawer
          title={addDrawerTitle}
          onClose={() => setShowAddDrawer(false)}
          onSearch={() => { setAddSearchQuery(addDrawerTitle); setShowSearch(true) }}
          onQuickAdd={() => handleQuickAdd(addDrawerTitle)}
          onManual={() => { setEditingTune(null); setPrefillData({ title: addDrawerTitle }); setShowForm(true) }}
        />
      )}

      {showForm && (
        <TuneForm
          tune={editingTune ?? prefillData}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingTune(null); setPrefillData(null) }}
          statusLabels={statusLabels}
        />
      )}

      {showSessions && (
        <SessionRecordingsModal onClose={() => setShowSessions(false)} />
      )}

      {showImport && (
        <ImportExportModal
          initialTab="import"
          existingTunes={tunes}
          onImported={handleImported}
          onClose={() => setShowImport(false)}
        />
      )}
      {showExport && (
        <ImportExportModal
          initialTab="export"
          existingTunes={tunes}
          onImported={handleImported}
          onClose={() => setShowExport(false)}
        />
      )}
      {showSettings && (
        <UserSettings
          statusLabels={statusLabels}
          onStartRecording={setRecorderTarget}
          onSave={setStatusLabels}
          onClose={() => setShowSettings(false)}
          sameKeyIsDupe={sameKeyIsDupe}
          onChangeSameKeyIsDupe={handleChangeSameKeyIsDupe}
        />
      )}

      {miniPlayer && (
        <MiniPlayer
          title={miniPlayer.title}
          abc={miniPlayer.abc}
          isSnippet={miniPlayer.isSnippet}
          instrument={instrument}
          speed={speed}
          onClose={() => setMiniPlayer(null)}
          onHandoff={(elapsedSec, totalSec) => {
            if (totalSec > 0) handoffAtRef.current = elapsedSec / totalSec
          }}
        />
      )}
      {dupesToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-yellow-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 max-w-sm w-full mx-4">
          <span className="text-lg">⚠️</span>
          <div className="flex-1 text-sm">
            <strong>{dupesToast.tuneTitle}</strong> may be a duplicate.
          </div>
          <button onClick={() => { setShowDupes(true); setDupesToast(null) }}
            className="text-xs bg-yellow-800 hover:bg-yellow-900 px-3 py-1 rounded-lg shrink-0">Review</button>
          <button onClick={() => setDupesToast(null)} className="text-yellow-300 hover:text-white text-lg leading-none">&times;</button>
        </div>
      )}
      {showTuner && (
        <Tuner onClose={() => setShowTuner(false)} />
      )}
      {showMatcher && (
        <SessionMatcher onClose={() => setShowMatcher(false)} statusLabels={statusLabels} />
      )}
      {showFriends && (
        <FriendsModal
          onClose={() => setShowFriends(false)}
          onFriendsChange={setFriends}
        />
      )}

      {showPairInvite && (
        <PairInvite onClose={() => setShowPairInvite(false)} />
      )}

      {showShare && (
        <ShareModal onClose={() => setShowShare(false)} statusLabels={statusLabels} />
      )}
      {connectToken && (
        <FriendConnectModal
          token={connectToken}
          onClose={() => setConnectToken(null)}
          onConnected={(friend) => {
            setUserFriends(prev => [...prev.filter(f => f.id !== friend.id), friend])
            api.friendsTunes.list().then(setFriendsTunes).catch(() => {})
            setConnectToken(null)
          }}
        />
      )}
      {showDupes && (
        <DupeReviewModal
          onClose={() => setShowDupes(false)}
          sameKeyIsDupe={sameKeyIsDupe}
          onChangeSameKeyIsDupe={handleChangeSameKeyIsDupe}
        />
      )}
      <FloatingRecorder
        target={recorderTarget}
        onSaved={() => setRecorderTarget(null)}
        onClear={() => setRecorderTarget(null)}
      />

      {showPlayerDrawer && (
        <PlayerDrawer
          onClose={() => setShowPlayerDrawer(false)}
          instrument={instrument} onSetInstrument={pickInstrument}
          speed={speed} onSetSpeed={pickSpeed}
          notationView={notationView} onToggleNotation={toggleNotationView}
          clickMode={clickMode} onCycleClickMode={cycleClickMode}
          tapMode={tapMode} onToggleTapMode={() => setTapMode(v => !v)}
          practiceMode={practiceMode} onTogglePracticeMode={() => setPracticeMode(v => {
            const next = !v; localStorage.setItem('trad-practice-mode', next); return next
          })}
        />
      )}

      {showToolsDrawer && (
        <ToolsDrawer
          onClose={() => setShowToolsDrawer(false)}
          onTuner={() => setShowTuner(true)}
          onSessions={() => setShowSessions(true)}
          onRecord={() => setRecorderTarget({ tuneId: null, tuneTitle: null, label: '', recType: 'self' })}
          onImport={() => setShowImport(true)}
          onExport={() => setShowExport(true)}
          onDupes={() => setShowDupes(true)}
          onShare={() => setShowShare(true)}
          onMatcher={() => setShowMatcher(true)}
          onPairInvite={() => setShowPairInvite(true)}
        />
      )}

      {showFriendsDrawer && (
        <FriendsDrawer
          onClose={() => setShowFriendsDrawer(false)}
          currentUser={currentUser}
          users={users}
          onSwitchUser={(user) => {
            setCurrentUser(user); setShowFriendsDrawer(false); loadTunes(); loadStats()
          }}
          userFriends={userFriends}
          onUserFriendsChange={setUserFriends}
          onShare={() => setShowShare(true)}
          onPairInvite={() => setShowPairInvite(true)}
          onMatcher={() => setShowMatcher(true)}
          onFriendsModal={() => setShowFriends(true)}
        />
      )}

      {/* User picker — shown on first load (currentUser null) or when switching */}
      {(!currentUser || showUserPicker) && users.length > 0 && (
        <UserPicker
          users={users}
          overlay={showUserPicker && !!currentUser}
          onPicked={(user) => {
            setCurrentUser(user)
            setShowUserPicker(false)
            // Reload data for new user
            loadTunes()
            loadStats()
          }}
        />
      )}
    </div>
  )
}
