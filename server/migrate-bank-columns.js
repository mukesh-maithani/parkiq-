/**
 * One-time migration: adds bank_ifsc and account_holder_name columns
 * to the parking_owners table.
 *
 * Run from your server folder:
 *   node migrate-bank-columns.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'smart_parking',
    });

    console.log('✅ Connected to database:', process.env.DB_NAME || 'smart_parking');

    try {
        // Check existing columns
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'parking_owners'
        `);
        const existing = columns.map(c => c.COLUMN_NAME);
        console.log('Existing columns:', existing.join(', '));

        if (!existing.includes('bank_ifsc')) {
            await connection.query(
                'ALTER TABLE parking_owners ADD COLUMN bank_ifsc VARCHAR(20) DEFAULT NULL'
            );
            console.log('✅ Added column: bank_ifsc');
        } else {
            console.log('ℹ️  Column already exists: bank_ifsc');
        }

        if (!existing.includes('account_holder_name')) {
            await connection.query(
                'ALTER TABLE parking_owners ADD COLUMN account_holder_name VARCHAR(100) DEFAULT NULL'
            );
            console.log('✅ Added column: account_holder_name');
        } else {
            console.log('ℹ️  Column already exists: account_holder_name');
        }

        console.log('\n🎉 Migration complete! You can now save bank details in the app.');
    } finally {
        await connection.end();
    }
}

migrate().catch(err => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
});
