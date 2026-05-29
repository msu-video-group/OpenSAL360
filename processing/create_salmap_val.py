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
from saliencyMetrics_pytorch import cc_360, sim_360, nss_360, auc_judd_360, get_weight_map, read_sm

def align_tensors(tensor1, target_shape):
	if tensor1.shape[0] == target_shape[0]:
		return tensor1
	larger = torch.zeros(target_shape, dtype=tensor1.dtype, device=tensor1.device)
	min_dim0 = min(tensor1.shape[0], target_shape[0])
	larger[:min_dim0, :, :] = tensor1[:min_dim0, : , :]
	return larger


def create_one_salmap(path_csv, path_out, args):
	DIM = [args.height, args.width]
	FRAME_COUNT = 0

	fix_lists = []

	sal_map = None
	fix_map = None
	fix = None
	
	video_name = os.path.basename(os.path.dirname(path_csv.rstrip('/')))

	frame_data = np.loadtxt(path_csv, delimiter=",", usecols=[0, 1], skiprows=1)
	frame_data[:, 0] -= frame_data[0, 0]
	frame_data[:, 0] /= 1e6
	fix_list = loadRawData(path_csv, DIM)
	frame_data = frame_data[:, 1]

	# This will be used to determine what are the starting and ending frames of fixations
	frame_data = frame_data.astype(int) # Remove decimal part
	FRAME_COUNT = max(np.max(frame_data), FRAME_COUNT)
	# Update output saliency dimensions with the number of frames
	dim = [FRAME_COUNT]+DIM

	start_frame = frame_data[fix_list[:, 5].astype(int)]
	end_frame = frame_data[fix_list[:, 6].astype(int)]+1
	fix_list = np.hstack([ fix_list, start_frame[:, None], end_frame[:, None] ])
	# Generate saliency video from loaded data

	if sal_map is None:
		# print("cuda" if torch.cuda.is_available() else "cpu")
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
		
		for i in tqdm(range(sal_map.shape[0]), desc="Saving"):
			sal_map_np = (sal_map[i].cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
			sal_map_dst = os.path.join(path_out, 'gauss', f'f{i:06d}.png')
			cv2.imwrite(sal_map_dst, sal_map_np)
			
			fix_map_dst = os.path.join(path_out, 'fixations', f'f{i:06d}.png')
			cv2.imwrite(fix_map_dst, fix_map_normalized[i])

	if args.calc_metrics:
		os.makedirs(os.path.dirname(path_out), exist_ok=True)
		metrics_dst = path_out
		device = sal_map.device
		
		metrics = {}
		
		for i in range(sal_map.shape[0]):
			gt_path_frame = os.path.join(args.path_gt, video_name, 'gauss', f'{i:06d}.png')
			fixations_path_frame = os.path.join(args.path_gt, video_name, 'fixations', f'{i:06d}.png')
			
			if not os.path.exists(gt_path_frame):
				print(gt_path_frame)
				continue

				
			gt_sm = read_sm(gt_path_frame)
			if gt_sm is None or gt_sm.max() == 0:
				continue
				
			gt_sm = torch.as_tensor(gt_sm, dtype=torch.float32, device=device)
			gt_h, gt_w = gt_sm.shape
			
			# Weight map
			wmap = get_weight_map(gt_h)
			
			# Resize pred_sm to GT size
			pred_sm = cv2.resize(sal_map[i].cpu().numpy(), (gt_w, gt_h), interpolation=cv2.INTER_LINEAR)
			pred_sm = torch.as_tensor(pred_sm, dtype=torch.float32, device=device)
			
			result = {
				'cc_360': float(cc_360(pred_sm, gt_sm, wmap)),
				'sim_360': float(sim_360(pred_sm, gt_sm, wmap)),
				'nss_360': None,
				'auc_judd_360': None
			}
			
			# NSS
			if os.path.exists(fixations_path_frame):
				fix_map_gt = read_sm(fixations_path_frame)
				if fix_map_gt is not None:
					
					fix_map_gt = torch.as_tensor(fix_map_gt, dtype=torch.float32, device=device)
					fix_h, fix_w = fix_map_gt.shape
					pred_sm_tensor = torch.as_tensor(
								cv2.resize(sal_map[i].cpu().numpy(), (fix_w, fix_h), interpolation=cv2.INTER_LINEAR), 
								dtype=torch.float32, device=device
							)

					result['nss_360'] = float(nss_360(pred_sm_tensor, fix_map_gt))
					result['auc_judd_360'] = float(auc_judd_360(pred_sm_tensor, fix_map_gt, device=device))
			
			metrics[i] = result
		
		with open(metrics_dst, 'w') as f:
			json.dump( metrics, f, indent=4)

def process_validation_video(args):
	with open(args.path_metadata) as f:
		video_infos = json.load(f)

	for video_name in video_infos.keys():
		is_validation = bool(video_infos[video_name]['is_validation'])
		if is_validation:
			video_path = os.path.join(args.path_data, video_name)
			
			if not os.path.exists(video_path):
				continue

				
			for user_fix in tqdm(os.listdir(video_path)):
				path_csv = os.path.join(video_path, user_fix)
				
				name_without_ext = os.path.splitext(user_fix)[0]
				
				path_out = os.path.join(args.path_out, video_name, f"{name_without_ext}.json")
				if os.path.exists(path_out):
					continue

				if os.path.isfile(path_csv):
					create_one_salmap(path_csv, path_out, args)
	

if __name__ == '__main__':
	parser = argparse.ArgumentParser()
	parser.add_argument('--path_data', type=str, required=True)
	parser.add_argument('--path_out', type=str, default='validation_result')
	parser.add_argument('--path_metadata', type=str, required=True)
	parser.add_argument('--sigma', type=float, default=5)
	parser.add_argument('--height', type=int, default=960)
	parser.add_argument('--width', type=int, default=1920)
	parser.add_argument('--save', action='store_true')
	parser.add_argument('--calc_metrics', action='store_true')
	parser.add_argument('--path_gt', type=str, default='./validation_maps')
	args = parser.parse_args()

	process_validation_video(args)