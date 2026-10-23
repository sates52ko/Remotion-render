import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

interface GradientTextProps {
	text: string;
	colors?: string[];
	fontSize?: number;
	className?: string;
}

export const GradientText: React.FC<GradientTextProps> = ({
	text,
	colors = ['#00d2ff', '#3a7bd5'],
	fontSize = 80,
	className = '',
}) => {
	const frame = useCurrentFrame();
	
	const gradientShift = interpolate(
		frame % 120,
		[0, 120],
		[0, 100]
	);

	return (
		<h1
			className={`font-bold ${className}`}
			style={{
				fontSize: `${fontSize}px`,
				background: `linear-gradient(${gradientShift}deg, ${colors.join(', ')})`,
				WebkitBackgroundClip: 'text',
				WebkitTextFillColor: 'transparent',
				backgroundSize: '200% 200%',
				textAlign: 'center',
				margin: 0,
				padding: '20px',
				filter: 'drop-shadow(0 5px 15px rgba(0,0,0,0.3))',
			}}
		>
			{text}
		</h1>
	);
};
