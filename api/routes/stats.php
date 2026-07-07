<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../helpers/response.php';

cors();
method('GET');
$db = db();

$stats = [
    'delivered'   => (int)$db->query("SELECT COALESCE(SUM(delivered_count),0) FROM campaigns")->fetchColumn(),
    'opened'      => (int)$db->query("SELECT COUNT(*) FROM email_events WHERE event_type='opened'")->fetchColumn(),
    'clicked'     => (int)$db->query("SELECT COUNT(*) FROM email_events WHERE event_type='clicked'")->fetchColumn(),
    'subscribers' => (int)$db->query("SELECT COUNT(*) FROM contacts WHERE status='subscribed'")->fetchColumn(),
    'campaigns'   => (int)$db->query("SELECT COUNT(*) FROM campaigns")->fetchColumn(),
    'accounts'    => (int)$db->query("SELECT COUNT(*) FROM email_accounts WHERE status='connected'")->fetchColumn(),
    'queued'      => (int)$db->query("SELECT COUNT(*) FROM send_queue WHERE status='pending'")->fetchColumn(),
];

// Monthly chart data (last 6 months)
$chart = $db->query("
    SELECT DATE_FORMAT(sent_at, '%b') as month, COUNT(*) as sent
    FROM send_queue
    WHERE status = 'sent' AND sent_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY DATE_FORMAT(sent_at, '%Y-%m')
    ORDER BY sent_at ASC
")->fetchAll();

ok(['stats' => $stats, 'chart' => $chart]);
