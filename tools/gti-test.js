#!/usr/bin/env node
// =============================================================================
// tools/gti-test.js – Verbindungstest zur HVV-Schnittstelle Geofox GTI
// =============================================================================
//
// Teilschritt 3a: Dieses Skript ruft die einfachste GTI-Methode „init“ auf und
// gibt die Antwort aus. „init“ liefert nur allgemeine Infos (z. B. Gültigkeit
// des Fahrplans). Klappt der Aufruf, wissen wir: Zugangsdaten und Signatur
// stimmen – erst dann lohnt sich „getRoute“.
//
// Das Skript läuft auf dem Rechner (Host) mit Node.js, NICHT auf der Uhr und
// NICHT im Pebble-Docker-Container. Es gehört nicht zur App (liegt deshalb in
// tools/, nicht in src/) und wird nicht mitgebaut.
//
// Aufruf:   node tools/gti-test.js
//
// Zugangsdaten: werden aus ~/.pendelzug-gti gelesen (Format, je eine Zeile):
//     GTI_USER=…
//     GTI_PASS=…
// Die Datei liegt außerhalb des Repos. Das Skript gibt Benutzer und Passwort
// NIE aus – auch nicht in Fehlermeldungen.
//
// Quelle für Header und Signatur: GTI-Handbuch (API-Version 63),
// https://gti.geofox.de/html/GTIHandbuch_p.html, Kapitel 1.2 und 1.3.
// =============================================================================

'use strict';

// Eingebaute Node-Module – es muss nichts installiert werden.
const fs = require('fs');         // Dateien lesen
const os = require('os');         // Home-Verzeichnis finden
const path = require('path');     // Pfade zusammensetzen
const crypto = require('crypto'); // HMAC-SHA1 für die Signatur

// Adresse der Methode „init“. Alle GTI-Methoden werden per HTTP-POST
// aufgerufen; der Name der Methode steht am Ende der URL.
const GTI_URL = 'https://gti.geofox.de/gti/public/init';

// API-Version, die wir sprechen. Das Handbuch beschreibt Version 63 und setzt
// sie in jedem Beispiel-Request ins Feld „version“.
const API_VERSION = 63;

// -----------------------------------------------------------------------------
// 1. Zugangsdaten lesen
// -----------------------------------------------------------------------------
// Die Datei wird nur gelesen, nicht kopiert und nicht verändert. Die Werte
// bleiben ausschließlich im Arbeitsspeicher dieses Skripts.
function zugangsdatenLesen() {
  const datei = path.join(os.homedir(), '.pendelzug-gti');

  let inhalt;
  try {
    inhalt = fs.readFileSync(datei, 'utf8');
  } catch (err) {
    // Nur den Dateinamen und die Fehlerart nennen, keinen Inhalt.
    abbrechen('Kann ' + datei + ' nicht lesen (' + err.code + ').');
  }

  // Zeilenweise auswerten. Erlaubt sind: Leerzeilen, Kommentare mit „#“,
  // Windows-Zeilenenden (\r\n) und Werte in Anführungszeichen.
  const werte = {};
  for (const roh of inhalt.split(/\r?\n/)) {
    const zeile = roh.trim();
    if (zeile === '' || zeile.startsWith('#')) continue;
    const gleich = zeile.indexOf('=');
    if (gleich < 0) continue;
    const name = zeile.slice(0, gleich).trim();
    let wert = zeile.slice(gleich + 1).trim();
    // Umschließende Anführungszeichen entfernen ("…" oder '…').
    if (/^(["']).*\1$/.test(wert)) wert = wert.slice(1, -1);
    werte[name] = wert;
  }

  if (!werte.GTI_USER || !werte.GTI_PASS) {
    abbrechen('In ' + datei + ' fehlt GTI_USER oder GTI_PASS.');
  }
  return { user: werte.GTI_USER, pass: werte.GTI_PASS };
}

// -----------------------------------------------------------------------------
// 2. Signatur berechnen
// -----------------------------------------------------------------------------
// GTI prüft jede Anfrage über eine Signatur: HMAC-SHA1 über den EXAKTEN
// Request-Body (so wie er verschickt wird), Schlüssel ist das Passwort
// (UTF-8), das Ergebnis wird Base64-codiert.
// Wichtig: Der Body darf nach dem Signieren nicht mehr verändert werden –
// schon ein zusätzliches Leerzeichen macht die Signatur ungültig. Deshalb
// erzeugen wir den Body-Text einmal und verwenden genau diesen Text für
// Signatur UND Versand.
function signatur(body, passwort) {
  return crypto
    .createHmac('sha1', Buffer.from(passwort, 'utf8'))
    .update(Buffer.from(body, 'utf8'))
    .digest('base64');
}

// -----------------------------------------------------------------------------
// 3. Anfrage schicken und Antwort ausgeben
// -----------------------------------------------------------------------------
async function main() {
  const { user, pass } = zugangsdatenLesen();

  // Request-Body: Für „init“ ist laut Handbuch ein leeres Objekt gültig; die
  // Version geben wir trotzdem mit, wie in allen Handbuch-Beispielen.
  const body = JSON.stringify({ version: API_VERSION });

  // Header laut GTI-Handbuch, Tabelle 1:
  //  - Content-Type: Pflicht, sonst lehnt der Server ab.
  //  - Accept: Wir wollen JSON zurück.
  //  - geofox-auth-user: unser Benutzername (von der HBT GmbH vergeben).
  //  - geofox-auth-signature: die Signatur aus Schritt 2.
  //  - geofox-auth-type: Signaturverfahren, immer „HmacSHA1“.
  //  - X-Platform: optional, Art des Clients; „web“ passt für Skripte.
  //  - X-TraceId: optional, eine Zufalls-ID pro Anfrage. Hilft dem HVV-
  //    Support bei der Fehlersuche, falls wir mal nachfragen müssen.
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

  console.log('Anfrage:  POST ' + GTI_URL);
  console.log('Body:     ' + body);
  console.log('TraceId:  ' + traceId);
  // Benutzer, Passwort und Signatur werden bewusst NICHT ausgegeben.

  let antwort;
  try {
    // fetch ist seit Node 18 eingebaut.
    antwort = await fetch(GTI_URL, { method: 'POST', headers, body });
  } catch (err) {
    abbrechen('Keine Verbindung zum Server: ' + err.message);
  }

  const text = await antwort.text();
  console.log('Status:   ' + antwort.status + ' ' + antwort.statusText);
  console.log('');

  // Antwort möglichst lesbar ausgeben: JSON eingerückt, sonst roh.
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch (e) {
    console.log(text);
  }

  // Kurze Deutung für die häufigsten Fälle.
  console.log('');
  if (antwort.status === 200) {
    console.log('OK: Zugangsdaten und Signatur wurden akzeptiert.');
  } else if (antwort.status === 401) {
    console.log('Abgelehnt (401): Benutzername, Passwort oder Signatur stimmen nicht.');
    console.log('Tipp: In ~/.pendelzug-gti auf Tippfehler und Leerzeichen prüfen.');
    process.exitCode = 1;
  } else {
    console.log('Unerwartete Antwort – bitte die Ausgabe oben ansehen.');
    process.exitCode = 1;
  }
}

// Fehlermeldung ausgeben und mit Fehlercode beenden.
function abbrechen(meldung) {
  console.error('Fehler: ' + meldung);
  process.exit(1);
}

main();
