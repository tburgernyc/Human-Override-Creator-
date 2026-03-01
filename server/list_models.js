import 'dotenv/config';

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('❌ GEMINI_API_KEY is missing.');
        process.exit(1);
    }

    console.log(`🔑 Testing API Key: ${key.substring(0, 8)}...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            const errText = await response.text();
            console.error(`❌ HTTP Error ${response.status}:`, errText);
            process.exit(1);
        }

        const json = await response.json();
        console.log('✅ API Request Successful');
        console.log(`🎉 Found ${json.models?.length || 0} models.`);

        // Check if gemini-1.5-flash is in the list
        const hasFlash = json.models?.some(m => m.name.includes('gemini-1.5-flash'));
        console.log(`Has gemini-1.5-flash: ${hasFlash}`);

    } catch (error) {
        console.error('❌ API Verification Failed:', error.message);
        process.exit(1);
    }
}

listModels();
