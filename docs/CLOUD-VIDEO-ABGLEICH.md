# Cloud-Abgleich von Figuren

Videos werden anhand ihres SHA-256-Inhalts verglichen. Dateiname und Reihenfolge ändern ihre Identität nicht. Beim Upload werden vorhandene zugängliche Cloud-Medien referenziert. Fehlende Cloud-Prüfsummen werden nach einer Berechtigungsprüfung serverseitig ergänzt. Beim Download werden identische lokale Dateien wiederverwendet; zur ersetzten Figur gehörende Videos behalten ihre lokale Identität.

Beschreibung, Tags und Videoreihenfolge werden unabhängig von den Videodateien übernommen. Eine Aktualisierung wird erst nach vollständig geprüften Videos atomar gespeichert. Bei Fehlern bleibt die bisherige lokale Figur erhalten. Die Cloud schützt parallele Aktualisierungen zusätzlich mit einem Inhaltstoken.

Die lokale Zuordnung speichert den zuletzt übernommenen Cloud-Inhalt. Sobald beim Laden bzw. Aktualisieren des Cloud-Speichers ein neuer Inhalt bekannt wird, zeigt das lokale Statussymbol „Cloud-Version aktualisiert“ oder „Lokal und in der Cloud geändert“. Offline bleibt der zuletzt bekannte Stand sichtbar; es gibt keinen automatischen Upload oder Download. Bei alten Zuordnungen ohne Cloud-Basisstand beginnt die sichere Erkennung mit dem nächsten erfolgreichen Upload bzw. Download.

Unveränderte lokale Figuren werden beim Download direkt aktualisiert. Bei lokalen Änderungen bleibt die explizite Wahl zwischen Ersetzen und neuer Kopie erhalten. Vor dem Upload über eine inzwischen geänderte Cloud-Version wird ebenfalls nachgefragt. Nach erfolgreichem Upload wird die gespeicherte Figur unter Meine Cloud-Figuren ausgeklappt angezeigt; bei einem Bibliotheks-Upload öffnet sich die gespeicherte Figur in der betreffenden Bibliothek.
