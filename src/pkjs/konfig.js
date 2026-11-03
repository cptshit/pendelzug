// konfig.js – feste Einstellungen für den Handy-Teil (PKJS).
//
// Hier stehen KEINE Zugangsdaten. Wer einen eigenen Geofox-Zugang hat, trägt
// ihn auf der Einstellungsseite (Clay) ein; er bleibt auf dem Handy.

module.exports = {
	// Pendelzug-Server: vermittelt die Anfragen an den HVV (Geofox), damit man
	// keine eigenen Geofox-Zugangsdaten braucht. Code: server/ im Repository.
	SERVER: "https://www.wortreich.eu/pendelzug/api.php",

	// Standard-Strecke, solange in den Einstellungen nichts anderes gewählt ist.
	// Start und Ziel wählt man auf der Einstellungsseite mit der Vorschlagssuche
	// (haltestelle-feld.js). Gespeichert wird dasselbe Format wie hier:
	//   id       Haltestellen-Kennung beim HVV (Geofox)
	//   name     Anzeigename
	//   lat/lon  Koordinaten (für „Vorschläge in der Nähe zuerst“)
	START: { id: "Master:98950", name: "Halstenbek", lat: 53.630763, lon: 9.838604 },
	ZIEL: { id: "Master:9046671", name: "Itzehoe", lat: 53.924108, lon: 9.510228 },

	// Wie lange (Sekunden) ein Suchergebnis wiederverwendet wird, z. B. beim
	// Blättern mit Auf/Ab. Hält die Last für den HVV und den Server gering.
	CACHE_SEKUNDEN: 90,
};
