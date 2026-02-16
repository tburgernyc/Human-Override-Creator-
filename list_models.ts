import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    console.error('No API key found');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.list();
    // @ts-ignore - Pager type mismatch in current SDK version
    const models = response.models || response || [];
    console.log('\n📋 Available Gemini Models:\n');

    for (const model of models) {
      console.log(`- ${model.name}`);
      if (model.supportedGenerationMethods) {
        console.log(`  Methods: ${model.supportedGenerationMethods.join(', ')}`);
      }
    }
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

listModels();
