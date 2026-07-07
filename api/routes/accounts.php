<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/crypto.php';
require_once __DIR__ . '/../helpers/mailer.php';

cors();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// GET /api/accounts — list all
if ($method === 'GET' && $action === '') {
    $rows = db()->query('SELECT id, name, email, smtp_host, smtp_port, imap_host, imap_port, daily_limit, sent_today, status, created_at FROM email_accounts ORDER BY id')->fetchAll();
    ok($rows);
}

// POST /api/accounts — create
elseif ($method === 'POST' && $action === '') {
    $b = body();
    $required = ['name','email','smtp_host','smtp_port','smtp_user','smtp_pass'];
    foreach ($required as $f) {
        if (empty($b[$f])) fail("Missing field: $f");
    }
    $stmt = db()->prepare('INSERT INTO email_accounts (name, email, smtp_host, smtp_port, smtp_user, smtp_pass, imap_host, imap_port, status) VALUES (?,?,?,?,?,?,?,?,?)');
    $stmt->execute([
        $b['name'], $b['email'], $b['smtp_host'], (int)$b['smtp_port'],
        $b['smtp_user'], encrypt($b['smtp_pass']),
        $b['imap_host'] ?? null, (int)($b['imap_port'] ?? 993),
        'connected'
    ]);
    ok(['id' => db()->lastInsertId()], 'Account saved');
}

// POST /api/accounts?action=test — test SMTP connection
elseif ($method === 'POST' && $action === 'test') {
    $b = body();
    $result = sendEmail(
        (int)$b['id'],
        $b['test_to'] ?? $b['email'],
        'Test',
        'Emailit — SMTP test',
        '<p>Your SMTP connection is working correctly.</p>',
        'Your SMTP connection is working correctly.'
    );
    if ($result['success']) ok(null, 'SMTP test passed');
    else fail('SMTP test failed: ' . $result['error']);
}

// DELETE /api/accounts?id=X
elseif ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) fail('Missing id');
    db()->prepare('DELETE FROM email_accounts WHERE id = ?')->execute([$id]);
    ok(null, 'Account deleted');
}

else {
    fail('Unknown action', 404);
}
