# Gemeinsamer Figuren-Upload

Das Modul `cloud-upload` hält den Ablauf von der Validierung bis zum bestätigten Cloud-Ergebnis zusammen. Oberfläche und Tests verwenden dasselbe Interface; der Transportadapter führt Cloud-Aufrufe und Videoübertragung aus. Rückfragen und Darstellung bleiben außerhalb dieser Seam. Das konzentriert die Ablaufregeln (Locality) und macht dieselben Fehlerfälle auf PWA und Android überprüfbar (Leverage).

Vor dem endgültigen Speichern ist ein Abbruch möglich, einschließlich verspäteter Reservierungen und Vorschaubildvorbereitung. Ab Speichernbeginn wird das Ergebnis abgewartet. Ein Kontowechsel verhindert jede weitere lokale Zuordnung und jede Rückmeldung in der neuen Ansicht.

Eine Transaktion speichert gleichzeitig Figur und Upload-Ergebnis. `upload_status` wartet unter derselben Sperre auf einen laufenden Abschluss. Wenn sie „nicht gespeichert“ bestätigt, sperrt sie den alten Vorgang gegen einen verspäteten Abschluss. Erst dann ist Bereinigung sicher. Unklare Ergebnisse bleiben gesperrt und können erneut geprüft werden. Die privaten Ergebnisdatensätze enthalten keine Videodaten; nur das ursprüngliche Konto darf sie abfragen.

Bibliothekszuordnung und lokale Herkunft sind unabhängige Nacharbeiten: Ihre Fehler löschen keinen Cloud-Erfolg. Wiederholungen übertragen keine Videos und speichern keine zweite Figur. Fehler beim Nachladen der Ansicht werden ebenfalls als Nacharbeit angezeigt. Die Oberfläche erhält die Auswahl der gespeicherten Figur und öffnet sie nach erfolgreichem Nachladen.

Prüfungen: gemeinsamer Modultest für kontrollierte Verzögerungen und Teilfehler, SQL-Vertrag für Ergebnisdaten und Zugriffsrechte sowie gezielte Prüfungen der aktiven Oberflächen. Legacy-Bridge-Tests allein ersetzen keine Prüfung des tatsächlich verwendeten Upload-Bildschirms.

Umsetzung von SalsaAppCloud #12–#16. Die Migration für Upload-Ergebnisse muss vor Auslieferung des neuen Clients eingespielt werden.
