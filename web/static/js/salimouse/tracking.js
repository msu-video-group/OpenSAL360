function stopCameraRotationTracking() {
	if (animationFrameId) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
		console.log("Camera rotation tracking stopped.");
	}
}

// Update camera rotation
function updateCameraRotation() {
	if (mode === "Dynamic" || mode === "Edge-Hover") {
		updateCursorDirection();
	}
	if (!videoPanorama.isVideoPaused()) {
		curr_frame_timestamp = videoPanorama.videoElement.currentTime;
		addHeadRotation(viewer.camera, curr_frame_timestamp);
	}

	animationFrameId = requestAnimationFrame(updateCameraRotation);
}

// Update cursor direction
function updateCursorDirection() {
	raycaster.setFromCamera(mouse, viewer.camera);
	if (!videoPanorama) return;
	const intersects = raycaster.intersectObject(videoPanorama, true);
	if (!intersects.length) return;
	const targetPoint = intersects[0].point;
	cursorCamera.position.set(0, 0, 0);
	cursorCamera.lookAt(targetPoint);
	cursorCamera.rotateY(Math.PI);
	cursorCamera.rotation.reorder("YXZ");

	const currentDirection = {
		x: cursorCamera.rotation.x,
		y: cursorCamera.rotation.y,
		z: cursorCamera.rotation.z,
	};

	const hasChanged =
		!lastCursorDirection ||
		Math.abs(currentDirection.x - lastCursorDirection.x) > 0.005 ||
		Math.abs(currentDirection.y - lastCursorDirection.y) > 0.005 ||
		Math.abs(currentDirection.z - lastCursorDirection.z) > 0.005;

	cursorEuler.copy(cursorCamera.rotation);

	// If the direction has changed, we call updateBlurMask
	if (hasChanged) {
		if (typeof mouse.x === "number" && typeof mouse.y === "number") {
			const container = document.getElementById("viewer");
			if (container) {
				const rect = container.getBoundingClientRect();
				const centerX =
					((mouse.x + 1) / 2) * maskCanvas?.width || window.innerWidth;
				const centerY =
					((1 - mouse.y) / 2) * maskCanvas?.height || window.innerHeight;
				updateBlurMask(centerX, centerY);
			} else {
				updateBlurMask();
			}
		} else {
			updateBlurMask();
		}

		lastCursorDirection = {
			x: currentDirection.x,
			y: currentDirection.y,
			z: currentDirection.z,
		};
	}
}

// Setting the camera's direction to the center
function centerViewerCamera(targetViewer) {
	if (!targetViewer || !targetViewer.camera) return;

	targetViewer.camera.position.set(1, 0, 0);
	targetViewer.camera.lookAt(0, 0, 0);
	targetViewer.camera.updateProjectionMatrix();

	if (targetViewer.OrbitControls) {
		if (targetViewer.OrbitControls.target) {
			targetViewer.OrbitControls.target.set(0, 0, 0);
		}
		if (typeof targetViewer.OrbitControls.update === "function") {
			targetViewer.OrbitControls.update();
		}
	}

	requestAnimationFrame(() => {
		if (!targetViewer || !targetViewer.camera) return;
		targetViewer.camera.position.set(1, 0, 0);
		targetViewer.camera.lookAt(0, 0, 0);
		if (targetViewer.OrbitControls) {
			if (targetViewer.OrbitControls.target) {
				targetViewer.OrbitControls.target.set(0, 0, 0);
			}
			if (typeof targetViewer.OrbitControls.update === "function") {
				targetViewer.OrbitControls.update();
			}
		}
	});
}

// Actions at the beginning of the video display
function onVideoStarted() {
	prepareData(curr_video_info);

	if (blurOverlay) {
		blurOverlay.style.display = "block";
	} else {
		if (mode === "Dynamic" || mode === "Edge-Hover") {
			create_canvas_dyn();
		} else create_canvas();
	}

	updateCameraRotation();
	curr_video_info.timestamp_start = new Date();

	const videoElement = videoPanorama.videoElement;
	const videoDuration = videoElement.duration;
	const videoWidth = videoElement.videoWidth;
	const videoHeight = videoElement.videoHeight;

	curr_video_info.fps_data.video_duration = videoDuration;
	curr_video_info.fps_data.video_width = videoWidth;
	curr_video_info.fps_data.video_height = videoHeight;
}

