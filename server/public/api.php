<?php
// =============================================================================
// server/public/api.php – Pendelzug-Server: Vermittler zwischen App und HVV
// =============================================================================
//
// Wozu: Die HVV-Schnittstelle Geofox GTI verlangt Zugangsdaten. Store-Nutzer
// haben keine eigenen. Dieser Server hält Henriks Zugangsdaten (mit
// Erlaubnis der HBT GmbH), stellt die Anfragen an den HVV und gibt die
// Antwort an die App weiter. Die Zugangsdaten verlassen den Server nie.
//
// Diese Datei liegt im ÖFFENTLICHEN Ordner des Webspace, z. B.
//   https://wortreich.eu/pendelzug/api.php
// Alles Schutzwürdige (Zugangsdaten, Zwischenspeicher) liegt AUSSERHALB davon,
// siehe server/README.md.
//
// Zwei Aktionen (HTTP GET):
//   api.php?aktion=halt&name=Halstenbek
//       Haltestellen suchen (GTI checkName). Antwort: { "halte": [ … ] }
//   api.php?aktion=route&von=Master:98950&nach=Master:9046671&zeit=2026-11-04T07:00
//       Verbindungen suchen (GTI getRoute mit Echtzeit), ab „zeit“ (Ortszeit).
//       Antwort: { "verbindungen": [ … ] } im GTI-Format, gekürzt.
// Fehler: HTTP-Status 4xx/5xx und { "fehler": "Text für die Uhr" }.
//
// Schutz von Henriks Zugang (Nutzungsbedingungen: Serverlast gering halten):
//   - Der Server baut die HVV-Anfrage selbst; Eingaben werden streng geprüft.
//   - Zwischenspeicher: gleiche Anfragen gehen nur einmal zum HVV.
//   - Grenze pro Gerät (IP-Adresse) und Grenze pro Tag für alle zusammen.
//   - IP-Adressen werden nicht gespeichert, nur ein nicht umkehrbarer Prüfwert.
// =============================================================================

declare(strict_types=1);

require __DIR__ . '/../lib/gti.php';
require __DIR__ . '/../lib/speicher.php';

// Antworten sind immer JSON in UTF-8.
header('Content-Type: application/json; charset=utf-8');
// Zwischenspeicher im Netz (Proxys, Handy) nicht benutzen: Echtzeitdaten.
header('Cache-Control: no-store');

// Antwort schicken und Skript beenden.
function antworte(int $status, array $daten): void
{
    http_response_code($status);
    echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fehler(int $status, string $text): void
{
    antworte($status, ['fehler' => $text]);
}

// -----------------------------------------------------------------------------
// Einstellungen und Zugangsdaten laden
// -----------------------------------------------------------------------------
$konfig = konfigLaden();
if ($konfig === null) {
    // Bewusst ohne Pfad und Details: Die Meldung sieht jeder.
    fehler(500, 'Server nicht eingerichtet');
}
$speicher = new Speicher($konfig['DATENORDNER']);

// -----------------------------------------------------------------------------
// Mengenbegrenzung pro Gerät
// -----------------------------------------------------------------------------
// Prüfwert statt IP: SHA-256 aus IP und einem geheimen Zufallswert (Salz) aus
// der Konfiguration. Ohne das Salz lässt sich die IP nicht zurückrechnen.
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unbekannt';
$geraet = hash('sha256', $konfig['SALZ'] . '|' . $ip);
if (!$speicher->zaehlen('geraet_' . $geraet, (int)$konfig['GRENZE_GERAET'], (int)$konfig['GRENZE_GERAET_SEKUNDEN'])) {
    fehler(429, 'Zu viele Anfragen – bitte kurz warten');
}

// -----------------------------------------------------------------------------
// Aktion auswerten
// -----------------------------------------------------------------------------
$aktion = $_GET['aktion'] ?? '';

if ($aktion === 'halt') {
    // Name: 2–60 Zeichen, keine Steuerzeichen.
    $name = trim((string)($_GET['name'] ?? ''));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 60 || preg_match('/[\x00-\x1F]/', $name)) {
        fehler(400, 'Ungültiger Haltestellenname');
    }
    $schluessel = 'halt_' . sha1(mb_strtolower($name));
    $ergebnis = $speicher->lesen($schluessel, (int)$konfig['CACHE_HALT_SEKUNDEN']);
    if ($ergebnis === null) {
        tagesgrenzePruefen($speicher, $konfig);
        $gti = gtiAufruf($konfig, 'checkName', [
            'theName' => ['name' => $name, 'type' => 'STATION'],
            'maxList' => 10,
            'coordinateType' => 'EPSG_4326',
        ]);
        // Nur die Felder weitergeben, die die App braucht.
        $halte = [];
        foreach ($gti['results'] ?? [] as $r) {
            if (($r['type'] ?? '') !== 'STATION') continue;
            $halte[] = [
                'name' => $r['name'] ?? '',
                'city' => $r['city'] ?? '',
                'combinedName' => $r['combinedName'] ?? '',
                'id' => $r['id'] ?? '',
                'type' => 'STATION',
                'coordinate' => $r['coordinate'] ?? null,
                'serviceTypes' => $r['serviceTypes'] ?? [],
            ];
        }
        $ergebnis = ['halte' => $halte];
        $speicher->schreiben($schluessel, $ergebnis);
    }
    antworte(200, $ergebnis);
}

