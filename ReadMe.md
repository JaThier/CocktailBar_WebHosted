# CocktailBar WebHosted

Diese Web-App ist eine einfache, clientseitige Cocktailbar-Anwendung für den privaten Gebrauch. Sie läuft direkt als statische Website und ist für GitHub Pages geeignet.

## Was ist umgesetzt?
- Responsive Gäste-Ansicht mit Cocktail-Karten
- Filter für Alkoholisch / Alkoholfrei
- Umschaltbare Gäste-Tabs für vollständige Karte und Tageskarte
- Warenkorb und Bestell-Button
- einfache Bar-Ansicht für die Barkeeper-Ansicht
- zusätzliche Bar-Museum-Ansicht mit Filterdefinitionen
- dynamische Konfiguration über JSON-Dateien im Ordner config/
- GitHub-Pages-taugliche Struktur direkt im Repository-Root

## Projektstruktur
- index.html: Startseite der Gäste-Ansicht
- bar.html: Barkeeper-Ansicht
- bar-museum.html: Bar-Museum-Ansicht
- css/style.css: Styling
- js/app.js: Gäste-Logik und Warenkorb
- js/bar.js: Barkeeper-Logik
- js/shared.js: gemeinsam genutzte Helfer für Config, Darstellung und Datennormalisierung
- js/firebase.js: Firebase-Helfer
- config/alex.json: Beispiel-Konfiguration für eine Bar
- config/default.json: Fallback-Konfiguration

## Wichtige Konventionen
- Die Bar wird über den Query-Parameter `?bar=` gewählt, zum Beispiel `?bar=alex`.
- Cocktails können in der Bar-Ansicht als `daily` markiert werden. Diese Cocktails erscheinen in der Gästeansicht in der Tageskarte.
- Die Stärke-Kategorie `alkoholfrei` ist Teil des `strength`-Feldes und ersetzt die frühere separate Alkohol-Checkbox in der Oberfläche.
- Die vollständige Karte zeigt alle Cocktails mit den vorhandenen Filtern.
- Das Bild-Namensschema liegt in `config/images/NAMING_CONVENTION.txt` und sollte beim Hinzufügen neuer Bilder beachtet werden.

## Lokales Testen
Öffne die Datei index.html direkt im Browser oder starte einen lokalen Webserver im Projektordner.

Beispiel:
```bash
python -m http.server 8000
```

Dann öffne:
- http://127.0.0.1:8000/
- http://127.0.0.1:8000/?bar=alex
- http://127.0.0.1:8000/?bar=jakob
- http://127.0.0.1:8000/?bar=daniel
- http://127.0.0.1:8000/?bar=marcel

## GitHub Pages veröffentlichen
1. Die Änderungen auf GitHub pushen.
2. Im Repository zu Settings > Pages gehen.
3. Als Source die Hauptbranch auswählen.
4. GitHub Pages deployed die Seite aus dem Root-Ordner.

Die Website ist danach unter folgendem Muster erreichbar:
```text
https://<dein-username>.github.io/<dein-repo-name>/
```

## Hinweis
Die App ist bewusst ohne Build-Tools, Node.js oder Python-Backend umgesetzt. Die Datenbank-Logik läuft über das Firebase Client SDK.
