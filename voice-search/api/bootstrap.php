<?php
/**
 * Shared helpers: config, JSON output, origin check, rate limit, PDO.
 */
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'bootstrap.php') { http_response_code(403); exit; }

$CFG = require __DIR__ . '/config.php';

function vs_json($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Allow only our own site to call these endpoints (blocks token theft from other sites). */
function vs_check_origin(array $cfg): void
{
    $origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $allowed = $cfg['allowed_origins'];

    if ($origin !== '') {
        if (!in_array(rtrim($origin, '/'), $allowed, true)) vs_json(['error' => 'origin_not_allowed'], 403);
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        return;
    }
    // Same-origin GET requests may omit Origin — fall back to Referer.
    foreach ($allowed as $a) {
        if ($referer !== '' && strpos($referer, $a . '/') === 0) return;
    }
    vs_json(['error' => 'origin_not_allowed'], 403);
}

/** Simple file-based sliding-window rate limit per IP. */
function vs_rate_limit(string $bucket, int $max, int $windowSec): void
{
    $ip   = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $file = sys_get_temp_dir() . '/vs_rl_' . $bucket . '_' . hash('sha256', $ip) . '.json';
    $now  = time();

    $fh = @fopen($file, 'c+');
    if (!$fh) return; // fail open rather than break search
    flock($fh, LOCK_EX);
    $hits = json_decode(stream_get_contents($fh) ?: '[]', true) ?: [];
    $hits = array_values(array_filter($hits, fn($t) => $t > $now - $windowSec));

    if (count($hits) >= $max) {
        flock($fh, LOCK_UN); fclose($fh);
        header('Retry-After: ' . $windowSec);
        vs_json(['error' => 'rate_limited', 'message' => 'Too many requests, please try again shortly.'], 429);
    }
    $hits[] = $now;
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, json_encode($hits));
    flock($fh, LOCK_UN); fclose($fh);
}

function vs_pdo(array $cfg): PDO
{
    $d = $cfg['db'];
    $dsn = "mysql:host={$d['host']};port={$d['port']};dbname={$d['name']};charset={$d['charset']}";
    return new PDO($dsn, $d['user'], $d['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => true,  // allows re-using a named placeholder; safe with utf8mb4 DSN charset
    ]);
}

/** Indian price label: 649000 → ₹6.49 L, 12500000 → ₹1.25 Cr */
function vs_inr(?float $p): string
{
    if (!$p) return '';
    if ($p >= 10000000) return '₹' . rtrim(rtrim(number_format($p / 10000000, 2), '0'), '.') . ' Cr';
    if ($p >= 100000)   return '₹' . rtrim(rtrim(number_format($p / 100000, 2), '0'), '.') . ' L';
    return '₹' . number_format($p);
}
