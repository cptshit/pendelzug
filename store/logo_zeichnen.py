"""logo_zeichnen.py – zeichnet das Pendelzug-Logo (Zug von vorn).

Erzeugt:
  store/icon_144.png               großes Store-Icon (144×144)
  store/icon_80.png                kleines Store-Icon (80×80)
  resources/images/menu_icon.png   Symbol im Menü der Uhr (25×25, transparent)

Aufruf im Projektordner:  python3 store/logo_zeichnen.py
Benötigt Pillow (Python-Bildbibliothek).
"""
from PIL import Image, ImageDraw

# Farben aus der Pebble-Palette (64 Farben), damit es auf der Uhr gleich aussieht
BLAU = "#0055AA"
DUNKEL = "#000055"
WEISS = "#FFFFFF"
SILBER = "#AAAAAA"
ROT = "#AA0000"
GELB = "#FFFF55"


def store_icon(groesse):
    """Store-Icon: in 4-facher Größe zeichnen, dann glatt verkleinern."""
    s = 576                                   # Zeichenfläche
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=110, fill=BLAU)

    # Gleise: zwei Schienen, die nach unten auseinanderlaufen, mit Schwellen
    for y in range(470, 576, 34):
        breite = 70 + (y - 440) * 0.9
        d.line([(288 - breite, y), (288 + breite, y)], fill=DUNKEL, width=14)
    d.line([(236, 440), (150, 576)], fill=SILBER, width=18)
    d.line([(340, 440), (426, 576)], fill=SILBER, width=18)

    # Wagenkasten
    d.rounded_rectangle([148, 92, 428, 452], radius=72, fill=WEISS)
    # Zielanzeige oben
    d.rounded_rectangle([212, 118, 364, 146], radius=10, fill=DUNKEL)
    d.rectangle([232, 128, 344, 136], fill=GELB)
    # Frontscheibe
    d.rounded_rectangle([180, 166, 396, 286], radius=30, fill=DUNKEL)
    # rote Zierlinie
    d.rectangle([148, 312, 428, 336], fill=ROT)
    # Scheinwerfer
    for x in (214, 362):
        d.ellipse([x - 26, 362, x + 26, 414], fill=GELB)
    # Kupplung / Puffer
    d.rounded_rectangle([262, 420, 314, 452], radius=8, fill=SILBER)

    return img.resize((groesse, groesse), Image.LANCZOS)


def menu_icon():
    """Menü-Symbol 25×25, Pixel für Pixel. Die Uhr zeigt es in Graustufen,
    deshalb nur Schwarz, Weiß und Transparenz."""
    img = Image.new("RGBA", (25, 25), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    schwarz, weiss = (0, 0, 0, 255), (255, 255, 255, 255)
    d.rounded_rectangle([5, 1, 19, 19], radius=4, fill=schwarz)   # Wagenkasten
    d.rectangle([7, 4, 17, 9], fill=weiss)                          # Frontscheibe
    d.rectangle([7, 14, 8, 15], fill=weiss)                         # Scheinwerfer links
    d.rectangle([16, 14, 17, 15], fill=weiss)                       # Scheinwerfer rechts
    d.line([(8, 20), (5, 24)], fill=schwarz, width=2)               # Schiene links
    d.line([(16, 20), (19, 24)], fill=schwarz, width=2)             # Schiene rechts
    d.line([(7, 22), (17, 22)], fill=schwarz, width=1)              # Schwelle
    return img


if __name__ == "__main__":
    store_icon(144).save("store/icon_144.png")
    store_icon(80).save("store/icon_80.png")
    menu_icon().save("resources/images/menu_icon.png")
    print("Logo gezeichnet: store/icon_144.png, store/icon_80.png, resources/images/menu_icon.png")
