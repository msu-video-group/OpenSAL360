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
	parser.add_argument('--height', type=int, default=100)
	parser.add_argument('--width', type=int, default=200)
	
	args = parser.parse_args()
	
	# Assign arguments
	views_path = args.views_path
	path_metadata = args.path_metadata
	path_result = args.path_result
	height = args.height
	width = args.width

	views_folder_name = os.path.basename(views_path)

	# Run the pipeline relative to this script's directory.
	os.chdir(SCRIPT_DIR)
	
	# 1. Frequency filtering
	print("Performing frequency filtering...")
	result = subprocess.run([
		sys.executable, 'freq_filt_360.py',
		'--path_data', views_path,
		'--path_out', f"{views_path}_filt",
		'--tr_freq', '3',
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
		'--shift', '300',
		'--crop', '1500',
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
		'--path_metadata', path_metadata
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

