#include <pebble.h>

// Startet die JavaScript-Maschine (XS von Moddable), die src/embeddedjs/ ausführt.
//
// Speicher: Ohne Angaben bekommt JavaScript nur 32 kB. Beim Umschalten der
// Ansicht baut Piu den Bildschirm neu auf, und damit lief der Speicher voll
// („Alloy: Fatal Error – memory full“). Deshalb geben wir feste, größere
// Werte vor (Werte aus der Alloy-Doku, Abschnitt „Memory“):
//   stack  =  5 kB  Aufrufstapel
//   slot   = 31 kB  Objekte und Werte
//   chunk  = 19 kB  Strings und Puffer
// Zusammen 56 kB von 128 kB App-RAM. Laut Doku müssen immer alle drei Werte
// gesetzt sein (oder keiner); oberhalb von 32 kB wächst der Speicher nicht
// mehr von selbst.
#define PENDELZUG_STACK 5120
#define PENDELZUG_SLOT  31744
#define PENDELZUG_CHUNK 19456

int main(void) {
  Window *w = window_create();
  window_stack_push(w, true);

  ModdableCreationRecord cr = {
    .recordSize = sizeof(cr),
    .stack = PENDELZUG_STACK,
    .slot = PENDELZUG_SLOT,
    .chunk = PENDELZUG_CHUNK,
  };
#ifdef PBL_DEBUG
  // Gebaut mit `pebble build --debug`: JavaScript-Debugger xsbug einschalten.
  cr.flags = kModdableCreationFlagDebug;
#endif
  moddable_createMachine(&cr);

  window_destroy(w);
}
