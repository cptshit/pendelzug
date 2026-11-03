// hmac-sha1.js – HMAC-SHA1 mit Base64-Ergebnis, ohne fremde Bibliotheken.
//
// Wozu: Geofox GTI verlangt bei jeder Anfrage eine Signatur (Header
// „geofox-auth-signature“): HMAC-SHA1 über den Request-Body, Schlüssel ist
// das Passwort, Ergebnis Base64-codiert.
//
// Warum selbst geschrieben: Im Handy-Teil der Pebble-App (PKJS) gibt es kein
// Node-Modul „crypto“ und keine Web-Crypto-Schnittstelle, auf die man sich
// verlassen kann. SHA-1 und HMAC sind kurz und genau festgelegt (RFC 3174,
// RFC 2104). Geprüft wird diese Datei gegen Node-crypto mit
// tools/hmac-test.js.
//
// Hinweis: SHA-1 gilt heute nicht mehr als sicher für neue Verfahren. Wir
// nehmen es nur, weil Geofox es so vorschreibt.

// Text → Liste von Bytes in UTF-8. Wichtig für Umlaute und „ß“ in
// Haltestellennamen: Der Server rechnet über die UTF-8-Bytes.
function utf8Bytes(text) {
	var bytes = [];
	for (var i = 0; i < text.length; i++) {
		var c = text.charCodeAt(i);
		// Zeichen außerhalb der Grundebene (z. B. Emoji) bestehen in
		// JavaScript aus zwei Teilen („Surrogate“) – zusammensetzen.
		if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
			var c2 = text.charCodeAt(i + 1);
			if (c2 >= 0xdc00 && c2 <= 0xdfff) {
				c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
				i++;
			}
		}
		if (c < 0x80) bytes.push(c);
		else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
		else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
		else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
	}
	return bytes;
}

// SHA-1 über eine Byte-Liste → 20 Bytes Prüfsumme.
function sha1(bytes) {
	// Nachricht auffüllen: ein 1-Bit (0x80), Nullen, am Ende die Länge in
	// Bit als 64-Bit-Zahl, sodass die Länge ein Vielfaches von 64 Bytes ist.
	var m = bytes.slice();
	var bitLaenge = bytes.length * 8;
	m.push(0x80);
	while (m.length % 64 !== 56) m.push(0);
	// Längen über 4 GB kommen hier nicht vor: obere 32 Bit sind 0.
	m.push(0, 0, 0, 0,
		(bitLaenge >>> 24) & 255, (bitLaenge >>> 16) & 255, (bitLaenge >>> 8) & 255, bitLaenge & 255);

	// Startwerte laut Standard
	var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
	var w = new Array(80);

	// Linksrotation einer 32-Bit-Zahl
	function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }

	// Jeden 64-Byte-Block verarbeiten
	for (var blk = 0; blk < m.length; blk += 64) {
		for (var t = 0; t < 16; t++) {
			w[t] = (m[blk + 4 * t] << 24) | (m[blk + 4 * t + 1] << 16) |
				(m[blk + 4 * t + 2] << 8) | m[blk + 4 * t + 3];
		}
		for (t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);

		var a = h0, b = h1, c = h2, d = h3, e = h4;
		for (t = 0; t < 80; t++) {
			var f, k;
			if (t < 20)      { f = (b & c) | (~b & d);          k = 0x5a827999; }
			else if (t < 40) { f = b ^ c ^ d;                   k = 0x6ed9eba1; }
			else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
			else             { f = b ^ c ^ d;                   k = 0xca62c1d6; }
			// „| 0“ hält das Ergebnis bei 32 Bit
			var temp = (rotl(a, 5) + f + e + k + w[t]) | 0;
			e = d; d = c; c = rotl(b, 30); b = a; a = temp;
		}
		h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
	}

	var ergebnis = [];
	[h0, h1, h2, h3, h4].forEach(function (h) {
		ergebnis.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
	});
	return ergebnis;
}

// HMAC (RFC 2104) mit SHA-1, Blockgröße 64 Bytes.
function hmacSha1(schluesselBytes, nachrichtBytes) {
	var k = schluesselBytes;
	if (k.length > 64) k = sha1(k);          // lange Schlüssel erst hashen
	var innen = [], aussen = [];
	for (var i = 0; i < 64; i++) {
		var b = i < k.length ? k[i] : 0;
		innen.push(b ^ 0x36);
		aussen.push(b ^ 0x5c);
	}
	return sha1(aussen.concat(sha1(innen.concat(nachrichtBytes))));
}

// Bytes → Base64-Text (selbst gemacht, weil „btoa“ nicht überall da ist).
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(bytes) {
	var text = "";
	for (var i = 0; i < bytes.length; i += 3) {
		var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
		text += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] +
			(i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") +
			(i + 2 < bytes.length ? B64[n & 63] : "=");
	}
	return text;
}

// Die eine Funktion, die der Geofox-Adapter braucht:
// Signatur für „body“ mit dem Passwort als Schlüssel.
function signatur(body, passwort) {
	return base64(hmacSha1(utf8Bytes(passwort), utf8Bytes(body)));
}

module.exports = {
	signatur: signatur,
};
