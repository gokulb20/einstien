// Branch state management for Branch Browser
// Handles CRUD operations and IndexedDB persistence

var database = null
var db = null
var dbReady = null

// Lazy load database to avoid crashing if it fails
function getDb () {
  if (db) return db
  try {
    database = require('util/database.js')
    db = database.db
    dbReady = database.dbReady
    return db
  } catch (e) {
    console.warn('[BranchState] Failed to load database:', e.message)
    return null
  }
}

// Check if database is ready for operations
function isDbReady () {
  return db !== null && dbReady !== null
}

// ROOT branch constants - the permanent home base
// ROOT is a blank starting point - the search bar is the interface
var ROOT_URL = ''
var ROOT_BRANCH_ID = 'br_root'

// In-memory cache of branches for fast access
var branches = {}

// Generate unique branch ID
function generateBranchId () {
  return 'br_' + Math.random().toString(36).substring(2, 15)
}

// Create a new branch
async function create (tabId, parentId, url, title) {
  var branchId = generateBranchId()
  var now = Date.now()

  // Initialize history with first URL if provided
  var initialHistory = []
  if (url) {
    initialHistory.push({ url: url, title: title || '', timestamp: now })
  }

  var branch = {
    id: branchId,
    tabId: tabId,
    parentId: parentId || null,
    url: url || '',
    title: title || '',
    history: initialHistory,  // Navigation history within this branch
    historyIndex: initialHistory.length > 0 ? 0 : -1,  // Current position in history (-1 = no history)
    createdAt: now,
    lastActiveAt: now,
    state: 'awake'
  }

  // Store in memory
  branches[branchId] = branch

  // Persist to IndexedDB (if available)
  var database = getDb()
  if (database) {
    try {
      await database.branches.put(branch)
      console.log('[Branch] Created:', branchId, parentId ? `(child of ${parentId})` : '(root)')
    } catch (e) {
      console.error('[Branch] Failed to persist:', e)
    }
  } else {
    console.log('[Branch] Created (memory only):', branchId)
  }

  return branchId
}

// Get a branch by ID
function get (branchId) {
  return branches[branchId] || null
}

// Get branch by tab ID
function getByTabId (tabId) {
  for (var id in branches) {
    if (branches[id].tabId === tabId) {
      return branches[id]
    }
  }
  return null
}

// Update branch properties
async function update (branchId, data) {
  if (!branches[branchId]) {
    console.warn('[Branch] Cannot update non-existent branch:', branchId)
    return false
  }

  // Update in memory
  Object.assign(branches[branchId], data)

  // Persist to IndexedDB (if available)
  var database = getDb()
  if (database) {
    try {
      await database.branches.put(branches[branchId])
    } catch (e) {
      console.error('[Branch] Failed to update:', e)
    }
  }

  return true
}

// Add a URL to the branch's navigation history
// Implements smart branching: if not at end of history, truncates forward entries
async function addToHistory (branchId, url, title, options) {
  if (!branches[branchId]) return false
  if (!url) return false

  var branch = branches[branchId]
  var history = branch.history || []
  var historyIndex = branch.historyIndex !== undefined ? branch.historyIndex : Math.max(0, history.length - 1)

  // Check if this is a breadcrumb navigation (position change, not new entry)
  if (options && options.isBreadcrumbNav) {
    return false  // Don't add entry for breadcrumb navigation
  }

  // Check if same as current entry (avoid duplicates from page refreshes)
  var currentEntry = history[historyIndex]
  if (currentEntry && currentEntry.url === url) {
    // Just update title if it changed
    if (title && currentEntry.title !== title) {
      currentEntry.title = title
      await update(branchId, { history: history })
    }
    return false
  }

  // Smart branching: if not at end of history, truncate forward entries
  // This happens when user navigates back then goes to a new page
  if (historyIndex < history.length - 1) {
    // Truncate: remove all entries after current position
    history = history.slice(0, historyIndex + 1)
    console.log('[Branch] Truncated forward history at index', historyIndex)
  }

  // Add new history entry
  history.push({
    url: url,
    title: title || '',
    timestamp: Date.now()
  })

  // Update index to point to new entry
  var newIndex = history.length - 1

  // Keep last 50 entries max to avoid memory bloat
  if (history.length > 50) {
    var trimCount = history.length - 50
    history = history.slice(-50)
    newIndex = Math.max(0, newIndex - trimCount)
  }

  await update(branchId, {
    history: history,
    historyIndex: newIndex,
    url: url,
    title: title || branch.title
  })
  return true
}

