# Figuren und Cloud-Speicher

Bibliotheken enthalten Zuordnungen zu Figuren, keine Figurenkopien. Eine freigegebene Zuordnung folgt immer dem aktuellen gemeinsamen Inhalt. Moderation betrifft die erste Aufnahme, nicht unabhängige Inhaltsstände pro Bibliothek. Historische Versionen sind nur der Versionsverlauf; beim Zuordnen wird immer die aktuelle Figur verwendet.

## Wiederverwenden und Varianten

Beim Hochladen prüft die App SHA-256-Hashes der Originaldateien. Zugängliche Treffer können direkt referenziert werden. Für bewusst unabhängige Inhalte gibt es „Eigene Variante erstellen“. Das erstellt eigene Metadaten, verwendet Videos und JPEG-Vorschaubilder jedoch gemeinsam. Eigentümer können zusätzliche Bearbeiter per E-Mail bestimmen. Bibliotheksverwaltung allein verleiht kein Bearbeitungsrecht.

Nur eine exakt identische Datei ist ein Treffer. Neu komprimierte oder gekürzte Videos sind andere Dateien. Private fremde Figuren werden durch die Suche nicht offengelegt. Deshalb werden unbekannte Dateien zunächst in einen privaten Uploadbereich übertragen: Der Server berechnet den Hash selbst, führt identische Dateien zusammen und entfernt den temporären Upload. Ein vom Client behaupteter Hash gewährt niemals Zugriff. Auch parallele Finalisierungen werden serialisiert. Die Kontingentberechnung zählt einen Dateipfad pro Konto bzw. global einmal.

## Entfernen und Papierkorb

„Aus Bibliothek entfernen“ entfernt ausschließlich die Zuordnung. Eine Figur mit vorhandenen Bibliothekszuordnungen kann nicht gelöscht werden. Ohne Zuordnungen verschiebt der Eigentümer sie für 30 Tage in den Papierkorb und kann sie dort wiederherstellen. Die Dateien zählen währenddessen weiterhin zum Speicher.

Die Wartung läuft alle zehn Minuten. Nach der Schutzfrist entfernt sie abgelaufene Figuren und überholte Versionen; Dateien werden ausschließlich ohne verbleibende Referenzen gelöscht. Gleiches gilt für Varianten, andere Eigentümer und laufende Uploads. Eigenständige Figuren werden bei der Bestandsbereinigung nicht automatisch zusammengeführt.

Das Widerrufen öffentlicher Freigaben entfernt nach Bestätigung die öffentlichen Bibliothekszuordnungen. Private Zuordnungen bleiben bestehen. Das erneute Erlauben stellt entfernte Zuordnungen nicht automatisch wieder her.

## Betrieb

Migrationen in Reihenfolge anwenden, dann die Edge Function `cloud` aktualisieren. Die zweite Migration richtet mit pg_cron/pg_net einen durch ein Vault-Geheimnis geschützten Wartungsaufruf ein. Lokale Postgres-Distributionen ohne diese Erweiterungen überspringen ausschließlich die Zeitplanung. Die Wartung ergänzt fehlende serverseitig verifizierte Video-Hashes in kleinen Stapeln und bereinigt den Bestand. Die Plattformverwaltung bietet zusätzlich „Bestehende Videos auf Duplikate prüfen“.

Sämtliche öffentlich erreichbaren Tabellen bleiben für direkte Clientzugriffe gesperrt. Hash- und Wartungs-RPCs sind ausschließlich für die Serverrolle freigegeben. Medien-URLs erfordern weiterhin eine zugängliche Figurenrevision.

## Besitzerrechte und aktueller Cloudstand (26.10.2026)

Eine Cloudfigur hat genau einen aktuellen Inhalt. Speichern ersetzt diesen Inhalt in allen referenzierenden Bibliotheken; frühere Inhalte werden nicht als Versionen angeboten oder aufbewahrt. Eine technische Änderungskennung verhindert, dass gleichzeitige Uploads einander unbemerkt überschreiben. Alte Versions-IDs bleiben ausschließlich als Herkunftszuordnung lokaler Kopien erhalten.

