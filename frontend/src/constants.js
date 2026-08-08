// ── Player preferences ────────────────────────────────────────────────────────

export const INSTRUMENTS = [
  { label: 'Tin Whistle', program: 73 },  // GM: Recorder
  { label: 'Fiddle',      program: 40 },  // GM: Violin
  { label: 'Harp',        program: 46 },  // GM: Orchestral Harp
  { label: 'Harmonica',   program: 22 },  // GM: Harmonica
  { label: 'Banjo',       program: 105 }, // GM: Banjo
]

export const SPEEDS = [
  { label: '25%',  value: 25 },
  { label: '50%',  value: 50 },
  { label: '75%',  value: 75 },
  { label: '100%', value: 100 },
  { label: '150%', value: 150 },
]

const PREFS_KEY = 'trad-player-prefs'

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {} } catch { return {} }
}

export function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

// ── Status label preferences ───────────────────────────────────────────────
const LABELS_KEY = 'trad-status-labels'

export const DEFAULT_STATUS_LABELS = {
  want_to_learn:     'Want to Learn',
  learning:          'Learning',
  know_it:           'Know It',
  performance_ready: 'Performance Ready',
}

export function loadStatusLabels() {
  try {
    const saved = JSON.parse(localStorage.getItem(LABELS_KEY)) || {}
    return { ...DEFAULT_STATUS_LABELS, ...saved }
  } catch { return { ...DEFAULT_STATUS_LABELS } }
}

export function saveStatusLabels(labels) {
  localStorage.setItem(LABELS_KEY, JSON.stringify(labels))
}

const DUPE_PREFS_KEY = 'trad-dupe-prefs'
export function loadDupePrefs() {
  try { return JSON.parse(localStorage.getItem(DUPE_PREFS_KEY)) || {} } catch { return {} }
}
export function saveDupePrefs(prefs) {
  localStorage.setItem(DUPE_PREFS_KEY, JSON.stringify(prefs))
}
