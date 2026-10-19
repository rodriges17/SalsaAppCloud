# Zwei eigenständige Apps

Offline: `rodriges17/SalsaAppIOS`, bestehender main-Stand und bestehende Adresse bleiben unverändert.
Cloud: neues Repository `rodriges17/SalsaAppCloud`, vollständiger Inhalt dieses Branches.

## Veröffentlichung

1. Leeres öffentliches Repository SalsaAppCloud anlegen und Zugriff für die GitHub-Anbindung gewähren.
2. Den vollständigen Cloud-Stand dorthin übertragen; main darf ausschließlich im neuen Repository veröffentlicht werden. Pull Request #1 im alten Repository nicht zusammenführen.
3. In Settings → Pages die Quelle GitHub Actions wählen. Den PWA-Workflow im neuen Repository ausführen und Browserprüfungen sowie Live-Smoke abwarten.
4. Die vorhandene Supabase-Edge-Function cloud aus diesem Stand bereitstellen: appURL zeigt auf die neue Cloud-Adresse. CORS-Origin bleibt https://rodriges17.github.io.
5. Einen frischen manuellen Admin-Anmeldelink zur neuen Adresse erzeugen. Beide PWAs separat installieren und parallel prüfen.

## Datentrennung

Manifest-ID, Startadresse und Scope sind relativ und werden unter der neuen Adresse eigenständig aufgelöst. IndexedDB, Videocache, Service-Worker-Cache, BroadcastChannel und Cloud-Anmeldung sind nach App-Pfad getrennt. Keine automatische Übernahme der bisherigen lokalen Figuren oder Sitzungen. Figuren können per ZIP exportiert und in die andere App importiert werden.

Beide GitHub-Pages-Adressen liegen weiterhin auf demselben Origin. Browser-Speicherquote und das Löschen sämtlicher Website-Daten können beide Apps betreffen. Eine vollständige Origin-Isolation benötigt unterschiedliche Domains.

## Status

Abspaltung abgeschlossen: Cloud-App unter https://rodriges17.github.io/SalsaAppCloud/ veröffentlicht, Backend-URL umgestellt. 21 Logik-/Datenbanktests und 30 Browserprüfungen bestanden. Zusätzlicher Live-Test des Touch-Imports in Chrome und WebKit erfolgreich. Beide App-Adressen liefern HTTP 200, unterschiedliche Manifest-Namen und nur die neue App einen Cloud-Button. Offline-main bleibt 84d21e7405bd3656206a3ccb5c27f7bb2e5836d9.

Prüflauf: https://github.com/rodriges17/SalsaAppCloud/actions/runs/39194946945 (zweiter Versuch: Veröffentlichung und Live-Test erfolgreich).
