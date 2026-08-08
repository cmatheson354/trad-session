// FluidSynth WASM audio engine — singleton, AudioWorklet-based.
// SF3 soundfont is downloaded client-side and cached in Cache API.

import { AudioWorkletNodeSynthesizer } from 'js-synthesizer'

const WORKLET_URL = '/js-synth-worklet.js'
const SF_CACHE    = 'trad-sf3-v1'

export const SF_OPTIONS = {
  fluid: {
    key:   'fluid',
    label: 'FluidR3 Mono',
    size:  '23 MB',
    url:   'https://raw.githubusercontent.com/musescore/MuseScore/main/share/sound/FluidR3Mono_GM.sf3',
    desc:  'High-quality sampled soundfont (SF3, OGG-compressed)',
  },
}

const PREFS_KEY = 'trad-sf-choice'

export function getSfKey()            { return localStorage.getItem(PREFS_KEY) || 'fluid' }
export function setSfKey(k)           { localStorage.setItem(PREFS_KEY, k) }
export function getSfOption()         { return SF_OPTIONS[getSfKey()] || SF_OPTIONS.fluid }

let _enginePromise = null
let _engine        = null   // { synth, audioCtx, sfUrl }

export function getEngine()    { return _engine }
export function isEngineReady(){ return _engine !== null }

export async function resumeAudio() {
  const ctx = _engine?.audioCtx
  if (ctx && ctx.state === 'suspended') await ctx.resume()
}

// Download SF3 with XHR for progress, cache in Cache API
async function fetchSfWithProgress(url, onProgress) {
  if ('caches' in window) {
    const cache = await caches.open(SF_CACHE)
    const hit   = await cache.match(url)
    if (hit) { onProgress?.(100); return hit.arrayBuffer() }
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.responseType = 'arraybuffer'
    xhr.onprogress = e => { if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 100)) }
    xhr.onload = async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const buf = xhr.response
        try {
          if ('caches' in window) {
            const cache = await caches.open(SF_CACHE)
            await cache.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } }))
          }
        } catch (_) {}
        onProgress?.(100)
        resolve(buf)
      } else {
        reject(new Error(`HTTP ${xhr.status} downloading soundfont`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error downloading soundfont'))
    xhr.send()
  })
}

// Initialize the engine (idempotent — subsequent calls return same promise)
// callbacks: { onStage(stage), onSfProgress(pct) }
export async function initEngine(callbacks = {}) {
  if (_engine) return _engine
  if (_enginePromise) return _enginePromise

  _enginePromise = _doInit(callbacks)
    .then(e  => { _engine = e; return e })
    .catch(err => { _enginePromise = null; throw err })

  return _enginePromise
}

async function _doInit({ onStage, onSfProgress } = {}) {
  const opt = getSfOption()

  onStage?.('worklet')
  const audioCtx = new AudioContext()
  await audioCtx.audioWorklet.addModule(WORKLET_URL)

  const synth = new AudioWorkletNodeSynthesizer()
  const node  = synth.createAudioNode(audioCtx)
  node.connect(audioCtx.destination)

  onStage?.('soundfont')
  const sfBuf = await fetchSfWithProgress(opt.url, onSfProgress)

  onStage?.('loading')
  await synth.loadSFont(sfBuf)

  onStage?.('ready')
  return { synth, audioCtx, sfUrl: opt.url }
}

export async function isSfCached() {
  if (!('caches' in window)) return false
  try {
    const cache = await caches.open(SF_CACHE)
    return !!(await cache.match(getSfOption().url))
  } catch { return false }
}

export async function clearSfCache() {
  if ('caches' in window) {
    try { await caches.delete(SF_CACHE) } catch (_) {}
  }
  _engine        = null
  _enginePromise = null
}