// Navigate to a specific history index (for breadcrumb clicks)
// This moves the cursor without truncating forward history
async function navigateToHistoryIndex (branchId, index) {
  if (!branches[branchId]) return null

  var branch = branches[branchId]
  var history = branch.history || []

  // Validate index
  if (index < 0 || index >= history.length) {
    console.warn('[Branch] Invalid history index:', index, 'max:', history.length - 1)
    return null
  }

  // Update the history index
  await update(branchId, { historyIndex: index })

  // Return the entry at this index so caller can navigate to it
  return history[index]
}

// Get current history index for a branch
function getHistoryIndex (branchId) {
  if (!branches[branchId]) return -1
  var branch = branches[branchId]
  var historyIndex = branch.historyIndex

  // Handle legacy branches without historyIndex
  if (historyIndex === undefined || historyIndex === null) {
    var history = branch.history || []
    return history.length - 1
  }

  return historyIndex
}

// Get history with current position info
function getHistoryWithPosition (branchId) {
  if (!branches[branchId]) return { history: [], currentIndex: -1 }

  var branch = branches[branchId]
  var history = branch.history || []
  var currentIndex = branch.historyIndex

  // Handle legacy branches
  if (currentIndex === undefined || currentIndex === null) {
    currentIndex = history.length - 1
  }

  return {
    history: history,
    currentIndex: currentIndex
  }
}

// Destroy a single branch (but never ROOT)
async function destroy (branchId) {
  if (!branches[branchId]) {
    return false
  }

  // Never destroy ROOT branch
  if (branchId === ROOT_BRANCH_ID) {
    console.log('[Branch] Cannot destroy ROOT branch')
    return false
  }

  console.log('[Branch] Destroying:', branchId)

  // Remove from IndexedDB (if available)
  var database = getDb()
  if (database) {
    try {
      await database.branches.delete(branchId)
    } catch (e) {
      console.error('[Branch] Failed to delete:', e)
    }
  }

  // Remove from memory
  delete branches[branchId]

  return true
}

// Get all children of a branch
function getChildren (branchId) {
  var children = []
  for (var id in branches) {
    if (branches[id].parentId === branchId) {
      children.push(branches[id])
    }
  }
  return children
}

// Get all descendants of a branch (recursive)
function getDescendants (branchId) {
  var descendants = []
  var children = getChildren(branchId)

  children.forEach(function (child) {
    descendants.push(child)
    descendants = descendants.concat(getDescendants(child.id))
  })

  return descendants
}

// Get ancestors (path to root)
function getAncestors (branchId) {
  var ancestors = []
  var branch = branches[branchId]

  while (branch && branch.parentId) {
    var parent = branches[branch.parentId]
    if (parent) {
      ancestors.push(parent)
      branch = parent
    } else {
      break
    }
  }

  return ancestors
}

// Destroy a branch and all its children
async function destroyWithChildren (branchId) {
  var descendants = getDescendants(branchId)

  // Destroy children first (bottom-up)
  for (var i = descendants.length - 1; i >= 0; i--) {
    await destroy(descendants[i].id)
  }

  // Destroy the branch itself
  await destroy(branchId)

  return true
}

// Get all root branches (no parent)
function getRoots () {
  var roots = []
  for (var id in branches) {
    if (!branches[id].parentId) {
      roots.push(branches[id])
    }
  }
  return roots
}

// Get all branches
function getAll () {
  return Object.values(branches)
}

