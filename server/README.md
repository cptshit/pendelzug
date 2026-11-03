# Pendelzug-Server

Kleiner PHP-Vermittler zwischen der Pendelzug-App und der HVV-Schnittstelle
Geofox GTI. Er hält die Geofox-Zugangsdaten, damit die App ohne eigene
Zugangsdaten HVV-Daten bekommt. (Erlaubnis der HBT GmbH liegt vor.)

## Aufbau

```
server/public/api.php        Hauptprogramm (beantwortet die Anfragen der App)
server/httpdocs/api.php      öffentlicher Verweis darauf (liegt im Webordner)
server/lib/gti.php           Konfiguration lesen, GTI signiert aufrufen
server/lib/speicher.php      Zwischenspeicher und Mengenbegrenzung (Dateien)
server/konfig.beispiel.txt   Vorlage für die Konfiguration (ohne echte Werte)
server/lokal-testen.sh       Test auf dem eigenen Rechner
server/hochladen.sh          Code per SSH auf wortreich.eu bringen
```

## Schnittstelle für die App

| Anfrage | Antwort |
|---|---|
| `api.php?aktion=halt&name=Halstenbek` | `{ "halte": [ { name, city, combinedName, id, type, coordinate, serviceTypes } ] }` |
| `api.php?aktion=route&von=Master:98950&nach=Master:9046671&zeit=2026-11-04T07:00` | `{ "verbindungen": [ { scheduleElements: [ … ] } ] }` (GTI-Format, gekürzt) |

Fehler: HTTP-Status 4xx/5xx und `{ "fehler": "…" }` – der Text ist für die
Anzeige auf der Uhr gedacht.

## Schutz

- Der Server baut die HVV-Anfragen selbst, Eingaben werden streng geprüft.
- Zwischenspeicher: Verbindungen 60 s (Zeit auf 5 Minuten abgerundet),
  Haltestellen 30 Tage.
- Grenzen: 30 Anfragen pro Gerät in 10 Minuten, 5000 HVV-Anfragen pro Tag.
- IP-Adressen werden nicht gespeichert, nur ein Prüfwert (SHA-256 mit
  geheimem Salz).

## Lokal testen

Voraussetzung: PHP (mit curl) und Node.js auf dem Rechner, Zugangsdaten in
`~/.pendelzug-gti`.

```sh
bash server/lokal-testen.sh
```

## Auf dem Webspace einrichten (wortreich.eu)

Aufteilung wie bei Eselsohr – nur ein Verweis ist öffentlich:

```
~/httpdocs/pendelzug/api.php   öffentlich: https://www.wortreich.eu/pendelzug/api.php
~/pendelzug/                   privat (700), aus dem Netz nicht erreichbar
    public/api.php, lib/       Code
    konfig.txt                 Zugangsdaten (600) – nur hier, nie im Repo
    daten/                     Zwischenspeicher und Zähler
```

**1. Code hochladen** (auch nach jeder Änderung):

```sh
bash server/hochladen.sh
```

**2. Einmalig: Konfiguration anlegen.** Der erste Befehl überträgt die
Zugangsdaten aus `~/.pendelzug-gti` direkt in die Datei auf dem Webspace (ohne
Zwischenkopie und ohne Anzeige), der zweite hängt einen geheimen Zufallswert
an:

```sh
ssh wortreich 'umask 077; cat > pendelzug/konfig.txt' < ~/.pendelzug-gti
ssh wortreich 'echo "SALZ=$(openssl rand -hex 32)" >> pendelzug/konfig.txt'
```

**3. Testen:**

```sh
curl -s 'https://www.wortreich.eu/pendelzug/api.php?aktion=halt&name=Halstenbek'
```

Fehlermeldungen des Servers stehen im Plesk-Fehlerprotokoll
(`~/logs/wortreich.eu/`), immer mit „Pendelzug:“ am Anfang und nie mit
Zugangsdaten.
