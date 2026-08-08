// Derives suggested accompaniment chords from a tune's key + mode.
// Falls back to tune_key/mode fields when ABC doesn't have a K: header.

const NOTES      = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
const FLAT_NOTES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']

function noteIndex(note) {
  let i = NOTES.indexOf(note)
  if (i === -1) i = FLAT_NOTES.indexOf(note)
  return i
}

const MODE_SCALE = {
  major:      [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian:     [0, 2, 3, 5, 7, 9, 10],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  aeolian:    [0, 2, 3, 5, 7, 8, 10],
  lydian:     [0, 2, 4, 6, 7, 9, 11],
}
const TRIAD_QUALITY = {
  major:      ['',  'm','m', '', '', 'm', 'dim'],
  mixolydian: ['',  'm','m', '', 'm','dim',''],
  dorian:     ['m', 'm','',  'm','', 'dim','m'],
  minor:      ['m', 'dim','','m', 'm','',  ''],
  aeolian:    ['m', 'dim','','m', 'm','',  ''],
  lydian:     ['',  '',  'm','dim','','m', 'm'],
}

function buildChords(root, mode) {
  const scale = MODE_SCALE[mode] || MODE_SCALE.major
  const quality = TRIAD_QUALITY[mode] || TRIAD_QUALITY.major
  const rootIdx = noteIndex(root)
  if (rootIdx === -1) return null
  const useSharps = ['G','D','A','E','B','F#','C#'].includes(root)
  return scale.map((interval, i) => {
    const noteName = (useSharps ? NOTES : FLAT_NOTES)[(rootIdx + interval) % 12]
    return noteName + (quality[i] ?? '')
  })
}

function categoriseChords(chords, mode) {
  if (!chords) return { main: [], accent: [] }
  const main   = [chords[0], chords[3], chords[4]].filter(Boolean)
  const accent = [chords[1], chords[5]].filter(c => c && !c.includes('dim'))
  if (mode === 'mixolydian' && chords[6]) main.push(chords[6])
  if (['dorian','minor','aeolian'].includes(mode) && chords[5] && !main.includes(chords[5]))
    main.push(chords[5])
  return { main, accent }
}

function parseKeyInfo(tune) {
  // Try ABC K: header first
  if (tune.abc_notation) {
    const m = tune.abc_notation.match(/^K:\s*([A-Ga-g][#b]?)\s*(maj|mix|dor|min|aeo|lyd)?/im)
    if (m) {
      const modeMap = { maj:'major', mix:'mixolydian', dor:'dorian', min:'minor', aeo:'aeolian', lyd:'lydian' }
      return { root: m[1].charAt(0).toUpperCase() + m[1].slice(1), mode: modeMap[(m[2]||'maj').toLowerCase()] || 'major' }
    }
  }
  // Fall back to stored tune_key + mode fields
  if (tune.tune_key) {
    const modeMap = { major:'major', mixolydian:'mixolydian', dorian:'dorian', minor:'minor', aeolian:'aeolian', lydian:'lydian' }
    return { root: tune.tune_key, mode: modeMap[tune.mode] || 'major' }
  }
  return null
}

function ChordPill({ chord, accent = false }) {
  const isMinor = /m$/.test(chord)
  const isDim   = chord.includes('dim')
  let cls = 'px-2.5 py-1 rounded-full text-sm font-semibold border select-none '
  if (isDim)        cls += 'bg-red-50 border-red-200 text-red-700'
  else if (isMinor) cls += accent ? 'bg-purple-50 border-purple-200 text-purple-700'
                                  : 'bg-blue-50 border-blue-200 text-blue-700'
  else              cls += accent ? 'bg-amber-50 border-amber-200 text-amber-700'
                                  : 'bg-green-50 border-green-200 text-green-700'
  return <span className={cls}>{chord}</span>
}

export default function ChordSuggestions({ tune }) {
  const keyInfo = parseKeyInfo(tune)
  if (!keyInfo) return null

  const chords = buildChords(keyInfo.root, keyInfo.mode)
  if (!chords) return null

  const { main, accent } = categoriseChords(chords, keyInfo.mode)

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        🎸 Chord Guide
      </h3>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 w-14 shrink-0">Main</span>
          <div className="flex gap-1.5 flex-wrap">
            {main.map(c => <ChordPill key={c} chord={c} />)}
          </div>
        </div>
        {accent.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 w-14 shrink-0">Colour</span>
            <div className="flex gap-1.5 flex-wrap">
              {accent.map(c => <ChordPill key={c} chord={c} accent />)}
            </div>
          </div>
        )}
        <p className="text-xs text-gray-400 pt-0.5">
          Key: <span className="font-medium text-gray-600">{keyInfo.root} {keyInfo.mode}</span>
          {' · '}
          <span className="text-green-600 font-medium">green</span> = main ·{' '}
          <span className="text-blue-600 font-medium">blue</span> = minor ·{' '}
          <span className="text-amber-600 font-medium">amber</span> = colour
        </p>
      </div>
    </div>
  )
}
