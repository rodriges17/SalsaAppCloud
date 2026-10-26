# Prototyp: Herkunftssymbol und Platzierung

Frage: Wie wird „Nur lokal / Cloud / lokal angepasst“ auf der Figurenkarte verständlich, ohne Titel, Lernstand oder Menü zu verdrängen?

Drei strukturelle Varianten auf der bestehenden Übersichtsroute:
- `?variant=meta`: Smartphone bzw. Wolke mit Text in der Metazeile. Empfehlung: ruhig, verständlich und dem Inhalt untergeordnet.
- `?variant=picture`: separates, antippbares Symbol am Vorschaubild. Kompakt, aber ohne sichtbaren Erklärungstext.
- `?variant=strip`: eigene Statusleiste unter jeder Figur. Sehr deutlich, benötigt mehr Höhe.

Start: `npm run prototype:figure-status`, dann `http://localhost:4175/pwa/?variant=meta`. Wechsel über schwebende Pfeile oder die Pfeiltasten. Suchfeld und Lernfilter arbeiten mit Beispieldaten. Statussymbole öffnen eine Erklärung. Keine Anmeldung, keine API-Aufrufe, keine Änderungen an echten Figuren, keine Persistenz.

Entscheidungsstand: Metazeile empfohlen; Auswahl des Nutzers steht aus. Dieser Branch bleibt außerhalb von main.

Die Symbol-Untermenge in `pwa/prototype-lucide.js` stammt aus dem bereits installierten Lucide 1.8.0; Lizenz siehe `pwa/prototype-lucide-LICENSE`. App-Logo und Schrift stammen unverändert aus dem bestehenden Projekt.
