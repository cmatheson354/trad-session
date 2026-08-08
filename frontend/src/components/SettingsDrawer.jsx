// SettingsDrawer — user and sound quality
import SoundUpgradeButton from './SoundUpgradeButton.jsx'

export default function SettingsDrawer({
  onClose,
  currentUser, users, onSwitchUser,
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 text-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 sticky top-0 bg-gray-900 rounded-t-2xl z-10">
          <h2 className="text-base font-bold">⚙️ Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">

          {/* User */}
          {users.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Player</p>
              <div className="flex gap-2">
                {users.map(u => (
                  <button key={u.id}
                    onClick={() => { onSwitchUser(u); onClose() }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      currentUser?.id === u.id
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}>
                    {u.name === 'Chris' ? '🪈' : u.name === 'Tre' ? '🎸' : '👤'} {u.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sound quality */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sound Quality</p>
            <div className="text-gray-200">
              <SoundUpgradeButton />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
