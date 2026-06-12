/**
 * QR Code Generation Service
 */

const QRCode = require('qrcode');

// Generate QR code as data URL
const generateQRCode = async (data) => {
    try {
        const qrData = typeof data === 'object' ? JSON.stringify(data) : data;
        
        const qrCode = await QRCode.toDataURL(qrData, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        return qrCode;
    } catch (error) {
        console.error('QR code generation error:', error);
        throw new Error('Failed to generate QR code');
    }
};

// Generate booking QR code
const generateBookingQR = async (booking) => {
    const qrData = {
        bookingCode: booking.booking_code || booking.bookingCode,
        parkingId: booking.parking_id || booking.parkingId,
        vehicleNumber: booking.vehicle_number || booking.vehicleNumber,
        startTime: booking.start_time || booking.startTime,
        endTime: booking.end_time || booking.endTime,
        timestamp: new Date().toISOString()
    };
    
    return await generateQRCode(qrData);
};

module.exports = {
    generateQRCode,
    generateBookingQR
};
