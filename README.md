# Salsa Trainer Cloud

Eigenständige Cloud-Variante der Salsa-PWA. Zieladresse: https://rodriges17.github.io/SalsaAppCloud/

Die Offline-App unter https://rodriges17.github.io/SalsaAppIOS/ bleibt separat bestehen. Lokale Figuren können per ZIP kopiert werden.

# Salsa Trainer – PWA und native iPhone-App

## PWA auf iPhone oder Android

Die Web-App liegt im Ordner `pwa/` und wird durch `.github/workflows/pwa.yml` nach bestandenen Tests auf **GitHub Pages** veröffentlicht.

Geplante Adresse: **https://rodriges17.github.io/SalsaApp/**. Ob die Veröffentlichung bereits erfolgreich war, zeigt der Workflow „PWA tests and GitHub Pages“ unter Actions. Falls GitHub die erstmalige Pages-Aktivierung für den Workflow-Token verweigert: Repository → Settings → Pages → Build and deployment → Source → **GitHub Actions**, dann den Workflow erneut ausführen.

Auf dem iPhone den Link in Safari öffnen → Teilen → **Zum Home-Bildschirm** → als Web-App öffnen. Erst die installierte App über ihr Symbol starten und dort die Videos importieren. Dafür ist weder ein Mac noch Apple-Signierung erforderlich.

### PWA-Funktionen

- Ursprüngliches dunkles Design, Suche über Name/Beschreibung/Tags, Lernstände, Tags und Sortierung.
- Figuren erstellen, bearbeiten und löschen; mehrere lokale Videos mit Namen, Reihenfolge, Ersetzen und Entfernen. Das erste Video liefert Vorschaubild und Dauer.
- Import über den Foto-/Dateiauswahldialog. Jedes neue Video muss vor dem Speichern in der abspielbaren Vorschau bestätigt werden. Abgebrochene Ersatzvideos ändern die bisherige Liste nicht.
- Videos werden in einem separaten lokalen **Cache-Storage-Medienspeicher** abgelegt; Metadaten, Reihenfolge und Verweise werden anschließend in einer **IndexedDB-Transaktion** übernommen. Bei Quotenfehlern oder Konflikten werden neue Mediendateien verworfen; bisherige Dateien bleiben bis nach dem erfolgreichen Commit erhalten. Kleine Vorschaubilder werden als Binärpuffer gespeichert, um WebKits Einschränkung bei IndexedDB-Blobs zu vermeiden. Originaldateien werden nicht verändert.
- Zurück-Buttons und Browser-Zurück mit Verwerfen-Dialog für ungespeicherte Änderungen. Während des Speicherns kann der Editor nicht verlassen werden.
- Lernplayer mit Videowahl, 0,25×/0,5×/0,75×/1×, −5 Sekunden, Fit/Crop, Gesamtloop und A–B-Schleife. Videowechsel löscht A/B, behält die übrigen Einstellungen. Hintergrund und geschlossene Ansicht pausieren die Wiedergabe. Bildschirm-Wachhalten wird genutzt, sofern der Browser es anbietet.
- Manueller Formatknopf dreht die **Player-Ansicht** im Hochformat um 90°. Die Systemausrichtung kann eine iPhone-PWA nicht zuverlässig sperren. Native Vollbildwiedergabe ist zusätzlich verfügbar, soweit der Browser sie unterstützt.
- Service Worker speichert ausschließlich die App-Dateien. Nach „Offline bereit“ funktionieren Neustart und lokale Videowiedergabe ohne Netz. Keine Video-Uploads, Analytics, externen Fonts oder Server-Datenbank.

### PWA-Grenzen

Die gespeicherten Videos bleiben nur in diesem Browser-/App-Speicher auf diesem Gerät. Website-Daten löschen entfernt die Kopien. Der Browser kann Speicherquoten setzen und nicht dauerhaft geschützte Daten bei Platzmangel löschen. Unter „Installation & Speicher“ lässt sich dauerhafter Speicher anfragen; die Entscheidung trifft der Browser. Es gibt kein Backup und keine automatische Übernahme der Android-/Swift-Bibliothek.

