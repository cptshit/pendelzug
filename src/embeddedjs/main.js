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

// Ab wie vielen Minuten Umstiegszeit gilt ein Umstieg als „knapp“?
// VORSCHLAG, noch nicht freigegeben: 3 Minuten oder weniger.
const KNAPP_AB_MINUTEN = 3;

// ---------------------------------------------------------------------------
// Skins und Styles
// ---------------------------------------------------------------------------
// Skins und Styles einmal anlegen und wiederverwenden. Das spart Speicher,
// denn die Uhr hat für JavaScript nur rund 32 kB.
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
const ankunftStyle = new Style({ font: "bold 18px Gothic", color: FARBE.text, horizontal: "left" });
const standStyle   = new Style({ font: "14px Gothic", color: FARBE.grau, horizontal: "right" });

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
		left: 0, right: 0, height: 44,
		contents: [
			Badge(teil),
			new Label(null, { left: 50, top: 0, height: 28, style: zeitStyle, string: teil.plan }),
			new Label(null, { left: 104, top: 0, height: 28, style: farbStyle("bold 24px Gothic", v.farbe), string: v.text }),
			new Label(null, { right: 4, top: 4, height: 22, style: gleisStyle, string: teil.gleis ? "Gl. " + teil.gleis : "" }),
			new Label(null, { left: 50, right: 2, top: 26, height: 16, style: farbStyle("14px Gothic", z.farbe), string: z.text }),
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
// Aufteilung von oben nach unten (Pixel):
//     0– 25  Kopfzeile: Richtung
//    26– 55  Statusband (Ampelfarbe + Text)
//    56–…    Teilstücke, untereinander (Column stapelt automatisch)
//   …–227    Fußzeile: Ankunft links, „Stand“ rechts (am unteren Rand verankert)
function AnsichtA(verbindung) {
	// Teilstücke mit Trennlinien dazwischen
	const zeilen = [];
	verbindung.teile.forEach((teil, i) => {
		if (i > 0) zeilen.push(Trennlinie());
		zeilen.push(teil.art === "fuss" ? FussZeile(teil) : ZugZeile(teil));
	});

	const an = verbindung.ankunft;
	const anV = verspaetung(an);

	return new Container(null, {
		left: 0, right: 0, top: 0, bottom: 0, skin: weissSkin,
		contents: [
			// Kopfzeile
			new Label(null, { left: 0, right: 0, top: 0, height: 26, style: kopfStyle, string: verbindung.richtung }),

			// Statusband: Farbe UND Text, damit man es auch ohne Farbsehen versteht
			new Label(null, {
				left: 0, right: 0, top: 26, height: 30,
				skin: bandSkin[verbindung.ampel], style: bandStyle[verbindung.ampel],
				string: verbindung.status,
			}),

			// Teilstücke
			new Column(null, { left: 0, right: 0, top: 58, contents: zeilen }),

			// Fußzeile mit Trennlinie darüber
			new Content(null, { left: 0, right: 0, bottom: 30, height: 1, skin: linieSkin }),
			// Row setzt die beiden Texte direkt nebeneinander. Labels ohne feste
			// Breite sind so breit wie ihr Text, deshalb gibt es keine Überlappung.
			new Row(null, {
				left: 4, bottom: 4, height: 24,
				contents: [
					new Label(null, { style: ankunftStyle, string: "an " + an.plan + " " }),
					new Label(null, { style: farbStyle("bold 18px Gothic", anV.farbe), string: anV.text }),
				],
			}),
			new Label(null, { right: 4, bottom: 6, height: 20, style: standStyle, string: "Stand " + verbindung.stand }),
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
