# iOS-Build und Testbericht

Stand: 18.10.2026. Geprüfter Quellcode: `49f929a45edf88c1465bb0060acf942a920a90ef`.

[Erfolgreicher GitHub-Actions-Lauf](https://github.com/rodriges17/SalsaApp/actions/runs/39116389209)

## Ergebnis

- Xcode 16.4 auf einem GitHub-macOS-Runner: App, Teilen-Erweiterung und Testtargets erfolgreich kompiliert.
- 13 Unit-/Medientests und 2 UI-Tests im iPhone-Simulator: **15 erfolgreich, 0 Fehler**.
- Release-Archiv für `generic/platform=iOS`: **ARCHIVE SUCCEEDED**.
- Heruntergeladenes Archiv überprüft: Hauptprogramm und eingebettete `SalsaShare.appex` vorhanden, beide Version 1.0.0 / Mindestversion iOS 17.0. Keine Codesignatur vorhanden, wie im Workflow vorgesehen.
- Alle 21 Projektdateien lokal mit dem GitHub-Tree des geprüften Commits abgeglichen; keine Abweichungen.

## Geprüfte Funktionen

Bibliotheks- und Medientests: Byte-identische Kopien, Originaldateien unverändert, Bestätigungspflicht, vollständiger Rollback bei Fehler im zweiten Video, Video-Reihenfolge/Namen/Entfernen, Konflikte mit veralteten Entwürfen, fehlende Quelldatei, Mindestvideozahl, fremde Dateien und Pfadprüfung, Löschen aller Kopien, A/B-Grenzen und Rückspulgrenze. Ein echtes H.264-Video wurde mit AVFoundation erzeugt, importiert und validiert. Der Player-Test prüft Videowechsel, Löschen der A/B-Marken, Beibehalten der Lerneinstellungen sowie Pausieren während eines laufenden Sprungs.

UI-Tests: Übersicht, Editor, gesperrtes Speichern ohne Video, Weiterbearbeiten/Verwerfen, Multi-Video-Auswahl, Fit/Crop sowie manuelle Wechsel in Querformat und zurück ins Hochformat. Die Übersicht wurde zusätzlich anhand einer Simulatoraufnahme visuell geprüft.

## Artefakte

Im erfolgreichen Lauf unter „Artifacts“:

- [Unsigned device archive](https://github.com/rodriges17/SalsaApp/actions/runs/39116389209/artifacts/12132726368)
- [Generiertes Xcode-Projekt mit Quellen](https://github.com/rodriges17/SalsaApp/actions/runs/39116389209/artifacts/12132681546)
- [Buildlogs und XCTest-Ergebnisbundle](https://github.com/rodriges17/SalsaApp/actions/runs/39116389209/artifacts/12131689816)

GitHub bewahrt diese Artefakte gemäß aktueller Retention bis 16.01.2027 auf; der Workflow kann erneut gestartet werden.

## Grenzen und Installation

**Es wurde keine signierte IPA erzeugt. Das unsignierte Archiv ist nicht direkt auf einem iPhone installierbar.** Apple-Entwicklerkonto, App-Group-Freischaltung, Zertifikate/Provisioning und gegebenenfalls TestFlight fehlen noch. Der Build verwendet keine fremden Signierungsidentitäten.

Keine Tests auf einem physischen iPhone. Die echte Teilen-Funktion aus Fotos/Dateien mit App-Group-Signierung, große Originalvideos, Hintergrund-/Unterbrechungsverhalten unter realen Bedingungen und genaue zeitliche A/B-Wiedergabe sind vor Verteilung noch auf einem Gerät zu prüfen. Der Simulator-UI-Test hat beim zweiten Rotationstap eine AX-Scrollmeldung abgefangen und den Tap erfolgreich ausgeführt; der Test blieb ohne Fehler. Xcode meldet ausschließlich die standardmäßige ausgelassene AppIntents-Metadatenextraktion, da die App keine AppIntents verwendet.
