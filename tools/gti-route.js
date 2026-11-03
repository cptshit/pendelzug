#!/usr/bin/env node
// =============================================================================
// tools/gti-route.js – Verbindungssuche über Geofox GTI testen (Teilschritt 3b)
// =============================================================================
//
// Ablauf:
//   1. checkName: Wir fragen die genauen Haltestellen für „Halstenbek“ und
//      „Itzehoe“ ab. getRoute verlangt die HVV-Kennung der Haltestelle
//      (z. B. „Master:12345“), ein freier Text reicht nicht.
//   2. getRoute mit Echtzeit: die nächsten Verbindungen ab jetzt (oder ab
//      einer angegebenen Uhrzeit).
//   3. Ausgabe als lesbare Übersicht: Linie, Plan-Zeit, Verspätung, Gleis,
//      Ausfall, Umstiegszeiten.
//   4. Die vollständigen Rohantworten landen zusätzlich als JSON-Dateien in
//      tools/ausgabe/ (von git ignoriert). Daran sehen wir, welche Felder GTI
//      wirklich liefert, bevor wir den Adapter für die App bauen.
//
// Aufruf:
//   node tools/gti-route.js              Hinweg Halstenbek → Itzehoe, ab jetzt
//   node tools/gti-route.js rueck        Rückweg Itzehoe → Halstenbek
//   node tools/gti-route.js 07:00        Hinweg ab 07:00 heute
//   node tools/gti-route.js rueck 16:30  Rückweg ab 16:30 heute
//
// Serverlast: pro Aufruf drei kleine Anfragen (2× checkName, 1× getRoute).
// In der App merken wir uns die Haltestellen-Kennungen später, dann bleibt
// es bei einer Anfrage pro Aktualisierung.
// =============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { gtiAufruf, pruefen, abbrechen } = require('./gti-lib');

// Haltestellen, wie man sie in die HVV-Suche tippen würde.
const HALTESTELLE_HEIM = 'Halstenbek';
const HALTESTELLE_ARBEIT = 'Itzehoe';

// Wie viele Verbindungen nach der besten zusätzlich geholt werden.
// 2 reicht, um „spätere Verbindung“ (Taste Ab) später zu testen.
const WEITERE_VERBINDUNGEN = 2;

// Ordner für die Rohantworten (steht in .gitignore).
const AUSGABE_ORDNER = path.join(__dirname, 'ausgabe');

// -----------------------------------------------------------------------------
// Kleine Helfer für Zeiten
// -----------------------------------------------------------------------------

// Zahl zweistellig mit führender Null: 7 → "07".
function zweistellig(n) {
  return String(n).padStart(2, '0');
}

// JavaScript-Datum → GTITime-Objekt, wie GTI es erwartet:
// { date: "TT.MM.JJJJ", time: "HH:MM" }
function alsGtiZeit(d) {
  return {
    date: zweistellig(d.getDate()) + '.' + zweistellig(d.getMonth() + 1) + '.' + d.getFullYear(),
    time: zweistellig(d.getHours()) + ':' + zweistellig(d.getMinutes()),
  };
}

// GTITime-Objekt → JavaScript-Datum (für Rechnungen wie Umstiegszeit).
// GTI liefert Zeiten als { date: "03.11.2026", time: "07:12" }. Falls nur
// eine Uhrzeit als Text kommt, nehmen wir das heutige Datum.
function ausGtiZeit(z) {
  if (!z) return null;
  const zeit = typeof z === 'string' ? z : z.time;
  const datum = typeof z === 'object' && z.date ? z.date : alsGtiZeit(new Date()).date;
  const [tag, monat, jahr] = datum.split('.').map(Number);
  const [std, min] = zeit.split(':').map(Number);
  return new Date(jahr, monat - 1, tag, std, min);
}

// Nur die Uhrzeit "HH:MM" aus einem GTITime-Objekt.
function uhrzeit(z) {
  if (!z) return '--:--';
  return typeof z === 'string' ? z : z.time;
}

// Verspätung in Sekunden (so liefert GTI depDelay/arrDelay) → Text wie "+4".
// Ohne Echtzeitdaten fehlt das Feld: dann "  " (keine Angabe).
function verspaetungText(sekunden) {
  if (sekunden === undefined || sekunden === null) return '  ';
  const min = Math.round(sekunden / 60);
  if (min === 0) return '±0';
  return (min > 0 ? '+' : '') + min;
}

// Minuten zwischen zwei Daten (b − a).
function minutenZwischen(a, b) {
  return Math.round((b - a) / 60000);
}

