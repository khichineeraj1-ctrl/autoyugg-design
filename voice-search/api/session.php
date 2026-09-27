<?php
/**
 * POST /api/session.php
 * Mints a short-lived OpenAI Realtime client secret for the browser.
 * The real API key never leaves the server.
 *
 * Body (JSON, optional): { "city": "mumbai", "category": "cars" | "bikes", "page": "model-page" }
 * Returns: { "value": "ek_...", "expires_at": 1234567890, "model": "gpt-realtime-2.1" }
 */
require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { vs_check_origin($CFG); header('Access-Control-Allow-Methods: POST'); header('Access-Control-Allow-Headers: Content-Type'); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') vs_json(['error' => 'method_not_allowed'], 405);

vs_check_origin($CFG);
vs_rate_limit('session', (int)$CFG['rate_limit_sessions_per_hour'], 3600);

if (strpos($CFG['openai_api_key'], 'REPLACE_ME') !== false) vs_json(['error' => 'server_not_configured'], 500);

// ── Optional page context from the browser (sanitised) ──
$in       = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$clean    = fn($v, $n = 40) => substr(preg_replace('/[^a-z0-9 \-]/i', '', (string)$v), 0, $n);
$city     = $clean($in['city'] ?? '');
$category = in_array($in['category'] ?? '', ['cars', 'bikes'], true) ? $in['category'] : '';
$page     = $clean($in['page'] ?? '', 60);

// ── Assistant behaviour ──
$site = $CFG['site_name'];
$instructions = <<<TXT
You are the voice search assistant for {$site}, {$CFG['site_about']}.
Users speak English, Hindi or Hinglish. Reply in the SAME language and style the user used.

HOW TO WORK
- For ANY question about vehicles, prices, models, brands, budgets, mileage or recommendations, call search_vehicles first. Never invent prices, specs or models; only use what the tool returns.
- Convert spoken Indian amounts to rupees: "10 lakh" = 1000000, "1.5 crore" = 15000000, "80 hazaar/thousand" = 80000.
- "Under X" means max_price = X. "Around X" means min_price = 0.85X and max_price = 1.15X.
- Map words: gaadi/car = type car; bike/scooty/scooter/motorcycle = type bike; "automatic" = transmission automatic; "EV/electric" = fuel Electric; "CNG" = fuel CNG.
- If the user names a specific model, pass it as query.
- If the user says "open", "show me", "details of" a result, call open_vehicle_page with that result's id.

HOW TO SPEAK
- Results are already shown on screen, so be brief: 1–3 short sentences, max ~35 words.
- Mention the top 2–3 matches with price range, e.g. "Swift from 6.5 lakh". Say "lakh"/"crore", never read out long digits or URLs.
- If nothing matches, say so and suggest widening the budget or filters.
- Only discuss vehicles and this website. Politely decline anything unrelated.
TXT;
if ($city)     $instructions .= "\nUser's city: {$city} (use it only when they ask about on-road price or dealers).";
if ($category) $instructions .= "\nUser is currently browsing {$category}; assume that type unless they say otherwise.";
if ($page)     $instructions .= "\nCurrent page: {$page}.";

$tools = [
    [
        'type'        => 'function',
        'name'        => 'search_vehicles',
        'description' => 'Search the site vehicle catalogue (cars and bikes). Returns matching models with price range, specs and page id.',
        'parameters'  => [
            'type'       => 'object',
            'properties' => [
                'query'        => ['type' => 'string',  'description' => 'Free text: model, brand or keywords e.g. "hunter 350", "family suv", "sunroof"'],
                'type'         => ['type' => 'string',  'enum' => ['car', 'bike']],
                'brand'        => ['type' => 'string',  'description' => 'e.g. Tata, Maruti Suzuki, Royal Enfield'],
                'body'         => ['type' => 'string',  'description' => 'e.g. Hatchback, Sedan, SUV, Compact SUV, MPV, Scooter, Cruiser, Sports'],
                'fuel'         => ['type' => 'string',  'enum' => ['Petrol', 'Diesel', 'CNG', 'Electric', 'Hybrid']],
                'transmission' => ['type' => 'string',  'enum' => ['manual', 'automatic']],
                'min_price'    => ['type' => 'number',  'description' => 'Minimum ex-showroom price in rupees'],
                'max_price'    => ['type' => 'number',  'description' => 'Maximum ex-showroom price in rupees'],
                'min_seats'    => ['type' => 'integer'],
                'sort'         => ['type' => 'string',  'enum' => ['relevance', 'price_low', 'price_high', 'mileage', 'rating']],
            ],
        ],
    ],
    [
        'type'        => 'function',
        'name'        => 'open_vehicle_page',
        'description' => 'Navigate the user to a vehicle page. Only use an id returned by search_vehicles.',
        'parameters'  => [
            'type'       => 'object',
            'properties' => ['id' => ['type' => 'string']],
            'required'   => ['id'],
        ],
    ],
];

$payload = [
    'expires_after' => ['anchor' => 'created_at', 'seconds' => max(10, (int)$CFG['token_ttl'])],
    'session' => [
        'type'              => 'realtime',
        'model'             => $CFG['model'],
        'instructions'      => $instructions,
        'max_output_tokens' => (int)$CFG['max_output_tokens'],
        'tools'             => $tools,
        'tool_choice'       => 'auto',
        'audio' => [
            'input' => [
                'noise_reduction' => ['type' => 'near_field'],
                'transcription'   => ['model' => $CFG['transcription_model']],
                'turn_detection'  => ['type' => 'semantic_vad', 'eagerness' => 'high'],
            ],
            'output' => ['voice' => $CFG['voice']],
        ],
    ],
];

// ── Call OpenAI ──
$ch = curl_init('https://api.openai.com/v1/realtime/client_secrets');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . $CFG['openai_api_key'],
        'Content-Type: application/json',
    ],
    CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
]);
$raw  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

if ($raw === false || $code >= 400) {
    error_log('[voice-search] client_secrets failed: HTTP ' . $code . ' ' . $err . ' ' . substr((string)$raw, 0, 500));
    vs_json(['error' => 'upstream_error', 'status' => $code], 502);
}

$data = json_decode($raw, true) ?: [];
// Response shape: { value, expires_at, session } — tolerate older/nested shapes too
$value = $data['value'] ?? ($data['client_secret']['value'] ?? ($data['client_secret'] ?? null));
if (!is_string($value) || $value === '') vs_json(['error' => 'bad_upstream_response'], 502);

vs_json([
    'value'      => $value,
    'expires_at' => $data['expires_at'] ?? ($data['client_secret']['expires_at'] ?? null),
    'model'      => $CFG['model'],
]);
