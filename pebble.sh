#!/usr/bin/env bash
# pebble.sh – ruft das Pebble-Werkzeug im Docker-Container auf.
#
# Benutzung genau wie der normale „pebble“-Befehl, nur mit ./pebble.sh davor:
#   ./pebble.sh build
#   ./pebble.sh install --emulator emery
#   ./pebble.sh screenshot --no-open --emulator emery bild.png
#
# Zusätzliche Befehle dieses Skripts:
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
    docker run -d --name "$CONTAINER" \
        -v "$PROJEKT":/work \
        -v /tmp/.X11-unix:/tmp/.X11-unix:ro \
        -e DISPLAY="${DISPLAY:-:0}" \
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
    shell)
        container_starten
        exec docker exec $TTY_OPT "$CONTAINER" bash ;;
    *)
        container_starten
        exec docker exec $TTY_OPT "$CONTAINER" pebble "$@" ;;
esac
