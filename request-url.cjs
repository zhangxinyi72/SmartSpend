'use strict';

function parseRequestUrl(rawUrl, host, fallbackPort) {
    let requestUrl;

    try {
        requestUrl = new URL(rawUrl, `http://${host || `localhost:${fallbackPort}`}`);
    } catch {
        return {
            ok: false,
            error: 'Malformed request URL'
        };
    }

    try {
        return {
            ok: true,
            requestUrl,
            pathname: decodeURIComponent(requestUrl.pathname)
        };
    } catch {
        return {
            ok: false,
            error: 'Malformed request URL path'
        };
    }
}

module.exports = {
    parseRequestUrl
};
