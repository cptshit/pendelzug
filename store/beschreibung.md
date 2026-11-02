# Pendelzug – Angaben für den Pebble-Store

Zum Kopieren in das Formular im Developer Dashboard
(<https://developer.repebble.com/dashboard> → **New**).

| Feld | Inhalt |
|---|---|
| Datei (.pbw) | `store/pendelzug-1.0.0.pbw` (Kopie von `build/work.pbw` nach `./pebble.sh build`) |
| App Name | Pendelzug |
| Category | Tools & Utilities |
| Small Icon (80×80) | `store/icon_80.png` |
| Large Icon (144×144) | `store/icon_144.png` |
| Screenshots emery (200×228) | alle fünf aus `store/screenshots/` |
| Website URL | https://github.com/cptshit/pendelzug |
| Source Code URL | https://github.com/cptshit/pendelzug |
| App visibility | **Unlisted** (nur per Link installierbar) |

## Description

(reiner Text, so übernehmen)

```
Pendelzug zeigt auf der Pebble Time 2, ob deine Bahnverbindung zwischen Halstenbek und Itzehoe pünktlich ist und ob die Umstiege klappen.

- Ampel auf einen Blick: grün = pünktlich, gelb = verspätet oder Umstieg knapp, rot = Ausfall oder Anschluss weg – immer mit Text, nicht nur Farbe.
- Alle Teilstücke mit Linie, Plan-Zeit, Verspätung und Umstiegszeit; bei verpasstem Anschluss die Ankunft der nächsten Verbindung.
- Drei Ansichten: Liste, Ankunft groß, Nächster Schritt.
- Automatik: Im eingestellten Zeitfenster (Standard Mo–Fr 07:00–09:00 Hinweg) startet die App von selbst, aktualisiert alle 2 Minuten und vibriert nur bei Verspätung, Ausfall oder verpasstem Umstieg.
- Tasten: Auf/Ab frühere/spätere Verbindung, Select neu laden, Select lang Richtung wechseln.

Einstellungen über das Zahnrad in der Pebble-App: Ansicht, Mindest-Umstiegszeit, Automatik-Fenster.

Daten: Transitous (https://transitous.org, Quellen: https://transitous.org/sources/), Kartendaten © OpenStreetMap-Mitwirkende. Alle Angaben ohne Gewähr.

Freie Software (GPL-3.0), Quellcode: https://github.com/cptshit/pendelzug
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
