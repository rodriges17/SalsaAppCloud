# Cloud-Navigation und Kontomenü

Umsetzung der bestätigten Variante A, Cloud-Tickets #18–#20. Gilt identisch für Cloud-PWA und die in Android gebündelte Cloud-Oberfläche.

- Header und Bereichsauswahl liegen außerhalb des Scrollbereichs. Bibliothekswechsel setzen den Inhalts-Scroll zurück; Hintergrundaktualisierungen erhalten seine Position.
- Der vollständige Bibliotheksdownload verwendet ausschließlich die feste Leiste über der Navigation. Sie zeigt Spinner, Figurenname, Videofortschritt, Gesamtfortschritt und Abbrechen. Das Ergebnis bleibt nach Abschluss, Abbruch oder Fehler sichtbar; Fehlerdetails stehen bei der Bibliothek.
- Rechts neben Cloud-Speicher bleiben Aktualisieren und das Kontosymbol erreichbar. Das kompakte Kontomenü bündelt Identität, Berechtigungsrolle, belegten Speicher und Limit, Plattformverwaltung für Administratoren sowie Abmelden. Gäste erhalten weiterhin den Anmeldedialog.
- Außenklick, Escape und Android-Zurück schließen zuerst das Kontomenü. Bei Abmeldung, Kontowechsel oder verworfenem Lesestand werden Kontoinformationen entfernt.

## Gemeinsame Übergänge (Tickets #57–#59)

Cloud-PWA und Android verwenden dasselbe Cloud-Navigationsmodul. Seine Ansichtsanbindung stellt Darstellung, Laden und plattformspezifische Aufräumarbeiten bereit; Cloud-Lesestand und Bibliotheks-Bearbeitungssitzung bleiben eigenständige Module. Bildschirm-Zurück und Android-System-Zurück erreichen dieselbe Entscheidung: Kontomenü, Anmeldedialog, unterbrochenen Upload fortsetzen, Bibliotheksbearbeitung verlassen, Verwaltung zu Mein Konto verlassen, Bibliothek zu allen Bibliotheken verlassen oder Cloud schließen.

Unveränderte oder verworfene Bibliotheksentwürfe kehren mit den vorhandenen Bibliotheksangaben ohne Cloud-Leseaufruf zurück. Nach erfolgreichem Speichern wird aktualisiert. Weiterbearbeiten erhält den Entwurf. Während eines Übergangs einschließlich seiner Rückfrage werden zusätzliche Navigationsaktionen ignoriert und nicht nachträglich ausgeführt. Erfolg, Fehler und Weiterbearbeiten geben die Navigation wieder frei. Sobald der Zielbildschirm sichtbar ist, bleibt ein nachlaufender Cloud-Abruf eine Hintergrundaktualisierung und blockiert keine Navigation. Auch die bereits geöffnete Cloud-Hülle kann vor der ersten Netzwerkantwort wieder geschlossen werden.

Kontowechsel und endgültig abgelaufene/widerrufene Anmeldung entwerten laufende Übergänge sofort. Private Ansichten, Rückfragen, Vorschaubilder und kontogebundene Entwürfe werden entfernt. Laufende Medienübertragungen werden nach den bestehenden Abbruchmöglichkeiten beendet; bereits abgeschlossene Speicherungen bleiben erhalten. Alte Antworten, Fortschrittsmeldungen und Aufräumarbeiten dürfen die neue Ansicht nicht verändern. Die neue Ansicht lädt unabhängig von einem noch wartenden Vorgang des alten Kontos. Eine Token-Erneuerung mit gleicher Sitzungsidentität erhält weiterhin Lesestand und offene Formulare.

Tests über das gemeinsame Navigations-Interface prüfen Dialogpriorität, Rückkehr ohne Nachladen, Mehrfachaktionen, Weiterbearbeiten, Fehlerfreigabe und Kontowechsel während einer Rückfrage. DOM-Verhaltenstests prüfen dieselben Bedienwege einschließlich System-Zurück, Verwerfen/Speichern, Speicherfehlern, sofortiger Entwurfsentfernung und verspäteter Antwort nach Sitzungsablauf. Die vorhandenen Browser- und Android-Brückenverträge bleiben Teil der Veröffentlichungskontrolle.

## Prüfung

Automatisierte UI-Prüfungen erfassen den einmaligen Downloadstatus, Erfolg/Abbruch/Fehler, fixierte Tabs, sichtbaren Bibliotheks-Zurückweg, Kontomenü und Fokus, Rollen, aktualisierte Speicherwerte und kleine Hoch-/Querformatfenster. Der Android-Brückentest prüft zusätzlich die native Zurück-Schnittstelle. Bestehende Anmelde-, Personen- und gemeinsame Downloadtests verwenden das neue Menü beziehungsweise die einzelne Statusleiste.

Bei der Umsetzung von #57–#59 wurden die Node-/DOM-Tests beider Repositories lokal geprüft. Browser- und Android-Brücken-Browsertests konnten lokal nicht starten: Es fehlt das Browserprogramm, und dessen Download lieferte kein gültiges Archiv. Diese Prüfungen sowie ein physischer Android-Gerätetest stehen noch aus.
