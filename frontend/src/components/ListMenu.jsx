import { useEffect, useRef } from 'react'

export default function ListMenu({ tapMode, onToggleTapMode, practiceMode, onTogglePracticeMode, onSets, onImport, onExport, onSettings, onDupes, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handle = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('touchstart', handle) }
  }, [onClose])

  const item = (icon, label, onClick, active = false) => (
    <button
      onClick={() => { onClick(); onClose() }}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors text-left ${active ? 'text-green-700 font-semibold' : 'text-gray-700'}`}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {active && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">On</span>}
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

      <div className="border-t border-gray-100" />

      <button
        onClick={() => { onToggleTapMode(); onClose() }}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors text-left ${tapMode ? 'text-green-700 font-semibold' : 'text-gray-700'}`}
      >
        <span className="text-base w-5 text-center">👆</span>
        <span className="flex-1">Tap to Categorise</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${tapMode ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
          {tapMode ? 'On' : 'Off'}
        </span>
      </button>

      <button
        onClick={() => { onTogglePracticeMode(); onClose() }}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors text-left ${practiceMode ? 'text-emerald-700 font-semibold' : 'text-gray-700'}`}
      >
        <span className="text-base w-5 text-center">🎵</span>
        <span className="flex-1">Practice Mode</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${practiceMode ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
          {practiceMode ? 'On' : 'Off'}
        </span>
      </button>

      <div className="border-t border-gray-100" />

      {item('⚙️', 'Settings', onSettings)}
    </div>
  )
}
