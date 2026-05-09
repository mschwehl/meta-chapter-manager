# Developer API Guide: OpenAPI for Global User Pool

This guide documents **global user pool** operations only.
Use these endpoints when creating or updating a user profile itself (not chapter memberships).

## Scope

- Create global user: `POST /api/admin/users`
- Update global user profile: `PUT /api/admin/users/{kuerzel}`

Not in scope for this guide:

- `POST /api/admin/users/{kuerzel}/chapter`
- `PATCH /api/admin/users/{kuerzel}/chapter`
- `DELETE /api/admin/users/{kuerzel}/chapter`

Those chapter endpoints are for membership management, not global profile data.

## Live OpenAPI

- Raw spec (served by backend): `GET /api/openapi.yaml`
- Interactive docs (Swagger UI): `GET /api/openapi`
- Source of truth file: `spec/openapi.yaml`

The interactive docs load the backend-served OpenAPI spec directly, so examples and endpoint contracts are centralized.
Swagger UI static files are served locally from `server/node_modules/swagger-ui-dist` (offline-friendly).

## Auth and Authorization

- Both endpoints require `Authorization: Bearer <JWT>`.
- Create user (`POST /api/admin/users`) requires `orgaAdmin`.
- Update user (`PUT /api/admin/users/{kuerzel}`):
  - `orgaAdmin` can always update.
  - non-orga admin can only update users where chapter-admin access is allowed by server rules.

## OpenAPI Snippet

```yaml
openapi: 3.1.0
info:
  title: MetaChapterManager API (Global User Pool)
  version: 1.0.0
servers:
  - url: http://localhost:3000

tags:
  - name: GlobalUsers
    description: Global user profile management (not chapter memberships)

paths:
  /api/admin/users:
    post:
      tags: [GlobalUsers]
      summary: Create a global user profile
      description: Creates a user in the global user pool with empty chapter memberships.
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateGlobalUserRequest'
            examples:
              basic:
                value:
                  kuerzel: m123
                  vorname: Max
                  name: Mustermann
                  orgeinheit: 12B
                  kontakte:
                    - typ: email
                      attribut: business
                      wert: max.mustermann@example.org
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          description: Validation error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '403':
          description: Forbidden (requires orga admin)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '409':
          description: User already exists
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /api/admin/users/{kuerzel}:
    put:
      tags: [GlobalUsers]
      summary: Update global user profile fields
      description: |
        Updates only global profile fields (`name`, `vorname`, `orgeinheit`, `kontakte`).
        This endpoint does not add/remove chapter memberships.
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: kuerzel
          required: true
          schema:
            type: string
            pattern: '^[a-z0-9][a-z0-9-]{0,63}$'
          description: User ID in path.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UpdateGlobalUserRequest'
            examples:
              updateOrgeinheit:
                value:
                  vorname: Max
                  name: Mustermann
                  orgeinheit: 81G
                  kontakte:
                    - typ: email
                      attribut: business
                      wert: max.mustermann@example.org
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/User'
        '400':
          description: Validation error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '403':
          description: Forbidden
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '404':
          description: User not found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    Kontakt:
      type: object
      additionalProperties: false
      properties:
        typ:
          type: string
          example: email
        attribut:
          type: string
          enum: [private, business]
          description: Only used when typ is email.
        wert:
          type: string
          example: max.mustermann@example.org
      required: [typ, wert]

    CreateGlobalUserRequest:
      type: object
      additionalProperties: false
      required: [kuerzel]
      properties:
        kuerzel:
          type: string
          pattern: '^[a-z][a-z0-9]{3,4}$'
          description: 4-5 chars, starts with a letter.
        vorname:
          type: string
        name:
          type: string
        orgeinheit:
          type: string
          description: Global org unit field.
        kontakte:
          type: array
          items:
            $ref: '#/components/schemas/Kontakt'

    UpdateGlobalUserRequest:
      type: object
      additionalProperties: false
      properties:
        vorname:
          type: string
        name:
          type: string
        orgeinheit:
          type: string
        kontakte:
          type: array
          items:
            $ref: '#/components/schemas/Kontakt'

    ChapterMembership:
      type: object
      properties:
        chapterId:
          type: string
        sparte:
          type: string
        eintrittsdatum:
          type: string
          format: date
          nullable: true
        austrittsdatum:
          type: string
          format: date
          nullable: true
        status:
          type: string

    User:
      type: object
      properties:
        kuerzel:
          type: string
        vorname:
          type: string
        name:
          type: string
        orgeinheit:
          type: string
        kontakte:
          type: array
          items:
            $ref: '#/components/schemas/Kontakt'
        chapters:
          type: array
          items:
            $ref: '#/components/schemas/ChapterMembership'

    Error:
      type: object
      properties:
        error:
          type: string
```

## Example Calls

### 1) Login to get a JWT

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"kuerzel":"admin","password":"admin"}'
```

Copy `token` from the response and use it below.

### 2) Create a user in global pool

```bash
curl -X POST http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "kuerzel": "m123",
    "vorname": "Max",
    "name": "Mustermann",
    "orgeinheit": "12B",
    "kontakte": [
      { "typ": "email", "attribut": "business", "wert": "max.mustermann@example.org" }
    ]
  }'
```

### 3) Update global user profile

```bash
curl -X PUT http://localhost:3000/api/admin/users/m123 \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "vorname": "Max",
    "name": "Mustermann",
    "orgeinheit": "81G",
    "kontakte": [
      { "typ": "email", "attribut": "business", "wert": "max.mustermann@example.org" }
    ]
  }'
```

## Important Notes

- Global profile data lives in `data/user/<kuerzel>.json`.
- `POST /api/admin/users` creates users with `chapters: []`.
- To manage chapter memberships, use the `/chapter` endpoints separately.
