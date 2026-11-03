#!/usr/bin/env bash
# =============================================================================
# server/hochladen.sh – Server-Code auf wortreich.eu bringen
# =============================================================================
#
# Überträgt per SSH (Zugang „wortreich“ aus ~/.ssh/config):
#   server/public/  und  server/lib/   →  ~/pendelzug/   (privat, Rechte 700/600)
#   server/httpdocs/api.php            →  ~/httpdocs/pendelzug/api.php (öffentlich)
#
# Überträgt NIE die Zugangsdaten (konfig.txt) und nie den Zwischenspeicher
# (daten/). Die Konfiguration auf dem Webspace legst du einmal selbst an,
# siehe server/README.md.
#
# Aufruf (im Projektordner):   bash server/hochladen.sh
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")"          # in den Ordner server/ wechseln
ZIEL=wortreich

echo "Lade Code nach $ZIEL:~/pendelzug/ …"
# tar packt public/ und lib/ zusammen, ssh entpackt es auf dem Webspace.
# umask 077 = neue Dateien und Ordner nur für den eigenen Benutzer.
tar czf - public lib | ssh "$ZIEL" '
    set -e
    umask 077
    mkdir -p pendelzug
    chmod 700 pendelzug
    tar xzf - -C pendelzug
    chmod -R go-rwx pendelzug/public pendelzug/lib
'

echo "Lege den öffentlichen Verweis an: httpdocs/pendelzug/api.php …"
# Der öffentliche Ordner muss für den Webserver lesbar sein (755/644),
# wie die übrigen Ordner in httpdocs.
ssh "$ZIEL" 'mkdir -p httpdocs/pendelzug && chmod 755 httpdocs/pendelzug && cat > httpdocs/pendelzug/api.php && chmod 644 httpdocs/pendelzug/api.php' < httpdocs/api.php

echo "Fertig. Test:  curl -s 'https://www.wortreich.eu/pendelzug/api.php?aktion=halt&name=Halstenbek'"
