import { useEffect, useRef } from 'react'
import abcjs from 'abcjs'

const METER = {
  jig:       '6/8',
  slip_jig:  '9/8',
  reel:      '4/4',
  hornpipe:  '4/4',
  polka:     '2/4',
  waltz:     '3/4',
  march:     '4/4',
  mazurka:   '3/4',
  air:       '4/4',
}

// Walk ABC body and return { notesText, snippetAbc } for the first `count` notes
export function parseFirst8(abcBody, count = 8) {
  if (!abcBody?.trim()) return null

  let noteCount = 0
  let i = 0
  const raw = abcBody
  const noteParts = []

  while (i < raw.length && noteCount < count) {
    const ch = raw[i]

    if (ch === '"') {
      i++
      while (i < raw.length && raw[i] !== '"') i++
      i++
    } else if (ch === '{') {
      while (i < raw.length && raw[i] !== '}') i++
      i++
    } else if (ch === '[' && i + 1 < raw.length && raw[i + 1] !== ':') {
      const start = i
      while (i < raw.length && raw[i] !== ']') i++
      i++
      noteParts.push(raw.slice(start, i))
      noteCount++
    } else if (/[A-Ga-gz]/.test(ch)) {
      const start = i
      i++
      while (i < raw.length && (raw[i] === "'" || raw[i] === ',')) i++
      while (i < raw.length && /[\d/]/.test(raw[i])) i++
      noteParts.push(raw.slice(start, i))
      noteCount++
    } else if (/[\^_=]/.test(ch)) {
      const start = i
      i++
      // grab the note letter too so we can show e.g. ^F
      if (i < raw.length && /[A-Ga-g]/.test(raw[i])) {
        i++
        while (i < raw.length && (raw[i] === "'" || raw[i] === ',')) i++
        while (i < raw.length && /[\d/]/.test(raw[i])) i++
        noteParts.push(raw.slice(start, i))
        noteCount++
      } else {
        i++
      }
    } else {
      i++
    }
  }

  if (noteCount === 0) return null
  return { noteParts, bodySlice: raw.slice(0, i) }
}

export function buildSnippetAbc(bodySlice, tuneType, tuneKey, mode) {
  const meter = METER[tuneType] ?? '4/4'
  const keyStr = tuneKey
    ? `${tuneKey}${mode && mode !== 'major' ? mode.charAt(0).toUpperCase() + mode.slice(1) : ''}`
    : 'C'
  return `X:1\nM:${meter}\nL:1/8\nK:${keyStr}\n${bodySlice}`
}

function SheetSnippet({ snippetAbc, tuneId }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !snippetAbc) return
    try {
      abcjs.renderAbc(ref.current, snippetAbc, {
        scale: 0.5,
        staffwidth: 200,
        responsive: 'resize',
        paddingright: 0,
        paddingleft: 0,
        paddingtop: 2,
        paddingbottom: 0,
        add_classes: true,
      })
    } catch (_) { /* ignore invalid ABC fragments */ }
  }, [snippetAbc])

  return (
    <div
      ref={ref}
      className="overflow-hidden opacity-60 pointer-events-none select-none"
      style={{ maxHeight: '52px' }}
      aria-hidden="true"
    />
  )
}

export default function TuneSnippet({ tune, notationView = 'sheet' }) {
  const parsed = parseFirst8(tune.abc_notation, 8)
  if (!parsed) return null

  if (notationView === 'abc') {
    return (
      <div className="mt-2 font-mono text-xs text-gray-500 bg-gray-50 rounded px-2 py-1 leading-relaxed tracking-wide overflow-hidden whitespace-nowrap text-ellipsis">
        {parsed.noteParts.join(' ')}
      </div>
    )
  }

  const snippetAbc = buildSnippetAbc(parsed.bodySlice, tune.tune_type, tune.tune_key, tune.mode)
  return (
    <div className="mt-2">
      <SheetSnippet snippetAbc={snippetAbc} tuneId={tune.id} />
    </div>
  )
}
