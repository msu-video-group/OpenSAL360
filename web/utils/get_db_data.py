import json
import os
import sys
import math
import csv
from collections import defaultdict
from tqdm import tqdm

import django
from django.db.models import Count

# Настройка окружения
project_path = '/code/salimouse'
sys.path.append(project_path)
sys.path.append(os.path.dirname(project_path))
os.environ['DJANGO_SETTINGS_MODULE'] = 'salimouse_site.settings'
django.setup()

from salimouse.models import Experiment, Participation, Video, VideoView
from salimouse.utils import generate_videos_set

csv.field_size_limit(sys.maxsize)

def radians_to_degrees(radians):
    """Convert radians to degrees (0-360)"""
    normalized_rad = radians % (2 * math.pi)
    if normalized_rad < 0:
        normalized_rad += 2 * math.pi
    return math.degrees(normalized_rad) % 360

def calculate_frame_number(time_ns, fps):
    """Calculate frame number from time in nanoseconds"""
    return int((time_ns * fps - 1) / 1_000_000_000) + 1

def find_last_reset_index(t_values):
    """Find the index of the last time reset"""
    last_reset = 0
    for i in range(1, len(t_values)):
        if t_values[i] < t_values[i-1]:
            last_reset = i
    return last_reset

def process_gaze_data(gaze_data, fps):
    """Process gaze data and yield timestamp, frame, pitch, yaw, roll"""
    if not gaze_data:
        return
    
    t_values = gaze_data.get('t', [])
    x_values = gaze_data.get('x', [])
    y_values = gaze_data.get('y', [])
    z_values = gaze_data.get('z', [])
    
    if not t_values:
        return
    
    # Find last time reset
    start_index = find_last_reset_index(t_values)
    
    prev_time = None
    for time, pitch, yaw, roll in zip(
        t_values[start_index:],
        x_values[start_index:],
        y_values[start_index:],
        z_values[start_index:]
    ):
        # Skip duplicate timestamps
        if time == 0:
            continue
        if prev_time is not None and time == prev_time:
            continue
        prev_time = time
        
        frame = calculate_frame_number(time, fps)
        yield [
            time,
            frame,
            radians_to_degrees(-pitch),
            (radians_to_degrees(yaw) + 180) % 360,
            0
        ]

# 1. Generate video sets for all experiments
for experiment in Experiment.objects.all():
    generate_videos_set(experiment)

# 2. Get metadata for all videos once (mapped by video NAME)

video_metadata_by_name = {}  
video_id_to_name = {}      
for video in Video.objects.all():
    video_metadata_by_name[video.name] = {
        'fps': float(video.fps),
        'duration': video.duration,
        'is_validation': video.is_validation
    }
    video_id_to_name[video.id] = video.name



# 3. Process all experiments
all_results = {}  # Structure: {exp_name: {video_name: {part_id: data_rows}}}

for experiment in Experiment.objects.all():
    exp_id = experiment.id
    exp_name = experiment.name
    
    # Get valid participations for this experiment
    valid_participations = Participation.objects.filter(
        completed=True,
        admin_mode=False,
        experiment_id=exp_id
    ).annotate(
        vv_count=Count('videoview')
    ).filter(
        vv_count=experiment.num_validation_videos + experiment.num_participation_videos
    ).values_list('id', flat=True)
    
    
    if not valid_participations:
        continue
    
    # Get all VideoView records for valid participations
    video_views = VideoView.objects.filter(
        participation_id__in=valid_participations
    ).select_related('video')

    print(video_views)
    
    # Process each video view
    exp_data = defaultdict(lambda: defaultdict(list))
    
    for vv in tqdm(video_views, desc=f"  Processing {exp_name}"):
        video_id = vv.video_id
        part_id = vv.participation_id
        
        # Get video name from ID
        video_name = video_id_to_name.get(video_id)
        if not video_name:
            print(f"    Warning: Video with id {video_id} not found")
            continue
        
        # Get video metadata by NAME
        video_info = video_metadata_by_name.get(video_name)
        if not video_info:
            print(f"    Warning: Metadata not found for video {video_name}")
            continue
        
        fps = video_info['fps']
        
        # Process gaze data
        gaze_rows = list(process_gaze_data(vv.data_gazes, fps))
        
        if gaze_rows:
            exp_data[video_name][part_id] = gaze_rows
    
    all_results[exp_name] = exp_data


# Save video metadata
with open('/code/videos_metadata.json', 'w') as f:
    json.dump(video_metadata_by_name, f, indent=2)

# Save processed gaze data by experiment and video
for exp_name, exp_data in all_results.items():
    exp_dir = f'/code/all_fixations/views_exp_{exp_name}'
    os.makedirs(exp_dir, exist_ok=True)
    
    for video_name, participants_data in exp_data.items():
        video_dir = os.path.join(exp_dir, video_name)
        os.makedirs(video_dir, exist_ok=True)
        
        for part_id, gaze_rows in participants_data.items():
            part_file = os.path.join(video_dir, f"{part_id}.csv")
            with open(part_file, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['timestamp', 'frame', 'pitch', 'yaw', 'roll'])
                writer.writerows(gaze_rows)
