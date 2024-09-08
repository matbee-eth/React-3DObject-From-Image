import axios from 'axios';

export async function generateModelFromImage(maskedImageData: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  try {
    const response = await axios.post('/generate-model', 
      { image: maskedImageData },
      { 
        responseType: 'arraybuffer',
        signal: signal 
      }
    );
    
    // Check if the response is JSON (error message) or binary data (model file)
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('application/json')) {
      // It's an error message
      const error = JSON.parse(new TextDecoder().decode(response.data));
      throw new Error(error.error || 'Unknown error occurred');
    }
    
    return response.data;
  } catch (error) {
    if (axios.isCancel(error)) {
      console.log('Request canceled:', error.message);
    } else {
      console.error('Error generating 3D model:', error);
    }
    throw error;
  }
}