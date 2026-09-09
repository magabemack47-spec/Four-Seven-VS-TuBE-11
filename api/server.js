const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const CONFIG = {
    OWNER_PASSWORD: process.env.OWNER_PASSWORD || 'FS Four Seven',
    WHATSAPP: process.env.WHATSAPP || '+27 60 222 5117',
    VERSION: '7.0',
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_OWNER: process.env.GITHUB_OWNER || 'magabemack47-spec',
    GITHUB_REPO: process.env.GITHUB_REPO || 'Four-Seven-VS-TuBE-11',
    BUILDER_API_SECRET: process.env.BUILDER_API_SECRET || 'FS7-BUILDER-9xK4-7pQ2-M8zL',
    PUBLIC_API_URL: process.env.PUBLIC_API_URL
};

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        service: 'FOUR x SEVEN Builder API',
        version: CONFIG.VERSION,
        timestamp: new Date().toISOString(),
        env: {
            github_owner: CONFIG.GITHUB_OWNER ? 'Set' : 'Missing',
            github_repo: CONFIG.GITHUB_REPO ? 'Set' : 'Missing',
            github_token: CONFIG.GITHUB_TOKEN ? 'Set' : 'Missing',
            builder_secret: CONFIG.BUILDER_API_SECRET ? 'Set' : 'Missing',
            api_url: CONFIG.PUBLIC_API_URL ? 'Set' : 'Missing'
        }
    });
});

app.post('/api/build', async (req, res) => {
    try {
        const { appName, packageName, projectType, htmlCode } = req.body;

        if (!appName) {
            return res.status(400).json({ error: 'App name is required.' });
        }

        if (!htmlCode) {
            return res.status(400).json({ error: 'HTML code is required.' });
        }

        if (!CONFIG.GITHUB_TOKEN) {
            return res.status(500).json({ error: 'GitHub token is not configured.' });
        }

        const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

        const payload = {
            event_type: 'four-seven-build',
            client_payload: {
                jobId: jobId,
                appName: appName,
                packageName: packageName || 'com.fourseven.' + appName.toLowerCase().replace(/[^a-z0-9]/g, ''),
                projectType: projectType || 'app',
                htmlCode: htmlCode,
                apiBaseUrl: CONFIG.PUBLIC_API_URL || 'https://api-alpha-six-69.vercel.app'
            }
        };

        const url = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/dispatches`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': 'Bearer ' + CONFIG.GITHUB_TOKEN,
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('GitHub dispatch failed: ' + response.status + ' - ' + errorText);
        }

        res.json({
            ok: true,
            jobId: jobId,
            message: 'Build triggered successfully',
            status: 'queued'
        });

    } catch (error) {
        console.error('Build error:', error);
        res.status(500).json({
            error: error.message || 'Failed to trigger build'
        });
    }
});

app.get('/api/build/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    res.json({
        jobId: jobId,
        status: 'pending',
        progress: 50,
        statusText: 'Building...',
        message: 'Your app is being built by GitHub Actions'
    });
});

app.post('/api/verify-owner', (req, res) => {
    const password = req.body.password;
    if (password === CONFIG.OWNER_PASSWORD) {
        res.json({ success: true, message: 'Owner verified' });
    } else {
        res.status(401).json({ success: false, error: 'Invalid password' });
    }
});

app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        totalUsers: 0,
        totalProjects: 0,
        whatsapp: CONFIG.WHATSAPP,
        version: CONFIG.VERSION
    });
});

app.use(function(err, req, res, next) {
    console.error('Error:', err);
    res.status(500).json({
        error: err.message || 'Internal server error'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
    console.log('FOUR x SEVEN API running on port ' + PORT);
    console.log('Owner Password: ' + CONFIG.OWNER_PASSWORD);
    console.log('WhatsApp: ' + CONFIG.WHATSAPP);
    console.log('GitHub Token: ' + (CONFIG.GITHUB_TOKEN ? 'Set' : 'Missing'));
});

module.exports = app;