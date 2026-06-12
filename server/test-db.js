const mysql = require('mysql2/promise');

async function test() {
  try {
    const conn = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'vijay123',
      database: 'smart_parking'
    });

    console.log('✅ Connected successfully!');
    await conn.end();
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

test();