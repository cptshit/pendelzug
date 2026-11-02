#!/usr/bin/env bash
# pebble.sh – ruft das Pebble-Werkzeug im Docker-Container auf.
#
# Benutzung genau wie der normale „pebble“-Befehl, nur mit ./pebble.sh davor:
#   ./pebble.sh build
#   ./pebble.sh install --emulator emery
#   ./pebble.sh screenshot --no-open --emulator emery bild.png
#
# Zusätzliche Befehle dieses Skripts:
#   ./pebble.sh einstellungen – öffnet die Einstellungsseite (Clay) der App
#                        im Emulator in deinem Browser
#   ./pebble.sh shell    – öffnet eine Kommandozeile im Container
#   ./pebble.sh stop     – beendet Container und Emulator
#   ./pebble.sh rebuild  – baut das Image neu (z. B. für ein SDK-Update)
#
# Warum ein dauerhaft laufender Container? Der Emulator ist ein Prozess, der
# nach „pebble install“ weiterläuft. Spätere Befehle (screenshot, logs,
# emu-button) verbinden sich mit ihm. Mit „docker run“ pro Befehl wäre er
# nach jedem Befehl wieder weg – deshalb einmal starten und dann „docker exec“.
set -euo pipefail

IMAGE=pendelzug-sdk
CONTAINER=pendelzug-sdk
# Ordner, in dem dieses Skript liegt = Projektordner
PROJEKT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

image_bauen() {
    docker build -t "$IMAGE" \
        --build-arg HOST_UID="$(id -u)" --build-arg HOST_GID="$(id -g)" \
        "$PROJEKT/docker"
}

container_starten() {
    # Image fehlt? Dann zuerst bauen (dauert beim ersten Mal einige Minuten).
    docker image inspect "$IMAGE" >/dev/null 2>&1 || image_bauen

    # Läuft der Container schon? Dann nichts tun.
    if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" = "true" ]; then
        return
    fi
    # Alter, gestoppter Container? Wegräumen.
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

    # -v Projekt:/work       → der Container sieht und bearbeitet deinen Projektordner
    # -v /tmp/.X11-unix + DISPLAY → das Emulator-Fenster erscheint auf deinem Bildschirm
    #                          (dafür ist einmal pro Sitzung „xhost“ nötig, siehe README)
    # -e TZ                  → deutsche Zeit im Container (Handy-Teil und Emulator)
    # --network host         → Container nutzt das Netz deines Rechners. Nötig für die
    #                          Einstellungsseite: Dein Browser schickt die Werte an einen
    #                          kleinen Server des Pebble-Werkzeugs im Container zurück.
    # -e BROWSER             → statt eines Browsers (gibt es im Container nicht) legt
    #                          docker/browser.sh die Seite in build/ ab
    docker run -d --name "$CONTAINER" \
        --network host \
        -e BROWSER=/work/docker/browser.sh \
        -v "$PROJEKT":/work \
        -v /tmp/.X11-unix:/tmp/.X11-unix:ro \
        -e DISPLAY="${DISPLAY:-:0}" \
        -e TZ=Europe/Berlin \
        "$IMAGE" >/dev/null
}

# -t (Terminal) nur, wenn wir wirklich in einem Terminal sitzen.
# So funktioniert das Skript auch aus anderen Programmen heraus.
TTY_OPT=-i
[ -t 0 ] && [ -t 1 ] && TTY_OPT=-it

case "${1:-}" in
    stop)
        docker rm -f "$CONTAINER" >/dev/null 2>&1 && echo "Container gestoppt." ;;
    rebuild)
        docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
        docker build --no-cache -t "$IMAGE" \
            --build-arg HOST_UID="$(id -u)" --build-arg HOST_GID="$(id -g)" \
            "$PROJEKT/docker" ;;
    einstellungen)
        # Pebble-Werkzeug im Hintergrund starten: Es erzeugt die Seite und
        # wartet dann, bis du im Browser auf „Speichern“ tippst.
        container_starten
        mkdir -p "$PROJEKT/build"
        rm -f "$PROJEKT/build/einstellungen.html"
        docker exec "$CONTAINER" pebble emu-app-config --emulator emery &
        werkzeug=$!
        for _ in $(seq 1 30); do
            [ -f "$PROJEKT/build/einstellungen.html" ] && break
            sleep 1
        done
        if [ ! -f "$PROJEKT/build/einstellungen.html" ]; then
            echo "Die Einstellungsseite kam nicht. Läuft die App im Emulator?"
            kill "$werkzeug" 2>/dev/null
            exit 1
        fi
        xdg-open "$PROJEKT/build/einstellungen.html" >/dev/null 2>&1 \
            || echo "Bitte im Browser öffnen: $PROJEKT/build/einstellungen.html"
        echo "Warte, bis du auf der Seite „Speichern“ tippst …"
        wait "$werkzeug"
        echo "Einstellungen an die App geschickt." ;;
    shell)
        container_starten
        exec docker exec $TTY_OPT "$CONTAINER" bash ;;
    *)
        container_starten
        exec docker exec $TTY_OPT "$CONTAINER" pebble "$@" ;;
esac
