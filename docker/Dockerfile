# Pendelzug – Entwicklungsumgebung für das Pebble-SDK
#
# Warum ein Container? Der Pebble-Emulator braucht glibc 2.38 oder neuer.
# MX Linux 23 (Debian 12) hat nur glibc 2.36. Ubuntu 24.04 hat 2.39 –
# deshalb laufen SDK und Emulator hier drin, das Wirtssystem bleibt unverändert.
#
# Installationsschritte nach https://developer.repebble.com/sdk/ (Abschnitt Linux).
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8

# Laufzeit-Bibliotheken für Emulator (SDL = Fenster, pixman/glib = QEMU)
# plus Node.js/npm (für PKJS-Teile des Builds) und Hilfsprogramme.
# „make“ steht nicht in der offiziellen Liste, wird aber gebraucht:
# mcrun (übersetzt den Uhr-JavaScript-Code) ruft intern make auf.
# Ebenso libpng: ohne sie startet der Emulator (qemu-pebble) nicht.
# tzdata: Zeitzonen-Daten, damit Handy-Teil und Emulator deutsche Zeit zeigen.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git python3 make tzdata \
        nodejs npm \
        libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0 libpng16-16t64 \
        libx11-6 libxext6 libxcursor1 libxi6 libxrandr2 libxss1 libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Im Ubuntu-Image gibt es schon den Benutzer „ubuntu“ mit der Nummer (UID) 1000.
# Wir benennen ihn passend um. Die UID muss zu deinem Linux-Benutzer passen,
# damit Dateien, die im Container entstehen (z. B. build/), dir gehören.
ARG HOST_UID=1000
ARG HOST_GID=1000
RUN usermod -l pebble -d /home/pebble -m ubuntu \
    && groupmod -n pebble ubuntu \
    && usermod -u ${HOST_UID} pebble && groupmod -g ${HOST_GID} pebble

USER pebble
WORKDIR /home/pebble
ENV PATH=/home/pebble/.local/bin:$PATH

# uv (Python-Paketmanager), dann das Pebble-Kommandozeilenwerkzeug.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && uv tool install pebble-tool

# Das eigentliche SDK (Compiler, Bibliotheken, Emulator-Firmware).
# „yes“ beantwortet mögliche Rückfragen beim ersten Start automatisch.
RUN yes | pebble sdk install latest

WORKDIR /work
CMD ["sleep", "infinity"]
