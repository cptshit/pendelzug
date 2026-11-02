// konfig.js – feste Einstellungen für den Handy-Teil (PKJS).
//
// Hier stehen KEINE Zugangsdaten. Benutzer und Passwort für Geofox kommen
// später auf die Einstellungsseite (Clay) und werden nur auf dem Handy gespeichert.

module.exports = {
	// Für den User-Agent, den Transitous bei jeder Anfrage verlangt:
	// App-Name, Version und eine Kontaktmöglichkeit.
	APP_NAME: "Pendelzug",
	VERSION: "1.1.0",
	// Projekt-Kontaktadresse (E-Mail). Solange sie leer ist, schickt die App
	// absichtlich KEINE Anfrage an Transitous (Nutzungsbedingungen).
	KONTAKT: "pendelzug@wortreich.eu",

	// Standard-Strecke, solange in den Einstellungen nichts anderes gewählt ist.
	// Start und Ziel wählt man auf der Einstellungsseite mit der Vorschlagssuche
	// (haltestelle-feld.js). Gespeichert wird dasselbe Format wie hier:
	//   id       Haltestellen-Kennung bei Transitous
	//   name     Anzeigename
	//   lat/lon  Koordinaten (für „Vorschläge in der Nähe zuerst“)
	START: { id: "de-DELFI_de:01056:98950", name: "Halstenbek", lat: 53.63038, lon: 9.839092 },
	ZIEL: { id: "de-DELFI_de:01061:46671", name: "Itzehoe", lat: 53.923874, lon: 9.510287 },

	// Wie lange (Sekunden) ein Suchergebnis wiederverwendet wird, z. B. beim
	// Blättern mit Auf/Ab. Hält die Last für Transitous gering.
	CACHE_SEKUNDEN: 90,
};
