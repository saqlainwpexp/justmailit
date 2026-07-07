<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/response.php';

cors();
$method = $_SERVER['REQUEST_METHOD'];
$db     = db();

if ($method === 'GET') {
    ok($db->query('SELECT * FROM domains ORDER BY created_at DESC')->fetchAll());
}
elseif ($method === 'POST') {
    $b = body();
    if (empty($b['domain'])) fail('domain required');
    $stmt = $db->prepare('INSERT INTO domains (domain) VALUES (?) ON DUPLICATE KEY UPDATE domain=domain');
    $stmt->execute([strtolower(trim($b['domain']))]);
    ok(['id' => $db->lastInsertId()], 'Domain added');
}
elseif ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    $b  = body();
    $db->prepare('UPDATE domains SET spf_status=?, dkim_status=?, dmarc_status=? WHERE id=?')
       ->execute([$b['spf_status'] ?? 'pending', $b['dkim_status'] ?? 'pending', $b['dmarc_status'] ?? 'pending', $id]);
    ok(null, 'Domain updated');
}
elseif ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $db->prepare('DELETE FROM domains WHERE id = ?')->execute([$id]);
    ok(null, 'Domain deleted');
}
else { fail('Unknown action', 404); }
