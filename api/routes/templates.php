<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/response.php';

cors();
$method = $_SERVER['REQUEST_METHOD'];
$db     = db();

if ($method === 'GET') {
    ok($db->query('SELECT * FROM templates ORDER BY updated_at DESC')->fetchAll());
}
elseif ($method === 'POST') {
    $b = body();
    foreach (['name','subject','body_html'] as $f) if (empty($b[$f])) fail("$f required");
    $stmt = $db->prepare('INSERT INTO templates (name, subject, body_html, body_text, category) VALUES (?,?,?,?,?)');
    $stmt->execute([$b['name'], $b['subject'], $b['body_html'], $b['body_text'] ?? '', $b['category'] ?? '']);
    ok(['id' => $db->lastInsertId()], 'Template created');
}
elseif ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    $b = body();
    $db->prepare('UPDATE templates SET name=?, subject=?, body_html=?, body_text=?, category=?, updated_at=NOW() WHERE id=?')
       ->execute([$b['name'], $b['subject'], $b['body_html'], $b['body_text'] ?? '', $b['category'] ?? '', $id]);
    ok(null, 'Template updated');
}
elseif ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $db->prepare('DELETE FROM templates WHERE id = ?')->execute([$id]);
    ok(null, 'Template deleted');
}
else { fail('Unknown action', 404); }
