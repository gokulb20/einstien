// Branch Browser: Event listeners for tab lifecycle
// Connects Min's tab system to branch state management

var branchState = null
var branchPanel = null

// Lazy load branchPanel module
function getBranchPanel () {
  if (branchPanel) return branchPanel
  try {
    branchPanel = require('branches/branchPanel.js')
    return branchPanel
  } catch (e) {
    // May not be available during early initialization
    return null
  }
}

// Lazy load branchState module
function getBranchState () {
  if (branchState) return branchState
  try {
    branchState = require('branches/branchState.js')
    return branchState
  } catch (e) {
    console.error('[BranchEvents] Failed to load branchState:', e)
    return null
  }
}

// Initialize branch tracking
async function initialize () {
  console.log('[BranchEvents] Initializing...')

  var bs = getBranchState()
  if (!bs) {
    console.error('[BranchEvents] branchState not available, aborting initialization')
    return
  }

  // Load existing branches from IndexedDB
  await bs.loadFromDB()

  // Listen to tab lifecycle events
  setupEventListeners()

  // Create branches for any existing tabs that don't have them
  await ensureAllTabsHaveBranches()

  console.log('[BranchEvents] Initialized with', bs.count(), 'branches')
}

function setupEventListeners () {
  // Tab added - handle ROOT and child branches
  tasks.on('tab-added', async function (tabId, tabData, options, taskId) {
    var bs = getBranchState()
    if (!bs) return

    // Skip if already has branch
    if (tabData.branchId) {
      console.log('[BranchEvents] Tab', tabId, 'already has branch:', tabData.branchId)
      return
    }

    var root = bs.getRoot()
    var rootBranchId = bs.getRootBranchId()

    // CASE 1: No ROOT exists yet - first tab becomes ROOT
    if (!root) {
      console.log('[BranchEvents] Creating ROOT for first tab', tabId)
      await bs.ensureRoot(tabId)
      var task = tasks.get(taskId)
      if (task && task.tabs.has(tabId)) {
        task.tabs.update(tabId, { branchId: rootBranchId, parentBranchId: null })
      }
      return
    }

    // CASE 2: ROOT exists but its tab is gone (tab was closed, Min auto-created new)
    // Reuse ROOT for this new tab instead of creating a child
    var rootTabExists = false
    tasks.forEach(function (task) {
      if (task.tabs.has(root.tabId)) {
        rootTabExists = true
      }
    })

    if (!rootTabExists) {
      console.log('[BranchEvents] ROOT tab gone, reusing ROOT for tab', tabId)
      await bs.update(rootBranchId, { tabId: tabId })
      var task = tasks.get(taskId)
      if (task && task.tabs.has(tabId)) {
        task.tabs.update(tabId, { branchId: rootBranchId, parentBranchId: null })
      }
      return
    }

    // CASE 3: ROOT exists and has valid tab - create child branch
    // Use parentBranchId from tabData if available (passed from browserUI.js for link clicks)
    // Otherwise fall back to ROOT as parent
    var parentId = tabData.parentBranchId || rootBranchId
    console.log('[BranchEvents] Creating child branch for tab', tabId, 'parent:', parentId)
    var branchId = await bs.create(
      tabId,
      parentId,
      tabData.url || '',
      tabData.title || ''
    )

    var task = tasks.get(taskId)
    if (task && task.tabs.has(tabId)) {
      task.tabs.update(tabId, { branchId: branchId, parentBranchId: parentId })
    }
  })

  // Tab destroyed - destroy branch and children (but never ROOT)
  tasks.on('tab-destroyed', async function (tabId, taskId) {
    var bs = getBranchState()
    if (!bs) return

    var branch = bs.getByTabId(tabId)
    if (branch) {
      // Never destroy ROOT branch
      if (bs.isRoot(branch.id)) {
        console.log('[BranchEvents] Cannot destroy ROOT branch, keeping it')
        return
      }
      // Destroy branch and all its children
      await bs.destroyWithChildren(branch.id)
      console.log('[BranchEvents] Destroyed branch', branch.id, 'for tab', tabId)
    }
  })

  // Tab updated - sync URL and title to branch, track navigation history
  tasks.on('tab-updated', async function (tabId, key, value, taskId) {
    var bs = getBranchState()
    if (!bs) return

    var branch = bs.getByTabId(tabId)
    if (!branch) return

    if (key === 'url') {
      // Get current tab to fetch title
      var task = tasks.get(taskId)
      var tab = task ? task.tabs.get(tabId) : null
      var title = tab ? tab.title : ''

      // Check if this is a breadcrumb navigation (position change, not new entry)
      var bp = getBranchPanel()
      var isBreadcrumbNav = bp && bp.isBreadcrumbNavigation && bp.isBreadcrumbNavigation()

      // Clear the token immediately after checking
      if (isBreadcrumbNav && bp.clearBreadcrumbNavigation) {
        bp.clearBreadcrumbNavigation()
      }

      // Add to navigation history (shows Home > Google > Search in breadcrumb)
      // If breadcrumb navigation, this will be skipped (position already updated)
      await bs.addToHistory(branch.id, value, title, { isBreadcrumbNav: isBreadcrumbNav })
    } else if (key === 'title') {
      // Update title in branch and in latest history entry
      await bs.update(branch.id, { title: value })

      // Also update the title in the last history entry if URL matches
      var history = branch.history || []
      var lastEntry = history[history.length - 1]
      if (lastEntry && lastEntry.url === branch.url && !lastEntry.title) {
        lastEntry.title = value
        await bs.update(branch.id, { history: history })
      }
    }
  })

  // Tab selected - update lastActiveAt
  tasks.on('tab-selected', async function (tabId, taskId) {
    var bs = getBranchState()
    if (!bs) return

    var branch = bs.getByTabId(tabId)
    if (branch) {
      await bs.update(branch.id, { lastActiveAt: Date.now() })
    }
  })
}

