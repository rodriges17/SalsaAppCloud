# Vollständiges lokales Backup

Nur Salsa Trainer Cloud. Installation & Speicher → Vollständiges Backup erstellen beziehungsweise Backup wiederherstellen. Der bisherige Figur-ZIP-Austausch bleibt unverändert und enthält weiterhin keine Lernstände.

## Inhalt

Gesichert werden alle lokal vorhandenen Figuren aus App-Speicher und verbundenen Geräteordnern: Original-Videobytes, Reihenfolge, Videonamen, Dauer/Abmessungen, Vorschaubilder, Titel, Beschreibungen, Tags, Lernstände und ursprüngliche Erstellungsdaten. Cloud-Figuren ohne lokale Kopie gehören nicht zum lokalen Bestand. Anmeldedaten, Sitzungen, native Ordnerhandles, Berechtigungen und private Browser-Cache-Pfade werden nicht gesichert.

Vor der Erstellung wird der gesamte Bestand gelesen. Fehlende oder veränderte Ordnerdateien verhindern die Erstellung einer als vollständig bezeichneten Sicherung. Zuerst Ordner erneut verbinden oder die betroffenen Videos reparieren. Während der Sammlung sperrt dieselbe App Schreibvorgänge über Web Locks, sofern der Browser sie unterstützt; Revisionen werden zusätzlich erneut geprüft.

## Dateien

Eigenes Format .salsabackup, Version 1, Magic SALSABK1. Kleine Bestände ergeben eine Datei, große Bestände zusammengehörige Teile mit jeweils höchstens 250 MiB. Auch einzelne Videos über dieser Größe werden geteilt. Die Blöcke werden bis 8 MiB gehasht, nicht als ganzes Video in ein zusätzliches JavaScript-Array eingelesen. Die Dateien sind nicht verschlüsselt. Alle Teile müssen zusammen aufbewahrt werden.

Der erste Teil enthält ein begrenztes JSON-Verzeichnis; alle Teile enthalten Sicherungs-ID, Nummer, Gesamtzahl und denselben Verzeichnis-Hash. Jeder Nutzdatenblock wird mit SHA-256 geprüft. Lücken, Überlappungen, fremde oder doppelte Teile, unbekannte Versionen, ungültige Angaben, abgeschnittene Dateien und zusätzliche Daten werden abgewiesen. Es gibt keine aus dem Backup übernommenen Dateipfade.

Die App bietet jeden Teil separat zum Download an. Download angefordert ist keine Bestätigung des tatsächlichen Speicherns. Zuletzt erstellt am bezeichnet nur den Erstellungszeitpunkt. Die internen mobilen Browsergrenzen können trotz begrenzter Teilgröße variieren; kein unbegrenzt großer Gesamtbestand wird garantiert. Das Verzeichnis ist auf 16 MiB, 10000 Figuren und 100000 Dateieinträge begrenzt.

## Wiederherstellung

Alle Teile auswählen. Vor jeder Änderung werden sämtliche Dateien und Figurenangaben geprüft. Danach Ziel auswählen: App-Speicher oder ein bereits eingerichteter, unterstützter Geräteordner. Nicht unterstützte Browser bieten ausschließlich App-Speicher an. Der ursprüngliche Geräteordner aus dem Backup ist nicht erforderlich.

Konflikte beziehen sich auf den gewählten Zielspeicher. Figuren an anderen Speicherorten bleiben unverändert. Identische Figuren werden standardmäßig übersprungen. Abweichende Figuren, auch bei unterschiedlichem Lernstand oder Datum, sind Konflikte. Standard ist Vorhandene behalten; weitere Optionen sind Zusätzliche Kopie und ausdrücklich Ersetzen einer konkreten Figur. Interne Austausch-Fingerprints werden nicht als alleinige Duplikatkennung verwendet; unabhängige lokale Kopien bleiben in der Sicherung getrennt enthalten.

Alle neuen Videos werden zunächst geschrieben und erneut geprüft. App-Speicher: ein gemeinsamer IndexedDB-Abschluss übernimmt alle Figuren; Fehler oder Abbruch davor entfernen die neu gestagten Cachedateien. Geräteordner: erst nach sämtlichen Kopien wird die Bibliotheksdatei einmal ersetzt; nicht mehr benötigte Dateien werden danach bereinigt. Veraltete Wiederherstellungspläne werden abgewiesen. Bei einem unklaren Dateischreibabschluss werden möglicherweise noch referenzierte Dateien nicht gelöscht. Die vorhandenen ursprünglichen Importdateien außerhalb der App werden nie angefasst.

## Tests

Node-Tests: vollständiger Rundlauf, aufgeteiltes Einzelvideo, ungeordnete Teilwahl, fehlende/doppelte/gemischte Teile, Beschädigung, Abbruch, ungültige Metadaten, Dateigrenzen und Ordner-Batch-Rollback. Browserprüfungen: Download, vollständige UI-Wiederherstellung, unveränderte Lernstände/Erstellungsdaten, Konflikte und wiederholte Wiederherstellung, Cache-Schreibfehler, Abbruch und Geräteordner-Ziel. Native Ordnerhandlungen werden mit Chromium-OPFS und simuliertem Picker geprüft. Physische Android-/iOS-Dateidialoge und die Aufbewahrung von Browser-Downloads sind hier nicht testbar.
