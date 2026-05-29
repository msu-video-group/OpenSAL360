from pathlib import Path
from shutil import copy2
import numpy as np
import pandas as pd
from tqdm import tqdm
import argparse
import json

parser = argparse.ArgumentParser()
parser.add_argument('--path_data', type=str, required=True)
parser.add_argument('--path_out', type=str, required=True)
parser.add_argument('--tr_freq', type=int, required=True)
parser.add_argument('--path_metadata', type=str, required=True)
args = parser.parse_args()

root = Path(args.path_data)
dst = Path(args.path_out)

with open(args.path_metadata) as f:
    video_infos = json.load(f)

a = 0
b = 0
for video in tqdm(sorted(root.iterdir())):
	for csv in sorted(video.iterdir()):
		video_name = str(csv).split('/')[-2]
		is_validation = bool(video_infos[video_name]['is_validation'])
		if not is_validation:
			vlen =  video_infos[video_name]['duration']
			cur_freq = pd.read_csv(csv, sep=',', header=0)['timestamp'].nunique() / vlen
			if cur_freq < args.tr_freq:
				print(video, csv)
				print(cur_freq)
				a+=1
				continue
			b+=1
		dst_video = dst / video_name
		dst_video.mkdir(exist_ok=True, parents=True)
		copy2(csv, dst_video / csv.name)
print(a, b)