const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const { initializeSocket } = require('./config/socket');
const { languageMiddleware } = require('./utils/i18n');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

// Verify SMTP at startup
setTimeout(async () => {
    try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            tls: { rejectUnauthorized: false },
            connectionTimeout: 10000,
        });
        await transporter.verify();
        console.log(`✅ SMTP ready — sending from: ${process.env.SMTP_USER}`);
    } catch (err) {
        console.error(`❌ SMTP FAILED — emails will NOT be sent!`);
        console.error(`   Error: ${err.message}`);
        console.error(`   SMTP_USER: ${process.env.SMTP_USER}`);
        console.error(`   SMTP_HOST: ${process.env.SMTP_HOST}`);
        console.error(`   SMTP_PASS set: ${!!process.env.SMTP_PASS}`);
    }
}, 3000); // wait 3s for server to settle

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initializeSocket(server);

// Security middleware (MUST be before routes)
app.use(helmet({
    crossOriginResourcePolicy: false,
}));

// Standard CORS configuration
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'ngrok-skip-browser-warning', 'Accept-Language'],
    credentials: true,
    optionsSuccessStatus: 200
}));

// Body parser
app.use(express.json());

// Language middleware (MUST be before routes)
app.use(languageMiddleware);

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Mount routers
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const loadRoutes = require('./routes/loadRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const exportRoutes = require('./routes/exportRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const seedRoutes = require('./routes/seedRoutes');
const testRoutes = require('./routes/testRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/loads', loadRoutes);
app.use('/api/routes', require('./routes/routeRoutes'));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/test', testRoutes);
app.use('/seed', seedRoutes); // Public seed endpoint

// Public test endpoint to verify update
app.get('/api/test', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Backend is UPDATED and running the latest code!',
        version: '2.1.0-manual-sync-test',
        timestamp: new Date().toISOString(),
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ GLOBAL ERROR:', err);
    res.status(err.status || 500).json({
        success: false,
        message: 'Server error: ' + err.message,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Server running on PORT: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📡 Frontend URL: ${process.env.FRONTEND_URL || 'Not Set'}`);
    console.log(`=========================================`);
    console.log(`WebSocket server initialized`);
});