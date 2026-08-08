// Sound quality management — thin re-export from fluidSynth.js.
// SoundUpgradeButton and other consumers import from here.

export {
  SF_OPTIONS,
  getSfKey,
  setSfKey,
  getSfOption,
  isSfCached,
  clearSfCache,
  initEngine,
} from './fluidSynth.js'
