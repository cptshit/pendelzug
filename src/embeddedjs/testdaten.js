// testdaten.js – fest eingebaute Beispiel-Verbindungen für Schritt 1.
//
// Warum es diese Datei gibt: Die Uhr-Ansicht soll fertig sein, bevor echte
// Daten vom Handy kommen (Schritt 3). Deshalb gibt es hier drei typische
// Situationen, zwischen denen man im Emulator mit Auf/Ab umschaltet.
//
// Das Format ist absichtlich genau das, was später PKJS an die Uhr schickt.
// Dann muss die Ansicht nicht mehr geändert werden, nur die Datenquelle.
//
// Aufbau einer Verbindung:
//   richtung   Text für die Kopfzeile
//   ziel       Zielbahnhof, z. B. für „Ankunft Itzehoe“ (Ansicht B)
//   ampel      "gruen" | "gelb" | "rot" (Farbe des Statusbands),
//              "grau" = kein Zug der Verbindung hat Echtzeitdaten
//   status     Text im Statusband (Farbe nie allein, immer auch Text)
//   teile      Liste der Teilstücke, in Fahrtreihenfolge:
//     art      "zug" (S-Bahn, Regionalzug usw.) oder "fuss" (Fußweg)
//     linie    Linienname, z. B. "S3"
//     farbe    Badge-Farbe (aus src/pkjs/linienfarben.js)
//     schrift  Schriftfarbe im Badge, nur bei hellen Farben ("#000000"); sonst weiß
//     plan     Plan-Abfahrt "HH:MM"
//     versp    Verspätung in Minuten (0 = pünktlich)
//     ausfall  true, wenn der Zug ausfällt
//     ohneEz   true, wenn es für diesen Zug keine Echtzeitdaten gibt (dann
//              Plan-Zeit grau, kein „+0“); fehlt sonst
//     ab       Abfahrtsort dieses Teilstücks
//     an       Plan-Ankunft am Ende dieses Teilstücks "HH:MM"
//     anVersp  Verspätung bei der Ankunft in Minuten
//     gleis    Abfahrtsgleis (oder "" wenn unbekannt)
//     umstieg  Minuten, die zum Umsteigen bleiben (null beim ersten Teilstück);
//              negativ = Anschluss nicht mehr erreichbar
//     dauer    nur bei Fußweg: Gehzeit in Minuten
//   ankunft    { plan: "HH:MM", versp: Minuten, ersatz: "HH:MM", ohneEz: true }
//              ohneEz nur, wenn der letzte Zug keine Echtzeitdaten hat
//              ersatz nur bei Rot: Ankunft der nächsten Verbindung ohne Problem
//   stand      Uhrzeit der letzten Aktualisierung "HH:MM"
//   quelle     Name der Datenquelle für den Hinweis „Daten: … · ohne Gewähr“
//              (setzt der Adapter in PKJS: „hvv“)
//   jetzt      NUR IN DEN TESTDATEN: feste Uhrzeit „HH:MM“, mit der Countdowns
//              gerechnet werden, damit sie zu den ausgedachten Fahrzeiten passen.
//              Ohne dieses Feld (ab Schritt 3) nimmt die App die echte Uhrzeit.
//
// Die Fahrzeiten sind ausgedacht und stimmen nicht mit dem echten Fahrplan überein.
// Die Umstiegszeiten passen aber rechnerisch zu den Ankunfts- und Abfahrtszeiten:
// Umstieg = Ist-Abfahrt des nächsten Zugs − Ist-Ankunft des vorigen
// (ein Fußweg dazwischen zählt mit hinein, wie in src/pkjs/aufbereitung.js).

// Farben wie in src/pkjs/linienfarben.js
const S3 = "#550055";     // S3 violett
const RB61 = "#0055AA";   // blau
const RB71 = "#00AAFF";   // hellblau
const RE6 = "#00AA55";    // grün

