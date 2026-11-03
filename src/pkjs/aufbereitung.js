// aufbereitung.js – macht aus einer Verbindung im neutralen Adapter-Format
// das kleine Paket für die Uhr. Unabhängig von der Datenquelle.
//
// Format des Pakets: siehe src/embeddedjs/testdaten.js (gleiches Format).

var einstellungen = require("./einstellungen");
var linienfarben = require("./linienfarben");

// Millisekunden → „HH:MM“ in der Zeitzone des Handys
function hhmm(ms) {
	var d = new Date(ms);
	return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}

// Differenz in ganzen Minuten
function minuten(ms) {
	return Math.round(ms / 60000);
}

// Umstiegszeit je Zug (null beim ersten Zug) = Zeit von der Ist-Ankunft des
// vorigen Zugs bis zur Ist-Abfahrt dieses Zugs. Ein Fußweg dazwischen zählt
// mit hinein. Grund: Transitous plant Fußwege oft großzügig (z. B. 7 Min
// Hamburg-Altona → S-Bahn Altona) und lässt danach 0 Min Puffer. Würden wir
// den Fußweg abziehen, wäre jeder solche Umstieg „knapp“.
function umstiege(verbindung) {
	var ergebnis = [];
	var vorigerZug = null;
	verbindung.teile.forEach(function (t) {
		if (t.art === "fuss") return;
		ergebnis.push(vorigerZug ? minuten(t.istAb - vorigerZug.istAn) : null);
		vorigerZug = t;
	});
	return ergebnis;
}

function zuegeVon(verbindung) {
	return verbindung.teile.filter(function (t) { return t.art === "zug"; });
}

function hatProblem(verbindung) {
	return zuegeVon(verbindung).some(function (t) { return t.ausfall; }) ||
		umstiege(verbindung).some(function (u) { return u !== null && u < 0; });
}

// Paket für die Uhr bauen.
//   verbindungen  alle gefundenen Verbindungen (für die Ersatz-Ankunft)
//   index         welche davon angezeigt wird
//   info          { richtung, ziel, quelle, nr }
function paket(verbindungen, index, info) {
	var verbindung = verbindungen[index];
	var zuege = zuegeVon(verbindung);
	var umst = umstiege(verbindung);
	var letzter = zuege[zuege.length - 1];

	var zugNr = 0;
	var teile = verbindung.teile.map(function (t) {
		if (t.art === "fuss") return { art: "fuss", dauer: t.dauer };
		var farben = linienfarben.fuer(t.linie, t.datenFarbe);
		var teil = {
			art: "zug",
			linie: t.linie,
			farbe: farben.farbe,
			plan: hhmm(t.planAb),
			versp: Math.max(0, minuten(t.istAb - t.planAb)),
			ab: t.ab,
			gleis: t.gleis,
			an: hhmm(t.planAn),
			anVersp: Math.max(0, minuten(t.istAn - t.planAn)),
			umstieg: umst[zugNr++],
		};
		if (t.ausfall) teil.ausfall = true;   // nur mitschicken, wenn wahr (Paket klein halten)
		if (farben.schrift) teil.schrift = farben.schrift;   // nur bei heller Badge-Farbe
		// Keine Echtzeitdaten für diesen Zug: Die Uhr zeigt dann die Plan-Zeit
		// grau und ohne „+0“ – „+0“ würde „pünktlich“ behaupten.
		if (t.echtzeit === false) teil.ohneEz = true;
		return teil;
	});

	// Ampel und Statustext
	var ausfall = zuege.some(function (t) { return t.ausfall; });
	var verpasst = umst.some(function (u) { return u !== null && u < 0; });
	// Mindest-Umstiegszeit aus den Einstellungen (Clay), Standard 3 Minuten
	var grenze = einstellungen.lesen().knapp;
	var knapp = umst.some(function (u) { return u !== null && u >= 0 && u <= grenze; });
	var anVersp = Math.max(0, minuten(letzter.istAn - letzter.planAn));
	// Hat KEIN Zug der Verbindung Echtzeitdaten, können wir nichts über
	// Pünktlichkeit sagen: graues Band „KEINE ECHTZEIT“ statt grün.
	// Hat nur ein Teil Echtzeit, bewertet die Ampel diese Züge; die übrigen
	// gehen mit ihrer Plan-Zeit ein (Verspätung 0).
	var keineEchtzeit = zuege.every(function (t) { return t.echtzeit === false; });
	var ampel, status;
	if (ausfall)            { ampel = "rot";  status = "AUSFALL"; }
	else if (keineEchtzeit) { ampel = "grau"; status = "KEINE ECHTZEIT"; }
	else if (verpasst)    { ampel = "rot";  status = "ANSCHLUSS WEG"; }
	else if (knapp)       { ampel = "gelb"; status = "UMSTIEG KNAPP"; }
	else if (anVersp > 0) { ampel = "gelb"; status = "VERSPÄTET +" + anVersp; }
	else                  { ampel = "gruen"; status = "PÜNKTLICH"; }

	var ankunft = { plan: hhmm(letzter.planAn), versp: anVersp };
	if (letzter.echtzeit === false) ankunft.ohneEz = true;
	// Bei Rot: Ankunft der nächsten Verbindung ohne Problem („an 08:21 statt 07:58“)
	if (ampel === "rot") {
		for (var i = index + 1; i < verbindungen.length; i++) {
			if (!hatProblem(verbindungen[i])) {
				var z = zuegeVon(verbindungen[i]);
				ankunft.ersatz = hhmm(z[z.length - 1].istAn);
				break;
			}
		}
	}

	return {
		richtung: info.richtung,
		ziel: info.ziel,
		ampel: ampel,
		status: status,
		teile: teile,
		ankunft: ankunft,
		quelle: info.quelle,
		stand: hhmm(Date.now()),
		nr: info.nr,
	};
}

module.exports = {
	paket: paket,
	hatProblem: hatProblem,
};
