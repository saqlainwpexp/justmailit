<?php
/**
 * Emailit — Automation Queue Processor
 *
 * Run this via Hostinger cron every 1 minute:
 * * * * * * GET https://yourdomain.com/api/cron/process_queue.php?secret=YOUR_CRON_SECRET
 *
 * Or as a CLI cron:
 * * * * * php /path/to/api/cron/process_queue.php
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../helpers/mailer.php';

// Auth check when run via HTTP
if (php_sapi_name() !== 'cli') {
    $secret = $_GET['secret'] ?? '';
    if ($secret !== CRON_SECRET) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }
}

$db    = db();
$start = microtime(true);
$sent  = 0;
$failed = 0;

// 1. Reset sent_today counter at midnight for accounts where date has changed
$db->exec("UPDATE email_accounts SET sent_today = 0 WHERE last_reset_date < CURDATE() OR last_reset_date IS NULL");

// 2. Process pending send_queue items (respecting daily limits)
$pending = $db->query("
    SELECT q.*, a.daily_limit, a.sent_today
    FROM send_queue q
    JOIN email_accounts a ON q.account_id = a.id
    WHERE q.status = 'pending'
      AND q.scheduled_at <= NOW()
      AND a.sent_today < a.daily_limit
    ORDER BY q.scheduled_at ASC
    LIMIT " . (int)CRON_BATCH_SIZE
)->fetchAll();

foreach ($pending as $item) {
    // Mark as sending to prevent double-processing
    $db->prepare("UPDATE send_queue SET status = 'sending' WHERE id = ? AND status = 'pending'")->execute([$item['id']]);

    $result = sendEmail(
        (int)$item['account_id'],
        $item['to_email'],
        $item['to_name'] ?? '',
        $item['subject'],
        $item['body_html'],
        $item['body_text'] ?? ''
    );

    if ($result['success']) {
        $db->prepare("UPDATE send_queue SET status='sent', sent_at=NOW(), message_id=? WHERE id=?")->execute([$result['message_id'], $item['id']]);

        // Update campaign delivered count
        if ($item['campaign_id']) {
            $db->prepare("UPDATE campaigns SET delivered_count = delivered_count + 1 WHERE id = ?")->execute([$item['campaign_id']]);
        }

        // Advance workflow enrollment to next step
        if ($item['enrollment_id'] !== null) {
            advanceEnrollment((int)$item['enrollment_id'], $db);
        }

        $sent++;
    } else {
        $db->prepare("UPDATE send_queue SET status='failed', error_message=? WHERE id=?")->execute([$result['error'], $item['id']]);
        $failed++;
    }
}

// 3. Process workflow enrollments due now
$enrollments = $db->query("
    SELECT e.*, w.steps, c.email, c.first_name, c.last_name, w.name as workflow_name
    FROM workflow_enrollments e
    JOIN workflows w ON e.workflow_id = w.id
    JOIN contacts c ON e.contact_id = c.id
    WHERE e.status = 'active'
      AND e.next_send_at <= NOW()
      AND w.status = 'active'
    LIMIT 50
")->fetchAll();

foreach ($enrollments as $enr) {
    $steps     = json_decode($enr['steps'], true) ?? [];
    $stepIndex = (int)$enr['current_step'];

    if (!isset($steps[$stepIndex])) {
        // Completed all steps
        $db->prepare("UPDATE workflow_enrollments SET status='completed', completed_at=NOW() WHERE id=?")->execute([$enr['id']]);
        continue;
    }

    $step = $steps[$stepIndex];

    if ($step['type'] === 'email' && !empty($step['config']['account_id']) && !empty($step['config']['subject'])) {
        $subject = str_replace(['{{first_name}}','{{email}}'], [$enr['first_name'], $enr['email']], $step['config']['subject']);
        $body    = str_replace(['{{first_name}}','{{email}}'], [$enr['first_name'], $enr['email']], $step['config']['body_html'] ?? '');

        // Queue the email for immediate send
        $db->prepare("INSERT INTO send_queue (account_id, to_email, to_name, subject, body_html, workflow_id, enrollment_id, step_index, scheduled_at) VALUES (?,?,?,?,?,?,?,?,NOW())")
           ->execute([$step['config']['account_id'], $enr['email'], $enr['first_name'], $subject, $body, $enr['workflow_id'], $enr['id'], $stepIndex]);
    }

    // Advance to next step (set next_send_at based on delay)
    advanceEnrollment((int)$enr['id'], $db);
}

$elapsed = round(microtime(true) - $start, 3);
$msg = "Queue processed in {$elapsed}s — sent: {$sent}, failed: {$failed}, enrollments checked: " . count($enrollments);
echo json_encode(['status' => 'ok', 'message' => $msg, 'sent' => $sent, 'failed' => $failed]);


function advanceEnrollment(int $enrollmentId, PDO $db): void {
    $enr = $db->prepare('SELECT e.*, w.steps FROM workflow_enrollments e JOIN workflows w ON e.workflow_id = w.id WHERE e.id = ?');
    $enr->execute([$enrollmentId]);
    $e = $enr->fetch();
    if (!$e) return;

    $steps     = json_decode($e['steps'], true) ?? [];
    $nextStep  = (int)$e['current_step'] + 1;

    if (!isset($steps[$nextStep])) {
        $db->prepare("UPDATE workflow_enrollments SET status='completed', completed_at=NOW() WHERE id=?")->execute([$enrollmentId]);
        return;
    }

    $delayHours = (int)($steps[$nextStep]['delay_hours'] ?? 0);
    $nextSend   = date('Y-m-d H:i:s', strtotime("+{$delayHours} hours"));
    $db->prepare("UPDATE workflow_enrollments SET current_step=?, next_send_at=? WHERE id=?")->execute([$nextStep, $nextSend, $enrollmentId]);
}
