// netlify/functions/tv-scan.js
// Proxies a TradingView scanner request to get live stock data for a CSE symbol.
// Usage: GET /.netlify/functions/tv-scan?symbol=RCL  (bare code, case-insensitive)

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const TV_URL = 'https://scanner.tradingview.com/srilanka/scan?label-product=popup-screener-stock';

// Column order must match frontend index mapping exactly — mirrors the working Postman body
const COLUMNS = [
  'ticker-view',                               // d[0]
  'close',                                     // d[1]  price
  'type',                                      // d[2]
  'typespecs',                                 // d[3]
  'pricescale',                                // d[4]
  'minmov',                                    // d[5]
  'fractional',                                // d[6]
  'minmove2',                                  // d[7]
  'currency',                                  // d[8]
  'sector.tr',                                 // d[9]
  'market',                                    // d[10]
  'sector',                                    // d[11] sector display label
  'AnalystRating',                             // d[12] recommendation key e.g. "StrongBuy"
  'AnalystRating.tr',                          // d[13] recommendation label e.g. "Strong buy"
  'earnings_per_share_diluted_fy',             // d[14] EPS
  'fundamental_currency_code',                 // d[15]
  'dividends_yield',                           // d[16] Dividend Yield %
  'price_earnings_ttm',                        // d[17] PE Ratio
  'book_value_per_share_fq',                   // d[18] NAV
  'price_book_fq',                             // d[19] PBV
  'return_on_equity_fy',                       // d[20] ROE %
  'total_revenue_cagr_5y',                     // d[21] Revenue Growth %
  'earnings_per_share_diluted_yoy_growth_ttm', // d[22] EPS Growth %
  'total_liabilities_fq',                      // d[23] Total Liabilities (for D/E calc)
  'total_equity_fq',                           // d[24] Total Equity (for D/E calc)
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

  // TV ticker-view-filter uses bare lowercase code only e.g. "rcl", "dvbd"
  const symbol = symbolParam.trim().toLowerCase().replace(/\..*$/, '');

  // Exact request body from working Postman — only filter[0].right is dynamic
  const body = JSON.stringify({
    columns: COLUMNS,
    filter: [
      {
        left: 'ticker-view-filter',
        operation: 'match',
        right: symbol,
      },
      {
        left: 'is_primary',
        operation: 'equal',
        right: true,
      },
    ],
    ignore_unknown_fields: false,
    options: { lang: 'en' },
    range: [0, 5],
    sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
    symbols: {},
    markets: ['srilanka'],
    filter2: {
      operator: 'and',
      operands: [
        {
          operation: {
            operator: 'or',
            operands: [
              {
                operation: {
                  operator: 'and',
                  operands: [
                    { expression: { left: 'type', operation: 'equal', right: 'stock' } },
                    { expression: { left: 'typespecs', operation: 'has', right: ['common'] } },
                  ],
                },
              },
              {
                operation: {
                  operator: 'and',
                  operands: [
                    { expression: { left: 'type', operation: 'equal', right: 'stock' } },
                    { expression: { left: 'typespecs', operation: 'has', right: ['preferred'] } },
                  ],
                },
              },
              {
                operation: {
                  operator: 'and',
                  operands: [
                    { expression: { left: 'type', operation: 'equal', right: 'dr' } },
                  ],
                },
              },
              {
                operation: {
                  operator: 'and',
                  operands: [
                    { expression: { left: 'type', operation: 'equal', right: 'fund' } },
                    { expression: { left: 'typespecs', operation: 'has_none_of', right: ['etf'] } },
                  ],
                },
              },
            ],
          },
        },
        {
          expression: {
            left: 'typespecs',
            operation: 'has_none_of',
            right: ['pre-ipo'],
          },
        },
      ],
    },
  });

  try {
    console.log('[tv-scan] Requesting symbol:', symbol);

    const res = await fetch(TV_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.tradingview.com',
        'Referer': 'https://www.tradingview.com/',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: body,
    });

    console.log('[tv-scan] TradingView status:', res.status);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[tv-scan] TradingView error body:', errText);
      throw new Error('TradingView API returned HTTP ' + res.status + ': ' + errText.slice(0, 200));
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

    const recKey   = d[12] || null;
    const recLabel = d[13] || null;
    const tvSector = d[11] || d[9] || null;

    console.log('[tv-scan] Success:', symbol, '| price:', d[1], '| rec:', recKey, '| sector:', tvSector);

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        ok:   true,
        data: d,
        meta: { symbol: row.s, tvSector, recKey, recLabel },
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
