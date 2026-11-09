// Pure helpers for the Notifications panel. Imported from Panel.qml as
// `import "Model.js" as Model`, and ES5-only so the same file runs under node.

var DAY_MS = 86400000

// Notification text is sender-chosen markup. Strip tags so nothing renders
// as rich text (an <img> would fetch a URL the sender picked).
function plain(text) {
  return String(text || "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

// Who sent it, for display: the app name, else the desktop id the icon came
// from, shortened to its last component ("com.mitchellh.ghostty" -> "ghostty").
function sender(entry) {
  if (!entry) return ""
  if (entry.app) return String(entry.app)
  var icon = String(entry.appIcon || "")
  if (icon === "" || icon.charAt(0) === "/" || icon.indexOf("://") >= 0) return ""
  var parts = icon.split(".")
  return parts[parts.length - 1]
}

// Case-insensitive substring match over sender, summary and body. Every
// whitespace-separated word must match somewhere.
function matches(entry, query) {
  var q = String(query || "").toLowerCase().trim()
  if (q === "") return true
  var hay = (sender(entry) + " " + String(entry.appIcon || "") + " " +
             plain(entry.summary) + " " + plain(entry.body)).toLowerCase()
  var words = q.split(/\s+/)
  for (var i = 0; i < words.length; i++)
    if (hay.indexOf(words[i]) < 0) return false
  return true
}

function filter(entries, query) {
  var out = []
  for (var i = 0; i < (entries || []).length; i++)
    if (matches(entries[i], query)) out.push(entries[i])
  return out
}

// Heading an entry is grouped under: its sender, else "Other".
function groupOf(entry) {
  return sender(entry) || "Other"
}

// Reorder newest-first entries so each app's notifications sit together.
// Groups are ordered by their newest entry; order within a group is kept.
function groupByApp(entries) {
  var order = []
  var groups = {}
  for (var i = 0; i < (entries || []).length; i++) {
    var name = groupOf(entries[i])
    var id = name.toLowerCase()
    if (!groups.hasOwnProperty(id)) { groups[id] = []; order.push(id) }
    groups[id].push(entries[i])
  }
  var out = []
  for (var g = 0; g < order.length; g++) out = out.concat(groups[order[g]])
  return out
}

// How many entries each group holds, by group id (lowercased groupOf). A
// group of one has nothing to open or close.
function groupSizes(entries) {
  var sizes = {}
  for (var i = 0; i < (entries || []).length; i++) {
    var id = groupOf(entries[i]).toLowerCase()
    sizes[id] = (sizes[id] || 0) + 1
  }
  return sizes
}

// Nerd Font glyph for an app heading, by substring of the lowercased group
// name (first match wins); a bell when nothing fits.
var GROUP_GLYPHS = [
  ["download", "\uf063"],
  ["slack", "\uf198"],
  ["signal", "\uf27a"],
  ["message", "\uf27a"],
  ["mail", "\uf0e0"],
  ["calendar", "\uf073"],
  ["battery", "\uf242"],
  ["update", "\uf021"],
  ["spotify", "\uf1bc"],
  ["firefox", "\uf269"],
  ["screenshot", "\uf030"],
  ["term", "\uf120"],
  ["ghostty", "\uf120"],
  ["kitty", "\uf120"],
  ["alacritty", "\uf120"]
]

function groupGlyph(name) {
  var n = String(name || "").toLowerCase()
  for (var i = 0; i < GROUP_GLYPHS.length; i++)
    if (n.indexOf(GROUP_GLYPHS[i][0]) >= 0) return GROUP_GLYPHS[i][1]
  return "\uf0f3"
}

// Collapse each app's group to its newest entry. `expanded` maps a group id
// (lowercased groupOf) to true for stacks that are open. Takes grouped
// entries (see groupByApp); returns the entries to show and, keyed by
// entry key, how many are hidden behind each collapsed stack's top.
function stack(entries, expanded) {
  var shown = []
  var more = {}
  var seen = {}
  var open = expanded || {}
  var list = entries || []
  for (var i = 0; i < list.length; i++) {
    var id = groupOf(list[i]).toLowerCase()
    if (open[id]) { shown.push(list[i]); continue }
    if (seen[id]) { more[seen[id]]++; continue }
    seen[id] = String(list[i].key)
    more[seen[id]] = 0
    shown.push(list[i])
  }
  return { shown: shown, more: more }
}

var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
              "August", "September", "October", "November", "December"]

// Section heading for a timestamp: Today, Yesterday, a weekday within the
// week, then "17 August" (plus the year when it isn't this year).
function dayOf(timestamp, now) {
  var n = new Date(now)
  var midnight = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  var when = new Date(timestamp)
  if (timestamp >= midnight) return "Today"
  if (timestamp >= midnight - DAY_MS) return "Yesterday"
  if (timestamp >= midnight - 6 * DAY_MS) return WEEKDAYS[when.getDay()]
  var label = when.getDate() + " " + MONTHS[when.getMonth()]
  return when.getFullYear() === n.getFullYear() ? label : label + " " + when.getFullYear()
}

function pad2(n) { return n < 10 ? "0" + n : String(n) }

// "now", "4m", then the clock time (the day is in the section heading).
function relativeTime(timestamp, now) {
  var age = Math.max(0, now - timestamp)
  if (age < 60000) return "now"
  if (age < 3600000) return Math.floor(age / 60000) + "m"
  var d = new Date(timestamp)
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes())
}

function wrapIndex(index, count) {
  if (count <= 0) return -1
  return ((index % count) + count) % count
}

function clampIndex(index, count) {
  if (count <= 0) return -1
  return Math.max(0, Math.min(index, count - 1))
}

// An absolute path to an image file, nothing that could be read as an option
// or a URL scheme.
function isSafeImagePath(path) {
  var p = String(path || "")
  return /^\/[^\0\n]*\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(p) && p.indexOf("/../") < 0
}

// The focus helper matches its argument as a regex against window classes,
// so only something shaped like a plain name is allowed through.
function isPlainAppName(name) {
  return /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(String(name || ""))
}

// Window class to focus for an entry: the app name, else the desktop-id icon
// (which for most apps is their class, e.g. com.mitchellh.ghostty).
function focusTarget(entry) {
  if (!entry) return ""
  if (isPlainAppName(entry.app)) return String(entry.app)
  if (isPlainAppName(entry.appIcon)) return String(entry.appIcon)
  return ""
}

// Unread count: entries newer than lastSeen (newest first, so stop early).
function unreadCount(entries, lastSeen) {
  var n = 0
  for (var i = 0; i < (entries || []).length; i++) {
    if (Number(entries[i].timestamp) > lastSeen) n++
    else break
  }
  return n
}

if (typeof module !== "undefined") {
  module.exports = {
    plain: plain,
    sender: sender,
    matches: matches,
    filter: filter,
    groupOf: groupOf,
    groupByApp: groupByApp,
    groupSizes: groupSizes,
    groupGlyph: groupGlyph,
    stack: stack,
    dayOf: dayOf,
    relativeTime: relativeTime,
    wrapIndex: wrapIndex,
    clampIndex: clampIndex,
    isSafeImagePath: isSafeImagePath,
    isPlainAppName: isPlainAppName,
    focusTarget: focusTarget,
    unreadCount: unreadCount
  }
}
