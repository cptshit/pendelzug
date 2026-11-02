// main.js – Uhr-Code von Pendelzug (läuft auf der Pebble, nicht auf dem Handy).
//
// Stand Schritt 3: echte Verbindungen vom Handy (PKJS), drei Ansichten:
//   A – Liste:            alle Teilstücke untereinander
//   B – Ankunft groß:     große Ankunftszeit, Strecke als Leiste, nächste Abfahrt
//   C – Nächster Schritt: „JETZT“ und „DANN“
// Welche Ansicht gezeigt wird, steht auf der Einstellungsseite (Standard A).
//
// Tasten:
//   Auf / Ab     frühere / spätere Verbindung
//   Select       neu laden
//   Select lang  Richtung umschalten (Hinweg ⇄ Rückweg)
//   Zurück       App schließen
//
// Testbetrieb (TESTBETRIEB = true weiter unten): feste Testdaten wie in
// Schritt 2. Dann blättern Auf/Ab durch die Test-Zustände und Select
// wechselt die Ansicht (A → B → C).
//
// Die Oberfläche ist mit Piu gebaut, dem Oberflächen-Framework von Alloy.
// Piu arbeitet mit „Content“-Objekten (Rechtecke), die in „Containern“
// verschachtelt werden. Aussehen kommt aus „Skins“ (Füllfarbe) und
// „Styles“ (Schrift, Textfarbe). Die Piu-Klassen (Application, Container,
// Label, Skin, Style, RoundRect …) sind global verfügbar, ohne import.
//
// Bildschirm der Pebble Time 2 (emery): 200 × 228 Pixel, 64 Farben.

import Message from "pebble/message";
import testdaten from "testdaten";

// true = feste Testdaten statt echter Verbindungen (zum Prüfen der Ansichten)
const TESTBETRIEB = false;

// Ab wie vielen Millisekunden gilt ein Druck auf Select als „lang“?
const LANG_MS = 700;

// ---------------------------------------------------------------------------
// Farben (aus dem freigegebenen Design in CLAUDE.md)
// ---------------------------------------------------------------------------
const FARBE = {
	text: "#000000",
	grau: "#555555",          // Nebentext
	linie: "#AAAAAA",         // Trennlinien, Fußweg in der Strecken-Leiste
	puenktlich: "#005500",    // Verspätungstext „pünktlich“
	verspaetet: "#AA5500",    // Verspätungstext „verspätet“ / knapp
	problem: "#AA0000",       // Ausfall, Anschluss weg
};

// Statusband: Hintergrund und passende Schriftfarbe je Ampelfarbe
const AMPEL = {
	gruen: { grund: "#55FF55", schrift: "#000000" },
	gelb:  { grund: "#FFFF00", schrift: "#000000" },
	rot:   { grund: "#AA0000", schrift: "#FFFFFF" },
};

// Textfarbe der Fußzeile je Gesamtstatus (Ampel). Die Fußzeile richtet sich
// immer nach dem Gesamtstatus, nicht nach der Verspätung des letzten Teilstücks.
const AMPEL_TEXT = {
	gruen: FARBE.puenktlich,
	gelb: FARBE.verspaetet,
	rot: FARBE.problem,
};

// Einstellungen von der Einstellungsseite (Clay), vom Handy geschickt und im
// localStorage der Uhr gespeichert. Standardwerte gelten bis zum ersten Empfang.
//   ansicht  "A" | "B" | "C"
//   knapp    Mindest-Umstiegszeit in Minuten:
//              Umstiegszeit ≤ knapp → „knapp“ (gelb), negativ → „verpasst“ (rot)
//   hin, rueck  Automatik-Fenster { an, tage[Mo..So], von, bis } (für Schritt 5)
const STANDARD_EINSTELLUNGEN = {
	ansicht: "A",
	knapp: 3,
	hin: { an: true, tage: [true, true, true, true, true, false, false], von: "07:00", bis: "09:00" },
	rueck: { an: false, tage: [true, true, true, true, true, false, false], von: "16:00", bis: "18:00" },
};

function ladeEinstellungen() {
	try {
		const text = localStorage.getItem("einstellungen");
		if (text) return { ...STANDARD_EINSTELLUNGEN, ...JSON.parse(text) };
	} catch {
		console.log("Gespeicherte Einstellungen nicht lesbar");
	}
	return { ...STANDARD_EINSTELLUNGEN };
}

let einstellungen = ladeEinstellungen();
let KNAPP_AB_MINUTEN = einstellungen.knapp;

// Maße in Pixeln. Ganz unten steht in jeder Ansicht eine eigene 14-px-Zeile
// mit dem Quellenhinweis „Daten: … · ohne Gewähr“ (freigegeben), darüber die
// Fußzeile. Deshalb sind Kopfzeile, Band und Teilstücke etwas kompakter.
const MASS = { kopf: 24, band: 26, zug: 42, zeile2: 24, fussLinie: 46, fussUnten: 18 };

