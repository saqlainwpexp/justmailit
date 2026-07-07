<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/crypto.php';

/**
 * Send an email via the stored SMTP account.
 * Returns ['success' => bool, 'message_id' => string|null, 'error' => string|null]
 */
function sendEmail(int $accountId, string $toEmail, string $toName, string $subject, string $bodyHtml, string $bodyText = ''): array {
    $db  = db();
    $acc = $db->prepare('SELECT * FROM email_accounts WHERE id = ?');
    $acc->execute([$accountId]);
    $account = $acc->fetch();

    if (!$account) return ['success' => false, 'error' => 'Account not found'];

    $smtpPass = decrypt($account['smtp_pass']);
    $messageId = '<' . uniqid('eit_', true) . '@' . parse_url('http://' . $account['smtp_host'], PHP_URL_HOST) . '>';

    // Build raw MIME message using PHP's native sockets via SMTP
    // Using a minimal SMTP implementation (no Composer dependency for shared hosting)
    try {
        $socket = fsockopen(
            'ssl://' . $account['smtp_host'],
            (int)$account['smtp_port'],
            $errno, $errstr, 10
        );

        if (!$socket) {
            // Try TLS on port 587 as fallback
            $socket = fsockopen(
                $account['smtp_host'],
                587, $errno, $errstr, 10
            );
            if (!$socket) {
                return ['success' => false, 'error' => "SMTP connect failed: $errstr ($errno)"];
            }
        }

        $read = fgets($socket, 515);
        if (substr($read, 0, 3) !== '220') {
            fclose($socket);
            return ['success' => false, 'error' => "SMTP greeting failed: $read"];
        }

        $domain = gethostname() ?: 'localhost';
        $cmds = [
            "EHLO $domain",
            "AUTH LOGIN",
            base64_encode($account['smtp_user']),
            base64_encode($smtpPass),
            "MAIL FROM:<{$account['email']}>",
            "RCPT TO:<$toEmail>",
            "DATA",
        ];

        foreach ($cmds as $i => $cmd) {
            fwrite($socket, $cmd . "\r\n");
            $resp = fgets($socket, 515);
            // AUTH LOGIN expects 334 for username/password prompts
            $ok = in_array((int)substr($resp, 0, 3), [220, 235, 250, 251, 334, 354]);
            if (!$ok) {
                fclose($socket);
                return ['success' => false, 'error' => "SMTP cmd '$cmd' failed: $resp"];
            }
        }

        // Build email headers + body
        $headers  = "From: {$account['email']}\r\n";
        $headers .= "To: $toName <$toEmail>\r\n";
        $headers .= "Subject: $subject\r\n";
        $headers .= "Message-ID: $messageId\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: multipart/alternative; boundary=\"emailit_boundary\"\r\n";
        $headers .= "Date: " . date('r') . "\r\n\r\n";

        $body  = "--emailit_boundary\r\n";
        $body .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
        $body .= ($bodyText ?: strip_tags($bodyHtml)) . "\r\n";
        $body .= "--emailit_boundary\r\n";
        $body .= "Content-Type: text/html; charset=UTF-8\r\n\r\n";
        $body .= $bodyHtml . "\r\n";
        $body .= "--emailit_boundary--\r\n";

        fwrite($socket, $headers . $body . "\r\n.\r\n");
        $resp = fgets($socket, 515);

        fwrite($socket, "QUIT\r\n");
        fclose($socket);

        if ((int)substr($resp, 0, 3) !== 250) {
            return ['success' => false, 'error' => "SMTP DATA failed: $resp"];
        }

        // Increment sent_today counter
        $db->prepare('UPDATE email_accounts SET sent_today = sent_today + 1, last_reset_date = CURDATE() WHERE id = ?')
           ->execute([$accountId]);

        return ['success' => true, 'message_id' => $messageId];

    } catch (Throwable $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}
