import os
import math
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
parser.add_argument('--path_val_metrics', type=str, default='validation_result')
parser.add_argument('--path_metadata', type=str, required=True)
args = parser.parse_args()

root = Path(args.path_data)
dst = Path(args.path_out)

with open(args.path_metadata) as f:
    video_infos = json.load(f)

METRICS = ['cc', 'sim', 'nss', 'auc_judd']
val_videos = ["val_PVS-HMEM_mute_Lion", "val_salient360_mute_4_Ocean", "val_VR-EyeTracker_mono_059"]
Thresholds = [0.11522367324510197, 0.10169350194002133, 0.049167433169621896]

val_metrics_path = Path(args.path_val_metrics)
if not val_metrics_path.exists():
    for video in tqdm(sorted(root.iterdir())):
        if not video.is_dir():
            continue
        for csv in video.iterdir():
            if csv.suffix == '.csv':
                dst_video = dst / video.name
                dst_video.mkdir(exist_ok=True, parents=True)
                copy2(str(csv), str(dst_video / csv.name))
    exit(0)

users = {}

for video_name in val_videos:
    path = Path(args.path_val_metrics) / video_name

    if not path.exists():
        continue

    for user_file in path.iterdir():
        user_name_without_ext = user_file.stem
        if user_name_without_ext not in users:
            users[user_name_without_ext] = {}
        if video_name not in users[user_name_without_ext]:
            users[user_name_without_ext][video_name] = {}
        
        with open(user_file, 'r') as f:
            frames_data = json.load(f)
        
        values = {'cc': [], 'sim': [], 'nss': [], 'auc_judd': []}
        
        for frame_data in frames_data.values():
            for metric in METRICS:
                value = frame_data.get(f'{metric}_360')
                if value is not None and not math.isnan(value):
                    values[metric].append(value)
        
        for metric in METRICS:
            if values[metric]:
                users[user_name_without_ext][video_name][metric] = sum(values[metric]) / len(values[metric])


valid_user = set()

for user in users.keys():
    add_user = True
    for i in range(3):
        if val_videos[i] in users[user]:
            if users[user][val_videos[i]]['cc'] <= Thresholds[i]:
                add_user = False
                break
    
    if add_user:
        valid_user.add(user)

for video in tqdm(sorted(root.iterdir())):
    for csv in sorted(video.iterdir()):
        if not csv.suffix == '.csv':
            continue
            
        video_name = csv.parent.name
        is_validation = bool(video_infos[video_name]['is_validation'])
        user_name = csv.stem
        
        if is_validation:
            continue
        
        if user_name not in valid_user:
            continue
        
        dst_video = dst / video_name
        dst_video.mkdir(exist_ok=True, parents=True)
        copy2(str(csv), str(dst_video / csv.name))