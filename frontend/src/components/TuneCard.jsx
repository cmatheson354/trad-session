import TuneSnippet, { parseFirst8, buildSnippetAbc } from './TuneSnippet'

const TYPE_COLORS = {
  reel:       'bg-green-100 text-green-800',
  jig:        'bg-blue-100 text-blue-800',
  slip_jig:   'bg-purple-100 text-purple-800',
  hornpipe:   'bg-red-100 text-red-800',
  polka:      'bg-orange-100 text-orange-800',
  waltz:      'bg-teal-100 text-teal-800',
  air:        'bg-indigo-100 text-indigo-800',
  mazurka:    'bg-pink-100 text-pink-800',
  march:      'bg-amber-100 text-amber-800',
}
const STATUS_DOT = {
  want_to_learn:     'bg-red-400',
  learning:          'bg-yellow-400',
  know_it:           'bg-green-500',
  performance_ready: 'bg-yellow-400',
}



function daysSince(dateStr) {
  if (!dateStr) return null
  const diff = Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7)   return `${diff}d ago`
  if (diff < 30)  return `${Math.floor(diff / 7)}w ago`
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`
  return `${Math.floor(diff / 365)}y ago`
}

export default function TuneCard({ tune, onClick, onPlay, notationView = "sheet", statusLabels = {}, tapMode = false }) {
  const typeLabel   = tune.tune_type.replace('_', ' ')
  const typeColor   = TYPE_COLORS[tune.tune_type] ?? 'bg-gray-100 text-gray-800'
  const dotColor    = STATUS_DOT[tune.status] ?? 'bg-gray-400'
  const lastPracticed = daysSince(tune.last_practiced)
  const hasAbc      = Boolean(tune.abc_notation?.trim())

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-gray-200 p-2.5 sm:p-4 cursor-pointer hover:shadow-md hover:border-green-300 transition-all group relative ${tune.status === "performance_ready" ? "bg-gradient-to-br from-white to-yellow-50" : "bg-white"}`}
    >
      {/* Title + type badge */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors leading-snug text-sm sm:text-base">
          {tune.title}
        </h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${typeColor}`}>
          {typeLabel}
        </span>
      </div>

      {/* Key + mode */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        {tune.tune_key && (
          <span className="font-mono bg-gray-100 rounded px-1.5 py-0.5 text-xs">{tune.tune_key}</span>
        )}
        {tune.mode && (
          <span className="text-xs text-gray-400 capitalize">{tune.mode}</span>
        )}
      </div>

      {/* First 8 notes snippet */}
      {hasAbc && <TuneSnippet tune={tune} notationView={notationView} />}

      {/* Status + last practiced */}
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {tune.status === "performance_ready"
            ? <span className="text-sm leading-none">⭐</span>
            : <span className={`w-2 h-2 rounded-full ${dotColor}`} />}
          <span className="text-xs text-gray-500">{statusLabels[tune.status] ?? tune.status}</span>
        </div>
        {lastPracticed && (
          <span className="text-xs text-gray-400">{lastPracticed}</span>
        )}
      </div>

      {/* Tap mode badge */}
      {tapMode && (
        <div className="absolute inset-0 rounded-xl bg-green-700/5 border-2 border-green-400 pointer-events-none" />
      )}
      {/* Play button — only if ABC notation exists */}
      {hasAbc && !tapMode && (
        <button
          onClick={e => {
            e.stopPropagation()
            const parsed = parseFirst8(tune.abc_notation, 8)
            const snippetAbc = parsed
              ? buildSnippetAbc(parsed.bodySlice, tune.tune_type, tune.tune_key, tune.mode)
              : tune.abc_notation
            onPlay({ ...tune, abc_notation: snippetAbc, _isSnippet: true })
          }}
          className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-green-700 hover:bg-green-600 text-white flex items-center justify-center shadow transition-colors opacity-0 group-hover:opacity-100"
          title="Play snippet"
        >
          <span className="text-xs ml-0.5">▶</span>
        </button>
      )}
    </div>
  )
}
