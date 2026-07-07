<?php
require_once __DIR__ . '/../config/config.php';

function encrypt(string $plain): string {
    $iv  = random_bytes(16);
    $key = substr(hash('sha256', ENCRYPT_KEY, true), 0, 32);
    $enc = openssl_encrypt($plain, 'AES-256-CBC', $key, 0, $iv);
    return base64_encode($iv . $enc);
}

function decrypt(string $cipher): string {
    $raw  = base64_decode($cipher);
    $iv   = substr($raw, 0, 16);
    $enc  = substr($raw, 16);
    $key  = substr(hash('sha256', ENCRYPT_KEY, true), 0, 32);
    return openssl_decrypt($enc, 'AES-256-CBC', $key, 0, $iv) ?: '';
}
