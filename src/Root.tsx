import React from 'react';
import { Composition } from 'remotion';
import { VoxBook, voxBookSchema, VoxThumbnail, thumbnailSchema } from './engines/vox';
import { AntidoteBook, antidoteBookSchema, AntidoteThumbnail, antidoteThumbPropsSchema } from './engines/antidote';
import { ChapterCard } from './engines/antidote/components/ChapterCard';
import { ANTIDOTE_LAB } from './engines/antidote/lab';
import { ANTIDOTE_LAB4 } from './engines/antidote/lab4';
import { CastSheet } from './engines/antidote/CastSheet';
import { RemocnShowcase } from './compositions/RemocnShowcase';
import { AntidoteShowcase } from './compositions/AntidoteShowcase';
import { AntidoteGazeShowcase } from './compositions/AntidoteGazeShowcase';
import { AntidoteHUDShowcase } from './compositions/AntidoteHUDShowcase';
import { AntidotePropsShowcase } from './compositions/AntidotePropsShowcase';
import { AntidoteMetaphorsShowcase, ANTIDOTE_METAPHORS_DURATION } from './compositions/AntidoteMetaphorsShowcase';
import { BOOKS, ANTIDOTE_BOOKS, BOOK_PALETTES, type Palette } from './books.generated';

const DEFAULT_PALETTE: Palette = { paper: '#EAF0E8', ink: '#1E2A24', red: '#F0A63C', gold: '#3E8E7A' };
const paletteFor = (slug: string): Palette => BOOK_PALETTES[slug] ?? DEFAULT_PALETTE;

