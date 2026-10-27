# Cloud-Navigation und Kontomenü

Umsetzung der bestätigten Variante A, Cloud-Tickets #18–#20. Gilt identisch für Cloud-PWA und die in Android gebündelte Cloud-Oberfläche.

- Header und Bereichsauswahl liegen außerhalb des Scrollbereichs. Bibliothekswechsel setzen den Inhalts-Scroll zurück; Hintergrundaktualisierungen erhalten seine Position.
- Der vollständige Bibliotheksdownload verwendet ausschließlich die feste Leiste über der Navigation. Sie zeigt Spinner, Figurenname, Videofortschritt, Gesamtfortschritt und Abbrechen. Das Ergebnis bleibt nach Abschluss, Abbruch oder Fehler sichtbar; Fehlerdetails stehen bei der Bibliothek.
- Rechts neben Cloud-Speicher bleiben Aktualisieren und das Kontosymbol erreichbar. Das kompakte Kontomenü bündelt Identität, Berechtigungsrolle, belegten Speicher und Limit, Plattformverwaltung für Administratoren sowie Abmelden. Gäste erhalten weiterhin den Anmeldedialog.
- Außenklick, Escape und Android-Zurück schließen zuerst das Kontomenü. Bei Abmeldung, Kontowechsel oder verworfenem Lesestand werden Kontoinformationen entfernt.

## Prüfung

Automatisierte UI-Prüfungen erfassen den einmaligen Downloadstatus, Erfolg/Abbruch/Fehler, fixierte Tabs, sichtbaren Bibliotheks-Zurückweg, Kontomenü und Fokus, Rollen, aktualisierte Speicherwerte und kleine Hoch-/Querformatfenster. Der Android-Brückentest prüft zusätzlich die native Zurück-Schnittstelle. Bestehende Anmelde-, Personen- und gemeinsame Downloadtests verwenden das neue Menü beziehungsweise die einzelne Statusleiste.

Bei der Prüfung in dieser Umgebung bestehen zwei bestehende PWA-Browsertests mit echten OPFS-Geräteordnern nicht: der bereitgestellte Chromium-Prozess beendet sich beim Geräteordnerzugriff. Diese beiden Fälle benötigen die reguläre Browser-CI. Ein physischer Android-Gerätetest wurde hier nicht durchgeführt.
