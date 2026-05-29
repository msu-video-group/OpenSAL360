import numpy as np
import cv2
import torch

GPU = torch.cuda.is_available()
if GPU:
	dtype = torch.cuda.FloatTensor
	cltype = torch.cuda.LongTensor
	print('GPU')
else:
	dtype = torch.FloatTensor
	cltype = torch.LongTensor

EPSILON = torch.tensor(np.finfo('float').eps).type(dtype)
nan = torch.tensor(np.nan).type(dtype)


def get_weight_map(h):
	wmap = np.sin(np.linspace(0, np.pi, h, dtype=np.float32))
	wmap = np.repeat(wmap[:, None], h * 2, axis=1)
	return torch.tensor(wmap).type(dtype)


def dt_N(x):
	return x.size


def dt_mean(x):
	return x.mean()


def dt_flatten(x):
	return x.reshape(-1, 1)

def dt_N(x):
	"""Return number of elements in tensor
	"""
	return torch.tensor(x.size()).prod()

def dt_mean(x):
	"""Return tensor mean
	"""
	return x.sum()/dt_N(x).type(dtype)

def dt_flatten(x):
	"""Return flattened tensor
	"""
	return x.view(-1, 1)

def normalize(x, method='standard', axis=None):
	"""Normalize data
	
	`standard`: i.e. z-score. Substract mean and divide by standard deviation

	`range`: normalize data to new bounds [0, 1]

	`sum`: normalize so that the sum of all element in tensor sum up to 1.
	"""
	if method == 'standard':
		res = (x - dt_mean(x)) / x.std()
	elif method == 'range':
		res = (x - x.min()) / (x.max() - x.min())
	elif method == 'sum':
		res = x / x.sum()
	else:
		raise ValueError('method not in {"standard", "range", "sum"}')
	return res

def KLD(saliency_map1, saliency_map2):
	"""Weighted Kullback-Leibler Divergence

	Moharana, R., & Kayal, S. (2017). On weighted Kullback-Leibler divergence for doubly truncated random variables. RevStat.
	"""
	saliency_map1[saliency_map1<0] = EPSILON
	saliency_map2[saliency_map2<0] = EPSILON

	saliency_map1 = normalize(saliency_map1 * wmap, method='sum')
	saliency_map2 = normalize(saliency_map2 * wmap, method='sum')

	mask = (saliency_map1 > EPSILON) | (saliency_map2 > EPSILON)
	return (saliency_map1[mask] *\
				torch.log( (saliency_map1[mask]+EPSILON) / (saliency_map2[mask]+EPSILON) )
			).sum()

def nss_360(saliency_map, fixation_map):
	"""Normalized Scanpath Saliency
	"""
	f_map = fixation_map > 0.5
	s_map = normalize(saliency_map, method='standard')

	return dt_mean(s_map[f_map])

def cc_360(saliency_map1, saliency_map2, wmap):
	"""Weighted Cross-Correlation (Pearson's linear coefficient)
	Adapted from statsmodels.stats.weightstats import DescrStatsW (method "corrcoef").
	Set "weights" to ones for unweighted variant.
	"""
	map1 = normalize(saliency_map1, method='standard')
	map2 = normalize(saliency_map2, method='standard')

	data = torch.cat([dt_flatten(map1), dt_flatten(map2)], 1)

	weights = dt_flatten(wmap)
	ddof = 2

	sum_ = torch.mm( data.transpose(0,1), weights )
	sum_weight = weights.sum()

	mean = sum_ / sum_weight
	demeaned = data - mean.view(1,-1)

	sumsquare = torch.mm( torch.pow(demeaned, 2).transpose(0,1), weights )

	var = sumsquare / (sum_weight - ddof)
	std = torch.sqrt(var)

	cov = torch.mm( (weights * demeaned).transpose(0,1), demeaned )
	cov /= sum_weight - ddof

	corrcoef = cov / std.view(-1) / std.view(-1, 1)

	return corrcoef[0, 1]

def sim_360(saliency_map1, saliency_map2, wmap):
	"""Weighted SIMilarity measure (aka histogram intersection)
	"""
	map1 = dt_flatten(saliency_map1 * wmap)
	map2 = dt_flatten(saliency_map2 * wmap)

	map1 = normalize(map1, method='range')
	map2 = normalize(map2, method='range')
	
	map1 = normalize(map1, method='sum')
	map2 = normalize(map2, method='sum')

	return torch.min(map1, map2).sum()


def xrgb2gray(img):
	assert len(img.shape) in (2, 3)
	return img.mean(axis=2) if len(img.shape) == 3 else img

def read_sm(path):
	for attempt in range(10):
		img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
		if img is not None:
			break
	if img is None:
		return None
	img = xrgb2gray(img)
	img = (img - img.min()) / (img.max() - img.min() + np.finfo(np.float32).eps)
	return img

def auc_judd_360(saliency_map, fixation_map, jitter=False, device="cuda"):
    """AUC_Judd (PyTorch + CUDA)"""

    saliency_map = torch.as_tensor(saliency_map, device=device, dtype=torch.float32)
    fixation_map = torch.as_tensor(fixation_map, device=device) > 0.5

    if fixation_map.sum() == 0:
        return torch.tensor(float("nan"), device=device)

    if saliency_map.shape != fixation_map.shape:
        saliency_map = saliency_map.unsqueeze(0).unsqueeze(0)
        saliency_map = F.interpolate(
            saliency_map,
            size=fixation_map.shape,
            mode="bilinear",
            align_corners=False
        )
        saliency_map = saliency_map.squeeze()

    if jitter:
        saliency_map = saliency_map + torch.rand_like(saliency_map) * 1e-7

    S = saliency_map.reshape(-1)
    Fm = fixation_map.reshape(-1)

    S_fix = S[Fm] 

    n_fix = S_fix.numel()
    n_pixels = S.numel()

    thresholds = torch.sort(S_fix, descending=True).values

    tp = torch.zeros(n_fix + 2, device=device)
    fp = torch.zeros(n_fix + 2, device=device)

    tp[0] = 0.0
    tp[-1] = 1.0
    fp[0] = 0.0
    fp[-1] = 1.0

    for k in range(n_fix):
        thresh = thresholds[k]

        above_th = (S >= thresh).sum()

        tp[k + 1] = (k + 1) / float(n_fix)
        fp[k + 1] = (above_th - (k + 1)) / float(n_pixels - n_fix + 1e-8)

    auc = torch.trapz(tp, fp)

    return auc