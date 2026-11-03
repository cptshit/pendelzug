<?php
// =============================================================================
// server/lib/gti.php – Konfiguration laden und Geofox GTI aufrufen
// =============================================================================
//
// Liegt NICHT im öffentlichen Ordner, wird nur von api.php eingebunden.
// Quelle für Header und Signatur: GTI-Handbuch (API-Version 63),
// https://gti.geofox.de/html/GTIHandbuch_p.html, Kapitel 1.2 und 1.3.
// =============================================================================

declare(strict_types=1);

const GTI_BASIS = 'https://gti.geofox.de/gti/public/';
const GTI_VERSION = 63;

// Standardwerte. Jeder kann in der Konfigurationsdatei überschrieben werden.
const KONFIG_STANDARD = [
    'GTI_USER' => '',
    'GTI_PASS' => '',
    'SALZ' => '',                     // geheimer Zufallswert für die IP-Prüfwerte
    'DATENORDNER' => '',              // Zwischenspeicher, außerhalb des Webordners
    'GRENZE_GERAET' => 60,            // Anfragen pro Gerät … (Vorschlagssuche
                                      // beim Tippen braucht mehrere)
    'GRENZE_GERAET_SEKUNDEN' => 600,  // … in diesem Zeitraum (10 Minuten)
    'GRENZE_TAG' => 5000,             // HVV-Anfragen pro Tag, alle Geräte zusammen
    'CACHE_ROUTE_SEKUNDEN' => 60,     // Verbindungen so lange wiederverwenden
    'CACHE_HALT_SEKUNDEN' => 2592000, // Haltestellen 30 Tage
];

// -----------------------------------------------------------------------------
// Wo liegt die Konfigurationsdatei?
//   1. Umgebungsvariable PENDELZUG_CONFIG (für den Test auf dem Rechner)
//   2. konfig.txt neben den Ordnern lib/ und public/ – auf dem Webspace also
//      ~/pendelzug/konfig.txt (außerhalb des Webordners httpdocs).
// -----------------------------------------------------------------------------
function konfigPfad(): ?string
{
    $kandidaten = [];
    $env = getenv('PENDELZUG_CONFIG');
    if ($env) $kandidaten[] = $env;
    $kandidaten[] = dirname(__DIR__) . '/konfig.txt';
    foreach ($kandidaten as $p) {
        if (is_readable($p)) return $p;
    }
    return null;
}

// -----------------------------------------------------------------------------
// Konfiguration lesen. Format wie ~/.pendelzug-gti: je Zeile NAME=Wert,
// Kommentare mit #. Eigener Leser statt parse_ini_file, weil der bei
// Sonderzeichen im Passwort (z. B. ! " ; =) Fehler macht.
// Gibt null zurück, wenn etwas Wichtiges fehlt.
// -----------------------------------------------------------------------------
function konfigLaden(): ?array
{
    $pfad = konfigPfad();
    if ($pfad === null) {
        error_log('Pendelzug: Konfigurationsdatei nicht gefunden');
        return null;
    }
    $k = KONFIG_STANDARD;
    foreach (preg_split('/\r?\n/', (string)file_get_contents($pfad)) as $zeile) {
        $zeile = trim($zeile);
        if ($zeile === '' || $zeile[0] === '#') continue;
        $gleich = strpos($zeile, '=');
        if ($gleich === false) continue;
        $name = trim(substr($zeile, 0, $gleich));
        $wert = trim(substr($zeile, $gleich + 1));
        if (preg_match('/^(["\']).*\1$/', $wert)) $wert = substr($wert, 1, -1);
        $k[$name] = $wert;
    }
    // Datenordner: für den Test auf dem Rechner per Umgebungsvariable
    // PENDELZUG_DATEN; sonst aus der Datei; sonst Unterordner „daten“ neben
    // der Konfigurationsdatei.
    if (getenv('PENDELZUG_DATEN')) $k['DATENORDNER'] = getenv('PENDELZUG_DATEN');
    if ($k['DATENORDNER'] === '') $k['DATENORDNER'] = dirname($pfad) . '/daten';
    // Ohne Salz: aus dem Passwort ableiten (geheim genug, aber besser setzen).
    if ($k['SALZ'] === '') $k['SALZ'] = hash('sha256', 'pendelzug|' . $k['GTI_PASS']);

    if ($k['GTI_USER'] === '' || $k['GTI_PASS'] === '') {
        error_log('Pendelzug: GTI_USER oder GTI_PASS fehlt');
        return null;
    }
    return $k;
}

// -----------------------------------------------------------------------------
// Eine GTI-Methode aufrufen. Gibt die Antwort als Array zurück oder beendet
// das Skript mit einer Fehlermeldung für die App (fehler() aus api.php).
// -----------------------------------------------------------------------------
function gtiAufruf(array $konfig, string $methode, array $daten): array
{
    $daten = ['version' => GTI_VERSION] + $daten;
    // Body genau EINMAL erzeugen; genau dieser Text wird signiert und gesendet.
    $body = json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    // Signatur: HMAC-SHA1 über den Body, Schlüssel = Passwort, Base64.
    $signatur = base64_encode(hash_hmac('sha1', $body, $konfig['GTI_PASS'], true));

    $header = [
        'Content-Type: application/json;charset=UTF-8',
        'Accept: application/json',
        'geofox-auth-user: ' . $konfig['GTI_USER'],
        'geofox-auth-signature: ' . $signatur,
        'geofox-auth-type: HmacSHA1',
        'X-Platform: web',
    ];

    $ch = curl_init(GTI_BASIS . $methode);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => $header,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_ENCODING => '',   // gzip annehmen, spart Datenvolumen
    ]);
    $text = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $fehlerText = curl_error($ch);
    curl_close($ch);

    if ($text === false) {
        error_log('Pendelzug: keine Verbindung zu GTI: ' . $fehlerText);
        fehler(502, 'HVV nicht erreichbar');
    }
    if ($status === 401) {
        error_log('Pendelzug: GTI lehnt die Zugangsdaten ab (401)');
        fehler(502, 'Server-Zugang zum HVV gestört');
    }
    $json = json_decode((string)$text, true);
    if (!is_array($json)) {
        error_log('Pendelzug: GTI-Antwort nicht lesbar, Status ' . $status);
        fehler(502, 'HVV antwortet nicht lesbar');
    }
    if (($json['returnCode'] ?? '') !== 'OK') {
        // z. B. ERROR_ROUTE = keine Verbindung gefunden. errorText ist für
        // Fahrgäste gedacht und darf an die App.
        error_log('Pendelzug: GTI ' . $methode . ': ' . ($json['returnCode'] ?? '?') . ' ' . ($json['errorDevInfo'] ?? ''));
        fehler(422, (string)($json['errorText'] ?? 'Keine Verbindung gefunden'));
    }
    return $json;
}
