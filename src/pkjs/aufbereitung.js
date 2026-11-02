// aufbereitung.js – macht aus einer Verbindung im neutralen Adapter-Format
// das kleine Paket für die Uhr. Unabhängig von der Datenquelle.
//
// Format des Pakets: siehe src/embeddedjs/testdaten.js (gleiches Format).

var konfig = require("./konfig");

// Platzhalter-Linienfarben (später nach hvv-Vorgaben)
var FARBE_S = "#AA00AA";
var FARBE_REGIO = "#555555";

// Millisekunden → „HH:MM“ in der Zeitzone des Handys
function hhmm(ms) {
	var d = new Date(ms);
	return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}

// Differenz in ganzen Minuten
function minuten(ms) {
	return Math.round(ms / 60000);
}

// Prüft eine Verbindung: Gibt es einen Ausfall oder einen verpassten Umstieg?
// Wird auch gebraucht, um eine Ersatzverbindung zu finden.
function umstiege(verbindung) {
	var ergebnis = [];        // Umstiegsminuten je Zug (null beim ersten Zug)
	var vorigerZug = null, fuss = 0;
	verbindung.teile.forEach(function (t) {
		if (t.art === "fuss") { fuss += t.dauer; return; }
		ergebnis.push(vorigerZug ? minuten(t.istAb - vorigerZug.istAn) - fuss : null);
		vorigerZug = t;
		fuss = 0;
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
		var teil = {
			art: "zug",
			linie: t.linie,
			farbe: /^S\d/.test(t.linie) ? FARBE_S : FARBE_REGIO,
			plan: hhmm(t.planAb),
			versp: Math.max(0, minuten(t.istAb - t.planAb)),
			ab: t.ab,
			gleis: t.gleis,
			an: hhmm(t.planAn),
			anVersp: Math.max(0, minuten(t.istAn - t.planAn)),
			umstieg: umst[zugNr++],
		};
		if (t.ausfall) teil.ausfall = true;   // nur mitschicken, wenn wahr (Paket klein halten)
		return teil;
	});

	// Ampel und Statustext
	var ausfall = zuege.some(function (t) { return t.ausfall; });
	var verpasst = umst.some(function (u) { return u !== null && u < 0; });
	var knapp = umst.some(function (u) { return u !== null && u >= 0 && u <= konfig.KNAPP_AB_MINUTEN; });
	var anVersp = Math.max(0, minuten(letzter.istAn - letzter.planAn));
	var ampel, status;
	if (ausfall)          { ampel = "rot";  status = "AUSFALL"; }
	else if (verpasst)    { ampel = "rot";  status = "ANSCHLUSS WEG"; }
	else if (knapp)       { ampel = "gelb"; status = "UMSTIEG KNAPP"; }
	else if (anVersp > 0) { ampel = "gelb"; status = "VERSPÄTET +" + anVersp; }
	else                  { ampel = "gruen"; status = "PÜNKTLICH"; }

	var ankunft = { plan: hhmm(letzter.planAn), versp: anVersp };
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