if ($aktion === 'route') {
    // Haltestellen-Kennungen von Geofox, z. B. „Master:98950“.
    $von = (string)($_GET['von'] ?? '');
    $nach = (string)($_GET['nach'] ?? '');
    foreach ([$von, $nach] as $id) {
        if (!preg_match('/^[A-Za-z]{1,20}:\d{1,12}$/', $id)) {
            fehler(400, 'Ungültige Haltestelle');
        }
    }
    if ($von === $nach) {
        fehler(400, 'Start und Ziel sind gleich');
    }

    // Zeit „JJJJ-MM-TTTHH:MM“ in Ortszeit (Europe/Berlin). Höchstens einen Tag
    // in Vergangenheit oder Zukunft – mehr braucht die App nicht.
    $zone = new DateTimeZone('Europe/Berlin');
    $zeit = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', (string)($_GET['zeit'] ?? ''), $zone);
    if ($zeit === false || abs($zeit->getTimestamp() - time()) > 86400) {
        fehler(400, 'Ungültige Zeit');
    }
    // Auf 5 Minuten abrunden: Mehrere Geräte mit derselben Strecke landen
    // dann im selben Zwischenspeicher-Eintrag. Die App sucht ohnehin ab
    // 60 Minuten vor jetzt, 5 Minuten früher schaden nicht.
    $minuten = (int)$zeit->format('i');
    $zeit = $zeit->setTime((int)$zeit->format('H'), $minuten - $minuten % 5);

    $schluessel = 'route_' . sha1($von . '|' . $nach . '|' . $zeit->format('Y-m-d H:i'));
    $ergebnis = $speicher->lesen($schluessel, (int)$konfig['CACHE_ROUTE_SEKUNDEN']);
    if ($ergebnis === null) {
        tagesgrenzePruefen($speicher, $konfig);
        $gti = gtiAufruf($konfig, 'getRoute', [
            // Für start/dest reicht die Kennung mit Typ.
            'start' => ['id' => $von, 'type' => 'STATION'],
            'dest' => ['id' => $nach, 'type' => 'STATION'],
            'time' => ['date' => $zeit->format('d.m.Y'), 'time' => $zeit->format('H:i')],
            'timeIsDeparture' => true,
            'schedulesBefore' => 0,
            'schedulesAfter' => 5,
            'realtime' => 'REALTIME',
            'intermediateStops' => false,
        ]);
        $ergebnis = ['verbindungen' => verbindungenKuerzen($gti['realtimeSchedules'] ?? $gti['schedules'] ?? [])];
        $speicher->schreiben($schluessel, $ergebnis);
    }
    antworte(200, $ergebnis);
}

fehler(400, 'Unbekannte Aktion');

// =============================================================================
// Hilfsfunktionen
// =============================================================================

// Tagesgrenze für alle Geräte zusammen. Nur echte HVV-Anfragen zählen
// (Antworten aus dem Zwischenspeicher kosten den HVV nichts).
function tagesgrenzePruefen(Speicher $speicher, array $konfig): void
{
    if (!$speicher->zaehlen('tag_' . date('Y-m-d'), (int)$konfig['GRENZE_TAG'], 86400)) {
        fehler(503, 'Tageslimit erreicht – morgen wieder');
    }
}

// GTI-Verbindungen auf das kürzen, was die App auswertet. Spart Datenvolumen
// auf dem Handy (die Störungsmeldungen allein sind mehrere KB groß).
function verbindungenKuerzen(array $schedules): array
{
    $halt = function (array $sd, string $zeitFeld, string $verspFeld): array {
        $h = ['name' => $sd['name'] ?? ''];
        foreach ([$zeitFeld, $verspFeld, 'platform', 'realtimePlatform', 'cancelled', 'extra'] as $f) {
            if (array_key_exists($f, $sd)) $h[$f] = $sd[$f];
        }
        return $h;
    };
    $ergebnis = [];
    foreach ($schedules as $s) {
        $teile = [];
        foreach ($s['scheduleElements'] ?? [] as $el) {
            $linie = $el['line'] ?? [];
            $t = [
                'from' => $halt($el['from'] ?? [], 'depTime', 'depDelay'),
                'to' => $halt($el['to'] ?? [], 'arrTime', 'arrDelay'),
                'line' => [
                    'name' => $linie['name'] ?? '',
                    'direction' => $linie['direction'] ?? '',
                    'type' => ['simpleType' => $linie['type']['simpleType'] ?? ''],
                ],
            ];
            if (!empty($el['cancelled'])) $t['cancelled'] = true;
            if (!empty($el['extra'])) $t['extra'] = true;
            $teile[] = $t;
        }
        $ergebnis[] = ['scheduleElements' => $teile];
    }
    return $ergebnis;
}
