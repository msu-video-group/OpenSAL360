import torch
import math

def getGaussian_torch(map_, fix, gauss_sigma):
	c = torch.sqrt(torch.pow(map_ - fix, 2).sum(dim=-1))
	return torch.exp(-(c**2) / (2 * gauss_sigma**2))

def getGaussianSupport_torch(dim, pos, gauss_sigma):
	"""
	GPU version that matches original integer choices:
	- applies min(Sx, W)
	- ensures Sy,Sx >= 1
	- uses truncation -> .trunc().long() to mimic int()
	- returns indices on pos.device
	"""
	device = pos.device
	H, W = int(dim[0]), int(dim[1])  
	rect_f = pos * torch.tensor([W, H], device=device)    
	rect = rect_f.trunc().long()                         

	Sy_f = (H * torch.sin(torch.tensor(gauss_sigma * 2.5, device=device)))
	Sy = Sy_f.abs().trunc().long().clamp(min=1)

	latitude_rad = pos[1] * torch.pi
	distance_from_equator = (latitude_rad - (torch.pi / 2)).abs()
	tan_factor = torch.tan(distance_from_equator)

	Sx_f = W * (1 + tan_factor) * (gauss_sigma * 1.5)
	Sx = Sx_f.abs().trunc().long()
	Sx = torch.minimum(Sx, torch.tensor(W, device=device, dtype=Sx.dtype))
	Sx = Sx.clamp(min=1)

	half_Sx = Sx // 2
	half_Sy = Sy // 2

	X0 = rect[0] - half_Sx
	X1 = rect[0] + half_Sx
	Y0 = rect[1] - half_Sy
	Y1 = rect[1] + half_Sy

	X_coords = torch.arange(X0, X1, device=device, dtype=torch.long) if X1 > X0 else torch.empty(0, dtype=torch.long, device=device)
	Y_coords = torch.arange(Y0, Y1, device=device, dtype=torch.long) if Y1 > Y0 else torch.empty(0, dtype=torch.long, device=device)

	if X_coords.numel() > 0:
		X_coords = torch.remainder(X_coords, W)
	if Y_coords.numel() > 0:
		Y_coords = torch.remainder(Y_coords, H)

	return Y_coords, X_coords

def saliencyOp_torch(saliencymap, fix, pvi, gauss_sigma):
	"""
	Takes as input a matrix, a fixation position and a Gaussian sigma
	Draw Gaussian at fixation location in the matrix
	Optimized with Gaussian support as a function of latitude
	"""
	
	SalMapRes = saliencymap.shape[-2:]
	posC = fix[3:5]
	Y, X = getGaussianSupport_torch(SalMapRes, posC, gauss_sigma)
	
	X_grid, Y_grid = torch.meshgrid(X, Y, indexing='xy')
	
	pvi_window = pvi[Y_grid, X_grid, :]
	gaussian_values = getGaussian_torch(pvi_window, fix[:3], gauss_sigma)
	
	saliencymap[..., Y_grid, X_grid] += gaussian_values

def getSphereGridPoints3D_torch(height, width, device=None):
	if device is None:
		device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
	
	y_coords = torch.arange(height, dtype=torch.float32, device=device)
	x_coords = torch.arange(width, dtype=torch.float32, device=device)
	
	yy, xx = torch.meshgrid(y_coords, x_coords, indexing='ij')
	
	Ex = (2 * math.pi) - (xx / (width - 1)) * (2 * math.pi)
	Ey = (yy / (height - 1)) * math.pi
	
	pvi = torch.empty((height, width, 3), dtype=torch.float32, device=device)
	
	pvi[:, :, 0] = torch.sin(Ey) * torch.cos(Ex)  # X
	pvi[:, :, 1] = torch.sin(Ey) * torch.sin(Ex)  # Y
	pvi[:, :, 2] = torch.cos(Ey)                  # Z
	
	return pvi

def getSaliency_torch(saliencymap, fix_list, gauss_sigma=2, callback=None, **kwargs):
	# Pass fix_list of a frame or whole stimulus
	# toImage and toFrames call this function
	# Returns a matrix (W, H) or (W, H, nFrames)
	#	Send returned data to
	#		toImage, toFrames, toBin, toBinFrames

	print("Computing saliency data")

	SalMapRes = saliencymap.shape

	pvi = getSphereGridPoints3D_torch(SalMapRes[0], SalMapRes[1], device=saliencymap.device)

	gauss_sigma_rad = math.radians(gauss_sigma)

	progressStep = max(1, fix_list.shape[0] // 25)
	for iFix in range(fix_list.shape[0]):
		fix = fix_list[iFix, :5]
		
		saliencyOp_torch(saliencymap, fix, pvi, gauss_sigma_rad)
		
		if callback is not None and iFix % progressStep == 0:
			continue_ = callback((iFix + 1) / fix_list.shape[0])
			if not continue_:
				print("\nComputation cancelled")
				return None
		
		if kwargs.get('verbose', 0) == 0:
			progress = (iFix + 1) / fix_list.shape[0]
			print(f"\r{progress:>6.2%}", end="", flush=True)
	
	print("\nDone")

def getSaliencyDyn_torch(saliencymap, fix_list, gauss_sigma=2, time_cut=None, callback=None):
	length = saliencymap.shape[0]
	SalMapRes = saliencymap.shape[1:]
	pvi = getSphereGridPoints3D_torch(SalMapRes[0], SalMapRes[1], device=saliencymap.device)
	
	gauss_sigma_rad = math.radians(gauss_sigma)

	progressStep = max(1, fix_list.shape[0] // 50)
	for iFix in range(fix_list.shape[0]):
		start_frame_idx = int(fix_list[iFix, 5].item())
		end_frame_idx = int(fix_list[iFix, 6].item())

		Scut = time_cut[start_frame_idx]-1 if time_cut is not None else start_frame_idx
		Ecut = min(time_cut[end_frame_idx] if time_cut is not None else end_frame_idx, length)
		
		if Scut < 0:
			Scut = 0
		if Ecut > length:
			Ecut = length
		if Scut >= Ecut:
			continue


		saliencyOp_torch(saliencymap[Scut:Ecut, :, :], fix_list[iFix, :5], pvi, gauss_sigma_rad)
		
		if callback is not None and iFix % progressStep == 0:
			continue_ = callback((iFix + 1) / fix_list.shape[0])
			if not continue_:
				print("\nComputation cancelled")
				return None
