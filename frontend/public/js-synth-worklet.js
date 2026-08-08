// AudioWorklet modules do not support importScripts; use fetch + indirect eval instead.
// Indirect eval runs in AudioWorkletGlobalScope so var declarations become globals —
// libfluidsynth.js ends by setting AudioWorkletGlobalScope.wasmModule = Module.

const res = await fetch('/libfluidsynth.js')
const code = await res.text()
;(0, eval)(code)

await import('/js-synthesizer.worklet.js')
