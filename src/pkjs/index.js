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
// Einstellungen (Clay): Nach dem Speichern und bei jedem Start der Uhr-App
// schicken wir EINSTELLUNGEN (JSON) – nur Ansicht, Mindest-Umstiegszeit und
// Automatik-Fenster, nie die Zugangsdaten.
//
// Netzwerk gibt es nur hier auf dem Handy, nie auf der Uhr.

var konfig = require("./konfig");
var aufbereitung = require("./aufbereitung");
var einstellungen = require("./einstellungen");
var Clay = require("@rebble/clay");
var clayConfig = require("./config");

// autoHandleEvents: false = Clay schickt NICHT selbst alle Werte an die Uhr.
// Das machen wir unten, damit die Zugangsdaten auf dem Handy bleiben.
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });
// Eigenes Feld „Haltestelle mit Vorschlagssuche“ für Start und Ziel
clay.registerComponent(require("./haltestelle-feld"));
// Datenquelle (Adapter): der HVV über Geofox GTI – über den Pendelzug-Server
// oder, mit eigenen Zugangsdaten, direkt (das entscheidet geofox.js).
// Ein Adapter bietet die Funktion „suche“ und liefert das neutrale Format.
var geofox = require("./geofox");
function aktuelleQuelle() {
	return geofox;
}

// Zwischenspeicher der letzten Suche (mit Name der Quelle, die sie geliefert hat)
var cache = { richtung: null, zeit: 0, verbindungen: [], quelle: "" };

// Die Kopfzeile der Uhr („Start → Ziel“, fett 18 px) fasst etwa 22 Zeichen.
// Sind die Namen zusammen länger, kürzen wir beide gleichmäßig mit „…“.
var KOPF_ZEICHEN = 22;
function kopfzeile(von, nach) {
	var text = von + " → " + nach;
	if (text.length <= KOPF_ZEICHEN) return text;
	var rest = KOPF_ZEICHEN - 3;                 // 3 Zeichen für " → "
	var haelfte = Math.floor(rest / 2);
	function kurz(n, max) { return n.length <= max ? n : n.slice(0, max - 1) + "…"; }
	// Ist ein Name kurz, bekommt der andere dessen übrigen Platz;
	// sind beide lang, teilen sie sich den Platz.
	var maxVon, maxNach;
	if (nach.length <= haelfte) { maxNach = nach.length; maxVon = rest - nach.length; }
	else if (von.length <= haelfte) { maxVon = von.length; maxNach = rest - von.length; }
	else { maxVon = rest - haelfte; maxNach = haelfte; }
	return kurz(von, maxVon) + " → " + kurz(nach, maxNach);
}

// Start und Ziel der angefragten Richtung (aus den Einstellungen).
// Hinweg: Start → Ziel, Rückweg: Ziel → Start.
function strecke(richtung) {
	var e = einstellungen.lesen();
	return richtung === "rueck" ? { von: e.ziel, nach: e.start } : { von: e.start, nach: e.ziel };
}

// An die Uhr senden. „danach“ (optional) läuft erst, wenn die Uhr den Empfang
// bestätigt hat – so überholen sich zwei Nachrichten nicht.
function sende(daten, danach) {
	Pebble.sendAppMessage(daten,
		function () {
			console.log("an Uhr gesendet: " + Object.keys(daten).join(", "));
			if (danach) danach();
		},
		function (e) { console.log("Senden an Uhr fehlgeschlagen: " + JSON.stringify(e)); });
}

function sendeEinstellungen() {
	var text = JSON.stringify(einstellungen.fuerUhr());
	console.log("Einstellungen für die Uhr: " + text);
	sende({ EINSTELLUNGEN: text });
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

	var s = strecke(anfrage.richtung);
	var paket = aufbereitung.paket(liste, index, {
		richtung: kopfzeile(s.von.name, s.nach.name),
		ziel: s.nach.name,
		quelle: cache.quelle,
		nr: index - basis,   // 0 = nächste, negativ = schon unterwegs, positiv = später
	});
	var text = JSON.stringify(paket);
	console.log("Paket für die Uhr: " + text.length + " Zeichen");
	sende({ VERBINDUNG: text });
}

function bearbeite(anfrage) {
	var quelle = aktuelleQuelle();
	var alt = (Date.now() - cache.zeit) / 1000;
	if (!anfrage.neu && cache.richtung === anfrage.richtung && cache.quelle === quelle.name &&
		alt < konfig.CACHE_SEKUNDEN) {
		antworte(anfrage);
		return;
	}
	var s = strecke(anfrage.richtung);
	if (s.von.id === s.nach.id) { sendeFehler("Start und Ziel sind gleich – bitte in den Einstellungen ändern"); return; }
	// Ab 60 Minuten vor jetzt suchen, damit auch Verbindungen dabei sind,
	// in denen man gerade sitzt (für „frühere Verbindung“ und Ansicht C).
	var ab = new Date(Date.now() - 60 * 60000);
	console.log("Datenquelle: " + quelle.name);
	quelle.suche(s.von, s.nach, ab,
		function (fehler, verbindungen) {
			if (fehler) { sendeFehler(fehler); return; }
			cache = { richtung: anfrage.richtung, zeit: Date.now(), verbindungen: verbindungen, quelle: quelle.name };
			console.log(verbindungen.length + " Verbindungen gefunden (" + quelle.name + ")");
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

function meldeBereit(danach) {
	var daten = {};
	daten[BEREIT_SCHLUESSEL] = 1;
	sende(daten, danach);
}

Pebble.addEventListener("ready", function () {
	console.log("Pendelzug PKJS bereit");
	meldeBereit();
});

Pebble.addEventListener("appmessage", function (e) {
	if (e.payload[BEREIT_SCHLUESSEL] !== undefined) {
		// Uhr-App ist gestartet: bereit melden, danach die Einstellungen schicken
		meldeBereit(sendeEinstellungen);
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

// Einstellungsseite öffnen (Zahnrad in der Pebble-App auf dem Handy)
Pebble.addEventListener("showConfiguration", function () {
	Pebble.openURL(clay.generateUrl());
});

// Einstellungsseite geschlossen: Werte speichern (macht Clay im localStorage
// des Handys) und den für die Uhr bestimmten Teil senden.
Pebble.addEventListener("webviewclosed", function (e) {
	if (!e || !e.response) return;   // ohne Speichern geschlossen
	var vorher = JSON.stringify(strecke("hin"));
	clay.getSettings(e.response, false);
	// Die Uhr fragt danach die angezeigte Verbindung neu an. Das Handy bereitet
	// sie aus dem Zwischenspeicher mit der neuen Mindest-Umstiegszeit auf –
	// ohne neue Anfrage an die Datenquelle. Nur wenn sich Start oder Ziel
	// geändert haben, ist der Zwischenspeicher wertlos und wird geleert.
	// (Wechselt die Datenquelle, weil Geofox-Zugangsdaten eingetragen oder
	// gelöscht wurden, merkt bearbeite() das selbst und fragt neu.)
	if (JSON.stringify(strecke("hin")) !== vorher) {
		console.log("Strecke geändert: " + strecke("hin").von.name + " → " + strecke("hin").nach.name);
		cache = { richtung: null, zeit: 0, verbindungen: [], quelle: "" };
	}
	sendeEinstellungen();
});
