# Cloud-Bibliotheken: kostenloser Test

Projekt `tzaprobvauikssnpiucl`. Der öffentliche Schlüssel ist in `pwa/cloud-config.js`. Administrative Schlüssel gehören nicht ins Repository oder in den Chat.

## Status

Im Projekt wurden die sechs Migrationen und die Edge Function bereits eingerichtet. Der Administrator ist angelegt. Ein echter API-/Storage-Test mit künstlichem Video war erfolgreich; die Cloud-PWA liegt separat im Repository `rodriges17/SalsaAppCloud`. Die folgenden Einrichtungsschritte sind für eine Neuinstallation dokumentiert.

Der Code stellt Datenbankmigrationen, eine Edge Function und die PWA bereit. Erst nach Einrichtung im Supabase-Projekt sind echte Cloud-Aufrufe möglich. Die bevorzugte Einrichtung erfolgt über die Supabase-Anbindung in ChatGPT nach Freigabe des Projekts. Alternativ die folgenden Schritte im Dashboard ausführen.

## Einrichtung im Dashboard

1. Im SQL Editor alle Dateien unter `supabase/migrations/` in aufsteigender Reihenfolge einmalig ausführen. Jede ist eine Transaktion.
2. Authentication → URL Configuration: Site URL und erlaubte Redirect URL auf `https://rodriges17.github.io/SalsaAppCloud/` setzen. Öffentliche Selbstregistrierung für den geschlossenen Test im Dashboard deaktivieren; die Projektanbindung bietet diese Auth-Einstellung hier nicht an. Auch ohne diese Einstellung erhalten neue Konten keine Cloud-Berechtigungen. Ein automatischer E-Mail-Versand wird nicht verwendet.
3. Edge Function `cloud` anlegen und den vollständigen Inhalt von `supabase/functions/cloud/index.ts` übernehmen. Gateway-JWT-Prüfung deaktivieren (`verify_jwt = false`), damit öffentliche Bibliotheksaufrufe möglich sind. Die Funktion validiert Nutzertokens selbst über Supabase Auth und prüft jede Aktion serverseitig. Diese Prüfung nicht entfernen.
4. Function Secrets setzen: `CLOUD_ADMIN_EMAIL` = deine Admin-E-Mail, `CLOUD_BOOTSTRAP_TOKEN` = neue zufällige geheime Zeichenfolge mit mindestens 32 Zeichen. Supabases standardmäßige serverseitige `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` müssen vorhanden sein. Keine dieser administrativen Angaben im Chat teilen.
5. Die Function im Dashboard testen mit POST-JSON: `{"action":"bootstrap","payload":{"token":"DEIN_EINRICHTUNGSCODE"}}`. Sie erzeugt den ersten Administrator und gibt dessen einmaligen persönlichen Anmeldelink zurück. Es wird keine E-Mail verschickt. Link öffnen oder in der PWA unter Cloud → Mit persönlichem Link anmelden einfügen. In einer installierten iPhone-PWA den Link dort einfügen, damit die Sitzung in genau dieser App liegt.
6. Nach Erfolg den Bootstrap-Token löschen. Weitere Bootstrap-Versuche werden auch durch die bereits vorhandene Admin-Zuweisung gesperrt. Den Anmeldelink nicht öffentlich posten.

CLI-Alternative für die Function: nach Anmeldung `supabase functions deploy cloud --project-ref tzaprobvauikssnpiucl --no-verify-jwt`.

## Bedienung und Rechte

Die Cloud-Ansicht ist in Bereiche getrennt: **Bibliotheken** zeigt die zugänglichen Sammlungen. **Bibliothek erstellen** öffnet das Formular erst bei Bedarf; **Abbrechen** kehrt zur Übersicht zurück. **Meine Cloud-Figuren** zeigt den eigenen Cloud-Bestand mit und ohne Bibliothekszuordnung. **Version zuordnen** öffnet eine eigene Ansicht mit Zielbibliothek und Zurück-Button. **Verwaltung** enthält die Plattform-Einstellungen für Administratoren.

Cloud zeigt öffentliche Bibliotheken ohne Anmeldung. Private Bibliotheken erfordern Anmeldung und Mitgliedschaft. Ein Bibliothekslink allein vergibt keine Rechte.

