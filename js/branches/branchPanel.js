// Branch Browser - Sidebar Panel Component
// Renders the branch tree, breadcrumbs, and handles user interactions

// Lazy-loaded modules to avoid crashing if they fail
var branchState = null
var browserUI = require('browserUI.js')
var webviews = require('webviews.js')

// Safely get branchState module (lazy load with error handling)
function getBranchState () {
  if (branchState) return branchState
  try {
    branchState = require('branches/branchState.js')
    return branchState
  } catch (e) {
    console.warn('[BranchPanel] Failed to load branchState:', e.message)
    return null
  }
}

// Safe accessor for global `tabs` which may be undefined during initialization
// (window.tabs is set by tasks.setSelected() which happens in sessionRestore)
function safeTabs () {
  return (typeof tabs !== 'undefined' && tabs) ? tabs : null
}

// Debug: Verify modules loaded correctly
console.log('[BranchPanel] Module loaded')
console.log('[BranchPanel] browserUI:', browserUI)
console.log('[BranchPanel] browserUI.addTab:', typeof browserUI.addTab)
console.log('[BranchPanel] browserUI.switchToTab:', typeof browserUI.switchToTab)
console.log('[BranchPanel] browserUI.closeTab:', typeof browserUI.closeTab)

var SIDEBAR_WIDTH = 260

var MAX_PINNED_SITES = 6

