<?php
// Emailit — Configuration
// Copy this file to config.local.php and fill in your values
// config.local.php is gitignored

define('DB_HOST', 'localhost');
define('DB_NAME', 'emailit');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');
define('DB_CHARSET', 'utf8mb4');

// Encryption key for stored SMTP passwords (32 random chars)
define('ENCRYPT_KEY', 'change-this-to-a-random-32-char-key!');

// App URL (no trailing slash)
define('APP_URL', 'https://yourdomain.com');

// Tracking pixel + click tracking base URL
define('TRACKING_URL', APP_URL . '/api/track');

// Cron secret (set this in Hostinger cron URL to prevent unauthorised triggers)
define('CRON_SECRET', 'change-this-cron-secret');

// Max emails per cron run (per account daily limit enforced separately)
define('CRON_BATCH_SIZE', 10);

// Allowed CORS origins (your frontend domain)
define('CORS_ORIGIN', APP_URL);
