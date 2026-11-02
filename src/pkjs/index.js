// index.js – Handy-Teil (PebbleKit JS) von Pendelzug.
//
// Ablauf:
//   1. Die Uhr schickt eine ANFRAGE (JSON): { richtung: "hin"|"rueck", schritt, neu }
//        schritt  0 = gemerkte Verbindung (siehe unten), -1 = eine frühere, +1 = eine spätere
//        neu      true = auf jeden Fall neu abfragen (Taste Select)
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
function ersterZug(verbindung) {
	return verbindung.teile.filter(function (t) { return t.art === "zug"; })[0];
}

// Eindeutige Kennung einer Verbindung: Linie und Plan-Abfahrt ALLER Züge.
// (Nur der erste Zug reicht nicht: Mit demselben RE6 gibt es oft zwei
// Verbindungen, z. B. über Elmshorn und über Altona.)
function kennung(verbindung) {
	return verbindung.teile
		.filter(function (t) { return t.art === "zug"; })
		.map(function (z) { return z.linie + "@" + z.planAb; })
		.join("|");
}

function antworte(anfrage) {
	var jetzt = Date.now();
	// Nur Verbindungen, die noch nicht angekommen sind
	var liste = cache.verbindungen.filter(function (v) {
		var z = v.teile.filter(function (t) { return t.art === "zug"; });
		return z.length && z[z.length - 1].istAn > jetzt;
	});
	if (!liste.length) { sendeFehler("Keine Verbindung gefunden"); return; }

	// „Nächste“ Verbindung = erste, deren erster Zug noch nicht abgefahren ist.
	// Frühere sind solche, die schon unterwegs sind.
	var basis = 0;
	while (basis < liste.length - 1) {
		if (ersterZug(liste[basis]).istAb >= jetzt) break;
		basis++;
	}

	// Gemerkte Verbindung: die zuletzt angezeigte, solange sie noch unterwegs
	// ist (sie steht dann noch in der Liste). So sieht man nach dem Einsteigen
	// weiter „seine“ Verbindung und nicht schon die nächste. Ist sie
	// angekommen oder unbekannt, gilt die nächste Verbindung.
	var schluessel = "gemerkt_" + anfrage.richtung;
	var gemerkt = localStorage.getItem(schluessel);
	var start = basis;
	for (var i = 0; i < liste.length; i++) {
		if (kennung(liste[i]) === gemerkt) { start = i; break; }
	}
	var index = Math.max(0, Math.min(liste.length - 1, start + (anfrage.schritt || 0)));
	localStorage.setItem(schluessel, kennung(liste[index]));

	var hin = anfrage.richtung !== "rueck";
	var paket = aufbereitung.paket(liste, index, {
		richtung: hin ? konfig.HALTESTELLE_A + " → " + konfig.HALTESTELLE_B
			: konfig.HALTESTELLE_B + " → " + konfig.HALTESTELLE_A,
		ziel: hin ? konfig.HALTESTELLE_B : konfig.HALTESTELLE_A,
		quelle: quelle.name,
		nr: index - basis,   // 0 = nächste, negativ = schon unterwegs, positiv = später
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
