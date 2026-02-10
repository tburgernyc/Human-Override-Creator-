
import React, { useEffect, useRef } from 'react';

interface LiveWaveformProps {
  stream: MediaStream | null;
  isActive: boolean;
  color?: string;
}

export const LiveWaveform: React.FC<LiveWaveformProps> = ({ stream, isActive, color = '#3b82f6' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const analyzerRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!isActive || !stream) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyzer = audioCtx.createAnalyser();
    analyzer.fftSize = 256;
    source.connect(analyzer);
    analyzerRef.current = analyzer;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyzer.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        
        ctx.fillStyle = color;
        ctx.globalAlpha = 1;
        ctx.fillRect(x, canvas.height - 2, barWidth, 2);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
      audioCtx.close();
    };
  }, [isActive, stream, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={120} 
      height={30} 
      className="opacity-80"
    />
  );
};
