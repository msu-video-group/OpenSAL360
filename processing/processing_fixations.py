import json
import numpy as np

def get_fixation(fix_lists, output_json):
	fix_per_frame = {}
	for fix_list in fix_lists:
		for fix in fix_list:
			for i in range(int(fix[7]), int(fix[8])):
				if i not in fix_per_frame:
					fix_per_frame[i] = []
				fix_per_frame[i].append([fix[3], fix[4]])
	with open(output_json, 'w', encoding='utf-8') as f:
		json.dump(fix_per_frame, f, indent=2, ensure_ascii=False)

	return fix_per_frame

def get_fixation_salient360(fix_lists, output_json):
	fix_per_frame = {}
	for fix_list in fix_lists:
		for fix in fix_list:
			for frame in range(int(fix[5]), int(fix[6])):
				if frame not in fix_per_frame:
					fix_per_frame[frame] = []
				fix_per_frame[frame].append([fix[3], fix[4]])
	with open(output_json, 'w', encoding='utf-8') as f:
		json.dump(fix_per_frame, f, indent=2, ensure_ascii=False)

	return fix_per_frame

def toFixationMap(fix_list, map_res):
    """
    Expects: latitudes (Y), longitudes (X)
    A fixation map counts fixations per pixels
    Returns a BINARY fixation map (dtype: int)
    """
    map_res = np.array(map_res).astype(int)

    # lat, long provided by default are normalized [0, 1]
    fix_list = fix_list.copy() * np.array(map_res[::-1])
    # Create new fix_map
    fix_map = np.zeros(map_res, dtype=np.int32)
    # Get unique fixation position and their individual hit count
    pos, val = np.unique(fix_list.astype(int), return_counts=True, axis=0)

    fix_map[pos[:, 1], pos[:, 0]] = val

    return fix_map

def get_fixmap(json_path, fix_per_frame, dim):
	if json_path != None:
		with open(json_path, 'r', encoding='utf-8') as f:
			data = json.load(f)
		fix_per_frame = {int(k): v for k, v in data.items()}
	if fix_per_frame == None:
		return None

	dim = np.array(dim, dtype=int)
	fix_map = np.zeros(dim, dtype=np.uint8)
	for k in fix_per_frame:
		fix_map[k-1] = toFixationMap(fix_per_frame[k], dim[1:3])
	
	return fix_map