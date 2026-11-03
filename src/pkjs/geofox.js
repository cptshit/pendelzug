// geofox.js – Adapter für die Verbindungssuche bei hvv Geofox GTI.
//
// GTI ist die offizielle Schnittstelle des HVV (Hamburger Verkehrsverbund),
// betrieben von der HBT GmbH. Sie braucht Zugangsdaten (Benutzer/Passwort).
// Nutzungsbedingungen, kurz: App bleibt kostenlos, Serverlast gering halten,
// hvv-Liniendarstellung verwenden.
//
// Zwei Wege zum HVV:
//   1. Über den Pendelzug-Server (konfig.SERVER, auf wortreich.eu). Der hält
//      die Zugangsdaten. Das ist der Normalfall – Store-Nutzer haben keinen
//      eigenen Geofox-Zugang. Code des Servers: server/ im Repository.
//   2. Direkt, wenn auf der Einstellungsseite eigene Geofox-Zugangsdaten
//      stehen. Sie bleiben auf dem Handy; jede Anfrage wird hier signiert.
// Beide Wege liefern Daten im GTI-Format; die Umwandlung („teilstueck“) ist
// dieselbe.
//
// Doku: GTI-Handbuch, https://gti.geofox.de/html/GTIHandbuch_p.html
// Ausprobiert mit tools/gti-route.js (Teilschritt 3b).
//
// Liefert das neutrale Format (siehe „teilstueck“), damit aufbereitung.js und
// die Uhr nicht wissen müssen, woher die Daten kommen.

var konfig = require("./konfig");
var einstellungen = require("./einstellungen");
var signatur = require("./hmac-sha1").signatur;

var BASIS = "https://gti.geofox.de/gti/public/";
var API_VERSION = 63;

// Wie viele Verbindungen nach der ersten zusätzlich geholt werden. Zusammen
// 6 Verbindungen: Die Suche beginnt 60 Minuten vor jetzt (siehe index.js),
// damit auch die Verbindung dabei ist, in der man sitzt. (Der Server fragt
// mit derselben Zahl.)
var WEITERE_VERBINDUNGEN = 5;

// Eigene Zugangsdaten aus den Einstellungen – oder null, wenn keine da sind
// (dann geht es über den Server).
function eigenerZugang() {
	var e = einstellungen.lesen();
	var benutzer = String(e.geofoxBenutzer || "").trim();
	var passwort = String(e.geofoxPasswort || "");
	return benutzer && passwort ? { benutzer: benutzer, passwort: passwort } : null;
}

// -----------------------------------------------------------------------------
// Weg 1: Anfrage an den Pendelzug-Server (HTTP GET). callback(fehler, antwort)
// Der Server antwortet bei Fehlern mit { fehler: "Text für die Uhr" }.
// -----------------------------------------------------------------------------
function server(parameter, callback) {
	var teile = [];
	for (var k in parameter) teile.push(k + "=" + encodeURIComponent(parameter[k]));
	var xhr = new XMLHttpRequest();
	xhr.open("GET", konfig.SERVER + "?" + teile.join("&"), true);
	xhr.timeout = 20000;
	xhr.onload = function () {
		var json = null;
		try { json = JSON.parse(xhr.responseText); } catch (err) { json = null; }
		if (xhr.status === 200 && json && !json.fehler) { callback(null, json); return; }
		callback(json && json.fehler ? json.fehler : "Pendelzug-Server: Fehler " + xhr.status);
	};
	xhr.onerror = function () { callback("Pendelzug-Server nicht erreichbar"); };
	xhr.ontimeout = function () { callback("Pendelzug-Server antwortet nicht"); };
	console.log("Server: " + parameter.aktion);
	xhr.send();
}

// -----------------------------------------------------------------------------
// Weg 2: direkt an GTI: POST mit JSON und Signatur. callback(fehlertext, antwort)
// -----------------------------------------------------------------------------
function gti(methode, daten, callback) {
	var zugang = eigenerZugang();
	if (!zugang) {
		callback("Geofox-Zugangsdaten fehlen (Einstellungen)");
		return;
	}
	var benutzer = zugang.benutzer;
	var passwort = zugang.passwort;

	// Body genau EINMAL als Text erzeugen; genau dieser Text wird signiert
	// und verschickt. Jede Änderung danach machte die Signatur ungültig.
	daten.version = API_VERSION;
	var body = JSON.stringify(daten);

	var xhr = new XMLHttpRequest();
	xhr.open("POST", BASIS + methode, true);
	// Header laut GTI-Handbuch, Tabelle 1
	xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
	xhr.setRequestHeader("Accept", "application/json");
	xhr.setRequestHeader("geofox-auth-user", benutzer);
	xhr.setRequestHeader("geofox-auth-signature", signatur(body, passwort));
	xhr.setRequestHeader("geofox-auth-type", "HmacSHA1");
	xhr.timeout = 20000;
	xhr.onload = function () {
		if (xhr.status === 401) {
			callback("Geofox lehnt die Zugangsdaten ab");
			return;
		}
		var json = null;
		try { json = JSON.parse(xhr.responseText); } catch (err) { json = null; }
		if (!json) {
			callback("Geofox antwortet mit Fehler " + xhr.status);
			return;
		}
		// GTI meldet Fehler im Feld returnCode (z. B. ERROR_ROUTE = keine
		// Verbindung gefunden) und erklärt sie in errorText.
		if (json.returnCode !== "OK") {
			console.log("Geofox-Fehler: " + json.returnCode + " " + (json.errorDevInfo || ""));
			callback(json.errorText || ("Geofox: " + json.returnCode));
			return;
		}
		callback(null, json);
	};
	xhr.onerror = function () { callback("Keine Verbindung zu Geofox"); };
	xhr.ontimeout = function () { callback("Geofox antwortet nicht"); };
	// Nur Methode und Länge protokollieren – nie Benutzer oder Passwort.
	console.log("Geofox: POST " + methode + " (" + body.length + " Zeichen)");
	xhr.send(body);
}

