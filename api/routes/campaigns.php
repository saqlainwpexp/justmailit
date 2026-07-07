<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/response.php';

cors();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$db     = db();

// GET — list campaigns
if ($method === 'GET' && !isset($_GET['id'])) {
    $rows = $db->query('SELECT c.*, a.email as from_email FROM campaigns c LEFT JOIN email_accounts a ON c.from_account_id = a.id ORDER BY c.created_at DESC')->fetchAll();
    ok($rows);
}

// GET ?id=X — single campaign
elseif ($method === 'GET' && isset($_GET['id'])) {
    $stmt = $db->prepare('SELECT * FROM campaigns WHERE id = ?');
    $stmt->execute([(int)$_GET['id']]);
    $row = $stmt->fetch();
    if (!$row) fail('Not found', 404);
    ok($row);
}

// POST — create campaign
elseif ($method === 'POST' && $action === '') {
    $b = body();
    foreach (['name','subject','body_html','from_account_id'] as $f) {
        if (empty($b[$f])) fail("Missing: $f");
    }
    $stmt = $db->prepare('INSERT INTO campaigns (name, subject, body_html, body_text, from_account_id, status, scheduled_at) VALUES (?,?,?,?,?,?,?)');
    $stmt->execute([
        $b['name'], $b['subject'], $b['body_html'], $b['body_text'] ?? '',
        (int)$b['from_account_id'],
        $b['status'] ?? 'draft',
        $b['scheduled_at'] ?? null,
    ]);
    ok(['id' => $db->lastInsertId()], 'Campaign created');
}

// POST ?action=send&id=X — queue campaign for sending
elseif ($method === 'POST' && $action === 'send') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) fail('Missing campaign id');

    $camp = $db->prepare('SELECT * FROM campaigns WHERE id = ?');
    $camp->execute([$id]);
    $campaign = $camp->fetch();
    if (!$campaign) fail('Campaign not found', 404);

    // Get all subscribed contacts
    $contacts = $db->query("SELECT id, email, first_name, last_name FROM contacts WHERE status = 'subscribed'")->fetchAll();
    if (empty($contacts)) fail('No subscribed contacts to send to');

    $insertQ = $db->prepare('INSERT INTO send_queue (account_id, to_email, to_name, subject, body_html, campaign_id, scheduled_at) VALUES (?,?,?,?,?,?,NOW())');
    $count = 0;
    foreach ($contacts as $c) {
        // Replace merge tags
        $subject = str_replace(['{{first_name}}','{{last_name}}','{{email}}'], [$c['first_name'],$c['last_name'],$c['email']], $campaign['subject']);
        $body    = str_replace(['{{first_name}}','{{last_name}}','{{email}}'], [$c['first_name'],$c['last_name'],$c['email']], $campaign['body_html']);
        $insertQ->execute([$campaign['from_account_id'], $c['email'], trim($c['first_name'] . ' ' . $c['last_name']), $subject, $body, $id]);
        $count++;
    }

    $db->prepare("UPDATE campaigns SET status='sending', recipient_count=? WHERE id=?")->execute([$count, $id]);
    ok(['queued' => $count], "$count emails queued");
}

// PUT ?id=X — update campaign
elseif ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    $b = body();
    $stmt = $db->prepare('UPDATE campaigns SET name=?, subject=?, body_html=?, body_text=?, from_account_id=?, status=?, scheduled_at=? WHERE id=?');
    $stmt->execute([$b['name'], $b['subject'], $b['body_html'], $b['body_text'] ?? '', (int)$b['from_account_id'], $b['status'], $b['scheduled_at'] ?? null, $id]);
    ok(null, 'Campaign updated');
}

// DELETE
elseif ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $db->prepare('DELETE FROM campaigns WHERE id = ?')->execute([$id]);
    ok(null, 'Campaign deleted');
}

else { fail('Unknown action', 404); }
