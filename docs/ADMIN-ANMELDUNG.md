# Admin-Anmeldung mit E-Mail und Passwort

## Nach dem Abmelden zurückkehren

1. **Cloud-Speicher** öffnen.
2. Unterhalb der öffentlichen Bibliotheken **Anmelden** aufklappen und **Admin-Anmeldung** wählen.
3. Die E-Mail-Adresse des Plattform-Admin-Kontos und dessen Passwort eingeben.
4. **Als Admin anmelden** wählen.

Die Zugangsdaten funktionieren in Cloud-PWA und Android. Bestehende persönliche Anmeldelinks bleiben erhalten. Die Passwort-Anmeldung erstellt kein neues Konto und vergibt keine Admin-Rechte. Nach erfolgreicher Authentifizierung prüft die App die aktuelle Plattform-Admin-Rolle auf dem Server.

## Passwort erstmals setzen oder ändern

Im angemeldeten Admin-Konto **Cloud-Speicher → Plattformverwaltung → Admin-Passwort** öffnen. Ein neues Passwort mit mindestens zwölf Zeichen zweimal eingeben und speichern. Das bisherige Passwort ist nur notwendig, wenn der Auth-Dienst es verlangt. Passwortmanager können die Felder ausfüllen; Einfügen ist erlaubt.

Das Passwort wird direkt beim Auth-Dienst geändert. Es wird weder in den App-Einstellungen gespeichert noch an die Cloud-Verwaltungsfunktion gesendet. Angefangene Passwörter werden nach einem Speicher- oder Anmeldeversuch aus den Feldern entfernt.

## Wenn das Passwort unbekannt ist

Solange du noch angemeldet bist, kannst du in der Plattformverwaltung ein neues Passwort setzen. Falls der Auth-Dienst eine frische Anmeldung verlangt, melde dich zuerst mit einem neuen persönlichen Anmeldelink an.

Wenn du vollständig abgemeldet bist und das Passwort nicht mehr weißt, kann ein anderer Plattform-Admin einen neuen persönlichen Anmeldelink erzeugen. Ist niemand mehr angemeldet, bleibt die Wiederherstellung über Supabase. Es werden keine automatischen Wiederherstellungs-E-Mails verschickt.

## Technische Prüfung

Sitzungen werden erst nach der serverseitigen Rollenprüfung übernommen. Ein fehlgeschlagener Versuch erhält eine bestehende Sitzung. Verworfene Kandidaten werden ausschließlich mit `scope=local` beendet; ein später Auth-Antwort kann weder eine Abmeldung noch eine neuere Anmeldung überschreiben. Bestehende Erneuerung, Konto-Cache-Trennung und Abmeldung bleiben erhalten.

## Bestätigung persönlicher Anmeldelinks

Persönliche Einmallinks bleiben gültig. Die App prüft den Link bei Supabase und zeigt die dort verifizierte E-Mail-Adresse. Erst nach ausdrücklicher Bestätigung wird die neue Sitzung gespeichert und für Cloud-Zugriffe verwendet. Bei einem Kontowechsel werden beide Konten angezeigt; eine Erneuerung desselben Kontos wird ebenfalls bestätigt. Fertige Access-/Refresh-Token aus URL-Fragmenten werden nicht mehr übernommen.

Bis zur Bestätigung bleibt das bisherige Konto aktiv. Der Sitzungskandidat bleibt nur im Arbeitsspeicher. Abbrechen, Escape, Android-Zurück und Schließen des Bestätigungsdialogs verwerfen ihn; ein bereits geprüfter Einmallink ist dann verbraucht. Ein Neuladen stellt keinen unbestätigten Kandidaten wieder her. Ungültige Links verändern die bestehende Anmeldung nicht. Ein abgebrochener Kandidat wird nach Möglichkeit serverseitig mit lokalem Logout widerrufen, ohne die bisherige Sitzung abzumelden.

### Validierung des Security-Fixes

- Sitzungs-API und DOM-Dialoge: Token-Fragmente, explizite Bestätigung, beide Kontoadressen, Kontoerneuerung, Abbrechen, Cancel-/Close-Ereignisse, konkurrierende Links, Abmelden während der Prüfung und Neuladen getestet.
- Während einer ausstehenden Bestätigung verwenden Figurenabfragen und Video-Uploads weiterhin die bisherige Sitzung.
- Automatischer Linkeinstieg entfernt den Code aus der Browseradresse und lädt vor der Bestätigung keine Cloud-Inhalte.
- Lokale vollständige Testsuiten: PWA 198 Tests bestanden; Android 183 Tests bestanden.
- Playwright-Prüfungen für manuelle Linkanmeldung und Abbrechen eines automatisch geöffneten Links vorhanden. Lokale Browserausführung blockiert: Chromium fehlt, Installationsdownload liefert ein ungültiges Archiv. Diese Browserprüfungen sind hier nicht als bestanden zu werten.
- Kein physischer Android-Gerätetest und kein APK-Build in dieser Umgebung; native Linkübergabe und Zurück-Navigation im Code geprüft, deren Cancel-Ereignis in der eingebetteten Oberfläche getestet.

Umsetzung zu SalsaAppCloud #43/#44 und SalsaAppAndroid #34. Veröffentlichung erfolgt separat.