// Ensure all existing tabs have branches (for migration)
async function ensureAllTabsHaveBranches () {
  var bs = getBranchState()
  if (!bs) return

  var root = bs.getRoot()
  var rootBranchId = bs.getRootBranchId()
  var isFirstTab = true

  tasks.forEach(function (task) {
    task.tabs.forEach(async function (tab) {
      if (!tab.branchId) {
        // Tab exists but has no branch
        if (!root && isFirstTab) {
          // First orphan tab becomes ROOT
          isFirstTab = false
          var branchId = await bs.ensureRoot(tab.id)
          task.tabs.update(tab.id, {
            branchId: branchId,
            parentBranchId: null
          }, false)
          root = bs.getRoot()  // Update reference
          console.log('[BranchEvents] Migration: Tab', tab.id, 'became ROOT')
        } else {
          // Other tabs become children of ROOT
          var branchId = await bs.create(tab.id, rootBranchId, tab.url || '', tab.title || '')
          task.tabs.update(tab.id, {
            branchId: branchId,
            parentBranchId: rootBranchId
          }, false)
          console.log('[BranchEvents] Migration: Created child branch', branchId, 'for tab', tab.id)
        }
      }
    })
  })
}

// Debug: Print branch tree to console
function debugPrintTree () {
  var bs = getBranchState()
  if (!bs) {
    console.log('[BranchEvents] branchState not available')
    return
  }

  var tree = bs.getTree()
  console.log('[BranchEvents] Branch Tree:')

  function printNode (node, indent) {
    var state = node.state === 'sleeping' ? ' [sleeping]' : ''
    console.log(indent + '- ' + (node.title || node.url || '(empty)') + ' (' + node.id + ')' + state)
    node.children.forEach(function (child) {
      printNode(child, indent + '  ')
    })
  }

  tree.forEach(function (root) {
    printNode(root, '')
  })
}

// Expose for debugging in console
if (typeof window !== 'undefined') {
  window.getBranchState = getBranchState
  window.debugBranchTree = debugPrintTree
}

module.exports = {
  initialize,
  debugPrintTree
}
