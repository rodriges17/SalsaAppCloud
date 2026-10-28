# Bibliotheks-Bearbeitungssitzung

Umsetzung der Tickets #22–#24 in Cloud-PWA und Android. Das bestehende Entwurfsmodul enthält nun die vollständige Bearbeitungssitzung. Die Oberfläche hält nur eine aktive Sitzung statt separater Entwurfs-, Editor- und Upload-Parkzustände.

## Verantwortlichkeiten

Die Sitzung verwaltet Angaben, Figuren und Reihenfolge, den gewählten Bearbeitungsbereich, Speichern und Verwerfen, Unterbrechen und Rückkehr vom Upload sowie Speicherfehler und Versionskonflikte. Sie lebt ausschließlich im Arbeitsspeicher und ist an die aktuelle Anmeldesitzung gebunden. Kontoänderung, Verwerfen und ersetzte Sitzungen verhindern, dass verspätete Antworten einen alten Entwurf wiederherstellen.

Die Oberfläche zeigt die Daten und fragt Entscheidungen ab. Sie hält keine geparkten DOM-Speicherfunktionen. Cloud-Aufrufe für Commit, Bibliothekslesen und Kontostand sind Adapter am selben Interface, das auch die Tests verwenden.

## Verhalten

- Erst erfolgreicher Bibliotheks-Commit übernimmt den gesamten Entwurf.
- Beim Verlassen mit Änderungen stehen Speichern, Verwerfen und Weiterbearbeiten bereit. Fehler und ungültige Angaben halten die Bearbeitung offen.
- Ein Upload unterbricht die Sitzung. Ein bestätigtes Upload-Ergebnis bleibt auch bei fehlgeschlagener Rückkehr erhalten. Wiederholen ergänzt die Figur genau einmal, ohne neue Übertragung.
- Ein bereits zugängliches Duplikat kann auch außerhalb eigener Cloud-Figuren referenziert werden. Die abschließende Berechtigungsprüfung für die Zuordnung bleibt beim vorhandenen Commit.
- Speicherfehler und Konflikte erhalten Entwurf und Versionsgrundlage. Kein automatisches Zusammenführen und kein Umgehen der Versionsprüfung.
- Neuladen ersetzt den Entwurf erst nach Bestätigung und erfolgreichem Lesen. Abbrechen oder Ladefehler erhalten alle Änderungen.
- Verwerfen entfernt keine bereits hochgeladenen Cloud-Figuren oder Videos.

## Prüfung

Interface-Tests erfassen normalen Abschluss, Abbruch, Fehler und Konflikte, fehlgeschlagene Upload-Rückkehr, gespeicherte Duplikatreferenzen, gleichzeitige Speicheraufrufe, verspätete Ergebnisse und Berechtigungsverlust. Gemeinsame Browserverträge prüfen Konflikt/Neuladen, Upload-Rückkehr mit absichtlichem Lesefehler sowie die Wiederverwendung zugänglicher Duplikate in PWA und Android.

Die Ausführungsumgebung fiel nach den lokalen Prüfungen aus. Die abschließende Sicherung erfolgt über GitHub; die endgültige Fassung wird durch die PR-CI geprüft. Vor dem Ausfall bestanden 91 PWA-Browsertests und im vollständigen Wiederholungslauf 56 Android-Browsertests. Ein zunächst sporadisch fehlgeschlagener bestehender Android-Hash-Test bestand isoliert und im Wiederholungslauf; seine Implementierung wurde nicht geändert.
