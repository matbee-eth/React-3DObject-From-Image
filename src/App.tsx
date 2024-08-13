import React, { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'
import { Scene3D } from './Scene3D'
import { segmentImage } from './segmentationClient'
import { generateImage } from './comfyUIService'
import debounce from 'lodash/debounce'

interface Mask {
  float_mask: number[][];
  binary_mask: number[][];
  score: number;
  area: number;
}

interface Point {
  x: number;
  y: number;
}

function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [minScore, setMinScore] = useState<number>(0.9);
  const [maxMasks, setMaxMasks] = useState<number>(20);
  const [iouThreshold, setIouThreshold] = useState<number>(0.5);
  const [minAreaRatio, setMinAreaRatio] = useState<number>(0.02);
  const [points, setPoints] = useState<Point[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scoreParam = params.get('minScore');
    const maxMasksParam = params.get('maxMasks');
    const iouThresholdParam = params.get('iouThreshold');
    const minAreaRatioParam = params.get('minAreaRatio');
    
    if (scoreParam) setMinScore(parseFloat(scoreParam));
    if (maxMasksParam) setMaxMasks(parseInt(maxMasksParam));
    if (iouThresholdParam) setIouThreshold(parseFloat(iouThresholdParam));
    if (minAreaRatioParam) setMinAreaRatio(parseFloat(minAreaRatioParam));
  }, []);

  const handleImageGeneration = async () => {
    setIsGenerating(true);
    try {
      const res = await generateImage(prompt);
      const url = res[res.length - 1];
      setImageUrl(url);
      
      const response = await fetch(url);
      const blob = await response.blob();
      const imageDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          setImageData(imgData);
        }
      };
      img.src = imageDataUrl;
    } catch (error) {
      console.error("Error generating image:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setPoints(prevPoints => [...prevPoints, { x, y }]);
    }
  };

  const debouncedSegmentImage = useCallback(
    debounce(async (imageData: ImageData, points: Point[]) => {
      if (points.length === 0) return;
      
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.putImageData(imageData, 0, 0);
        const imageDataUrl = canvas.toDataURL();
        
        const prompts = points.map(p => [p.x, p.y] as [number, number]);
        const segmentationMasks = await segmentImage(imageDataUrl.split(',')[1], prompts, {
          minScore,
          maxMasks,
          iouThreshold,
          minAreaRatio
        });
        setMasks(segmentationMasks);
      }
    }, 500),
    [minScore, maxMasks, iouThreshold, minAreaRatio]
  );

  useEffect(() => {
    if (imageData && points.length > 0) {
      debouncedSegmentImage(imageData, points);
    }
  }, [imageData, points, debouncedSegmentImage]);

  const drawPointsOnCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && imageData) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.putImageData(imageData, 0, 0);
        points.forEach((point, index) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = index === points.length - 1 ? 'red' : 'blue';
          ctx.fill();
        });
      }
    }
  };

  useEffect(() => {
    drawPointsOnCanvas();
  }, [points, imageData]);

  return (
    <div className="App">
      <h1>3D Object Generation from Segmented Image</h1>
      <input 
        type="text" 
        value={prompt} 
        onChange={(e) => setPrompt(e.target.value)} 
        placeholder="Enter image prompt"
        disabled={isGenerating}
      />
      <button onClick={handleImageGeneration} disabled={isGenerating}>
        {isGenerating ? 'Generating...' : 'Generate Image'}
      </button>
      {imageData && (
        <canvas
          ref={canvasRef}
          width={imageData.width}
          height={imageData.height}
          onClick={handleImageClick}
          style={{ border: '1px solid black', cursor: 'crosshair' }}
        />
      )}
      {imageUrl && imageData && (
        <Scene3D 
          imageUrl={imageUrl} 
          masks={masks} 
          imageData={imageData}
        />
      )}
    </div>
  )
}

export default App