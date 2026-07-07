<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/crypto.php';
require_once __DIR__ . '/../helpers/mailer.php';

cors();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = db();

// GET ?account_id=X — list threads for account (or all)
if ($method === 'GET' && $action === '') {
    $accountId = (int)($_GET['account_id'] ?? 0);
    if ($accountId) {
        $stmt = $db->prepare('SELECT t.*, a.email as account_email FROM inbox_threads t JOIN email_accounts a ON t.account_id = a.id WHERE t.account_id = ? ORDER BY t.received_at DESC LIMIT 100');
        $stmt->execute([$accountId]);
    } else {
        $stmt = $db->query('SELECT t.*, a.email as account_email FROM inbox_threads t JOIN email_accounts a ON t.account_id = a.id ORDER BY t.received_at DESC LIMIT 200');
    }
    ok($stmt->fetchAll());
}

// POST ?action=sync&account_id=X — sync inbox from IMAP
elseif ($method === 'POST' && $action === 'sync') {
    $accountId = (int)($_GET['account_id'] ?? 0);
    if (!$accountId) fail('account_id required');

    $accStmt = $db->prepare('SELECT * FROM email_accounts WHERE id = ?');
    $accStmt->execute([$accountId]);
    $account = $accStmt->fetch();
    if (!$account || !$account['imap_host']) fail('Account or IMAP not configured');

    $pass    = decrypt($account['smtp_pass']);
    $mailbox = '{' . $account['imap_host'] . ':' . $account['imap_port'] . '/imap/ssl}INBOX';

    if (!function_exists('imap_open')) fail('PHP IMAP extension not available on this server');

    $imap = @imap_open($mailbox, $account['smtp_user'], $pass);
    if (!$imap) fail('IMAP connect failed: ' . imap_last_error());

    $emails = imap_search($imap, 'ALL');
    $synced = 0;
    if ($emails) {
        // Get most recent 50
        $emails = array_slice(array_reverse($emails), 0, 50);
        $insert = $db->prepare('INSERT IGNORE INTO inbox_threads (account_id, message_id, from_email, from_name, subject, body_html, body_text, received_at, imap_uid) VALUES (?,?,?,?,?,?,?,?,?)');

        foreach ($emails as $uid) {
            $header  = imap_headerinfo($imap, $uid);
            $body    = imap_fetchbody($imap, $uid, 1);
            $msgId   = trim($header->message_id ?? uniqid('imap_'));
            $fromObj = $header->from[0] ?? null;
            $fromEmail = $fromObj ? ($fromObj->mailbox . '@' . $fromObj->host) : '';
            $fromName  = $fromObj ? imap_utf8($fromObj->personal ?? '') : '';
            $subject   = imap_utf8($header->subject ?? '(no subject)');
            $date      = date('Y-m-d H:i:s', strtotime($header->date ?? 'now'));

            $insert->execute([$accountId, $msgId, $fromEmail, $fromName, $subject, $body, strip_tags($body), $date, $uid]);
            $synced++;
        }
    }
    imap_close($imap);
    ok(['synced' => $synced], "$synced messages synced");
}

// POST ?action=reply — send a reply
elseif ($method === 'POST' && $action === 'reply') {
    $b = body();
    foreach (['account_id','to_email','subject','body_html'] as $f) {
        if (empty($b[$f])) fail("Missing: $f");
    }
    $result = sendEmail((int)$b['account_id'], $b['to_email'], $b['to_name'] ?? '', $b['subject'], $b['body_html']);
    if ($result['success']) ok(null, 'Reply sent');
    else fail('Send failed: ' . $result['error']);
}

// PUT ?id=X — mark read/starred
elseif ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    $b = body();
    $fields = [];
    $vals   = [];
    if (isset($b['is_read']))    { $fields[] = 'is_read=?';    $vals[] = (int)$b['is_read']; }
    if (isset($b['is_starred'])) { $fields[] = 'is_starred=?'; $vals[] = (int)$b['is_starred']; }
    if (!$fields) fail('Nothing to update');
    $vals[] = $id;
    $db->prepare('UPDATE inbox_threads SET ' . implode(',', $fields) . ' WHERE id=?')->execute($vals);
    ok(null, 'Updated');
}

// DELETE ?id=X
elseif ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $db->prepare('DELETE FROM inbox_threads WHERE id = ?')->execute([$id]);
    ok(null, 'Deleted');
}

else { fail('Unknown action', 404); }
