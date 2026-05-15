'use strict';

function parseRequestUrl(req, fallbackPort) {
    try {
        const requestUrl = new URL(
            req.url || '/',
            `http://${req.headers.host || `localhost:${fallbackPort}`}`
        );

        return {
            requestUrl,
            pathname: decodeURIComponent(requestUrl.pathname),
            error: null
        };
    } catch (error) {
        return {
            requestUrl: null,
            pathname: '',
            error
        };
    }
}

module.exports = {
    parseRequestUrl
};
