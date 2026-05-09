# MetaChapterManager

Chapter and member management for federations with multiple chapters and divisions (*Sparten*).  
Data is stored in a plain JSON git repository — no external database required.

---

## Features

- **Chapters & Sparten** — create/manage chapters and their sports divisions
- **Member management** — user registration, role assignment, password management
- **Events** — per-chapter event scheduling
- **Document viewer** — serve PDF/DOCX documents to members
- **Verification workflow** — configurable pruefe/verify wizard
- **Git-backed data** — every change is a git commit; push to any git server for backup
- **Demo mode** — automatic demo bootstrap when no data repo is configured
- **Bootstrap admin** — `admin / admin` (orgAdmin) created automatically on first start

---

## Quick Start — Local Development

```bash
# 1. Install dependencies
cd server
npm install

# 2. Run with file-watcher and dev JWT secret (no .env needed)
npm run dev
```

Open <http://localhost:3000>  
Login: **admin / admin** — you will be forced to change the password on first login.

---

## OpenAPI

- Raw spec: <http://localhost:3000/api/openapi.yaml>
- Interactive Swagger UI: <http://localhost:3000/api/openapi>
- Spec source file: `spec/openapi.yaml`

Current focus of the spec: global user pool profile operations (create/update user), not chapter membership endpoints.

Swagger UI assets are served locally from the backend (no CDN required).

---

## Air-gapped / Offline

- Runtime does not require internet access.
- Browser vendor files are included in `client/vendor/`.
- OpenAPI UI assets are served locally from `server/node_modules/swagger-ui-dist`.
- Required setup step is `npm install` (plus normal app start command).
- `node download-vendor.js` is optional and only for manually refreshing vendor files when internet is available.

---

## Run with Node directly (production-like)

```bash
# Generate a secret once:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

export JWT_SECRET=<your-generated-secret>
cd server
npm start
```

---

## Run with Docker

```bash
# Build
docker build -t meta-chapter-manager .

# Run (local data, no git remote)
docker run -d \
  --name mcm \
  -p 3000:3000 \
  -e JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  -v mcm-data:/data \
  meta-chapter-manager
```

With a git-backed data repository:

```bash
docker run -d \
  --name mcm \
  -p 3000:3000 \
  -e JWT_SECRET=<strong-random-secret> \
  -e GIT_DB_URL=https://gitea.example.com/myorg/database.git \
  -e GIT_DB_BRANCH=main \
  -e GIT_DB_USER=myuser \
  -e GIT_DB_PASSWORD=mytoken \
  -v mcm-data:/data \
  meta-chapter-manager
```

---

## Run with Docker Compose

```bash
# Minimal (no git remote)
JWT_SECRET=<strong-random-secret> docker compose up -d

# With git remote
GIT_DB_URL=https://gitea.example.com/myorg/db.git \
GIT_DB_USER=myuser \
GIT_DB_PASSWORD=mytoken \
JWT_SECRET=<strong-random-secret> \
docker compose up -d
```

View logs:

```bash
docker compose logs -f
```
---

## Deploy to OpenShift

See [openshift/README.md](openshift/README.md) for full instructions.

Quick deploy:

```bash
# 1. Edit openshift/secret.yaml — set JWT_SECRET (and git credentials if needed)
# 2. Apply all manifests
oc apply -f openshift/
# 3. Watch rollout
oc rollout status deployment/meta-chapter-manager
# 4. Get public URL
oc get route meta-chapter-manager
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | **required in production** | Secret for JWT signing. Omit only in dev (`NODE_ENV=development`). |
| `PORT` | `3000` | HTTP port the server listens on. |
| `DATA_DIR` | `./data` | Working directory for the git data repo. |
| `DOCS_DIR` | `./docs` | Directory for generated documents (not in git). |
| `GIT_DB_URL` | _(empty)_ | Git repo URL for the data store (`https://…` or `file://…`). Empty = local only. |
| `GIT_DB_BRANCH` | `develop` | Branch to clone/pull. |
| `GIT_DB_USER` | _(empty)_ | Username for HTTPS git auth. |
| `GIT_DB_PASSWORD` | _(empty)_ | Password / personal access token for HTTPS git auth. |
| `GIT_SSL_VERIFY` | `true` | Set `false` to allow self-signed certificates. |
| `GIT_DB_AUTHOR_NAME` | `MCM System` | Git commit author name. |
| `GIT_DB_AUTHOR_EMAIL` | `system@mcm.local` | Git commit author e-mail. |
| `CORS_ORIGIN` | _(empty = same-origin)_ | Allowed CORS origin. Use `*` for local cross-origin dev only. |
| `LOG_LEVEL` | `info` | Log verbosity (`debug`, `info`, `warn`, `error`). |
| `NODE_ENV` | _(unset)_ | Set to `production` to enforce `JWT_SECRET`. |

---

## First Login

Regardless of whether a data repo was provided or not, the server ensures a bootstrap admin exists on every start:

- **Kürzel:** `admin`  
- **Passwort:** `admin`  
- **Rolle:** Organisations-Admin (full access)  
- **mustChange:** `true` — password change is forced on first login

---

## CSV Import Example (Users)

In **Benutzerverwaltung → Neuer Benutzer → CSV-Import**, you can paste CSV with `;` or `,` as delimiter.

Supported columns:

- `kuerzel` (optional if e-mail is present)
- `vorname`
- `name`
- `orgeinheit` (department / referat)
- `email`

Example (`;` separated):

```csv
kuerzel;vorname;name;orgeinheit;email
m123;Max;Mustermann;12B;max.mustermann@firma.de
n234;Nina;Neumann;81G;nina.neumann@firma.de
```

Example (`,` separated):

```csv
kuerzel,vorname,name,orgeinheit,email
m123,Max,Mustermann,12B,max.mustermann@firma.de
n234,Nina,Neumann,81G,nina.neumann@firma.de
```

Notes:

- If `kuerzel` is empty, it is derived from the e-mail local-part.
- Imported e-mail addresses are stored as contact type `email` with attribute `business`.

---

## Data Repository Layout

```
organisation.json          # org name, chapter list, orgAdmins
credentials.json           # password hashes (bcrypt)
user/
  <kuerzel>.json           # user profile
chapter/
  <id>/
    chapter.json           # chapter metadata, admins
    sparte/
      <id>.json            # division metadata
    events/
      <date>-<name>.json   # event records
requests/
  <id>.json                # pending registration requests
```

Every write is committed to git automatically. If `GIT_DB_URL` is set the commit is pushed immediately. A background sync runs every 5 minutes as a fallback.
