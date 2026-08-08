// AudioWorklet wrapper — loads FluidSynth WASM then registers the synthesizer processor.
// Both scripts are served as static files from public/ (copied by postinstall).
importScripts('/libfluidsynth.js')
importScripts('/js-synthesizer.worklet.js')
