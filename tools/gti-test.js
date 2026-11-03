#!/usr/bin/env node
// =============================================================================
// tools/gti-test.js – Verbindungstest zur HVV-Schnittstelle Geofox GTI
// =============================================================================
//
// Teilschritt 3a: Ruft die einfachste GTI-Methode „init“ auf und gibt die
// Antwort aus. „init“ liefert nur allgemeine Infos (z. B. Gültigkeit des
// Fahrplans). Klappt der Aufruf, stimmen Zugangsdaten und Signatur.
//
// Läuft auf dem Rechner (Host) mit Node.js, nicht auf der Uhr und nicht im
// Pebble-Container. Gehört nicht zur App (deshalb tools/, nicht src/).
//
// Aufruf:   node tools/gti-test.js
//
// Zugangsdaten, Signatur und Versand stecken in tools/gti-lib.js.
// =============================================================================

'use strict';

const { gtiAufruf } = require('./gti-lib');

async function main() {
  // Für „init“ ist laut Handbuch ein leeres Objekt gültig; gti-lib ergänzt
  // die Version wie in allen Handbuch-Beispielen.
  const antwort = await gtiAufruf('init', {});

  console.log('Anfrage:  POST https://gti.geofox.de/gti/public/init');
  console.log('Body:     ' + antwort.body);
  console.log('TraceId:  ' + antwort.traceId);
  console.log('Status:   ' + antwort.status);
  console.log('');

  // Antwort möglichst lesbar ausgeben: JSON eingerückt, sonst roh.
  console.log(antwort.json ? JSON.stringify(antwort.json, null, 2) : antwort.text);

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

main();
