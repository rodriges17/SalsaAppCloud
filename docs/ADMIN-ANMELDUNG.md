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