Auf dem iPhone kann die PWA nicht als Empfangsziel für „Teilen“ registriert werden; Videos werden innerhalb der App importiert. Abspielbare Codecs hängen vom Browser ab (H.264/MP4 ist am breitesten unterstützt). Bei erzwungenem Beenden oder Neuladen gehen ungespeicherte Entwürfe verloren; die bisher gespeicherten Figuren bleiben erhalten. Safari und eine Home-Screen-App können getrennte Speicherbereiche verwenden – daher vor dem Import installieren.

### PWA-Tests und Entwicklung

Die App selbst hat keine Laufzeit-Abhängigkeiten und keinen Buildschritt. `npm test` führt Logiktests aus. Der CI-Workflow testet auf einem macOS-Runner mit nativer MP4-Unterstützung, installiert Playwright, erzeugt zwei synthetische H.264-Videos mit FFmpeg und testet Chrome/Chromium mit MP4-Unterstützung in Mobilansicht sowie WebKit/iPhone-Ansicht. Browser-Tests umfassen Mehrfachimport, Vorschauen, Player-Einstellungen, A/B-Steuerung, Formatwechsel, Offline-Neustart und -Wiedergabe, Umbenennen/Reihenfolge, verworfenen Ersatz, Mindestvideozahl, Verwerfen, Löschen, ungültige Medien und Transaktionskonflikte. Screenshots und Fehlertraces liegen im Actions-Artefakt `pwa-browser-results`.

```sh
npm install
npm test
# Für den manuellen Browseraufruf auf dem eigenen Rechner:
python3 -m http.server 4173
# http://localhost:4173/pwa/
```

Bei Änderungen an den App-Dateien die Versionskennung in `pwa/sw.js` erhöhen, damit installierte PWAs den neuen App-Cache erhalten. Gespeicherte Nutzervideos gehören niemals in den Git- oder Pages-Ordner.

---

## Native Swift-App für iPhone

Native, private Offline-App für eigene Salsa-Videos. SwiftUI / UIKit / AVFoundation, iPhone mit **iOS 17 oder neuer**. Kein Server, Login, Tracking oder Cloud-Backup. Videos und Metadaten bleiben im lokalen App-Group-Speicher; der Bibliotheksordner wird vom Gerätebackup ausgeschlossen. Deinstallation beider Komponenten löscht die Daten.

## Funktionen

- Übersicht im ursprünglichen dunklen Design: Vorschau, Dauer, Videoanzahl, Suche, Lernstände „Neu / Am Üben / Sitzt“, Tags und Sortierung.
- Neue Figuren und Bearbeiten/Löschen über das Kontextmenü (lange auf eine Figur drücken).
- Titel, Beschreibung, Lernstand und Tags; mehrere Videos pro Figur mit Namen, Reihenfolge, Ersetzen und Entfernen. Mindestens ein Video bleibt erforderlich.
- Import aus Fotos oder Dateien; vor Übernahme jedes neue Video abspielen/prüfen und bestätigen. Eine temporäre Stagingkopie ist für iOS-Dateifreigaben notwendig. Erst „Figur speichern“ erzeugt dauerhafte private Kopien. Originaldateien werden nicht verändert.
- Erstes Video liefert Vorschaubild und Dauer. Videos können in beliebiger Reihenfolge bestätigt werden; „Alle neuen Videos prüfen“ führt durch die noch offenen Vorschauen.
- Zurück oben links; Warnung bei ungespeicherten Änderungen. Speichern sperrt die Bedienung während der Kopie. Fehlgeschlagene Importe rollen alle neuen Dateien zurück. Gleichzeitige Änderungen aus App und Erweiterung werden erkannt.
- Lernplayer startet im Hochformat; manueller Hoch-/Querformatwechsel, Fit/Crop ohne Verzerrung, Videowahl, 0,25×/0,5×/0,75×/1×, −5 Sekunden, Gesamtloop und A–B-Loop (gegenseitig ausschließend). Videowechsel löscht A/B und beginnt bei 0, die übrigen Einstellungen bleiben bestehen. Hintergrund pausiert; Bildschirm bleibt während Wiedergabe an.
- Teilen aus Fotos/Dateien → „Salsa Trainer“: neue oder bestehende Figur wählen, Videos prüfen und speichern. Der Import läuft im iOS-Teilen-Fenster; danach kehrt iOS zur Quell-App zurück. Die Haupt-App aktualisiert ihre Übersicht beim Öffnen. Die Erweiterung öffnet nicht eigenmächtig die Haupt-App.