// -----------------------------------------------------------------------------
// Haltestelle bei Geofox finden
// -----------------------------------------------------------------------------
// Start und Ziel in den Einstellungen stammen aus der Vorschlagssuche von
// Transitous (Kennung wie „de-DELFI_de:01056:98950“). Geofox hat eigene
// Kennungen („Master:98950“). Wir suchen deshalb einmal per checkName nach
// dem Namen und nehmen unter den Bahnhöfen/Haltestellen den, der am nächsten
// an den gespeicherten Koordinaten liegt. (Bei „Halstenbek“ kommen sonst auch
// Bushaltestellen wie „Halstenbeker Stieg“ in Frage.)
// Das Ergebnis merken wir uns im localStorage – danach kostet es keine
// Anfrage mehr.
function haltestelle(halt, callback) {
	var schluessel = "geofox_halt_" + halt.id;
	var gespeichert = localStorage.getItem(schluessel);
	if (gespeichert) {
		callback(null, JSON.parse(gespeichert));
		return;
	}
	halteSuchen(halt.name, function (fehler, liste) {
		if (fehler) { callback(fehler); return; }
		var treffer = liste.filter(function (r) { return r.type === "STATION"; });
		if (!treffer.length) { callback("Haltestelle „" + halt.name + "“ bei Geofox nicht gefunden"); return; }

		// Abstand zu den gespeicherten Koordinaten (grob, reicht zum Vergleichen).
		// Geofox: coordinate.x = Längengrad, coordinate.y = Breitengrad.
		var beste = treffer[0];
		if (halt.lat !== undefined && halt.lon !== undefined) {
			var abstand = function (r) {
				if (!r.coordinate) return Infinity;
				var dx = (r.coordinate.x - halt.lon) * Math.cos(halt.lat * Math.PI / 180);
				var dy = r.coordinate.y - halt.lat;
				return dx * dx + dy * dy;
			};
			treffer.forEach(function (r) { if (abstand(r) < abstand(beste)) beste = r; });
		}

		// Nur die Felder, die getRoute für start/dest braucht.
		var ergebnis = { name: beste.name, city: beste.city, combinedName: beste.combinedName, id: beste.id, type: beste.type };
		console.log("Geofox: Haltestelle " + halt.name + " = " + ergebnis.id + " (" + ergebnis.combinedName + ")");
		localStorage.setItem(schluessel, JSON.stringify(ergebnis));
		callback(null, ergebnis);
	});
}

// Haltestellen nach Namen suchen – direkt oder über den Server.
// callback(fehler, liste) mit Einträgen im GTI-Format (name, id, coordinate …)
function halteSuchen(name, callback) {
	if (eigenerZugang()) {
		gti("checkName", {
			theName: { name: name, type: "STATION" },
			maxList: 10,
			coordinateType: "EPSG_4326",
		}, function (fehler, antwort) {
			callback(fehler, fehler ? null : (antwort.results || []));
		});
	} else {
		server({ aktion: "halt", name: name }, function (fehler, antwort) {
			callback(fehler, fehler ? null : (antwort.halte || []));
		});
	}
}

// Verbindungen holen – direkt oder über den Server.
// callback(fehler, liste) mit GTI-„schedules“ (je { scheduleElements: […] })
function verbindungenHolen(von, nach, abZeit, callback) {
	if (eigenerZugang()) {
		gti("getRoute", {
			start: von,
			dest: nach,
			time: alsGtiZeit(abZeit),
			timeIsDeparture: true,          // „time“ ist Abfahrt, nicht Ankunft
			schedulesBefore: 0,
			schedulesAfter: WEITERE_VERBINDUNGEN,
			realtime: "REALTIME",           // Echtzeitdaten einbeziehen
			intermediateStops: false,       // Zwischenhalte brauchen wir nicht
		}, function (fehler, antwort) {
			// Mit Echtzeit liefert GTI „realtimeSchedules“; zur Sicherheit
			// auch die reine Fahrplanliste „schedules“ akzeptieren.
			callback(fehler, fehler ? null : (antwort.realtimeSchedules || antwort.schedules || []));
		});
	} else {
		// Der Server braucht nur die Kennungen und die Zeit als
		// „JJJJ-MM-TTTHH:MM“ (Ortszeit); die übrigen Werte setzt er selbst.
		var z = alsGtiZeit(abZeit);
		var d = z.date.split(".");
		server({
			aktion: "route",
			von: von.id,
			nach: nach.id,
			zeit: d[2] + "-" + d[1] + "-" + d[0] + "T" + z.time,
		}, function (fehler, antwort) {
			callback(fehler, fehler ? null : (antwort.verbindungen || []));
		});
	}
}

