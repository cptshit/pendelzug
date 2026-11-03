// config.js – Aufbau der Einstellungsseite (Clay).
//
// Clay baut daraus auf dem Handy eine Webseite. Die gewählten Werte speichert
// Clay im localStorage des Handys („clay-settings“). Was davon an die Uhr geht,
// entscheidet einstellungen.js – die Zugangsdaten bleiben auf dem Handy.
//
// Jedes Feld mit „messageKey“ wird gespeichert. Die Namen müssen hier NICHT in
// package.json stehen, weil wir die Werte selbst weiterverarbeiten
// (autoHandleEvents: false, siehe index.js).

var konfig = require("./konfig");

var TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

module.exports = [
	{ type: "heading", defaultValue: "Pendelzug" },

	{
		type: "section",
		items: [
			{ type: "heading", defaultValue: "Strecke" },
			// „haltestelle“ ist unser eigenes Feld mit Vorschlagssuche
			// (haltestelle-feld.js, in index.js bei Clay angemeldet).
			// Der Wert ist ein JSON-Text { id, name, lat, lon }.
			{
				type: "haltestelle",
				messageKey: "start",
				label: "Start",
				defaultValue: JSON.stringify(konfig.START),
			},
			{
				type: "haltestelle",
				messageKey: "ziel",
				label: "Ziel",
				defaultValue: JSON.stringify(konfig.ZIEL),
				description: "Ein paar Buchstaben tippen und einen Vorschlag antippen – " +
					"nur Haltestellen aus der Liste werden übernommen. " +
					"Bahnhöfe und Haltestellen in der Nähe stehen oben. " +
					"Der Hinweg führt vom Start zum Ziel, der Rückweg umgekehrt.",
			},
		],
	},

	{
		type: "section",
		items: [
			{ type: "heading", defaultValue: "Anzeige" },
			{
				type: "select",
				messageKey: "ansicht",
				label: "Ansicht",
				defaultValue: "A",
				options: [
					{ label: "A – Liste", value: "A" },
					{ label: "B – Ankunft groß", value: "B" },
					{ label: "C – Nächster Schritt", value: "C" },
				],
			},
			{
				type: "slider",
				messageKey: "knapp",
				label: "Mindest-Umstiegszeit (Minuten)",
				description: "Bis zu dieser Umstiegszeit gilt ein Umstieg als „knapp“ (gelb).",
				defaultValue: 3,
				min: 1,
				max: 10,
				step: 1,
			},
		],
	},

	{
		type: "section",
		items: [
			{ type: "heading", defaultValue: "Automatik Hinweg" },
			{
				type: "text",
				defaultValue: "In diesem Zeitfenster startet die App von selbst, aktualisiert alle 2 Minuten und vibriert nur bei Verspätung, Ausfall oder verpasstem Umstieg.",
			},
			{ type: "toggle", messageKey: "hinAn", label: "Automatik Hinweg", defaultValue: true },
			{ type: "checkboxgroup", messageKey: "hinTage", label: "Tage", defaultValue: [true, true, true, true, true, false, false], options: TAGE },
			{ type: "input", messageKey: "hinVon", label: "von", defaultValue: "07:00", attributes: { type: "time" } },
			{ type: "input", messageKey: "hinBis", label: "bis", defaultValue: "09:00", attributes: { type: "time" } },
		],
	},

	{
		type: "section",
		items: [
			{ type: "heading", defaultValue: "Automatik Rückweg" },
			{ type: "toggle", messageKey: "rueckAn", label: "Automatik Rückweg", defaultValue: false },
			{ type: "checkboxgroup", messageKey: "rueckTage", label: "Tage", defaultValue: [true, true, true, true, true, false, false], options: TAGE },
			{ type: "input", messageKey: "rueckVon", label: "von", defaultValue: "16:00", attributes: { type: "time" } },
			{ type: "input", messageKey: "rueckBis", label: "bis", defaultValue: "18:00", attributes: { type: "time" } },
		],
	},

	{
		type: "section",
		items: [
			{ type: "heading", defaultValue: "Datenquelle" },
			{
				type: "text",
				defaultValue: "Die Verbindungen kommen vom HVV (Geofox) über den Pendelzug-Server " +
					"auf wortreich.eu. Wer einen eigenen Geofox-Zugang hat, kann ihn unten eintragen; " +
					"dann fragt die App direkt beim HVV. Die Haltestellen-Vorschläge oben kommen " +
					"noch von <a href=\"https://transitous.org\">Transitous</a>.",
			},
			{
				type: "input",
				messageKey: "geofoxBenutzer",
				label: "Geofox-Benutzer",
				defaultValue: "",
				attributes: { autocomplete: "off", autocapitalize: "off" },
			},
			{
				type: "input",
				messageKey: "geofoxPasswort",
				label: "Geofox-Passwort",
				description: "Benutzer und Passwort bleiben auf dem Handy und werden nie an die Uhr geschickt. Optional: Sind beide Felder ausgefüllt, fragt die App direkt beim HVV statt über den Pendelzug-Server.",
				defaultValue: "",
				attributes: { type: "password", autocomplete: "off" },
			},
		],
	},

	{ type: "submit", defaultValue: "Speichern" },
];
