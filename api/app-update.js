// ============================================================
// FS G.A SiTe UPDATE API
// ============================================================

export default async function handler(req, res) {
    // Enable CORS so apps can access this API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get App ID from the URL query parameter
    const appId = req.query.appId;
    
    // Validate App ID
    if (!appId) {
        return res.status(400).json({ error: 'App ID is required' });
    }
    
    console.log('FSGA API: Update check for App ID:', appId);
    
    try {
        // For testing, return sample data for any app ID
        // In production, you'll fetch from Firebase
        const appData = {
            version: '1.0.1',
            name: 'My App',
            html: '<h1>Updated via API!</h1><p>This app was updated using the FS G.A SiTe update system.</p><p>App ID: ' + appId + '</p>',
            css: 'body { background: #0a0a0a; color: #0f0; font-family: monospace; text-align: center; padding: 40px; } h1 { color: #0ff; }',
            js: 'console.log("App updated via FS G.A SiTe API!");',
            lastUpdated: new Date().toISOString()
        };
        
        res.json(appData);
        
    } catch (error) {
        console.error('FSGA API Error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
}