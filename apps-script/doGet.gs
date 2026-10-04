/**
 * mew.cards — Google Apps Script web app (the site's backend).
 *
 * This file holds doGet and the "Hidden" helpers. Your script also has GETPSAPOP and
 * updateTicker; leave those as they are. After pasting, redeploy:
 * Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy (same URL).
 *
 * Actions (all GET, so the browser can call them without a CORS preflight):
 *   ?action=getConfig                 → { passwordEnabled, statsPasswordEnabled }
 *   ?action=getAll&sheets=A,B,C       → { sheets: { A: csv, ... }, hidden: { all: [...], personal: [...] } }
 *   ?action=getHidden                 → { hidden: { all: [...], personal: [...] } }
 *   ?action=setHidden&cert=…&hidden=1|0&list=all|personal&name=…   → { ok, hidden: { all, personal } }
 *   ?sheet=Name                       → that tab as CSV
 * Passwords (Config tab, column A key / column B value):
 *   PasswordEnabled / Password            — the catalog (mew.cards)
 *   StatsPasswordEnabled / StatsPassword  — /stats (also accepts the key "StarsPassword")
 * Requests from /stats carry for=stats. When StatsPasswordEnabled is TRUE they need the stats
 * password (the catalog password doesn't open /stats); when it's FALSE, /stats follows the
 * catalog's rule. setHidden ALWAYS needs the applicable password, even when that page is
 * public, so nobody else can change what's hidden.
 * Hidden tab: created automatically on the first hide (Cert, Card, Hidden at, List). Hiding is
 * separate for /stats' two views: List is "all" or "personal" (blank counts as "all").
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = spreadsheet.getSheetByName("Config");
    let passwordEnabled = false;
    let correctPassword = null;
    let statsPasswordEnabled = false;
    let statsPassword = null;

    // --- Read Configuration ---
    if (configSheet) {
      const configData = configSheet.getDataRange().getValues();
      for (let i = 1; i < configData.length; i++) {
        const key = String(configData[i][0]).trim();
        const value = configData[i][1];
        if (key === 'PasswordEnabled') passwordEnabled = String(value).trim().toUpperCase() === 'TRUE';
        if (key === 'Password') correctPassword = String(value);
        if (key === 'StatsPasswordEnabled') statsPasswordEnabled = String(value).trim().toUpperCase() === 'TRUE';
        if (key === 'StatsPassword' || key === 'StarsPassword') statsPassword = String(value);
      }
    }

    // Action: getConfig - which password protection is active.
    if (p.action === 'getConfig') return json_({ passwordEnabled: passwordEnabled, statsPasswordEnabled: statsPasswordEnabled });

    // Which password applies: /stats has its own when StatsPasswordEnabled is on.
    const useStats = p['for'] === 'stats' && statsPasswordEnabled;
    const gateEnabled = useStats ? true : passwordEnabled;
    const gatePassword = useStats ? statsPassword : correctPassword;
    const providedPassword = p.password;
    const passwordOk = !!gatePassword && providedPassword === gatePassword;

    // --- Writes: always need the password ---
    if (p.action === 'setHidden') {
      if (!passwordOk) return text_("Error: Authentication Failed");
      const hidden = setHidden_(spreadsheet, p.cert, p.hidden === '1', p.name, p.list);
      return json_({ ok: true, hidden: hidden });
    }

    // --- Reads: need the password when protection is on ---
    if (gateEnabled && !passwordOk) return text_("Error: Authentication Failed");

    // Action: getAll - several tabs in ONE request (plus the hidden list for /stats).
    // e.g. ?action=getAll&sheets=Japanese,Cameo,Unique
    if (p.action === 'getAll') {
      const names = (p.sheets || "").split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      const out = {};
      names.forEach(function (name) {
        const sheet = spreadsheet.getSheetByName(name);
        if (sheet) out[name] = sheetToCsv_(sheet);
      });
      return json_({ sheets: out, hidden: readHidden_(spreadsheet) });
    }

    if (p.action === 'getHidden') return json_({ hidden: readHidden_(spreadsheet) });

    // Default: one tab as CSV.
    const sheetName = p.sheet;
    if (!sheetName) throw new Error("Missing 'sheet' parameter in the URL.");
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) throw new Error('Sheet with name "' + sheetName + '" not found.');
    return text_(sheetToCsv_(sheet));

  } catch (error) {
    return text_("Error: " + error.message);
  }
}

// --- Hidden cards (for /stats) ------------------------------------------------------------

const HIDDEN_SHEET_ = "Hidden";

const LISTS_ = ["all", "personal"];
const listOf_ = function (v) { v = String(v || "").trim().toLowerCase(); return LISTS_.indexOf(v) >= 0 ? v : "all"; };

/** Hidden certs per view, as strings: { all: [...], personal: [...] }. */
function readHidden_(ss) {
  const out = { all: [], personal: [] };
  const sh = ss.getSheetByName(HIDDEN_SHEET_);
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    const cert = String(r[0]).trim();
    if (cert) out[listOf_(r[3])].push(cert);
  });
  return out;
}

/** Add (hide=true) or remove (hide=false) a cert in one view's list; returns all lists afterwards. */
function setHidden_(ss, cert, hide, name, list) {
  cert = String(cert || "").trim();
  if (!/^[A-Za-z0-9-]{4,20}$/.test(cert)) throw new Error("bad cert");
  list = listOf_(list);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let sh = ss.getSheetByName(HIDDEN_SHEET_);
    if (!sh) {
      sh = ss.insertSheet(HIDDEN_SHEET_);
      sh.getRange("A:A").setNumberFormat("@"); // keep certs as text
      sh.appendRow(["Cert", "Card", "Hidden at", "List"]);
    }
    const last = sh.getLastRow();
    const rows = last >= 2 ? sh.getRange(2, 1, last - 1, 4).getValues() : [];
    let found = -1;
    rows.forEach(function (r, i) { if (found < 0 && String(r[0]).trim() === cert && listOf_(r[3]) === list) found = i; });
    if (hide && found < 0) sh.appendRow([cert, String(name || "").slice(0, 200), new Date(), list]);
    if (!hide && found >= 0) sh.deleteRow(found + 2);
  } finally {
    lock.releaseLock();
  }
  return readHidden_(ss);
}

// --- Helpers ------------------------------------------------------------------------------

function sheetToCsv_(sheet) {
  const data = sheet.getDataRange().getValues();
  return data.map(function (row) {
    return row.map(function (cell) {
      const v = cell.toString();
      return (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',');
  }).join('\n');
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function text_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT); }
