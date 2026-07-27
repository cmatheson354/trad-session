/**
 * Global audio manager — ensures only one MIDI synth plays at a time.
 * Both AbcRenderer (SynthController) and MiniPlayer (CreateSynth) register here.
 */
const manager = {
  current: null,   // { stop: fn, type: 'controller' | 'synth' }
}

export function registerSynth(stopFn, type = 'synth') {
  if (manager.current) {
    try { manager.current.stop() } catch (_) {}
  }
  manager.current = { stop: stopFn, type }
}

export function unregisterSynth(stopFn) {
  if (manager.current?.stop === stopFn) {
    manager.current = null
  }
}

export function stopAll() {
  if (manager.current) {
    try { manager.current.stop() } catch (_) {}
    manager.current = null
  }
}
