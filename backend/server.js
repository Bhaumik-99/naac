const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { createDefaultSOETUser } = require('./utils/seedData');

// Load env vars first
dotenv.config();

console.log('=== SERVER STARTUP ===');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Port:', process.env.PORT || 5000);
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('JWT Secret:', process.env.JWT_SECRET ? 'Set' : 'Not set');
console.log('Cloudinary Config:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Not set',
  api_key: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Not set',
  api_secret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Not set'
});

// Connect to database
connectDB();

// MongoDB connection event listeners
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️  MongoDB disconnected');
});

const app = express();

// Trust proxy for accurate client IP
app.set('trust proxy', 1);

// Add this to your server.js after other route declarations



// CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware with increased limits for file uploads
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb' 
}));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const userAgent = req.get('User-Agent') || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${ip}`);
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body keys:', Object.keys(req.body));
  }
  
  if (req.query && Object.keys(req.query).length > 0) {
    console.log('Query params:', req.query);
  }
  
  next();
});

app.use('/api/admin', require('./routes/admin'));

// Health check route
app.get('/health', (req, res) => {
  const healthStatus = {
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    nodejs: process.version,
    memory: process.memoryUsage(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  };
  
  console.log('Health check requested:', healthStatus);
  res.json(healthStatus);
});

// API Routes
console.log('Setting up routes...');

try {
  app.use('/api/auth', require('./routes/auth'));
  console.log('✅ Auth routes loaded');
} catch (error) {
  console.error('❌ Error loading auth routes:', error.message);
}

try {
  app.use('/api/criteria', require('./routes/criteria'));
  console.log('✅ Criteria routes loaded');
} catch (error) {
  console.error('❌ Error loading criteria routes:', error.message);
}

try {
  app.use('/api/forgot-password', require('./routes/forgotPassword'));
  console.log('✅ Forgot password routes loaded');
} catch (error) {
  console.error('❌ Error loading forgot password routes:', error.message);
}

try {
  app.use('/api/files', require('./routes/files'));
  console.log('✅ File routes loaded');
} catch (error) {
  console.error('❌ Error loading file routes:', error.message);
}

// Test route for debugging
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working',
    timestamp: new Date().toISOString(),
    user: req.user ? {
      id: req.user.id,
      email: req.user.email
    } : null
  });
});

// Multer error handling middleware (MUST be before generic error handler)
app.use((err, req, res, next) => {
  console.error('=== MULTER ERROR HANDLER ===');
  console.error('Error type:', err.constructor.name);
  console.error('Error message:', err.message);
  console.error('Error code:', err.code);
  
  // Multer-specific errors
  if (err instanceof multer.MulterError) {
    console.error('Multer error detected:', err.code);
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 10MB.'
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected field name. Expected "file".'
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many files. Only 1 file allowed per upload.'
        });
      
      case 'LIMIT_PART_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many form parts.'
        });
      
      default:
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
    }
  }
  
  // File validation errors
  if (err.message && err.message.includes('Invalid file type')) {
    console.error('File validation error:', err.message);
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  // Pass to next error handler
  next(err);
});

// Cloudinary error handling middleware
app.use((err, req, res, next) => {
  if (err.name === 'CloudinaryError') {
    console.error('=== CLOUDINARY ERROR ===');
    console.error('Message:', err.message);
    console.error('HTTP code:', err.http_code);
    
    return res.status(500).json({
      success: false,
      message: 'Cloud storage error. Please try again later.'
    });
  }
  
  next(err);
});

// Database error handling middleware
app.use((err, req, res, next) => {
  // MongoDB/Mongoose errors
  if (err.name === 'MongoError' || err.name === 'MongooseError' || err.name === 'MongoNetworkError') {
    console.error('=== DATABASE ERROR ===');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    
    return res.status(500).json({
      success: false,
      message: 'Database connection error. Please try again.'
    });
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    console.error('=== VALIDATION ERROR ===');
    console.error('Validation errors:', err.errors);
    
    const validationErrors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: `Validation error: ${validationErrors.join(', ')}`
    });
  }
  
  // Cast errors (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    console.error('=== CAST ERROR ===');
    console.error('Cast error path:', err.path);
    console.error('Cast error value:', err.value);
    
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }
  
  // Duplicate key errors
  if (err.code === 11000) {
    console.error('=== DUPLICATE KEY ERROR ===');
    console.error('Duplicate field:', err.keyValue);
    
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `Duplicate ${field} value entered`
    });
  }
  
  next(err);
});

// JWT error handling middleware
app.use((err, req, res, next) => {
  if (err.name === 'JsonWebTokenError') {
    console.error('=== JWT ERROR ===');
    console.error('JWT error:', err.message);
    
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token'
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    console.error('=== JWT EXPIRED ERROR ===');
    console.error('Token expired at:', err.expiredAt);
    
    return res.status(401).json({
      success: false,
      message: 'Authentication token has expired'
    });
  }
  
  next(err);
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  console.log(`=== 404 ERROR ===`);
  console.log(`Route not found: ${req.method} ${req.originalUrl}`);
  console.log('Available routes:');
  console.log('- GET  /health');
  console.log('- GET  /api/test');
  console.log('- *    /api/auth/*');
  console.log('- *    /api/criteria/*');
  console.log('- *    /api/forgot-password/*');
  console.log('- *    /api/files/*');
  
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /health',
      'GET /api/test',
      '* /api/auth/*',
      '* /api/criteria/*',
      '* /api/forgot-password/*',
      '* /api/files/*'
    ]
  });
});

// Generic error handling middleware (MUST be last)
app.use((err, req, res, next) => {
  console.error('=== GENERIC ERROR HANDLER ===');
  console.error('Time:', new Date().toISOString());
  console.error('URL:', req.originalUrl);
  console.error('Method:', req.method);
  console.error('User ID:', req.user?.id || 'Not authenticated');
  console.error('User Email:', req.user?.email || 'Not authenticated');
  console.error('Request body:', req.body);
  console.error('Request params:', req.params);
  console.error('Request query:', req.query);
  console.error('Error name:', err.name);
  console.error('Error message:', err.message);
  console.error('Error stack:', err.stack);
  console.error('=== END GENERIC ERROR ===');
  
  // If response was already sent, don't send again
  if (res.headersSent) {
    console.error('Headers already sent, cannot send error response');
    return next(err);
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { 
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack
      }
    })
  });
});

// Graceful shutdown handlers
const gracefulShutdown = (signal) => {
  console.log(`\n=== ${signal} RECEIVED ===`);
  console.log('Starting graceful shutdown...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    });
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled promise rejection handler
process.on('unhandledRejection', (err, promise) => {
  console.error('=== UNHANDLED PROMISE REJECTION ===');
  console.error('Error:', err);
  console.error('Promise:', promise);
  console.error('Shutting down server...');
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('=== UNCAUGHT EXCEPTION ===');
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  console.error('Shutting down server...');
  process.exit(1);
});

// Warning handlers
process.on('warning', (warning) => {
  console.warn('=== NODE WARNING ===');
  console.warn('Warning name:', warning.name);
  console.warn('Warning message:', warning.message);
  console.warn('Stack trace:', warning.stack);
});

// Start server
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, async () => {
  console.log('\n=== SERVER STARTED SUCCESSFULLY ===');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test API: http://localhost:${PORT}/api/test`);
  console.log(`📁 File uploads: http://localhost:${PORT}/api/files/*`);
  
  try {
    console.log('\n⏳ Creating default SOET user...');
    await createDefaultSOETUser();
    console.log('✅ Default user creation completed');
  } catch (error) {
    console.error('❌ Error creating default user:', error.message);
  }
  
  console.log('\n🎯 Server ready to accept connections!');
  console.log('================================\n');
});

// Server error handler
server.on('error', (err) => {
  console.error('=== SERVER ERROR ===');
  
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.error('Try using a different port or kill the process using this port');
    process.exit(1);
  } else if (err.code === 'EACCES') {
    console.error(`❌ Permission denied to bind to port ${PORT}`);
    console.error('Try using a port number above 1024 or run with elevated privileges');
    process.exit(1);
  } else {
    console.error('❌ Server error:', err);
    process.exit(1);
  }
});

// Handle server timeout
server.timeout = 120000; // 2 minutes timeout

// Export for testing
module.exports = app; 
