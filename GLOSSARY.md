# Tanzfiguren und lokaler Speicher

## Sprache

**Cloud-Navigation**:
Der gemeinsame Ablauf für Öffnen, Bereichswechsel, Zurück, Schließen und Einstellungen im Cloud-Speicher. Er koordiniert Rückfragen und Bibliotheks-Bearbeitungssitzungen, ignoriert zusätzliche Navigationsaktionen während eines Übergangs und gibt Kontowechseln sowie endgültig ungültigen Anmeldungen Vorrang. Eine erfolgreiche Token-Erneuerung desselben Kontos beginnt keine neue Cloud-Navigation.

**Figur**:
Eine benannte Tanzbewegung oder Kombination mit zugehörigen Videos und Angaben.

**Geräteordner**:
Ein vom Nutzer ausgewählter Ordner mit einer lokal gespeicherten Figurenbibliothek.

**Ordnerzugriff**:
Die vom Nutzer erteilte Erlaubnis, eine gespeicherte Ordnerbibliothek zu verwenden. Die Auswahl eines Ordners und die aktuelle Erlaubnis zum Zugriff sind voneinander unabhängig.

**App-Speicher**:
Der interne lokale Speicher der App, der keinen vom Nutzer ausgewählten Geräteordner voraussetzt.

**Lernstand**:
Der persönliche Übungsstatus einer Figur: Neu, Am Üben oder Sitzt.

**Vollständiges Backup**:
Eine Sicherung aller lokal verfügbaren Figuren einschließlich ihrer Videos, Angaben und persönlichen Lernstände. Alle zugehörigen Sicherungsteile werden für die vollständige Wiederherstellung benötigt.

**Figur-ZIP**:
Eine ZIP-Datei zum Weitergeben einer einzelnen Figur mit ausgewählten Videos und Angaben in Originalqualität. Der persönliche Lernstand ist nicht enthalten.

**Cloud-Lesestand**:
Der zuletzt geladene Stand der zugänglichen Cloud-Figuren und Bibliotheken einschließlich ihrer Vorschaubilder und des Ladezeitpunkts.

**Medien-Sitzung**:
Der geordnete Zugriff auf die Videos einer Figur für einen geöffneten Bildschirm oder einen vollständigen Lesevorgang. Parallele Zugriffe teilen die laufende Prüfung; beim erneuten Öffnen beginnt eine neue Sitzung.

**Lokale Cloud-Verfügbarkeit**:
Die Verfügbarkeit einer Cloud-Version als einzelne vollständige, lesbare lokale Kopie. Teilkopien, fehlende Dateien, fehlender Ordnerzugriff und eine vorhandene ältere Version werden unterschieden. Mehrere Teilkopien ergeben zusammen keine vollständige Kopie.

**Cloud-Herkunft**:
Die Zuordnung einer lokalen Figur zu ihrer Cloud-Figur und der übernommenen oder hochgeladenen Version. Lokale Inhaltsänderungen bleiben erkennbar; Lernstand und Verfügbarkeit sind davon unabhängig.

**Figuren-Download**:
Der gemeinsame Ablauf, der einzelne Cloud-Figuren oder eine ganze Bibliothek lokal verfügbar macht. Er bündelt Medienabruf, Vorschaubilder, Speicherprüfung, Wiederverwendung vorhandener Videos sowie Abbruch und Abschluss. Jeder Lauf gehört zu einer Anmeldesitzung; ein Kontowechsel beendet seine weitere Arbeit. Bereits begonnene atomische Speicherungen werden abgeschlossen und fertige Figuren bleiben erhalten.

**Figuren-Upload**:
Der gemeinsame Ablauf, der Videos einer lokalen Figur prüft und bei Bedarf überträgt, die Cloud-Figur endgültig speichert und erreichte Ergebnisse für getrennte Nacharbeiten erhält. Bibliothekszuordnung und lokale Cloud-Herkunft können nach erfolgreichem Speichern unabhängig wiederholt werden. Ein unbekannter Speicherstand wird anhand des eindeutigen Upload-Vorgangs geklärt.

**Bibliotheks-Bearbeitungssitzung**:
Der im Arbeitsspeicher gehaltene Entwurf einer bestehenden Bibliothek mit Angaben, Figuren und Reihenfolge. Die Sitzung umfasst Bearbeiten, Unterbrechen für einen Figuren-Upload, Fortsetzen, Speichern, Verwerfen sowie Fehler- und Konfliktzustände. Sie ist an die aktuelle Anmeldesitzung gebunden und wird nach einem App-Neustart nicht wiederhergestellt. Bereits hochgeladene Cloud-Figuren bestehen unabhängig vom Bibliotheksentwurf.

**Tag-Auswahl**:
Das durchsuchbare Mehrfachauswahlfeld mit vorhandenen Vorschlägen und einzeln entfernbaren Zuordnungen. Die Suche ignoriert Groß-/Kleinschreibung, die Tag-Identität nicht.

**Personenfreigabe**:
Der gemeinsame Ablauf zum Anlegen und Bearbeiten einer Person mit Kontofreigabe, Speicherlimit und Bibliothekszuweisungen. Der Entwurf hält erfolgreiche und offene Speicherschritte getrennt; Wiederholen führt nur offene Schritte aus. Verwerfen entfernt ausschließlich ungespeicherte Änderungen. Kontowechsel und Sitzungsablauf entwerten den Ablauf, ohne bereits gespeicherte Rechte zurückzunehmen.
