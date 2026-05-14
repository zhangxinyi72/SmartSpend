const assert = require('node:assert/strict');
const test = require('node:test');

const { parseRequestUrl } = require('../lib/request-url.cjs');

function req(url, host = 'smartspend.test') {
    return {
        url,
        headers: { host }
    };
}

test('parseRequestUrl rejects malformed percent-encoded paths', () => {
    const result = parseRequestUrl(req('/%E0%A4%A'), { port: 3001 });

    assert.equal(result.requestUrl, undefined);
    assert.deepEqual(result.error, {
        statusCode: 400,
        message: 'Invalid request path'
    });
});

test('parseRequestUrl decodes valid pathnames and preserves query params', () => {
    const result = parseRequestUrl(req('/budget%20planner.html?category=Food%20%26%20Dining'), { port: 3001 });

    assert.equal(result.error, undefined);
    assert.equal(result.pathname, '/budget planner.html');
    assert.equal(result.requestUrl.searchParams.get('category'), 'Food & Dining');
});

test('parseRequestUrl rejects invalid request URLs', () => {
    const result = parseRequestUrl(req('/api/expenses', 'bad host'), { port: 3001 });

    assert.equal(result.requestUrl, undefined);
    assert.deepEqual(result.error, {
        statusCode: 400,
        message: 'Invalid request URL'
    });
});