## Build ohne eigenen Mac

Unter **Actions → iOS build and tests** läuft der Build auf einem GitHub-macOS-Runner. Der Workflow generiert das Xcode-Projekt, führt Unit-/UI-Tests aus und archiviert App und Teilen-Erweiterung für echte iPhones ohne Signierung. Die Artefakte enthalten Testprotokolle, `.xcresult`, Xcode-Quellprojekt und ein **unsigniertes `.xcarchive`**.

**Das Archiv ist noch nicht auf einem iPhone installierbar. Es ist keine installierbare IPA und kein TestFlight-Link.** Für die Installation muss ein Apple-Entwicklerkonto mit gültigen Signierungsprofilen eingerichtet werden. Für TestFlight ist eine Apple-Developer-Program-Mitgliedschaft nötig. GitHub kann die Apple-Signierung nicht ersetzen. macOS-Runner eines privaten Repositories können GitHub-Actions-Kontingent verbrauchen.

## Lokal auf einem Mac

```sh
brew install xcodegen
cd ios
xcodegen generate
open SalsaTrainer.xcodeproj
```

In Xcode für **SalsaTrainer und SalsaShare** dasselbe Entwicklerteam setzen. Bundle-IDs bei Bedarf eindeutig anpassen. App Group `group.com.rodriges17.SalsaTrainer` für beide Targets beim Apple-Konto registrieren und in beiden Signierungsprofilen aktivieren. Bei geänderter Gruppe zusätzlich `APP_GROUP` im Projekt und `AppGroupIdentifier` in beiden Info-Plists anpassen. Kein Fallback auf getrennte Speicherorte: fehlende App-Group-Berechtigung erzeugt eine sichtbare Fehlermeldung.

Für ein TestFlight-Release das vorhandene App-Icon prüfen, Release auf einem echten Gerät prüfen und in Xcode **Product → Archive → Distribute App → App Store Connect** verwenden. Zertifikate, private Schlüssel und Provisioning-Profile gehören nicht ins Repository. Es ist noch kein Apple-Konto und keine Signierungsidentität mit diesem Projekt verbunden.

## Tests und Grenzen

`LibraryTests`: Byte-identische Kopie, unveränderte Originale, Bestätigungspflicht, Rollback bei zweitem Video, Umbenennen/Reihenfolge/Entfernen, Konflikterkennung, fehlende Quelle, Mindestvideozahl/fremde Dateien, Löschen, Pfadprüfung, Loopgrenzen echtes AVFoundation-Video sowie Videowechsel mit Beibehaltung der Lerneinstellungen und Pausieren während eines Sprungs. `NavigationTests`: Übersicht, Editor, Speichersperre ohne Video Verwerfen-Dialog sowie Multi-Video-Player, Fit/Crop und manueller Hoch-/Querformatwechsel mit synthetischen Videos.

Der tatsächliche CI-Status steht unter Actions; nur ein grüner Lauf bestätigt Build und Tests. Hardware-Tests (insbesondere echte Fotos-/Dateien-Freigabe, große Videos, Geräteausrichtung, A–B-Wiedergabe und App-Group-Signierung) bleiben vor TestFlight erforderlich. Android-Daten werden nicht automatisch auf iOS übertragen.

## Figuren zwischen PWAs teilen

In der Figurenübersicht **⋮ → Figur teilen** wählen. Alle Videos sind zunächst ausgewählt; einzelne können abgewählt werden. **ZIP vorbereiten** erstellt ein Paket mit unveränderten Originalvideos, Name, Beschreibung, Tags, Videonamen und Reihenfolge. Persönlicher Lernstand und interne IDs werden nicht übertragen. Maximal 250 MiB (in der Oberfläche „250 MB“), 100 Videos.

