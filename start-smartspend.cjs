'use strict';

/**
 * 本机与 Render 共用：两边使用「同一条」MONGO_URL（推荐 MongoDB Atlas）连同一套库。
 * 在 package.json 里由 npm start 调用，先于 app.js 做必要校验。
 */
const path = require('path');
const root = __dirname;
require('dotenv').config({ path: path.join(root, '.env') });

const mongo = (process.env.MONGO_URL || '').trim();
const onRender = !!(process.env.RENDER || process.env.RENDER_SERVICE_NAME);

function isLocalhostMongo(url) {
    if (!url) {
        return false;
    }
    return (
        /mongodb(\+srv)?:\/\//i.test(url) &&
        (/\b127\.0\.0\.1\b/.test(url) || /\blocalhost\b/i.test(url))
    );
}

if (onRender) {
    if (!mongo) {
        console.error(
            '[SmartSpend] Render 上未设置 MONGO_URL。在 Render → Environment 添加与本机 .env 相同的 MongoDB Atlas 连接串。'
        );
        process.exit(1);
    }
    if (isLocalhostMongo(mongo)) {
        console.error(
            '[SmartSpend] MONGO_URL 不能指向 127.0.0.1/localhost。云端必须填写 Atlas（或公网可访问的同一台 Mongo）连接串。'
        );
        process.exit(1);
    }
} else if (mongo && isLocalhostMongo(mongo)) {
    console.warn(
        '[SmartSpend] MONGO_URL 仍指向本机。若需与手机 https 站点数据一致，请把本机 .env 改成与 Render 相同的 MongoDB Atlas 串。'
    );
} else if (mongo && /mongodb\+srv:\/\//i.test(mongo)) {
    console.log('[SmartSpend] 已使用 cloud Mongo 连接，可与 Render/手机共用数据。');
}

require(path.join(root, 'app.js'));
