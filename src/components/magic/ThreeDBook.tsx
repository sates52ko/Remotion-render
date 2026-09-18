import React, { useRef } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useVideoConfig, useCurrentFrame, interpolate, staticFile, Img } from 'remotion';
import * as THREE from 'three';

interface ThreeDBookProps {
	coverImage?: string;
	title: string;
}

const BookModel: React.FC<{ coverImage: string }> = ({ coverImage }) => {
	const frame = useCurrentFrame();
	const meshRef = useRef<THREE.Mesh>(null);

	const rotationY = interpolate(frame, [0, 120], [0, Math.PI * 2]);
	const rotationX = interpolate(frame, [0, 120], [0.2, 0.4]);

	return (
		<group rotation={[rotationX, rotationY, 0]}>
			<mesh ref={meshRef}>
				<boxGeometry args={[3, 4.5, 0.5]} />
				<meshStandardMaterial color="#2c3e50" attach="material-0" /> {/* Right */}
				<meshStandardMaterial color="#2c3e50" attach="material-1" /> {/* Left */}
				<meshStandardMaterial color="#ecf0f1" attach="material-2" /> {/* Top (Pages) */}
				<meshStandardMaterial color="#ecf0f1" attach="material-3" /> {/* Bottom (Pages) */}
				<meshStandardMaterial attach="material-4">
					<videoTexture attach="map" args={[new THREE.VideoTexture(document.createElement('video'))]} /> 
                     {/* Replace with actual image texture in production */}
				</meshStandardMaterial>
				<meshStandardMaterial color="#2c3e50" attach="material-5" /> {/* Back */}
			</mesh>
		</group>
	);
};

export const ThreeDBook: React.FC<ThreeDBookProps> = ({ coverImage, title }) => {
	const { width, height } = useVideoConfig();

	return (
		<div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
			<ThreeCanvas width={width} height={height}>
				<ambientLight intensity={0.5} />
				<pointLight position={[10, 10, 10]} intensity={1} />
				<BookModel coverImage={coverImage || staticFile('cover-placeholder.png')} />
			</ThreeCanvas>
			<div style={{ position: 'absolute', bottom: 100, color: 'white', fontSize: 60, fontFamily: 'Inter' }}>
				{title}
			</div>
		</div>
	);
};
