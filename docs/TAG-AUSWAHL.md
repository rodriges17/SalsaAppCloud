# Durchsuchbare Tag-Auswahl

Cloud-PWA und Android verwenden beim Erstellen/Bearbeiten einer Figur und im Cloud-Upload dasselbe Mehrfachauswahlfeld. Ausgewählte Tags erscheinen als einzeln entfernbare Chips. Das Dropdown bleibt nach der Auswahl offen; Teilbegriffe werden ohne Beachtung der Groß-/Kleinschreibung gefunden. Pfeiltasten, Enter, Tab und Escape unterstützen die Tastaturbedienung.

Tags behalten ihre exakte Identität: `Pasito` und `pasito` sind unterschiedliche Tags. Neue Tags werden ausschließlich über „Neues Tag … anlegen“ hinzugefügt, sofern die exakte Schreibweise noch nicht vorhanden ist. Die bisherigen Stringarrays in Figuren, Revisionen, ZIPs und Backups bleiben erhalten; es gibt weder eine globale Umbenennung noch eine automatische Zusammenführung. Die Tag-Filter der Übersicht bleiben unverändert. Neue Zuordnungen sind auf 100 Tags pro Figur und 160 Zeichen gemäß den bestehenden Austauschformaten je Tag begrenzt.

## Vorschläge und Offline-Betrieb

Lokale Vorschläge stammen aus den App-Figuren und den gespeicherten Metadaten verbundener Geräteordner. Dafür werden weder Videos gelesen noch Ordnerberechtigungen angefordert. `cloud_api('tags')` liefert alle unterschiedlichen Tags lesbarer Cloud-Revisionen unter den vorhandenen Berechtigungsregeln, einschließlich noch nicht heruntergeladener Bibliotheken. Öffentliche Freigaben, private Mitgliedschaften, ausstehende Beiträge und gelöschte Figuren folgen derselben Prüfung wie das Lesen der Revision. Der Aufruf lädt keine Videos.

Cloud-Vorschläge werden pro Anmeldesitzung im vorhandenen Cloud-Cache gespeichert. Offline, bei Ladefehlern und bei noch nicht installiertem Backend liefern lokale und zuletzt gespeicherte Vorschläge einen nutzbaren Rückfall mit Hinweis auf die möglicherweise unvollständige Cloud-Liste. „Tag-Vorschläge aktualisieren“ oder die Wiederherstellung der Verbindung aktualisiert die Liste, ohne Suchtext oder Auswahl zu ändern. Cache-Verwerfen wegen Schreibvorgängen oder erkannten Berechtigungsänderungen aktualisiert ebenfalls die Vorschläge. Abmeldung und Kontowechsel entfernen die vorherigen Konto-Vorschläge; verspätete Ergebnisse dürfen sie nicht zurückholen.

Ausgewählte Tags gehören ausschließlich zum laufenden Figuren-/Uploadentwurf. Vorschlagsaktualisierungen entfernen niemals Zuordnungen. Uploadfehler erhalten die Auswahl für einen erneuten Versuch; Upload-Anpassungen schreiben die lokale Figur nicht um.

## Veröffentlichung und Prüfung

Vor Veröffentlichung der Oberfläche die Migration `tag_suggestions` im Cloud-Repository anwenden. Die vorhandene Edge Function reicht die neue Aktion bereits über den normalen authentifizierten RPC weiter; keine neue privilegierte Abfrage und keine neue Edge-Function-Version sind erforderlich. Ältere Clients funktionieren weiter.

Datenbanktests prüfen lesbare/ausgeschlossene Revisionen, öffentliche und private Tags, getrennte Schreibvarianten, gelöschte Figuren sowie Mitgliedschaftsentzug. Katalogtests prüfen Offline-Rückfall, aktualisierte Vorschläge, optionale Cache-Fehler und verspätete Ergebnisse nach Konto-/Berechtigungswechsel oder geschlossenem Bildschirm. Gemeinsame UI-Verträge laufen gegen PWA und Android für Figurenbearbeitung, Upload/Wiederholung, Cloud-/Offline-Vorschläge sowie Eingabegrenzen und Tastaturbedienung.
