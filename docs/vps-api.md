# VPS Messaging API

The API listens only on `127.0.0.1:3200`. Nginx is the sole public entry point.

Required private files on the VPS:

- `/etc/dvcs/firebase-admin.json` — Firebase service-account JSON, mode `600`.
- `/etc/dvcs/api.env` — runtime configuration and encryption master key, mode `600`.

The master key must be generated once with `openssl rand -base64 32`. Changing or losing it makes previously encrypted provider credentials unreadable. Back it up in the platform owner's password manager; never commit it.

Production must set `REQUIRE_APP_CHECK=true`. Nginx should proxy `/api/` to `http://127.0.0.1:3200/` with request-size limits and standard forwarding headers.

Provider credentials are encrypted before storage in `communicationCredentials`. Firestore Security Rules deny all client reads and writes to that collection. Only the authenticated API service account can access it.
