// =============================================================================
// tools/gti-lib.js – gemeinsame Hilfsfunktionen für die GTI-Testskripte
// =============================================================================
//
// Enthält alles, was jeder GTI-Aufruf braucht: Zugangsdaten lesen, Anfrage
// signieren, per POST schicken. Die Testskripte (gti-test.js, gti-route.js)
// binden diese Datei mit require('./gti-lib') ein, damit der Code nur an
// einer Stelle steht.
//
// Wichtig: Benutzer, Passwort und Signatur werden hier NIE ausgegeben.
//
// Quelle: GTI-Handbuch (API-Version 63),
// https://gti.geofox.de/html/GTIHandbuch_p.html, Kapitel 1.2 und 1.3.
// =============================================================================

'use strict';

const fs = require('fs');         // Dateien lesen
const os = require('os');         // Home-Verzeichnis finden
const path = require('path');     // Pfade zusammensetzen
const crypto = require('crypto'); // HMAC-SHA1 für die Signatur

// Grundadresse aller GTI-Methoden; der Methodenname kommt hinten dran,
// z. B. …/gti/public/init oder …/gti/public/getRoute.
const GTI_BASIS = 'https://gti.geofox.de/gti/public/';

// API-Version, die wir sprechen (steht in jedem Request im Feld „version“).
const API_VERSION = 63;

// Fehlermeldung ausgeben und das Skript mit Fehlercode beenden.
function abbrechen(meldung) {
  console.error('Fehler: ' + meldung);
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Zugangsdaten aus ~/.pendelzug-gti lesen (Format: GTI_USER=… / GTI_PASS=…).
// Die Datei wird nur gelesen; die Werte bleiben im Arbeitsspeicher.
// -----------------------------------------------------------------------------
function zugangsdatenLesen() {
  const datei = path.join(os.homedir(), '.pendelzug-gti');

  let inhalt;
  try {
    inhalt = fs.readFileSync(datei, 'utf8');
  } catch (err) {
    // Nur Dateiname und Fehlerart nennen, keinen Inhalt.
    abbrechen('Kann ' + datei + ' nicht lesen (' + err.code + ').');
  }

  // Zeilenweise auswerten. Erlaubt: Leerzeilen, Kommentare mit „#“,
  // Windows-Zeilenenden und Werte in Anführungszeichen.
  const werte = {};
  for (const roh of inhalt.split(/\r?\n/)) {
    const zeile = roh.trim();
    if (zeile === '' || zeile.startsWith('#')) continue;
    const gleich = zeile.indexOf('=');
    if (gleich < 0) continue;
    const name = zeile.slice(0, gleich).trim();
    let wert = zeile.slice(gleich + 1).trim();
    if (/^(["']).*\1$/.test(wert)) wert = wert.slice(1, -1);
    werte[name] = wert;
  }

  if (!werte.GTI_USER || !werte.GTI_PASS) {
    abbrechen('In ' + datei + ' fehlt GTI_USER oder GTI_PASS.');
  }
  return { user: werte.GTI_USER, pass: werte.GTI_PASS };
}

// -----------------------------------------------------------------------------
// Signatur: HMAC-SHA1 über den EXAKTEN Body-Text, Schlüssel = Passwort (UTF-8),
// Ergebnis Base64. Der Body darf danach nicht mehr verändert werden – schon
// ein Leerzeichen mehr macht die Signatur ungültig.
// -----------------------------------------------------------------------------
function signatur(body, passwort) {
  return crypto
    .createHmac('sha1', Buffer.from(passwort, 'utf8'))
    .update(Buffer.from(body, 'utf8'))
    .digest('base64');
}

// -----------------------------------------------------------------------------
// Eine GTI-Methode aufrufen.
//   methode: z. B. 'init', 'checkName', 'getRoute'
//   daten:   Objekt mit den Request-Feldern (ohne „version“, die kommt dazu)
// Rückgabe: { status, json, text, traceId }
// -----------------------------------------------------------------------------
async function gtiAufruf(methode, daten) {
  const { user, pass } = zugangsdatenLesen();

  // Body genau EINMAL als Text erzeugen und diesen Text signieren UND senden.
  const body = JSON.stringify(Object.assign({ version: API_VERSION }, daten || {}));

  // Header laut GTI-Handbuch, Tabelle 1:
  //  - Content-Type: Pflicht.           - Accept: Antwort als JSON.
  //  - geofox-auth-user: Benutzername.  - geofox-auth-signature: Signatur.
  //  - geofox-auth-type: immer „HmacSHA1“.
  //  - X-Platform (optional): Art des Clients.
  //  - X-TraceId (optional): Zufalls-ID pro Anfrage, hilft dem HVV-Support
  //    bei der Fehlersuche.
  const traceId = crypto.randomUUID();
  const headers = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json',
    'geofox-auth-user': user,
    'geofox-auth-signature': signatur(body, pass),
    'geofox-auth-type': 'HmacSHA1',
    'X-Platform': 'web',
    'X-TraceId': traceId,
  };

  let antwort;
  try {
    // fetch ist seit Node 18 eingebaut.
    antwort = await fetch(GTI_BASIS + methode, { method: 'POST', headers, body });
  } catch (err) {
    abbrechen('Keine Verbindung zum Server: ' + err.message);
  }

  const text = await antwort.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* keine JSON-Antwort */ }

  return { status: antwort.status, json, text, traceId, body };
}

// Prüft eine Antwort und bricht mit verständlicher Meldung ab, wenn sie nicht
// „OK“ ist. GTI meldet Fehler im Feld returnCode (z. B. ERROR_ROUTE) und
// erklärt sie in errorText / errorDevInfo.
function pruefen(methode, antwort) {
  if (antwort.status === 401) {
    abbrechen(methode + ': abgelehnt (401) – Benutzer, Passwort oder Signatur stimmen nicht.');
  }
  if (!antwort.json || antwort.json.returnCode !== 'OK') {
    console.error('Antwort von ' + methode + ' (Status ' + antwort.status +
                  ', TraceId ' + antwort.traceId + '):');
    console.error(antwort.json ? JSON.stringify(antwort.json, null, 2) : antwort.text);
    abbrechen(methode + ' ist fehlgeschlagen.');
  }
  return antwort.json;
}

module.exports = { gtiAufruf, pruefen, abbrechen, API_VERSION };
