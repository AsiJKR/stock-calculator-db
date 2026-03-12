// netlify/functions/tv-scan.js
// Proxies a TradingView scanner request to get live stock data for a CSE symbol.
// Usage: GET /.netlify/functions/tv-scan?symbol=RCL

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const TV_URL = 'https://scanner.tradingview.com/srilanka/scan?label-product=popup-screener-stock';

// The fixed columns we request — order must match the index mapping in the frontend
const COLUMNS = [
  'description',          // d[0]  company description
  'close',                // d[1]  last price
  'type',                 // d[2]
  'typespecs',            // d[3]
  'update_mode',          // d[4]
  'pricescale',           // d[5]
  'minmov',               // d[6]
  'fractional',           // d[7]
  'currency',             // d[8]
  'sector',               // d[9]  TV sector (english)
  'country',              // d[10]
  'sector.tr',            // d[11] TV sector translated / display label
  'Recommend.All',        // d[12] recommendation key  e.g. "StrongBuy"
  'Recommend.All|5',      // d[13] recommendation label e.g. "Strong buy"  (some TV endpoints differ)
  'earnings_per_share_basic_ttm', // d[14] EPS
  'currency',             // d[15] (duplicate — keeps index alignment)
  'dividends_yield',      // d[16] Dividend Yield %
  'price_earnings_ttm',   // d[17] PE Ratio
  'book_value_per_share_quarterly', // d[18] NAV (book value)
  'price_book_ratio',     // d[19] PBV
  'total_debt_to_equity', // d[20] D/E
  'return_on_equity',     // d[21] ROE %
  'revenue_growth',       // d[22] Revenue Growth %
  'earnings_growth',      // d[23] EPS Growth %
];

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  const symbolParam = event.queryStringParameters && event.queryStringParameters.symbol;
  if (!symbolParam) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: 'Missing symbol parameter' }),
    };
  }

  // Accept bare code (e.g. "RCL") or full code (e.g. "RCL.N0000")
  const symbol = symbolParam.trim();

  const body = JSON.stringify({
    filter: [
      { left: 'name', operation: 'equal', right: symbol }
    ],
    columns: COLUMNS,
    sort: { sortBy: 'name', sortOrder: 'asc' },
    range: [0, 1],
  });

  try {
    console.log('[tv-scan] Requesting symbol:', symbol);

    const res = await fetch(TV_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; CSE-Explorer/1.0)',
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
      },
      body: body,
    });

    console.log('[tv-scan] TradingView response status:', res.status);

    if (!res.ok) {
      throw new Error('TradingView API returned HTTP ' + res.status);
    }

    const tvData = await res.json();

    if (!tvData || !tvData.data || !tvData.data.length) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ ok: false, error: 'Symbol not found: ' + symbol }),
      };
    }

    const row = tvData.data[0];
    const d   = row.d;

    // Map recommendation key to a clean string
    // TV returns a float for Recommend.All: >0.5=StrongBuy, 0.1–0.5=Buy, etc.
    // But if they return a string label we use that; otherwise derive it.
    let recKey   = null;
    let recLabel = null;
    const rawRec = d[12];
    if (typeof rawRec === 'number') {
      if      (rawRec >= 0.5)  { recKey='StrongBuy';  recLabel='Strong buy'; }
      else if (rawRec >= 0.1)  { recKey='Buy';         recLabel='Buy'; }
      else if (rawRec > -0.1)  { recKey='Neutral';     recLabel='Neutral'; }
      else if (rawRec > -0.5)  { recKey='Sell';        recLabel='Sell'; }
      else                     { recKey='StrongSell';  recLabel='Strong sell'; }
    } else if (typeof rawRec === 'string') {
      recKey   = rawRec;
      recLabel = d[13] || rawRec;
    }

    // Normalise the sector label — prefer d[11] (display label), fallback to d[9]
    const tvSector = d[11] || d[9] || null;

    console.log('[tv-scan] Success:', symbol, 'price:', d[1], 'rec:', recKey);

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        ok:   true,
        data: d,
        meta: {
          symbol:    row.s,
          tvSector:  tvSector,
          recKey:    recKey,
          recLabel:  recLabel,
        },
      }),
    };

  } catch (err) {
    console.error('[tv-scan] Error:', err.message);
    return {
      statusCode: 502,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: 'Failed to reach TradingView: ' + err.message }),
    };
  }
};
