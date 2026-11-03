# Pendelzug – Angaben für den Pebble-Store

Veröffentlicht am 02.11.2026. Neue Versionen im Developer Dashboard über
**New Release** hochladen (Version in package.json vorher erhöhen).

Zum Kopieren in das Formular im Developer Dashboard
(<https://developer.repebble.com/dashboard> → **New**).

| Feld | Inhalt |
|---|---|
| Datei (.pbw) | `store/pendelzug-1.2.0.pbw` (Kopie von `build/work.pbw` nach `./pebble.sh build`) |
| App Name | Pendelzug |
| Category | Tools & Utilities |
| Small Icon (80×80) | `store/icon_80.png` |
| Large Icon (144×144) | `store/icon_144.png` |
| Screenshots emery (200×228) | alle fünf aus `store/screenshots/` |
| Website URL | https://github.com/cptshit/pendelzug |
| Source Code URL | https://github.com/cptshit/pendelzug |
| App visibility | **Unlisted** (nur per Link installierbar) |
| Store-Seite | <https://apps.repebble.com/b7e5b4b47e684f52b75448df> (App-ID b7e5b4b47e684f52b75448df) |

## Description

(reiner Text, so übernehmen)

```
Pendelzug zeigt auf der Pebble Time 2, ob deine Bahnverbindung pünktlich ist und ob die Umstiege klappen – mit Echtzeitdaten des HVV (Hamburger Verkehrsverbund).

- Ampel auf einen Blick: grün = pünktlich, gelb = verspätet oder Umstieg knapp, rot = Ausfall oder Anschluss weg – immer mit Text, nicht nur Farbe.
- Alle Teilstücke mit Linie, Plan-Zeit, Verspätung und Umstiegszeit; bei verpasstem Anschluss die Ankunft der nächsten Verbindung.
- Drei Ansichten: Liste, Ankunft groß, Nächster Schritt.
- Automatik: Im eingestellten Zeitfenster (Standard Mo–Fr 07:00–09:00 Hinweg) startet die App von selbst, aktualisiert alle 2 Minuten und vibriert nur bei Verspätung, Ausfall oder verpasstem Umstieg.
- Tasten: Auf/Ab frühere/spätere Verbindung, Select neu laden, Select lang Richtung wechseln.

Einstellungen über das Zahnrad in der Pebble-App: Start und Ziel (mit Vorschlagssuche), Ansicht, Mindest-Umstiegszeit, Automatik-Fenster.

Gebiet: Haltestellen im HVV und in Teilen Norddeutschlands (z. B. Kiel, Lübeck) – nicht ganz Deutschland.

Daten: hvv / HBT GmbH (Geofox). Die App fragt über den Pendelzug-Server (wortreich.eu); man braucht keinen eigenen Zugang. Der Server erfährt dabei Start, Ziel und Uhrzeit der Suche sowie die IP-Adresse des Handys. Die IP-Adresse wird nicht gespeichert, Suchergebnisse nur kurz zwischengespeichert. Alle Angaben ohne Gewähr.

Freie Software (GPL-3.0), Quellcode: https://github.com/cptshit/pendelzug
```

## Release Notes 1.2.0

```
Neue Datenquelle: Die Verbindungen kommen jetzt mit Echtzeit direkt vom HVV (über den Pendelzug-Server, kein eigener Zugang nötig). Züge ohne Echtzeitdaten sind grau statt „+0“. Linien in ihren echten Farben (S3, RB61, RE6 …). Haltestellen-Vorschläge ebenfalls vom HVV – deshalb nur noch Haltestellen im HVV-Gebiet und in Teilen Norddeutschlands. Gespeicherte Start- und Zielwerte bleiben erhalten.
```

## Release Notes 1.1.0

```
Start und Ziel sind jetzt in den Einstellungen frei wählbar – mit Vorschlagssuche: ein paar Buchstaben tippen, Haltestelle antippen. Bahnhöfe und Haltestellen in der Nähe stehen oben. Der Rückweg führt umgekehrt.
```

## Release Notes 1.0.0

```
Erste Version: Verbindungen von Transitous, drei Ansichten, Einstellungsseite, Automatik mit Vibration.
```

## Logo neu zeichnen

Die Icons und das Menü-Symbol der Uhr (`resources/images/menu_icon.png`)
erzeugt `store/logo_zeichnen.py`:

```sh
python3 store/logo_zeichnen.py
```
