// linienfarben.js – Farbe des Linien-Badges auf der Uhr.
//
// Herkunft der Farben: offene Fahrplandaten für Deutschland (DELFI, GTFS-Feld
// „route_color“), abgefragt über Transitous am 03.11.2026. Das sind die
// Farben, die die Verkehrsunternehmen für ihre Linien melden (S-Bahn Hamburg,
// DB Regio, Nordbahn, metronom …). Eine offizielle Farbtabelle des HVV haben
// wir nicht gefunden; Geofox GTI liefert keine Farben.
//
// Die Uhr (emery) kann nur 64 Farben: jeder Farbanteil Rot/Grün/Blau ist
// 00, 55, AA oder FF. Die Originalfarben sind deshalb von Hand auf die
// nächstliegende Uhr-Farbe gesetzt – so, dass der Farbton erhalten bleibt
// (rein rechnerisch würde z. B. das S3-Violett zu Grau).
//
// Schrift: weiß, außer bei hellen Farben – dann schwarz (Feld „schrift“).

// Linie → [Uhr-Farbe, Originalfarbe (nur zur Dokumentation)]
var TABELLE = {
	// S-Bahn Hamburg
	S1: ["#55AA55", "#4DA553"],   // grün
	S3: ["#550055", "#512C75"],   // violett
	S5: ["#55AAAA", "#3B87A9"],   // himmelblau
	S7: ["#AA5500", "#C07B35"],   // ocker
	// Regionalbahn / Regionalexpress
	RB31: ["#AA00AA", "#7F257B"],
	RB61: ["#0055AA", "#174094"],
	RB71: ["#00AAFF", "#008BD2"],
	RB81: ["#AAAA00", "#798E0E"],
	RE1: ["#005500", "#108449"],
	RE5: ["#FF0000", "#E30513"],
	RE6: ["#00AA55", "#00975F"],
	RE7: ["#FF5500", "#EF7C00"],
	RE70: ["#AA0055", "#C30732"],
	RE8: ["#AAFFFF", "#A3D9F0"],
	RE80: ["#FF55AA", "#D9338A"],
};

// Für alles Unbekannte (andere Linien, Busse, Fernverkehr): neutrales Grau.
var STANDARD = "#555555";

// Beliebige Farbe „#RRGGBB“ (oder „RRGGBB“) auf die nächste Uhr-Farbe runden,
// jeden Anteil einzeln. Nur für Linien, die nicht in der Tabelle stehen, aber
// eine Farbe aus den Daten mitbringen (Transitous liefert „routeColor“).
function aufUhrFarbe(hex) {
	var h = String(hex).replace("#", "");
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
	var stufen = ["00", "55", "AA", "FF"];
	var ergebnis = "#";
	for (var i = 0; i < 6; i += 2) {
		var wert = parseInt(h.substr(i, 2), 16);
		ergebnis += stufen[Math.round(wert / 85)];
	}
	return ergebnis;
}

// Helligkeit einer Farbe (0–255), wie das Auge sie empfindet.
function helligkeit(hex) {
	var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Farbe und Schriftfarbe für eine Linie.
//   linie       Linienname, z. B. „RB61“
//   datenFarbe  optional: Farbe aus der Datenquelle (z. B. Transitous)
// Ergebnis: { farbe: "#RRGGBB", schrift: "#000000" oder undefined (= weiß) }
function fuer(linie, datenFarbe) {
	var eintrag = TABELLE[String(linie).replace(/\s+/g, "")];
	var farbe = eintrag ? eintrag[0] : (datenFarbe && aufUhrFarbe(datenFarbe)) || STANDARD;
	// Ab dieser Helligkeit ist weiße Schrift schlecht lesbar → schwarz.
	return { farbe: farbe, schrift: helligkeit(farbe) > 150 ? "#000000" : undefined };
}

module.exports = {
	fuer: fuer,
};
