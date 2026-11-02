// transitous.js – Adapter für die Verbindungssuche bei Transitous.
//
// Transitous (https://transitous.org) ist ein freier, gemeinschaftlich
// betriebener Dienst auf Basis von MOTIS. Er braucht keinen Schlüssel.
// Nutzungsbedingungen (https://transitous.org/api/), kurz:
//   - nur für Open-Source-Projekte, sparsam abfragen
//   - jede Anfrage mit User-Agent: App-Name, Version, Kontakt
//   - sichtbarer Hinweis auf die Datenquellen (https://transitous.org/sources/)
//
// Jeder Adapter liefert dasselbe neutrale Format (siehe „teilstueck“ unten),
// damit aufbereitung.js und die Uhr nicht wissen müssen, woher die Daten kommen.
// Der spätere Geofox-Adapter (Schritt 6) muss nur dieselbe Funktion „suche“ anbieten.

var konfig = require("./konfig");

var BASIS = "https://api.transitous.org/api";

// HTTP-GET mit JSON-Antwort. callback(fehlertext, daten)
function holeJson(pfad, callback) {
	if (!konfig.KONTAKT) {
		callback("Kontakt fehlt in konfig.js – keine Anfrage gesendet");
		return;
	}
	var xhr = new XMLHttpRequest();
	xhr.open("GET", BASIS + pfad, true);
	// Pflicht laut Transitous: App-Name, Version, Kontakt
	xhr.setRequestHeader("User-Agent",
		konfig.APP_NAME + "/" + konfig.VERSION + " (" + konfig.KONTAKT + ")");
	xhr.timeout = 20000;
	xhr.onload = function () {
		if (xhr.status !== 200) {
			callback("Transitous antwortet mit Fehler " + xhr.status);
			return;
		}
		try {
			callback(null, JSON.parse(xhr.responseText));
		} catch (e) {
			callback("Antwort von Transitous nicht lesbar");
		}
	};
	xhr.onerror = function () { callback("Keine Verbindung zu Transitous"); };
	xhr.ontimeout = function () { callback("Transitous antwortet nicht"); };
	console.log("Transitous: GET " + pfad);
	xhr.send();
}

// Haltestellen-ID zu einem Namen suchen. Das Ergebnis wird im localStorage
// des Handys gespeichert, damit nur beim allerersten Mal gesucht wird.
function haltestelle(name, callback) {
	var schluessel = "transitous_halt_" + name;
	var gespeichert = localStorage.getItem(schluessel);
	if (gespeichert) {
		callback(null, JSON.parse(gespeichert));
		return;
	}
	holeJson("/v1/geocode?type=STOP&language=de&text=" + encodeURIComponent(name), function (fehler, treffer) {
		if (fehler) { callback(fehler); return; }
		if (!treffer || !treffer.length) { callback("Haltestelle „" + name + "“ nicht gefunden"); return; }
		var halt = { id: treffer[0].id, name: treffer[0].name };
		console.log("Transitous: Haltestelle " + name + " = " + halt.id + " (" + halt.name + ")");
		localStorage.setItem(schluessel, JSON.stringify(halt));
		callback(null, halt);
	});
}

// Ein MOTIS-Teilstück („leg“) in das neutrale Format umwandeln.
// Zeiten als Millisekunden seit 1970 (so kann aufbereitung.js rechnen).
function teilstueck(leg) {
	if (leg.mode === "WALK") {
		// Transitous setzt bei jedem Umstieg einen „Fußweg“ ein, auch innerhalb
		// desselben Bahnhofs (z. B. Elmshorn → Elmshorn, pauschal 5 Min).
		// Das ist kein echter Fußweg, sondern eine Umsteigezeit. Wir lassen ihn
		// weg; die Umstiegszeit ist dann die volle Lücke zwischen den Zügen.
		if (leg.from.name === leg.to.name) return null;
		return { art: "fuss", dauer: Math.round(leg.duration / 60) };
	}
	return {
		art: "zug",
		// Busse bleiben drin: Schienenersatzverkehr fährt als Bus (z. B. „RB60“ als BUS)
		linie: leg.routeShortName || leg.displayName || leg.tripShortName || "?",
		planAb: Date.parse(leg.scheduledStartTime),
		istAb: Date.parse(leg.startTime),
		planAn: Date.parse(leg.scheduledEndTime),
		istAn: Date.parse(leg.endTime),
		ab: leg.from.name,
		gleis: leg.from.track || leg.from.scheduledTrack || "",
		ausfall: !!leg.cancelled,
	};
}

// Verbindungen suchen.
//   vonName, nachName  Haltestellennamen aus konfig.js
//   abZeit             Date: frühester Abfahrtszeitpunkt
//   callback(fehler, verbindungen)  – Liste von { teile: [...] }
function suche(vonName, nachName, abZeit, callback) {
	haltestelle(vonName, function (fehler, von) {
		if (fehler) { callback(fehler); return; }
		haltestelle(nachName, function (fehler, nach) {
			if (fehler) { callback(fehler); return; }
			var pfad = "/v6/plan" +
				"?fromPlace=" + encodeURIComponent(von.id) +
				"&toPlace=" + encodeURIComponent(nach.id) +
				"&time=" + encodeURIComponent(abZeit.toISOString()) +
				"&numItineraries=6" +
				"&language=de";
			holeJson(pfad, function (fehler, antwort) {
				if (fehler) { callback(fehler); return; }
				var verbindungen = (antwort.itineraries || []).map(function (it) {
					return {
						teile: it.legs.map(teilstueck).filter(function (t) {
							// weggelassene Teilstücke (null) und Fußwege unter einer Minute entfernen
							return t && (t.art !== "fuss" || t.dauer >= 1);
						}),
					};
				});
				callback(null, verbindungen);
			});
		});
	});
}

module.exports = {
	name: "Transitous",
	suche: suche,
};
