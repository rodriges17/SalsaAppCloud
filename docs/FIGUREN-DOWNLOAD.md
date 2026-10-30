# Figuren-Download

Cloud-PWA und Android verwenden dieselbe Download-Anbindung im bestehenden Downloadmodul. Auswahl, Rückfragen zur Import-Zielkopie und Darstellung bleiben in der Oberfläche. Das Modul besitzt den Zugriff auf signierte Video-URLs, das Zeitlimit für die Videoübertragung, den Vorschaubild-Cache, die Prüfung des gewählten Geräteordners und den Download-Lebenszyklus. Die lokalen Speicheradapter bleiben plattformspezifisch.

## Schnittstelle

`createFigureDownload(adapters)` bindet Cloud-Aufrufe, Cache, Kontoidentität und lokale Speicherung einmal an. Die Oberfläche verwendet `figure(revision, options)`, `library(revisions, options)` oder `enrich(target, revision, options)` für bereits lokale Kopien. Bei Einzelimporten enthält `options.target` gegebenenfalls die ausdrücklich gewählte lokale Zielkopie. Das Speicherziel für neue Figuren folgt den Einstellungen.

`options.active` beschreibt die weiterhin gültige Anmeldesitzung der Cloud-Navigation. `options.progress` liefert die bisherigen Textmeldungen für Einzelimporte beziehungsweise strukturierte Phasen und Zähler für Bibliotheken. `options.lifecycle` meldet den Start und genau einen Abschluss (`done`, `failed` oder `cancelled`) an die weiterhin gültige Oberfläche. Veraltete Läufe melden nichts mehr in eine neue Ansicht.

`cancel()` beendet weitere Arbeit des aktuellen Laufs; sein Abschluss räumt die Download-Steuerung auf. `reset()` wird bei Kontowechsel oder Sitzungsende aufgerufen: Es bricht den alten Lauf ab und löst seine Bindung an die Oberfläche sofort. Ein neuer Lauf darf beginnen, während eine nicht unterbrechbare alte Antwort oder atomische Speicherung noch endet. Der alte Abschluss kann den neuen Lauf nicht zurücksetzen.

## Erhaltene Speicherregeln

- Pro Figur werden Größe, vollständige Videodaten und vorhandene SHA-256-Prüfsummen geprüft. Vorhandene gleiche Inhalte werden wiederverwendet.
- Die Figur wird erst nach vollständiger Prüfung atomisch gespeichert. Fehler vor diesem Schritt verändern keine vorhandene Figur.
- Lokale Änderungen werden nur nach ausdrücklicher Wahl ersetzt. Lernstand, Cloud-Herkunft, Metadaten-Ergänzung und Importreihenfolge folgen den bestehenden Regeln.
- Ein Abbruch startet keine weitere Figur. Eine laufende atomische Speicherung wird vollständig beendet; bereits gespeicherte Figuren bleiben erhalten. Das gilt auch beim Abbruch während der letzten Figur einer Bibliothek.
- Optionale Vorschaubildfehler verhindern keine gültige Videoübernahme. Bei Einzelimporten werden Fehler weitergegeben; Bibliotheken behalten ihre Ergebnisübersicht einschließlich Teilfehlern und noch offenen Figuren. Speicherplatzfehler stoppen weitere Figuren.

## Prüfung

Die Tests verwenden die öffentliche Download-Schnittstelle und externe Cloud-, Cache- und Speicheradapter. Sie prüfen Wiederverwendung, Zielordner, optionale Vorschaubilder, Fehler und Wiederholung sowie Abbruch während Abruf und atomischer Speicherung. Gemeinsame Browser-Verträge prüfen Einzel- und Bibliotheksdownload einschließlich Kontowechsel mit verspäteter Antwort in der PWA und in der Android-Oberfläche.
