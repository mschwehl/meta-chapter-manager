# MCM Sportstunden-Freigabe – Requirements

## Überblick

Web-Anwendung zur Freigabe von Sportstunden durch Übungsleiter.  
Sportstundenleiter erfassen Sport-Events, die durch berechtigte Personen freigegeben werden müssen.

**Tech-Stack:** Vue 3 + Tailwind CSS 4 (Frontend), Node.js 20 + Express (Backend), Git als Datenbank (JSON-Dateien).

---

## 1 Datenmodell

Alle Daten liegen als JSON-Dateien in einem Git-Repository.

### 1.1 `organisation.json`

Beschreibt die Gesamtorganisation.

```json
{
  "id": "myorg",
  "name": "Demo Sportverband e.V.",
  "chapters": ["nsk", "wsv"]
}
```

### 1.2 `chapter-{id}.json`

Pro Chapter eine Datei, z. B. `chapter-nsk.json`, `chapter-wsv.json`.

```json
{
  "id": "nsk",
  "name": "NSK Nordstadt",
  "admins": ["s96", "ddd"],
  "spartenadmins": {
    "tischtennis": ["s888", "b333"],
    "fussball": ["f01"]
  },
  "sparten": ["tischtennis", "fussball", "volleyball"]
}
```

| Feld            | Typ                        | Beschreibung                                           |
|-----------------|----------------------------|--------------------------------------------------------|
| `id`            | string                     | Eindeutige Chapter-Kennung                             |
| `name`          | string                     | Anzeigename                                            |
| `admins`        | string[]                  | K�rzel der User mit vollen Admin-Rechten im Chapter    |
| `spartenadmins` | map<string, string[]>     | Sparte ? Liste der K�rzel mit Admin-Rechten pro Sparte |
| `sparten`       | string[]                   | Verf�gbare Sparten im Chapter                          |

### 1.3 `user-{kuerzel}.json`

Pro Benutzer eine Datei, z. B. `user-s888.json`.

```json
{
  "kuerzel": "s888",
  "name": "Müller",
  "vorname": "Peter",
  "chapters": [
    {
      "chapterId": "nsk",
      "beitritt": "2022-01-02",
      "sparte": "tischtennis"
    },
    {
      "chapterId": "wsv",
      "beitritt": "2023-06-15",
      "sparte": "tischtennis"
    }
  ]
}
```

| Feld       | Typ              | Beschreibung                                  |
|------------|------------------|-----------------------------------------------|
| `kuerzel`  | string           | Eindeutiges Kürzel (= Login-ID)               |
| `name`     | string           | Nachname                                       |
| `vorname`  | string           | Vorname                                        |
| `chapters` | ChapterMember[]  | Chapter-Zugehörigkeiten mit Beitrittsdatum     |

**ChapterMember:**

| Feld        | Typ    | Beschreibung                        |
|-------------|--------|-------------------------------------|
| `chapterId` | string | Referenz auf Chapter-ID             |
| `beitritt`  | date   | Beitrittsdatum                      |
| `sparte`    | string | Sparte im Chapter                   |
| `status`    | enum   | `aktiv` · `passiv` (Mitgliedsstatus)|

### 1.4 `sportevent-{id}.json`

Pro Sportstunde/Event eine Datei, z. B. `sportevent-2026-03-14-tt-001.json`.

```json
{
  "id": "2026-03-14-tt-001",
  "chapterId": "nsk",
  "sparte": "tischtennis",
  "datum": "2026-03-14",
  "von": "18:00",
  "bis": "20:00",
  "ort": "Turnhalle Süd",
  "beschreibung": "Reguläres Tischtennis-Training",
  "teilnehmer": ["s888", "b333", "x42"],
  "erstelltVon": "s888",
  "erstelltAm": "2026-03-10T14:30:00",
  "status": "offen",
  "freigaben": [
    {
      "von": "s888",
      "am": "2026-03-12T09:00:00",
      "kommentar": "Alles in Ordnung"
    }
  ]
}
```

