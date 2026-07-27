const TYPE_COLORS = {
  reel:'bg-green-100 text-green-800', jig:'bg-blue-100 text-blue-800',
  slip_jig:'bg-purple-100 text-purple-800', hornpipe:'bg-red-100 text-red-800',
  polka:'bg-orange-100 text-orange-800', waltz:'bg-teal-100 text-teal-800',
  air:'bg-indigo-100 text-indigo-800', mazurka:'bg-pink-100 text-pink-800',
  march:'bg-amber-100 text-amber-800', mixed:'bg-gray-100 text-gray-700',
}

export default function SetCard({ set, onClick, onEdit, onPlay }) {
  const typeColor = TYPE_COLORS[set.tune_type] ?? TYPE_COLORS.mixed
  const displayName = set.name || (set.tunes[0]?.title ? set.tunes[0].title + ' Set' : 'Unnamed Set')
  const hasAbc = set.tunes.some(t => t.abc_notation?.trim())

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-2.5 sm:p-4 cursor-pointer hover:shadow-md hover:border-green-300 transition-all group relative"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors leading-snug text-sm sm:text-base">
          {displayName}
        </h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 capitalize ${typeColor}`}>
          {set.tune_type}
        </span>
      </div>

      <div className="text-xs text-gray-500 space-y-0.5 mt-1">
        {set.tunes.slice(0, 4).map((t, i) => (
          <div key={t.id} className="flex items-center gap-1.5 truncate">
            <span className="text-gray-300">{i + 1}.</span>
            <span className="truncate">{t.title}</span>
          </div>
        ))}
        {set.tunes.length > 4 && (
          <div className="text-gray-400 italic">+{set.tunes.length - 4} more…</div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-400">{set.tunes.length} tune{set.tunes.length !== 1 ? 's' : ''}</span>
        <button
          onClick={e => { e.stopPropagation(); onEdit(set) }}
          className="text-xs text-gray-400 hover:text-green-700 transition-colors"
        >
          Edit
        </button>
      </div>

      {hasAbc && (
        <button
          onClick={e => { e.stopPropagation(); onPlay(set) }}
          className="absolute bottom-3 right-8 w-7 h-7 rounded-full bg-green-700 hover:bg-green-600 text-white flex items-center justify-center shadow transition-colors opacity-0 group-hover:opacity-100"
          title="Play set"
        >
          <span className="text-xs ml-0.5">▶</span>
        </button>
      )}
    </div>
  )
}
