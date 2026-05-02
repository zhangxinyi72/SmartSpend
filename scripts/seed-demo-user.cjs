/**
 * 在「本机与 Render 共用的」MongoDB 里创建/更新 demo 用户（同一邮箱+密码两边可登录）。
 * 用法：先在本机 .env 中设置与 Render 相同的 MONGO_URL / DB_NAME，然后执行:
 *   npm run seed:demo
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const PASSWORD_KEY_LENGTH = 64;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString('hex');
    return { salt, hash };
}

async function main() {
    const uri = process.env.MONGO_URL;
    const dbName = process.env.DB_NAME || 'companydb';
    const email = (process.env.DEMO_USER_EMAIL || '').trim().toLowerCase();
    const password = process.env.DEMO_USER_PASSWORD || '';
    const name = (process.env.DEMO_USER_NAME || 'SmartSpend Demo').trim();

    if (!uri) {
        console.error('缺少 MONGO_URL。请在 .env 中设置（与 Render 中相同）。');
        process.exit(1);
    }
    if (!email || !password) {
        console.error('请在 .env 中设置 DEMO_USER_EMAIL 与 DEMO_USER_PASSWORD。');
        process.exit(1);
    }

    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);
        const users = db.collection('users');

        const now = new Date();
        const nowIso = now.toISOString();
        const { salt, hash } = hashPassword(password);

        const setDoc = {
            email,
            name,
            passwordSalt: salt,
            passwordHash: hash,
            updated_at: nowIso
        };

        const res = await users.updateOne(
            { email },
            {
                $set: setDoc,
                $setOnInsert: { created_at: nowIso }
            },
            { upsert: true }
        );

        if (res.upsertedCount === 1) {
            console.log('已创建 demo 用户:', email);
        } else {
            console.log('已更新 demo 用户密码与资料:', email);
        }
    } finally {
        await client.close();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