// Get branch count
function count () {
  return Object.keys(branches).length
}

// Load branches from IndexedDB on startup
async function loadFromDB () {
  var database = getDb()
  if (!database) {
    console.warn('[Branch] Database not available, skipping load')
    return
  }

  try {
    var storedBranches = await database.branches.toArray()
    storedBranches.forEach(function (branch) {
      // Trim bloated history arrays before storing in memory
      if (branch.history && branch.history.length > 50) {
        var trimCount = branch.history.length - 50
        branch.history = branch.history.slice(-50)
        
        // Adjust historyIndex if out of bounds after trimming
        if (branch.historyIndex !== undefined && branch.historyIndex !== null) {
          branch.historyIndex = Math.max(0, branch.historyIndex - trimCount)
        }
      }
      
      branches[branch.id] = branch
    })
    console.log('[Branch] Loaded', storedBranches.length, 'branches from database')
  } catch (e) {
    console.error('[Branch] Failed to load from database:', e)
  }
}

// Clear all branches (for debugging)
async function clearAll () {
  var database = getDb()
  if (database) {
    try {
      await database.branches.clear()
      console.log('[Branch] Cleared all branches from database')
    } catch (e) {
      console.error('[Branch] Failed to clear database:', e)
    }
  }
  branches = {}
  console.log('[Branch] Cleared all branches from memory')
}

// Build tree structure for UI
function getTree () {
  var roots = getRoots()

  function buildNode (branch) {
    return {
      ...branch,
      children: getChildren(branch.id).map(buildNode)
    }
  }

  return roots.map(buildNode)
}

// =========================================
// ROOT BRANCH FUNCTIONS
// =========================================

// Get the root branch (the permanent home base)
function getRoot () {
  return branches[ROOT_BRANCH_ID] || null
}

// Check if a branch is the root
function isRoot (branchId) {
  return branchId === ROOT_BRANCH_ID
}

// Ensure root branch exists - creates it if missing
async function ensureRoot (tabId) {
  // If ROOT already exists, just return it
  if (branches[ROOT_BRANCH_ID]) {
    // Update tabId if different (e.g., tab was recreated)
    if (tabId && branches[ROOT_BRANCH_ID].tabId !== tabId) {
      await update(ROOT_BRANCH_ID, { tabId: tabId })
    }
    return ROOT_BRANCH_ID
  }

  // Create the ROOT branch
  var now = Date.now()
  var root = {
    id: ROOT_BRANCH_ID,
    tabId: tabId,
    parentId: null,
    url: ROOT_URL,
    title: 'Home',
    createdAt: now,
    lastActiveAt: now,
    state: 'awake',
    isRoot: true
  }

  branches[ROOT_BRANCH_ID] = root

  // Persist to IndexedDB (if available)
  var database = getDb()
  if (database) {
    try {
      await database.branches.put(root)
      console.log('[Branch] Created ROOT branch')
    } catch (e) {
      console.error('[Branch] Failed to persist ROOT:', e)
    }
  } else {
    console.log('[Branch] Created ROOT branch (memory only)')
  }

  return ROOT_BRANCH_ID
}

// Get ROOT constants (for external access)
function getRootUrl () {
  return ROOT_URL
}

function getRootBranchId () {
  return ROOT_BRANCH_ID
}

module.exports = {
  create,
  get,
  getByTabId,
  update,
  destroy,
  addToHistory,  // Navigation history tracking
  navigateToHistoryIndex,  // Breadcrumb navigation (preserves forward history)
  getHistoryIndex,  // Get current position in history
  getHistoryWithPosition,  // Get history array with current index
  getChildren,
  getDescendants,
  getAncestors,
  destroyWithChildren,
  getRoots,
  getAll,
  count,
  loadFromDB,
  clearAll,
  getTree,
  generateBranchId,
  // ROOT functions
  getRoot,
  isRoot,
  ensureRoot,
  getRootUrl,
  getRootBranchId
}
