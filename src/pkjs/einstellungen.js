// einstellungen.js – liest die Einstellungen der Clay-Seite und baut daraus
// das Paket für die Uhr.
//
// Clay speichert alle Werte im localStorage des Handys unter „clay-settings“.
// Fehlt ein Wert (z. B. vor dem ersten Speichern), gilt der Standardwert.

var STANDARD = {
	ansicht: "A",
	knapp: 3,
	hinAn: true,
	hinTage: [true, true, true, true, true, false, false],
	hinVon: "07:00",
	hinBis: "09:00",
	rueckAn: false,
	rueckTage: [true, true, true, true, true, false, false],
	rueckVon: "16:00",
	rueckBis: "18:00",
	geofoxBenutzer: "",
	geofoxPasswort: "",
};

// Alle Einstellungen (mit Standardwerten ergänzt)
function lesen() {
	var gespeichert = {};
	try {
		gespeichert = JSON.parse(localStorage.getItem("clay-settings")) || {};
	} catch (e) {
		gespeichert = {};
	}
	var e = {};
	Object.keys(STANDARD).forEach(function (k) {
		e[k] = gespeichert[k] !== undefined && gespeichert[k] !== null ? gespeichert[k] : STANDARD[k];
	});
	e.knapp = Number(e.knapp) || STANDARD.knapp;
	return e;
}

// Nur das, was die Uhr braucht – OHNE Zugangsdaten
function fuerUhr() {
	var e = lesen();
	function fenster(an, tage, von, bis) {
		return { an: !!an, tage: tage.map(function (t) { return !!t; }), von: von, bis: bis };
	}
	return {
		ansicht: e.ansicht,
		knapp: e.knapp,
		hin: fenster(e.hinAn, e.hinTage, e.hinVon, e.hinBis),
		rueck: fenster(e.rueckAn, e.rueckTage, e.rueckVon, e.rueckBis),
	};
}

module.exports = {
	lesen: lesen,
	fuerUhr: fuerUhr,
};
