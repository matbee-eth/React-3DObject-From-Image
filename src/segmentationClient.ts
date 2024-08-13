import axios from 'axios';

export interface Prompt {
  point?: [number, number];
  box?: [number, number, number, number];
}

export async function segmentImage(imageData: string, prompts: Prompt[]) {
  try {
    const response = await axios.post('/segment', {
      image: imageData,
      prompts: prompts
    });
    return response.data.masks;
  } catch (error) {
    console.error('Error during image segmentation:', error);
    throw error;
  }
}