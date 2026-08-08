// PlayerDrawer — notation, speed, instrument, click mode, sound quality
import SoundUpgradeButton from './SoundUpgradeButton.jsx'

export default function PlayerDrawer({
  onClose,
  instrument, onSetInstrument,
  speed, onSetSpeed,
  notationView, onToggleNotation,
  clickMode, onCycleClickMode,
  tapMode, onToggleTapMode,
  practiceMode, onTogglePracticeMode,
}) {
  const INSTRUMENTS = [
    { label: 'Tin Whistle', program: 73 },
    { label: 'Fiddle',      program: 40 },
    { label: 'Harp',        program: 46 },
    { label: 'Harmonica',   program: 22 },
    { label: 'Banjo',       program: 105 },
  ]
  const SPEEDS = [25, 50, 75, 100, 150].map(v => ({ label: `${v}%`, value: v }))
  const CLICK_MODES = [
    { value: 'snippet', label: '🎵 Snippet', desc: 'Play a preview · double-tap opens details' },
    { value: 'full',    label: '🎵 Full',    desc: 'Play full tune · double-tap opens details' },
    { value: 'details', label: '📋 Details', desc: 'Open detail card directly' },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 text-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 sticky top-0 bg-gray-900 rounded-t-2xl z-10">
          <h2 className="text-base font-bold">🎛️ Player</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[75vh]">

          {/* Notation */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notation Display</p>
            <div className="flex rounded-lg overflow-hidden border border-gray-600">
              <button
                onClick={() => { if (notationView !== 'sheet') onToggleNotation() }}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${notationView === 'sheet' ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                𝄞 Sheet Music
              </button>
              <button
                onClick={() => { if (notationView !== 'abc') onToggleNotation() }}
                className={`flex-1 py-2 text-xs font-medium border-l border-gray-600 transition-colors ${notationView === 'abc' ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                ABC Text
              </button>
            </div>
          </div>

          {/* Card click mode */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Card Tap Action</p>
            <div className="space-y-1.5">
              {CLICK_MODES.map(m => (
                <button key={m.value}
                  onClick={() => { if (clickMode !== m.value) onCycleClickMode() }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors ${
                    clickMode === m.value ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}>
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className={`text-xs ${clickMode === m.value ? 'text-green-200' : 'text-gray-500'}`}>{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tap & Practice toggles */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tap Modes</p>
            <div className="space-y-2">
              <button
                onClick={onToggleTapMode}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${tapMode ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                <span className="text-sm">👆 Tap Mode</span>
                <span className={`text-xs ${tapMode ? 'text-green-200' : 'text-gray-500'}`}>tap card to advance level</span>
              </button>
              <button
                onClick={onTogglePracticeMode}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${practiceMode ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                <span className="text-sm">📋 Practice Mode</span>
                <span className={`text-xs ${practiceMode ? 'text-green-200' : 'text-gray-500'}`}>auto-log on open</span>
              </button>
            </div>
          </div>

          {/* Instrument */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Instrument</p>
            <div className="flex flex-wrap gap-2">
              {INSTRUMENTS.map(i => (
                <button key={i.program}
                  onClick={() => onSetInstrument(i.program)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    instrument === i.program
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}>
                  {i.label}
                </button>
              ))}
            </div>
          </div>

          {/* Speed */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Playback Speed</p>
            <div className="flex gap-2">
              {SPEEDS.map(s => (
                <button key={s.value}
                  onClick={() => onSetSpeed(s.value)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    speed === s.value
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sound Quality */}
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
