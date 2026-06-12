/**
 * Auto Database Initializer
 * Runs schema.sql and seed.sql automatically on first startup.
 * Safe to call every time — uses IF NOT EXISTS and duplicate checks.
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const initializeDatabase = async () => {
    let connection;

    try {
        // Connect WITHOUT selecting a database first (it may not exist yet)
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true,   // needed to run the full SQL files
            charset: 'utf8mb4',
        });

        console.log('🔧 Checking database setup...');

        // ── 1. Run schema.sql (CREATE DATABASE IF NOT EXISTS + all tables) ──
        // Check whether database already exists
        const [dbs] = await connection.query(`
    SELECT SCHEMA_NAME
    FROM INFORMATION_SCHEMA.SCHEMATA
    WHERE SCHEMA_NAME = 'smart_parking'
`);

        if (dbs.length === 0) {
            console.log('📦 Creating database and tables...');

            const schemaSQL = fs.readFileSync(
                path.join(__dirname, 'schema.sql'),
                'utf8'
            );

            await connection.query(schemaSQL);

            console.log('✅ Schema created');
        } else {
            console.log('ℹ️ Database already exists - skipping schema');
        }

        // ── 2. Seed admin only if no admin exists yet ──
        const [rows] = await connection.query(
            "SELECT id FROM smart_parking.users WHERE role = 'admin' LIMIT 1"
        );

        if (rows.length === 0) {
            const seedSQL = fs.readFileSync(
                path.join(__dirname, 'seed.sql'),
                'utf8'
            );
            await connection.query(seedSQL);
            console.log('✅ Admin user seeded  →  vijayc123@gmail.com / Vijay@123');
        } else {
            console.log('ℹ️  Admin already exists — skipping seed');
        }

        console.log('🚀 Database initialisation complete');
    } catch (error) {
        console.error('❌ Database initialisation failed:', error.message);
        throw error;   // Let server.js handle the exit
    } finally {
        if (connection) await connection.end();
    }
};

module.exports = { initializeDatabase };
