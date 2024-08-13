from flask import Flask, request, jsonify
import subprocess
import os
import base64
from PIL import Image
import io

app = Flask(__name__)

@app.route('/generate-model', methods=['POST'])
def generate_model():
    data = request.json
    image_data = base64.b64decode(data['image'].split(',')[1])
    x = data['x']
    y = data['y']

    # Save the image temporarily
    img = Image.open(io.BytesIO(image_data))
    img_path = 'temp_image.png'
    img.save(img_path)

    # Run the 3D model generation script
    output_dir = 'output/'
    subprocess.run(['python', 'stable-fast-3d/run.py', img_path, '--output-dir', output_dir])

    # Get the path of the generated model
    model_path = os.path.join(output_dir, '0', 'mesh.glb')

    # TODO: In a real-world scenario, you would upload this file to a server
    # and return a URL. For now, we'll just return the local path.
    model_url = f'file://{os.path.abspath(model_path)}'

    # Clean up
    os.remove(img_path)

    return jsonify({'modelUrl': model_url})

if __name__ == '__main__':
    app.run(debug=True)