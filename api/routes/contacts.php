<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/response.php';

cors();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// GET — list or search
if ($method === 'GET') {
    $search = '%' . ($_GET['q'] ?? '') . '%';
    $tag    = $_GET['tag'] ?? '';
    $sql    = 'SELECT * FROM contacts WHERE (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
    $params = [$search, $search, $search];
    if ($tag) {
        $sql .= ' AND JSON_CONTAINS(tags, ?)';
        $params[] = json_encode($tag);
    }
    $sql .= ' ORDER BY created_at DESC LIMIT 500';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
        $r['tags'] = json_decode($r['tags'] ?? '[]', true);
        $r['custom_fields'] = json_decode($r['custom_fields'] ?? '{}', true);
    }
    ok($rows);
}

// POST — create or import
elseif ($method === 'POST' && $action === '') {
    $b = body();
    if (empty($b['email'])) fail('email is required');
    $stmt = db()->prepare('INSERT INTO contacts (email, first_name, last_name, company, tags, custom_fields) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE first_name=VALUES(first_name), last_name=VALUES(last_name), company=VALUES(company)');
    $stmt->execute([
        strtolower(trim($b['email'])),
        $b['first_name'] ?? '', $b['last_name'] ?? '',
        $b['company'] ?? '',
        json_encode($b['tags'] ?? []),
        json_encode($b['custom_fields'] ?? []),
    ]);
    ok(['id' => db()->lastInsertId()], 'Contact saved');
}

// POST ?action=import — bulk CSV import
elseif ($method === 'POST' && $action === 'import') {
    $b = body(); // expect { contacts: [{email, first_name, ...}] }
    if (empty($b['contacts']) || !is_array($b['contacts'])) fail('No contacts provided');
    $db   = db();
    $stmt = $db->prepare('INSERT IGNORE INTO contacts (email, first_name, last_name, company, tags) VALUES (?,?,?,?,?)');
    $count = 0;
    foreach ($b['contacts'] as $c) {
        if (empty($c['email'])) continue;
        $stmt->execute([
            strtolower(trim($c['email'])),
            $c['first_name'] ?? '', $c['last_name'] ?? '',
            $c['company'] ?? '',
            json_encode($c['tags'] ?? []),
        ]);
        $count++;
    }
    ok(['imported' => $count], "$count contacts imported");
}

// PUT — update contact
elseif ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) fail('Missing id');
    $b = body();
    $stmt = db()->prepare('UPDATE contacts SET first_name=?, last_name=?, company=?, status=?, tags=? WHERE id=?');
    $stmt->execute([$b['first_name'] ?? '', $b['last_name'] ?? '', $b['company'] ?? '', $b['status'] ?? 'subscribed', json_encode($b['tags'] ?? []), $id]);
    ok(null, 'Contact updated');
}

// DELETE
elseif ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) fail('Missing id');
    db()->prepare('DELETE FROM contacts WHERE id = ?')->execute([$id]);
    ok(null, 'Contact deleted');
}

else { fail('Unknown action', 404); }
