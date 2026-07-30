# CocktailBar WebHosted

Diese Web-App ist eine einfache, clientseitige Cocktailbar-Anwendung für den privaten Gebrauch. Sie läuft direkt als statische Website und ist für GitHub Pages geeignet.

## Was ist umgesetzt?
- Responsive Gäste-Ansicht mit Cocktail-Karten
- Filter für Alkoholisch / Alkoholfrei
- Warenkorb und Bestell-Button
- einfache Bar-Ansicht für die Barkeeper-Ansicht
- dynamische Konfiguration über JSON-Dateien im Ordner config/
- GitHub-Pages-taugliche Struktur direkt im Repository-Root

## Projektstruktur
- index.html: Startseite der Gäste-Ansicht
- bar.html: Barkeeper-Ansicht
- css/style.css: Styling
- js/app.js: Gäste-Logik und Warenkorb
- js/bar.js: Barkeeper-Logik
- js/firebase.js: Firebase-Helfer
- config/alex.json: Beispiel-Konfiguration für eine Bar
- config/default.json: Fallback-Konfiguration

## Lokales Testen
Öffne die Datei index.html direkt im Browser oder starte einen lokalen Webserver im Projektordner.

Beispiel:
```bash
python -m http.server 8000
```

Dann öffne:
- http://127.0.0.1:8000/
- http://127.0.0.1:8000/?bar=alex

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
