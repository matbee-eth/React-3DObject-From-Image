import io
import json
import os
import subprocess
from flask import Flask, request, jsonify, send_file
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor
import numpy as np
import cv2
import base64
import logging
from PIL import Image

app = Flask(__name__)
logging.basicConfig(level=logging.DEBUG)

# Initialize SAM 2 model
sam2_checkpoint = "/home/acidhax/dev/Grounded-SAM-2/checkpoints/sam2_hiera_large.pt"
model_cfg = "sam2_hiera_l.yaml"
device = "cuda"  # or "cpu" if CUDA is not available
sam2_model = build_sam2(model_cfg, sam2_checkpoint, device=device)
predictor = SAM2ImagePredictor(sam2_model)

@app.route('/generate-model', methods=['POST', 'OPTIONS'])
def generate_model():
    if request.method == 'OPTIONS':
        # Respond to the preflight request
        response = app.make_default_options_response()
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response

    data = request.json
    image_data = base64.b64decode(data['image'].split(',')[1])

    # Save the image temporarily
    img = Image.open(io.BytesIO(image_data))
    img_path = 'temp_image.png'
    img.save(img_path)
    
    # Run the 3D model generation script
    output_dir = 'output/'
    result = subprocess.run(['python', 'stable-fast-3d/run.py', img_path, '--output-dir', output_dir], capture_output=True)
    
    # Check if the script ran successfully
    if result.returncode != 0:
        return json.dumps({'error': 'Failed to generate 3D model', 'details': result.stderr}), 500, {'Content-Type': 'application/json'}

    # Get the path of the generated model
    model_path = os.path.join(output_dir, '0', 'mesh.glb')

    # Check if the file exists
    if not os.path.exists(model_path):
        return json.dumps({'error': 'Generated model file not found'}), 500, {'Content-Type': 'application/json'}

    # Clean up
    os.remove(img_path)

    # Send the GLB file directly
    return send_file(model_path, mimetype='model/gltf-binary')



@app.route('/segment', methods=['POST'])
def segment_image():
    data = request.json
    image_data = base64.b64decode(data['image'])
    image = cv2.imdecode(np.frombuffer(image_data, np.uint8), cv2.IMREAD_COLOR)
    
    logging.debug(f"Received image shape: {image.shape}")
    
    predictor.set_image(image)
    
    prompts = data['prompts']
    masks = []
    for i, prompt in enumerate(prompts):
        if 'point' in prompt:
            mask, score, _ = predictor.predict(
                point_coords=np.array([prompt['point']]),
                point_labels=np.array([1]),
                multimask_output=False
            )
        elif 'box' in prompt:
            mask, score, _ = predictor.predict(
                box=np.array([prompt['box']]),
                multimask_output=False
            )
        
        logging.debug(f"Mask {i} shape: {mask.shape}, dtype: {mask.dtype}")
        logging.debug(f"Mask {i} min: {mask.min()}, max: {mask.max()}, mean: {mask.mean()}")
        logging.debug(f"Mask {i} score: {score}")
        
        masks.append({
            'float_mask': mask.squeeze().tolist(),
            'binary_mask': (mask.squeeze() > 0.5).astype(int).tolist(),
            'score': score.tolist()
        })
    
    logging.debug(f"Number of masks: {len(masks)}")
    
    return jsonify({'masks': masks})

if __name__ == '__main__':
    app.run(debug=True, use_reloader=False)