Nur der Plattform-Administrator legt Personen an, schaltet Uploads/Bibliotheksgründung frei und setzt Quoten. Ohne Uploadfreigabe kann eine Person als lesendes Mitglied eingeladen werden. Anmeldelinks werden im Adminbereich erzeugt, kopiert und manuell verschickt. Sie sind einmalig und zeitlich begrenzt; bei verlorener Sitzung einen neuen erzeugen.

Bibliotheksbesitzer wählen Öffentlichkeit, Zusammenarbeit und Freigabeprüfung. Mitwirkende brauchen eine Plattformfreigabe. Neue Beiträge können geprüft werden, alte genehmigte Versionen bleiben bis dahin sichtbar. Nur der Figurenbesitzer erlaubt deren öffentliche Veröffentlichung. Beim Umstellen einer privaten Bibliothek auf öffentlich bleiben Figuren ohne diese Zustimmung für Lesende verborgen.

Lokale Figur → ⋮ → In Cloud veröffentlichen: Videos ausdrücklich auswählen. Eine Cloud-Figur kann ohne neue Video-Kopien weiteren Bibliotheken zugeordnet werden. Neue Versionen aktualisieren alle verknüpften Bibliotheken entsprechend deren Moderationseinstellung. Alte Versionen werden aufbewahrt und zählen zum Speicher.

In meine Figuren übernehmen lädt ausgewählte Videos in einen lokalen Entwurf. Vorschau und Speichern sind erforderlich. Neue Kopien haben Lernstand Neu; identische Wiederholungsimporte brauchen Bestätigung. Lokale Kopien werden nicht automatisch überschrieben.

Bibliothek löschen entfernt Mitglieder und Verknüpfungen, keine Cloud-Videos. Cloud-Figur samt Videos löschen entfernt ausdrücklich sämtliche Versionen und Bibliotheksverknüpfungen. Bereits heruntergeladene Offline-Kopien bleiben erhalten. Bereits ausgegebene Video-URLs können noch bis zu fünf Minuten gültig bleiben.

## Speicher und Betrieb

Startwerte: 900 MB Gesamtlimit als Puffer unter Free, 50 MB pro Video, 250 MB je neuer Person, 500 MB für den ersten Administrator. Während eines Uploads werden maximal 50 MB je Video reserviert. Die tatsächliche Größe wird anhand der Storage-Metadaten geprüft und die Differenz freigegeben. Eine kleinere Größenangabe des Clients umgeht keine Quoten. Entwürfe, laufende Uploads und alte Versionen zählen mit. Der Administrator kann Limits innerhalb der Free-Grenzen ändern. Abruf-/Egress-Grenzen im Supabase-Dashboard separat beobachten.

Abbrüche lösen einen Bereinigungsversuch aus. Jobs laufen nach zwei Stunden ab; beim nächsten angemeldeten Cloud-Aufruf werden abgelaufene Jobs bereinigt. Ohne Nutzung läuft kein geplanter Hintergrundjob. Fehlgeschlagene Löschungen bleiben reserviert. Die Datenbank verhindert Quotenfreigabe, solange das Storage-Objekt noch existiert; ein zeitgesteuerter Aufräumjob kann später ergänzt werden.

Alle Videos liegen privat. Browserrollen dürfen nur reservierte neue Objekte hochladen. Signierte Lese-URLs werden nach Prüfung der konkreten Version erzeugt und laufen nach fünf Minuten ab. Direkte Tabellenschreibrechte sind gesperrt; SQL-RPC und Edge Function erzwingen Rechte unabhängig von der Oberfläche.

## Validierung

Lokale Datenbanktests nutzen PostgreSQL über PGlite mit nachgebildetem Auth-/Storage-Schema. Browser-Cloud-Tests simulieren die API ausdrücklich; sie ersetzen keine eingerichtete Supabase-Instanz. Vor Freigabe für Testpersonen echte Anmeldung, Storage-RLS, Upload, Download, Quotenfehler, Sperre und private Mitgliedschaft im Zielprojekt testen. Auf echten iPhone-/Android-Geräten und mit echten WhatsApp-Links zusätzlich prüfen.