var branchPanel = {
  container: null,
  treeContainer: null,
  statusContainer: null,
  breadcrumbContainer: null,
  pageTitleContainer: null,
  pinnedContainer: null,
  newBranchButton: null,
  newBranchBtn: null,
  newTabBtn: null,
  collapseAllBtn: null,
  expandAllBtn: null,
  toggleSidebarBtn: null,
  expandSidebarBtn: null,
  urlInput: null,
  isSidebarCollapsed: false,
  collapsedBranches: new Set(),
  pinnedSites: [],
  contextMenu: null,
  isNewTabMode: false, // Track if we're creating a new tab vs navigating current

  // Drag & Drop state
  dragState: {
    isDragging: false,
    draggedBranchId: null,
    draggedElement: null,
    dropIndicator: null,
    targetBranchId: null,
    targetIndex: -1,
    targetDepth: 0,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
  },

  // Base indent per depth level (px)
  INDENT_PER_LEVEL: 14,
  // Minimum drag distance before drag starts
  DRAG_THRESHOLD: 5,

  initialize: function () {
    this.container = document.getElementById('branch-sidebar')
    this.treeContainer = document.getElementById('branch-tree')
    this.statusContainer = document.getElementById('branch-count')
    this.breadcrumbContainer = document.getElementById('breadcrumb-trail')
    this.pageTitleContainer = document.getElementById('current-page-title')
    this.pinnedContainer = document.getElementById('pinned-sites')
    this.newBranchButton = document.getElementById('new-branch-button')
    // Toolbar buttons (legacy, now hidden)
    this.newBranchBtn = document.getElementById('new-branch-btn')
    this.collapseAllBtn = document.getElementById('collapse-all-btn')
    this.expandAllBtn = document.getElementById('expand-all-btn')
    this.toggleSidebarBtn = document.getElementById('toggle-sidebar-btn')
    this.expandSidebarBtn = document.getElementById('sidebar-expand-btn')
    // New tab button (next to URL bar)
    this.newTabBtn = document.getElementById('new-tab-btn')
    this.urlInput = document.getElementById('sidebar-url-input')

    if (!this.container || !this.treeContainer) {
      console.warn('[BranchPanel] Container elements not found')
      return
    }

    // Load saved state
    this.loadCollapsedState()
    this.loadPinnedSites()

    // Setup button handlers
    this.setupButtonHandlers()

    // Ensure ROOT branch exists and clean up stale branches
    // Delay to ensure tabs are loaded first
    var self = this
    setTimeout(async function () {
      var bs = getBranchState()
      if (!bs) {
        console.warn('[BranchPanel] branchState not available, skipping ROOT setup')
        self.render()
        return
      }

      // Ensure ROOT exists
      var root = bs.getRoot()
      if (!root) {
        console.log('[BranchPanel] No ROOT found, creating one')
        // Get the first tab or create one (safeTabs may be null during init)
        var selectedTab = safeTabs() ? safeTabs().getSelected() : null
        if (selectedTab) {
          // Use the first/selected tab as ROOT
          // Keep it as blank new tab page - that IS the ROOT
          await bs.ensureRoot(selectedTab)
        } else {
          // No tabs exist - will be created by default tab behavior
          console.log('[BranchPanel] No tabs found, ROOT will be created when first tab opens')
        }
      }

      self.clearStaleBranches()
      self.render()
    }, 500)

    // Initial render
    this.render()
    this.renderPinnedSites()
    this.updateBreadcrumbs()

    // Listen for tab events to update the tree
    this.setupEventListeners()

    // Setup drag & drop
    this.setupDragAndDrop()

    console.log('[BranchPanel] Initialized')
  },

  setupButtonHandlers: function () {
    var self = this

    // Legacy New Branch button
    if (this.newBranchButton) {
      console.log('[BranchPanel] Attaching legacy new branch button handler')
      this.newBranchButton.addEventListener('click', function () {
        console.log('[BranchPanel] Legacy new branch button clicked')
        try {
          browserUI.addTab()
          console.log('[BranchPanel] browserUI.addTab() succeeded')
        } catch (e) {
          console.error('[BranchPanel] browserUI.addTab() failed:', e)
        }
      })
    }

    // Toolbar: New Branch button (legacy, now hidden)
    if (this.newBranchBtn) {
      this.newBranchBtn.addEventListener('click', function () {
        try {
          browserUI.addTab()
        } catch (e) {
          console.error('[BranchPanel] browserUI.addTab() failed:', e)
        }
      })
    }

    // New Tab button (next to URL bar)
    if (this.newTabBtn) {
      console.log('[BranchPanel] Attaching new tab button handler')
      this.newTabBtn.addEventListener('click', function () {
        console.log('[BranchPanel] New tab button clicked')
        try {
          browserUI.addTab()
          console.log('[BranchPanel] browserUI.addTab() succeeded')
        } catch (e) {
          console.error('[BranchPanel] browserUI.addTab() failed:', e)
        }
      })
    } else {
      console.warn('[BranchPanel] New tab button not found!')
    }

    // Toolbar: Collapse All button
    if (this.collapseAllBtn) {
      console.log('[BranchPanel] Attaching collapse all button handler')
      this.collapseAllBtn.addEventListener('click', function () {
        console.log('[BranchPanel] Collapse all button clicked')
        self.collapseAll()
      })
    }

    // Toolbar: Expand All button
    if (this.expandAllBtn) {
      console.log('[BranchPanel] Attaching expand all button handler')
      this.expandAllBtn.addEventListener('click', function () {
        console.log('[BranchPanel] Expand all button clicked')
        self.expandAll()
      })
    }

    // Toolbar: Toggle Sidebar button
    if (this.toggleSidebarBtn) {
      console.log('[BranchPanel] Attaching toggle sidebar button handler')
      this.toggleSidebarBtn.addEventListener('click', function () {
        console.log('[BranchPanel] Toggle sidebar button clicked')
        self.toggleSidebar()
      })
    }

    // Floating: Expand Sidebar button (when collapsed)
    if (this.expandSidebarBtn) {
      console.log('[BranchPanel] Attaching expand sidebar button handler')
      this.expandSidebarBtn.addEventListener('click', function () {
        console.log('[BranchPanel] Expand sidebar button clicked')
        self.toggleSidebar()
      })
    }

    // URL Input: Navigate on Enter key, cancel on Escape
    if (this.urlInput) {
      console.log('[BranchPanel] Attaching URL input handler')
      this.urlInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var url = self.urlInput.value.trim()
          console.log('[BranchPanel] URL input Enter pressed, value:', url, 'isNewTabMode:', self.isNewTabMode)
          if (url) {
            self.navigateToUrl(url)
            self.urlInput.value = ''
            self.urlInput.blur()
          } else if (self.isNewTabMode) {
            // Empty input in new tab mode - just cancel
            self.cancelNewTabMode()
          }
        } else if (e.key === 'Escape') {
          console.log('[BranchPanel] URL input Escape pressed')
          if (self.isNewTabMode) {
            self.cancelNewTabMode()
          } else {
            self.urlInput.value = ''
            self.urlInput.blur()
          }
          e.preventDefault()
        }
      })

      // Also cancel new tab mode when input loses focus
      this.urlInput.addEventListener('blur', function () {
        if (self.isNewTabMode && !self.urlInput.value.trim()) {
          // Only cancel if empty - user might have clicked away temporarily
          setTimeout(function () {
            if (self.isNewTabMode && document.activeElement !== self.urlInput) {
              self.cancelNewTabMode()
            }
          }, 100)
        }
      })
    } else {
      console.warn('[BranchPanel] URL input not found!')
    }

    // Restore collapsed state from localStorage
    this.restoreSidebarState()

    // Close context menu on outside click
    document.addEventListener('click', function (e) {
      if (self.contextMenu && !self.contextMenu.contains(e.target)) {
        self.closeContextMenu()
      }
    })
  },

  // =========================================
  // DRAG & DROP FUNCTIONALITY
  // =========================================

  setupDragAndDrop: function () {
    var self = this

    // Create drop indicator element
    this.dragState.dropIndicator = document.createElement('div')
    this.dragState.dropIndicator.className = 'branch-drop-indicator'
    this.dragState.dropIndicator.style.display = 'none'

    // Add indicator to tree container
    if (this.treeContainer) {
      this.treeContainer.appendChild(this.dragState.dropIndicator)
    }

    // Global mouse move handler for drag tracking
    document.addEventListener('mousemove', function (e) {
      if (self.dragState.isDragging) {
        self.handleDragMove(e)
      }
    })

    // Global mouse up handler for drop
    document.addEventListener('mouseup', function (e) {
      if (self.dragState.isDragging) {
        self.handleDragEnd(e)
      }
    })

    console.log('[BranchPanel] Drag & drop initialized')
  },

  // Attach drag handlers to a branch item element
  attachDragHandlers: function (element, branchId) {
    var self = this

    // Make element draggable via mouse events (not HTML5 drag)
    element.addEventListener('mousedown', function (e) {
      // Only left mouse button
      if (e.button !== 0) return

      // Don't start drag if clicking on toggle, close button, or other interactive elements
      if (e.target.closest('.branch-toggle') ||
          e.target.closest('.branch-close-btn') ||
          e.target.closest('button')) {
        return
      }

      self.handleDragStart(e, branchId, element)
    })
  },

  handleDragStart: function (e, branchId, element) {
    var self = this

    // Store initial position
    this.dragState.startX = e.clientX
    this.dragState.startY = e.clientY
    this.dragState.currentX = e.clientX
    this.dragState.currentY = e.clientY
    this.dragState.draggedBranchId = branchId
    this.dragState.draggedElement = element

    // Wait for threshold movement before actually starting drag
    this.dragState.pendingDrag = true

    // Temporary handlers for threshold detection
    var moveHandler = function (moveEvent) {
      var dx = moveEvent.clientX - self.dragState.startX
      var dy = moveEvent.clientY - self.dragState.startY
      var distance = Math.sqrt(dx * dx + dy * dy)

      if (distance > self.DRAG_THRESHOLD && self.dragState.pendingDrag) {
        // Start actual drag
        self.dragState.pendingDrag = false
        self.startActualDrag()
        document.removeEventListener('mousemove', moveHandler)
        document.removeEventListener('mouseup', upHandler)
      }
    }

    var upHandler = function () {
      // Mouse released before threshold - cancel pending drag
      self.dragState.pendingDrag = false
      self.dragState.draggedBranchId = null
      self.dragState.draggedElement = null
      document.removeEventListener('mousemove', moveHandler)
      document.removeEventListener('mouseup', upHandler)
    }

    document.addEventListener('mousemove', moveHandler)
    document.addEventListener('mouseup', upHandler)

    e.preventDefault()
  },

  startActualDrag: function () {
    var bs = getBranchState()
    if (!bs) return

    // Check if this is ROOT - can't drag ROOT
    if (bs.isRoot(this.dragState.draggedBranchId)) {
      console.log('[BranchPanel] Cannot drag ROOT branch')
      this.resetDragState()
      return
    }

    this.dragState.isDragging = true

    // Add dragging class to element
    if (this.dragState.draggedElement) {
      this.dragState.draggedElement.classList.add('dragging')
    }

    // Add dragging class to container
    if (this.treeContainer) {
      this.treeContainer.classList.add('is-dragging')
    }

    // Show drop indicator
    this.dragState.dropIndicator.style.display = 'block'

    console.log('[BranchPanel] Started dragging:', this.dragState.draggedBranchId)
  },

  handleDragMove: function (e) {
    if (!this.dragState.isDragging) return

    this.dragState.currentX = e.clientX
    this.dragState.currentY = e.clientY

    // Calculate drop target based on mouse position
    this.updateDropTarget(e)
  },

  updateDropTarget: function (e) {
    var bs = getBranchState()
    if (!bs || !this.treeContainer) return

    var treeRect = this.treeContainer.getBoundingClientRect()
    var mouseY = e.clientY
    var mouseX = e.clientX

    // Get all visible branch items
    var items = this.treeContainer.querySelectorAll('.branch-item:not(.dragging)')
    var itemsArray = Array.from(items)

    if (itemsArray.length === 0) {
      // No items - drop at root level
      this.positionDropIndicator(0, treeRect.top + 8)
      this.dragState.targetBranchId = null
      this.dragState.targetIndex = 0
      this.dragState.targetDepth = 0
      return
    }

    // Find the item the mouse is over or between
    var targetItem = null
    var insertAfter = false
    var closestDistance = Infinity

    for (var i = 0; i < itemsArray.length; i++) {
      var item = itemsArray[i]
      var rect = item.getBoundingClientRect()
      var itemMiddleY = rect.top + rect.height / 2

      // Check if mouse is within this item's vertical bounds
      if (mouseY >= rect.top && mouseY <= rect.bottom) {
        targetItem = item
        // If below middle, insert after; otherwise insert before
        insertAfter = mouseY > itemMiddleY
        break
      }

      // Track closest item for when mouse is between items
      var distanceToMiddle = Math.abs(mouseY - itemMiddleY)
      if (distanceToMiddle < closestDistance) {
        closestDistance = distanceToMiddle
        targetItem = item
        insertAfter = mouseY > itemMiddleY
      }
    }

    if (!targetItem) return

    var targetBranchId = targetItem.getAttribute('data-branch-id')
    var targetBranch = bs.get(targetBranchId)
    if (!targetBranch) return

    // Can't drop onto self or descendants
    if (targetBranchId === this.dragState.draggedBranchId ||
        bs.isDescendant(this.dragState.draggedBranchId, targetBranchId)) {
      this.dragState.dropIndicator.classList.add('invalid')
    } else {
      this.dragState.dropIndicator.classList.remove('invalid')
    }

    // Calculate indent level based on horizontal mouse position
    var targetRect = targetItem.getBoundingClientRect()
    var currentDepth = parseInt(targetItem.getAttribute('data-depth')) || 0
    var baseIndentX = treeRect.left + 10 // Base position for depth 0

    // Calculate depth from mouse X position
    var relativeX = mouseX - baseIndentX
    var calculatedDepth = Math.floor(relativeX / this.INDENT_PER_LEVEL)

    // Determine the valid depth range
    var minDepth = 0
    var maxDepth

    if (insertAfter) {
      // When inserting after an item, max depth is current item's depth + 1 (become its child)
      // But only if the item has no collapsed children or is the last visible item
      var hasVisibleChildren = this.hasVisibleChildren(targetBranchId)
      maxDepth = hasVisibleChildren ? currentDepth : currentDepth + 1
    } else {
      // When inserting before an item, max depth is current item's depth
      maxDepth = currentDepth
    }

    // Clamp depth
    var finalDepth = Math.max(minDepth, Math.min(maxDepth, calculatedDepth))

    // Determine the parent based on depth and position
    var newParentId = this.determineParentFromDepth(targetItem, insertAfter, finalDepth, itemsArray)

    // Calculate insert index among siblings
    var insertIndex = this.calculateInsertIndex(newParentId, targetBranchId, insertAfter, finalDepth)

    // Update drag state
    this.dragState.targetBranchId = newParentId
    this.dragState.targetIndex = insertIndex
    this.dragState.targetDepth = finalDepth

    // Position the drop indicator
    var indicatorY = insertAfter ? targetRect.bottom : targetRect.top
    this.positionDropIndicator(finalDepth, indicatorY)
  },

  hasVisibleChildren: function (branchId) {
    // Check if the branch has visible children (not collapsed)
    if (this.collapsedBranches.has(branchId)) {
      return false
    }
    var bs = getBranchState()
    if (!bs) return false
    var children = bs.getChildren(branchId)
    return children && children.length > 0
  },

  determineParentFromDepth: function (targetItem, insertAfter, targetDepth, allItems) {
    var bs = getBranchState()
    if (!bs) return null

    var targetBranchId = targetItem.getAttribute('data-branch-id')
    var targetBranch = bs.get(targetBranchId)
    var currentDepth = parseInt(targetItem.getAttribute('data-depth')) || 0

    if (insertAfter) {
      if (targetDepth > currentDepth) {
        // Becoming a child of the target item
        return targetBranchId
      } else if (targetDepth === currentDepth) {
        // Same level as target - use target's parent
        return targetBranch.parentId || bs.getRootBranchId()
      } else {
        // Outdenting - find ancestor at the right level
        var ancestors = bs.getAncestors(targetBranchId)
        var levelDiff = currentDepth - targetDepth
        if (levelDiff <= ancestors.length) {
          return ancestors[levelDiff - 1] ? ancestors[levelDiff - 1].id : bs.getRootBranchId()
        }
        return bs.getRootBranchId()
      }
    } else {
      // Inserting before - use same parent as target
      if (targetDepth === currentDepth) {
        return targetBranch.parentId || bs.getRootBranchId()
      } else if (targetDepth < currentDepth) {
        // Outdenting relative to target
        var ancestors = bs.getAncestors(targetBranchId)
        var levelDiff = currentDepth - targetDepth
        if (levelDiff <= ancestors.length) {
          return ancestors[levelDiff - 1] ? ancestors[levelDiff - 1].id : bs.getRootBranchId()
        }
        return bs.getRootBranchId()
      } else {
        // Can't indent more than target when inserting before
        return targetBranch.parentId || bs.getRootBranchId()
      }
    }
  },

  calculateInsertIndex: function (parentId, targetBranchId, insertAfter, targetDepth) {
    var bs = getBranchState()
    if (!bs) return 0

    var siblings = bs.getChildren(parentId)
    var targetIndex = -1

    for (var i = 0; i < siblings.length; i++) {
      if (siblings[i].id === targetBranchId) {
        targetIndex = i
        break
      }
    }

    if (targetIndex === -1) {
      // Target not a direct sibling - insert at end
      return siblings.length
    }

    return insertAfter ? targetIndex + 1 : targetIndex
  },

  positionDropIndicator: function (depth, y) {
    if (!this.dragState.dropIndicator || !this.treeContainer) return

    var treeRect = this.treeContainer.getBoundingClientRect()
    var indicatorY = y - treeRect.top + this.treeContainer.scrollTop

    // Calculate left position based on depth
    var leftOffset = 10 + (depth * this.INDENT_PER_LEVEL) + 16 // 16 for toggle width

    this.dragState.dropIndicator.style.top = indicatorY + 'px'
    this.dragState.dropIndicator.style.left = leftOffset + 'px'
    this.dragState.dropIndicator.style.right = '8px'
  },

  handleDragEnd: async function (e) {
    if (!this.dragState.isDragging) {
      this.resetDragState()
      return
    }

    var bs = getBranchState()
    if (!bs) {
      this.resetDragState()
      return
    }

    // Check if drop is valid
    var draggedBranchId = this.dragState.draggedBranchId
    var targetParentId = this.dragState.targetBranchId
    var targetIndex = this.dragState.targetIndex

    // Validate drop
    // Use ROOT as parent if targetParentId is null (root level drop)
    var effectiveParentId = targetParentId || bs.getRootBranchId()
    var isValid = draggedBranchId &&
                  !bs.isRoot(draggedBranchId) &&
                  draggedBranchId !== effectiveParentId &&
                  !bs.isDescendant(draggedBranchId, effectiveParentId)

    if (isValid) {
      console.log('[BranchPanel] Dropping', draggedBranchId, 'to parent', targetParentId, 'at index', targetIndex)

      // Perform the reparent operation
      var success = await bs.reparent(draggedBranchId, targetParentId, targetIndex)

      if (success) {
        // Update the tab's parentBranchId
        var branch = bs.get(draggedBranchId)
        if (branch && branch.tabId && safeTabs()) {
          var tab = safeTabs().get(branch.tabId)
          if (tab) {
            safeTabs().update(branch.tabId, { parentBranchId: targetParentId })
          }
        }

        // Re-render the tree
        this.render()
      }
    } else {
      console.log('[BranchPanel] Invalid drop - cancelled')
    }

    this.resetDragState()
  },

  resetDragState: function () {
    // Remove dragging class from element
    if (this.dragState.draggedElement) {
      this.dragState.draggedElement.classList.remove('dragging')
    }

    // Remove dragging class from container
    if (this.treeContainer) {
      this.treeContainer.classList.remove('is-dragging')
    }

    // Hide drop indicator
    if (this.dragState.dropIndicator) {
      this.dragState.dropIndicator.style.display = 'none'
      this.dragState.dropIndicator.classList.remove('invalid')
    }

    // Reset state
    this.dragState.isDragging = false
    this.dragState.pendingDrag = false
    this.dragState.draggedBranchId = null
    this.dragState.draggedElement = null
    this.dragState.targetBranchId = null
    this.dragState.targetIndex = -1
    this.dragState.targetDepth = 0
  },

  collapseAll: function () {
    var self = this
    var bs = getBranchState()
    if (!bs) return

    var allBranches = bs.getAll()
    allBranches.forEach(function (branch) {
      var children = bs.getChildren(branch.id)
      if (children && children.length > 0) {
        self.collapsedBranches.add(branch.id)
      }
    })
    this.saveCollapsedState()
    this.render()
  },

  expandAll: function () {
    this.collapsedBranches.clear()
    this.saveCollapsedState()
    this.render()
  },

  toggleSidebar: function () {
    var wasCollapsed = this.isSidebarCollapsed
    this.isSidebarCollapsed = !this.isSidebarCollapsed

    // Update sidebar class
    if (this.isSidebarCollapsed) {
      this.container.classList.add('collapsed')
    } else {
      this.container.classList.remove('collapsed')
    }

    // Adjust webview margin - adjustMargin is ADDITIVE, use difference!
    // Collapsing: remove sidebar width (-260)
    // Expanding: add sidebar width (+260)
    var marginDelta = this.isSidebarCollapsed ? -SIDEBAR_WIDTH : SIDEBAR_WIDTH
    try {
      webviews.adjustMargin([0, 0, 0, marginDelta])
    } catch (e) {
      console.error('[BranchPanel] Failed to adjust margin:', e)
    }

    // Update toggle button text (legacy sidebar button)
    if (this.toggleSidebarBtn) {
      this.toggleSidebarBtn.textContent = this.isSidebarCollapsed ? '▶' : '◀'
    }

    // Show/hide floating expand button
    if (this.expandSidebarBtn) {
      this.expandSidebarBtn.hidden = !this.isSidebarCollapsed
    }

    // Save state
    localStorage.setItem('branchPanel.sidebarCollapsed', this.isSidebarCollapsed ? 'true' : 'false')

    console.log('[BranchPanel] Sidebar', this.isSidebarCollapsed ? 'collapsed' : 'expanded')
  },

  restoreSidebarState: function () {
    var saved = localStorage.getItem('branchPanel.sidebarCollapsed')
    if (saved === 'true') {
      // Restore collapsed state without animation
      this.isSidebarCollapsed = true
      this.container.classList.add('collapsed')

      // Initialize already added SIDEBAR_WIDTH margin
      // We need to REMOVE it since sidebar should be collapsed
      try {
        webviews.adjustMargin([0, 0, 0, -SIDEBAR_WIDTH])
      } catch (e) {
        console.error('[BranchPanel] Failed to adjust margin on restore:', e)
      }

      if (this.toggleSidebarBtn) {
        this.toggleSidebarBtn.textContent = '▶'
      }

      if (this.expandSidebarBtn) {
        this.expandSidebarBtn.hidden = false
      }
    }
  },

  // Focus the sidebar URL input for new tab creation
  // When user presses Enter, a new tab is created and navigated
  focusUrlInput: function () {
    if (!this.urlInput) {
      console.warn('[BranchPanel] URL input not found')
      return
    }

    // If sidebar is collapsed, expand it first
    if (this.isSidebarCollapsed) {
      this.toggleSidebar()
    }

    // Enter new tab mode - next Enter will create a new tab
    this.isNewTabMode = true
    this.urlInput.value = ''
    this.urlInput.focus()
    this.urlInput.placeholder = 'Enter URL for new tab...'

    console.log('[BranchPanel] focusUrlInput called, isNewTabMode:', this.isNewTabMode)
  },

  // Cancel new tab mode and return focus to current page
  cancelNewTabMode: function () {
    this.isNewTabMode = false
    if (this.urlInput) {
      this.urlInput.value = ''
      this.urlInput.blur()
      this.urlInput.placeholder = 'Search or enter URL...'
    }
    // Return focus to webview
    var selectedTab = safeTabs() ? safeTabs().getSelected() : null
    if (selectedTab) {
      webviews.callAsync(selectedTab, 'focus')
    }
    console.log('[BranchPanel] cancelNewTabMode called')
  },

  navigateToUrl: function (input) {
    console.log('[BranchPanel] navigateToUrl called with:', input, 'isNewTabMode:', this.isNewTabMode)
    var url = input

    // Check if it's a URL or search query
    if (!input.includes('.') && !input.startsWith('http')) {
      // It's a search query - use default search engine (Google)
      url = 'https://www.google.com/search?q=' + encodeURIComponent(input)
      console.log('[BranchPanel] Treating as search query, URL:', url)
    } else if (!input.startsWith('http://') && !input.startsWith('https://')) {
      // Add https:// prefix
      url = 'https://' + input
      console.log('[BranchPanel] Added https:// prefix, URL:', url)
    }

    try {
      // In new tab mode, always create a new tab
      if (this.isNewTabMode) {
        console.log('[BranchPanel] New tab mode - creating new tab with URL:', url)
        var newTabId = tabs.add({ url: url })
        browserUI.addTab(newTabId, { enterEditMode: false })
        // Reset new tab mode
        this.isNewTabMode = false
        if (this.urlInput) {
          this.urlInput.placeholder = 'Search or enter URL...'
        }
        console.log('[BranchPanel] New tab created:', newTabId)
        return
      }

      // Normal mode: navigate in current tab or create new one
      var selectedTab = tabs.getSelected()
      console.log('[BranchPanel] Selected tab:', selectedTab)

      if (selectedTab) {
        var tabData = tabs.get(selectedTab)
        console.log('[BranchPanel] Tab data:', tabData)

        if (!tabData || !tabData.url || tabData.url === 'useful://newtab') {
          // Current tab is empty (new tab page), navigate in it
          console.log('[BranchPanel] Empty tab, updating webview')
          webviews.update(selectedTab, url)
        } else {
          // Create new tab with URL
          console.log('[BranchPanel] Creating new tab with URL')
          var newTabId = tabs.add({ url: url })
          browserUI.addTab(newTabId, { enterEditMode: false })
        }
      } else {
        // No selected tab, create new one
        console.log('[BranchPanel] No selected tab, creating new tab')
        var newTabId = tabs.add({ url: url })
        browserUI.addTab(newTabId, { enterEditMode: false })
      }
      console.log('[BranchPanel] Navigation succeeded')
    } catch (e) {
      console.error('[BranchPanel] Navigation failed:', e)
    }
  },

  setupEventListeners: function () {
    var self = this

    // Update tree when tabs change
    // Note: Branch creation is handled by branchEvents.js - we just re-render here
    tasks.on('tab-added', function (tabId) {
      console.log('[BranchPanel] Tab added:', tabId)
      // Delay render to let branchEvents.js create the branch first
      setTimeout(function () {
        self.render()
        self.updateBreadcrumbs()
      }, 50)
    })

    tasks.on('tab-destroyed', function () {
      // Aggressive cleanup: Clear stale branches and re-render
      // Delay to let state settle (Min auto-creates new tab when last one closes)
      setTimeout(function () {
        self.clearStaleBranches()
        self.render()
        self.updateBreadcrumbs()
      }, 100)
    })

    tasks.on('tab-updated', function (tabId, key) {
      if (key === 'title' || key === 'url') {
        // Update the branch with new title/url
        var bs = getBranchState()
        if (bs) {
          var branch = bs.getByTabId(tabId)
          if (branch) {
            var tab = tabs.get(tabId)
            if (tab) {
              var updates = {}
              if (key === 'title' && tab.title) updates.title = tab.title
              if (key === 'url' && tab.url) updates.url = tab.url
              bs.update(branch.id, updates)
            }
          }
        }
        self.render()
        self.updateBreadcrumbs()
      }
    })

    tasks.on('tab-selected', function () {
      self.updateActiveIndicator()
      self.updateBreadcrumbs()
    })
  },

  // =========================================
  // BREADCRUMB RENDERING - Shows navigation history within branch
  // =========================================

  updateBreadcrumbs: function () {
    if (!this.breadcrumbContainer) return

    var selectedTabId = safeTabs() ? safeTabs().getSelected() : null
    if (!selectedTabId) return

    // Clear existing breadcrumbs
    while (this.breadcrumbContainer.firstChild) {
      this.breadcrumbContainer.removeChild(this.breadcrumbContainer.firstChild)
    }

    var bs = getBranchState()
    var branch = bs ? bs.getByTabId(selectedTabId) : null
    if (!branch) {
      // No branch found, show tab title as single breadcrumb
      var tab = safeTabs() ? safeTabs().get(selectedTabId) : null
      var title = tab ? (tab.title || 'New Tab') : 'New Tab'

      var item = document.createElement('span')
      item.className = 'breadcrumb-item current'
      item.textContent = this.getShortTitle(title)
      this.breadcrumbContainer.appendChild(item)
      return
    }

    // Get navigation history with current position
    var historyData = bs.getHistoryWithPosition(branch.id)
    var history = historyData.history
    var currentIndex = historyData.currentIndex

    // If no history yet, show current page
    if (history.length === 0) {
      var item = document.createElement('span')
      item.className = 'breadcrumb-item current'
      item.textContent = this.getShortTitle(branch.title || branch.url || 'New Tab')
      this.breadcrumbContainer.appendChild(item)
      return
    }

    // Calculate display range - show items around current position
    // Max 5 visible items for cleaner UI
    var maxVisible = 5
    var startIndex = 0
    var endIndex = history.length - 1

    if (history.length > maxVisible) {
      // Center around current position with bias toward past
      var halfWindow = Math.floor(maxVisible / 2)
      startIndex = Math.max(0, currentIndex - halfWindow)
      endIndex = Math.min(history.length - 1, startIndex + maxVisible - 1)

      // Adjust if we hit the end
      if (endIndex === history.length - 1) {
        startIndex = Math.max(0, endIndex - maxVisible + 1)
      }
    }

    var self = this

    // Add ellipsis at start if truncated
    if (startIndex > 0) {
      var ellipsis = document.createElement('span')
      ellipsis.className = 'breadcrumb-ellipsis'
      ellipsis.textContent = '...'
      ellipsis.title = 'More history items'
      this.breadcrumbContainer.appendChild(ellipsis)
    }

    // Render breadcrumb items
    for (var i = startIndex; i <= endIndex; i++) {
      var entry = history[i]
      var isCurrent = i === currentIndex
      var isPast = i < currentIndex
      var isFuture = i > currentIndex

      // Breadcrumb item
      var item = document.createElement('span')
      item.className = 'breadcrumb-item'
      if (isCurrent) item.className += ' current'
      if (isPast) item.className += ' past'
      if (isFuture) item.className += ' future'

      item.textContent = self.getShortTitle(entry.title || entry.url)
      item.setAttribute('data-index', i)
      item.setAttribute('data-url', entry.url)

      // Click to navigate (except current)
      if (!isCurrent) {
        (function (clickIndex, url) {
          item.addEventListener('click', function () {
            self.navigateToBreadcrumb(branch.id, clickIndex, url, selectedTabId)
          })
        })(i, entry.url)
      }

      self.breadcrumbContainer.appendChild(item)

      // Add separator (except after last visible)
      if (i < endIndex) {
        var separator = document.createElement('span')
        separator.className = 'breadcrumb-separator'
        separator.textContent = '›'
        self.breadcrumbContainer.appendChild(separator)
      }
    }

    // Add ellipsis at end if truncated
    if (endIndex < history.length - 1) {
      var ellipsisEnd = document.createElement('span')
      ellipsisEnd.className = 'breadcrumb-ellipsis'
      ellipsisEnd.textContent = '...'
      ellipsisEnd.title = 'More history items'
      this.breadcrumbContainer.appendChild(ellipsisEnd)
    }
  },

  // Navigate to a breadcrumb position (preserves forward history)
  navigateToBreadcrumb: async function (branchId, index, url, tabId) {
    var bs = getBranchState()
    if (!bs) return

    // Update history index (this preserves forward history)
    var entry = await bs.navigateToHistoryIndex(branchId, index)
    if (!entry) return

    // Mark this as a breadcrumb navigation so addToHistory doesn't add a new entry
    this._isBreadcrumbNavigation = true

    // Navigate to the URL
    webviews.update(tabId, url)

    // Clear the flag after a short delay
    var self = this
    setTimeout(function () {
      self._isBreadcrumbNavigation = false
    }, 500)
  },

  // Check if current navigation is from breadcrumb click
  isBreadcrumbNavigation: function () {
    return this._isBreadcrumbNavigation === true
  },

  getShortTitle: function (title) {
    if (!title) return 'Page'
    // Remove common prefixes/suffixes and truncate
    title = title.replace(/^https?:\/\/(www\.)?/, '')
    title = title.split(' - ')[0] // Take first part before dash
    title = title.split(' | ')[0] // Take first part before pipe
    if (title.length > 20) {
      title = title.substring(0, 18) + '...'
    }
    return title
  },

  // =========================================
  // PINNED SITES
  // =========================================

  renderPinnedSites: function () {
    if (!this.pinnedContainer) return

    // Clear container
    while (this.pinnedContainer.firstChild) {
      this.pinnedContainer.removeChild(this.pinnedContainer.firstChild)
    }

    // Limit to max 6 pinned sites
    var sitesToRender = this.pinnedSites.slice(0, MAX_PINNED_SITES)
    var count = sitesToRender.length

    // Set data-count attribute for CSS grid styling
    this.pinnedContainer.setAttribute('data-count', count)

    if (count === 0) {
      return
    }

    var self = this
    sitesToRender.forEach(function (site, index) {
      var item = document.createElement('div')
      item.className = 'pinned-icon-item'
      item.title = site.title || self.getUrlDomain(site.url)

      // Favicon image or fallback
      var faviconUrl = self.getFaviconUrl(site.url)
      if (faviconUrl) {
        var img = document.createElement('img')
        img.src = faviconUrl
        img.alt = site.title || ''
        img.onerror = function () {
          // Replace with fallback on error
          item.innerHTML = ''
          var fallback = document.createElement('div')
          fallback.className = 'pinned-fallback'
          fallback.textContent = self.getFirstLetter(site.title || self.getUrlDomain(site.url))
          item.appendChild(fallback)
        }
        item.appendChild(img)
      } else {
        var fallback = document.createElement('div')
        fallback.className = 'pinned-fallback'
        fallback.textContent = self.getFirstLetter(site.title || self.getUrlDomain(site.url))
        item.appendChild(fallback)
      }

      // Click to open
      item.addEventListener('click', function () {
        self.openPinnedSite(site)
      })

      // Right-click to unpin
      item.addEventListener('contextmenu', function (e) {
        e.preventDefault()
        self.showPinnedContextMenu(site, index, e.clientX, e.clientY)
      })

      self.pinnedContainer.appendChild(item)
    })
  },

  openPinnedSite: function (site) {
    // Create new tab with pinned URL
    browserUI.addTab(null, { url: site.url })
  },

  pinBranch: function (branch) {
    // Check if already at max capacity
    if (this.pinnedSites.length >= MAX_PINNED_SITES) {
      console.log('[BranchPanel] Cannot pin - max ' + MAX_PINNED_SITES + ' sites reached')
      return
    }

    // Add to pinned sites if not already pinned
    var exists = this.pinnedSites.some(function (site) {
      return site.url === branch.url
    })

    if (!exists) {
      this.pinnedSites.push({
        url: branch.url,
        title: branch.title
      })
      this.savePinnedSites()
      this.renderPinnedSites()
    }
  },

  unpinSite: function (index) {
    this.pinnedSites.splice(index, 1)
    this.savePinnedSites()
    this.renderPinnedSites()
  },

  savePinnedSites: function () {
    try {
      localStorage.setItem('branchPanel.pinned', JSON.stringify(this.pinnedSites))
    } catch (e) {
      console.warn('[BranchPanel] Failed to save pinned sites:', e)
    }
  },

  loadPinnedSites: function () {
    try {
      var saved = localStorage.getItem('branchPanel.pinned')
      if (saved) {
        this.pinnedSites = JSON.parse(saved)
      }
    } catch (e) {
      console.warn('[BranchPanel] Failed to load pinned sites:', e)
      this.pinnedSites = []
    }
  },

  // =========================================
  // BRANCH TREE RENDERING
  // =========================================

  render: function () {
    if (!this.treeContainer) return

    var bs = getBranchState()
    var tree = bs ? bs.getTree() : []
    var selectedTabId = safeTabs() ? safeTabs().getSelected() : null

    // Preserve drop indicator before clearing
    var dropIndicator = this.dragState.dropIndicator
    var indicatorParent = dropIndicator ? dropIndicator.parentNode : null

    // Clear existing content safely
    while (this.treeContainer.firstChild) {
      this.treeContainer.removeChild(this.treeContainer.firstChild)
    }

    // Re-add drop indicator if it was in the tree
    if (dropIndicator && indicatorParent === this.treeContainer) {
      this.treeContainer.appendChild(dropIndicator)
    }

    // Render branches - but SKIP ROOT itself (it's the invisible starting point)
    // Only show ROOT's children at depth 0
    var self = this
    tree.forEach(function (rootBranch) {
      if (bs && bs.isRoot(rootBranch.id)) {
        // Skip ROOT, render its children at depth 0
        if (rootBranch.children && rootBranch.children.length > 0) {
          rootBranch.children.forEach(function (child) {
            self.renderBranch(child, 0, selectedTabId)
          })
        }
      } else {
        // Orphan branch (shouldn't happen after cleanup)
        self.renderBranch(rootBranch, 0, selectedTabId)
      }
    })

    // Update status
    this.updateStatus()
  },

  renderBranch: function (branch, depth, selectedTabId) {
    var self = this
    var isActive = branch.tabId === selectedTabId
    var hasChildren = branch.children && branch.children.length > 0
    var isCollapsed = this.collapsedBranches.has(branch.id)

    // Get actual tab data for live title/url (safeTabs may be null during init)
    var tab = (branch.tabId && safeTabs()) ? safeTabs().get(branch.tabId) : null
    var displayTitle = (tab && tab.title) || branch.title || this.getUrlDomain(branch.url) || 'New Tab'
    var displayUrl = (tab && tab.url) || branch.url || ''

    // Create branch item element
    // Note: ROOT is never rendered, so no need for is-root class
    var item = document.createElement('div')
    item.className = 'branch-item' + (isActive ? ' active' : '')
    item.setAttribute('data-depth', Math.min(depth, 5))
    item.setAttribute('data-branch-id', branch.id)

    // Toggle button (collapse/expand)
    var toggle = document.createElement('span')
    toggle.className = 'branch-toggle'
    if (hasChildren) {
      toggle.className += isCollapsed ? ' collapsed has-children' : ' expanded has-children'
      toggle.addEventListener('click', function (e) {
        e.stopPropagation()
        self.toggleCollapse(branch.id)
      })
    } else {
      toggle.className += ' no-children'
    }
    item.appendChild(toggle)

    // Favicon
    var favicon = document.createElement('span')
    favicon.className = 'branch-favicon'
    var faviconUrl = this.getFaviconUrl(displayUrl)
    if (faviconUrl) {
      var faviconImg = document.createElement('img')
      faviconImg.src = faviconUrl
      faviconImg.onerror = function () {
        favicon.innerHTML = '<span class="fallback-icon">' + self.getFirstLetter(displayTitle) + '</span>'
      }
      favicon.appendChild(faviconImg)
    } else {
      favicon.innerHTML = '<span class="fallback-icon">' + this.getFirstLetter(displayTitle) + '</span>'
    }
    item.appendChild(favicon)

    // Content wrapper (title + source)
    var content = document.createElement('div')
    content.className = 'branch-content'

    // Title
    var titleEl = document.createElement('span')
    titleEl.className = 'branch-title'
    titleEl.textContent = displayTitle
    content.appendChild(titleEl)

    // Source label (domain) - only show if different from title
    var sourceLabel = this.getSourceLabel(displayUrl)
    if (sourceLabel && sourceLabel !== displayTitle) {
      var source = document.createElement('span')
      source.className = 'branch-source'
      source.textContent = sourceLabel
      content.appendChild(source)
    }

    item.appendChild(content)

    // Close button (appears on hover)
    // Note: ROOT is never rendered, so all branches here can be closed
    var closeBtn = document.createElement('button')
    closeBtn.className = 'branch-close-btn'
    closeBtn.innerHTML = '×'
    closeBtn.title = 'Close'
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      self.closeBranch(branch)
    })
    item.appendChild(closeBtn)

    // Click to switch tab
    item.addEventListener('click', function (e) {
      console.log('[BranchPanel] Branch item click event fired for:', branch.id, branch.title)
      e.stopPropagation()
      self.handleBranchClick(branch)
    })

    // Right-click context menu
    item.addEventListener('contextmenu', function (e) {
      e.preventDefault()
      self.showContextMenu(branch, e.clientX, e.clientY)
    })

    // Attach drag & drop handlers
    this.attachDragHandlers(item, branch.id)

    this.treeContainer.appendChild(item)

    // Render children if not collapsed
    if (hasChildren && !isCollapsed) {
      branch.children.forEach(function (child) {
        self.renderBranch(child, depth + 1, selectedTabId)
      })
    }
  },

  handleBranchClick: function (branch) {
    console.log('[BranchPanel] Branch clicked:', branch)

    var tabId = branch.tabId

    // Check if the tab actually exists
    var tabExists = tabId && tabs.get(tabId)
    console.log('[BranchPanel] Tab exists:', tabExists, 'tabId:', tabId)

    if (tabExists) {
      // Ensure tabId is a string (not an object)
      if (typeof tabId !== 'string') {
        console.warn('[BranchPanel] tabId is not a string:', typeof tabId, tabId)
        if (tabId && tabId.id) {
          tabId = tabId.id
        }
      }

      console.log('[BranchPanel] Switching to existing tab:', tabId)
      try {
        browserUI.switchToTab(tabId)
        console.log('[BranchPanel] switchToTab succeeded')
      } catch (e) {
        console.error('[BranchPanel] switchToTab failed:', e)
      }
    } else {
      // Tab doesn't exist - navigate to branch URL instead
      console.log('[BranchPanel] Tab not found, navigating to URL:', branch.url)
      if (branch.url) {
        this.navigateToUrl(branch.url)
      } else {
        console.warn('[BranchPanel] Branch has no URL to navigate to')
      }
    }
  },

  toggleCollapse: function (branchId) {
    if (this.collapsedBranches.has(branchId)) {
      this.collapsedBranches.delete(branchId)
    } else {
      this.collapsedBranches.add(branchId)
    }
    this.saveCollapsedState()
    this.render()
  },

  updateActiveIndicator: function () {
    var selectedTabId = safeTabs() ? safeTabs().getSelected() : null
    var items = this.treeContainer.querySelectorAll('.branch-item')
    var bs = getBranchState()

    items.forEach(function (item) {
      var branchId = item.getAttribute('data-branch-id')
      var branch = bs ? bs.get(branchId) : null
      var isActive = branch && branch.tabId === selectedTabId

      item.classList.toggle('active', isActive)
      var indicator = item.querySelector('.branch-indicator')
      if (indicator) {
        indicator.classList.toggle('active', isActive)
      }
    })
  },

  updateStatus: function () {
    if (!this.statusContainer) return

    var bs = getBranchState()
    var count = bs ? bs.count() : 0
    // Don't count ROOT in the display - it's invisible
    if (bs && bs.getRoot()) {
      count = Math.max(0, count - 1)
    }
    this.statusContainer.textContent = count + ' branch' + (count !== 1 ? 'es' : '')
  },

  // =========================================
  // CONTEXT MENU
  // =========================================

  showContextMenu: function (branch, x, y) {
    this.closeContextMenu()

    var self = this
    var menu = document.createElement('div')
    menu.className = 'branch-context-menu'

    // Check if already pinned or at max capacity
    var isAlreadyPinned = this.pinnedSites.some(function (site) {
      return site.url === branch.url
    })
    var atMaxCapacity = this.pinnedSites.length >= MAX_PINNED_SITES

    // Pin option
    var pinItem = document.createElement('div')
    pinItem.className = 'branch-context-menu-item'
    if (isAlreadyPinned) {
      pinItem.innerHTML = '<i class="i carbon:pin-filled"></i> Already Pinned'
      pinItem.style.opacity = '0.5'
      pinItem.style.cursor = 'default'
    } else if (atMaxCapacity) {
      pinItem.innerHTML = '<i class="i carbon:pin"></i> Max Pins Reached'
      pinItem.style.opacity = '0.5'
      pinItem.style.cursor = 'default'
    } else {
      pinItem.innerHTML = '<i class="i carbon:pin"></i> Pin to Sidebar'
      pinItem.addEventListener('click', function () {
        self.pinBranch(branch)
        self.closeContextMenu()
      })
    }
    menu.appendChild(pinItem)

    // Separator
    var sep1 = document.createElement('div')
    sep1.className = 'branch-context-menu-separator'
    menu.appendChild(sep1)

    // Close branch (but not ROOT)
    var bs = getBranchState()
    if (!bs || !bs.isRoot(branch.id)) {
      var closeItem = document.createElement('div')
      closeItem.className = 'branch-context-menu-item'
      closeItem.innerHTML = '<i class="i carbon:close"></i> Close Branch'
      closeItem.addEventListener('click', function () {
        browserUI.closeTab(branch.tabId)
        self.closeContextMenu()
      })
      menu.appendChild(closeItem)
    }

    // Close children (if has children)
    var hasChildren = branch.children && branch.children.length > 0
    if (hasChildren) {
      var closeChildrenItem = document.createElement('div')
      closeChildrenItem.className = 'branch-context-menu-item'
      closeChildrenItem.innerHTML = '<i class="i carbon:close-outline"></i> Close All Children'
      closeChildrenItem.addEventListener('click', function () {
        self.closeChildren(branch)
        self.closeContextMenu()
      })
      menu.appendChild(closeChildrenItem)
    }

    // Position and show
    menu.style.left = x + 'px'
    menu.style.top = y + 'px'
    document.body.appendChild(menu)
    this.contextMenu = menu

    // Adjust if off screen
    var rect = menu.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      menu.style.left = (x - rect.width) + 'px'
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (y - rect.height) + 'px'
    }
  },

  showPinnedContextMenu: function (site, index, x, y) {
    this.closeContextMenu()

    var self = this
    var menu = document.createElement('div')
    menu.className = 'branch-context-menu'

    // Unpin option
    var unpinItem = document.createElement('div')
    unpinItem.className = 'branch-context-menu-item'
    unpinItem.innerHTML = '<i class="i carbon:pin-filled"></i> Unpin'
    unpinItem.addEventListener('click', function () {
      self.unpinSite(index)
      self.closeContextMenu()
    })
    menu.appendChild(unpinItem)

    // Position and show
    menu.style.left = x + 'px'
    menu.style.top = y + 'px'
    document.body.appendChild(menu)
    this.contextMenu = menu
  },

  closeContextMenu: function () {
    if (this.contextMenu && this.contextMenu.parentNode) {
      this.contextMenu.parentNode.removeChild(this.contextMenu)
    }
    this.contextMenu = null
  },

  closeChildren: function (branch) {
    var self = this
    if (branch.children && branch.children.length > 0) {
      branch.children.forEach(function (child) {
        self.closeChildren(child) // Recursive
        browserUI.closeTab(child.tabId)
      })
    }
  },

  closeBranch: function (branch) {
    // Prevent closing ROOT branch
    var bs = getBranchState()
    if (bs && bs.isRoot(branch.id)) {
      console.log('[BranchPanel] Cannot close ROOT branch')
      return
    }

    console.log('[BranchPanel] Closing branch:', branch.id)

    // Close children first
    this.closeChildren(branch)

    // Close the tab if it exists
    if (branch.tabId && tabs.get(branch.tabId)) {
      browserUI.closeTab(branch.tabId)
    } else {
      // Tab doesn't exist, just remove the branch from state
      if (bs) bs.destroy(branch.id)
      this.render()
    }
  },

  clearStaleBranches: function () {
    console.log('[BranchPanel] Clearing stale branches')
    var bs = getBranchState()
    if (!bs) {
      console.warn('[BranchPanel] branchState not available, skipping cleanup')
      return
    }

    var allBranches = bs.getAll()
    var root = bs.getRoot()
    var rootBranchId = bs.getRootBranchId()
    var staleCount = 0
    var reparentedCount = 0

    allBranches.forEach(function (branch) {
      // Skip the ROOT branch - never delete it
      if (bs.isRoot(branch.id)) {
        return
      }

      // Branch is stale if its tab doesn't exist
      // (Only check if safeTabs is available; skip cleanup during initialization)
      if (safeTabs() && (!branch.tabId || !safeTabs().get(branch.tabId))) {
        bs.destroy(branch.id)
        staleCount++
        return
      }

      // Re-parent orphan branches to ROOT
      // (Branches that have no parentId but aren't ROOT)
      if (!branch.parentId && root) {
        console.log('[BranchPanel] Re-parenting orphan branch', branch.id, 'to ROOT')
        bs.update(branch.id, { parentId: rootBranchId })
        reparentedCount++
      }
    })

    console.log('[BranchPanel] Cleared', staleCount, 'stale branches, re-parented', reparentedCount, 'orphans')
    this.render()
  },

  // =========================================
  // UTILITIES
  // =========================================

  getUrlDomain: function (url) {
    if (!url) return ''
    try {
      var urlObj = new URL(url)
      return urlObj.hostname.replace('www.', '')
    } catch (e) {
      return url
    }
  },

  getFaviconUrl: function (url) {
    if (!url || url === 'about:blank' || url.startsWith('min:')) return null
    try {
      var urlObj = new URL(url)
      // Use Google's favicon service for reliable favicons
      return 'https://www.google.com/s2/favicons?domain=' + urlObj.hostname + '&sz=32'
    } catch (e) {
      return null
    }
  },

  getFirstLetter: function (text) {
    if (!text) return '?'
    // Get first letter of title or domain
    var letter = text.charAt(0).toUpperCase()
    if (letter.match(/[A-Z0-9]/)) return letter
    return '●'
  },

  getSourceLabel: function (url) {
    if (!url || url === 'about:blank') return ''
    if (url.startsWith('min:')) return 'Min Browser'

    try {
      var urlObj = new URL(url)
      var host = urlObj.hostname.replace('www.', '')

      // Friendly names for common sites
      var friendlyNames = {
        'google.com': 'Google Search',
        'google.co.uk': 'Google Search',
        'wikipedia.org': 'Wikipedia',
        'en.wikipedia.org': 'Wikipedia',
        'github.com': 'GitHub',
        'youtube.com': 'YouTube',
        'twitter.com': 'Twitter',
        'x.com': 'X',
        'reddit.com': 'Reddit',
        'stackoverflow.com': 'Stack Overflow',
        'amazon.com': 'Amazon',
        'facebook.com': 'Facebook',
        'linkedin.com': 'LinkedIn',
        'medium.com': 'Medium',
        'notion.so': 'Notion',
        'docs.google.com': 'Google Docs',
        'drive.google.com': 'Google Drive',
        'mail.google.com': 'Gmail',
        'airbnb.com': 'Airbnb'
      }

      return friendlyNames[host] || this.capitalizeHost(host)
    } catch (e) {
      return ''
    }
  },

  capitalizeHost: function (host) {
    // Convert "example.com" to "Example"
    var parts = host.split('.')
    if (parts.length >= 2) {
      var name = parts[parts.length - 2] // Get main domain name
      return name.charAt(0).toUpperCase() + name.slice(1)
    }
    return host
  },

  saveCollapsedState: function () {
    try {
      localStorage.setItem('branchPanel.collapsed', JSON.stringify([...this.collapsedBranches]))
    } catch (e) {
      console.warn('[BranchPanel] Failed to save collapsed state:', e)
    }
  },

  loadCollapsedState: function () {
    try {
      var saved = localStorage.getItem('branchPanel.collapsed')
      if (saved) {
        this.collapsedBranches = new Set(JSON.parse(saved))
      }
    } catch (e) {
      console.warn('[BranchPanel] Failed to load collapsed state:', e)
    }
  },

  // Manual refresh (can be called from branchEvents)
  refresh: function () {
    this.render()
    this.updateBreadcrumbs()
  }
}

module.exports = branchPanel
