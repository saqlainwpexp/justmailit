<?php
require_once __DIR__ . '/../config/config.php';

function cors(): void {
    header('Access-Control-Allow-Origin: ' . CORS_ORIGIN);
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function json(mixed $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ok(mixed $data = null, string $message = 'ok'): void {
    json(['success' => true, 'message' => $message, 'data' => $data]);
}

function fail(string $message, int $status = 400): void {
    json(['success' => false, 'message' => $message], $status);
}

function body(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw, true) ?? [];
}

function method(string $expected): void {
    if ($_SERVER['REQUEST_METHOD'] !== strtoupper($expected)) {
        fail('Method not allowed', 405);
    }
}
