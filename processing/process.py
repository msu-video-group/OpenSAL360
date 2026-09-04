#!/usr/bin/env python3

import argparse
import subprocess
import sys
import os


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def main():
	# Parse arguments
	parser = argparse.ArgumentParser(description='Fixations postprocessing pipeline')
	parser.add_argument('--views_path', type=str, help='Path to views data')
	parser.add_argument('--path_metadata', type=str, help='Path to metadata')
	parser.add_argument('--path_result', type=str, help='Path to result')
	parser.add_argument('--height', type=int, default=100, help='The height of the salience map')
	parser.add_argument('--width', type=int, default=200, help='The width of the salience map')
	parser.add_argument('--tr_freq', type=int, default=3, help='Frequency threshold')
	parser.add_argument('--shift', type=int, default=300, help='Shift, ms')
	parser.add_argument('--crop', type=int, default=1500, help='Trimming, ms')
	parser.add_argument('--validation_videos', nargs=3, default=['1', '2', '3'], help='Validation video names')
	parser.add_argument('--cc_thresholds', nargs=3, type=float, default=[0.11522367324510197, 0.10169350194002133, 0.049167433169621896], help='Validation CC thresholds')
	
	args = parser.parse_args()
	
	# Assign arguments
	views_path = args.views_path
	path_metadata = args.path_metadata
	path_result = args.path_result
	height = args.height
	width = args.width
	tr_freq = args.tr_freq
	shift = args.shift
	crop = args.crop
	validation_videos = args.validation_videos
	cc_thresholds = args.cc_thresholds

	views_folder_name = os.path.basename(views_path)

	# Run the pipeline relative to this script's directory.
	os.chdir(SCRIPT_DIR)
	
	# 1. Frequency filtering
	print("Performing frequency filtering...")
	result = subprocess.run([
		sys.executable, 'freq_filt_360.py',
		'--path_data', views_path,
		'--path_out', f"{views_path}_filt",
		'--tr_freq', str(tr_freq),
		'--path_metadata', path_metadata
	])
	
	# Check if successful
	if result.returncode != 0:
		print("Error at step 1")
		sys.exit(1)
	
	# 2. Unification of frequencies, shift and crop
	print("Performing frequency unification...")
	result = subprocess.run([
		sys.executable, 'uni_freq_360.py',
		'--path_data', f"{views_path}_filt",
		'--path_out', f"{views_path}_filt_uni",
		'--shift', str(shift),
		'--crop', str(crop),
		'--path_metadata', path_metadata
	])
	
	if result.returncode != 0:
		print("Error at step 2")
		sys.exit(1)
	
	# 3. Filtering by validation videos
	print("Filtering by validation videos...")
	
	# 3.1 Calculating metrics
	result = subprocess.run([
		sys.executable, 'create_salmap_val.py',
		'--path_data', f"{views_path}_filt_uni",
		'--path_out', f"{views_folder_name}_val_result",
		'--path_metadata', path_metadata,
		'--height', str(height),
		'--width', str(width),
		'--calc_metrics'
	])
	
	if result.returncode != 0:
		print("Error at step 3.1")
		sys.exit(1)
	
	# 3.2 Filtering
	result = subprocess.run([
		sys.executable, 'filtering_by_validation.py',
		'--path_data', f"{views_path}_filt_uni",
		'--path_out', f"{views_path}_filt_uni_val_filt",
		'--path_val_metrics', f"{views_folder_name}_val_result",
		'--path_metadata', path_metadata,
		'--validation_videos', *validation_videos,
		'--cc_thresholds', *[str(threshold) for threshold in cc_thresholds]
	])
	
	if result.returncode != 0:
		print("Error at step 3.2")
		sys.exit(1)
	
	# 4. Generating saliency maps
	print("Generating saliency maps...")
	result = subprocess.run([
		sys.executable, 'create_salmap.py',
		'--path_data', f"{views_path}_filt_uni_val_filt",
		'--path_out', path_result,
		'--path_metadata', path_metadata,
		'--height', str(height),
		'--width', str(width),
		'--save'
	])
	
	if result.returncode != 0:
		print("Error at step 4")
		sys.exit(1)
	
	print("Done!")

if __name__ == '__main__':
	main()
