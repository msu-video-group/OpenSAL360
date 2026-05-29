import numpy as np
import quaternion as quat

def convertEulerToQuat(data):
	
	if np.any(np.abs(data[:, :3]) > (2*np.pi)):
		data[:, :4] = np.deg2rad(data[:, :4])

 	# pitch
	X = data[:, 0]
	# yaw
	Y = data[:, 1]
	# roll
	Z = data[:, 2]

	c1 = np.cos(X/2)
	c2 = np.cos(Y/2)
	c3 = np.cos(Z/2)

	s1 = np.sin(X/2)
	s2 = np.sin(Y/2)
	s3 = np.sin(Z/2)
	#YXZ
	data[:, 0] = c1 * c2 * c3 + s1 * s2 * s3 # W
	data[:, 1] = s1 * c2 * c3 + c1 * s2 * s3 # X
	data[:, 2] = c1 * s2 * c3 - s1 * c2 * s3 # Y
	data[:, 3] = c1 * c2 * s3 - s1 * s2 * c3 # Z

def getGazeFeatures(head_vectors, DIM):
	n_samples = head_vectors.shape[0]
	fixationPts = np.empty([n_samples, 7])
	magnitudes = np.linalg.norm(head_vectors, axis=1, keepdims=True) + 1e-10
	normalized_vectors = head_vectors / magnitudes
	
	long = np.arctan2(normalized_vectors[:, 0], normalized_vectors[:, 1])
	lat = np.arcsin(normalized_vectors[:, 2])
	long = long / (2 * np.pi) - 0.25
	lat = 1 - (lat / np.pi + 0.5)
	long[long < 0] += 1
	lat[lat < 0] += 1

	fixationPts[:, 0:3] = normalized_vectors  
	fixationPts[:, 3] = long                  
	fixationPts[:, 4] = lat                   
	fixationPts[:, 5] = np.arange(n_samples) 
	fixationPts[:, 6] = np.arange(n_samples) 
	
	return fixationPts

def getFixationList(raw_data, DIM):

	quaternions = convertEulerToQuat(raw_data[:, 1:5])
	HMD_rot = quat.as_quat_array(raw_data[:, 1:5])
	
	head_vec = quat.rotate_vectors(HMD_rot, [0, 0, 1])
	head_vec = quat.rotate_vectors(np.quaternion(1, 1, 0, 0), head_vec)

	head_magnitude = np.linalg.norm(head_vec, axis=1, keepdims=True) + 1e-10
	head_normalized = head_vec / head_magnitude
	
	fix_list = getGazeFeatures(head_normalized, DIM)
	return fix_list

def loadRawData(path, DIM):
	raw_data = np.loadtxt(path,
		delimiter=",",
		usecols=[0, 2, 3, 4, 2],
		skiprows=1)
	
	return getFixationList(raw_data, DIM)