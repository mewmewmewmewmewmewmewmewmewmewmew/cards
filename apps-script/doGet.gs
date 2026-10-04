/**
 * mew.cards — Google Apps Script web app (the site's backend).
 *
 * This file holds doGet and the "Hidden" helpers. Your script also has GETPSAPOP and
 * updateTicker; leave those as they are. After pasting, redeploy:
 * Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy (same URL).
 *
 * Actions (all GET, so the browser can call them without a CORS preflight):
 *   ?action=getConfig                 → { passwordEnabled }
 *   ?action=getAll&sheets=A,B,C       → { sheets: { A: csv, ... }, hidden: [cert, ...] }
 *   ?action=getHidden                 → { hidden: [cert, ...] }
 *   ?action=setHidden&cert=…&hidden=1|0&name=…   → { ok, hidden: [cert, ...] }
 *   ?sheet=Name                       → that tab as CSV
 * Reads need the password when PasswordEnabled is TRUE. setHidden ALWAYS needs the password,
 * even when the gallery is public, so nobody else can change what's hidden.
 *
 * Config tab: A1 "Key", B1 "Value"; A2 "PasswordEnabled" / B2 TRUE or FALSE; A3 "Password" / B3 the password.
 * Hidden tab: created automatically on the first hide (Cert, Card, Hidden at).
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = spreadsheet.getSheetByName("Config");
    let passwordEnabled = false;
    let correctPassword = null;

    // --- Read Configuration ---
    if (configSheet) {
      const configData = configSheet.getDataRange().getValues();
      for (let i = 1; i < configData.length; i++) {
        const key = configData[i][0];
        const value = configData[i][1];
        if (key === 'PasswordEnabled') passwordEnabled = String(value).toUpperCase() === 'TRUE';
        if (key === 'Password') correctPassword = String(value);
      }
    }

    // Action: getConfig - whether password protection is active.
    if (p.action === 'getConfig') return json_({ passwordEnabled: passwordEnabled });

    const providedPassword = p.password;
    const passwordOk = !!correctPassword && providedPassword === correctPassword;

    // --- Writes: always need the password ---
    if (p.action === 'setHidden') {
      if (!passwordOk) return text_("Error: Authentication Failed");
      const hidden = setHidden_(spreadsheet, p.cert, p.hidden === '1', p.name);
      return json_({ ok: true, hidden: hidden });
    }

    // --- Reads: need the password when protection is on ---
    if (passwordEnabled && !passwordOk) return text_("Error: Authentication Failed");

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

/** Cert numbers in the Hidden tab, as strings. */
function readHidden_(ss) {
  const sh = ss.getSheetByName(HIDDEN_SHEET_);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(Boolean);
}

/** Add (hide=true) or remove (hide=false) a cert; returns the full hidden list afterwards. */
function setHidden_(ss, cert, hide, name) {
  cert = String(cert || "").trim();
  if (!/^[A-Za-z0-9-]{4,20}$/.test(cert)) throw new Error("bad cert");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let sh = ss.getSheetByName(HIDDEN_SHEET_);
    if (!sh) {
      sh = ss.insertSheet(HIDDEN_SHEET_);
      sh.getRange("A:A").setNumberFormat("@"); // keep certs as text
      sh.appendRow(["Cert", "Card", "Hidden at"]);
    }
    const last = sh.getLastRow();
    const certs = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
    const i = certs.indexOf(cert);
    if (hide && i < 0) sh.appendRow([cert, String(name || "").slice(0, 200), new Date()]);
    if (!hide && i >= 0) sh.deleteRow(i + 2);
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
