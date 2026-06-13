/**
 * Server Entry Point
 * Starts the Express server and initializes services
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const app = require('./app');
const { testConnection } = require('./config/db');
const { initializeDatabase } = require('./database/initDb');
const cron = require('node-cron');

const PORT = process.env.PORT || 5000;

// Initialize server
const startServer = async () => {
    // Auto-run schema + seed on first startup
    await initializeDatabase();

    // Test database connection
    const dbConnected = await testConnection();

    if (!dbConnected) {
        console.error('Failed to connect to database. Exiting...');
        process.exit(1);
    }

    // Start scheduled tasks
    initScheduledJobs();

    // Start server
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║   🚗 Smart Parking System API Server              ║
║                                                    ║
║   Environment: ${process.env.NODE_ENV || 'development'}                      ║
║   Port: ${PORT}                                       ║
║   URL: http://localhost:${PORT}                       ║
║                                                    ║
╚════════════════════════════════════════════════════╝
        `);
    });
};

// Initialize scheduled jobs
const initScheduledJobs = () => {
    // Check for expired bookings every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        try {
            const { query } = require('./config/db');

            // Expire pending bookings older than 15 minutes
            // Get expired bookings first
            const expiredBookings = await query(`
    SELECT slot_id
    FROM bookings
    WHERE status = 'pending'
    AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
    AND slot_id IS NOT NULL
`);

            // Release slots
            for (const booking of expiredBookings) {
                await query(
                    'UPDATE parking_slots SET status = ? WHERE id = ?',
                    ['available', booking.slot_id]
                );
            }

            // Expire bookings
            await query(`
    UPDATE bookings
    SET status = 'expired'
    WHERE status = 'pending'
    AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
`);

            // Mark confirmed bookings as no_show if start_time passed by 30 minutes
            // Only mark as no_show if payment was NOT completed (unpaid bookings)
            // Paid bookings that missed check-in are marked completed, not no_show
            // Only mark as no_show if payment is genuinely unpaid.
            // Use TRIM + LOWER to guard against DB whitespace/casing issues
            // that previously caused paid+confirmed bookings to be wrongly no_show'd.
            const noShowBookings = await query(`
    SELECT slot_id
    FROM bookings
    WHERE TRIM(LOWER(status)) = 'confirmed'
    AND TRIM(LOWER(payment_status)) NOT IN ('paid', 'completed')
    AND start_time < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
    AND actual_check_in IS NULL
    AND slot_id IS NOT NULL
`);

            // Release slots
            for (const booking of noShowBookings) {
                await query(
                    'UPDATE parking_slots SET status = ? WHERE id = ?',
                    ['available', booking.slot_id]
                );
            }

            // Mark unpaid bookings as no_show
            await query(`
    UPDATE bookings
    SET status = 'no_show'
    WHERE TRIM(LOWER(status)) = 'confirmed'
    AND TRIM(LOWER(payment_status)) NOT IN ('paid', 'completed')
    AND start_time < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
    AND actual_check_in IS NULL
`);

            // Mark paid confirmed bookings whose end_time has passed as completed
            await query(`
    UPDATE bookings
    SET status = 'completed', updated_at = NOW()
    WHERE status = 'confirmed'
    AND payment_status = 'paid'
    AND end_time <= NOW()
`);

            // Mark paid confirmed bookings whose start_time has passed (but not ended) as active
            await query(`
    UPDATE bookings
    SET status = 'active', updated_at = NOW()
    WHERE status = 'confirmed'
    AND payment_status = 'paid'
    AND start_time <= NOW()
    AND end_time > NOW()
    AND actual_check_in IS NULL
`);

            console.log('[CRON] Booking status check completed');
        } catch (error) {
            console.error('[CRON] Error in booking status check:', error.message);
        }
    });

    // Update parking availability every minute
    cron.schedule('* * * * *', async () => {
        try {
            const { query } = require('./config/db');

            await query(`
                UPDATE parking_locations pl
                SET available_slots = (
                    SELECT COUNT(*) FROM parking_slots ps 
                    WHERE ps.parking_id = pl.id AND ps.status = 'available'
                )
            `);
        } catch (error) {
            console.error('[CRON] Error updating availability:', error.message);
        }
    });

    console.log('✅ Scheduled jobs initialized');
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

// Start the server
startServer();
