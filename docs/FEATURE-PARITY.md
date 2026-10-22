# Cloud-PWA und Android: gemeinsamer Funktionsumfang

Die Cloud-PWA in Chrome und die Android-App verwenden dieselben Module für Cloud, Medienformate, lokale Speichervorgänge, Geräteordner, Backups, Erscheinungsbild und Layout. Plattformspezifische Adapter stellen Dateiauswahl, Freigaben, Vollbild, physische Drehung und Offline-Start bereit.

| Bereich | Verhalten in beiden Varianten |
|---|---|
| Figuren | Suchen, Status-/Tagfilter, Sortieren, Anlegen, Bearbeiten, Löschen |
| Import | Mehrere Videos, bestätigte Vorschau, Austausch per Figuren-ZIP |
| Speicherung | App-Speicher, Geräteordner, geprüfte Übertragung, Wiederverbindung, Backups und Wiederherstellung |
| Player | Videoauswahl, Fit/Crop, 0,25/0,5/0,75/1×, Loop, A–B, 5 Sekunden zurück, Hoch-/Querformat, Vollbild |
| Cloud | Eigene Figuren und Bibliotheken getrennt; persönliche Anmeldung, Upload/Versionen, Freigaben, Zuordnung, Verwaltung gemäß Berechtigungen |
| Cloud-Download | Neueste/ältere Version, Videoauswahl, lokale Vorschau, Ersetzen/neue Kopie/Abbrechen; erneute Übernahme bleibt auch nach lokalem Dateiverlust möglich |
| Oberfläche | Gleiche Markenheader, Filter, Karten und Dialoge; erreichbare Menüs; kompakte feste Bereiche bei geringer Fensterhöhe |

## Bewusste Plattformunterschiede

- Die PWA benötigt einen ersten Online-Aufruf und eine vom Browser unterstützte Offline-Installation; Android enthält die Oberfläche im APK.
- Geräteordner benötigen File System Access im Browser. Safari unterstützt diesen Zugang nicht. Android verwendet dauerhaft gewährte SAF-Ordnerfreigaben; Chrome kann eine erneute Freigabe verlangen.
- Android dreht das Display und steuert die Systemleisten; die PWA verwendet Browser-Vollbild bzw. eine gedrehte Playeransicht. Beide blenden dieselben nicht benötigten Playerbereiche aus.
- Teilen verwendet die jeweilige Systemfunktion oder den ZIP-Download als Rückfall.

## Regressionen und Prüfung

`web-tests/parity-cases.js` ist in beiden Repositories identisch. Der Vertrag prüft Menüs, kleine Fenster, Cloud-Reparatur fehlender/geänderter Medien, Playerzustand und CSP-konforme Darstellung. Die PWA führt ihn in Chromium und WebKit aus; Android gegen seine gebündelte Oberfläche und Brücken. Ein zusätzlicher Android-Emulatortest prüft physische Drehung, Vollbild und das Zurücksetzen beim Verlassen.

Bereits im Editor vollständig geprüfte Videos werden bei reinen Metadatenänderungen nicht nochmals vollständig gelesen, wenn ihre Größe und Änderungszeit unverändert sind. Fehlen verlässliche Metadaten, wird vollständig geprüft. Neue Kopien, Exporte und Backups behalten die vollständige Integritätsprüfung.

Die acht zusätzlichen Cloud-Fremdschlüsselindizes sind in der Cloud-PWA-Migration `20261022140200_cloud_foreign_key_indexes.sql` dokumentiert und auf dem Cloud-Projekt installiert. Zugriffsrechte und Daten bleiben unverändert.
