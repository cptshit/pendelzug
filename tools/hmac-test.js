#!/usr/bin/env node
// tools/hmac-test.js – prüft src/pkjs/hmac-sha1.js gegen Node-crypto.
//
// Die App rechnet die Geofox-Signatur mit eigenem Code (auf dem Handy gibt es
// kein crypto-Modul). Dieses Skript vergleicht das Ergebnis mit dem
// eingebauten, sicher richtigen Node-crypto – mit Testtexten, nicht mit den
// echten Zugangsdaten.
//
// Aufruf:   node tools/hmac-test.js

'use strict';

const crypto = require('crypto');
const { signatur } = require('../src/pkjs/hmac-sha1');

// Verschiedene Fälle: leer, kurz, Umlaute, genau Blockgrenzen, langer Schlüssel
const faelle = [
  ['', ''],
  ['geheim', '{}'],
  ['geheim', '{"version":63}'],
  ['Passwört mit ß', '{"theName":{"name":"Bönningstedt","type":"STATION"}}'],
  ['x'.repeat(64), 'y'.repeat(55)],
  ['x'.repeat(65), 'y'.repeat(56)],
  ['k'.repeat(200), 'z'.repeat(1000) + '€😀'],
];

let fehler = 0;
for (const [schluessel, text] of faelle) {
  const soll = crypto.createHmac('sha1', Buffer.from(schluessel, 'utf8'))
    .update(Buffer.from(text, 'utf8')).digest('base64');
  const ist = signatur(text, schluessel);
  const ok = soll === ist;
  if (!ok) fehler++;
  console.log((ok ? 'OK    ' : 'FALSCH') + '  Schlüssel ' + schluessel.length +
              ' Zeichen, Text ' + text.length + ' Zeichen');
}
console.log(fehler ? fehler + ' Fehler' : 'Alle Fälle stimmen mit Node-crypto überein.');
process.exitCode = fehler ? 1 : 0;
