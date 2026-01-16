// Branch Browser configuration
// Settings for branch tracking, sleep system, and Punk Records integration

var settings = require('util/settings/settings.js')

var defaultConfig = {
  // Punk Records integration (Phase 4)
  punkRecords: {
    endpoint: 'https://punk-records-production.up.railway.app/api/browser/events',
    apiKey: null, // Set via settings UI
    enabled: false,
    batchIntervalMs: 60000, // 60 seconds
    exportContent: true // Include page text in exports
  },

  // Sleep system (Phase 3)
  sleep: {
    enabled: false,
    timeoutMs: 300000, // 5 minutes
    lowMemoryTimeoutMs: 120000, // 2 minutes when RAM pressure
    keepAudioAwake: true // Don't sleep tabs playing audio
  },

  // UI settings (Phase 2)
  ui: {
    sidebarWidth: 250,
    showSleepingIndicator: true,
    showSyncStatus: true,
    collapsedByDefault: false
  }
}

// Get a config value with fallback to default
function get (path) {
  var keys = path.split('.')
  var value = settings.get('branchBrowser')

  // Navigate to the nested value
  for (var i = 0; i < keys.length && value !== undefined; i++) {
    value = value ? value[keys[i]] : undefined
  }

  // If not found, get from defaults
  if (value === undefined) {
    value = defaultConfig
    for (var i = 0; i < keys.length && value !== undefined; i++) {
      value = value[keys[i]]
    }
  }

  return value
}

// Set a config value
function set (path, newValue) {
  var config = settings.get('branchBrowser') || {}
  var keys = path.split('.')
  var target = config

  // Navigate to parent of the value to set
  for (var i = 0; i < keys.length - 1; i++) {
    if (!target[keys[i]]) {
      target[keys[i]] = {}
    }
    target = target[keys[i]]
  }

  target[keys[keys.length - 1]] = newValue
  settings.set('branchBrowser', config)
}

// Get entire config with defaults
function getAll () {
  var saved = settings.get('branchBrowser') || {}
  return deepMerge(defaultConfig, saved)
}

// Deep merge helper
function deepMerge (target, source) {
  var result = Object.assign({}, target)
  for (var key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

module.exports = {
  get,
  set,
  getAll,
  defaults: defaultConfig
}
