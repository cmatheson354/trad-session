// AudioWorklet modules do not support importScripts.
// Replicate it via fetch + indirect eval — (0,eval) runs code in AudioWorkletGlobalScope
// (global scope), so var declarations become globals and registerProcessor() works.
// This is equivalent to: importScripts('/libfluidsynth.js', '/js-synthesizer.worklet.js')

const _evalUrl = async (url) => {
  const code = await (await fetch(url)).text()
  ;(0, eval)(code)
}

await _evalUrl('/libfluidsynth.js')
await _evalUrl('/js-synthesizer.worklet.js')
