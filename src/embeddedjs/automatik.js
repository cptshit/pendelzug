// automatik.js – Rechenregeln für die Automatik (Schritt 5).
//
// Reine Funktionen ohne Zugriff auf Uhr, Bildschirm oder Speicher. Die
// eigentlichen Aufrufe (Wakeup planen, vibrieren) macht main.js. So lassen
// sich die Regeln auch ohne Emulator prüfen.
//
// Ein Automatik-Fenster aus den Einstellungen sieht so aus:
//   { an: true, tage: [Mo, Di, Mi, Do, Fr, Sa, So] (true/false), von: "07:00", bis: "09:00" }

// Cookies für die Wakeups: daran erkennt die App beim Start, welches Fenster
// sie geweckt hat.
export const COOKIE_HIN = 1;
export const COOKIE_RUECK = 2;

function minuten(hhmm) {
	return parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3, 5), 10);
}

// Wochentag-Index wie in den Einstellungen: 0 = Montag … 6 = Sonntag
// (JavaScript zählt 0 = Sonntag, deshalb umrechnen)
function wochentag(datum) {
	return (datum.getDay() + 6) % 7;
}

// Datum am selben Tag zur Uhrzeit „HH:MM“
function amTag(datum, hhmm) {
	const d = new Date(datum.getTime());
	d.setHours(0, 0, 0, 0);
	d.setMinutes(minuten(hhmm));
	return d;
}

function fensterGueltig(f) {
	return f && f.an && f.tage && f.von && f.bis && minuten(f.bis) > minuten(f.von);
}

// Läuft gerade ein Fenster? Ergebnis: { richtung, ende (ms) } oder null.
export function aktuellesFenster(einstellungen, jetzt) {
	for (const richtung of ["hin", "rueck"]) {
		const f = einstellungen[richtung];
		if (!fensterGueltig(f) || !f.tage[wochentag(jetzt)]) continue;
		const von = amTag(jetzt, f.von).getTime();
		const bis = amTag(jetzt, f.bis).getTime();
		if (jetzt.getTime() >= von && jetzt.getTime() < bis)
			return { richtung, ende: bis };
	}
	return null;
}

// Nächster Fensteranfang je Richtung (frühestens in 1 Minute, höchstens
// 7 Tage voraus). Ergebnis: Liste von { zeit (ms), cookie }.
export function naechsteStarts(einstellungen, jetzt) {
	const starts = [];
	const frueheste = jetzt.getTime() + 60000;
	[["hin", COOKIE_HIN], ["rueck", COOKIE_RUECK]].forEach(([richtung, cookie]) => {
		const f = einstellungen[richtung];
		if (!fensterGueltig(f)) return;
		for (let tag = 0; tag <= 7; tag++) {
			const d = new Date(jetzt.getTime());
			d.setDate(d.getDate() + tag);
			if (!f.tage[wochentag(d)]) continue;
			const start = amTag(d, f.von).getTime();
			if (start >= frueheste) {
				starts.push({ zeit: start, cookie });
				break;
			}
		}
	});
	return starts;
}

// Wie schlimm ist eine Verbindung für die Vibration?
//   0 = kein Grund zu vibrieren (pünktlich oder nur „knapp“)
//   1 = verspätet am Ziel
//   2 = Ausfall oder Anschluss verpasst (rot)
export function stufe(verbindung) {
	if (verbindung.ampel === "rot") return 2;
	if ((verbindung.ankunft.versp || 0) > 0) return 1;
	return 0;
}

// Kennung der Verbindung: Linie und Plan-Abfahrt aller Züge
export function kennung(verbindung) {
	return verbindung.teile
		.filter(t => t.art !== "fuss")
		.map(t => t.linie + "@" + t.plan)
		.join("|");
}

// Soll vibriert werden? „gemerkt“ = was beim letzten Vibrieren war
// ({ kennung, stufe, versp } oder null).
// Ergebnis: { muster: null | "verspaetet" | "problem", gemerkt: neuer Stand }
//
// Regel: pro Problem nur einmal; erneut nur, wenn es schlimmer wird –
// höhere Stufe, oder die Verspätung ist um mindestens 5 Minuten gewachsen.
export const MEHR_VERSPAETUNG_MIN = 5;

export function vibration(verbindung, gemerkt) {
	const s = stufe(verbindung);
	const k = kennung(verbindung);
	const versp = verbindung.ankunft.versp || 0;
	// Kein Problem (mehr): vergessen. Taucht es später wieder auf, gilt es als neu.
	if (s === 0) return { muster: null, gemerkt: null };

	const neuesProblem = !gemerkt || gemerkt.kennung !== k;
	const schlimmer = gemerkt && gemerkt.kennung === k &&
		(s > gemerkt.stufe || (s === 1 && versp >= gemerkt.versp + MEHR_VERSPAETUNG_MIN));
	if (neuesProblem || schlimmer)
		return { muster: s === 2 ? "problem" : "verspaetet", gemerkt: { kennung: k, stufe: s, versp } };
	return { muster: null, gemerkt };
}
