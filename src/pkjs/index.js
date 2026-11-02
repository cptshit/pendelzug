// index.js – Handy-Teil (PebbleKit JS) von Pendelzug.
//
// Ablauf:
//   1. Die Uhr schickt eine ANFRAGE (JSON): { richtung: "hin"|"rueck", nr, neu }
//        nr  0 = nächste erreichbare Verbindung, -1 = eine frühere, +1 = eine spätere …
//        neu true = auf jeden Fall neu abfragen (Taste Select)
//   2. Wir fragen die Datenquelle (Adapter) ab – oder nehmen das Ergebnis
//      aus dem Zwischenspeicher, wenn es jünger als CACHE_SEKUNDEN ist.
//   3. Wir schicken der Uhr VERBINDUNG (JSON, Format wie testdaten.js)
//      oder FEHLER (Text).
//
// Netzwerk gibt es nur hier auf dem Handy, nie auf der Uhr.

var konfig = require("./konfig");
var aufbereitung = require("./aufbereitung");
// Aktuelle Datenquelle. Für Geofox (Schritt 6) wird nur diese Zeile geändert.
var quelle = require("./transitous");

// Zwischenspeicher der letzten Suche
var cache = { richtung: null, zeit: 0, verbindungen: [] };

function sende(daten) {
	Pebble.sendAppMessage(daten,
		function () { console.log("an Uhr gesendet: " + Object.keys(daten).join(", ")); },
		function (e) { console.log("Senden an Uhr fehlgeschlagen: " + JSON.stringify(e)); });
}

function sendeFehler(text) {
	console.log("Fehler: " + text);
	sende({ FEHLER: text });
}

// Aus den gefundenen Verbindungen die gewünschte auswählen und senden.
function antworte(anfrage) {
	var jetzt = Date.now();
	// Nur Verbindungen, die noch nicht angekommen sind
	var liste = cache.verbindungen.filter(function (v) {
		var z = v.teile.filter(function (t) { return t.art === "zug"; });
		return z.length && z[z.length - 1].istAn > jetzt;
	});
	if (!liste.length) { sendeFehler("Keine Verbindung gefunden"); return; }

	// nr 0 = erste Verbindung, deren erster Zug noch nicht abgefahren ist.
	// Frühere (nr < 0) sind solche, die schon unterwegs sind.
	var basis = 0;
	while (basis < liste.length - 1) {
		var erster = liste[basis].teile.filter(function (t) { return t.art === "zug"; })[0];
		if (erster.istAb >= jetzt) break;
		basis++;
	}
	var index = Math.max(0, Math.min(liste.length - 1, basis + (anfrage.nr || 0)));

	var hin = anfrage.richtung !== "rueck";
	var paket = aufbereitung.paket(liste, index, {
		richtung: hin ? konfig.HALTESTELLE_A + " → " + konfig.HALTESTELLE_B
			: konfig.HALTESTELLE_B + " → " + konfig.HALTESTELLE_A,
		ziel: hin ? konfig.HALTESTELLE_B : konfig.HALTESTELLE_A,
		quelle: quelle.name,
		nr: index - basis,
	});
	var text = JSON.stringify(paket);
	console.log("Paket für die Uhr: " + text.length + " Zeichen");
	sende({ VERBINDUNG: text });
}

function bearbeite(anfrage) {
	var alt = (Date.now() - cache.zeit) / 1000;
	if (!anfrage.neu && cache.richtung === anfrage.richtung && alt < konfig.CACHE_SEKUNDEN) {
		antworte(anfrage);
		return;
	}
	var hin = anfrage.richtung !== "rueck";
	// Ab 60 Minuten vor jetzt suchen, damit auch Verbindungen dabei sind,
	// in denen man gerade sitzt (für „frühere Verbindung“ und Ansicht C).
	var ab = new Date(Date.now() - 60 * 60000);
	quelle.suche(hin ? konfig.HALTESTELLE_A : konfig.HALTESTELLE_B,
		hin ? konfig.HALTESTELLE_B : konfig.HALTESTELLE_A, ab,
		function (fehler, verbindungen) {
			if (fehler) { sendeFehler(fehler); return; }
			cache = { richtung: anfrage.richtung, zeit: Date.now(), verbindungen: verbindungen };
			console.log(verbindungen.length + " Verbindungen gefunden");
			antworte(anfrage);
		});
}

// Handschlag mit der Uhr (steht nicht in der Doku, sondern im SDK-Quelltext
// pebble-appmessage.c): Die Uhr meldet sich beim Start mit Schlüssel 15025.
// Senden darf sie erst, wenn vom Handy irgendeine Nachricht zurückkam.
// Deshalb antworten wir beim Start und auf diese Meldung mit 15025 – die Uhr
// wertet diese Antwort nur als „Handy ist bereit“ und ignoriert den Inhalt.
// (Das Paket @moddable/pebbleproxy würde das erledigen; wir brauchen es nicht,
// weil das Netzwerk nur hier auf dem Handy genutzt wird.)
var BEREIT_SCHLUESSEL = 15025;

function meldeBereit() {
	var daten = {};
	daten[BEREIT_SCHLUESSEL] = 1;
	sende(daten);
}

Pebble.addEventListener("ready", function () {
	console.log("Pendelzug PKJS bereit");
	meldeBereit();
});

Pebble.addEventListener("appmessage", function (e) {
	if (e.payload[BEREIT_SCHLUESSEL] !== undefined) {
		meldeBereit();
		return;
	}
	if (!e.payload.ANFRAGE) return;
	var anfrage;
	try {
		anfrage = JSON.parse(e.payload.ANFRAGE);
	} catch (err) {
		sendeFehler("Anfrage der Uhr nicht lesbar");
		return;
	}
	console.log("Anfrage von der Uhr: " + e.payload.ANFRAGE);
	bearbeite(anfrage);
});