| Feld           | Typ          | Beschreibung                                         |
|----------------|--------------|------------------------------------------------------|
| `id`           | string       | Eindeutige Event-ID                                   |
| `chapterId`    | string       | Referenz auf Chapter                                  |
| `sparte`       | string       | Sparte des Events                                     |
| `datum`        | date         | Datum der Sportstunde                                 |
| `von`          | time         | Startzeit                                             |
| `bis`          | time         | Endzeit                                               |
| `ort`          | string       | Veranstaltungsort                                     |
| `beschreibung` | string       | Freitext-Beschreibung                                 |
| `teilnehmer`   | string[]    | Kürzel der teilnehmenden Personen                     |
| `erstelltVon`  | string       | Kürzel des Erstellers                                 |
| `erstelltAm`   | datetime    | Erstellungszeitpunkt                                  |
| `status`       | enum         | `offen` · `freigegeben` · `abgelehnt`                |
| `freigaben`    | Freigabe[]   | Liste der erteilten Freigaben                         |

**Freigabe:**

| Feld       | Typ      | Beschreibung                    |
|------------|----------|---------------------------------|
| `von`      | string   | Kürzel des Freigebenden         |
| `am`       | datetime | Zeitpunkt der Freigabe          |
| `kommentar`| string   | Optionaler Kommentar            |

### 1.5 Git-Repository-Struktur

```
data/
├── organisation.json
├── chapters/
│   ├── chapter-nsk.json
│   └── chapter-wsv.json
├── users/
│   ├── user-s888.json
│   ├── user-b333.json
│   └── user-s96.json
└── events/
    ├── sportevent-2026-03-14-tt-001.json
    └── sportevent-2026-03-15-fb-001.json
```

Jede Änderung wird als Git-Commit gespeichert → volle Historie, kein externer DB-Server nötig.

---

## 2 Rollen & Security

### 2.1 Rollen

| Rolle           | Quelle                         | Rechte                                                   |
|-----------------|--------------------------------|----------------------------------------------------------|
| **Chapter-Admin** | `chapter-{id}.json#admins`| Alles im Chapter: User verwalten, alle Events sehen/freigeben, Spartenadmins verwalten |
| **Spartenadmin**| `chapter-{id}.json#spartenadmins` | Events der eigenen Sparte erstellen, bearbeiten, freigeben; Teilnehmer verwalten |
| **User**        | `user-{kuerzel}.json`          | Eigene Events sehen, an Events teilnehmen                |

### 2.2 Authentifizierung

- Login mit **Kürzel + Passwort** (Passwort-Hash in `credentials.json`).
- JWT-basiert (stateless, Bearer-Token im Authorization-Header).
- Kein öffentlicher Zugang – alle Seiten erfordern Login.

---

## 3 Use Cases

### UC-01: Login

| | |
|---|---|
| **Akteur** | Alle Benutzer |
| **Vorbedingung** | User existiert in `user-{kuerzel}.json` |
| **Ablauf** | 1. User gibt Kürzel + Passwort ein. 2. System prüft Credentials. 3. Bei Erfolg: Redirect zum Dashboard. Bei Fehler: Fehlermeldung. |
| **Ergebnis** | Benutzer ist angemeldet, Session aktiv. |

### UC-02: Dashboard anzeigen

| | |
|---|---|
| **Akteur** | Angemeldeter Benutzer |
| **Ablauf** | 1. System zeigt offene Events des Chapters/der Sparte. 2. Spartenadmin/Chapter-Admin sieht zusätzlich offene Freigabeanfragen. |
| **Ergebnis** | Übersicht der relevanten Sportstunden. |

### UC-03: Sportevent erstellen

| | |
|---|---|
| **Akteur** | Spartenadmin, Chapter-Admin |
| **Vorbedingung** | User ist Spartenadmin für die Sparte oder Chapter-Admin im Chapter. |
| **Ablauf** | 1. User wählt Chapter + Sparte. 2. Gibt Datum, Uhrzeit, Ort, Beschreibung ein. 3. Wählt Teilnehmer aus der Sparte. 4. Speichert → neue `sportevent-{id}.json` wird als Git-Commit angelegt. |
| **Ergebnis** | Neues Event mit Status `offen`. |

