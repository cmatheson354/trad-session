import { useState, useEffect } from 'react'
import { api } from '../api.js'

const CONFIDENCE_STYLE = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-500',
}

function TuneCard({ tune }) {
  return (
    <div className="flex-1 bg-gray-50 rounded-xl p-3 text-sm space-y-1 min-w-0">
      <p className="font-semibold text-gray-900 truncate">{tune.title}</p>
      <p className="text-gray-500 capitalize text-xs">{tune.tune_type} · {tune.tune_key || '?'}</p>
      {tune.source && <p className="text-gray-400 text-xs truncate">📖 {tune.source}</p>}
      {tune.notes && <p className="text-gray-400 text-xs truncate italic">{tune.notes}</p>}
      <p className="text-gray-300 text-xs">id #{tune.id}</p>
    </div>
  )
}

function DupePair({ pair, onResolved, sameKeyIsDupe }) {
  const [resolving, setResolving] = useState(false)
  const { tune_a, tune_b, confidence, overlap, exact_normalized } = pair

  const resolve = async (action) => {
    setResolving(true)
    try {
      await api.dupes.resolve(tune_a.id, tune_b.id, action)
      onResolved(tune_a.id, tune_b.id)
    } catch (e) {
      alert('Failed: ' + e.message)
      setResolving(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CONFIDENCE_STYLE[confidence]}`}>
          {confidence === 'high' ? '⚠️ Probable dupe' : confidence === 'medium' ? '🔶 Possible dupe' : '🔍 Low confidence'}
        </span>
        {exact_normalized && <span className="text-xs text-gray-400">exact match (normalised)</span>}
        {!exact_normalized && <span className="text-xs text-gray-400">{Math.round(overlap * 100)}% token overlap</span>}
      </div>

      <div className="flex gap-3">
        <TuneCard tune={tune_a} />
        <div className="flex items-center text-gray-300 text-lg shrink-0">≈</div>
        <TuneCard tune={tune_b} />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => resolve('keep_both')} disabled={resolving}
          className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          Keep Both
        </button>
        <button onClick={() => resolve('keep_a')} disabled={resolving}
          className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          Keep #{tune_a.id}
        </button>
        <button onClick={() => resolve('keep_b')} disabled={resolving}
          className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          Keep #{tune_b.id}
        </button>
        <button onClick={() => resolve('merge_into_a')} disabled={resolving}
          className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          Merge → #{tune_a.id}
        </button>
        <button onClick={() => resolve('merge_into_b')} disabled={resolving}
          className="text-xs bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
          Merge → #{tune_b.id}
        </button>
      </div>
    </div>
  )
}

export default function DupeReviewModal({ onClose, sameKeyIsDupe, onChangeSameKeyIsDupe }) {
  const [pairs, setPairs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [sameKeyIsDupe])

  const load = async () => {
    setLoading(true)
    try { setPairs(await api.dupes.list(sameKeyIsDupe)) }
    catch { setPairs([]) }
    finally { setLoading(false) }
  }

  const handleResolved = (idA, idB) => {
    setPairs(ps => ps.filter(p => !(p.tune_a.id === idA && p.tune_b.id === idB)))
  }

  const high = pairs.filter(p => p.confidence === 'high')
  const med  = pairs.filter(p => p.confidence === 'medium')
  const low  = pairs.filter(p => p.confidence === 'low')

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        <div className="bg-yellow-600 text-white rounded-t-2xl px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold">Duplicate Review</h2>
            <p className="text-yellow-200 text-sm">
              {loading ? 'Scanning…' : pairs.length === 0 ? 'No duplicates found' : `${pairs.length} potential duplicate${pairs.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button onClick={onClose} className="text-yellow-200 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {/* Setting */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => onChangeSameKeyIsDupe(!sameKeyIsDupe)}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${sameKeyIsDupe ? 'bg-yellow-500' : 'bg-gray-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sameKeyIsDupe ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-gray-700">Same tune, different key = duplicate</span>
          </label>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {loading && <p className="text-sm text-gray-400 text-center py-8">Scanning for duplicates…</p>}

          {!loading && pairs.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">🎉 No duplicates found.</p>
          )}

          {high.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-3">Probable Duplicates</h3>
              <div className="space-y-4">{high.map((p, i) => (
                <DupePair key={i} pair={p} onResolved={handleResolved} sameKeyIsDupe={sameKeyIsDupe} />
              ))}</div>
            </section>
          )}
          {med.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-yellow-600 uppercase tracking-wide mb-3">Possible Duplicates</h3>
              <div className="space-y-4">{med.map((p, i) => (
                <DupePair key={i} pair={p} onResolved={handleResolved} sameKeyIsDupe={sameKeyIsDupe} />
              ))}</div>
            </section>
          )}
          {low.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Low Confidence</h3>
              <div className="space-y-4">{low.map((p, i) => (
                <DupePair key={i} pair={p} onResolved={handleResolved} sameKeyIsDupe={sameKeyIsDupe} />
              ))}</div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
