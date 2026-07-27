
const STATUS_COLORS = {
  want_to_learn:     'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  learning:          'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100',
  know_it:           'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
  performance_ready: 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100',
}
const STATUS_ACTIVE = {
  want_to_learn:     'bg-red-500 text-white border-red-500',
  learning:          'bg-yellow-400 text-yellow-900 border-yellow-400',
  know_it:           'bg-green-600 text-white border-green-600',
  performance_ready: 'bg-gradient-to-r from-yellow-400 to-amber-400 text-white border-yellow-400',
}

export default function StatsBar({ stats, activeStatus, onStatusClick, statusLabels = {} }) {
  const statuses = ['want_to_learn', 'learning', 'know_it', 'performance_ready']
  return (
    <div className="flex flex-wrap gap-2">
      {statuses.map(s => {
        const count = stats.by_status?.[s] ?? 0
        const isActive = activeStatus === s
        return (
          <button
            key={s}
            onClick={() => onStatusClick(s)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${isActive ? STATUS_ACTIVE[s] : STATUS_COLORS[s]}`}
          >
            <span>{s === 'performance_ready' ? '⭐ ' : ''}{statusLabels[s] ?? s}</span>
            <span className={`font-bold ${isActive ? 'text-white/90' : ''}`}>{count}</span>
          </button>
        )
      })}
      <div className="ml-auto text-sm text-gray-500 self-center">
        {stats.total} tune{stats.total !== 1 ? 's' : ''} total
      </div>
    </div>
  )
}
