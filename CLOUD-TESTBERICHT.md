# Cloud-Bibliotheken – Prüfstand

Projekt: `tzaprobvauikssnpiucl`, Supabase Free. Cloud-Oberfläche separat in [SalsaAppCloud](https://github.com/rodriges17/SalsaAppCloud). Der frühere Pull Request #1 in SalsaAppIOS wird nicht in die Offline-App übernommen.

## Echte Supabase-Prüfung

Mit einem künstlich erzeugten H.264-Video und einem temporären Testkonto wurden erfolgreich geprüft:

- Manuelle Linkerzeugung ohne E-Mail-Versand und Einlösen des Einmal-Links.
- Administratorzugriff; anonyme Aufrufe erhalten keine Administratorrechte.
- Ein nicht freigeschaltetes Konto darf keine Videos reservieren und nicht als Mitwirkender zugewiesen werden.
- Private Bibliotheken sind ohne Mitgliedschaft/Anmeldung nicht abrufbar.
- Nach Freischaltung: Upload-Reservierung, tatsächlicher Upload in privaten Storage, Verifikation der Dateigröße und Commit einer Version.
- Beitrag zur moderierten Bibliothek und Freigabe durch den Bibliotheksbesitzer.
- Öffentliche Zuordnung wird ohne Figurenbesitzer-Zustimmung abgewiesen.
- Nach Zustimmung: signierter Download ohne Anmeldung. SHA-256 der geladenen Videobytes stimmt mit dem Original-Testvideo überein.
- Widerruf der Zustimmung verbirgt die Figur wieder für öffentliche Lesende.
- Gesperrte Upload-Freigabe verhindert weitere Reservierungen.
- Änderung des Gesamtlimits im echten Projekt erfolgreich; Supabases Safe-Update-Regel wird durch eine explizite WHERE-Bedingung erfüllt.
- Alle Testbibliotheken, Versionen, Videos und das temporäre Konto wurden entfernt. Verifiziert: 0 Cloud-Mediendatensätze, 0 Storage-Objekte, 0 Bibliotheken, 1 Person (Administrator).

Der einmalige Bootstrap-Schlüssel wurde nach Anlage des Administrators aus der Serverfunktion entfernt. Keine E-Mail oder WhatsApp-Nachricht wurde automatisch verschickt. Es wurden keine Nutzervideos verwendet.

## Lokale Datenbank- und Logiktests

21 Tests erfolgreich: 9 neue Datenbanktests mit PostgreSQL/PGlite und nachgebildetem Supabase-Auth-/Storage-Schema sowie 12 bisherige Logik-/Pakettests. Abgedeckt sind Rechte, öffentliche/private Bibliotheken, Freigabe von Personen, Worst-Case-Reservierungen, Quotenüberschreitung, unvollständige Uploads, Moderation, öffentliche Zustimmung, gemeinsame Figuren, versionierte Updates, Sperren und Quotenfreigabe erst nach Dateilöschung.

Die öffentliche SQL-Schnittstelle sperrt Reservierung/Commit und administrative Quota-Änderungen vor dem Lesen der veränderlichen Berechtigungen über dieselbe transaktionale Sperre. Diese zusätzliche Migration ist im Projekt eingespielt. Ein Lasttest mit vielen parallelen echten Geräten wurde nicht durchgeführt.

Deno-Typprüfung der Edge Function erfolgreich. Supabase SDK auf 2.118.0 festgelegt, npm-Lockfile im Repository.

## Browser-Prüfung

Die Cloud-Oberflächentests simulieren die API ausdrücklich. Sie ersetzen die oben getrennt dokumentierte echte Supabase-Prüfung nicht. Bestehende Player-, Mehrvideo-, ZIP-, Touch-, Offline- und Cache-Upgrade-Tests laufen weiterhin in Chrome/Android-Ansicht und WebKit/iPhone-Ansicht.

**30 Browser-Tests erfolgreich (15 Szenarien je Chrome und WebKit), zusammen mit den 21 Logik-/Datenbanktests insgesamt 51 erfolgreiche Prüfungen.** [Erfolgreicher Lauf](https://github.com/rodriges17/SalsaAppIOS/actions/runs/39193353337). Nach der zusätzlichen WHERE-Korrektur für Supabases Safe-Update-Regel wurden alle 21 lokalen Tests erneut ausgeführt und die echte Admin-Limit-Aktion mit HTTP 200 bestätigt. Der finale Branch-Lauf mit Quellcode `72c376e6b55c02c8c737bd781e880752fa6bed1e` ist vollständig erfolgreich (21 Logik-/Datenbanktests, 30 Browser-Tests) und prüft zusätzlich die atomare Speicherung von Veröffentlichungszustimmung und Version. Die Versionsauswahl übernimmt die bestehende Zustimmung; ein Widerruf kann keine neue Version kurzzeitig veröffentlichen. Die ersten beiden Runden hatten je drei WebKit-Fehler beim Abfangen der externen simulierten API; die UI-Simulation verwendet daher nun eine lokale API ohne Service Worker. Offline-Neustarts bleiben separat durch die bestehenden App-Tests abgedeckt; daraus wird kein Erfolg abgeleitet.

## Sicherheitsprüfung

Supabase Advisors meldeten keine ERROR-Sicherheitsbefunde. Ein projektweiter WARN-Hinweis betrifft [deaktivierten Schutz gegen geleakte Passwörter](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); die App verwendet ausschließlich einmalige Anmeldelinks und vergibt keine Passwörter. Dieser Auth-Hinweis wird nicht als behoben ausgegeben. Der INFO-Hinweis [RLS ohne Policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) ist hier absichtlich: Browserrollen besitzen keine Tabellenrechte, RLS verweigert standardmäßig jede Zeile. Zugriff erfolgt über geprüfte API-Aktionen; privilegierte Implementierungen liegen im nicht exponierten Schema `cloud_private`, öffentliche Wrapper sind Security Invoker. Storage erlaubt nur neue reservierte Pfade; keine Browser-Policies für Lesen, Ersetzen oder Löschen.

Performance-INFO zu [nicht indexierten Fremdschlüsseln](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) und erwartbar unbenutzten neuen Indizes bleibt für den kleinen Testbestand dokumentiert; keine Performance-Probleme oder Warnungen festgestellt.

## Praktische Grenzen

900 MB Gesamtspeicher, 50 MB pro Cloud-Video. Ausstehende Reservierungen und alte Versionen zählen mit. Supabase-Abruf-/Egress-Freigrenzen werden nicht automatisch durch die Speicherquote begrenzt. Signierte Video-Links bleiben bis zu fünf Minuten gültig, bereits lokal kopierte Inhalte lassen sich nicht zurückholen.

Kein physisches iPhone/Android-Gerät und kein echter WhatsApp-Versand hier geprüft. Datenbank und Serverfunktion sind eingerichtet. Die Veröffentlichung erfolgt im neuen Repository SalsaAppCloud; die Offline-App bleibt unverändert. Die Abspaltung wird im Workflow https://github.com/rodriges17/SalsaAppCloud/actions/runs/39194946945 geprüft.
