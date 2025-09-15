const http = require('http');

const CONFIG = {
    healthCheckPort: process.env.PORT || process.env.HEALTH_CHECK_PORT || 8080,
};

// Simple health check server for Cloud Run
function startHealthCheckServer() {
    const server = http.createServer((req, res) => {
        console.log(`Health check request: ${req.method} ${req.url}`);
        
        if (req.url === '/health' || req.url === '/') {
            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            
            res.end(JSON.stringify({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                service: 'dispatch-webcrawl-scraper',
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development'
            }, null, 2));
        } else {
            res.writeHead(404, {
                'Content-Type': 'application/json'
            });
            res.end(JSON.stringify({
                error: 'Not Found',
                message: 'Available endpoints: /health, /'
            }));
        }
    });

    server.listen(CONFIG.healthCheckPort, '0.0.0.0', () => {
        console.log(`Health check server started on port ${CONFIG.healthCheckPort}`);
        console.log('Available endpoints: /health, /');
    });

    return server;
}

// Start the server
const server = startHealthCheckServer();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