// ---------------------------------------------------------------------------
// Skins und Styles
// ---------------------------------------------------------------------------
// Skins und Styles einmal anlegen und wiederverwenden. Das spart Speicher,
// denn JavaScript hat auf der Uhr nur 56 kB (siehe src/c/mdbl.c).
//
// Schriften: Pebble-Systemschriften, Schreibweise „[Gewicht] [Größe]px Familie“.
// Die Größe muss exakt in der Schrifttabelle der Firmware stehen:
// Gothic gibt es in 14, 18, 24 und 28 (fett und normal), für die große
// Ankunftszeit nehmen wir Bitham fett in 42.

const weissSkin = new Skin({ fill: "white" });
const linieSkin = new Skin({ fill: FARBE.linie });

// Für jede Ampelfarbe ein Skin (Bandfarbe) und ein Style (Schriftfarbe)
const bandSkin = {};
const bandStyle = {};
for (const name in AMPEL) {
	bandSkin[name] = new Skin({ fill: AMPEL[name].grund });
	bandStyle[name] = new Style({ font: "bold 18px Gothic", color: AMPEL[name].schrift, horizontal: "center" });
}

const kopfStyle       = new Style({ font: "bold 18px Gothic", color: FARBE.text, horizontal: "center" });
const zeitStyle       = new Style({ font: "bold 24px Gothic", color: FARBE.text, horizontal: "left" });
const zeit28Style     = new Style({ font: "bold 28px Gothic", color: FARBE.text, horizontal: "left" });
const grossStyle      = new Style({ font: "bold 42px Bitham", color: FARBE.text, horizontal: "left" });
const gleisStyle      = new Style({ font: "18px Gothic", color: FARBE.grau, horizontal: "right" });
const badgeStyle      = new Style({ font: "bold 18px Gothic", color: "white", horizontal: "center" });
const leisteStyle     = new Style({ font: "bold 14px Gothic", color: "white", horizontal: "center" });
const leisteFussStyle = new Style({ font: "bold 14px Gothic", color: FARBE.text, horizontal: "center" });
const fussStyle       = new Style({ font: "18px Gothic", color: FARBE.grau, horizontal: "left" });
const textStyle       = new Style({ font: "18px Gothic", color: FARBE.text, horizontal: "left" });
const countdownStyle  = new Style({ font: "bold 18px Gothic", color: FARBE.text, horizontal: "right" });
const zwischenStyle   = new Style({ font: "bold 14px Gothic", color: FARBE.grau, horizontal: "left" });
const standStyle      = new Style({ font: "14px Gothic", color: FARBE.grau, horizontal: "right" });
const hinweisStyle    = new Style({ font: "14px Gothic", color: FARBE.grau, horizontal: "center" });
const zielStyle       = new Style({ font: "18px Gothic", color: FARBE.grau, horizontal: "center" });

// Styles und Skins, deren Farbe sich nach dem Zustand richtet: bei Bedarf
// einmal anlegen und im Zwischenspeicher (Cache) ablegen, statt bei jedem
// Neuzeichnen neue Objekte zu erzeugen.
const styleCache = {};
function farbStyle(font, farbe, horizontal = "left") {
	const key = font + farbe + horizontal;
	return styleCache[key] ??= new Style({ font, color: farbe, horizontal });
}
const skinCache = {};
function farbSkin(farbe) {
	return skinCache[farbe] ??= new Skin({ fill: farbe });
}

// ---------------------------------------------------------------------------
// Uhrzeiten rechnen
// ---------------------------------------------------------------------------
// Intern rechnen wir mit „Minuten seit Mitternacht“, z. B. 07:12 → 432.

function minuten(hhmm) {
	return parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10);
}

// Ist-Abfahrt eines Teilstücks = Plan-Zeit + Verspätung
function istAb(teil) {
	return minuten(teil.plan) + (teil.versp || 0);
}

// Aktuelle Uhrzeit in Minuten. Die Testdaten geben eine feste Zeit vor
// (Feld „jetzt“), sonst gilt die echte Uhrzeit der Uhr.
function jetztMinuten(verbindung) {
	if (verbindung.jetzt) return minuten(verbindung.jetzt);
	const d = new Date();
	return d.getHours() * 60 + d.getMinutes();
}

// Minuten von „jetzt“ bis zu einer Uhrzeit. Über Mitternacht hinweg
// (z. B. jetzt 23:58, Abfahrt 00:03) kommt trotzdem +5 heraus.
function minutenBis(ziel, jetzt) {
	let d = ziel - jetzt;
	if (d < -720) d += 1440;
	if (d > 720) d -= 1440;
	return d;
}

// Ist-Ankunft eines Teilstücks = Plan-Ankunft + Ankunftsverspätung
function istAn(teil) {
	return minuten(teil.an) + (teil.anVersp || 0);
}

// Ist dieses Teilstück schon abgefahren? (gerechnet mit der Ist-Zeit)
function abgefahren(teil, jetzt) {
	return minutenBis(istAb(teil), jetzt) < 0;
}

