# White Screen Bug - Debug Notes (Jan 16, 2025)

## Problem Summary
Branch Browser shows a white screen in the main content area. The sidebar displays correctly ("No branches yet", "0 branches") but no webview content is visible.

## Root Cause Analysis

### The Core Issue
**No tabs are being created.** Session restore runs but fails silently, so no webview is ever created. The white screen is simply the absence of any webview content.

Console evidence:
```
[WEBVIEWS] resize() called, selectedId: null bounds: {"x":0,"y":36,"width":1470,"height":802}
```
- `selectedId: null` - no tab exists
- `x: 0` - sidebar margin (should be 260) not being applied
- No `[WEBVIEWS] Creating view for tab:` log ever appears

### JavaScript Error Chain
Multiple modules crash during initialization, preventing `sessionRestore.restore()` from ever executing:

1. **Primary Error Pattern:**
   ```
   TypeError: Cannot read properties of null (reading 'addEventListener')
   ```

2. **Error Cascade:**
   - When one module crashes during `require()`, execution stops
   - The next module in the dependency chain never loads
   - Eventually `sessionRestore.restore()` at the end of `default.js` never runs

## Modules Investigated & Fixed

### 1. Password Manager Modules (DISABLED)
**File:** `js/default.js`
```javascript
// require('autofillSetup.js').initialize()
// require('passwordManager/passwordManager.js').initialize()
// require('passwordManager/passwordCapture.js').initialize()
// require('passwordManager/passwordViewer.js').initialize()
```
**Issue:** Access DOM elements that don't exist in Branch Browser's modified HTML

### 2. branchState.js dependency in browserUI.js (DISABLED)
**File:** `js/browserUI.js` line 15
```javascript
// var branchState = require('branches/branchState.js')
```
**Issue:** Even though branch initialization was disabled in `default.js`, `browserUI.js` still imported `branchState.js` at module load time. If branchState.js (which requires database.js) has any initialization issues, it breaks browserUI.js, which breaks `browserUI.addTab()`, which means sessionRestore can't create tabs.

### 3. keyboardNavigationHelper.js (FIXED)
**File:** `js/util/keyboardNavigationHelper.js` line 67
```javascript
addToGroup: function (group, container) {
  // Added null guard
  if (!container) {
    console.warn('[keyboardNavigationHelper] addToGroup called with null container for group:', group)
    return
  }
  // ...
}
```
**Issue:** `searchbar.js` passes `searchbar.el` (which can be null if DOM isn't ready) to `addToGroup()`, which then calls `container.addEventListener()` on null.

### 4. Main Process IPC Handlers (FIXED)
**File:** `main/main.js` lines 507-514, 542-548
```javascript
ipc.on('places-connect', function (e) {
  try {
    if (placesWindow && placesWindow.webContents && !placesWindow.webContents.isDestroyed()) {
      placesWindow.webContents.postMessage('places-connect', null, e.ports)
    }
  } catch (err) {
    console.warn('[places-connect] Failed to post message:', err.message)
  }
})
```
**Issue:** Main process error dialog "Render frame was disposed before WebFrameMain could be accessed" when trying to send IPC to a destroyed renderer.

### 5. Other Disabled Modules
**File:** `js/default.js`
```javascript
// require('bookmarkConverter.js').initialize()
// require('newTabPage.js').initialize()
// require('macHandoff.js').initialize()
```

**Branch modules completely commented out:**
```javascript
/*
var database = require('util/database.js')
database.dbReady.then(async function () {
  // branchEvents and branchPanel initialization
})
*/
```

## The Fundamental Problem (NOT YET SOLVED)

The error `TypeError: Cannot read properties of null (reading 'addEventListener')` keeps appearing from different modules. Each time we disable one module, another surfaces with the same error.

**Latest error source:** `1.contextMenu.js` webpack chunk

The webpack chunk numbering (`1.contextMenu.js`, `1.bookmarkConverter.js`, etc.) indicates these are dynamically loaded chunks. The actual error is in **dependencies of these modules**, not the modules themselves.

### Why Original Min Browser Works
The original Min browser works because:
1. All DOM elements exist in index.html
2. Scripts load after DOM is ready (script at end of body)
3. No additional modules (like our branch modules) break the initialization chain

### What's Different in Branch Browser
1. We added branch-related code that may have timing issues
2. Some HTML elements may have been modified
3. The sidebar margin logic may interfere with initialization

## Files Modified

| File | Changes |
|------|---------|
| `js/default.js` | Disabled password manager, bookmarkConverter, newTabPage, macHandoff, branch modules |
| `js/browserUI.js` | Commented out branchState require and popup branch creation |
| `js/util/keyboardNavigationHelper.js` | Added null guard in addToGroup() |
| `main/main.js` | Added try-catch around IPC postMessage calls |

## Next Steps to Try

1. **Check if searchbar element exists when script runs:**
   - Add `console.log('searchbar element:', document.getElementById('searchbar'))` at top of default.js
   - If null, the DOM isn't ready when scripts run

2. **Check webpack chunk loading order:**
   - The `1.xxx.js` naming suggests dynamic imports
   - These chunks may load asynchronously before DOM is ready

3. **Compare with original Min browser:**
   - Clone fresh Min browser
   - Run it to confirm it works
   - Diff our changes to find what broke it

4. **Minimal reproduction:**
   - Start with original Min
   - Add changes one at a time
   - Find exact change that breaks it

5. **Alternative approach - defer initialization:**
   - Wrap all module initialization in `DOMContentLoaded` event
   - Or use `setTimeout(..., 0)` to defer to next tick

## Console Errors to Watch For

```
TypeError: Cannot read properties of null (reading 'addEventListener')
TypeError: Cannot read properties of undefined (reading 'get')
Error: Render frame was disposed before WebFrameMain could be accessed
```

## Key Files to Investigate

- `js/searchbar/searchbar.js` - Line 19 does `getElementById('searchbar')` at module load time
- `js/util/keyboardNavigationHelper.js` - Line 80 calls addEventListener on potentially null element
- `js/default.js` - Module initialization order
- `dist/bundle.js` - Webpack output, check chunk loading

## Session Restore Flow (should happen but doesn't)

1. `default.js` loads and runs module initialization
2. → ERROR: Some module crashes during require()
3. → Execution stops
4. → `sessionRestore.restore()` never called
5. → No tabs created
6. → White screen

## Verification Checklist

When fixed, these should all be true:
- [ ] Console shows `[SessionRestore] restore() called`
- [ ] Console shows `[WEBVIEWS] Creating view for tab:`
- [ ] `selectedId` is not null in resize() logs
- [ ] `x` is 260 (not 0) in bounds
- [ ] Webview content is visible
- [ ] No TypeError exceptions in console
