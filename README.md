# 3D Object Generation from Segmented Image

This project demonstrates an application that generates 3D objects from segmented images using AI-powered image generation and segmentation techniques.

## Features

- Image generation from text prompts using ComfyUI
- Image segmentation using SAM2 (Segment Anything Model 2)
- 3D model generation from segmented image parts
- Interactive 3D scene visualization using Three.js and React Three Fiber

## Technologies Used

- React
- TypeScript
- Three.js
- React Three Fiber
- ComfyUI
- SAM2 (Segment Anything Model 2)
- Flask (for backend services)

## Setup and Installation

1. Clone the repository
2. Install frontend dependencies:
   ```
   npm install
   ```
3. Install backend dependencies:
   ```
   pip install -r requirements.txt
   ```
4. Start the Flask backend server:
   ```
   python service/sam_segmentation_service.py
   ```
5. Start the React development server:
   ```
   npm start
   ```

## Usage

1. Enter a text prompt to generate an image
2. Click on the generated image to select a segment
3. The application will attempt to create a 3D model from the selected segment
4. View and interact with the 3D model in the right panel

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.