// Countdown-Text, gerechnet mit der Ist-Zeit (Plan + Verspätung)
function countdown(teil, jetzt) {
	const d = minutenBis(istAb(teil), jetzt);
	if (d > 0) return "in " + d + " Min";
	if (d === 0) return "jetzt";
	return "abgefahren";
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen für Texte
// ---------------------------------------------------------------------------

// Verspätung als Text + Farbe. Bei Ausfall: „fällt aus“ in Rot.
function verspaetung(teil) {
	if (teil.ausfall) return { text: "fällt aus", farbe: FARBE.problem };
	if (teil.versp > 0) return { text: "+" + teil.versp, farbe: FARBE.verspaetet };
	return { text: "+0", farbe: FARBE.puenktlich };
}

// Hat dieses Teilstück eine Umstiegszeit (also nicht das erste Teilstück)?
function hatUmstieg(teil) {
	return teil.umstieg !== null && teil.umstieg !== undefined;
}

// Farbe einer Umstiegszeit: verpasst = rot, knapp = gelb(-braun), sonst grün
function umstiegFarbe(min) {
	if (min < 0) return FARBE.problem;
	if (min <= KNAPP_AB_MINUTEN) return FARBE.verspaetet;
	return FARBE.puenktlich;
}

// Zweite Zeile eines Teilstücks: beim ersten Teilstück der Abfahrtsort,
// danach die Umstiegszeit (farbig, wenn knapp oder verpasst).
function zweiteZeile(teil) {
	if (!hatUmstieg(teil))
		return { text: "ab " + teil.ab, farbe: FARBE.grau };
	// In 14 px passen etwa 26 Zeichen auf die Zeile. Bei langen Ortsnamen
	// (z. B. „Hamburg-Altona“) lassen wir deshalb das Wort „Umstieg“ weg.
	const kurz = text => text.length > 26 ? text.replace("Umstieg ", "") : text;
	if (teil.umstieg < 0)
		return { text: kurz("Umstieg " + teil.ab + ": verpasst"), farbe: FARBE.problem };
	if (teil.umstieg <= KNAPP_AB_MINUTEN)
		return { text: teil.ab + ": knapp, " + teil.umstieg + " Min", farbe: FARBE.verspaetet };
	return { text: kurz("Umstieg " + teil.ab + ": " + teil.umstieg + " Min"), farbe: FARBE.grau };
}

// Zusatz zur Ankunftszeit: „+1“, bei Rot „verpasst“.
// (In der Fußzeile steht bei Rot, wenn bekannt, die Ersatz-Ankunft, siehe
// FussbereichAnkunft.)
function ankunftZusatz(verbindung) {
	return verbindung.ampel === "rot" ? "verpasst" : "+" + (verbindung.ankunft.versp || 0);
}

// Nur die Teilstücke mit Zug (ohne Fußwege)
function zuege(verbindung) {
	return verbindung.teile.filter(t => t.art !== "fuss");
}

// ---------------------------------------------------------------------------
// Gemeinsame Bausteine aller Ansichten
// ---------------------------------------------------------------------------

// Eine dünne graue Trennlinie über die ganze Breite.
// Ohne „top“ wird sie in einer Column einfach angehängt.
function Trennlinie(top) {
	return new Content(null, { left: 0, right: 0, top, height: 1, skin: linieSkin });
}

// Statusband: Ampelfarbe UND Text, damit man es auch ohne Farbsehen versteht
function Statusband(verbindung, top, height) {
	return new Label(null, {
		left: 0, right: 0, top, height,
		skin: bandSkin[verbindung.ampel], style: bandStyle[verbindung.ampel],
		string: verbindung.status,
	});
}

// Linien-Badge: farbiges Rechteck mit runden Ecken und dem Liniennamen.
// RoundRect ist eine Pebble-Erweiterung von Piu. Es ist selbst kein Container,
// deshalb liegen Rechteck und Beschriftung übereinander in einem Container.
function Badge(teil, top = 4) {
	return new Container(null, {
		left: 4, top, width: 42, height: 22,
		contents: [
			new RoundRect(null, { left: 0, right: 0, top: 0, bottom: 0, radius: 4, skin: farbSkin(teil.farbe) }),
			new Label(null, { left: 0, right: 0, top: 0, bottom: 0, style: badgeStyle, string: teil.linie }),
		],
	});
}

// Eine Zeile „[Badge] 07:24 +0   Gl. 2“ (28 px hoch), für B und C.
// Mit „rechts“ steht statt des Gleises ein anderer Text rechts (z. B. Countdown).
function ZugKurz(teil, top, rechts) {
	const v = verspaetung(teil);
	return new Container(null, {
		left: 0, right: 0, top, height: 28,
		contents: [
			Badge(teil, 3),
			new Label(null, { left: 50, top: 0, height: 28, style: zeitStyle, string: teil.plan }),
			new Label(null, { left: 104, top: 0, height: 28, style: farbStyle("bold 24px Gothic", v.farbe), string: v.text }),
			rechts
				? new Label(null, { right: 4, top: 3, height: 22, style: countdownStyle, string: rechts })
				: new Label(null, { right: 4, top: 3, height: 22, style: gleisStyle, string: teil.gleis ? "Gl. " + teil.gleis : "" }),
		],
	});
}

// Zustand der Datenabfrage, wird rechts in der Fußzeile angezeigt:
//   null           normal: „Stand 07:05“
//   "laedt"        „lädt …“ (Anfrage läuft)
//   sonst (Text)   Fehler: „Fehler · 07:05“ in Rot (Text steht im Log)
let abfrageStatus = null;

function standText(verbindung) {
	if (abfrageStatus === "laedt") return "lädt …";
	if (abfrageStatus) return "Fehler · " + verbindung.stand;
	return "Stand " + verbindung.stand;
}

// Fußbereich, gleich in allen Ansichten:
//   ───────────────────────────────────────
//   [links: Text in eigenem Style]   Stand 07:05
//   Daten: Transitous · ohne Gewähr
// „links“ ist in A und C die Ankunft, in B der Abfahrtsort.
// Optional „klein“ = { text, farbe }: Zusatz in 14 px direkt dahinter (z. B. „statt 07:58“).
function Fussbereich(verbindung, linksText, linksStyle, klein) {
	const u = MASS.fussUnten;
	const links = [new Label(null, { top: 0, height: 24, style: linksStyle, string: linksText })];
	if (klein)
		links.push(new Label(null, { top: 5, height: 18, style: farbStyle("14px Gothic", klein.farbe), string: " " + klein.text }));
	return [
		new Content(null, { left: 0, right: 0, bottom: MASS.fussLinie, height: 1, skin: linieSkin }),
		// Row setzt die Teile nebeneinander, jedes so breit wie sein Text
		new Row(null, { left: 4, bottom: u + 2, height: 24, contents: links }),
		new Label(null, {
			right: 4, bottom: u + 4, height: 20,
			style: abfrageStatus && abfrageStatus !== "laedt" ? farbStyle("14px Gothic", FARBE.problem, "right") : standStyle,
			string: standText(verbindung),
		}),
		new Label(null, { left: 0, right: 0, bottom: 1, height: 17, style: hinweisStyle, string: "Daten: " + verbindung.quelle + " · ohne Gewähr" }),
	];
}

// Fußbereich mit der Ankunft links, ganze Zeile in der Farbe des Gesamtstatus.
// Bei Rot mit bekannter Ersatzverbindung: „an 08:21 statt 07:58“, dabei
// „statt 07:58“ kleiner, damit die Zeile nicht in „Stand …“ hineinläuft.
function FussbereichAnkunft(verbindung) {
	const an = verbindung.ankunft;
	const farbe = AMPEL_TEXT[verbindung.ampel];
	const style = farbStyle("bold 18px Gothic", farbe);
	if (verbindung.ampel === "rot" && an.ersatz)
		return Fussbereich(verbindung, "an " + an.ersatz, style, { text: "statt " + an.plan, farbe });
	return Fussbereich(verbindung, "an " + an.plan + " " + ankunftZusatz(verbindung), style);
}

// Bildschirm ohne Verbindungsdaten: beim allerersten Start oder bei Fehlern
// ohne gespeichertes Ergebnis.
function Meldung(titel, text) {
	return Bildschirm([
		new Label(null, { left: 0, right: 0, top: 30, height: 30, style: farbStyle("bold 24px Gothic", FARBE.text, "center"), string: titel }),
		new Text(null, {
			left: 10, right: 10, top: 70,
			style: farbStyle("18px Gothic", FARBE.grau, "center"),
			string: text,
		}),
	]);
}

// Hintergrund-Container für eine ganze Ansicht
function Bildschirm(inhalt) {
	return new Container(null, { left: 0, right: 0, top: 0, bottom: 0, skin: weissSkin, contents: inhalt });
}

// ---------------------------------------------------------------------------
// Ansicht A – Liste
// ---------------------------------------------------------------------------

// Ein Teilstück mit Zug: zwei Zeilen.
//   Zeile 1: [Badge] 07:12 +3                 Gl. 1
//   Zeile 2:         ab Halstenbek / Umstieg …
function ZugZeile(teil) {
	const v = verspaetung(teil);
	const z = zweiteZeile(teil);
	return new Container(null, {
		left: 0, right: 0, height: MASS.zug,
		contents: [
			Badge(teil),
			new Label(null, { left: 50, top: 0, height: 28, style: zeitStyle, string: teil.plan }),
			new Label(null, { left: 104, top: 0, height: 28, style: farbStyle("bold 24px Gothic", v.farbe), string: v.text }),
			new Label(null, { right: 4, top: 4, height: 22, style: gleisStyle, string: teil.gleis ? "Gl. " + teil.gleis : "" }),
			new Label(null, { left: 50, right: 2, top: MASS.zeile2, height: 16, style: farbStyle("14px Gothic", z.farbe), string: z.text }),
		],
	});
}

// Ein Fußweg: eine Zeile, 24 px hoch
function FussZeile(teil) {
	return new Container(null, {
		left: 0, right: 0, height: 24,
		contents: [
			new Label(null, { left: 50, right: 4, top: 0, height: 22, style: fussStyle, string: "Fußweg " + teil.dauer + " Min" }),
		],
	});
}

// Aufteilung von oben nach unten:
//   Kopfzeile: Richtung
//   Statusband
//   Teilstücke, untereinander (Column stapelt automatisch)
//   Fußbereich: Ankunft, „Stand“, Quellenhinweis
// Platz für die Teilstücke in Ansicht A (Pixel): zwischen Statusband und Fußbereich
const PLATZ_A = 228 - MASS.fussLinie - (MASS.kopf + MASS.band + 2) - 1;
const HOEHE_FUSS = 24, HOEHE_WEITERE = 20;

function AnsichtA(verbindung) {
	// Passt alles auf den Bildschirm? Sonst zuerst die Fußweg-Zeilen weglassen
	// (die Umstiegszeit steht ja weiter beim nächsten Zug), und wenn es dann
	// immer noch nicht passt, nur die ersten Züge zeigen plus „+ N weitere“.
	const hoehe = liste => liste.reduce((h, t, i) => h + (i ? 1 : 0) + (t.art === "fuss" ? HOEHE_FUSS : MASS.zug), 0);
	let teile = verbindung.teile;
	if (hoehe(teile) > PLATZ_A) teile = teile.filter(t => t.art !== "fuss");
	let weitere = 0;
	if (hoehe(teile) > PLATZ_A) {
		// hinten so lange Teilstücke weglassen, bis sie samt „+ N weitere“-Zeile passen
		while (teile.length > 1 && hoehe(teile) + 1 + HOEHE_WEITERE > PLATZ_A) {
			teile = teile.slice(0, -1);
			weitere++;
		}
	}

	// Teilstücke mit Trennlinien dazwischen
	const zeilen = [];
	teile.forEach((teil, i) => {
		if (i > 0) zeilen.push(Trennlinie());
		zeilen.push(teil.art === "fuss" ? FussZeile(teil) : ZugZeile(teil));
	});
	if (weitere) {
		zeilen.push(Trennlinie());
		zeilen.push(new Label(null, { left: 50, right: 4, height: HOEHE_WEITERE, style: fussStyle, string: "+ " + weitere + " weitere" }));
	}

	return Bildschirm([
		new Label(null, { left: 0, right: 0, top: 0, height: MASS.kopf, style: kopfStyle, string: verbindung.richtung }),
		Statusband(verbindung, MASS.kopf, MASS.band),
		new Column(null, { left: 0, right: 0, top: MASS.kopf + MASS.band + 2, contents: zeilen }),
		...FussbereichAnkunft(verbindung),
	]);
}

// ---------------------------------------------------------------------------
// Ansicht B – Ankunft groß
// ---------------------------------------------------------------------------

// Strecke als Leiste: ein farbiges Stück pro Teilstück, dazwischen Lücken.
// In einer Lücke sitzt ein farbiger Punkt, wenn dort umgestiegen wird
// (grün = genug Zeit, gelb = knapp, rot = verpasst), darunter die Minuten
// als Text (Farbe nie allein). Fußwege sind grau. Alle Stücke sind gleich
// breit, weil wir (noch) keine Fahrtdauer je Teilstück haben.
//
//   [  S3  ] ● [ RB71 ] ● [ RE6 ]
//         2 Min knapp   6 Min
function StreckenLeiste(verbindung, top) {
	const teile = verbindung.teile;
	const links = 6, breite = 188, luecke = 16, hoehe = 18, punkt = 12;
	const stueck = Math.floor((breite - luecke * (teile.length - 1)) / teile.length);
	const inhalt = [];

	teile.forEach((teil, i) => {
		const x = links + i * (stueck + luecke);
		const fuss = teil.art === "fuss";

		// das farbige Stück mit Beschriftung
		inhalt.push(new Container(null, {
			left: x, top: 0, width: stueck, height: hoehe,
			contents: [
				new RoundRect(null, { left: 0, right: 0, top: 0, bottom: 0, radius: 4, skin: farbSkin(fuss ? FARBE.linie : teil.farbe) }),
				new Label(null, { left: 0, right: 0, top: 0, bottom: 0, style: fuss ? leisteFussStyle : leisteStyle, string: fuss ? "Fuß" : teil.linie }),
			],
		}));

		// Umstiegspunkt in der Lücke vor diesem Teilstück
		if (i > 0 && hatUmstieg(teil)) {
			const mitte = x - luecke / 2;
			const farbe = umstiegFarbe(teil.umstieg);
			const text = teil.umstieg < 0 ? "verpasst"
				: teil.umstieg <= KNAPP_AB_MINUTEN ? teil.umstieg + " Min knapp"
				: teil.umstieg + " Min";
			inhalt.push(new RoundRect(null, {
				left: mitte - punkt / 2, top: (hoehe - punkt) / 2, width: punkt, height: punkt,
				radius: punkt / 2, skin: farbSkin(farbe),
			}));
			inhalt.push(new Label(null, {
				left: mitte - 40, width: 80, top: hoehe + 1, height: 16,
				style: farbStyle("bold 14px Gothic", farbe, "center"), string: text,
			}));
		}
	});

	return new Container(null, { left: 0, right: 0, top, height: hoehe + 18, contents: inhalt });
}

// Aufteilung von oben nach unten:
//   Ankunft Itzehoe
//   07:58 +1           (Zeit groß 42 px, Zusatz in Statusfarbe daneben)
//   Statusband
//   Strecken-Leiste mit Umstiegspunkten
//   NÄCHSTE ABFAHRT
//   [Badge] 07:24 +0      in 7 Min
//   Fußbereich: Abfahrtsort und Gleis, „Stand“, Quellenhinweis
function AnsichtB(verbindung) {
	const jetzt = jetztMinuten(verbindung);
	// nächste Abfahrt = erster Zug, der noch nicht abgefahren ist
	const naechster = zuege(verbindung).find(t => !abgefahren(t, jetzt));

	const inhalt = [
		new Label(null, { left: 0, right: 0, top: 0, height: 22, style: zielStyle, string: "Ankunft " + verbindung.ziel }),
		// Row setzt Zeit und Zusatz nebeneinander; ohne left/right wird sie zentriert
		new Row(null, {
			top: 18, height: 50,
			contents: [
				new Label(null, { top: 0, height: 50, style: grossStyle, string: verbindung.ankunft.plan }),
				new Label(null, {
					top: 20, height: 24, style: farbStyle("bold 18px Gothic", AMPEL_TEXT[verbindung.ampel]),
					string: " " + ankunftZusatz(verbindung),
				}),
			],
		}),
		Statusband(verbindung, 70, MASS.band),
		StreckenLeiste(verbindung, 102),
		new Label(null, { left: 6, top: 138, height: 16, style: zwischenStyle, string: "NÄCHSTE ABFAHRT" }),
	];

	let fussText = "";
	if (naechster) {
		inhalt.push(ZugKurz(naechster, 152, countdown(naechster, jetzt)));
		fussText = "ab " + naechster.ab + (naechster.gleis ? ", Gl. " + naechster.gleis : "");
	} else {
		inhalt.push(new Label(null, { left: 6, top: 152, height: 26, style: textStyle, string: "alle Züge abgefahren" }));
	}
	inhalt.push(...Fussbereich(verbindung, fussText, fussStyle));
	return Bildschirm(inhalt);
}

// ---------------------------------------------------------------------------
// Ansicht C – Nächster Schritt
// ---------------------------------------------------------------------------

// Welcher Zug ist „JETZT“? Der erste Zug, dessen Ist-Ankunft noch nicht
// vorbei ist: Entweder sitzt man drin, oder man wartet auf ihn (auch am
// Umstieg). Ist die Ankunft eines Zugs vorbei, springt „JETZT“ weiter.
// Sind alle Züge angekommen, bleibt der letzte stehen.
function aktuellerZug(verbindung, jetzt) {
	const liste = zuege(verbindung);
	return liste.find(t => minutenBis(istAn(t), jetzt) > 0) ?? liste[liste.length - 1];
}

// Aufteilung von oben nach unten:
//   Statusband
//   JETZT
//   [Badge] 07:12 +3        Gl. 1   (groß, 28 px)
//   ab Halstenbek · in 6 Min   bzw.  unterwegs bis Pinneberg
//   ───────────────
//   DANN
//   Pinneberg: knapp, 2 Min        (farbig)
//   [Badge] 07:24 +0        Gl. 2
//   vorher Fußweg 4 Min            (nur wenn es einen Fußweg gibt)
//   Fußbereich: Ankunft, „Stand“, Quellenhinweis
function AnsichtC(verbindung) {
	const jetzt = jetztMinuten(verbindung);
	const teile = verbindung.teile;
	const aktuell = aktuellerZug(verbindung, jetzt);

	// DANN: der nächste Zug nach dem aktuellen; ein Fußweg dazwischen wird gemerkt
	let fussweg = null, dann = null;
	for (let i = teile.indexOf(aktuell) + 1; i < teile.length; i++) {
		if (teile[i].art === "fuss") fussweg = teile[i];
		else { dann = teile[i]; break; }
	}

	const v = verspaetung(aktuell);
	let zeile2;
	if (minutenBis(istAn(aktuell), jetzt) <= 0)
		zeile2 = "angekommen in " + verbindung.ziel;      // nur nach dem letzten Zug möglich
	else if (abgefahren(aktuell, jetzt))
		zeile2 = "unterwegs bis " + (dann ? dann.ab : verbindung.ziel);
	else
		zeile2 = "ab " + aktuell.ab + " · " + countdown(aktuell, jetzt);

	const inhalt = [
		Statusband(verbindung, 0, MASS.band),

		new Label(null, { left: 6, top: 28, height: 16, style: zwischenStyle, string: "JETZT" }),
		new Container(null, {
			left: 0, right: 0, top: 44, height: 32,
			contents: [
				Badge(aktuell, 5),
				new Label(null, { left: 50, top: 0, height: 32, style: zeit28Style, string: aktuell.plan }),
				new Label(null, { left: 116, top: 0, height: 32, style: farbStyle("bold 28px Gothic", v.farbe), string: v.text }),
				new Label(null, { right: 4, top: 6, height: 22, style: gleisStyle, string: aktuell.gleis ? "Gl. " + aktuell.gleis : "" }),
			],
		}),
		new Label(null, { left: 6, right: 4, top: 76, height: 22, style: textStyle, string: zeile2 }),

		Trennlinie(100),
		new Label(null, { left: 6, top: 102, height: 16, style: zwischenStyle, string: "DANN" }),
	];

	if (dann) {
		const z = zweiteZeile(dann);
		inhalt.push(new Label(null, { left: 6, right: 4, top: 116, height: 22, style: farbStyle("bold 18px Gothic", z.farbe), string: z.text }));
		inhalt.push(ZugKurz(dann, 138));
		if (fussweg)
			inhalt.push(new Label(null, { left: 50, right: 4, top: 164, height: 17, style: farbStyle("14px Gothic", FARBE.grau), string: "vorher Fußweg " + fussweg.dauer + " Min" }));
	} else {
		inhalt.push(new Label(null, { left: 6, right: 4, top: 118, height: 26, style: textStyle, string: "Ankunft " + verbindung.ziel }));
	}

	inhalt.push(...FussbereichAnkunft(verbindung));
	return Bildschirm(inhalt);
}

// ---------------------------------------------------------------------------
// Anwendung und Tasten
// ---------------------------------------------------------------------------
// Piu fragt die Tasten selbst ab und ruft im Behavior der Application
// onPressUp / onPressDown / onPressSelect / onPressBack auf.
// Zurück fangen wir nicht ab, deshalb schließt Zurück die App wie gewohnt.

const ANSICHTEN = { A: AnsichtA, B: AnsichtB, C: AnsichtC };
const ANSICHT_REIHENFOLGE = ["A", "B", "C"];

class PendelzugBehavior {
	// onCreate läuft noch innerhalb des Application-Konstruktors, der
	// JavaScript-Aufrufstapel ist dort schon tief. Eine ganze Ansicht hier
	// aufzubauen führte zu „JavaScript stack overflow“. Deshalb merken wir uns
	// hier nur die Application und starten erst in onDisplaying, das Piu
	// aufruft, sobald die Application angezeigt wird.
	onCreate(application) {
		this.application = application;
	}
	onDisplaying(application) {
		if (this.gestartet) return;
		this.gestartet = true;
		this.starte();
	}
	starte() {
		this.ansicht = einstellungen.ansicht;   // Standard A, wählbar auf der Einstellungsseite
		this.daten = null;         // angezeigte Verbindung (Format wie testdaten.js)
		this.fehlerText = null;    // letzter Fehler (für den Meldungs-Bildschirm)

		if (TESTBETRIEB) {
			this.testIndex = 0;
			this.daten = testdaten[0];
			this.zeige();
			return;
		}

		// Richtung nach Tageszeit: vormittags Hinweg, ab 12 Uhr Rückweg
		this.richtung = new Date().getHours() < 12 ? "hin" : "rueck";
		this.ladeGespeichert();
		this.zeige();

		// Verbindung zum Handy. Die Schlüssel müssen zu package.json passen.
		// onWritable: jetzt darf gesendet werden; onSuspend: gerade nicht.
		this.bereit = false;
		this.wartend = null;
		this.message = new Message({
			keys: ["ANFRAGE", "VERBINDUNG", "FEHLER", "EINSTELLUNGEN"],
			onReadable: () => this.empfange(),
			onWritable: () => { this.bereit = true; this.sendeWartende(); },
			onSuspend: () => { this.bereit = false; },
		});
		this.frage(0, true);

		// Jede Minute neu zeichnen, damit Countdowns stimmen
		watch.addEventListener("minutechange", () => this.zeige());
	}

	// Letztes Ergebnis für die aktuelle Richtung aus dem Speicher der Uhr holen
	ladeGespeichert() {
		this.daten = null;
		const text = localStorage.getItem("letzte_" + this.richtung);
		if (text) {
			try { this.daten = JSON.parse(text); } catch { this.daten = null; }
		}
	}

	// Anfrage ans Handy vormerken und senden, sobald möglich
	//   schritt  -1 frühere, 0 dieselbe (gemerkte), +1 spätere Verbindung
	//   neu      true = Handy soll neu abfragen statt den Zwischenspeicher zu nehmen
	frage(schritt, neu) {
		this.wartend = { richtung: this.richtung, schritt, neu };
		abfrageStatus = "laedt";
		this.zeige();
		this.sendeWartende();
	}
	sendeWartende() {
		if (!this.bereit || !this.wartend) return;
		const text = JSON.stringify(this.wartend);
		console.log("Anfrage ans Handy: " + text);
		this.message.write(new Map([["ANFRAGE", text]]));
		this.wartend = null;
	}

	// Antwort vom Handy
	empfange() {
		const antwort = this.message.read();
		if (antwort.has("VERBINDUNG")) {
			const text = antwort.get("VERBINDUNG");
			try {
				this.daten = JSON.parse(text);
			} catch {
				console.log("Antwort nicht lesbar");
				return;
			}
			abfrageStatus = null;
			this.fehlerText = null;
			// Zuletzt angezeigte Verbindung merken (wird beim nächsten Start sofort gezeigt)
			localStorage.setItem("letzte_" + this.richtung, text);
			console.log("Verbindung erhalten: " + this.daten.status);
		}
		if (antwort.has("EINSTELLUNGEN")) {
			try {
				const neu = JSON.parse(antwort.get("EINSTELLUNGEN"));
				const knappGeaendert = neu.knapp !== einstellungen.knapp;
				einstellungen = { ...STANDARD_EINSTELLUNGEN, ...neu };
				localStorage.setItem("einstellungen", JSON.stringify(einstellungen));
				KNAPP_AB_MINUTEN = einstellungen.knapp;
				if (!TESTBETRIEB) this.ansicht = einstellungen.ansicht;
				console.log("Einstellungen erhalten: Ansicht " + einstellungen.ansicht + ", knapp " + einstellungen.knapp);
				// Neue Mindest-Umstiegszeit ändert auch die Ampel → Verbindung neu aufbereiten lassen
				if (knappGeaendert && !TESTBETRIEB) this.frage(0, false);
			} catch {
				console.log("Einstellungen nicht lesbar");
			}
		}
		if (antwort.has("FEHLER")) {
			this.fehlerText = antwort.get("FEHLER");
			abfrageStatus = this.fehlerText;
			console.log("Fehler vom Handy: " + this.fehlerText);
		}
		this.zeige();
	}

	// Bildschirm leeren und neu aufbauen
	zeige() {
		const application = this.application;
		application.empty();
		if (!this.daten) {
			application.add(this.fehlerText
				? Meldung("Keine Daten", this.fehlerText)
				: Meldung("Pendelzug", "Lade Verbindung …"));
			return;
		}
		application.add(ANSICHTEN[this.ansicht](this.daten));
	}

	// Auf: frühere Verbindung (bzw. im Testbetrieb: vorheriger Test-Zustand)
	onPressUp(application) {
		if (TESTBETRIEB) {
			this.testIndex = (this.testIndex + testdaten.length - 1) % testdaten.length;
			this.daten = testdaten[this.testIndex];
			this.zeige();
		} else {
			this.frage(-1, false);
		}
		return true;
	}
	// Ab: spätere Verbindung (bzw. im Testbetrieb: nächster Test-Zustand)
	onPressDown(application) {
		if (TESTBETRIEB) {
			this.testIndex = (this.testIndex + 1) % testdaten.length;
			this.daten = testdaten[this.testIndex];
			this.zeige();
		} else {
			this.frage(1, false);
		}
		return true;
	}
	// Select: Piu meldet Drücken und Loslassen getrennt. Wir messen die Zeit
	// dazwischen: kurz = neu laden, lang = Richtung umschalten.
	// (Die Aktion passiert beim Loslassen.)
	onPressSelect(application) {
		this.selectSeit = Date.now();
		return true;
	}
	onReleaseSelect(application) {
		// Loslassen ohne vorheriges Drücken in dieser App ignorieren: Das passiert,
		// wenn die App mit Select aus dem Menü geöffnet wird (Drücken landet im
		// Menü, Loslassen schon bei uns). Ebenso ignorieren: „Drücke“ über 5 s.
		if (this.selectSeit === undefined) return true;
		const dauer = Date.now() - this.selectSeit;
		this.selectSeit = undefined;
		if (dauer > 5000) return true;
		const lang = dauer >= LANG_MS;
		if (TESTBETRIEB) {
			const i = ANSICHT_REIHENFOLGE.indexOf(this.ansicht);
			this.ansicht = ANSICHT_REIHENFOLGE[(i + 1) % ANSICHT_REIHENFOLGE.length];
			this.zeige();
		} else if (lang) {
			this.richtung = this.richtung === "hin" ? "rueck" : "hin";
			console.log("Richtung umgeschaltet: " + this.richtung);
			this.ladeGespeichert();
			this.frage(0, true);
		} else {
			this.frage(0, true);
		}
		return true;
	}
}

// displayListLength: Speicher für Zeichenbefehle pro Bild.
// pixels: Größe des Zeilenpuffers beim Zeichnen (wie in den offiziellen Beispielen).
const application = new Application(null, {
	skin: weissSkin,
	Behavior: PendelzugBehavior,
	displayListLength: 2048,
	pixels: screen.width * 4,
});

export default application;
