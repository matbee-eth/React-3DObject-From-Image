import { ComfyUIWeb } from 'comfy-client';
import type { Prompt } from '@artifyfun/comfy-ui-client';


const client = new ComfyUIWeb("http://localhost:5173/ComfyBackendDirect");

export async function generateImage(prompt: string): Promise<string[]> {
  const workflow: Prompt = {
    "3": {
      inputs: {
        seed: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
        steps: 30,
        cfg: 8,
        sampler_name: "dpmpp_2m_sde_gpu",
        scheduler: "karras",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
      class_type: "KSampler",
    },
    "4": {
      inputs: { ckpt_name: "realcartoonXL_v6.safetensors" },
      class_type: "CheckpointLoaderSimple",
    },
    "5": {
      inputs: { width: 1024, height: 1024, batch_size: 1 },
      class_type: "EmptyLatentImage",
    },
    "6": {
      inputs: { text: prompt, clip: ["4", 1] },
      class_type: "CLIPTextEncode",
    },
    "7": {
      inputs: {
        text: "text,error,username,fake,drawing,painting,worst quality, bad anatomy, NG_DeepNegative_V1_75T,",
        clip: ["4", 1],
      },
      class_type: "CLIPTextEncode",
    },
    "8": {
      inputs: { samples: ["3", 0], vae: ["4", 2] },
      class_type: "VAEDecode",
    },
    "9": {
      inputs: { filename_prefix: "ComfyUI", images: ["8", 0] },
      class_type: "SaveImage",
    },
  };

  try {
    const images: any = await client.genWithWorkflow(workflow);
    console.log(images);
    return images["9"] as string[];
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
}