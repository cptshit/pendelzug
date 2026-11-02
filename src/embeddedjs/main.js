// main.js – Uhr-Code von Pendelzug (läuft auf der Pebble, nicht auf dem Handy).
//
// Schritt 1: Ansicht A („Liste“) mit fest eingebauten Testdaten.
// Mit Auf/Ab blättert man durch drei Test-Zustände:
//   1 = pünktlich, 2 = Umstieg knapp, 3 = Anschluss weg.
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
	linie: "#AAAAAA",         // Trennlinien
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

// Mindest-Umstiegszeit in Minuten (freigegeben):
//   Umstiegszeit ≤ KNAPP_AB_MINUTEN  → „knapp“ (gelb)
//   Umstiegszeit negativ             → „verpasst“ (rot)
// Wird später zur Einstellung „Mindest-Umstiegszeit“ auf der Einstellungsseite (Clay).
const KNAPP_AB_MINUTEN = 3;

// Maße in Pixeln. Ganz unten steht in jeder Ansicht eine eigene 14-px-Zeile
// mit dem Quellenhinweis „Daten: … · ohne Gewähr“ (freigegeben), darüber die
// Fußzeile. Deshalb sind Kopfzeile, Band und Teilstücke etwas kompakter.
const MASS = { kopf: 24, band: 26, zug: 42, zeile2: 24, fussLinie: 46, fussUnten: 18 };

// Textfarbe der Fußzeile je Gesamtstatus (Ampel). Die Fußzeile richtet sich
// immer nach dem Gesamtstatus, nicht nach der Verspätung des letzten Teilstücks.
const AMPEL_TEXT = {
	gruen: FARBE.puenktlich,
	gelb: FARBE.verspaetet,
	rot: FARBE.problem,
};

// ---------------------------------------------------------------------------
// Skins und Styles
// ---------------------------------------------------------------------------
// Skins und Styles einmal anlegen und wiederverwenden. Das spart Speicher,
// denn JavaScript hat auf der Uhr nur 56 kB (siehe src/c/mdbl.c).
//
// Schriften: Pebble-Systemschriften, Schreibweise „[Gewicht] [Größe]px Familie“.
// Die Größe muss exakt in der Schrifttabelle der Firmware stehen,
// Gothic gibt es in 14, 18, 24 und 28 (fett und normal).

const weissSkin = new Skin({ fill: "white" });
const linieSkin = new Skin({ fill: FARBE.linie });

// Für jede Ampelfarbe ein Skin (Bandfarbe) und ein Style (Schriftfarbe)
const bandSkin = {};
const bandStyle = {};
for (const name in AMPEL) {
	bandSkin[name] = new Skin({ fill: AMPEL[name].grund });
	bandStyle[name] = new Style({ font: "bold 18px Gothic", color: AMPEL[name].schrift, horizontal: "center" });
}

const kopfStyle    = new Style({ font: "bold 18px Gothic", color: FARBE.text, horizontal: "center" });
const zeitStyle    = new Style({ font: "bold 24px Gothic", color: FARBE.text, horizontal: "left" });
const gleisStyle   = new Style({ font: "18px Gothic", color: FARBE.grau, horizontal: "right" });
const badgeStyle   = new Style({ font: "bold 18px Gothic", color: "white", horizontal: "center" });
const fussStyle    = new Style({ font: "18px Gothic", color: FARBE.grau, horizontal: "left" });
const standStyle   = new Style({ font: "14px Gothic", color: FARBE.grau, horizontal: "right" });
const hinweisStyle = new Style({ font: "14px Gothic", color: FARBE.grau, horizontal: "center" });

// Styles, deren Farbe sich nach dem Zustand richtet: bei Bedarf einmal
// anlegen und im Zwischenspeicher (Cache) ablegen, statt bei jedem Neuzeichnen
// neue Objekte zu erzeugen.
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
// Hilfsfunktionen für Texte
// ---------------------------------------------------------------------------

// Verspätung als Text + Farbe. Bei Ausfall: „fällt aus“ in Rot.
function verspaetung(teil) {
	if (teil.ausfall) return { text: "fällt aus", farbe: FARBE.problem };
	if (teil.versp > 0) return { text: "+" + teil.versp, farbe: FARBE.verspaetet };
	return { text: "+0", farbe: FARBE.puenktlich };
}

// Zweite Zeile eines Teilstücks: beim ersten Teilstück der Abfahrtsort,
// danach die Umstiegszeit (farbig, wenn knapp oder verpasst).
function zweiteZeile(teil) {
	if (teil.umstieg === null || teil.umstieg === undefined)
		return { text: "ab " + teil.ab, farbe: FARBE.grau };
	if (teil.umstieg < 0)
		return { text: "Umstieg " + teil.ab + ": verpasst", farbe: FARBE.problem };
	if (teil.umstieg <= KNAPP_AB_MINUTEN)
		// kürzer formuliert, damit es in 14 px auf die Zeile passt (ca. 27 Zeichen)
		return { text: teil.ab + ": knapp, " + teil.umstieg + " Min", farbe: FARBE.verspaetet };
	return { text: "Umstieg " + teil.ab + ": " + teil.umstieg + " Min", farbe: FARBE.grau };
}

