import React, { useState, useEffect, useRef } from 'react'
import './App.css'
import { Scene3D } from './Scene3D'
import { segmentImage } from './segmentationClient'
import { generateImage } from './comfyUIService'
import debounce from 'lodash/debounce'
import { generateModelFromImage } from './imageToModelService'

export interface Mask {
  float_mask: number[][];
  binary_mask: number[][];
  score: number;
  area: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface MaskedImageResult {
  imageData: ImageData;
  base64: string;
}

export const extractMaskedImage = (imageData: ImageData, mask: Mask): MaskedImageResult => {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.putImageData(imageData, 0, 0);
    const imageData2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < mask.binary_mask.length; y++) {
      for (let x = 0; x < mask.binary_mask[y].length; x++) {
        const index = (y * canvas.width + x) * 4;
        if (mask.binary_mask[y][x] === 0) {
          imageData2.data[index + 3] = 0; // Set alpha to 0 for non-mask pixels
        }
      }
    }
    ctx.putImageData(imageData2, 0, 0);
    return {
      imageData: imageData2,
      base64: canvas.toDataURL()
    };
  }
  return {
    imageData: imageData,
    base64: ''
  };
};
function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [minScore, setMinScore] = useState<number>(0.9);
  const [maxMasks, setMaxMasks] = useState<number>(20);
  const [iouThreshold, setIouThreshold] = useState<number>(0.5);
  const [minAreaRatio, setMinAreaRatio] = useState<number>(0.02);
  const [points, setPoints] = useState<Point[]>([]);

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

  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleImageGeneration = async () => {
    setIsGenerating(true);
    setMasks([]);
    setPoints([]);
    setModelUrl(null);
    setImageUrl(null);

    // Cancel any ongoing requests
    if (abortController) {
      abortController.abort();
    }

    // Create a new AbortController for this request
    const newAbortController = new AbortController();
    setAbortController(newAbortController);

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
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was aborted');
      } else {
        console.error("Error generating image:", error);
      }
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const debouncedSegmentImage = useRef(
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
        try {
          const segmentationMasks = await segmentImage(imageDataUrl.split(',')[1], prompts, {
            minScore,
            maxMasks,
            iouThreshold,
            minAreaRatio
          });
          setMasks(segmentationMasks);

          const bestMask = segmentationMasks.reduce((prev, current) => (prev.score > current.score) ? prev : current);
          const maskedImageData = extractMaskedImage(imageData, bestMask);
          if (!maskedImageData) return;

          // Cancel any ongoing requests
          if (abortController) {
            abortController.abort();
          }

          // Create a new AbortController for this request
          const newAbortController = new AbortController();
          setAbortController(newAbortController);

          const modelData = await generateModelFromImage(maskedImageData.base64, newAbortController.signal);
          console.debug('handleImageGeneration', modelData);
          const blob = new Blob([modelData], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          setModelUrl(url);
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') {
                console.log('Request was aborted');
          } else {
            console.error('Error during image segmentation or model generation:', error);
          }
        } finally {
          setAbortController(null);
        }
      }
    }, 500)).current


  useEffect(() => {
    if (imageData && points.length > 0) {
      debouncedSegmentImage(imageData, points);
    }
  }, [imageData, points]);

  const handleImageClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    console.debug('handleImageClick', canvas);
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      setPoints(prevPoints => [...prevPoints, { x, y }]);
    }
  };
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
      {imageUrl && imageData && (
        <Scene3D
          imageUrl={imageUrl} 
          masks={masks} 
          imageData={imageData}
          modelUrl={modelUrl}
          points={points}
          onImageClick={handleImageClick}
        />
      )}
    </div>
  )
}

export default App