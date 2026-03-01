import 'dotenv/config';

async function testApiKey() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('❌ GEMINI_API_KEY is missing.');
        process.exit(1);
    }

    console.log(`🔑 Testing API Key: ${key.substring(0, 8)}...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
    const data = {
        contents: [{ parts: [{ text: "Reply with 'API_KEY_WORKING'" }] }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText}`);
        }

        const json = await response.json();
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;

        console.log('✅ Response received:', text);
        if (text && text.includes('API_KEY_WORKING')) {
            console.log('🎉 API Key is VALID and WORKING.');
        } else {
            console.log('⚠️ Unexpected response content.');
            console.log(JSON.stringify(json, null, 2));
        }

    } catch (error) {
        console.error('❌ API Verification Failed:', error.message);
        process.exit(1);
    }
}

testApiKey();
