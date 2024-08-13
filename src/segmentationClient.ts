import axios from 'axios';

interface SegmentationOptions {
  minScore?: number;
  maxMasks?: number;
  iouThreshold?: number;
  minAreaRatio?: number;
}

export async function segmentImage(
  imageData: string, 
  prompts: [number, number][], 
  options: SegmentationOptions = {}
) {
  const { minScore = 0.3, maxMasks = 20, iouThreshold = 0.1, minAreaRatio = 0.02  } = options;
  
  try {
    const response = await axios.post('/segment', {
      image: imageData,
      point_coords: prompts,
      point_labels: prompts.map(() => 1), // All points are foreground
      min_score: minScore,
      max_masks: maxMasks,
      iou_threshold: iouThreshold,
      minAreaRatio: minAreaRatio
    });
    return response.data.masks;
  } catch (error) {
    console.error('Error during image segmentation:', error);
    throw error;
  }
}