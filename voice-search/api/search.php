<?php
/**
 * GET /api/search.php?query=&type=&brand=&body=&fuel=&transmission=&min_price=&max_price=&min_seats=&sort=
 * Used by the voice assistant (tool call) AND usable by normal typed search / AJAX.
 * Returns: { count, results: [ {id,name,brand,type,body,fuel,price_min,price_max,price_label,mileage,rating,url,image_url,highlights[]} ] }
 */
require __DIR__ . '/bootstrap.php';

vs_check_origin($CFG);
vs_rate_limit('search', (int)$CFG['rate_limit_searches_per_min'], 60);

$S     = $CFG['search'];
$table = preg_replace('/[^a-z0-9_]/i', '', $S['table']);
$limit = max(1, min(20, (int)($_GET['limit'] ?? $S['max_results'])));

$get = fn($k, $n = 60) => trim(substr((string)($_GET[$k] ?? ''), 0, $n));
$q            = $get('query', 120);
$type         = in_array($get('type'), ['car', 'bike'], true) ? $get('type') : '';
$brand        = $get('brand');
$body         = $get('body');
$fuel         = $get('fuel');
$transmission = in_array($get('transmission'), ['manual', 'automatic'], true) ? $get('transmission') : '';
$minPrice     = is_numeric($_GET['min_price'] ?? null) ? (float)$_GET['min_price'] : null;
$maxPrice     = is_numeric($_GET['max_price'] ?? null) ? (float)$_GET['max_price'] : null;
$minSeats     = is_numeric($_GET['min_seats'] ?? null) ? (int)$_GET['min_seats'] : null;
$sort         = $get('sort') ?: 'relevance';

// ── Build filters ──
$where  = ['status = 1'];
$params = [];

if ($type)         { $where[] = 'type = :type';                 $params[':type'] = $type; }
if ($brand)        { $where[] = 'brand LIKE :brand';            $params[':brand'] = '%' . $brand . '%'; }
if ($body)         { $where[] = 'body LIKE :body';              $params[':body'] = '%' . $body . '%'; }
if ($fuel)         { $where[] = 'fuel LIKE :fuel';              $params[':fuel'] = '%' . $fuel . '%'; }
if ($transmission) { $where[] = 'FIND_IN_SET(:tr, transmission)'; $params[':tr'] = $transmission; }
// Price ranges overlap the model's variant range
if ($maxPrice !== null) { $where[] = 'price_min <= :maxp'; $params[':maxp'] = $maxPrice; }
if ($minPrice !== null) { $where[] = 'price_max >= :minp'; $params[':minp'] = $minPrice; }
if ($minSeats !== null) { $where[] = 'seats >= :seats';    $params[':seats'] = $minSeats; }

// ── Free-text tokens (drop filler words people say out loud) ──
$stop = ['a','an','the','i','me','my','want','need','show','find','search','for','with','and','or','of','in','to','under','below','above',
         'around','about','best','good','top','some','any','price','prices','lakh','lakhs','crore','rs','rupees','please','car','cars',
         'bike','bikes','gaadi','wali','ki','ka','ke','hai','chahiye','dikhao','batao','mujhe','se','kam','tak','which','what','is'];
$stop = array_merge($stop, ['sabse','achha','achhi','accha','acchi','zyada','jyada','wala','wali','wale','koi','kaunsi','konsi','kya','bhi','aur','naya','nayi','new','latest']);
// Spoken / Hinglish words → catalogue words
$syn  = ['scooty' => 'scooter', 'scootie' => 'scooter', 'activa' => 'activa', 'bullet' => 'royal enfield', 'enfield' => 'enfield',
         'ev' => 'electric', 'cheap' => 'affordable', 'sasta' => 'affordable', 'sasti' => 'affordable', 'mileage' => 'mileage',
         'parivar' => 'family', 'family' => 'family', 'maruti' => 'maruti', 'suzuki' => 'suzuki'];
$lower = mb_strtolower($q);
$saysMoney = (bool)preg_match('/lakh|lac|crore|cr\b|hazar|hazaar|thousand|\bk\b|₹|\brs\b/u', $lower);
$tokens = [];
foreach (preg_split('/[^\p{L}\p{N}]+/u', $lower) as $t) {
    if ($t === '' || in_array($t, $stop, true)) continue;
    if (is_numeric($t) && ($saysMoney || strlen($t) < 3)) continue;   // keep "350", "700"; drop "15" in "15 lakh"
    foreach (explode(' ', $syn[$t] ?? $t) as $w) $tokens[] = $w;
}
$tokens = array_slice(array_values(array_unique($tokens)), 0, 6);

$orderMap = [
    'price_low'  => 'price_min ASC',
    'price_high' => 'price_max DESC',
    'mileage'    => 'mileage DESC',
    'rating'     => 'rating DESC',
];

