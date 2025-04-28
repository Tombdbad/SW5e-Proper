import React, { useRef, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-is-mobile';

interface StarfieldBackgroundProps {
  children?: React.ReactNode;
  starCount?: number;
  speed?: number;
  depth?: number;
  starColor?: string;
}

const StarfieldBackground: React.FC<StarfieldBackgroundProps> = ({
  children,
  starCount = 200,
  speed = 0.5,
  depth = 1000,
  starColor = '#FFFFFF',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isMobile = useIsMobile();
  const starsRef = useRef<{ x: number; y: number; z: number; size: number }[]>([]);
  const animationFrameRef = useRef<number>(0);

  // Adjust star count based on mobile devices
  const adjustedStarCount = isMobile ? Math.floor(starCount / 2) : starCount;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match the window
    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Initialize stars
    starsRef.current = Array(adjustedStarCount)
      .fill(null)
      .map(() => ({
        x: Math.random() * canvas.width - canvas.width / 2,
        y: Math.random() * canvas.height - canvas.height / 2,
        z: Math.random() * depth,
        size: Math.random() * 1.5 + 0.5,
      }));

    // Animation function
    const animate = () => {
      if (!canvas || !ctx) return;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate center of the screen
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Update and draw stars
      starsRef.current.forEach((star, index) => {
        // Move star closer to viewer
        star.z -= speed;

        // Reset star to far away once it gets too close
        if (star.z <= 0) {
          starsRef.current[index] = {
            x: Math.random() * canvas.width - centerX,
            y: Math.random() * canvas.height - centerY,
            z: depth,
            size: Math.random() * 1.5 + 0.5,
          };
        }

        // Calculate star position based on perspective
        const perspective = depth / (depth + star.z);
        const projectedX = star.x * perspective + centerX;
        const projectedY = star.y * perspective + centerY;

        // Skip if the star is out of canvas
        if (
          projectedX < 0 ||
          projectedX > canvas.width ||
          projectedY < 0 ||
          projectedY > canvas.height
        ) {
          return;
        }

        // Adjust star size based on perspective
        const projectedSize = star.size * perspective;

        // Draw star with a slight glow effect
        const opacity = Math.min(1, 0.5 + perspective * 0.5);
        ctx.beginPath();
        ctx.arc(projectedX, projectedY, projectedSize, 0, Math.PI * 2);
        ctx.fillStyle = starColor + Math.floor(opacity * 255).toString(16).padStart(2, '0');
        ctx.fill();

        // Add glow for larger stars
        if (projectedSize > 1) {
          ctx.beginPath();
          ctx.arc(projectedX, projectedY, projectedSize * 2, 0, Math.PI * 2);
          ctx.fillStyle = starColor + '20'; // Very transparent
          ctx.fill();
        }
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [adjustedStarCount, depth, speed, starColor]);

  return (
    <div className="relative w-full h-full min-h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-full pointer-events-none z-[-1]"
      />
      {children}
    </div>
  );
};

export default StarfieldBackground;