const fs = require('fs');
const path = require('path');

const promptsData = JSON.parse(fs.readFileSync('something-wicked-prompts.json', 'utf8'));
const vttContent = fs.readFileSync('public/captions/something-wicked.vtt', 'utf8');

const productionData = {
    compositionId: "Something-Wicked",
    title: "Something Wicked",
    author: "Falon Ballard",
    genre: "fantasy",
    audioFile: "audio/something-wicked.m4a",
    captionContent: vttContent,
    srtContent: vttContent,
    scenes: promptsData.scenes.map((scene, index) => ({
        id: `scene-${index}`,
        startTime: scene.startTime,
        endTime: scene.endTime,
        mood: scene.mood,
        assets: [
            {
                path: `scenes/something_wicked/scene-${String(scene.index).padStart(2, '0')}.png`,
                type: "image",
                position: { x: 50, y: 50 },
                scale: 1,
                opacity: 1,
                zIndex: 1
            }
        ],
        animations: [
            {
                type: (scene.index % 2 === 0) ? "pan" : "zoom",
                direction: (scene.index % 4 === 0) ? "right" : (scene.index % 4 === 1) ? "left" : "in"
            }
        ],
        keywords: scene.keywords,
        storyBeat: scene.storyBeat
    }))
};

fs.writeFileSync('src/data/production-something-wicked.json', JSON.stringify(productionData, null, 2));
console.log(`✅ Final production JSON assembled with ${promptsData.scenes.length} scenes.`);
