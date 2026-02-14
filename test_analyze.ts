
console.log("Script loaded");
import { analyzeScript } from './services/gemini.ts';
import { ProjectState } from './types.ts';
import dotenv from 'dotenv';
dotenv.config();
process.env.API_KEY = process.env.GEMINI_API_KEY;
console.log("API Key loaded:", process.env.API_KEY ? process.env.API_KEY.substring(0, 5) + "..." : "Not found");
// Mock project state
const mockProject: ProjectState = {
    script: "A cyberpunk detective hunts a rogue android in a neon-lit Tokyo.",
    status: 'idle',
    characters: [],
    scenes: [],
    assets: {},
    tasks: [],
    modules: {},
    productionLog: [],
    currentStepMessage: '',
    globalStyle: 'Cyberpunk',
    productionSeed: 12345,
    activeDraft: null,
    mastering: {
        musicVolume: 15, voiceVolume: 100, ambientVolume: 30, filmGrain: 5,
        bloomIntensity: 10, vignetteIntensity: 30, lightLeakIntensity: 20, filmBurnIntensity: 10, lutPreset: 'none'
    }
};

async function testAnalyze() {
    console.log("Starting analysis test...");
    try {
        console.log("Calling analyzeScript...");
        const result = await analyzeScript(mockProject.script, mockProject.productionSeed);
        console.log("analyzeScript returned.");
        console.log("Analysis complete!");
        console.log("Characters found:", result.characters.length);
        console.log("Scenes found:", result.scenes.length);
    } catch (error) {
        console.error("Analysis failed:", error);
    }
}

testAnalyze();