// Get video rating
function getRating() {
	if (STARS) {
		$("#rating-block").show();
	} else {
		curr_video_info.video_score = -1;
		onVideoFinished();
	}
}

// Receive rating
function ReceiveRating() {
	curr_video_info.video_score = parseInt(
		document.querySelector('input[name="rating"]:checked').value,
		10,
	);
	$("#rating-block").hide();
	onVideoFinished();
	$("input[name=rating]").prop("checked", false);
}

// Actions at the end of the video
function onVideoFinished() {
	if (!curr_video_info || curr_video_info.result_pending) return;

	setUnseenCursor(false);
	const finishedVideo = curr_video_info;
	finishedVideo.timestamp_finish = new Date();
	finishedVideo.result_pending = true;

	// Advancing is deliberately inside the success callback. If the result
	// cannot be confirmed by the server, neither the next video nor the final
	// screen is shown.
	sendVideoViewResults(finishedVideo, () => {
		finishedVideo.result_pending = false;
		++curr_video_index;
		curr_video_info = videos_list[curr_video_index];

		if (curr_video_index < videos_list.length) {
			$("#next-video-number").text(curr_video_index + 1);
			$("#next-video-timer").text(SECONDS_BEFORE_VIDEO_START);
			prepareVideoShow();
		} else {
			onShowFinished();
		}
	});
}

// Update the verification code in all blocks
function updateAllVerificationCodes(code) {
	if (!code) return;

	document.querySelectorAll("#verification-code").forEach((el) => {
		el.textContent = code;
	});

	document.querySelectorAll("[data-verification-code]").forEach((el) => {
		if (el.dataset.copyBound) return;
		el.dataset.copyBound = "true";

		el.addEventListener("click", function () {
			const codeText = this.textContent;
			if (
				!codeText ||
				codeText === "Loading code..." ||
				codeText === "Code was not received. Try refreshing the page."
			) {
				showCopyFeedback("The code has not loaded yet, please wait...");
				return;
			}

			if (
				navigator.clipboard &&
				typeof navigator.clipboard.writeText === "function"
			) {
				navigator.clipboard
					.writeText(codeText)
					.then(() => {
						showCopyFeedback("Copied!");
					})
					.catch(() => {
						fallbackCopyCode(codeText);
					});
			} else {
				fallbackCopyCode(codeText);
			}

			function fallbackCopyCode(text) {
				const textarea = document.createElement("textarea");
				textarea.value = text;
				textarea.style.position = "fixed";
				textarea.style.top = "-9999px";
				textarea.style.left = "-9999px";
				document.body.appendChild(textarea);
				textarea.select();

				try {
					document.execCommand("copy");
					showCopyFeedback("Copied!");
				} catch (err) {
					console.error("Copy failed:", err);
					showCopyFeedback("Failed to copy. Please copy the code manually.");
				}

				document.body.removeChild(textarea);
			}
		});
	});
}

// Actions after showing all videos
function onShowFinished() {
	experimentFinished = true;
	[
		"#instructions-panel",
		"#helpBlock",
		"#fullscreenRequest",
		"#noDevtoolsRequest",
		"#questionnaireBlock",
		"#rating-block",
		"#announce",
		"#downloading-panel",
		"#downloaded-panel",
		"#audio-captcha",
	].forEach((selector) => $(selector).hide());
	$("#viewer").show();

	if (blurOverlay) {
		blurOverlay.remove();
		blurOverlay = null;
	}

	setUnseenCursor(false);

	if (currentPanorama) {
		viewer.remove(videoPanorama);
		videoPanorama.dispose();
		const container = document.getElementById("viewer");
		if (container) {
			const panolensCanvas = container.querySelector("canvas.panolens-canvas");
			if (panolensCanvas) {
				container.removeChild(panolensCanvas);
			}
		}
		setUnseenCursor(false);
	}

	$("#final-panel").show();

	addCopyHandlersToAllCodeElements();

	$("#final-panel").css({
		"user-select": "text",
		"-webkit-user-select": "text",
	});

	if (verification_code) {
		updateAllVerificationCodes(verification_code);
	} else {
		document.querySelectorAll("#verification-code").forEach((el) => {
			el.textContent = "Loading code...";
		});

		const checkCodeInterval = setInterval(() => {
			if (verification_code) {
				updateAllVerificationCodes(verification_code);
				clearInterval(checkCodeInterval);
			}
		}, 500);

		setTimeout(() => {
			clearInterval(checkCodeInterval);
			if (!verification_code) {
				document.querySelectorAll("#verification-code").forEach((el) => {
					el.textContent = "Code was not received. Try refreshing the page.";
				});
			}
		}, 10000);
	}

	curr_video_index = -1;
	curr_video_info = null;
}

