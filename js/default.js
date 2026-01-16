window.globalArgs = {}

process.argv.forEach(function (arg) {
  if (arg.startsWith('--')) {
    var key = arg.split('=')[0].replace('--', '')
    var value = arg.split('=')[1]
    globalArgs[key] = value
  }
})

window.windowId = globalArgs['window-id']

window.electron = require('electron')
window.fs = require('fs')
window.EventEmitter = require('events')
window.ipc = electron.ipcRenderer

if (navigator.platform === 'MacIntel') {
  document.body.classList.add('mac')
  window.platformType = 'mac'
} else if (navigator.platform === 'Win32') {
  document.body.classList.add('windows')
  window.platformType = 'windows'
} else {
  document.body.classList.add('linux')
  window.platformType = 'linux'
}

if (navigator.maxTouchPoints > 0) {
  document.body.classList.add('touch')
}

/* add classes so that the window state can be used in CSS */
ipc.on('enter-full-screen', function () {
  document.body.classList.add('fullscreen')
})

ipc.on('leave-full-screen', function () {
  document.body.classList.remove('fullscreen')
})

ipc.on('maximize', function () {
  document.body.classList.add('maximized')
})

ipc.on('unmaximize', function () {
  document.body.classList.remove('maximized')
})

document.body.classList.add('focused')

ipc.on('focus', function () {
  document.body.classList.add('focused')
})

ipc.on('blur', function () {
  document.body.classList.remove('focused')
})

// https://remysharp.com/2010/07/21/throttling-function-calls

window.throttle = function (fn, threshhold, scope) {
  threshhold || (threshhold = 250)
  var last,
    deferTimer
  return function () {
    var context = scope || this

    var now = +new Date()
    var args = arguments
    if (last && now < last + threshhold) {
      // hold on to it
      clearTimeout(deferTimer)
      deferTimer = setTimeout(function () {
        last = now
        fn.apply(context, args)
      }, threshhold)
    } else {
      last = now
      fn.apply(context, args)
    }
  }
}

// https://remysharp.com/2010/07/21/throttling-function-calls

window.debounce = function (fn, delay) {
  var timer = null
  return function () {
    var context = this
    var args = arguments
    clearTimeout(timer)
    timer = setTimeout(function () {
      fn.apply(context, args)
    }, delay)
  }
}

window.empty = function (node) {
  var n
  while (n = node.firstElementChild) {
    node.removeChild(n)
  }
}

/* prevent a click event from firing after dragging the window */

window.addEventListener('load', function () {
  var isMouseDown = false
  var isDragging = false
  var distance = 0

  document.body.addEventListener('mousedown', function () {
    isMouseDown = true
    isDragging = false
    distance = 0
  })

  document.body.addEventListener('mouseup', function () {
    isMouseDown = false
  })

  var dragHandles = document.getElementsByClassName('windowDragHandle')

  for (var i = 0; i < dragHandles.length; i++) {
    dragHandles[i].addEventListener('mousemove', function (e) {
      if (isMouseDown) {
        isDragging = true
        distance += Math.abs(e.movementX) + Math.abs(e.movementY)
      }
    })
  }

  document.body.addEventListener('click', function (e) {
    if (isDragging && distance >= 10.0) {
      e.stopImmediatePropagation()
      isDragging = false
    }
  }, true)
})

require('tabState.js').initialize()
require('tabState/windowSync.js').initialize()
require('windowControls.js').initialize()
require('navbar/menuButton.js').initialize()

require('navbar/addTabButton.js').initialize()
require('navbar/tabContextMenu.js').initialize()
require('navbar/tabActivity.js').initialize()
require('navbar/tabColor.js').initialize()
require('navbar/navigationButtons.js').initialize()
require('downloadManager.js').initialize()
require('webviewMenu.js').initialize()
require('contextMenu.js').initialize()
require('menuRenderer.js').initialize()
require('defaultKeybindings.js').initialize()
require('pdfViewer.js').initialize()
// Branch Browser: Password manager disabled for MVP (causes initialization errors)
// require('autofillSetup.js').initialize()
// require('passwordManager/passwordManager.js').initialize()
// require('passwordManager/passwordCapture.js').initialize()
// require('passwordManager/passwordViewer.js').initialize()
require('util/theme.js').initialize()
require('userscripts.js').initialize()
require('statistics.js').initialize()
require('taskOverlay/taskOverlay.js').initialize()
require('sessionRestore.js').initialize()

// Branch Browser: Disable non-essential modules for MVP
// require('bookmarkConverter.js').initialize()  // Disabled - causes error during webpack chunk loading
// require('newTabPage.js').initialize()  // Disabled - not needed for MVP
// require('macHandoff.js').initialize()  // Disabled - not needed for MVP

// Branch Browser: TEMPORARILY DISABLED to debug white screen
// The branch modules cause errors during webpack chunk loading
// TODO: Fix branch modules and re-enable
/*
var database = require('util/database.js')
database.dbReady.then(async function () {
  console.log('[BranchBrowser] Database ready, initializing branches...')
  try {
    await require('branches/branchEvents.js').initialize()
  } catch (e) {
    console.error('[BranchBrowser] branchEvents init failed:', e)
  }
  try {
    require('branches/branchPanel.js').initialize()
  } catch (e) {
    console.error('[BranchBrowser] branchPanel init failed:', e)
  }
}).catch(function (e) {
  console.error('[BranchBrowser] Database ready failed:', e)
  try {
    require('branches/branchPanel.js').initialize()
  } catch (e2) {
    console.error('[BranchBrowser] branchPanel fallback init failed:', e2)
  }
})
*/

// default searchbar plugins

require('searchbar/placesPlugin.js').initialize()
require('searchbar/instantAnswerPlugin.js').initialize()
require('searchbar/bangsPlugin.js').initialize()
require('searchbar/customBangs.js').initialize()
require('searchbar/searchSuggestionsPlugin.js').initialize()
require('searchbar/placeSuggestionsPlugin.js').initialize()
require('searchbar/updateNotifications.js').initialize()
require('searchbar/restoreTaskPlugin.js').initialize()
require('searchbar/bookmarkManager.js').initialize()
require('searchbar/historyViewer.js').initialize()
// require('searchbar/developmentModeNotification.js').initialize() // Disabled for Branch Browser
require('searchbar/shortcutButtons.js').initialize()
require('searchbar/calculatorPlugin.js').initialize()

// CRITICAL: Set sidebar margin BEFORE creating webviews
// This ensures getViewBounds() uses x=260 instead of x=0
var webviews = require('webviews.js')
var SIDEBAR_WIDTH = 260
console.log('[BranchBrowser] viewMargins BEFORE:', JSON.stringify(webviews.viewMargins))
webviews.adjustMargin([0, 0, 0, SIDEBAR_WIDTH])
console.log('[BranchBrowser] viewMargins AFTER:', JSON.stringify(webviews.viewMargins))
console.log('[BranchBrowser] getViewBounds():', JSON.stringify(webviews.getViewBounds()))

// CRITICAL: Session restore runs UNCONDITIONALLY
// This ensures the browser always works, even if branches fail to initialize
// Branch events will catch tab-added events when dbReady resolves
require('sessionRestore.js').restore()
