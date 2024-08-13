import React, { useState } from 'react'
import './App.css'
import { Scene3D } from './Scene3D'
import { segmentImage } from './segmentationClient'
import { generateImage } from './comfyUIService'

interface Mask {
  float_mask: number[][];
  binary_mask: number[][];
  score: number[];
}

function App() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePrompts = (width: number, height: number, count: number) => {
    const prompts: { point: [number,number] }[] = [];
    for (let i = 0; i < count; i++) {
      prompts.push({
        point: [
          Math.floor(Math.random() * width),
          Math.floor(Math.random() * height)
        ]
      });
    }
    return prompts;
  };

  const handleImageGeneration = async () => {
    setIsGenerating(true);
    try {
      const res = await generateImage(prompt);
      const url = res[res.length - 1]
      setImageUrl(url);
      
      const response = await fetch(url);
      const blob = await response.blob();
      const imageDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          setImageData(imgData);
        }

        const prompts = generatePrompts(img.width, img.height, 10); // Generate 10 random prompts
        const segmentationMasks = await segmentImage(imageDataUrl.split(',')[1], prompts);
        setMasks(segmentationMasks);
      };
      img.src = imageDataUrl;
    } catch (error) {
      console.error("Error generating or segmenting image:", error);
    } finally {
      setIsGenerating(false);
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
        />
      )}
    </div>
  )
}

export default App