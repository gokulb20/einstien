// defines schema for the browsingData database
// requires Dexie.min.js

if (typeof Dexie === 'undefined' && typeof require !== 'undefined') {
  var Dexie = require('dexie')
}

var dbErrorMessage = 'Internal error opening backing store for indexedDB.open'
var dbErrorAlertShown = false

var db = new Dexie('browsingData2')

db.version(1).stores({
  /*
  color - the main color of the page, extracted from the page icon
  pageHTML - a saved copy of the page's HTML, when it was last visited. Removed in 1.6.0, so all pages visited after then will have an empty string in this field.
  extractedText - the text content of the page, extracted from pageHTML.
  searchIndex - an array of words on the page (created from extractedText), used for full-text searchIndex
  isBookmarked - whether the page is a bookmark
  extraData - other metadata about the page
  */
  places: '++id, &url, title, color, visitCount, lastVisit, pageHTML, extractedText, *searchIndex, isBookmarked, *tags, metadata',
  readingList: 'url, time, visitCount, pageHTML, article, extraData' // TODO remove this (reading list is no longer used)
})

// Branch Browser: Add branches table for parent-child tab relationships
db.version(2).stores({
  places: '++id, &url, title, color, visitCount, lastVisit, pageHTML, extractedText, *searchIndex, isBookmarked, *tags, metadata',
  readingList: 'url, time, visitCount, pageHTML, article, extraData',
  /*
  branches - stores the parent-child relationship tree for tabs
  id - unique branch identifier (br_xxx)
  tabId - Min's internal tab ID
  parentId - parent branch ID (null for root branches)
  url - current URL of the branch
  title - page title
  createdAt - timestamp when branch was created
  lastActiveAt - timestamp of last activity (for sleep system)
  state - 'awake' or 'sleeping'
  */
  branches: '&id, tabId, parentId, url, title, createdAt, lastActiveAt, state'
})

// Branch Browser: Export promise so other modules can wait for DB to be ready
var dbReady = db.open().then(function () {
  console.log('database opened ', performance.now())
}).catch(function (error) {
  if (error.message.indexOf(dbErrorMessage) !== -1 && !dbErrorAlertShown) {
    window && window.alert && window.alert(l('multipleInstancesErrorMessage'))
    ipc.send('quit')

    dbErrorAlertShown = true
  }
})

if (typeof module !== 'undefined') {
  module.exports = { db, dbReady }
}
