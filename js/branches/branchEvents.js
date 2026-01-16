// Branch Browser: Event listeners for tab lifecycle
// Connects Min's tab system to branch state management

var branchState = require('branches/branchState.js')

// Initialize branch tracking
async function initialize () {
  console.log('[BranchEvents] Initializing...')

  // Load existing branches from IndexedDB
  await branchState.loadFromDB()

  // Listen to tab lifecycle events
  setupEventListeners()

  // Create branches for any existing tabs that don't have them
  await ensureAllTabsHaveBranches()

  console.log('[BranchEvents] Initialized with', branchState.count(), 'branches')
}

function setupEventListeners () {
  // Tab added - handle ROOT and child branches
  tasks.on('tab-added', async function (tabId, tabData, options, taskId) {
    // Skip if already has branch
    if (tabData.branchId) {
      console.log('[BranchEvents] Tab', tabId, 'already has branch:', tabData.branchId)
      return
    }

    var root = branchState.getRoot()
    var rootBranchId = branchState.getRootBranchId()

    // CASE 1: No ROOT exists yet - first tab becomes ROOT
    if (!root) {
      console.log('[BranchEvents] Creating ROOT for first tab', tabId)
      await branchState.ensureRoot(tabId)
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
      await branchState.update(rootBranchId, { tabId: tabId })
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
    var branchId = await branchState.create(
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
    var branch = branchState.getByTabId(tabId)
    if (branch) {
      // Never destroy ROOT branch
      if (branchState.isRoot(branch.id)) {
        console.log('[BranchEvents] Cannot destroy ROOT branch, keeping it')
        return
      }
      // Destroy branch and all its children
      await branchState.destroyWithChildren(branch.id)
      console.log('[BranchEvents] Destroyed branch', branch.id, 'for tab', tabId)
    }
  })

  // Tab updated - sync URL and title to branch, track navigation history
  tasks.on('tab-updated', async function (tabId, key, value, taskId) {
    var branch = branchState.getByTabId(tabId)
    if (!branch) return

    if (key === 'url') {
      // Get current tab to fetch title
      var task = tasks.get(taskId)
      var tab = task ? task.tabs.get(tabId) : null
      var title = tab ? tab.title : ''

      // Add to navigation history (shows Home > Google > Search in breadcrumb)
      await branchState.addToHistory(branch.id, value, title)
    } else if (key === 'title') {
      // Update title in branch and in latest history entry
      await branchState.update(branch.id, { title: value })

      // Also update the title in the last history entry if URL matches
      var history = branch.history || []
      var lastEntry = history[history.length - 1]
      if (lastEntry && lastEntry.url === branch.url && !lastEntry.title) {
        lastEntry.title = value
        await branchState.update(branch.id, { history: history })
      }
    }
  })

  // Tab selected - update lastActiveAt
  tasks.on('tab-selected', async function (tabId, taskId) {
    var branch = branchState.getByTabId(tabId)
    if (branch) {
      await branchState.update(branch.id, { lastActiveAt: Date.now() })
    }
  })
}

// Ensure all existing tabs have branches (for migration)
async function ensureAllTabsHaveBranches () {
  var root = branchState.getRoot()
  var rootBranchId = branchState.getRootBranchId()
  var isFirstTab = true

  tasks.forEach(function (task) {
    task.tabs.forEach(async function (tab) {
      if (!tab.branchId) {
        // Tab exists but has no branch
        if (!root && isFirstTab) {
          // First orphan tab becomes ROOT
          isFirstTab = false
          var branchId = await branchState.ensureRoot(tab.id)
          task.tabs.update(tab.id, {
            branchId: branchId,
            parentBranchId: null
          }, false)
          root = branchState.getRoot()  // Update reference
          console.log('[BranchEvents] Migration: Tab', tab.id, 'became ROOT')
        } else {
          // Other tabs become children of ROOT
          var branchId = await branchState.create(tab.id, rootBranchId, tab.url || '', tab.title || '')
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
  var tree = branchState.getTree()
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
  window.branchState = branchState
  window.debugBranchTree = debugPrintTree
}

module.exports = {
  initialize,
  debugPrintTree
}
