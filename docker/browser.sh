#!/bin/sh
# browser.sh – Ersatz für einen Webbrowser im Container.
#
# „pebble emu-app-config“ will die Einstellungsseite in einem Browser öffnen.
# Im Container gibt es keinen. Python ruft stattdessen dieses Skript auf
# (Umgebungsvariable BROWSER, gesetzt in pebble.sh) und übergibt die Adresse
# einer HTML-Datei. Wir kopieren sie in den Projektordner (build/), wo
# „./pebble.sh einstellungen“ sie auf deinem Rechner im Browser öffnet.
datei="${1#file://}"
cp "$datei" /work/build/einstellungen.html
echo "Einstellungsseite: build/einstellungen.html"
