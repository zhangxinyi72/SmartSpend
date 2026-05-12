'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { parseRequestUrl } = require('../lib/request-url.cjs');

function mockRequest(url, host = 'example.test') {
    return {
        url,
        headers: {
            host
        }
    };
}

test('parseRequestUrl decodes valid encoded pathnames', () => {
    const { requestUrl, pathname } = parseRequestUrl(mockRequest('/api/expenses%20archive?search=food'), 3001);

    assert.equal(pathname, '/api/expenses archive');
    assert.equal(requestUrl.searchParams.get('search'), 'food');
});

test('parseRequestUrl rejects malformed percent-encoded pathnames as client errors', () => {
    assert.throws(
        () => parseRequestUrl(mockRequest('/%E0%A4%A'), 3001),
        error => {
            assert.equal(error.statusCode, 400);
            assert.equal(error.message, 'Invalid URL encoding');
            return true;
        }
    );
});
