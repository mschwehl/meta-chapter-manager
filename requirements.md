# MCM Sportstunden-Freigabe â€“ Requirements

## Ãœberblick

Web-Anwendung zur Freigabe von Sportstunden durch Ãœbungsleiter.  
Sportstundenleiter erfassen Sport-Events, die durch berechtigte Personen freigegeben werden mÃ¼ssen.

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
  "superadmins": ["s96", "ddd"],
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
| `superadmins`   | string[]                  | KÃ¼rzel der User mit vollen Admin-Rechten im Chapter    |
| `spartenadmins` | map<string, string[]>     | Sparte â†’ Liste der KÃ¼rzel mit Admin-Rechten pro Sparte |
| `sparten`       | string[]                   | VerfÃ¼gbare Sparten im Chapter                          |

### 1.3 `user-{kuerzel}.json`

Pro Benutzer eine Datei, z. B. `user-s888.json`.

```json
{
  "kuerzel": "s888",
  "name": "MÃ¼ller",
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
| `kuerzel`  | string           | Eindeutiges KÃ¼rzel (= Login-ID)               |
| `name`     | string           | Nachname                                       |
| `vorname`  | string           | Vorname                                        |
| `chapters` | ChapterMember[]  | Chapter-ZugehÃ¶rigkeiten mit Beitrittsdatum     |

**ChapterMember:**

| Feld        | Typ    | Beschreibung                        |
|-------------|--------|-------------------------------------|
| `chapterId` | string | Referenz auf Chapter-ID             |
| `beitritt`  | date   | Beitrittsdatum                      |
| `sparte`    | string | Sparte im Chapter                   |
| `status`    | enum   | `aktiv` Â· `passiv` (Mitgliedsstatus)|

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
  "ort": "Turnhalle SÃ¼d",
  "beschreibung": "RegulÃ¤res Tischtennis-Training",
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
| `teilnehmer`   | string[]    | KÃ¼rzel der teilnehmenden Personen                     |
| `erstelltVon`  | string       | KÃ¼rzel des Erstellers                                 |
| `erstelltAm`   | datetime    | Erstellungszeitpunkt                                  |
| `status`       | enum         | `offen` Â· `freigegeben` Â· `abgelehnt`                |
| `freigaben`    | Freigabe[]   | Liste der erteilten Freigaben                         |

**Freigabe:**

| Feld       | Typ      | Beschreibung                    |
|------------|----------|---------------------------------|
| `von`      | string   | KÃ¼rzel des Freigebenden         |
| `am`       | datetime | Zeitpunkt der Freigabe          |
| `kommentar`| string   | Optionaler Kommentar            |

### 1.5 Git-Repository-Struktur

```
data/
â”œâ”€â”€ organisation.json
â”œâ”€â”€ chapters/
â”‚   â”œâ”€â”€ chapter-nsk.json
â”‚   â””â”€â”€ chapter-wsv.json
â”œâ”€â”€ users/
â”‚   â”œâ”€â”€ user-s888.json
â”‚   â”œâ”€â”€ user-b333.json
â”‚   â””â”€â”€ user-s96.json
â””â”€â”€ events/
    â”œâ”€â”€ sportevent-2026-03-14-tt-001.json
    â””â”€â”€ sportevent-2026-03-15-fb-001.json
```

Jede Ã„nderung wird als Git-Commit gespeichert â†’ volle Historie, kein externer DB-Server nÃ¶tig.

---

## 2 Rollen & Security

### 2.1 Rollen

| Rolle           | Quelle                         | Rechte                                                   |
|-----------------|--------------------------------|----------------------------------------------------------|
| **Superadmin**  | `chapter-{id}.json#superadmins`| Alles im Chapter: User verwalten, alle Events sehen/freigeben, Spartenadmins verwalten |
| **Spartenadmin**| `chapter-{id}.json#spartenadmins` | Events der eigenen Sparte erstellen, bearbeiten, freigeben; Teilnehmer verwalten |
| **User**        | `user-{kuerzel}.json`          | Eigene Events sehen, an Events teilnehmen                |

### 2.2 Authentifizierung

- Login mit **KÃ¼rzel + Passwort** (Passwort-Hash in `credentials.json`).
- JWT-basiert (stateless, Bearer-Token im Authorization-Header).
- Kein Ã¶ffentlicher Zugang â€“ alle Seiten erfordern Login.

---

## 3 Use Cases

### UC-01: Login

| | |
|---|---|
| **Akteur** | Alle Benutzer |
| **Vorbedingung** | User existiert in `user-{kuerzel}.json` |
| **Ablauf** | 1. User gibt KÃ¼rzel + Passwort ein. 2. System prÃ¼ft Credentials. 3. Bei Erfolg: Redirect zum Dashboard. Bei Fehler: Fehlermeldung. |
| **Ergebnis** | Benutzer ist angemeldet, Session aktiv. |

### UC-02: Dashboard anzeigen

