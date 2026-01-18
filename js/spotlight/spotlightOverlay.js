/**
 * Spotlight Overlay - Arc-style centered search/URL input
 * Opens with Cmd+T for quick tab creation
 *
 * Features:
 * - Enter: Create new child tab
 * - Shift+Enter: Create sibling tab (same branch level)
 * - Escape: Close overlay
 */

var webviews = require('webviews.js')
var browserUI = require('browserUI.js')
var modalMode = require('modalMode.js')
var focusMode = require('focusMode.js')

// Lazy load branchState to avoid circular dependencies
var branchState = null
function getBranchState () {
  if (branchState) return branchState
  try {
    branchState = require('branches/branchState.js')
    return branchState
  } catch (e) {
    console.warn('[Spotlight] Failed to load branchState:', e.message)
    return null
  }
}

// Lazy load tabs
function safeTabs () {
  return typeof tabs !== 'undefined' ? tabs : null
}

var spotlightOverlay = {
  overlayElement: null,
  containerElement: null,
  inputElement: null,
  isShown: false,

  initialize: function () {
    this.overlayElement = document.getElementById('spotlight-overlay')
    this.containerElement = document.getElementById('spotlight-container')
    this.inputElement = document.getElementById('spotlight-input')

    if (!this.overlayElement || !this.inputElement) {
      console.warn('[Spotlight] Overlay elements not found in DOM')
      return
    }

    this.setupEventListeners()
  },

  show: function () {
    // Don't show if modal mode or focus mode is active
    if (modalMode.enabled()) {
      return
    }

    if (focusMode.enabled()) {
      focusMode.warn()
      return
    }

    if (this.isShown) {
      this.inputElement.focus()
      return
    }

    // Request webview placeholder to dim the content
    webviews.requestPlaceholder('spotlight')
    document.body.classList.add('spotlight-is-shown')

    this.isShown = true
    this.overlayElement.hidden = false
    this.inputElement.value = ''

    // Focus after a small delay to ensure DOM is ready
    var self = this
    setTimeout(function () {
      self.inputElement.focus()
    }, 50)
  },

  hide: function () {
    if (!this.isShown) return

    this.isShown = false
    this.overlayElement.hidden = true
    document.body.classList.remove('spotlight-is-shown')

    // Hide webview placeholder and return focus
    webviews.hidePlaceholder('spotlight')

    // Return focus to webview
    var selectedTab = safeTabs() ? safeTabs().getSelected() : null
    if (selectedTab) {
      webviews.focus()
    }
  },

  navigate: function (input, options) {
    options = options || {}
    var url = this.parseInput(input)

    if (options.asSibling) {
      this.createSiblingTab(url)
    } else {
      this.createChildTab(url)
    }

    this.hide()
  },

  parseInput: function (input) {
    if (!input) return ''

    input = input.trim()

    // If it looks like a search query (no dots, not a URL)
    if (!input.includes('.') && !input.startsWith('http://') && !input.startsWith('https://') && !input.startsWith('file://')) {
      return 'https://www.google.com/search?q=' + encodeURIComponent(input)
    }

    // Add https:// if no protocol specified
    if (!input.startsWith('http://') && !input.startsWith('https://') && !input.startsWith('file://')) {
      return 'https://' + input
    }

    return input
  },

  createChildTab: function (url) {
    var t = safeTabs()
    if (!t) return

    var newTabId = t.add({ url: url })
    browserUI.addTab(newTabId, { enterEditMode: false })
  },

  createSiblingTab: function (url) {
    var t = safeTabs()
    if (!t) return

    var bs = getBranchState()
    var currentTabId = t.getSelected()
    var parentBranchId = null

    // Get current branch's parent to create sibling
    if (bs && currentTabId) {
      var currentBranch = bs.getByTabId(currentTabId)
      if (currentBranch && currentBranch.parentId) {
        // Use the same parent as current branch (sibling)
        parentBranchId = currentBranch.parentId
      } else {
        // If no parent (root level), use root as parent
        parentBranchId = bs.getRootBranchId ? bs.getRootBranchId() : null
      }
    }

    var newTabId = t.add({
      url: url,
      parentBranchId: parentBranchId,
      isSiblingTab: true
    })

    browserUI.addTab(newTabId, { enterEditMode: false })
  },

  setupEventListeners: function () {
    var self = this

    // Input keydown handler
    this.inputElement.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var input = self.inputElement.value.trim()
        if (input) {
          var isSibling = e.shiftKey
          self.navigate(input, { asSibling: isSibling })
        }
        e.preventDefault()
      } else if (e.key === 'Escape') {
        self.hide()
        e.preventDefault()
      }
    })

    // Click outside container to close
    this.overlayElement.addEventListener('click', function (e) {
      if (e.target === self.overlayElement) {
        self.hide()
      }
    })

    // Prevent clicks inside container from closing
    this.containerElement.addEventListener('click', function (e) {
      e.stopPropagation()
    })
  },

  // Toggle visibility
  toggle: function () {
    if (this.isShown) {
      this.hide()
    } else {
      this.show()
    }
  }
}

module.exports = spotlightOverlay
