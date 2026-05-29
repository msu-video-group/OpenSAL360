import numpy as np
import os
from glob import glob
from tqdm import tqdm
import argparse
from collections import defaultdict

from saliency_torch import getSaliencyDyn_torch
from processing_raw_data import loadRawData
import processing_fixations
import json

import torch
import cv2
from cv2 import imwrite
from tqdm import tqdm

def align_tensors(tensor1, target_shape):
	if tensor1.shape[0] == target_shape[0]:
		return tensor1
	larger = torch.zeros(target_shape, dtype=tensor1.dtype, device=tensor1.device)
	min_dim0 = min(tensor1.shape[0], target_shape[0])
	larger[:min_dim0, :, :] = tensor1[:min_dim0, : , :]
	return larger


def create_one_salmap(video_path, path_out, args):
	DIM = [args.height, args.width]
	FRAME_COUNT = 0

	fix_lists = []
	files = glob("{}*.csv".format(video_path))

	video_name = os.path.basename(video_path.rstrip('/'))

	sal_map = None
	fix_map = None
	fix = None
	
	for ipath, path in tqdm(enumerate(files)):

		frame_data = np.loadtxt(path, delimiter=",", usecols=[0, 1], skiprows=1)
		frame_data[:, 0] -= frame_data[0, 0]
		frame_data[:, 0] /= 1e6
		fix_list = loadRawData(path, DIM)
		frame_data = frame_data[:, 1]

		# This will be used to determine what are the starting and ending frames of fixations
		frame_data = frame_data.astype(int) # Remove decimal part
		FRAME_COUNT = max(np.max(frame_data), FRAME_COUNT)
		# Update output saliency dimensions with the number of frames
		dim = [FRAME_COUNT]+DIM

		start_frame = frame_data[fix_list[:, 5].astype(int)]
		first_frame = start_frame[0]
		end_frame = frame_data[fix_list[:, 6].astype(int)]+1
		fix_list = np.hstack([ fix_list, start_frame[:, None], end_frame[:, None] ])
		# Generate saliency video from loaded data

		if sal_map is None:
			device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
			sal_map=torch.zeros(dim, dtype=torch.float32, device=device, requires_grad=False)
		else:
			sal_map = align_tensors(sal_map, dim)

		getSaliencyDyn_torch(sal_map, torch.as_tensor(fix_list, dtype=torch.float32, device=device), gauss_sigma=args.sigma, time_cut = torch.as_tensor(frame_data, dtype=torch.int32, device=device))

		fix_lists.append(fix_list)

	min_vals = sal_map.amin(dim=(1, 2), keepdim=True)
	max_vals = sal_map.amax(dim=(1, 2), keepdim=True)

	range_vals = max_vals.sub(min_vals)
	range_vals = torch.where(range_vals > 0, range_vals, torch.tensor(1.0, device=sal_map.device))

	sal_map.sub_(min_vals)
	sal_map.div_(range_vals)

	if args.save:
		os.makedirs(os.path.join(path_out, 'gauss'), exist_ok=True)
		os.makedirs(os.path.join(path_out, 'fixations'), exist_ok=True)
		
		fix = processing_fixations.get_fixation(fix_lists, os.path.join(path_out, 'fix.json'))
		fix_map = processing_fixations.get_fixmap(None, fix, dim)
		max_vals = np.max(fix_map, axis=(1, 2), keepdims=True)
		max_vals = np.where(max_vals > 0, max_vals, 1.0)
		fix_map_normalized = (fix_map / max_vals * 255).astype(np.uint8)
		
		for i in tqdm(range(first_frame, sal_map.shape[0]), desc="Saving"):
			sal_map_np = (sal_map[i].cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
			sal_map_dst = os.path.join(path_out, 'gauss', f'{i:06d}.png')
			cv2.imwrite(sal_map_dst, sal_map_np)
			
			fix_map_dst = os.path.join(path_out, 'fixations', f'{i:06d}.png')
			cv2.imwrite(fix_map_dst, fix_map_normalized[i])

def process_videos(args):

	with open(args.path_metadata) as f:
		video_infos = json.load(f)

	for video_name in video_infos.keys():
		is_validation = bool(video_infos[video_name]['is_validation'])
		if is_validation:
			continue

		video_path = os.path.join(args.path_data, video_name)
		
		if not os.path.exists(video_path):
			continue
			
		path_out = os.path.join(args.path_out, video_name)

		create_one_salmap(f'{video_path}/', path_out, args)

if __name__ == '__main__':
	parser = argparse.ArgumentParser()
	parser.add_argument('--path_data', type=str, required=True)
	parser.add_argument('--path_out', type=str, required=True)
	parser.add_argument('--path_metadata', type=str, required=True)
	parser.add_argument('--sigma', type=float, default=5)
	parser.add_argument('--height', type=int, default=960)
	parser.add_argument('--width', type=int, default=1920)
	parser.add_argument('--save', action='store_true')
	args = parser.parse_args()

	process_videos(args)