// -----------------------------------------------------------------------------
// Zeiten
// -----------------------------------------------------------------------------
function zweistellig(n) { return ("0" + n).slice(-2); }

// Date → GTITime { date: "TT.MM.JJJJ", time: "HH:MM" } (Ortszeit des Handys)
function alsGtiZeit(d) {
	return {
		date: zweistellig(d.getDate()) + "." + zweistellig(d.getMonth() + 1) + "." + d.getFullYear(),
		time: zweistellig(d.getHours()) + ":" + zweistellig(d.getMinutes()),
	};
}

// GTITime → Millisekunden seit 1970. GTI liefert Ortszeit ohne Zeitzone;
// wir lesen sie in der Zeitzone des Handys (in Hamburg also richtig).
function ausGtiZeit(z) {
	var d = z.date.split(".");
	var t = z.time.split(":");
	return new Date(Number(d[2]), Number(d[1]) - 1, Number(d[0]), Number(t[0]), Number(t[1])).getTime();
}

// -----------------------------------------------------------------------------
// Ein GTI-Teilstück („scheduleElement“) ins neutrale Format umwandeln.
// -----------------------------------------------------------------------------
function teilstueck(el) {
	var typ = el.line && el.line.type ? el.line.type.simpleType : "";

	// Umstiege innerhalb eines Bahnhofs: GTI liefert sie als eigene
	// Teilstücke „Umstiegsfußweg“ (CHANGE bzw. CHANGE_SAME_PLATFORM). Das ist
	// kein echter Fußweg, sondern Umsteigezeit – wir lassen ihn weg, wie bei
	// Die Umstiegszeit ist dann die volle Lücke zwischen den Zügen.
	if (typ === "CHANGE" || typ === "CHANGE_SAME_PLATFORM") return null;
	if (typ === "FOOTPATH") {
		if (el.from.name === el.to.name) return null;
		return { art: "fuss", dauer: Math.round((ausGtiZeit(el.to.arrTime) - ausGtiZeit(el.from.depTime)) / 60000) };
	}

	var planAb = ausGtiZeit(el.from.depTime);
	var planAn = ausGtiZeit(el.to.arrTime);
	// Verspätungen liefert GTI in Sekunden. Fehlt das Feld ganz, gibt es für
	// diesen Zug (noch) keine Echtzeitdaten – das ist NICHT „pünktlich“.
	var mitEchtzeit = el.from.depDelay !== undefined || el.to.arrDelay !== undefined;
	return {
		art: "zug",
		linie: (el.line && el.line.name) || "?",
		planAb: planAb,
		istAb: planAb + (el.from.depDelay || 0) * 1000,
		planAn: planAn,
		istAn: planAn + (el.to.arrDelay || 0) * 1000,
		ab: el.from.name,
		// GTI schreibt „Gleis 1“; die Uhr setzt selbst „Gl.“ davor.
		gleis: String(el.from.realtimePlatform || el.from.platform || "").replace(/^Gleis\s*/, ""),
		ausfall: !!(el.cancelled || el.from.cancelled || el.to.cancelled),
		echtzeit: mitEchtzeit,
	};
}

// -----------------------------------------------------------------------------
// Verbindungen suchen – Schnittstelle, die index.js aufruft
//   vonHalt, nachHalt  Haltestellen aus den Einstellungen: { id, name, lat, lon }
//   abZeit             Date: frühester Abfahrtszeitpunkt
//   callback(fehler, verbindungen)  – Liste von { teile: [...] }
// -----------------------------------------------------------------------------
function suche(vonHalt, nachHalt, abZeit, callback) {
	haltestelle(vonHalt, function (fehler, von) {
		if (fehler) { callback(fehler); return; }
		haltestelle(nachHalt, function (fehler, nach) {
			if (fehler) { callback(fehler); return; }
			verbindungenHolen(von, nach, abZeit, function (fehler, liste) {
				if (fehler) { callback(fehler); return; }
				var verbindungen = liste.map(function (s) {
					return {
						teile: (s.scheduleElements || []).map(teilstueck).filter(function (t) {
							return t && (t.art !== "fuss" || t.dauer >= 1);
						}),
					};
				}).filter(function (v) {
					// Verbindungen nur aus Fußwegen ergeben auf der Uhr keinen Sinn
					return v.teile.some(function (t) { return t.art === "zug"; });
				});
				callback(null, verbindungen);
			});
		});
	});
}

module.exports = {
	name: "hvv",
	suche: suche,
};
