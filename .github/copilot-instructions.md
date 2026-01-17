# Share Note Backend - Copilot Instructions

## Project Overview

**Share Note** is a self-hosted backend server for the Obsidian Share Note plugin, enabling secure note sharing through encrypted links and file management.

**Stack:** TypeScript, Hono web framework, SQLite (better-sqlite3), Node.js, Docker

**Key Architecture:**

- **Entry Point:** [src/index.ts](app/src/index.ts) - Hono app setup with global middleware (CORS, ETags), route mounting, and static file serving
- **Core Singleton:** `appInstance` ([types.ts](app/src/types.ts)) - Injected into all controllers, contains db, logger, config (baseWebUrl, hashSalt, folderPrefix)
- **Database:** SQLite with WAL journal mode ([schema.sql](app/schema.sql)) - 4 tables: users, api_keys, files, logs
- **Static Files:** User-generated files organized in `userfiles/{notes,files,css}` with optional folder prefixing

## Critical Architecture Patterns

### Controller-based Request Handling

All business logic uses a **Controller → Mapper → Database** chain:

1. **Controller** ([Controller.ts](app/src/v1/Controller.ts)): Base class extracting request context (headers, body as `this.post`, authenticated user from middleware)
2. **Mapper** ([Mapper.ts](app/src/v1/Mapper.ts)): ORM-like pattern for CRUD operations with SQL injection protection via parameterized queries
3. **Services:** File, User, WebNote extend Controller, implement business logic

Example pattern from [File.ts](app/src/v1/File.ts#L1-L100) and [User.ts](app/src/v1/User.ts#L1-L50):

```typescript
const user = await Mapper(this.app.db, 'users');
await user.load({ uid: uid });
if (user.notFound) {
  user.set({ uid, created: now() });
  if (!user.save()) throw new HTTPException(serverError(...));
}
```

### Authentication Flow

- **Headers:** `x-sharenote-id` (user UID), `x-sharenote-key` (hash), `x-sharenote-nonce` (random string)
- **Middleware:** [withAuthenticatedUser](app/src/v1/routes/middleware.ts) validates nonce+api_key hash against stored key
- **Error Code 462:** Triggers automatic API key refresh in the plugin

### File Management & Naming

- **Whitelist:** Only specific extensions allowed (html, css, images, fonts, webm) in `fileExtensionWhitelist`
- **Filenames:** Generated as base36 hashes (8 chars for HTML, 20 for others) using `shortHash()`
- **Paths:** `Paths` class handles folder prefixing logic (0/1/2 characters) for scaling
- **Expiration:** Files have optional `expires` timestamps, checked by Cron job

### Template System (WebNote)

- [WebNote.ts](app/src/v1/WebNote.ts) renders encrypted/plaintext notes as HTML
- Uses placeholder replacement: `TEMPLATE_CSS`, `TEMPLATE_ENCRYPTED_DATA`, etc.
- Selects decryption JS based on plugin version (via `x-sharenote-version` header)

### Error Handling Convention

- **HTTP Status Codes 560+:** Custom server errors enum ([types.ts](app/src/types.ts))
  - 560 = FILE_FAILED_TO_INIT, 561 = FILE_FAILED_TO_SAVE, etc.
  - Map to user-friendly messages in `StatusCodes` object
- **HTTPException:** Thrown from controllers, automatically converted to response

## Development Workflows

### Build & Run

```bash
npm run dev          # Local: ts-node with hot reload
npm run build        # Compile TypeScript to dist/
npm run test         # Build Docker image and run with compose
npm start            # Production: node dist/index.js
```

### Database

- **Schema:** [schema.sql](app/schema.sql) auto-executed on Database class init
- **Migrations:** Script-based; make changes in schema.sql, then rebuild
- **Dates:** Stored as Unix timestamps (seconds), helper functions: `now()`, `dateToSqlite()`, `epochToDate()`
- **Indexes:** Comprehensive indexes on frequently queried fields (api_keys.api_key UNIQUE, files.hash, users.uid)

### Docker Deployment

- **Build:** Alpine Node.js, production deps only, TypeScript compiled without type checking
- **Volumes:** db/ and userfiles/ must be persistent
- **Health Check:** `/v1/ping` returns "ok" after checking write access to fs

### Cron Jobs

- **Every minute:** Delete expired files, purge Cloudflare cache if configured
- **Daily (00:00 UTC):** Backup database

## Project-Specific Conventions

### Testing

Manual API testing via Bruno (JSON config in [tests/api/bruno.json](app/tests/api/bruno.json))

### Cloudflare Integration (Optional)

- **Turnstile CAPTCHA:** On account creation (configurable via env)
- **Cache Purging:** Cron jobs purge URLs after file deletion
- **Setup:** [Cloudflare.ts](app/src/v1/Cloudflare.ts) handles API calls

### Environment Variables

See [README.md](README.md) for full list. Critical:

- `BASE_WEB_URL`: Public server URL (e.g., https://notes.example.com)
- `HASH_SALT`: For hashing operations
- `MAXIMUM_UPLOAD_SIZE_MB`: Enforced in middleware
- `FOLDER_PREFIX`: 0/1/2 for file path scaling (0 = flat, 2 = split by first 2 chars)

### Middleware Chain

All routes pass through:

1. `withAuthenticatedUser` - Validates API key and nonce
2. `withJson` or `withRawContent` - Parses request body
3. `checkSize` - For uploads, validates file size limit
4. Route handler creates service class (File/User/WebNote)

## Key Files & Directories

| Path                                 | Purpose                                                   |
| ------------------------------------ | --------------------------------------------------------- |
| [src/index.ts](app/src/index.ts)     | App initialization, route mounting, static file rewriting |
| [src/types.ts](app/src/types.ts)     | App interface, error enums, HTTP status codes             |
| [src/v1/](app/src/v1/)               | All business logic                                        |
| [src/v1/routes/](app/src/v1/routes/) | API endpoints (file.ts, account.ts, middleware.ts)        |
| [schema.sql](app/schema.sql)         | Database schema (users, files, api_keys, logs)            |
| [userfiles/](userfiles/)             | Runtime directory for user notes, CSS, and files          |
| [Dockerfile](Dockerfile)             | Multi-stage, optimized for size                           |

## Common Tasks

**Adding an API endpoint:**

1. Create method in service class (e.g., File, User)
2. Add POST/GET handler in [routes/file.ts](app/src/v1/routes/file.ts) or [routes/account.ts](app/src/v1/routes/account.ts)
3. Apply middleware: `withAuthenticatedUser`, `withJson`/`withRawContent` as needed
4. Throw `HTTPException` with custom error code if needed

**Adding database table:**

1. Add to `DatabaseSchema` interface in [Database.ts](app/src/v1/Database.ts)
2. Add CREATE TABLE to [schema.sql](app/schema.sql)
3. Update Mapper or create new service class

**Debugging:**

- Enable `DebugOption` enum in [types.ts](app/src/types.ts) for HTML response inspection
- Check logs via [Log.ts](app/src/v1/Log.ts) (`appInstance.log.add()`)
- Database queries logged in browser/server logs (Bruno tests)