Danach **ZIP teilen** wählen, wenn das Gerät Datei-Teilen unterstützt. WhatsApp wird im Systemdialog gewählt. Alternativ **ZIP speichern** und in WhatsApp als **Dokument** anhängen. Die App lädt dabei keine Videos auf einen eigenen Server hoch.

Empfänger speichern den Anhang in „Dateien“, öffnen die PWA und wählen **Figur importieren**. Alle neuen Videos müssen in der Vorschau bestätigt werden. Erst **Figur speichern** legt eine neue lokale Figur an, mit Lernstand **Neu**. Vorhandene Figuren werden nicht überschrieben. Bei einem wiedererkannten Paket fragt die App nach, ob eine weitere Kopie angelegt werden soll. Ein Abbruch legt keine dauerhaften Videos an.

Das funktioniert zunächst ausschließlich zwischen PWAs. Die native Android- und iOS-App unterstützen das Format noch nicht. Direktes Teilen und die Zuverlässigkeit großer Pakete müssen zusätzlich auf echten Smartphones geprüft werden.

### Austauschformat v1

Standard-ZIP, Methode STORE (keine Komprimierung), UTF-8-Dateinamen, ohne ZIP64, Verschlüsselung, Kommentare, Extra-Felder oder Data Descriptors. Enthalten sind `figure.json` und `videos/1.mp4` usw. `figure.json` enthält `format: "salsa-figure"`, `version: 1`, `title`, `description`, `tags` und `videos: [{path, name, type, size}]`. Unterstützte MIME-Typen: MP4, QuickTime, M4V, WebM, Ogg. Das jeweilige Gerät muss das Video zusätzlich abspielen können.

Der Import prüft Größe, Struktur, Pfade, Anzahl, CRC32-Prüfsummen und Schema vor dem Öffnen des Entwurfs. Fremde oder nachträglich neu komprimierte ZIP-Dateien werden abgewiesen. Der Wiederholungshinweis verwendet SHA-256 über normalisierte Metadaten, Größen und CRC32; er ist keine Authentizitätsprüfung. Der Fingerabdruck wird zusammen mit der Figur gespeichert und beim Bearbeiten erhalten.

## Cloud-Bibliotheken (Testversion)

Die PWA erhält öffentliche/private Bibliotheken, eingeladene Mitwirkende, Freigaben, manuelle Anmeldelinks und lokale Offline-Übernahme. Die kostenlose Testkonfiguration nutzt einen privaten Supabase-Bucket mit 900 MB Gesamtlimit und 50 MB je Video. Plattformfreigaben und Quoten werden serverseitig geprüft.

Einrichtung und Bedienung: [CLOUD-EINRICHTUNG.md](CLOUD-EINRICHTUNG.md). Validierung und Grenzen: [CLOUD-TESTBERICHT.md](CLOUD-TESTBERICHT.md). Die Cloud-Variante wird ausschließlich aus diesem Repository veröffentlicht. Die bestehende Offline-App bleibt im separaten Repository `SalsaAppIOS`.


## Geräteordner

Optionale lokale Ordnerbibliothek: [Bedienung, Wiederherstellung und Grenzen](GERAETEORDNER.md).


## Vollständiges Backup

Lokale Sicherung inklusive Videos und Lernständen: [Bedienung und Wiederherstellung](BACKUP.md). Das vollständige Backup ist vom Figur-ZIP-Austausch getrennt.

Eigene Cloud-Figuren lassen sich mit „Lokal übernehmen“ direkt und ohne Bibliothekszuordnung herunterladen. Neueste Version und ältere Versionen unterstützen Videoauswahl und bestätigte Vorschau. Bereits übernommene Auswahlen werden als lokal vorhanden markiert; bei passenden lokalen Figuren stehen Ersetzen, separate Kopie und Abbrechen zur Wahl. Ersetzen behält Lernstatus und Speicherort und schreibt erst nach dem Speichern.
