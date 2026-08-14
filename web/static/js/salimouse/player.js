function startViewing() {
	$("#downloaded-panel").hide();
	prepareCaptcha();

	try {
		openFullscreen();
	} catch (e) {
		console.log(e);
	}
}

// Initializing the head rotation array
function prepareData(video_info) {
	video_info.head_rotation = {
		t: [0],
		x: [curr_head_rotation_x],
		y: [curr_head_rotation_y],
		z: [curr_head_rotation_z],
	};

	video_info.fps_data = {
		render_video_timestamps: [],
	};
}

// Prepare viewer
function prepareVideoShow() {
	var prev_video =
		curr_video_index > 0 ? videos_list[curr_video_index - 1] : null;
	curr_video_info = videos_list[curr_video_index];

	$("#announce").show();
	$("#next-video-number").text(curr_video_index + 1);
	$("#next-video-timer").text(SECONDS_BEFORE_VIDEO_START);

	curr_frame_timestamp = -1;

	curr_video_info = videos_list[curr_video_index];

	const container = document.getElementById("viewer");

	if (currentPanorama) {
		viewer.remove(videoPanorama);
		videoPanorama.dispose();
	}

	videoPanorama = new PANOLENS.VideoPanorama(curr_video_info.data_url, {
		autoplay: false,
		loop: false,
		muted: !WITH_AUDIO,
	});
	currentPanorama = videoPanorama;
	var video_elem = videoPanorama.videoElement;

	if (!viewer) {
		console.log(mode);
		if (mode === "FPV") {
			viewer = new PANOLENS.Viewer({
				container: container,
				controlBar: false,
				momentum: false,
				controlMode: "fps",
				fpsLookSpeed: speed,
				cameraFov: FIELD_OF_VIEW,
			});
		} else if (mode === "Standard") {
			viewer = new PANOLENS.Viewer({
				container: container,
				controlBar: false,
				momentum: false,
				cameraFov: FIELD_OF_VIEW,
			});
			viewer.OrbitControls.noZoom = true;
			viewer.OrbitControls.rotateSpeed = -speed;

			if (mode === "Standard" && UNSEEN_CURSOR && viewer.OrbitControls) {
				const controls = viewer.OrbitControls;

				controls.addEventListener("start", () => setUnseenCursor(true));
				controls.addEventListener("end", () => setUnseenCursor(false));
			}
		} else if (mode === "Dynamic") {
			viewer = new PANOLENS.Viewer({
				container: container,
				controlBar: false,
				momentum: false,
				cameraFov: FIELD_OF_VIEW,
			});
			viewer.OrbitControls.noZoom = true;
			viewer.OrbitControls.mouseButtons.ORBIT = null;
			viewer.OrbitControls.rotateSpeed = -speed;
		} else if (mode === "Edge-Hover") {
			viewer = new PANOLENS.Viewer({
				container: container,
				controlBar: false,
				momentum: false,
				controlMode: "edge-hover",
				edgeHoverSpeed: speed,
				cameraFov: FIELD_OF_VIEW,
			});
		}
	}

	viewer.add(videoPanorama);

	var countdown_finished = false;
	var canplaythrough = () => video_elem.readyState === 4;
	var try_play_video = () => {
		console.log("canplaythrough", video_elem.readyState);

		if (!canplaythrough() || !countdown_finished) return false;

		// Wait for previous video sending
		if (prev_video && prev_video.sent !== true) return false;

		// Check if previous video passed the validation
		if (prev_video && prev_video.accepted === false) {
			alert("Previous video is not accepted");
			return false;
		}

		$("#announce").hide();
		ready_to_start = 1;
		console.log("in_try");
		onFullscreenChange();

		return true;
	};

	var update_timer = (seconds_remained) => {
		$("#next-video-timer").text(seconds_remained);

		if (seconds_remained > 0) {
			setTimeout(update_timer, 1000, seconds_remained - 1);
		} else {
			console.log("canplaythrough", video_elem.readyState);

			countdown_finished = true;
			if (!try_play_video()) setTimeout(update_timer, 1000, seconds_remained);
		}
	};

	update_timer(SECONDS_BEFORE_VIDEO_START);

	// Turn on the pointer lock
	if (mode === "FPV") {
		_main_enterHandler = new ActionHandler(
			videoPanorama.videoElement,
			"play",
			null,
			() => viewer.enterPointerLock(),
		);
		_main_exitHandler = new ActionHandler(
			videoPanorama.videoElement,
			"ended",
			null,
			() => viewer.exitPointerLock(),
		);
	}

	// video play listener
	videoPanorama.videoElement.addEventListener("play", () => {
		console.log("play");
		console.log(RANDOM_START);
		if (RANDOM_START) {
			console.log("random");
			const randomPoint = getRandomEquatorPoint();
			viewer.camera.position.copy(randomPoint);
			viewer.camera.lookAt(new THREE.Vector3(0, 0, 0));
		} else {
			console.log("center");
			viewer.camera.position.set(1, 0, 0);
			viewer.camera.quaternion.setFromAxisAngle(
				new THREE.Vector3(0, 1, 0),
				Math.PI / 2,
			);
		}
		onVideoStarted();
	});

	// video end listener
	videoPanorama.videoElement.addEventListener("ended", () => {
		ready_to_start = 0;
		stopCameraRotationTracking();
		blurOverlay.remove();
		blurOverlay = null;
		getRating();
	});

	if (mode === "Dynamic" || mode === "Edge-Hover") {
		// mousemove listener
		container.addEventListener("mousemove", (event) => {
			const rect = container.getBoundingClientRect();

			mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		});
	}
}

// Audio Captcha
