// netlify/functions/cse-price.js
// Proxies live price requests to the Colombo Stock Exchange API.
// Usage: GET /.netlify/functions/cse-price?symbol=ABL.N0000

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

// CSE requires a POST with form-encoded body, not a GET with query string
const CSE_API = 'https://www.cse.lk/api/companyInfoSummery';

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  const symbol = event.queryStringParameters && event.queryStringParameters.symbol;

  if (!symbol) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: 'Missing symbol parameter' }),
    };
  }

  if (!/^[A-Z]{1,10}\.[A-Z0-9]{5,10}$/.test(symbol)) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: 'Invalid symbol format: ' + symbol }),
    };
  }

  try {
    console.log('[cse-price] Fetching symbol:', symbol);

    const res = await fetch(CSE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; CSE-Explorer/1.0)',
        'Referer': 'https://www.cse.lk/',
        'Accept': 'application/json',
      },
      body: 'symbol=' + encodeURIComponent(symbol),
    });

    console.log('[cse-price] CSE response status:', res.status);

    if (!res.ok) {
      throw new Error('CSE API returned HTTP ' + res.status);
    }

    const data = await res.json();

    // If CSE returns an empty or null reqSymbolInfo, symbol wasn't found
    if (!data || !data.reqSymbolInfo) {
      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({ ok: false, error: 'Symbol not found: ' + symbol }),
      };
    }

    console.log('[cse-price] Success:', symbol, data.reqSymbolInfo.lastTradedPrice);

    // Pass full CSE response through — frontend reads data.reqSymbolInfo
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify(data),
    };

  } catch (err) {
    console.error('[cse-price] Error:', err.message);
    return {
      statusCode: 502,
      headers: HEADERS,
      body: JSON.stringify({ ok: false, error: 'Failed to reach CSE API: ' + err.message }),
    };
  }
};
