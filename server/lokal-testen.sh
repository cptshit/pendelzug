#!/usr/bin/env bash
# =============================================================================
# server/lokal-testen.sh – Pendelzug-Server auf dem eigenen Rechner testen
# =============================================================================
#
# Startet den eingebauten PHP-Webserver nur für diesen Rechner (127.0.0.1),
# fragt Haltestellen und eine Verbindung ab und zeigt das Ergebnis.
# Die Zugangsdaten kommen aus ~/.pendelzug-gti und werden nicht ausgegeben.
# Der Zwischenspeicher landet in server/daten/ (von git ignoriert).
#
# Aufruf (im Projektordner):   bash server/lokal-testen.sh
# =============================================================================

set -u
cd "$(dirname "$0")"          # in den Ordner server/ wechseln

PORT=8099
URL="http://127.0.0.1:$PORT/api.php"
mkdir -p daten

# PHP-Server im Hintergrund starten; Konfiguration und Datenordner per
# Umgebungsvariable (auf dem Webspace stehen sie fest, siehe README.md).
PENDELZUG_CONFIG="$HOME/.pendelzug-gti" PENDELZUG_DATEN="$PWD/daten" \
    php -S 127.0.0.1:$PORT -t public > daten/php-test.log 2>&1 &
SERVER=$!
# Beim Beenden des Skripts den PHP-Server immer mit beenden.
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1

# Hilfsfunktion: Anfrage schicken, Antwort mit Node lesbar zusammenfassen.
abfrage() {
    echo "── $1"
    curl -s "$URL?$2" | node -e '
        let t = ""; process.stdin.on("data", d => t += d).on("end", () => {
          let j; try { j = JSON.parse(t); } catch (e) { console.log("   nicht lesbar: " + t.slice(0, 200)); return; }
          if (j.fehler) { console.log("   FEHLER: " + j.fehler); return; }
          if (j.halte) j.halte.slice(0, 3).forEach(h => console.log("   " + h.combinedName + " (" + h.id + ")"));
          if (j.verbindungen) {
            console.log("   " + j.verbindungen.length + " Verbindungen, Antwort " + t.length + " Zeichen");
            j.verbindungen.slice(0, 3).forEach(v => console.log("   " + v.scheduleElements
              .filter(e => !/^CHANGE/.test(e.line.type.simpleType))
              .map(e => e.line.name + " " + e.from.depTime.time + (e.from.depDelay !== undefined ? "+" + Math.round(e.from.depDelay / 60) : ""))
              .join("  →  ")));
          }
        });'
}

JETZT=$(date +%Y-%m-%dT%H:%M)
abfrage "Haltestelle „Halstenbek“"                 "aktion=halt&name=Halstenbek"
abfrage "Haltestelle „Itzehoe“"                    "aktion=halt&name=Itzehoe"
abfrage "Verbindung Halstenbek → Itzehoe ab $JETZT" "aktion=route&von=Master:98950&nach=Master:9046671&zeit=$JETZT"
abfrage "Gleiche Anfrage nochmal (aus dem Zwischenspeicher)" "aktion=route&von=Master:98950&nach=Master:9046671&zeit=$JETZT"

echo
echo "Meldungen des Servers (ohne Zugangsdaten):"
grep -i "pendelzug" daten/php-test.log || echo "   keine"