// Ist-Zeit = Plan-Zeit + Verspätung (Sekunden).
function istZeit(planZeit, verspaetungSek) {
  const d = ausGtiZeit(planZeit);
  if (!d) return null;
  return new Date(d.getTime() + (verspaetungSek || 0) * 1000);
}

// -----------------------------------------------------------------------------
// Rohantwort speichern
// -----------------------------------------------------------------------------
function speichern(dateiname, daten) {
  fs.mkdirSync(AUSGABE_ORDNER, { recursive: true });
  const datei = path.join(AUSGABE_ORDNER, dateiname);
  fs.writeFileSync(datei, JSON.stringify(daten, null, 2) + '\n');
  return datei;
}

// -----------------------------------------------------------------------------
// 1. checkName: Haltestelle suchen
// -----------------------------------------------------------------------------
async function haltestelleSuchen(suchtext) {
  const antwort = await gtiAufruf('checkName', {
    // Unvollständiger SDName mit dem Suchtext; type STATION = nur Haltestellen.
    theName: { name: suchtext, type: 'STATION' },
    maxList: 5,
    coordinateType: 'EPSG_4326',
  });
  const json = pruefen('checkName', antwort);
  speichern('checkName_' + suchtext + '.json', json);

  const treffer = (json.results || []).filter(r => r.type === 'STATION');
  if (treffer.length === 0) abbrechen('Keine Haltestelle für „' + suchtext + '“ gefunden.');

  // Alle Kandidaten zeigen, damit wir sehen, ob der erste wirklich passt.
  console.log('Suche „' + suchtext + '“:');
  treffer.forEach((r, i) => {
    console.log('  ' + (i === 0 ? '→ ' : '  ') + r.combinedName +
                ' (' + r.city + ', ' + r.id + ')' +
                (r.serviceTypes ? ' [' + r.serviceTypes.join(', ') + ']' : ''));
  });

  // Den ersten Treffer nehmen und nur die Felder weitergeben, die getRoute
  // für start/dest braucht.
  const t = treffer[0];
  return { name: t.name, city: t.city, combinedName: t.combinedName, id: t.id, type: t.type };
}

// -----------------------------------------------------------------------------
// 2. getRoute: Verbindungen suchen
// -----------------------------------------------------------------------------
async function verbindungenSuchen(start, ziel, abfahrt) {
  const antwort = await gtiAufruf('getRoute', {
    start: start,
    dest: ziel,
    time: alsGtiZeit(abfahrt),
    timeIsDeparture: true,            // „time“ ist Abfahrtszeit, nicht Ankunft
    schedulesBefore: 0,
    schedulesAfter: WEITERE_VERBINDUNGEN,
    realtime: 'REALTIME',             // Echtzeitdaten einbeziehen
    intermediateStops: false,         // Zwischenhalte brauchen wir nicht
  });
  const json = pruefen('getRoute', antwort);
  const datei = speichern('getRoute.json', json);
  console.log('Rohantwort gespeichert: ' + datei);
  return json;
}

// -----------------------------------------------------------------------------
// 3. Übersicht ausgeben
// -----------------------------------------------------------------------------

// Ist ein Teilstück ein Fußweg? GTI kennzeichnet das über den Linientyp:
//   CHANGE               = Umstiegsfußweg im selben Bahnhof
//   CHANGE_SAME_PLATFORM = Umstieg am selben Bahnsteig (oft 0 Min.)
//   FOOTPATH             = echter Fußweg zwischen zwei Haltestellen
// Zur Sicherheit erkennen wir zusätzlich das Wort „Fußweg“ im Namen.
function istFussweg(el) {
  const typ = el.line && el.line.type && el.line.type.simpleType;
  return typ === 'CHANGE' || typ === 'CHANGE_SAME_PLATFORM' || typ === 'FOOTPATH' ||
         /fu(ß|ss)weg/i.test((el.line && el.line.name) || '');
}

// Gleis-Text: Echtzeit-Gleis bevorzugen; bei Gleiswechsel beide zeigen.
function gleisText(sd) {
  const plan = sd.platform;
  const echt = sd.realtimePlatform;
  if (echt && plan && echt !== plan) return echt + ' (statt ' + plan + ')';
  return echt || plan || '';
}

