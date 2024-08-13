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
from scipy import ndimage

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

    try:
        data = request.json
        image_data = base64.b64decode(data['image'].split(',')[1])

        # Save the image temporarily
        img = Image.open(io.BytesIO(image_data))
        img_path = 'temp_image.png'
        img.save(img_path)

        # Run the 3D model generation script
        output_dir = 'output/'
        result = subprocess.run(
            ['python', 'stable-fast-3d/run.py', img_path, '--output-dir', output_dir],
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            logging.error(f"Model generation failed: {result.stderr}")
            return jsonify({
                'error': 'Failed to generate 3D model',
                'details': result.stderr
            }), 500

        # Get the path of the generated model
        model_path = os.path.join(output_dir, '0', 'mesh.glb')

        if not os.path.exists(model_path):
            logging.error(f"Generated model file not found at {model_path}")
            return jsonify({
                'error': 'Generated model file not found',
                'details': 'The expected output file was not created'
            }), 500

        # Clean up
        os.remove(img_path)

        return send_file(model_path, mimetype='model/gltf-binary')

    except Exception as e:
        logging.exception("An error occurred during model generation")
        return jsonify({
            'error': 'An unexpected error occurred',
            'details': str(e)
        }), 500


def non_max_suppression(masks, scores, iou_threshold, min_area_ratio=0.02):
    order = np.argsort(scores)[::-1]
    keep = []
    total_area = masks[0].shape[0] * masks[0].shape[1]
    while order.size > 0:
        i = order[0]
        if np.sum(masks[i]) / total_area >= min_area_ratio:
            keep.append(i)
            if order.size == 1:
                break
            iou = compute_iou(masks[i], masks[order[1:]])
            inds = np.where(iou <= iou_threshold)[0]
            order = order[inds + 1]
        else:
            order = order[1:]
    return keep

def compute_iou(mask1, mask2):
    intersection = np.logical_and(mask1, mask2)
    union = np.logical_or(mask1, mask2)
    return np.sum(intersection) / np.sum(union)

def connected_component_analysis(mask):
    labeled, num_features = ndimage.label(mask)
    if num_features > 1:
        sizes = ndimage.sum(mask, labeled, range(1, num_features + 1))
        max_label = np.argmax(sizes) + 1
        return labeled == max_label
    return mask

@app.route('/segment', methods=['POST'])
def segment_image():
    data = request.json
    image_data = base64.b64decode(data['image'])
    image = cv2.imdecode(np.frombuffer(image_data, np.uint8), cv2.IMREAD_COLOR)
    
    min_score = float(data.get('min_score', 0.9))
    max_masks = int(data.get('max_masks', 20))
    iou_threshold = float(data.get('iou_threshold', 0.5))
    min_area_ratio = float(data.get('min_area_ratio', 0.02))
    
    logging.debug(f"Received image shape: {image.shape}")
    logging.debug(f"Minimum score threshold: {min_score}")
    logging.debug(f"Maximum number of masks: {max_masks}")
    logging.debug(f"IOU threshold: {iou_threshold}")
    logging.debug(f"Minimum area ratio: {min_area_ratio}")
    
    predictor.set_image(image)
    
    point_coords = np.array(data['point_coords'])
    point_labels = np.array(data['point_labels'])
    
    logging.debug(f"Received point coordinates: {point_coords}")
    logging.debug(f"Received point labels: {point_labels}")
    
    masks, scores, _ = predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        multimask_output=True
    )
    
    # # Filter by score and apply connected component analysis
    # valid_indices = np.where(scores >= min_score)[0]
    # masks = masks[valid_indices]
    # scores = scores[valid_indices]
    # masks = np.array([connected_component_analysis(mask) for mask in masks])
    
    # # Apply Non-Maximum Suppression with area filtering
    # keep_indices = non_max_suppression(masks, scores, iou_threshold, min_area_ratio)
    # masks = masks[keep_indices]
    # scores = scores[keep_indices]
    
    # # Sort by area and limit total number of masks
    # areas = np.sum(masks, axis=(1, 2))
    # sorted_indices = np.argsort(areas)[::-1]
    # masks = masks[sorted_indices][:max_masks]
    # scores = scores[sorted_indices][:max_masks]
    
    all_masks = []
    for i, (mask, score) in enumerate(zip(masks, scores)):
        logging.debug(f"Mask {i} shape: {mask.shape}, dtype: {mask.dtype}")
        logging.debug(f"Mask {i} area: {np.sum(mask)}, score: {score}")
        
        all_masks.append({
            'float_mask': mask.tolist(),
            'binary_mask': mask.astype(int).tolist(),
            'score': score.item(),
            'area': int(np.sum(mask))
        })
    
    logging.debug(f"Total number of masks after filtering: {len(all_masks)}")
    
    return jsonify({'masks': all_masks})


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False)