Nur Besitzer und Plattformadministratoren dürfen eine Cloudfigur bearbeiten oder löschen. Bibliotheksbesitz, Mitgliedschaft und Beitragsrechte verleihen keine Bearbeitungsrechte an fremden Figuren. Zusätzliche Figurenbearbeiter gibt es nicht mehr. Vor dem Löschen werden die betroffenen Bibliotheken angezeigt; ihre Referenzen werden mit entfernt. Lokale Kopien bleiben erhalten.

In „Meine Figuren“ kennzeichnet das Gerätesymbol eine rein lokale Figur, die Wolke eine heruntergeladene oder erfolgreich hochgeladene Figur und die Wolke mit Stift eine danach lokal angepasste Figur. Titel, Beschreibung, Tags und Videos zählen als Inhalt; der persönliche Lernstatus nicht. Nach erfolgreichem Hochladen des aktuellen Inhalts verschwindet der Stift. Die Cloudansicht bietet bei einer zugehörigen lokalen Figur „Lokale Figur öffnen“ an. Die Zuordnung ist keine Zusage, dass der lokale Inhalt dem aktuellen Cloudinhalt entspricht.


## Bibliothek lesen und bearbeiten

Die Bibliothek öffnet als kompakte, nummerierte Figurenliste. Eine Zeile zeigt Vorschaubild, Titel und lokalen Status. Durch Antippen klappt die Figur mit Beschreibung, Tags, Vorschau und lokaler Übernahme auf; die zuvor geöffnete Figur klappt zu. Unter der Liste stehen Bibliothekslink und „Link kopieren“. Der Sammeldownload bleibt oberhalb der Liste.

Besitzer und Plattform-Administratoren öffnen „Bibliothek bearbeiten“. Unter „Figuren“ lassen sich Zuordnungen hinzufügen, entfernen und per Griff oder Pfeilen sortieren. „Einstellungen“ enthält Name, Beschreibung, Sichtbarkeit und Zugriff. „Bibliothek speichern“ übernimmt Metadaten, Figurenzuordnungen und Reihenfolge gemeinsam. Bei einem Konflikt bleibt der Entwurf erhalten; der aktuelle Stand kann neu geladen werden. Beim Verlassen stehen Speichern, Verwerfen und Weiter bearbeiten zur Wahl.

„Figuren hinzufügen“ bietet eine Mehrfachauswahl aus Meine Cloud-Figuren. Bereits enthaltene Figuren sind markiert. „Neue Figur hochladen“ verwendet eine lokale Figur und den normalen Upload-Ablauf. Der Upload speichert zunächst nur in Meine Cloud-Figuren. Die Bibliothekszuordnung bleibt bis zum Speichern ein Entwurf; beim Abbrechen der Bibliotheksbearbeitung bleibt die hochgeladene Cloud-Figur erhalten.
In „Meine Figuren“ kennzeichnet das Gerätesymbol eine rein lokale Figur, die Wolke eine heruntergeladene oder erfolgreich hochgeladene Figur und das Gerät mit kleinem Stift im Display eine danach lokal angepasste Figur. Titel, Beschreibung, Tags und Videos zählen als Inhalt; der persönliche Lernstatus nicht. Nach erfolgreichem Hochladen des aktuellen Inhalts verschwindet der Stift. Die Cloudansicht bietet bei einer zugehörigen lokalen Figur „Lokale Figur öffnen“ an. Die Zuordnung ist keine Zusage, dass der lokale Inhalt dem aktuellen Cloudinhalt entspricht.

Die einzeilige Statusleiste unter jeder lokalen Figurenkarte enthält das Herkunftsicon, ein Ordnersymbol bei Geräteordnern, den Namen des Speicherordners (oder „App-Speicher“), Dauer und Videoanzahl. Lange Ordnernamen werden gekürzt; der vollständige Name bleibt als Tooltip verfügbar. Antippen des Herkunftsicons erklärt den Status.


### Meine Cloud-Figuren: kompakte Karten

Die Übersicht zeigt Vorschaubild, Name und lokalen Status. Ein Klick klappt eine Figur auf und schließt die zuvor geöffnete. Im Tab **Videos & lokal** findest du die Videovorschau und die lokale Übernahme. **Verwalten** enthält Bibliothekszuordnung, eigene Variante, öffentliche Freigabe und Löschen. Beim Schließen oder Tabwechsel stoppt eine laufende Vorschau. Rechte und Bestätigungen bleiben unverändert.
