// ToolsDrawer — 🎤 mic icon — audio tools + tune list management + sharing/social
export default function ToolsDrawer({
  onClose,
  onTuner,
  onSessions,
  onRecord,
  onImport,
  onExport,
  onDupes,
  onShare,
  onMatcher,
  onPairInvite,
}) {
  const Row = ({ icon, label, onClick, accent = false }) => (
    <button
      onClick={() => { onClick(); onClose() }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-left ${
        accent
          ? 'bg-red-900/40 border border-red-700 text-red-300 hover:bg-red-900/70'
          : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
      }`}>
      <span className="text-lg w-6 text-center">{icon}</span>
      <span>{label}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 text-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 sticky top-0 bg-gray-900 rounded-t-2xl z-10">
          <h2 className="text-base font-bold">🎤 Tools</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-4 space-y-2 overflow-y-auto max-h-[75vh]">

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 pt-3 pb-1">Audio</p>
          <Row icon="🎵" label="Chromatic Tuner" onClick={onTuner} />
          <Row icon="🎙" label="Session Recordings" onClick={onSessions} />
          <Row icon="⏺" label="Start Recording" onClick={onRecord} accent />

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 pt-3 pb-1">Library</p>
          <Row icon="📥" label="Import Tunes" onClick={onImport} />
          <Row icon="📤" label="Export Tunes" onClick={onExport} />
          <Row icon="🔍" label="Find Duplicates" onClick={onDupes} />

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 pt-3 pb-1">Share & Discover</p>
          <Row icon="🔗" label="Share Tune List" onClick={onShare} />
          <Row icon="🔀" label="Session Matcher" onClick={onMatcher} />
          <Row icon="🤝" label="Tune Pairing" onClick={onPairInvite} />

        </div>
      </div>
    </div>
  )
}
