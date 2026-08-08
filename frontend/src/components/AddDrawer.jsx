export default function AddDrawer({ title, onSearch, onQuickAdd, onManual, onClose }) {
  const options = [
    {
      icon: '🔍',
      label: 'Search',
      sub: 'Find on The Session',
      action: onSearch,
      cls: 'border-blue-200 bg-blue-50 hover:bg-blue-100',
      iconCls: 'bg-blue-100 text-blue-700',
    },
    {
      icon: '⚡',
      label: 'Quick add',
      sub: 'Save with defaults, fix details later',
      action: onQuickAdd,
      cls: 'border-green-200 bg-green-50 hover:bg-green-100',
      iconCls: 'bg-green-100 text-green-700',
    },
    {
      icon: '✏️',
      label: 'Manual add',
      sub: 'Fill in all the details now',
      action: onManual,
      cls: 'border-gray-200 bg-gray-50 hover:bg-gray-100',
      iconCls: 'bg-gray-100 text-gray-600',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Drawer */}
      <div
        className="relative bg-white rounded-t-2xl shadow-2xl px-4 pt-4 pb-8 max-w-lg w-full mx-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Adding</p>
        <p className="text-base font-bold text-gray-800 mb-4 truncate">&ldquo;{title}&rdquo;</p>

        <div className="space-y-2.5">
          {options.map(o => (
            <button
              key={o.label}
              onClick={() => { o.action(); onClose() }}
              className={`w-full flex items-center gap-3.5 text-left border rounded-xl px-4 py-3 transition-colors ${o.cls}`}
            >
              <span className={`text-xl w-9 h-9 flex items-center justify-center rounded-lg shrink-0 ${o.iconCls}`}>
                {o.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-800">{o.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{o.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
