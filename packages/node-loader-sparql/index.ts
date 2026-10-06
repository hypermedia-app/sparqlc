import module from 'node:module'
import * as loader from './loader.js'

if (typeof module.registerHooks === 'function') {
  // Node.js >= 22.15 / 26+ (in-thread synchronous hooks)
  module.registerHooks({
    resolve: loader.resolveSync,
    load: loader.loadSync,
  })
}
else if (typeof module.register === 'function') {
  // Legacy off-thread worker hooks
  module.register('./loader.js', import.meta.url)
}
