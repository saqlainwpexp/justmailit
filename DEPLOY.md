# Emailit — Deployment Guide (Hostinger Business)

## 1. Build the frontend

```bash
cd emailit
npm run build
```

This creates a `dist/` folder with static files.

## 2. Upload to Hostinger

In Hostinger hPanel → File Manager (or via FTP):

```
public_html/
├── index.html          ← from dist/
├── assets/             ← from dist/assets/
└── api/                ← your PHP API folder
    ├── .htaccess
    ├── index.php
    ├── config/
    ├── routes/
    ├── helpers/
    ├── cron/
    └── schema.sql
```

## 3. Set up MySQL database

1. Hostinger hPanel → Databases → MySQL Databases → create database + user
2. Import `api/schema.sql` via phpMyAdmin

## 4. Configure the API

Copy `api/config/config.php` to `api/config/config.local.php` and fill in:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'your_db_name');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');
define('ENCRYPT_KEY', 'any-random-32-character-string!!');
define('APP_URL', 'https://yourdomain.com');
define('CRON_SECRET', 'another-random-secret-key');
```

Then update `config.php` line 1 to load the local file:
```php
if (file_exists(__DIR__ . '/config.local.php')) require_once __DIR__ . '/config.local.php';
```

## 5. Add the root .htaccess (React Router support)

Create `public_html/.htaccess`:

```apache
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_URI} !^/api/
RewriteRule ^ index.html [L]
```

## 6. Set up the cron job

In Hostinger hPanel → Advanced → Cron Jobs → add:

- **Command:** `GET https://yourdomain.com/api/cron/process_queue.php?secret=YOUR_CRON_SECRET`
- **Schedule:** Every 1 minute: `* * * * *`

This processes your automation queue every minute.

## 7. Update the frontend API base URL

In `src/` create `src/lib/api.ts`:
```ts
export const API_BASE = 'https://yourdomain.com/api'
```

## Done!

Visit `https://yourdomain.com` — Emailit is live.
