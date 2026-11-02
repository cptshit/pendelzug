// haltestelle-feld.js – eigenes Eingabefeld „Haltestelle mit Vorschlagssuche“
// für die Einstellungsseite (Clay).
//
// Clay kennt von sich aus nur einfache Felder (Text, Auswahl, Schalter …).
// Für Start und Ziel brauchen wir mehr: Man tippt ein paar Buchstaben, das
// Feld fragt Transitous nach passenden Haltestellen und zeigt Vorschläge.
// Gespeichert wird NUR ein angetippter Vorschlag – frei getippter Text, zu dem
// es keine Haltestelle gibt, kann man nicht speichern.
//
// So etwas heißt bei Clay „Custom Component“ (eigene Komponente):
//   template      HTML des Feldes
//   style         CSS (nur für Elemente mit der Klasse component-haltestelle)
//   manipulator   get()/set(): wie Clay den Wert liest und setzt
//   initialize    läuft auf der Einstellungsseite, sobald das Feld da ist
//
// WICHTIG: Clay wandelt die Funktionen hier mit .toString() in Text um und
// baut sie in die Einstellungsseite ein (eine Webseite auf dem Handy). Darum
// dürfen sie NICHTS von außen benutzen – kein require, keine Variablen
// außerhalb der Funktion. Alles, was sie brauchen, steht in ihnen selbst.
// Außerdem altmodisches JavaScript (var, function), weil die Webansicht
// mancher Handys ältere Browser-Versionen hat.
//
// Der gespeicherte Wert ist ein JSON-Text, z. B.
//   {"id":"de-DELFI_de:01056:98950","name":"Halstenbek","lat":53.63,"lon":9.84}
// id   = Haltestellen-Kennung bei Transitous (damit sucht transitous.js)
// name = Anzeigename (für die Uhr und für einen späteren Wechsel zu Geofox)
// lat/lon = Koordinaten (für die Vorschlagssuche: Haltestellen in der Nähe zuerst)

