# Plattformverwaltung: Geführte Bereiche

Gewählter Entwurf vom 29. Oktober 2026: „Geführte Bereiche“.

Die Plattformverwaltung öffnet sich unter „Mein Konto“. Sie verwendet einen eigenen Titel und blendet die Cloud-Bereichsauswahl aus. Zurück öffnet wieder „Mein Konto“. Das Passwortformular wird erst über „Passwort einrichten / ändern“ im eigenen Konto geöffnet.

Die Benutzerliste ist alphabetisch sortiert, durchsuchbar und nach Alle, Admins und Gesperrt filterbar. „Gesperrt“ bezeichnet die bestehende Upload-Sperre; Lesen bleibt möglich. Es wird keine neue vollständige Kontosperre eingeführt. Rollen, Upload-Freigabe und „Du“ erscheinen als Kennzeichnungen. Namen werden verwendet, soweit sie vorliegen; sonst die E-Mail-Adresse.

Jeweils ein Benutzer ist geöffnet. Seine Bereiche sind Konto, Berechtigungen und Aktionen. Unter Berechtigungen werden Upload-Freigabe, Speicherlimit und Bibliothekszuweisungen explizit gespeichert. Beim Verlassen ungespeicherter Änderungen kann man weiter bearbeiten oder verwerfen. Kritische bestehende Aktionen verlangen eine Bestätigung mit Benutzeridentität. Anmeldelinks werden nur nach bewusstem Aufruf erstellt; die Anwendung versendet dabei keine E-Mail.

Person hinzufügen bleibt bei der Liste. Plattform-Speicherlimit und Video-Duplikatprüfung befinden sich unter „Weitere Verwaltung“. Bestehende serverseitige Rechte bleiben unverändert; die Demo führte keine neue Admin-Rollenänderung oder Kontolöschung ein.

Prüfgrenzen: DOM-Verhaltenstests prüfen Bereichsauswahl, Entwürfe, Filter und Speicheraufrufe. Browserprüfungen schützen Bildschirmnavigation und Passwortspeicherung. Native Android-Gerätetests sind separat erforderlich.