// A function for adding a copy handler to all code elements
function addCopyHandlersToAllCodeElements() {
	document.querySelectorAll("[data-verification-code]").forEach((el) => {
		if (el.dataset.copyBound) return;
		el.dataset.copyBound = "true";

		el.addEventListener("click", function () {
			const code = this.innerText;

			if (
				navigator.clipboard &&
				typeof navigator.clipboard.writeText === "function"
			) {
				navigator.clipboard
					.writeText(code)
					.then(() => showCopyFeedback("Copied!"))
					.catch(() => fallbackCopy(code));
			} else {
				fallbackCopy(code);
			}

			function fallbackCopy(text) {
				const textarea = document.createElement("textarea");
				textarea.value = text;
				textarea.style.position = "fixed";
				textarea.style.top = "-9999px";
				textarea.style.left = "-9999px";
				document.body.appendChild(textarea);
				textarea.select();

				try {
					document.execCommand("copy");
					showCopyFeedback("Copied!");
				} catch (err) {
					console.error("Copy failed:", err);
					showCopyFeedback("Failed to copy. Please copy the code manually.");
				}

				document.body.removeChild(textarea);
			}
		});
	});
}

// Copy Feedback
function showCopyFeedback(message) {
	const hint = document.getElementById("copy-hint");

	if (!hint) return;

	hint.textContent = message;

	setTimeout(() => {
		hint.textContent = "Click the code to copy it";
	}, 2000);
}

// Utils

function getISODateTime() {
	var now = new Date();
	return now.toISOString();
}

/* View in fullscreen */
function openFullscreen() {
	var elem = document.documentElement;

	if (elem.requestFullscreen) {
		elem.requestFullscreen();
	} else if (elem.mozRequestFullScreen) {
		/* Firefox */
		elem.mozRequestFullScreen();
	} else if (elem.webkitRequestFullscreen) {
		/* Chrome, Safari and Opera */
		elem.webkitRequestFullscreen();
	} else if (elem.msRequestFullscreen) {
		/* IE/Edge */
		elem.msRequestFullscreen();
	}
}

function closeFullscreen() {
	if (document.exitFullscreen) {
		document.exitFullscreen();
	} else if (document.mozCancelFullScreen) {
		/* Firefox */
		document.mozCancelFullScreen();
	} else if (document.webkitExitFullscreen) {
		/* Chrome, Safari and Opera */
		document.webkitExitFullscreen();
	} else if (document.msExitFullscreen) {
		/* IE/Edge */
		document.msExitFullscreen();
	}
}

// Blur managing
let blurOverlay = null;

