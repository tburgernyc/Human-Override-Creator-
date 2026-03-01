import 'dotenv/config';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function testApiKey() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error('❌ GEMINI_API_KEY is missing from environment.');
        process.exit(1);
    }

    console.log(`🔑 Testing API Key: ${key.substring(0, 8)}...`);

    try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        console.log('📡 Sending request to Gemini API...');
        const result = await model.generateContent("Reply with 'API_KEY_WORKING'");
        const response = await result.response;
        const text = response.text();

        console.log('✅ Response received:', text);
        if (text.includes('API_KEY_WORKING')) {
            console.log('🎉 API Key is VALID and WORKING.');
        } else {
            console.log('⚠️ Unexpected response content.');
        }

    } catch (error) {
        console.error('❌ API Verification Failed:', error.message);
        if (error.message.includes('400')) console.error('   -> Check if the model name is correct or if the key has access to it.');
        if (error.message.includes('401') || error.message.includes('403')) console.error('   -> Invalid API Key or unauthorized.');
        process.exit(1);
    }
}

testApiKey();