module.exports = {
	name: "haltestelle",

	// {{{label}}} usw. füllt Clay aus der Feld-Beschreibung in config.js.
	// data-manipulator-target markiert das Element, an das Clay Ereignisse hängt.
	template:
		// component-input: übernimmt das Aussehen der normalen Clay-Textfelder
		'<div class="component component-input component-haltestelle">' +
			'<label class="tap-highlight">' +
				'<span class="label">{{{label}}}</span>' +
				'<span class="input">' +
					'<input data-manipulator-target type="text" autocomplete="off" ' +
						'autocorrect="off" autocapitalize="off" spellcheck="false" ' +
						'placeholder="Haltestelle suchen …" />' +
				'</span>' +
			'</label>' +
			'<div class="hs-hinweis"></div>' +
			'<ul class="hs-liste"></ul>' +
			'{{if description}}<div class="description">{{{description}}}</div>{{/if}}' +
		'</div>',

	style:
		'.component-haltestelle .hs-liste { list-style: none; margin: 0; padding: 0; }' +
		'.component-haltestelle .hs-liste li { padding: 0.5rem 0.75rem; cursor: pointer;' +
			' border-top: 1px solid rgba(128,128,128,0.35); }' +
		'.component-haltestelle .hs-liste li.aktiv { background: rgba(255,71,0,0.25); }' +
		'.component-haltestelle .hs-name { font-weight: bold; }' +
		'.component-haltestelle .hs-info { font-size: 0.8em; opacity: 0.75; }' +
		'.component-haltestelle .hs-hinweis { font-size: 0.85em; padding: 0 0.75rem; }' +
		'.component-haltestelle .hs-hinweis:empty { display: none; }' +
		'.component-haltestelle .hs-hinweis.fehler { color: #ff5555; }',

	defaults: { label: "", description: "" },

	// Clay liest den Wert mit get() (beim Speichern) und setzt ihn mit set()
	// (beim Öffnen der Seite, aus den gespeicherten Einstellungen).
	// Den gewählten Wert merken wir uns im Attribut data-wert des Feldes,
	// nicht im Textfeld – dort steht ja oft gerade ein halb getippter Suchtext.
	manipulator: {
		get: function () {
			return this.$element[0].getAttribute("data-wert") || "";
		},
		set: function (wert) {
			var halt = null;
			try { halt = typeof wert === "string" ? JSON.parse(wert) : wert; } catch (e) { halt = null; }
			if (!halt || !halt.id || !halt.name) return this;
			this.$element[0].setAttribute("data-wert", JSON.stringify(halt));
			this.$manipulatorTarget[0].value = halt.name;
			return this.trigger("change");
		},
		hide: function () { this.$element[0].classList.add("hide"); return this; },
		show: function () { this.$element[0].classList.remove("hide"); return this; },
	},

	// Die eigentliche Vorschlagssuche. this = das Clay-Feld (ClayItem).
	initialize: function (minified, clayConfig) {
		var feld = this;
		var wurzel = feld.$element[0];
		var eingabe = feld.$manipulatorTarget[0];
		var liste = wurzel.querySelector(".hs-liste");
		var hinweis = wurzel.querySelector(".hs-hinweis");

		var URL = "https://api.transitous.org/api/v1/geocode";
		var WARTEZEIT = 300;     // ms nach dem letzten Tastendruck, dann erst suchen
		var MIN_ZEICHEN = 2;
		var ANZEIGEN = 8;        // so viele Vorschläge zeigen
		// Verkehrsmittel, die als „Bahn“ zählen (Bahnhöfe stehen weiter oben)
		var BAHN = ["HIGHSPEED_RAIL", "LONG_DISTANCE", "NIGHT_RAIL", "REGIONAL_FAST_RAIL",
			"REGIONAL_RAIL", "SUBURBAN", "RAIL", "METRO", "SUBWAY"];
		// Kurze deutsche Namen für die Verkehrsmittel in der Vorschlagsliste
		var NAMEN = {
			HIGHSPEED_RAIL: "Fernverkehr", LONG_DISTANCE: "Fernverkehr", NIGHT_RAIL: "Nachtzug",
			REGIONAL_FAST_RAIL: "Regionalzug", REGIONAL_RAIL: "Regionalzug", RAIL: "Bahn",
			SUBURBAN: "S-Bahn", METRO: "U-Bahn", SUBWAY: "U-Bahn", TRAM: "Straßenbahn",
			BUS: "Bus", COACH: "Fernbus", FERRY: "Fähre",
		};

		var zeitgeber = null;     // für das Warten nach dem Tippen
		var anfrageNr = 0;        // nur die Antwort der NEUESTEN Anfrage zählt
		var vorschlaege = [];
		var aktiv = -1;           // per Pfeiltaste markierter Vorschlag (am PC)

		function gewaehlt() {
			try { return JSON.parse(feld.get()); } catch (e) { return null; }
		}

		// Bezugspunkt für „in der Nähe zuerst“: die Haltestelle im ANDEREN
		// Feld (Start ↔ Ziel), sonst die bisher gewählte in diesem Feld.
		function bezugspunkt() {
			var andere = clayConfig.getItemsByType("haltestelle").filter(function (f) {
				return f !== feld;
			});
			var kandidaten = andere.concat([feld]);
			for (var i = 0; i < kandidaten.length; i++) {
				var h = null;
				try { h = JSON.parse(kandidaten[i].get()); } catch (e) { h = null; }
				if (h && typeof h.lat === "number") return h;
			}
			return null;
		}

		// Entfernung in km (Näherung, reicht für die Sortierung)
		function km(a, b) {
			var dy = (a.lat - b.lat) * 111;
			var dx = (a.lon - b.lon) * 111 * Math.cos(a.lat * Math.PI / 180);
			return Math.sqrt(dx * dx + dy * dy);
		}

		// Ort für die zweite Zeile: der „Standard“-Bereich (meist die Gemeinde)
		function ortVon(t) {
			var areas = t.areas || [];
			for (var i = 0; i < areas.length; i++) if (areas[i]["default"]) return areas[i].name;
			return areas.length ? areas[areas.length - 1].name : "";
		}

		function verkehrsmittel(t) {
			var gesehen = {};
			var texte = [];
			(t.modes || []).forEach(function (m) {
				var n = NAMEN[m];
				if (n && !gesehen[n]) { gesehen[n] = true; texte.push(n); }
			});
			return texte.join(", ");
		}

		// „Intelligente“ Reihenfolge: Transitous liefert schon eine sinnvolle
		// Reihenfolge (Platz 0, 1, 2 …). Davon ziehen wir Punkte ab für
		//   - Bahnhöfe (S-Bahn, Regionalzug, …): für eine Bahn-App wichtiger
		//   - Nähe zum Bezugspunkt: Pendler suchen meist in ihrer Gegend
		//     (sehr weit entfernte Treffer rutschen dafür nach unten)
		// Kleinste Zahl steht oben.
		function sortiere(treffer) {
			var bezug = bezugspunkt();
			var bewertet = treffer.map(function (t, platz) {
				var punkte = platz;
				var istBahn = (t.modes || []).some(function (m) { return BAHN.indexOf(m) >= 0; });
				if (istBahn) punkte -= 4;
				if (bezug && typeof t.lat === "number") {
					var d = km(bezug, t);
					if (d < 40) punkte -= 6;          // gleiche Gegend
					else if (d < 150) punkte -= 4;    // Umland, Nachbarstädte
					else if (d > 600) punkte += 4;    // weit weg (z. B. Ausland)
				}
				return { t: t, punkte: punkte, platz: platz };
			});
			bewertet.sort(function (a, b) { return a.punkte - b.punkte || a.platz - b.platz; });
			return bewertet.map(function (b) { return b.t; });
		}

		// Transitous sammelt Fahrpläne aus vielen Quellen. Dieselbe Haltestelle
		// kommt deshalb manchmal doppelt vor (gleicher Name, fast gleicher Ort).
		// Wir behalten nur den ersten, also besser bewerteten Eintrag.
		function ohneDoppelte(treffer) {
			var behalten = [];
			treffer.forEach(function (t) {
				var doppelt = behalten.some(function (b) {
					return b.name === t.name &&
						(typeof t.lat !== "number" || km(b, t) < 0.5);
				});
				if (!doppelt) behalten.push(t);
			});
			return behalten;
		}

		function zeigeHinweis(text, istFehler) {
			hinweis.textContent = text || "";
			hinweis.className = "hs-hinweis" + (istFehler ? " fehler" : "");
		}

		function leereListe() {
			vorschlaege = [];
			aktiv = -1;
			liste.innerHTML = "";
		}

		function markiere(i) {
			aktiv = i;
			var eintraege = liste.children;
			for (var k = 0; k < eintraege.length; k++) {
				eintraege[k].className = k === i ? "aktiv" : "";
			}
		}

		function zeigeListe(treffer) {
			leereListe();
			vorschlaege = treffer;
			treffer.forEach(function (t, i) {
				// textContent statt innerHTML: Namen kommen aus dem Netz und
				// könnten Zeichen wie < enthalten.
				var li = document.createElement("li");
				var name = document.createElement("div");
				name.className = "hs-name";
				name.textContent = t.name;
				var info = document.createElement("div");
				info.className = "hs-info";
				info.textContent = [ortVon(t), verkehrsmittel(t)].filter(Boolean).join(" · ");
				li.appendChild(name);
				li.appendChild(info);
				// mousedown statt click: kommt VOR dem „blur“ des Textfelds,
				// sonst wäre die Liste schon weg, bevor der Tipp ankommt.
				// (Auch auf dem Handy-Touchscreen löst ein Tipp „mousedown“ aus;
				// beim Wischen zum Blättern dagegen nicht.)
				li.addEventListener("mousedown", function (e) { e.preventDefault(); waehle(i); });
				liste.appendChild(li);
			});
		}

		function waehle(i) {
			var t = vorschlaege[i];
			if (!t) return;
			feld.set(JSON.stringify({ id: t.id, name: t.name, lat: t.lat, lon: t.lon }));
			leereListe();
			zeigeHinweis("");
			eingabe.blur();
		}

		function suche(text) {
			var nr = ++anfrageNr;
			var url = URL + "?type=STOP&language=de&numResults=15&text=" + encodeURIComponent(text);
			var bezug = bezugspunkt();
			if (bezug) url += "&place=" + bezug.lat + "," + bezug.lon;
			zeigeHinweis("Suche …");
			// Hinweis: Einen eigenen User-Agent kann eine Webseite nicht setzen
			// (verbietet der Browser). Transitous erlaubt Abfragen aus dem Browser
			// (Antwort-Kopf Access-Control-Allow-Origin: *).
			var xhr = new XMLHttpRequest();
			xhr.open("GET", url, true);
			xhr.timeout = 10000;
			xhr.onload = function () {
				if (nr !== anfrageNr) return;   // inzwischen weitergetippt
				var treffer = null;
				try { treffer = JSON.parse(xhr.responseText); } catch (e) { treffer = null; }
				if (xhr.status !== 200 || !treffer) {
					zeigeHinweis("Suche gerade nicht möglich (Fehler " + xhr.status + ")", true);
					return;
				}
				treffer = ohneDoppelte(sortiere(treffer.filter(function (t) { return t.id && t.name; })))
					.slice(0, ANZEIGEN);
				if (!treffer.length) {
					leereListe();
					zeigeHinweis("Keine Haltestelle gefunden", true);
					return;
				}
				zeigeHinweis("");
				zeigeListe(treffer);
			};
			xhr.onerror = xhr.ontimeout = function () {
				if (nr !== anfrageNr) return;
				zeigeHinweis("Suche gerade nicht möglich – Internetverbindung?", true);
			};
			xhr.send();
		}

		eingabe.addEventListener("input", function () {
			clearTimeout(zeitgeber);
			var text = eingabe.value.trim();
			if (text.length < MIN_ZEICHEN) {
				anfrageNr++;   // laufende Anfrage verwerfen
				leereListe();
				zeigeHinweis(text.length ? "Mindestens " + MIN_ZEICHEN + " Buchstaben" : "");
				return;
			}
			zeitgeber = setTimeout(function () { suche(text); }, WARTEZEIT);
		});

		// Beim Antippen den Text markieren: Man kann sofort neu tippen.
		eingabe.addEventListener("focus", function () { eingabe.select(); });

		// Feld verlassen ohne Auswahl: zurück zur gespeicherten Haltestelle.
		// So kann nie ein frei getippter Name gespeichert werden.
		eingabe.addEventListener("blur", function () {
			clearTimeout(zeitgeber);
			anfrageNr++;
			var h = gewaehlt();
			var getippt = eingabe.value.trim();
			eingabe.value = h ? h.name : "";
			leereListe();
			zeigeHinweis(h && getippt && getippt !== h.name
				? "Nicht übernommen – bitte einen Vorschlag antippen." : "");
		});

		// Bedienung am PC (Emulator-Test im Browser): Pfeiltasten und Enter
		eingabe.addEventListener("keydown", function (e) {
			if (!vorschlaege.length) return;
			if (e.key === "ArrowDown") { e.preventDefault(); markiere(Math.min(aktiv + 1, vorschlaege.length - 1)); }
			else if (e.key === "ArrowUp") { e.preventDefault(); markiere(Math.max(aktiv - 1, 0)); }
			else if (e.key === "Enter") { e.preventDefault(); waehle(aktiv >= 0 ? aktiv : 0); }
			else if (e.key === "Escape") { eingabe.blur(); }
		});
	},
};
