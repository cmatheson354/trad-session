/**
 * ABC note-based search utilities.
 *
 * isAbcSearch   — detect when a query is ABC notation rather than a title
 * extractNotes  — pull ordered note letters from an ABC string
 * filterByNotes — filter a tunes array by first-note sequence matching
 */

export function isAbcSearch(query) {
  if (!query?.trim() || query.trim().length < 2) return false
  const q = query.trim()
  if (/[A-Ga-g]\d/.test(q))     return true  // rhythmic values: D2 G3
  if (/[A-Ga-g][/]/.test(q))    return true  // broken rhythm: D/
  if (/[\^_=][A-Ga-g]/.test(q)) return true  // accidentals: ^F _B
  if (/[A-Ga-g][',]/.test(q))   return true  // octave: D' g,
  if (/[|]/.test(q))             return true  // bar line
  if (/[A-Ga-g]{3}/.test(q))    return true  // 3+ consecutive note letters
  return false
}

// Extract note letters (A–G, uppercase, ignoring octave/duration/accidentals)
export function extractNotes(abcStr) {
  if (!abcStr) return []
  const notes = []
  let inBody = false

  for (const line of abcStr.split('\n')) {
    const t = line.trim()
    // ABC field headers (X:, T:, M:, K:, L:, R: …)
    if (/^[A-WYZ]:/.test(t)) {
      if (t.startsWith('K:')) inBody = true  // key marks start of body
      continue
    }
    if (!inBody) inBody = true  // first non-header line is body

    let i = 0
    while (i < t.length) {
      const ch = t[i]
      if (ch === '"') { i++; while (i < t.length && t[i] !== '"') i++; i++; continue }
      if (ch === '{') { i++; while (i < t.length && t[i] !== '}') i++; i++; continue }
      if (ch === '[') {
        // Chord — grab only the first note letter
        i++
        if (i < t.length && /[A-Ga-gz]/.test(t[i])) notes.push(t[i].toUpperCase())
        while (i < t.length && t[i] !== ']') i++
        i++; continue
      }
      if (/[\^_=!]/.test(ch)) { i++; continue }  // accidentals / decorators
      if (/[A-Ga-gz]/.test(ch)) {
        notes.push(ch.toUpperCase())
        i++
        while (i < t.length && /[',\d/]/.test(t[i])) i++  // skip octave+duration
        continue
      }
      i++
    }
  }
  return notes
}

export function filterByNotes(tunes, query) {
  // Wrap bare note strings so header detection doesn't strip them
  const wrapped = /^[A-WYZ]:/.test(query.trim()) ? query : `X:1\nK:C\n${query}`
  const qNotes = extractNotes(wrapped)
  if (qNotes.length < 2) return tunes

  return tunes.filter(tune => {
    if (!tune.abc_notation?.trim()) return false
    const tNotes = extractNotes(tune.abc_notation)
    if (tNotes.length < qNotes.length) return false

    // Slide a window over the tune's notes (offset 0–3) to tolerate pickup/grace notes at start
    for (let off = 0; off <= Math.min(3, tNotes.length - qNotes.length); off++) {
      let hits = 0
      for (let i = 0; i < qNotes.length; i++) {
        if (tNotes[off + i] === qNotes[i]) hits++
      }
      if (hits / qNotes.length >= 0.8) return true  // 80% match threshold
    }
    return false
  })
}
