function parseRequestUrl(req, { port } = {}) {
    let requestUrl;

    try {
        requestUrl = new URL(
            req.url || '/',
            `http://${req.headers.host || `localhost:${port || 3001}`}`
        );
    } catch {
        return {
            error: {
                statusCode: 400,
                message: 'Invalid request URL'
            }
        };
    }

    try {
        return {
            requestUrl,
            pathname: decodeURIComponent(requestUrl.pathname)
        };
    } catch {
        return {
            error: {
                statusCode: 400,
                message: 'Invalid request path'
            }
        };
    }
}

module.exports = {
    parseRequestUrl
};
