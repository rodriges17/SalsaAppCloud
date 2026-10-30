# Gemeinsame Figurenkarten

Cloud-PWA (#76–#78) und Android (#49–#51) verwenden dieselben Module für Figurenkarten. Die gemeinsame Implementation bündelt Titel, Tagdarstellung, Vorschaubildrahmen und Statusdarstellung sowie die Erstellung lokaler Karten. Sie liest für die Kartendarstellung keine Videos ein.

## Darstellungsvarianten

- Cloud „Meine Figuren“ und Bibliotheksfiguren verwenden denselben Rahmen, Titelstil, Vorschaubildgröße, Fokusrahmen und gemeinsame Abstände. Vergleichbare Inhalte haben gleiche Kartenmaße. Lange Titel und Zusatzangaben werden gekürzt; der vollständige Text bleibt im Dokument verfügbar.
- Eigene Cloud-Figuren behalten Videoanzahl und öffentliche Freigabe in der Zusammenfassung sowie Figur/Verwalten und ihre berechtigten Aktionen im geöffneten Zustand.
- Bibliotheksfiguren behalten ihre Reihenfolgenummer und Tags in der Zusammenfassung sowie veröffentlichte und gegebenenfalls noch freizugebende Inhalte. Beschreibungsumbrüche bleiben erhalten.
- Lokale Figuren behalten ihre bisherige Geometrie, größeren quadratischen Vorschaubilder, Titel, Tagkürzung, Videometadaten, Lernstand, Speicherort und Cloud-Herkunft. Menüs, Lernen und Speicheraktionen bleiben im Aufrufer. Gemeinsamer Code erzwingt keine gemeinsame Gestaltung.

## Lebensdauer

Ein Cloud-Kartenlauf erzeugt geöffnete Inhalte nur bei Bedarf und genau einmal pro dargestellter Karte. Geschwisterkarten derselben Liste schließen sich gegenseitig. Wiederöffnen erhält den aufgebauten Inhalt einschließlich Auswahlzuständen; ein neu geladener Cloud-Stand erstellt neue Karten.

Videovorschauen gehören zur geöffneten Karte. Beim Einklappen, Wechsel zur Verwaltung oder zu den Einstellungen und Verlassen werden Wiedergabe und Medienquelle beendet. Eine neue Auswahl entwertet vorherige Vorschauanfragen. Späte Antworten und Fehler dürfen weder eine geschlossene Karte noch eine andere Ansicht verändern. Das Entfernen des open-Zustands entwertet Vorschauen auch dann, wenn native toggle-Ereignisse zusammengefasst werden. Entfernte Ansichten geben Beobachter und Anfragen frei.

Vorschaubilder bleiben beim vorhandenen Vorschaubildmodul; dessen Cache und bestehende Erzeugung aus einem Video bleiben erhalten. Figuren-Downloads behalten ihren eigenen Ablauf, ihre Speicherergebnisse und ihren Abbruch. Das Schließen einer Karte beendet ausschließlich deren Wiedergabe, keinen Figuren-Download.

## Prüfung

Modulprüfungen verwenden die öffentlichen Karten- und Ansichtsinterfaces: Kontextinformationen, Groß-/Kleinschreibung bei Tags, lokale Speicher-/Lerninformationen, einmaliger Inhaltsaufbau, schnelle Wechsel und verspätete Ergebnisse. Ein gemeinsamer Browservertrag prüft Cloud-Geometrie und Kontextinformationen in beiden Erscheinungsbildern bei 320 und 768 Pixeln sowie überholte Vorschauanfragen, Tabwechsel und Einklappen. Die vorhandenen lokalen Layout-, Medien-, Navigations- und Downloadverträge bleiben bestehen.
