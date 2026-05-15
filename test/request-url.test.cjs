'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parseRequestUrl } = require('../lib/request-url.cjs');

function makeRequest(url, host = 'example.test') {
    return {
        url,
        headers: { host }
    };
}

test('parseRequestUrl decodes valid pathnames and preserves query params', () => {
    const parsed = parseRequestUrl(makeRequest('/api/expenses/%66oo?category=Food%20%26%20Dining'), 3001);

    assert.equal(parsed.error, null);
    assert.equal(parsed.pathname, '/api/expenses/foo');
    assert.equal(parsed.requestUrl.searchParams.get('category'), 'Food & Dining');
});

test('parseRequestUrl reports malformed percent-encoded pathnames without throwing', () => {
    assert.doesNotThrow(() => parseRequestUrl(makeRequest('/%E0%A4%A'), 3001));

    const parsed = parseRequestUrl(makeRequest('/%E0%A4%A'), 3001);

    assert.ok(parsed.error instanceof URIError);
    assert.equal(parsed.requestUrl, null);
    assert.equal(parsed.pathname, '');
});