function verbindungAusgeben(nr, s) {
  const el = s.scheduleElements || [];
  const erstes = el[0], letztes = el[el.length - 1];

  console.log('');
  console.log('Verbindung ' + nr + ':  ab ' + uhrzeit(erstes.from.depTime) + ' ' +
              verspaetungText(erstes.from.depDelay).trim() + '  →  an ' +
              uhrzeit(letztes.to.arrTime) + ' ' + verspaetungText(letztes.to.arrDelay).trim() +
              '   (Dauer ' + s.time + ' Min.' +
              (s.realtimeAffected ? ', durch Echtzeit verändert' : '') + ')');

  let letzteAnkunft = null; // Ist-Ankunft des letzten Fahrzeugs (für Umstieg)
  let letzteAnkunftPlan = null;

  el.forEach(e => {
    const ausfall = e.cancelled || e.from.cancelled || e.to.cancelled;

    if (istFussweg(e)) {
      const typ = e.line && e.line.type && e.line.type.simpleType;
      const art = typ === 'CHANGE_SAME_PLATFORM' ? ' (gleicher Bahnsteig)' : '';
      console.log('    Fußweg  ' + e.from.name + ' → ' + e.to.name + art + '  (' + uhrzeit(e.from.depTime) + '–' + uhrzeit(e.to.arrTime) + ')');
      return;
    }

    // Umstiegszeit: von der Ankunft des vorigen Fahrzeugs bis zur Abfahrt
    // dieses Fahrzeugs (ein Fußweg dazwischen zählt mit hinein).
    if (letzteAnkunft) {
      const abIst = istZeit(e.from.depTime, e.from.depDelay);
      const abPlan = ausGtiZeit(e.from.depTime);
      console.log('    ↳ Umstieg: ' + minutenZwischen(letzteAnkunft, abIst) + ' Min. (Plan ' +
                  minutenZwischen(letzteAnkunftPlan, abPlan) + ' Min.)');
    }

    const linie = (e.line && e.line.name) || '?';
    const richtung = e.line && e.line.direction ? ' Ri. ' + e.line.direction : '';
    console.log('    ' + linie.padEnd(6) + '  ' +
                uhrzeit(e.from.depTime) + ' ' + verspaetungText(e.from.depDelay).padEnd(3) + ' ' +
                e.from.name + (gleisText(e.from) ? ', ' + gleisText(e.from) : '') +
                '  →  ' + uhrzeit(e.to.arrTime) + ' ' + verspaetungText(e.to.arrDelay).trim() + ' ' +
                e.to.name + (gleisText(e.to) ? ', ' + gleisText(e.to) : '') +
                richtung + (ausfall ? '   *** AUSFALL ***' : '') + (e.extra ? '   (Zusatzfahrt)' : ''));

    letzteAnkunft = istZeit(e.to.arrTime, e.to.arrDelay);
    letzteAnkunftPlan = ausGtiZeit(e.to.arrTime);
  });
}

// -----------------------------------------------------------------------------
// Hauptprogramm
// -----------------------------------------------------------------------------
async function main() {
  // Argumente auswerten: „rueck“ dreht die Richtung, „HH:MM“ setzt die Zeit.
  const args = process.argv.slice(2);
  const rueck = args.includes('rueck');
  const abfahrt = new Date();
  const zeitArg = args.find(a => /^\d{1,2}:\d{2}$/.test(a));
  if (zeitArg) {
    const [h, m] = zeitArg.split(':').map(Number);
    abfahrt.setHours(h, m, 0, 0);
  }

  const vonText = rueck ? HALTESTELLE_ARBEIT : HALTESTELLE_HEIM;
  const nachText = rueck ? HALTESTELLE_HEIM : HALTESTELLE_ARBEIT;

  const von = await haltestelleSuchen(vonText);
  const nach = await haltestelleSuchen(nachText);

  console.log('');
  console.log('Suche Verbindungen ' + von.combinedName + ' → ' + nach.combinedName +
              ' ab ' + alsGtiZeit(abfahrt).date + ' ' + alsGtiZeit(abfahrt).time);

  const json = await verbindungenSuchen(von, nach, abfahrt);

  // GTI liefert Echtzeit-Verbindungen in „realtimeSchedules“, Plan-
  // Verbindungen in „schedules“. Wir zeigen die Echtzeit-Liste, wenn es sie
  // gibt, und sagen dazu, welche Liste es ist.
  const echtzeit = json.realtimeSchedules && json.realtimeSchedules.length > 0;
  const liste = echtzeit ? json.realtimeSchedules : (json.schedules || []);
  console.log('Liste: ' + (echtzeit ? 'realtimeSchedules (mit Echtzeit)' : 'schedules (nur Fahrplan)') +
              ', ' + liste.length + ' Verbindung(en)');

  liste.forEach((s, i) => verbindungAusgeben(i + 1, s));
  console.log('');
}

main();