export const RemotionRoot: React.FC = () => {
    return (
        <>
            {ANTIDOTE_BOOKS.map((b) => {
                const pal = paletteFor(b.slug);
                const t = b.meta?.thumbnail || b.config.meta.thumbnail;
                const title = b.meta?.title || b.config.meta.title;
                const author = (b.meta?.author || b.config.meta.author) ? 'by ' + (b.meta?.author || b.config.meta.author) : '';
                return (
                    <React.Fragment key={b.slug}>
                        <Composition
                            id={`Antidote-${b.slug}`}
                            component={AntidoteBook}
                            durationInFrames={b.config.meta.durationInFrames}
                            fps={b.config.meta.fps}
                            width={b.config.meta.width}
                            height={b.config.meta.height}
                            schema={antidoteBookSchema}
                            defaultProps={{ config: b.config }}
                        />
                        {b.engine === 'antidote' && t ? (
                            <Composition
                                id={`Thumb-${b.slug}`}
                                component={AntidoteThumbnail}
                                durationInFrames={1}
                                fps={30}
                                width={1280}
                                height={720}
                                schema={antidoteThumbPropsSchema}
                                defaultProps={{
                                    title,
                                    author,
                                    hook: t.hook,
                                    paper: pal.paper,
                                    ink: pal.ink,
                                    accent: pal.red,
                                    gold: pal.gold,
                                    variant: t.variant,
                                    action: t.action,
                                    expression: t.expression,
                                    motif: t.motif,
                                    slug: b.slug,
                                    heroImg: (t as any).image || `scenes/${b.slug}/thumbnail-hero.png`,
                                    layout: (t as any).layout,
                                }}
                            />
                        ) : null}
                    </React.Fragment>
                );
            })}
            {BOOKS.map((b) => (
                <React.Fragment key={b.slug}>
                    <Composition
                        id={`Vox-${b.slug}`}
                        component={VoxBook}
                        durationInFrames={b.config.meta.totalFrames}
                        fps={b.config.meta.fps}
                        width={b.config.meta.width}
                        height={b.config.meta.height}
                        schema={voxBookSchema}
                        defaultProps={{ config: b.config }}
                    />
                    {b.meta && b.engine !== 'antidote' ? (
                        <Composition
                            id={`Thumb-${b.slug}`}
                            component={VoxThumbnail}
                            durationInFrames={1}
                            fps={30}
                            width={1280}
                            height={720}
                            schema={thumbnailSchema}
                            defaultProps={{
                                title: b.meta.title,
                                author: b.meta.author ? 'by ' + b.meta.author : '',
                                hook: b.meta.thumbnail.hook,
                                heroCut: b.meta.thumbnail.cut,
                                heroImg: b.meta.thumbnail.image,
                                slug: b.slug,
                                layout: (b.meta.thumbnail as any).layout,
                            }}
                        />
                    ) : null}
                </React.Fragment>
            ))}

            {/* Antidote Engine 2.0 — Monumental Chapter / Law Card Preview */}
            <Composition
                id="Antidote-sample-chapter"
                component={ChapterCard as any}
                durationInFrames={120}
                fps={30}
                width={1920}
                height={1080}
                defaultProps={{
                    spec: {
                        category: "PART",
                        number: "I",
                        title: "THE COLLECTIVE CAGE",
                        subtitle: "The birth of individual consciousness",
                        accentColor: "#D4AF37",
                    },
                    accent: "#D4AF37",
                    durationFrames: 120,
                }}
            />

            {/* Antidote Engine 3.0 — full-body rig, walking/sitting/holding, real
                locations. A dev reel through the ordinary AntidoteBook path, so a
                regression here is a regression in every book. */}
            <Composition
                id="Antidote-lab"
                component={AntidoteBook}
                durationInFrames={ANTIDOTE_LAB.meta.durationInFrames}
                fps={ANTIDOTE_LAB.meta.fps}
                width={1920}
                height={1080}
                schema={antidoteBookSchema}
                defaultProps={{ config: ANTIDOTE_LAB } as any}
            />

            {/* Antidote 4.0 Phase A — MULTIPLANE (2.5D depth parallax) + LOOK-AT
                (characters orient toward each other / the motif). Same render
                path; compare against Antidote-lab (flat). */}
            <Composition
                id="Antidote4-lab"
                component={AntidoteBook}
                durationInFrames={ANTIDOTE_LAB4.meta.durationInFrames}
                fps={ANTIDOTE_LAB4.meta.fps}
                width={1920}
                height={1080}
                schema={antidoteBookSchema}
                defaultProps={{ config: ANTIDOTE_LAB4 } as any}
            />

            {/* What the parametric rig can look like — one rig, whole cast. */}
            <Composition
                id="Antidote-cast-sheet"
                component={CastSheet}
                durationInFrames={120}
                fps={30}
                width={1920}
                height={1080}
            />

            {/* Remocn Starter Component Showcase */}
            <Composition
                id="Remocn-Showcase"
                component={RemocnShowcase}
                durationInFrames={504}
                fps={24}
                width={1920}
                height={1080}
            />

            {/* Antidote Character Emotions & Micro-Reactions Showcase */}
            <Composition
                id="Antidote-Showcase"
                component={AntidoteShowcase}
                durationInFrames={360}
                fps={24}
                width={1920}
                height={1080}
            />

            {/* Antidote Living Gaze & Focus Tracking Showcase */}
            <Composition
                id="Antidote-Gaze"
                component={AntidoteGazeShowcase}
                durationInFrames={360}
                fps={24}
                width={1920}
                height={1080}
            />

            {/* Antidote Retention HUD Showcase */}
            <Composition
                id="Antidote-HUD"
                component={AntidoteHUDShowcase}
                durationInFrames={288}
                fps={24}
                width={1920}
                height={1080}
            />

            {/* Antidote Handprops Showcase */}
            <Composition
                id="Antidote-Props"
                component={AntidotePropsShowcase}
                durationInFrames={360}
                fps={24}
                width={1920}
                height={1080}
            />

            {/* Antidote Hypnotic Vector Metaphors Showcase */}
            <Composition
                id="Antidote-Metaphors"
                component={AntidoteMetaphorsShowcase}
                durationInFrames={ANTIDOTE_METAPHORS_DURATION}
                fps={24}
                width={1920}
                height={1080}
            />
        </>
    );
};
