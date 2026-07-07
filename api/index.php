<?php
/**
 * Emailit API Router
 * All requests go through /api/index.php
 * Configure .htaccess to route /api/* here
 */

require_once __DIR__ . '/helpers/response.php';

$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri    = preg_replace('#^/api#', '', $uri);
$uri    = trim($uri, '/');
$parts  = explode('/', $uri);
$route  = $parts[0] ?? '';

$allowed = ['accounts', 'contacts', 'campaigns', 'workflows', 'inbox', 'stats', 'domains', 'templates'];

if (in_array($route, $allowed)) {
    require_once __DIR__ . '/routes/' . $route . '.php';
} else {
    cors();
    fail('API route not found: ' . $route, 404);
}
