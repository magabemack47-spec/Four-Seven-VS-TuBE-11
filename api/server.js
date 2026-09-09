app.post('/api/build', async (req, res) => {
    try {
        const { appName, packageName, projectType, htmlCode } = req.body;

        console.log('📦 Build request received:');
        console.log('App name:', appName);
        console.log('HTML code length:', htmlCode ? htmlCode.length : 0);

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

        console.log('📤 Sending to GitHub:', JSON.stringify(payload, null, 2));

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
            console.error('❌ GitHub dispatch failed:', response.status, errorText);
            throw new Error('GitHub dispatch failed: ' + response.status + ' - ' + errorText);
        }

        console.log('✅ Build triggered successfully! Job ID:', jobId);

        res.json({
            ok: true,
            jobId: jobId,
            message: 'Build triggered successfully',
            status: 'queued'
        });

    } catch (error) {
        console.error('❌ Build error:', error);
        res.status(500).json({
            error: error.message || 'Failed to trigger build'
        });
    }
});