# Pendelzug

Watchapp für die **Pebble Time 2**. Sie zeigt auf einen Blick, ob die
Bahnverbindung Halstenbek ⇄ Itzehoe pünktlich ist und ob die Umstiege klappen.

> **Stand:** Schritt 3 (in Arbeit) – Verbindungen kommen vom Handy (Transitous).
> Bis zur Einstellungsseite (Schritt 4) zeigt die Uhr immer Ansicht A.

**Ansicht A – Liste** (Standard), in drei der vier Test-Zustände:

![Ansicht A, Zustand „pünktlich“](screenshots/zustand1.png)
![Ansicht A, Zustand „Umstieg knapp“](screenshots/zustand2.png)
![Ansicht A, Zustand „Anschluss weg“](screenshots/zustand3.png)

**Ansicht B – Ankunft groß** und **Ansicht C – Nächster Schritt**:

![Ansicht B](screenshots/ansicht_b.png)
![Ansicht C](screenshots/ansicht_c.png)

## Bedienung

| Taste | Funktion |
|---|---|
| Auf / Ab | frühere / spätere Verbindung |
| Select | neu laden |
| Select lang (≥ 0,7 s) | Richtung umschalten (Hinweg ⇄ Rückweg) |
| Zurück | App schließen |

Die Richtung wird beim Start nach der Tageszeit gewählt: vormittags Hinweg,
ab 12 Uhr Rückweg.

**Testbetrieb:** Steht in `src/embeddedjs/main.js` `TESTBETRIEB = true`, zeigt
die App feste Testdaten. Dann blättern Auf/Ab durch vier Test-Zustände
(pünktlich, Umstieg knapp, Anschluss weg, Warten am Umstieg) und Select wechselt
die Ansicht (A → B → C).

## Datenquelle

Die Verbindungen kommen derzeit von **[Transitous](https://transitous.org)**,
einem freien, gemeinschaftlich betriebenen Fahrplandienst.
Datenquellen und Lizenzen: <https://transitous.org/sources/>.
Kartendaten © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende.

Transitous verlangt bei jeder Anfrage eine Kontaktadresse im User-Agent. Sie
steht in `src/pkjs/konfig.js` (`KONTAKT`). Ist sie leer, sendet die App keine
Anfrage und zeigt „Kontakt fehlt“.

Später wird auf die hvv-Schnittstelle Geofox umgestellt. Der Handy-Teil ist
dafür in Adapter (`transitous.js`) und quellenunabhängige Aufbereitung
(`aufbereitung.js`) getrennt.

## Technik

- [Alloy](https://developer.repebble.com/guides/alloy/) (JavaScript auf der Uhr) mit dem Oberflächen-Framework Piu
- Zielplattform: emery (Pebble Time 2, 200 × 228 Pixel, 64 Farben)
- Pebble-SDK und Emulator laufen in einem **Docker-Container**, weil der
  Emulator glibc 2.38 oder neuer braucht (Debian 12 / MX Linux 23 hat nur 2.36)

## Bauen und im Emulator starten

Voraussetzung: Docker ist installiert und dein Benutzer ist in der Gruppe
`docker` (prüfen mit `groups`).

### Einmalig: Erlaubnis für das Emulator-Fenster

Der Emulator läuft im Container, sein Fenster soll aber auf deinem Bildschirm
erscheinen. Dafür muss dein X-Server (das Programm, das unter Linux die Fenster
zeichnet) Verbindungen von deinem eigenen Benutzer zulassen. Prüfen:

```sh
xhost
```

Steht dort `SI:localuser:<dein Benutzername>`, ist alles in Ordnung. Wenn nicht:

```sh
xhost +SI:localuser:$USER
```

Das gilt bis zum Abmelden und muss danach erneut eingegeben werden.
Bitte **nicht** `xhost +` ohne Zusatz verwenden, das würde jedem Programm im
Netzwerk Zugriff auf deinen Bildschirm geben.

### Bauen und starten

Alle Befehle im Projektordner. `./pebble.sh` funktioniert genau wie der
normale `pebble`-Befehl, nur läuft er im Container:

```sh
./pebble.sh build                      # App bauen
./pebble.sh install --emulator emery   # im Emulator installieren und starten
./pebble.sh logs --emulator emery      # Log-Ausgaben ansehen (Strg+C beendet)
./pebble.sh screenshot --no-open --emulator emery screenshots/bild.png
./pebble.sh stop                       # Container und Emulator beenden
```

Beim allerersten Aufruf baut das Skript das Docker-Image. Das dauert einige
Minuten, weil SDK und Werkzeuge heruntergeladen werden.

Hängt der Emulator: `./pebble.sh kill`, dann `./pebble.sh wipe`, dann neu installieren.

## Projektaufbau

```
src/embeddedjs/main.js        Uhr-Code: Ansichten A, B, C (Piu)
src/embeddedjs/testdaten.js   vier Beispiel-Verbindungen für den Testbetrieb
src/embeddedjs/manifest.json  Liste der JavaScript-Module der Uhr
src/pkjs/index.js             Handy-Code (PKJS): Anfragen der Uhr beantworten
src/pkjs/konfig.js            Haltestellen, Kontakt für Transitous, Grenzwerte
src/pkjs/transitous.js        Adapter für die Verbindungssuche bei Transitous
src/pkjs/aufbereitung.js      Umstiege, Ampel, Paket für die Uhr (quellenunabhängig)
src/c/mdbl.c                  startet JavaScript auf der Uhr (Speichergrößen)
package.json                  App-Daten: Name, UUID, Plattformen
docker/Dockerfile             Entwicklungsumgebung (Ubuntu 24.04 + Pebble-SDK)
pebble.sh                     Startskript für die Docker-Umgebung
```

## Lizenz

Pendelzug steht unter der **GNU General Public License, Version 3 oder neuer**
(GPL-3.0-or-later), siehe [LICENSE](LICENSE). Kurz gesagt: Jeder darf den Code
nutzen, ändern und weitergeben. Wer eine veränderte Version weitergibt, muss
deren Quellcode ebenfalls unter der GPL offenlegen.