$select = 'id, name, brand, type, body, fuel, seats, price_min, price_max, mileage, rating, highlights, url, image_url';

try {
    $pdo  = vs_pdo($CFG);
    $rows = [];

    if ($tokens && $S['use_fulltext']) {
        // Boolean mode, prefix match on every token: "hunt*" finds Hunter
        $ft = implode(' ', array_map(fn($t) => preg_replace('/[+\-><()~*"@]/', '', $t) . '*', $tokens));
        $sql = "SELECT $select,
                       MATCH(name,brand,body,fuel,tags,use_cases,highlights,features) AGAINST (:ft IN BOOLEAN MODE)
                       + (name LIKE :nm) * 5 AS score
                FROM `$table`
                WHERE " . implode(' AND ', $where) . "
                  AND MATCH(name,brand,body,fuel,tags,use_cases,highlights,features) AGAINST (:ft2 IN BOOLEAN MODE)
                ORDER BY " . ($orderMap[$sort] ?? 'score DESC, rating DESC') . "
                LIMIT $limit";
        $st = $pdo->prepare($sql);
        $st->execute($params + [':ft' => $ft, ':ft2' => $ft, ':nm' => '%' . $q . '%']);
        $rows = $st->fetchAll();
    }

    if (!$rows && $tokens) {
        // LIKE fallback (short tokens like "xuv", "r15", or when FULLTEXT is off)
        $likes = [];
        foreach ($tokens as $i => $t) {
            $likes[] = "(name LIKE :t$i OR brand LIKE :t$i OR body LIKE :t$i OR tags LIKE :t$i OR use_cases LIKE :t$i OR features LIKE :t$i)";
            $params[":t$i"] = '%' . $t . '%';
        }
        $scoreParts = [];
        foreach ($tokens as $i => $t) $scoreParts[] = "(name LIKE :s$i) * 3 + (tags LIKE :s$i)";
        foreach ($tokens as $i => $t) $params[":s$i"] = '%' . $t . '%';

        $sql = "SELECT $select, (" . implode(' + ', $scoreParts) . ") AS score
                FROM `$table`
                WHERE " . implode(' AND ', $where) . " AND (" . implode(' OR ', $likes) . ")
                ORDER BY " . ($orderMap[$sort] ?? 'score DESC, rating DESC') . "
                LIMIT $limit";
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $rows = $st->fetchAll();
    }

    if (!$tokens) {
        // Filter-only search e.g. "automatic SUVs under 15 lakh"
        $sql = "SELECT $select FROM `$table` WHERE " . implode(' AND ', $where) . "
                ORDER BY " . ($orderMap[$sort] ?? 'rating DESC, price_min ASC') . " LIMIT $limit";
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $rows = $st->fetchAll();
    }
} catch (Throwable $e) {
    error_log('[voice-search] search failed: ' . $e->getMessage());
    vs_json(['error' => 'search_failed'], 500);
}

// If some rows' names contain EVERY spoken token ("tata curvv"), show only those
if (count($tokens) > 1) {
    $exact = array_values(array_filter($rows, function ($r) use ($tokens) {
        $hay = mb_strtolower($r['name'] . ' ' . $r['brand']);
        foreach ($tokens as $t) if (mb_strpos($hay, $t) === false) return false;
        return true;
    }));
    if ($exact) $rows = $exact;
}

// ── Shape output ──
$results = array_map(function ($r) use ($S) {
    $lo = (float)$r['price_min']; $hi = (float)$r['price_max'];
    $label = $lo && $hi && $hi > $lo ? vs_inr($lo) . ' – ' . vs_inr($hi) : vs_inr($lo ?: $hi);
    $pattern = is_array($S['url_pattern']) ? ($S['url_pattern'][$r['type']] ?? reset($S['url_pattern'])) : $S['url_pattern'];
    $url = $r['url'] ?: str_replace(['{id}', '{type}'], [rawurlencode($r['id']), $r['type']], $pattern);
    return [
        'id'          => $r['id'],
        'name'        => $r['name'],
        'brand'       => $r['brand'],
        'type'        => $r['type'],
        'body'        => $r['body'],
        'fuel'        => $r['fuel'],
        'seats'       => $r['seats'] !== null ? (int)$r['seats'] : null,
        'price_min'   => $lo ?: null,
        'price_max'   => $hi ?: null,
        'price_label' => $label,
        'mileage'     => $r['mileage'] !== null ? (float)$r['mileage'] : null,
        'rating'      => $r['rating'] !== null ? (float)$r['rating'] : null,
        'highlights'  => array_slice(array_filter(array_map('trim', explode('|', (string)$r['highlights']))), 0, 3),
        'url'         => $url,
        'image_url'   => $r['image_url'] ?: null,
    ];
}, $rows);

vs_json(['count' => count($results), 'results' => $results]);
