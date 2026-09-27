<?php
/**
 * Voice Search — configuration (edit this file only)
 * Keep real secrets in server env vars, not in this file, when possible.
 */
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'config.php') { http_response_code(403); exit; }

return [

    /* ── OpenAI ─────────────────────────────────────────────── */
    // Recommended: SetEnv OPENAI_API_KEY sk-... in the Apache vhost / php-fpm pool.
    'openai_api_key'      => getenv('OPENAI_API_KEY') ?: 'sk-REPLACE_ME',
    'model'               => 'gpt-realtime-2.1',      // speech-to-speech model
    'voice'               => 'marin',                 // marin, cedar, alloy, ash, ballad, coral, echo, sage, shimmer, verse
    'transcription_model' => 'gpt-4o-mini-transcribe',// only used to SHOW what the user said
    'token_ttl'           => 120,                     // seconds the ephemeral key stays valid to START a call
    'max_output_tokens'   => 350,                     // caps spoken reply length (cost control)

    /* ── Site ───────────────────────────────────────────────── */
    'site_name'  => '[Brand]',
    'site_about' => 'an Indian automotive portal for new cars and bikes: prices, variants, on-road price, comparisons and reviews',

    // Only these origins may request a voice token (add www + non-www + staging)
    'allowed_origins' => [
        'https://www.example.com',
        'https://example.com',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
    ],

    /* ── Abuse protection (per IP) ──────────────────────────── */
    'rate_limit_sessions_per_hour' => 15,
    'rate_limit_searches_per_min'  => 60,

    /* ── MySQL ──────────────────────────────────────────────── */
    'db' => [
        'host'    => '127.0.0.1',
        'port'    => 3306,
        'name'    => 'your_database',
        'user'    => 'your_db_user',
        'pass'    => getenv('DB_PASS') ?: 'your_db_password',
        'charset' => 'utf8mb4',
    ],

    /* ── Search ─────────────────────────────────────────────── */
    'search' => [
        'table'        => 'vehicles',   // see sql/install.sql
        'use_fulltext' => true,         // false = LIKE-only (if you can't add a FULLTEXT index)
        'max_results'  => 6,
        // Page URL used when a row has no `url` value. {id} is replaced.
        // Prototype: every model routes to the anchor model pages. On the live site use e.g. '/cars/{id}'.
        'url_pattern'  => [
            'car'  => '/model-page.html?model={id}',
            'bike' => '/bike-model-page.html?model={id}',
        ],
    ],
];