export default [
	// 1) Alles pünktlich, ein Umstieg mit viel Puffer
	{
		richtung: "Halstenbek → Itzehoe",
		ziel: "Itzehoe",
		ampel: "gruen",
		status: "PÜNKTLICH",
		teile: [
			{ art: "zug", linie: "S3", farbe: S3, plan: "07:12", versp: 0, ab: "Halstenbek", gleis: "1", an: "07:32", anVersp: 0, umstieg: null },
			{ art: "zug", linie: "RE6", farbe: RE6, plan: "07:41", versp: 0, ab: "Elmshorn", gleis: "3", an: "07:58", anVersp: 0, umstieg: 9 },
		],
		ankunft: { plan: "07:58", versp: 0 },
		quelle: "hvv",
		stand: "07:05",
		jetzt: "07:06",   // vor der Abfahrt der S3
	},
	// 2) S3 verspätet, dadurch wird der erste Umstieg knapp
	{
		richtung: "Halstenbek → Itzehoe",
		ziel: "Itzehoe",
		ampel: "gelb",
		status: "UMSTIEG KNAPP",
		teile: [
			{ art: "zug", linie: "S3", farbe: S3, plan: "07:12", versp: 3, ab: "Halstenbek", gleis: "1", an: "07:19", anVersp: 3, umstieg: null },
			{ art: "zug", linie: "RB71", farbe: RB71, plan: "07:24", versp: 0, ab: "Pinneberg", gleis: "2", an: "07:35", anVersp: 1, umstieg: 2 },
			{ art: "zug", linie: "RE6", farbe: RE6, plan: "07:41", versp: 1, ab: "Elmshorn", gleis: "3", an: "07:58", anVersp: 1, umstieg: 6 },
		],
		ankunft: { plan: "07:58", versp: 1 },
		quelle: "hvv",
		stand: "07:16",
		jetzt: "07:17",   // schon in der S3, Umstieg in Pinneberg steht bevor
	},
	// 3) S3 stark verspätet, der Anschluss nach dem Fußweg ist weg
	{
		richtung: "Halstenbek → Itzehoe",
		ziel: "Itzehoe",
		ampel: "rot",
		status: "ANSCHLUSS WEG",
		teile: [
			{ art: "zug", linie: "S3", farbe: S3, plan: "07:12", versp: 16, ab: "Halstenbek", gleis: "1", an: "07:28", anVersp: 16, umstieg: null },
			{ art: "fuss", dauer: 4 },
			{ art: "zug", linie: "RE6", farbe: RE6, plan: "07:41", versp: 0, ab: "Elmshorn", gleis: "3", an: "07:58", anVersp: 0, umstieg: -3 },
		],
		ankunft: { plan: "07:58", versp: 0, ersatz: "08:21" },
		quelle: "hvv",
		stand: "07:21",
		jetzt: "07:22",   // S3 fährt wegen Verspätung erst 07:28
	},
	// 4) Warten am Umstieg: S3 ist schon in Pinneberg angekommen, die RB71 kommt gleich
	{
		richtung: "Halstenbek → Itzehoe",
		ziel: "Itzehoe",
		ampel: "gruen",
		status: "PÜNKTLICH",
		teile: [
			{ art: "zug", linie: "S3", farbe: S3, plan: "07:12", versp: 0, ab: "Halstenbek", gleis: "1", an: "07:18", anVersp: 0, umstieg: null },
			{ art: "zug", linie: "RB71", farbe: RB71, plan: "07:24", versp: 0, ab: "Pinneberg", gleis: "2", an: "07:34", anVersp: 0, umstieg: 6 },
			{ art: "zug", linie: "RE6", farbe: RE6, plan: "07:41", versp: 0, ab: "Elmshorn", gleis: "3", an: "07:58", anVersp: 0, umstieg: 7 },
		],
		ankunft: { plan: "07:58", versp: 0 },
		quelle: "hvv",
		stand: "07:21",
		jetzt: "07:22",   // S3 seit 07:18 angekommen, RB71 fährt 07:24
	},
];
