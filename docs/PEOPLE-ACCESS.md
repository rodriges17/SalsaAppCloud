# Personen & Zugriff

Die gewählte Oberfläche ist Variante A aus dem Prototyp: eine Personenliste mit direkt aufklappenden Details. Es ist höchstens eine Person geöffnet; erneutes Auswählen schließt sie. Quelle der Entscheidung: lokaler Prototyp-Zweig `prototype/people-access-20261025`, Benutzerentscheidung vom 25.10.2026. Die verworfenen Varianten bleiben außerhalb des Produktionszweigs.

## Berechtigungen und Rollenkennzeichnung

Die Navigation verwendet die tatsächlichen Rechte des geladenen Serverstands. Nicht angemeldete Personen und reine Leser starten bei Bibliotheken. Uploadberechtigte starten bei ihren Cloud-Figuren. Bereits vorhandene eigene Cloud-Figuren bleiben nach Entzug der Upload-Freigabe sichtbar und lokal übernehmbar. Das Plattformkonto zeigt ausdrücklich „Plattform-Administrator“. Bibliotheken zeigen Besitzer, Plattformverwaltung, Mitwirken oder Lesen. Besitzerrechte gelten unabhängig von der Upload-Freigabe.

## Personenverwaltung

Nur Plattformadministratoren sehen die Personenliste, die Suche und personenübergreifende Zugriffe. Die Details trennen Cloud-Freigabe, Bibliothekszugriffe und neue Anmeldelinks. Ungespeicherte Cloud-Freigaben bleiben beim Wechsel zwischen Personen im Arbeitsspeicher erhalten. Die Speicherlimits beziehen sich auf dezimale MB.

Neue Personen werden in drei Schritten angelegt: E-Mail, Cloud-Freigabe, optionale Bibliothekszuweisung. Voreinstellung: nur Lesen; vorgeschlagenes Upload-Limit: 250 MB. Anlegen erzeugt keinen Anmeldelink und versendet keine E-Mail. Bei teilweise fehlgeschlagenen Bibliothekszuweisungen werden nur offene Zuweisungen wiederholt. Bestehende Personen können im Hinzufügen-Dialog nicht versehentlich überschrieben werden.

Uploadentzug und Mitgliederentfernung erfordern eine Bestätigung. Erst die erfolgreiche Serverantwort ändert den angezeigten Stand. Lokale Kopien werden nicht entfernt. Bei serverseitig geänderten Rechten wird der Zugriff neu geladen; gespeicherte Sitzungen bleiben erhalten und weiterhin zulässige Formulareingaben werden nach Möglichkeit wiederhergestellt.

Bibliotheksbesitzer prüfen eine vollständige E-Mail-Adresse und erhalten dafür nur die Information, ob Mitwirken freigegeben werden kann. Sie sehen kein plattformweites Verzeichnis. Lesen ist unabhängig von der Upload-Freigabe. Mitwirken erfordert Upload-Freigabe und eine gemeinschaftliche Bibliothek, sowohl in der UI als auch im Edge-Endpunkt. Die vorhandenen Datenbankprüfungen bleiben bestehen.

## Anmeldelinks und Ablaufzeit

Links werden ausschließlich durch eine ausdrückliche Aktion erzeugt und nur im geöffneten Detailbereich gehalten. Kopieren ist immer verfügbar; Teilen erscheint bei verfügbarer Web Share API. Alte Links werden nicht aus einem Cache geladen.

Supabase `generateLink` liefert keinen bestätigten Ablaufzeitpunkt. Der Edge-Endpunkt gibt deshalb `expires_at: null` zurück, solange die tatsächliche Auth-Konfiguration nicht bestätigt wurde. Die UI sagt dann ausdrücklich, dass die genaue Ablaufzeit nicht bestätigt ist. Keine angenommene Stunde wird als tatsächliche Gültigkeit ausgegeben.

Nach Verifikation von `mailer_otp_exp` im Live-Projekt kann der Betreiber `CLOUD_MAGIC_LINK_TTL_SECONDS` auf genau diesen Wert setzen. Der Endpunkt berechnet `expires_at` aus der von Auth gelieferten `confirmation_sent_at` plus dieser Dauer. Bei Änderungen der Auth-Konfiguration muss die bestätigte Dauer entsprechend aktualisiert oder die Variable entfernt werden. Keine Verwaltungszugangsdaten gehören in die Clients.

## Auslieferung und Grenzen

Cloud-PWA und Android verwenden dasselbe Modul `cloud-people.js` und denselben Cloud-Endpunkt. Die lokale PWA ist unverändert. Kontolöschung, Kontosperre, Selbstregistrierung und zusätzliche Rollen sind nicht Bestandteil dieser Änderung.

## Kompakte Mitgliederverwaltung

In einer verwalteten Bibliothek stehen Mitgliederliste und Besitzerkennzeichnung zuerst. Ein Mitglied klappt zur Rollenänderung oder Entfernung auf. Rollenänderungen werden ausdrücklich gespeichert, Entzug von Mitwirken und Entfernen werden bestätigt. Hinzufügen öffnet einen separaten zweistufigen Bereich und schließt den aufgeklappten Eintrag. Plattformadministratoren laden dafür eine aktuelle Personenliste und wählen eine bereits angelegte Person aus. Bibliotheksbesitzer ohne Plattformrechte verwenden die vollständige E-Mail-Adresse; die Prüfung erfolgt beim Weitergehen. Die Rollenwahl bietet Mitwirken nur mit Upload-Freigabe und gemeinschaftlicher Bibliothek an. Nach Fehlern bleiben die Eingaben im Hinzufügen-Bereich erhalten. Es gibt keine zusätzliche Übersicht aller Zugriffswege oder aller Plattformadministratoren.

## Gemeinsamer Speicherablauf

`cloud-people-grant.js` hält die Entwürfe und den Speicherfortschritt für Personenbearbeitung und „Person hinzufügen“. Erfolgreiche Kontofreigaben und Bibliothekszuweisungen bleiben bei Fehlern erhalten; Wiederholen schreibt nur offene Schritte. Beim Anlegen werden weitere ausgewählte Zuweisungen trotz eines einzelnen Fehlers versucht, beim Bearbeiten endet der Lauf beim ersten Fehler wie bisher. Verwerfen nimmt keine gespeicherten Rechte zurück.

Eine Sperre umfasst auch die Bestätigung beim Entziehen der Upload-Freigabe. Kontowechsel oder Sitzungsablauf entwerten den Ablauf über `reset()`: Bereits abgesendete Schreibvorgänge können noch wirksam werden, ihre Antworten ändern aber weder neue Entwürfe noch Ansichten und starten keine weiteren Schritte. Die Darstellung übernimmt Validierung, Rückfragen und Ergebnisanzeige; die Cloud-Berechtigungsprüfung bleibt unverändert.