// ---------------------------------------------------------------------------
// Bausteine der Ansicht
// ---------------------------------------------------------------------------

// Eine dünne graue Trennlinie über die ganze Breite
function Trennlinie() {
	return new Content(null, { left: 0, right: 0, height: 1, skin: linieSkin });
}

// Linien-Badge: farbiges Rechteck mit runden Ecken und dem Liniennamen.
// RoundRect ist eine Pebble-Erweiterung von Piu. Es ist selbst kein Container,
// deshalb liegen Rechteck und Beschriftung übereinander in einem Container.
function Badge(teil) {
	return new Container(null, {
		left: 4, top: 4, width: 42, height: 22,
		contents: [
			new RoundRect(null, { left: 0, right: 0, top: 0, bottom: 0, radius: 4, skin: farbSkin(teil.farbe) }),
			new Label(null, { left: 0, right: 0, top: 0, bottom: 0, style: badgeStyle, string: teil.linie }),
		],
	});
}

// Ein Teilstück mit Zug: zwei Zeilen, zusammen 44 px hoch.
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

// Der ganze Bildschirm für eine Verbindung.
//
// Aufteilung von oben nach unten (Höhen siehe MASS):
//   Kopfzeile: Richtung
//   Statusband (Ampelfarbe + Text)
//   Teilstücke, untereinander (Column stapelt automatisch)
//   Fußzeile: Ankunft links, „Stand“ rechts (am unteren Rand verankert)
//   ganz unten: Quellenhinweis
function AnsichtA(verbindung) {
	// Teilstücke mit Trennlinien dazwischen
	const zeilen = [];
	verbindung.teile.forEach((teil, i) => {
		if (i > 0) zeilen.push(Trennlinie());
		zeilen.push(teil.art === "fuss" ? FussZeile(teil) : ZugZeile(teil));
	});

	const an = verbindung.ankunft;
	// Fußzeile: „an 07:58 +1“, bei Rot „an 07:58 verpasst“.
	// Ab Schritt 3 steht bei Rot die nächste erreichbare Verbindung da,
	// z. B. „an 08:21 statt 07:58“.
	const anText = "an " + an.plan + " " +
		(verbindung.ampel === "rot" ? "verpasst" : "+" + (an.versp || 0));

	const hinweis = "Daten: " + verbindung.quelle + " · ohne Gewähr";
	const stand = "Stand " + verbindung.stand;
	const u = MASS.fussUnten;

	return new Container(null, {
		left: 0, right: 0, top: 0, bottom: 0, skin: weissSkin,
		contents: [
			// Kopfzeile
			new Label(null, { left: 0, right: 0, top: 0, height: MASS.kopf, style: kopfStyle, string: verbindung.richtung }),

			// Statusband: Farbe UND Text, damit man es auch ohne Farbsehen versteht
			new Label(null, {
				left: 0, right: 0, top: MASS.kopf, height: MASS.band,
				skin: bandSkin[verbindung.ampel], style: bandStyle[verbindung.ampel],
				string: verbindung.status,
			}),

			// Teilstücke
			new Column(null, { left: 0, right: 0, top: MASS.kopf + MASS.band + 2, contents: zeilen }),

			// Fußzeile mit Trennlinie darüber
			new Content(null, { left: 0, right: 0, bottom: MASS.fussLinie, height: 1, skin: linieSkin }),
			// Ganze Zeile in der Farbe des Gesamtstatus
			new Label(null, {
				left: 4, right: 70, bottom: u + 2, height: 24,
				style: farbStyle("bold 18px Gothic", AMPEL_TEXT[verbindung.ampel]), string: anText,
			}),
			new Label(null, { right: 4, bottom: u + 4, height: 20, style: standStyle, string: stand }),
			// Quellenhinweis als eigene Zeile ganz unten
			new Label(null, { left: 0, right: 0, bottom: 1, height: 17, style: hinweisStyle, string: hinweis }),
		],
	});
}

// ---------------------------------------------------------------------------
// Anwendung und Tasten
// ---------------------------------------------------------------------------
// Piu fragt die Tasten selbst ab und ruft im Behavior der Application
// onPressUp / onPressDown / onPressSelect / onPressBack auf.
// Zurück fangen wir nicht ab, deshalb schließt Zurück die App wie gewohnt.

class PendelzugBehavior {
	onCreate(application) {
		this.index = 0;
		this.zeige(application);
	}
	// Bildschirm leeren und die aktuelle Verbindung neu aufbauen.
	zeige(application) {
		const verbindung = testdaten[this.index];
		console.log("Zeige Testzustand " + (this.index + 1) + ": " + verbindung.status);
		application.empty();
		application.add(AnsichtA(verbindung));
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
