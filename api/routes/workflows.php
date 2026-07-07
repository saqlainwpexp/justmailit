<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/response.php';

cors();
$method = $_SERVER['REQUEST_METHOD'];
$db     = db();

// GET — list
if ($method === 'GET' && !isset($_GET['id'])) {
    $rows = $db->query('SELECT * FROM workflows ORDER BY created_at DESC')->fetchAll();
    foreach ($rows as &$r) $r['steps'] = json_decode($r['steps'], true);
    ok($rows);
}

// GET ?id=X — single
elseif ($method === 'GET') {
    $stmt = $db->prepare('SELECT * FROM workflows WHERE id = ?');
    $stmt->execute([(int)$_GET['id']]);
    $row = $stmt->fetch();
    if (!$row) fail('Not found', 404);
    $row['steps'] = json_decode($row['steps'], true);
    ok($row);
}

// POST — create
elseif ($method === 'POST') {
    $b = body();
    if (empty($b['name'])) fail('name required');
    $stmt = $db->prepare('INSERT INTO workflows (name, status, trigger_type, trigger_config, steps) VALUES (?,?,?,?,?)');
    $stmt->execute([
        $b['name'],
        $b['status'] ?? 'draft',
        $b['trigger_type'] ?? 'manual',
        json_encode($b['trigger_config'] ?? []),
        json_encode($b['steps'] ?? []),
    ]);
    ok(['id' => $db->lastInsertId()], 'Workflow created');
}

// PUT — update (saves entire workflow including steps from canvas)
elseif ($method === 'PUT') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) fail('Missing id');
    $b = body();
    $stmt = $db->prepare('UPDATE workflows SET name=?, status=?, trigger_type=?, trigger_config=?, steps=?, updated_at=NOW() WHERE id=?');
    $stmt->execute([
        $b['name'], $b['status'] ?? 'draft',
        $b['trigger_type'] ?? 'manual',
        json_encode($b['trigger_config'] ?? []),
        json_encode($b['steps'] ?? []),
        $id,
    ]);
    ok(null, 'Workflow saved');
}

// POST ?action=enroll&id=X — enroll a contact
elseif ($method === 'POST' && ($_GET['action'] ?? '') === 'enroll') {
    $b = body();
    $wfId = (int)($_GET['id'] ?? 0);
    $contactId = (int)($b['contact_id'] ?? 0);
    if (!$wfId || !$contactId) fail('workflow_id and contact_id required');

    // Get workflow to calculate first step delay
    $wf = $db->prepare('SELECT steps FROM workflows WHERE id = ?');
    $wf->execute([$wfId]);
    $workflow = $wf->fetch();
    $steps = json_decode($workflow['steps'] ?? '[]', true);
    $firstDelay = $steps[0]['delay_hours'] ?? 0;
    $nextSend = date('Y-m-d H:i:s', strtotime("+{$firstDelay} hours"));

    $stmt = $db->prepare('INSERT IGNORE INTO workflow_enrollments (workflow_id, contact_id, current_step, status, next_send_at) VALUES (?,?,0,"active",?)');
    $stmt->execute([$wfId, $contactId, $nextSend]);
    $db->prepare('UPDATE workflows SET enrolled_count = enrolled_count + 1 WHERE id = ?')->execute([$wfId]);
    ok(null, 'Contact enrolled');
}

// DELETE
elseif ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    $db->prepare('DELETE FROM workflows WHERE id = ?')->execute([$id]);
    ok(null, 'Workflow deleted');
}

else { fail('Unknown action', 404); }
