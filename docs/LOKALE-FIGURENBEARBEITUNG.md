# Lokale Figurenbearbeitung

Umsetzung der Tickets #72–#74 in der Cloud-PWA, auf Grundlage der bestehenden Android-Implementation.

Die Figuren-Bearbeitungssitzung bündelt Hinzufügen, Bearbeiten und Importieren. Oberfläche und Modulprüfungen verwenden dasselbe Interface. Angaben, Videonamen, Reihenfolge, Vorschauannahme, ungespeicherte Änderungen und erreichte Speicherergebnisse gehören zur Implementation. Darstellung, Fokus, Navigation und Wiedergabe bleiben in der Oberfläche; vorhandene Speicher- und Medienadapter bleiben erhalten.

Die Sitzung lebt im Arbeitsspeicher und wird nach einem Neustart nicht wiederhergestellt. Neue und importierte Videos müssen bestätigt werden. Während der Prüfung vorhandener Medien bleiben Angaben bearbeitbar; Videoänderungen und Speichern warten auf den Abschluss. Schließen bricht die Prüfung ab; verspätete Ergebnisse verändern weder die geschlossene Sitzung noch einen neuen Entwurf. Bestätigtes Verwerfen bleibt auch bei anschließenden Navigationsereignissen abgeschlossen.

Beim Öffnen werden Figur und Videos aktuell gelesen. Währenddessen eingegebene Angaben bleiben erhalten. Speicherfehler erhalten den vollständigen Entwurf. App-Speicher und Geräteordner melden Versionskonflikte über FIGURE_CONFLICT. Ein Konflikt verhindert weitere Schreibversuche bis zum bestätigten Neuladen. Erst erfolgreiches Lesen von Figur und Medien ersetzt den Entwurf samt Versionsgrundlage; Abbrechen oder Lesefehler lassen ihn bestehen. Fehlende Medien behalten die bestehenden Reparaturmöglichkeiten.

Ein bestätigter Speichererfolg wird vor dem Nachladen festgehalten. Scheitert nur das Nachladen, zeigt die Oberfläche den Speichererfolg und „Übersicht erneut laden“. Wiederholen lädt ausschließlich die Übersicht; Figur und Videos werden nicht erneut gespeichert. Mehrfachaktionen teilen laufende Speicher- und Nachladevorgänge. Ein solcher Abschluss ist kein ungespeicherter Entwurf. Nur dieser explizite Abschluss verlangt die Weitergabe von Ladefehlern; Hintergrundaktualisierungen behalten ihre bisherige Fehleranzeige.

Die Modulprüfungen übernehmen den Android-Vertrag für alle drei Einstiege, Vorschau, Reihenfolge, Abbruch, Konflikte und Speicherabschluss. Browserprüfungen verbinden diese Regeln mit echten Speicherzugriffen und der PWA-Oberfläche, einschließlich Fokus, Entwurf während Medienprüfung, verspäteter Fehler und Wiederholung ohne zweite Speicherung. Das neue Modul gehört zum Offline-App-Shell-Cache.

Die Android-App bleibt durch diese Tickets unverändert. Die PWA korrigiert zusätzlich das wiederholte Verlassen einer bereits verworfenen Sitzung; die Gründe sind über den Vertrag dokumentiert.