### UC-04: Sportevent freigeben

| | |
|---|---|
| **Akteur** | Spartenadmin, Chapter-Admin |
| **Vorbedingung** | Event hat Status `offen`. User hat Freigabe-Berechtigung. |
| **Ablauf** | 1. User sieht offene Events. 2. Klickt "Freigeben" oder "Ablehnen". 3. Optional: Kommentar. 4. Status ändert sich zu `freigegeben` / `abgelehnt`. 5. Änderung wird als Git-Commit gespeichert. |
| **Ergebnis** | Event ist freigegeben oder abgelehnt, Freigabe-Eintrag gespeichert. |

### UC-05: Sportevent bearbeiten

| | |
|---|---|
| **Akteur** | Spartenadmin (eigene Sparte), Chapter-Admin |
| **Vorbedingung** | Event existiert, Status ist `offen`. |
| **Ablauf** | 1. User öffnet Event. 2. Ändert Daten (Datum, Zeit, Ort, Teilnehmer). 3. Speichert → Git-Commit. |
| **Ergebnis** | Event aktualisiert. |

### UC-06: Teilnehmer zu Event hinzufügen/entfernen

| | |
|---|---|
| **Akteur** | Spartenadmin, Chapter-Admin |
| **Ablauf** | 1. Event öffnen. 2. User aus Sparte hinzufügen oder entfernen. 3. Speichern. |
| **Ergebnis** | Teilnehmerliste aktualisiert. |

### UC-07: Events auflisten & filtern

| | |
|---|---|
| **Akteur** | Alle angemeldeten Benutzer |
| **Ablauf** | 1. Eventliste nach Chapter, Sparte, Datum, Status filtern. 2. User sieht nur Events seines Chapters / seiner Sparte (oder alle bei Chapter-Admin). |
| **Ergebnis** | Gefilterte Eventliste. |

### UC-08: User verwalten (Chapter-Admin)

| | |
|---|---|
| **Akteur** | Chapter-Admin |
| **Ablauf** | 1. Neuen User anlegen (`user-{kuerzel}.json`). 2. User zu Chapter/Sparte zuordnen. 3. Passwort setzen/zurücksetzen. 4. User deaktivieren. |
| **Ergebnis** | User angelegt/geändert, Git-Commit. |

### UC-09: Spartenadmin verwalten (Chapter-Admin)

| | |
|---|---|
| **Akteur** | Chapter-Admin |
| **Ablauf** | 1. User als Spartenadmin einer Sparte zuweisen oder entfernen. 2. Update in `chapter-{id}.json`. |
| **Ergebnis** | Berechtigungen aktualisiert. |

### UC-10: Event-Historie einsehen

| | |
|---|---|
| **Akteur** | Spartenadmin, Chapter-Admin |
| **Ablauf** | 1. Event auswählen. 2. Git-Log für die Event-Datei anzeigen. 3. Alle Änderungen + Freigaben chronologisch sichtbar. |
| **Ergebnis** | Vollständige Änderungshistorie aus Git. |

### UC-11: Logout

| | |
|---|---|
| **Akteur** | Angemeldeter Benutzer |
| **Ablauf** | 1. Klick auf Logout. 2. Session wird invalidiert. |
| **Ergebnis** | Benutzer abgemeldet, Redirect zu Login. |

---

## 4 Nicht-funktionale Anforderungen

| # | Anforderung |
|---|---|
| NF-01 | **Git als Datenbank** – kein externer DB-Server, alle Daten als JSON in Git. |
| NF-02 | **Revisionssicherheit** – jede Änderung ist ein Git-Commit mit Autor + Timestamp. |
| NF-03 | **Node.js 20** – Express Backend, kein separater DB-Server. |
| NF-04 | **Vue 3 + Tailwind CSS 4** – SPA-Frontend, vollständig offline-fähig (Vendor-Assets lokal). |
| NF-05 | **Authentifizierung erforderlich** – keine Seite ohne Login erreichbar. |
| NF-06 | **Multi-Chapter-fähig** – das System muss mehrere Chapters unterstützen. |

