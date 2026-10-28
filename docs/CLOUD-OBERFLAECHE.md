# Cloud-Oberfläche „Pur“

Cloud-PWA und Android übernehmen den bestätigten Entwurf aus den Tickets SalsaAppCloud #31–#33. Primärquelle: https://github.com/rodriges17/SalsaAppCloud/blob/15f7c956e6952f6ea5bb77ce8780879a076de744/pwa/cloud-card-pur.prototype.html

Das Zahnrad im App-Header öffnet die globalen Einstellungen über der Cloud-Ansicht. Konto und Aktualisieren bleiben getrennte Aktionen neben „Cloud-Speicher“. Freistehende, gleich große Icons stehen mit dem Titel auf einer gemeinsamen Mittelachse. Die Rückkehr aus den Einstellungen erhält den Cloud-Kontext; Wechsel zur Figurenübersicht respektiert den ungespeicherten Bibliotheksentwurf.

Der Reiter „Figur“ enthält Beschreibung, Tags als Pills und eine Abspielzeile je Video mit Name und Größe. Auswahlkästchen für die lokale Übernahme bleiben eigenständig und verschwinden bei vollständig lokal verfügbaren Figuren. „Lokal öffnen“ öffnet die lokale Figur. Fehlende Videonamen oder Größen werden erläutert; Reparatur- und Überschreibschutz bleiben erhalten.

„Verwalten“ zeigt den Freigabestatus als nicht interaktive Plakette und alle erlaubten Aktionen direkt in einer Liste mit linken Icons. Rechte Pfeile und eingeklappte Aktionsgruppen entfallen. Auswirkungen von Widerruf und Löschen stehen in den Bestätigungen. Berechtigungen und Datenspeicherung bleiben unverändert; eine Backend-Migration ist nicht erforderlich.

Die Icons sind als lokale Lucide-Formen eingebunden; Lizenz siehe LICENSE-LUCIDE. Die Prototyp-Dateien verbleiben auf dem separaten Prototyp-Branch.

Gemeinsame Oberflächenverträge prüfen Einstellungen/Konto/Aktualisieren, Navigation mit ungespeichertem Entwurf, Videovorschau und Auswahl, Tagidentitäten, Freigabestatus/Fehler/Wiederholung sowie Eigentümer- und Administratoraktionen auf beiden Plattformen. Mobile Darstellung wird in heller und dunkler Ansicht geprüft.
