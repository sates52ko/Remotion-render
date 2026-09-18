import React from 'react';
import {
    AbsoluteFill,
    Audio,
    Sequence,
    useVideoConfig,
    staticFile,
} from 'remotion';
import { z } from 'zod';
import { narrativeLabsTheme } from '../../themes/narrativeLabs';
import { parseSRT } from '../../utils/srtParser';
import { ParticleBackground } from '../../components/ParticleBackground';
import { AnimatedCaption } from '../../components/AnimatedCaption';

export const scienceVideoSchema = z.object({
    title: z.string(),
    audioFile: z.string(),
    vttFile: z.string(),
    vttContent: z.string().optional(), // Fallback if file not used
});

export type ScienceVideoProps = z.infer<typeof scienceVideoSchema>;

export const ScienceVideo: React.FC<ScienceVideoProps> = ({ 
    title, 
    audioFile, 
    vttFile,
    vttContent 
}) => {
    const { durationInFrames } = useVideoConfig();
    const theme = narrativeLabsTheme;
    
    // We expect the VTT content to be passed or we could try to fetch it, 
    // but usually in Remotion we pass it as a prop from Root.tsx defaultProps
    const captions = parseSRT(vttContent || "");

    return (
        <AbsoluteFill style={{ backgroundColor: '#000' }}>
            {/* Technical Background */}
            <ParticleBackground 
                theme={theme} 
                seed={title} 
                particleCount={80} 
            />
            
            {/* Grid Overlay for "Science" feel */}
            <AbsoluteFill style={{ 
                backgroundImage: `linear-gradient(${theme.text.accent}0a 1px, transparent 1px), linear-gradient(90deg, ${theme.text.accent}0a 1px, transparent 1px)`,
                backgroundSize: '50px 50px',
                pointerEvents: 'none'
            }} />

            {/* Main Content Sequence */}
            <Sequence from={0} durationInFrames={durationInFrames}>
                <Audio src={staticFile(audioFile)} />

                <AnimatedCaption
                    captions={captions}
                    theme={theme}
                    style="karaoke"
                    position="center"
                    fontSize={60}
                />

                {/* Technical Title Overlay */}
                <AbsoluteFill style={{ pointerEvents: 'none' }}>
                    <div
                        style={{
                            position: 'absolute',
                            top: 40,
                            left: 40,
                            padding: '10px 20px',
                            borderLeft: `4px solid ${theme.text.accent}`,
                            backgroundColor: 'rgba(0,0,0,0.4)',
                            backdropFilter: 'blur(5px)',
                        }}
                    >
                        <h1 style={{ 
                            margin: 0, 
                            fontSize: 28, 
                            color: theme.text.primary, 
                            fontFamily: 'Inter, sans-serif',
                            textTransform: 'uppercase',
                            letterSpacing: '2px'
                        }}>
                            {title}
                        </h1>
                        <div style={{
                            fontSize: 12,
                            color: theme.text.accent,
                            marginTop: 4,
                            opacity: 0.8
                        }}>
                            NARRATIVE LABS // SYSTEM_ACTIVE
                        </div>
                    </div>
                </AbsoluteFill>
            </Sequence>
        </AbsoluteFill>
    );
};
