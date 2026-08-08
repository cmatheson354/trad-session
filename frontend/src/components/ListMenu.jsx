import { useEffect, useRef } from 'react'

export default function ListMenu({ onSets, onImport, onExport, onDupes, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handle = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('touchstart', handle) }
  }, [onClose])

  const item = (icon, label, onClick) => (
    <button
      onClick={() => { onClick(); onClose() }}
      className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors text-left text-gray-700"
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  )

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50"
    >
      <div className="px-4 py-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">My Tune List</p>
      </div>

      {item('🎵', 'Manage Sets', onSets)}
      <div className="border-t border-gray-100" />
      {item('📥', 'Import', onImport)}
      {item('📤', 'Export', onExport)}
      {item('⚠️', 'Review Duplicates', onDupes)}
    </div>
  )
}
