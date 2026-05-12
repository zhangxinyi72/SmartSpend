'use strict';

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseRequestUrl(req, defaultPort) {
    let requestUrl;

    try {
        requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${defaultPort}`}`);
    } catch {
        throw createHttpError(400, 'Invalid request URL');
    }

    try {
        return {
            requestUrl,
            pathname: decodeURIComponent(requestUrl.pathname)
        };
    } catch (error) {
        if (error instanceof URIError) {
            throw createHttpError(400, 'Invalid URL encoding');
        }

        throw error;
    }
}

module.exports = {
    parseRequestUrl
};
