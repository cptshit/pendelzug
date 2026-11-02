// main.js – Uhr-Code von Pendelzug (läuft auf der Pebble, nicht auf dem Handy).
//
// Stand Schritt 2: drei Ansichten mit fest eingebauten Testdaten.
//   A – Liste:            alle Teilstücke untereinander
//   B – Ankunft groß:     große Ankunftszeit, Strecke als Leiste, nächste Abfahrt
//   C – Nächster Schritt: „JETZT“ und „DANN“
//
// Tasten im Testbetrieb:
//   Auf / Ab   vorheriger / nächster Test-Zustand
//              (pünktlich, knapp, Anschluss weg, Warten am Umstieg)
//   Select     nächste Ansicht (A → B → C → A). NUR VORÜBERGEHEND: Ab Schritt 4
//              wird die Ansicht in den Einstellungen gewählt, und Select lädt neu.
//   Zurück     App schließen
//
// Die Oberfläche ist mit Piu gebaut, dem Oberflächen-Framework von Alloy.
// Piu arbeitet mit „Content“-Objekten (Rechtecke), die in „Containern“
// verschachtelt werden. Aussehen kommt aus „Skins“ (Füllfarbe) und
// „Styles“ (Schrift, Textfarbe). Die Piu-Klassen (Application, Container,
// Label, Skin, Style, RoundRect …) sind global verfügbar, ohne import.
//
// Bildschirm der Pebble Time 2 (emery): 200 × 228 Pixel, 64 Farben.

import testdaten from "testdaten";

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

// Mindest-Umstiegszeit in Minuten (freigegeben):
//   Umstiegszeit ≤ KNAPP_AB_MINUTEN  → „knapp“ (gelb)
//   Umstiegszeit negativ             → „verpasst“ (rot)
// Wird später zur Einstellung „Mindest-Umstiegszeit“ auf der Einstellungsseite (Clay).
const KNAPP_AB_MINUTEN = 3;

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
	if (teil.umstieg < 0)
		return { text: "Umstieg " + teil.ab + ": verpasst", farbe: FARBE.problem };
	if (teil.umstieg <= KNAPP_AB_MINUTEN)
		// kürzer formuliert, damit es in 14 px auf die Zeile passt (ca. 27 Zeichen)
		return { text: teil.ab + ": knapp, " + teil.umstieg + " Min", farbe: FARBE.verspaetet };
	return { text: "Umstieg " + teil.ab + ": " + teil.umstieg + " Min", farbe: FARBE.grau };
}

// Zusatz zur Ankunftszeit: „+1“, bei Rot „verpasst“.
// Ab Schritt 3 steht bei Rot die nächste erreichbare Verbindung da,
// z. B. „an 08:21 statt 07:58“.
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

// Fußbereich, gleich in allen Ansichten:
//   ───────────────────────────────────────
//   [links: Text in eigenem Style]   Stand 07:05
//   Daten: Transitous · ohne Gewähr
// „links“ ist in A und C die Ankunft, in B der Abfahrtsort.
function Fussbereich(verbindung, linksText, linksStyle) {
	const u = MASS.fussUnten;
	return [
		new Content(null, { left: 0, right: 0, bottom: MASS.fussLinie, height: 1, skin: linieSkin }),
		new Label(null, { left: 4, right: 70, bottom: u + 2, height: 24, style: linksStyle, string: linksText }),
		new Label(null, { right: 4, bottom: u + 4, height: 20, style: standStyle, string: "Stand " + verbindung.stand }),
		new Label(null, { left: 0, right: 0, bottom: 1, height: 17, style: hinweisStyle, string: "Daten: " + verbindung.quelle + " · ohne Gewähr" }),
	];
}

// Fußbereich mit der Ankunft links, ganze Zeile in der Farbe des Gesamtstatus
function FussbereichAnkunft(verbindung) {
	return Fussbereich(verbindung,
		"an " + verbindung.ankunft.plan + " " + ankunftZusatz(verbindung),
		farbStyle("bold 18px Gothic", AMPEL_TEXT[verbindung.ampel]));
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
function AnsichtA(verbindung) {
	// Teilstücke mit Trennlinien dazwischen
	const zeilen = [];
	verbindung.teile.forEach((teil, i) => {
		if (i > 0) zeilen.push(Trennlinie());
		zeilen.push(teil.art === "fuss" ? FussZeile(teil) : ZugZeile(teil));
	});

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
	onCreate(application) {
		this.index = 0;        // welcher Test-Zustand
		this.ansicht = "A";    // Standard-Ansicht laut CLAUDE.md
		this.zeige(application);
	}
	// Bildschirm leeren und die aktuelle Verbindung neu aufbauen.
	zeige(application) {
		const verbindung = testdaten[this.index];
		console.log("Ansicht " + this.ansicht + ", Testzustand " + (this.index + 1) + ": " + verbindung.status);
		application.empty();
		application.add(ANSICHTEN[this.ansicht](verbindung));
	}
	// Auf: vorheriger Testzustand (nach dem ersten kommt wieder der letzte)
	onPressUp(application) {
		this.index = (this.index + testdaten.length - 1) % testdaten.length;
		this.zeige(application);
		return true;
	}
	// Ab: nächster Testzustand
	onPressDown(application) {
		this.index = (this.index + 1) % testdaten.length;
		this.zeige(application);
		return true;
	}
	// Select: nächste Ansicht (nur im Testbetrieb, siehe oben)
	onPressSelect(application) {
		const i = ANSICHT_REIHENFOLGE.indexOf(this.ansicht);
		this.ansicht = ANSICHT_REIHENFOLGE[(i + 1) % ANSICHT_REIHENFOLGE.length];
		this.zeige(application);
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
