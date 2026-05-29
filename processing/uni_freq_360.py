from pathlib import Path
import json
import numpy as np
import pandas as pd
from multiprocessing.pool import Pool
from tqdm import tqdm
import math
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--path_data', type=str, required=True)
parser.add_argument('--path_out', type=str, required=True)
parser.add_argument('--path_metadata', type=str, required=True)
parser.add_argument('--shift', type=int, default=0)
parser.add_argument('--crop', type=int, default=0)
parser.add_argument('--target_freq', type=int, default=100)
args = parser.parse_args()


def pull_func(item):
    dst: Path = item['dst']
    csv: Path = item['csv']
    target_freq: int = item['target_freq']
    shift_ms: int = item.get('shift', 0)
    crop_ms: int = item.get('crop', 0)
    video_name = dst.stem.split('/')[0]
    vlen =  video_infos[video_name]['duration']
    fps =  video_infos[video_name]['fps']
    is_validation = bool(video_infos[video_name]['is_validation'])
    shift_ns = shift_ms * 1000000
    crop_ns = crop_ms * 1000000

    new_fixes = []
    cur_df = pd.read_csv(csv, sep=',', header=0, usecols=[0, 2, 3, 4])

    step = 1 / target_freq * 1e9
    prev_fix_idx = -1
    next_fix_idx = 0
    timestamp_list = cur_df['timestamp'].to_list()
    for new_timestamp in np.arange(step, vlen * 1e9 + step, step):
        new_timestamp_int = round(new_timestamp)
        while next_fix_idx < len(timestamp_list):
            if timestamp_list[next_fix_idx] > new_timestamp_int:
                break
            prev_fix_idx += 1
            next_fix_idx += 1
        else:
            if len(new_fixes) == 0:
                new_fix = cur_df.iloc[prev_fix_idx].to_dict().copy()
                new_fix['timestamp'] = int(new_timestamp_int)
                new_fixes.append(new_fix)
                continue
            else:
                new_fixes.append(new_fixes[-1].copy())
                new_fixes[-1]['timestamp'] = int(new_timestamp_int)
                continue
        next_fix = cur_df.iloc[next_fix_idx].to_dict()
        if next_fix_idx == 0:
            prev_fix = {'timestamp': 0, 'pitch': 0, 'yaw': 270, 'roll': 0}
        else: 
            prev_fix = cur_df.iloc[prev_fix_idx].to_dict()
        if (next_fix['timestamp'] - prev_fix['timestamp']) == 0:
            print(new_timestamp_int, csv.stem, prev_fix_idx, next_fix_idx, next_fix['timestamp'], prev_fix['timestamp'])
        alpha = (new_timestamp_int - prev_fix['timestamp']) / (next_fix['timestamp'] - prev_fix['timestamp'])
        new_fix = {}
        for k, v_prev in prev_fix.items():
            next_val = next_fix[k]
            if k in ['pitch', 'yaw', 'roll']:
                diff = next_val - v_prev
                if diff > 180:
                    diff -= 360
                elif diff < -180:
                    diff += 360
                interpolated = v_prev + alpha * diff
                new_fix[k] = interpolated % 360
    
            else:
                new_fix[k] = v_prev + alpha * (next_val - v_prev)
        
        new_fix['timestamp'] = round(new_fix['timestamp'])
        assert new_fix['timestamp'] == new_timestamp_int
        new_fix['timestamp'] = int(new_fix['timestamp'])
        new_fix['frame'] = math.ceil(new_fix['timestamp'] * fps / 1e9)
        new_fixes.append(new_fix)

    if (new_fixes) and (shift_ns != 0) and (not is_validation):
        df = pd.DataFrame(new_fixes)
        df['timestamp'] = df['timestamp'] - shift_ns
        df = df[df['timestamp'] > 1]
        df['frame'] = df['timestamp'] * fps / 1e9
        df['frame'] = df['frame'].apply(math.ceil).astype(int)
        new_fixes = df.to_dict('records')

    if (new_fixes) and (crop_ns != 0) and (not is_validation):
        df = pd.DataFrame(new_fixes)
        df = df[df['timestamp'] >= crop_ns]
        new_fixes = df.to_dict('records')

    column_order = ['timestamp', 'frame', 'pitch', 'yaw', 'roll']
    df = pd.DataFrame(new_fixes, columns=column_order)
    df.to_csv(dst / csv.name, sep=',', header=True, index=False, float_format='%.6f')

root = Path(args.path_data)
dst = Path(args.path_out)
target_freq = args.target_freq
shift = args.shift
crop = args.crop

with open(args.path_metadata) as f:
    video_infos = json.load(f)

for video in tqdm(sorted(root.iterdir())):
    with Pool(20) as p:
        video_dst = dst / video.name
        video_dst.mkdir(exist_ok=True, parents=True)
        p.map(pull_func, [{'dst': video_dst, 'csv': csv, 'target_freq': target_freq, 'shift': shift, 'crop': crop} for csv in video.iterdir()]) 