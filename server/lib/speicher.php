<?php
// =============================================================================
// server/lib/speicher.php – Zwischenspeicher und Zähler in Dateien
// =============================================================================
//
// Ein einfacher Webspace hat oft keine Datenbank wie Redis. Wir legen deshalb
// kleine JSON-Dateien in einen Ordner AUSSERHALB des Webordners. Dateinamen
// sind Prüfwerte (SHA-1/SHA-256), keine Klartexte.
// =============================================================================

declare(strict_types=1);

class Speicher
{
    private string $ordner;

    public function __construct(string $ordner)
    {
        $this->ordner = rtrim($ordner, '/');
        if (!is_dir($this->ordner)) {
            // 0700: nur der Webserver-Benutzer darf hinein
            @mkdir($this->ordner, 0700, true);
        }
        // Gelegentlich aufräumen (etwa jede 200. Anfrage), damit sich keine
        // alten Dateien ansammeln.
        if (random_int(1, 200) === 1) $this->aufraeumen();
    }

    private function datei(string $schluessel): string
    {
        // Nur harmlose Zeichen im Dateinamen
        return $this->ordner . '/' . preg_replace('/[^a-z0-9_\-]/i', '_', $schluessel) . '.json';
    }

    // Eintrag lesen, wenn er jünger als $maxAlter Sekunden ist; sonst null.
    public function lesen(string $schluessel, int $maxAlter): ?array
    {
        $d = $this->datei($schluessel);
        if (!is_file($d) || time() - (int)filemtime($d) > $maxAlter) return null;
        $daten = json_decode((string)@file_get_contents($d), true);
        return is_array($daten) ? $daten : null;
    }

    public function schreiben(string $schluessel, array $daten): void
    {
        // Erst in eine Hilfsdatei schreiben, dann umbenennen: So liest nie
        // jemand eine halb geschriebene Datei.
        $d = $this->datei($schluessel);
        $tmp = $d . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (@file_put_contents($tmp, json_encode($daten, JSON_UNESCAPED_UNICODE)) !== false) {
            @rename($tmp, $d);
        }
    }

    // Zähler für Mengenbegrenzungen: zählt einen Aufruf und sagt, ob er noch
    // erlaubt ist (höchstens $grenze Aufrufe je Zeitraum von $sekunden).
    // Der Zeitraum beginnt mit dem ersten Aufruf („festes Fenster“).
    public function zaehlen(string $schluessel, int $grenze, int $sekunden): bool
    {
        $d = $this->datei('zaehler_' . $schluessel);
        $fh = @fopen($d, 'c+');
        if ($fh === false) return true;   // Im Zweifel nicht blockieren
        flock($fh, LOCK_EX);              // gleichzeitige Anfragen nacheinander
        $z = json_decode((string)stream_get_contents($fh), true);
        if (!is_array($z) || time() - (int)($z['beginn'] ?? 0) >= $sekunden) {
            $z = ['beginn' => time(), 'anzahl' => 0];
        }
        $z['anzahl']++;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($z));
        flock($fh, LOCK_UN);
        fclose($fh);
        return $z['anzahl'] <= $grenze;
    }

    // Dateien löschen, die älter als 31 Tage sind (Haltestellen leben 30 Tage).
    private function aufraeumen(): void
    {
        foreach (glob($this->ordner . '/*.json') ?: [] as $d) {
            if (time() - (int)@filemtime($d) > 31 * 86400) @unlink($d);
        }
        foreach (glob($this->ordner . '/*.tmp') ?: [] as $d) {
            if (time() - (int)@filemtime($d) > 600) @unlink($d);
        }
    }
}