// create canvas
function create_canvas() {
	blurOverlay = document.createElement("div");
	blurOverlay.style.pointerEvents = "none";
	blurOverlay.style.position = "fixed";
	blurOverlay.style.top = "0";
	blurOverlay.style.left = "0";
	blurOverlay.style.width = "100%";
	blurOverlay.style.height = "100%";
	blurOverlay.style.zIndex = "3";
	blurOverlay.style.pointerEvents = "none";

	const maskCanvas = document.createElement("canvas");
	const maskCtx = maskCanvas.getContext("2d");

	maskCanvas.width = window.innerWidth;
	maskCanvas.height = window.innerHeight;

	const canvasWidth = maskCanvas.width;
	const canvasLen = canvasWidth;

	const gaze_size = (canvasLen * REL_GAZE_SIZE) / 100;

	const background_blur_rad = Math.floor(canvasLen * REL_BLUR_RAD);

	if (blurOverlay) {
		blurOverlay.style.backdropFilter = `blur(${background_blur_rad}px)`;
	}

	const centerX = maskCanvas.width / 2;
	const centerY = maskCanvas.height / 2;
	const radius = gaze_size;

	const gradient = maskCtx.createRadialGradient(
		centerX,
		centerY,
		0,
		centerX,
		centerY,
		radius,
	);

	gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
	gradient.addColorStop(1, "rgba(0, 0, 0, 1)");

	maskCtx.fillStyle = gradient;
	maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

	blurOverlay.style.maskImage = `url(${maskCanvas.toDataURL()})`;
	document.body.appendChild(blurOverlay);

	window.addEventListener("resize", () => {
		maskCanvas.width = window.innerWidth;
		maskCanvas.height = window.innerHeight;

		const newCanvasWidth = maskCanvas.width;
		const newCanvasLen = newCanvasWidth;
		const newGazeSize = (newCanvasLen * REL_GAZE_SIZE) / 100;
		const newBackgroundBlurRad = Math.floor(newCanvasLen * REL_BLUR_RAD);

		if (blurOverlay) {
			blurOverlay.style.backdropFilter = `blur(${newBackgroundBlurRad}px)`;
		}

		const newCenterX = maskCanvas.width / 2;
		const newCenterY = maskCanvas.height / 2;
		const newRadius = newGazeSize;

		const newGradient = maskCtx.createRadialGradient(
			newCenterX,
			newCenterY,
			0,
			newCenterX,
			newCenterY,
			newRadius,
		);
		newGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
		newGradient.addColorStop(1, "rgba(0, 0, 0, 1)");

		maskCtx.fillStyle = newGradient;
		maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

		if (blurOverlay) {
			blurOverlay.style.maskImage = `url(${maskCanvas.toDataURL()})`;
		}
	});
}

// create dynamic canvas
function create_canvas_dyn() {
	blurOverlay = document.createElement("div");
	blurOverlay.style.pointerEvents = "none";
	blurOverlay.style.position = "fixed";
	blurOverlay.style.top = "0";
	blurOverlay.style.left = "0";
	blurOverlay.style.width = "100%";
	blurOverlay.style.height = "100%";
	blurOverlay.style.zIndex = "3";

	maskCanvas = document.createElement("canvas");
	maskCtx = maskCanvas.getContext("2d");

	function calculateBlurAndGaze() {
		const canvasWidth = maskCanvas.width;
		const canvasLen = canvasWidth;

		const gaze_size = (canvasLen * REL_GAZE_SIZE) / 100;

		const background_blur_rad = Math.floor(canvasLen * REL_BLUR_RAD);
		if (blurOverlay) {
			blurOverlay.style.backdropFilter = `blur(${background_blur_rad}px)`;
		}

		return gaze_size;
	}

	function resizeMaskCanvas() {
		maskCanvas.width = window.innerWidth;
		maskCanvas.height = window.innerHeight;
		calculateBlurAndGaze();
		updateBlurMask();
	}

	resizeMaskCanvas();
	updateBlurMask(window.innerWidth / 2, window.innerHeight / 2);

	blurOverlay.style.maskImage = `url(${maskCanvas.toDataURL()})`;
	blurOverlay.style.webkitMaskImage = `url(${maskCanvas.toDataURL()})`;
	document.body.appendChild(blurOverlay);

	window.addEventListener("resize", resizeMaskCanvas);
}

// update Blur
function updateBlurMask(centerX, centerY) {
	if (!maskCtx || !maskCanvas) return;

	if (typeof centerX !== "number" || typeof centerY !== "number") {
		if (typeof mouse.x === "number" && typeof mouse.y === "number") {
			centerX = ((mouse.x + 1) / 2) * maskCanvas.width;
			centerY = ((1 - mouse.y) / 2) * maskCanvas.height;
		} else {
			centerX = maskCanvas.width / 2;
			centerY = maskCanvas.height / 2;
		}
	}

	maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

	const canvasWidth = maskCanvas.width;
	const canvasLen = canvasWidth;
	const gaze_size = (canvasLen * REL_GAZE_SIZE) / 100;
	const radius = gaze_size;

	const gradient = maskCtx.createRadialGradient(
		centerX,
		centerY,
		0,
		centerX,
		centerY,
		radius,
	);

	gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
	gradient.addColorStop(1, "rgba(0, 0, 0, 1)");

	maskCtx.fillStyle = gradient;
	maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

	if (blurOverlay) {
		blurOverlay.style.maskImage = `url(${maskCanvas.toDataURL()})`;
		blurOverlay.style.webkitMaskImage = `url(${maskCanvas.toDataURL()})`;
	}
}

// Navigation
