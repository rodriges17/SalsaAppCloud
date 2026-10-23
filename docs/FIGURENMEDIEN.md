# Figurenmedien

Kandidat 3 bündelt den Lesezugriff im Speicher-Modul `storage.js`. App-Speicher und Geräteordner bleiben getrennte Adapter. Die gemeinsame Speicher-seam liefert über `figureMedia(figure)` geordnete Medien mit `load()` und `describe()`.

`load()` liest nur das angeforderte Video, bündelt parallele Aufrufe und hält erfolgreiche Ergebnisse für diese Medien-Sitzung. Fehler können erneut versucht werden. Eine neue Sitzung prüft erneut. `describe()` liefert Größe und Typ ohne Videoladen, sofern gespeichert; alte App-Einträge ergänzen fehlende Angaben aus dem Video. Ein leerer MIME-Typ ist gültig.

`figureVideos()` nutzt dieselbe Schnittstelle zum vollständigen Lesen für Bearbeitung, ZIP, Übertragung und Backup. Geräteordner werden weiterhin vollständig per Prüfsumme geprüft. Der Reparaturmodus erhält Platzhalter für fehlende oder veränderte Ordnerdateien. Abbruchsignale stoppen weitere Arbeit.

Der Bearbeitungsbildschirm erscheint vor dem Laden mit Spinner und Status zur Prüfung und Anzahl erledigter Videos. Felder und Speichern bleiben bis zum Abschluss gesperrt; Zurück bleibt möglich. Verspätete Ergebnisse können weder ein geschlossenes Fenster öffnen noch ein neueres überschreiben. Der Player schützt weiterhin Bildschirm- und Videoauswahl gegen verspätete Antworten.

Die Schnittstelle bietet depth durch gemeinsames Lade-, Wiederholungs- und Sitzungsverhalten; die locality bleibt im Speicher-Modul. Eine zusätzliche Durchreichungsdatei ist nicht nötig. Änderungen verschieben und löschen keine vorhandenen Dateien.

Browserprüfungen testen lazy loading, parallele Aufrufe, Wiederholung nach Fehlern, alte und leere MIME-Metadaten, erneute Prüfung, Bildschirmwechsel während des Ladens und den Reparaturablauf. Derselbe Medienvertrag läuft gegen PWA und Android-Bundle.
