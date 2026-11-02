// konfig.js – feste Einstellungen für den Handy-Teil (PKJS).
//
// Hier stehen KEINE Zugangsdaten. Benutzer und Passwort für Geofox kommen
// später auf die Einstellungsseite (Clay) und werden nur auf dem Handy gespeichert.

module.exports = {
	// Für den User-Agent, den Transitous bei jeder Anfrage verlangt:
	// App-Name, Version und eine Kontaktmöglichkeit.
	APP_NAME: "Pendelzug",
	VERSION: "0.3.0",
	// Projekt-Kontaktadresse (E-Mail). Solange sie leer ist, schickt die App
	// absichtlich KEINE Anfrage an Transitous (Nutzungsbedingungen).
	KONTAKT: "pendelzug@wortreich.eu",

	// Strecke. Die Haltestellen-IDs sucht der Adapter beim ersten Mal selbst.
	HALTESTELLE_A: "Halstenbek",
	HALTESTELLE_B: "Itzehoe",

	// Wie lange (Sekunden) ein Suchergebnis wiederverwendet wird, z. B. beim
	// Blättern mit Auf/Ab. Hält die Last für Transitous gering.
	CACHE_SEKUNDEN: 90,
};
