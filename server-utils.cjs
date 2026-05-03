function decodeRequestPathname(pathname) {
    try {
        return decodeURIComponent(pathname);
    } catch (error) {
        if (error instanceof URIError) {
            return null;
        }

        throw error;
    }
}

module.exports = {
    decodeRequestPathname
};