| | |
|---|---|
| **Akteur** | Angemeldeter Benutzer |
| **Ablauf** | 1. System zeigt offene Events des Chapters/der Sparte. 2. Spartenadmin/Superadmin sieht zusÃ¤tzlich offene Freigabeanfragen. |
| **Ergebnis** | Ãœbersicht der relevanten Sportstunden. |

### UC-03: Sportevent erstellen

| | |
|---|---|
| **Akteur** | Spartenadmin, Superadmin |
| **Vorbedingung** | User ist Spartenadmin fÃ¼r die Sparte oder Superadmin im Chapter. |
| **Ablauf** | 1. User wÃ¤hlt Chapter + Sparte. 2. Gibt Datum, Uhrzeit, Ort, Beschreibung ein. 3. WÃ¤hlt Teilnehmer aus der Sparte. 4. Speichert â†’ neue `sportevent-{id}.json` wird als Git-Commit angelegt. |
| **Ergebnis** | Neues Event mit Status `offen`. |

### UC-04: Sportevent freigeben

| | |
|---|---|
| **Akteur** | Spartenadmin, Superadmin |
| **Vorbedingung** | Event hat Status `offen`. User hat Freigabe-Berechtigung. |
| **Ablauf** | 1. User sieht offene Events. 2. Klickt "Freigeben" oder "Ablehnen". 3. Optional: Kommentar. 4. Status Ã¤ndert sich zu `freigegeben` / `abgelehnt`. 5. Ã„nderung wird als Git-Commit gespeichert. |
| **Ergebnis** | Event ist freigegeben oder abgelehnt, Freigabe-Eintrag gespeichert. |

### UC-05: Sportevent bearbeiten

| | |
|---|---|
| **Akteur** | Spartenadmin (eigene Sparte), Superadmin |
| **Vorbedingung** | Event existiert, Status ist `offen`. |
| **Ablauf** | 1. User Ã¶ffnet Event. 2. Ã„ndert Daten (Datum, Zeit, Ort, Teilnehmer). 3. Speichert â†’ Git-Commit. |
| **Ergebnis** | Event aktualisiert. |

### UC-06: Teilnehmer zu Event hinzufÃ¼gen/entfernen

| | |
|---|---|
| **Akteur** | Spartenadmin, Superadmin |
| **Ablauf** | 1. Event Ã¶ffnen. 2. User aus Sparte hinzufÃ¼gen oder entfernen. 3. Speichern. |
| **Ergebnis** | Teilnehmerliste aktualisiert. |

### UC-07: Events auflisten & filtern

| | |
|---|---|
| **Akteur** | Alle angemeldeten Benutzer |
| **Ablauf** | 1. Eventliste nach Chapter, Sparte, Datum, Status filtern. 2. User sieht nur Events seines Chapters / seiner Sparte (oder alle bei Superadmin). |
| **Ergebnis** | Gefilterte Eventliste. |

### UC-08: User verwalten (Superadmin)

| | |
|---|---|
| **Akteur** | Superadmin |
| **Ablauf** | 1. Neuen User anlegen (`user-{kuerzel}.json`). 2. User zu Chapter/Sparte zuordnen. 3. Passwort setzen/zurÃ¼cksetzen. 4. User deaktivieren. |
| **Ergebnis** | User angelegt/geÃ¤ndert, Git-Commit. |

### UC-09: Spartenadmin verwalten (Superadmin)

| | |
|---|---|
| **Akteur** | Superadmin |
| **Ablauf** | 1. User als Spartenadmin einer Sparte zuweisen oder entfernen. 2. Update in `chapter-{id}.json`. |
| **Ergebnis** | Berechtigungen aktualisiert. |

### UC-10: Event-Historie einsehen

| | |
|---|---|
| **Akteur** | Spartenadmin, Superadmin |
| **Ablauf** | 1. Event auswÃ¤hlen. 2. Git-Log fÃ¼r die Event-Datei anzeigen. 3. Alle Ã„nderungen + Freigaben chronologisch sichtbar. |
| **Ergebnis** | VollstÃ¤ndige Ã„nderungshistorie aus Git. |

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
| NF-01 | **Git als Datenbank** â€“ kein externer DB-Server, alle Daten als JSON in Git. |
| NF-02 | **Revisionssicherheit** â€“ jede Ã„nderung ist ein Git-Commit mit Autor + Timestamp. |
| NF-03 | **Node.js 20** â€“ Express Backend, kein separater DB-Server. |
| NF-04 | **Vue 3 + Tailwind CSS 4** â€“ SPA-Frontend, vollstÃ¤ndig offline-fÃ¤hig (Vendor-Assets lokal). |
| NF-05 | **Authentifizierung erforderlich** â€“ keine Seite ohne Login erreichbar. |
| NF-06 | **Multi-Chapter-fÃ¤hig** â€“ das System muss mehrere Chapters unterstÃ¼tzen. |

