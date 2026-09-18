const fs = require('fs');
const path = require('path');

const promptsFile = 'scene-prompts.txt';
const jsonFile = 'production-single-dad-dilemma.json';

try {
    const promptsText = fs.readFileSync(promptsFile, 'utf8');
    const lines = promptsText.split('\n').filter(l => l.trim());
    
    // Parse total duration from the last chapter or VTT if needed.
    // Based on the file view, Part 10 ends at 1634.
    const totalDuration = 1634;
    const sceneDuration = totalDuration / lines.length;

    const scenes = lines.map((line, i) => {
        // Clean up prompt: "1. scene-00: description... --ar 16:9"
        let description = line;
        const match = line.match(/^\d+\.\s+scene-\d+:\s+(.*)$/);
        if (match) {
            description = match[1];
        }
        description = description.replace(/\s+--ar\s+\d+:\d+$/, '');

        const sceneId = `scene-${i.toString().padStart(2, '0')}`;
        
        return {
            id: sceneId,
            startTime: Number((i * sceneDuration).toFixed(2)),
            endTime: Number(((i + 1) * sceneDuration).toFixed(2)),
            image: `scenes/${sceneId}.png`,
            description: description,
            showThreeD: i < 2, // Scene 00 and 01 as requested
            animations: [
                {
                    type: i % 2 === 0 ? 'kenburns' : 'panDrift',
                    easing: 'ease-in-out',
                    params: i % 2 === 0 ? { 
                        fromScale: 1.0, 
                        toScale: 1.15,
                        fromX: 0,
                        fromY: 0,
                        toX: i % 4 === 0 ? 5 : -5,
                        toY: i % 3 === 0 ? 5 : -5
                    } : { 
                        speed: 1.2,
                        direction: i % 2 === 0 ? 'right' : 'left'
                    }
                }
            ],
            transition: {
                type: indexToTransition(i),
                duration: 1.5
            }
        };
    });

    function indexToTransition(i) {
        const types = ['fade', 'slide', 'wipe', 'clock'];
        return types[i % types.length];
    }

    const config = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    config.scenes = scenes;
    
    // Ensure letterbox is enabled for premium feel
    config.letterbox = true;
    config.channelName = "Good Book Summary";

    fs.writeFileSync(jsonFile, JSON.stringify(config, null, 2));
    console.log(`Successfully added ${scenes.length} scenes to ${jsonFile}`);

} catch (error) {
    console.error('Error updating JSON:', error);
    process.exit(1);
}
