// Shared singleton — abcjs loads once regardless of how many components ask
let promise = null
export const loadAbcjs = () => {
  if (!promise) promise = import('abcjs').then(m => m.default)
  return promise
}
