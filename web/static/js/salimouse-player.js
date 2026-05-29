// Countdown duration before next video
const SECONDS_BEFORE_VIDEO_START = 2;

// Array with all videos should be played
var videos_list = null;
var participation_id = null;

// Index of current showing video
var curr_video_index = -1;
var curr_video_info = null;

var num_downloaded_videos = 0;

// Got verification code
var verification_code = null;

// Current position of video
var curr_frame_timestamp = -1;
// Current head position
var curr_head_rotation_x = 0;
var curr_head_rotation_y = 0;
var curr_head_rotation_z = 0;

//rotate speed
var speed = null;

//unseen cursor flag
let unseenCursorActive = false;

// speed validation video link
var FPV_VIDEO_URL = null;
var VAL_BALL = null;
var VAL_BALL_1_25x = null;
var VAL_BALL_1_5x = null;
var VAL_BALL_2x = null;

// main viewer
let viewer = null;
let videoPanorama = null;
let currentPanorama = null;
let animationFrameId;
var ready_to_start = 0;

// validation viewer
let validationViewer = null;
let validationPanorama = null;

// sensitivity setting viewer
var sen_control_viewer = null;
let panorama = null;

// sensitivity setting handler
let SC_enterHandler = null;
let SC_exitHandler = null;
let SC_keydownHandler = null;
let SC_rangeInputHandler = null;

// cursor vector
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const cursorEuler = new THREE.Euler(0, 0, 0, "YXZ");
const cursorCamera = new THREE.Object3D();

// New participation flag
var new_participation = true;

// Handler
let main_enterHandler = null;
let main_exitHandler = null;

// Audio captcha
var captcha_number;

// Cursor direction in dynamic and Edge-Hover mode
let lastCursorDirection = null;

// set unseen cursor
function setUnseenCursor(enabled) {
	if (mode !== "Standard" || !UNSEEN_CURSOR) return;

	if (enabled && !unseenCursorActive) {
		document.body.classList.add("unseen-cursor");
		unseenCursorActive = true;
	} else if (!enabled && unseenCursorActive) {
		document.body.classList.remove("unseen-cursor");
		unseenCursorActive = false;
	}
}

class ActionHandler {
	constructor(element, eventType, triggerKey = null, handler) {
		this.el = element;
		this.eventType = eventType;
		this.triggerKey = triggerKey;
		this.handler = handler;
		this.listener = this.handleEvent.bind(this);
		this.el.addEventListener(this.eventType, this.listener);
	}

	handleEvent(e) {
		if (
			e instanceof KeyboardEvent &&
			this.triggerKey &&
			e.key !== this.triggerKey
		) {
			return;
		}
		this.handler(e);
	}
	destroy() {
		this.el.removeEventListener(this.eventType, this.listener);
	}
}

// Get random direction
function getRandomEquatorPoint() {
	const randomLongitude = Math.random() * 360;
	const latitude = 0;
	const phi = (90 - latitude) * (Math.PI / 180);
	const theta = randomLongitude * (Math.PI / 180);
	const x = Math.sin(phi) * Math.cos(theta);
	const y = Math.cos(phi);
	const z = Math.sin(phi) * Math.sin(theta);
	return new THREE.Vector3(x, y, z);
}

// admin mode
function admin_mode(retryCount = 30) {
	$.ajax({
		method: "POST",
		url: "/admin_mode.json",
		dataType: "json",
		contentType: "application/json; charset=utf-8",
		cache: false,
		data: JSON.stringify({
			id: participation_id,
		}),
	})
		.done((data, textStatus) => {
			console.log("admin mode set sending:", data.status);
		})
		.fail((data, textStatus) => {
			if (retryCount > 0) {
				// Retry the AJAX call with one less retry count after a 1-second delay
				setTimeout(() => {
					uploadScreenInfo(retryCount - 1);
				}, 1000); // 1000 milliseconds = 1 second
			} else {
				console.log("Can't send admin mode set for", data);
			}
		});
}

// Coordinate processing

// round
function roundTimestamp(ts) {
	return Math.round(ts * 1000000000) / 1;
}
function roundAngle(x) {
	return Math.round(x * 1000) / 1000;
}

// Update Head Rotation
function addHeadRotation(camera, time) {
	var head_rotation = curr_video_info.head_rotation;
	var x, y, z;
	if (mode === "Dynamic" || mode === "Edge-Hover") {
		x = cursorEuler.x;
		y = cursorEuler.y;
		z = cursorEuler.z;
	} else if (mode === "FPV") {
		x = Math.asin(Math.sin(camera.rotation.x) * Math.cos(camera.rotation.y));
		y = Math.atan2(
			Math.sin(camera.rotation.y),
			Math.cos(camera.rotation.y) * Math.cos(camera.rotation.x),
		);
		z = camera.rotation.z;
	} else {
		x = camera.rotation.x;
		y = camera.rotation.y;
		z = camera.rotation.z;
	}
	head_rotation.x.push(roundAngle(x));
	head_rotation.y.push(roundAngle(y));
	head_rotation.z.push(roundAngle(z));
	head_rotation.t.push(roundTimestamp(time));
}

// Downloading videos and media

// Fetch videos list and download them in background
function getParticipation(callback, retryCount = 30) {
	// Gather all helpful data
	var client_info = {
		viewport_width: document.documentElement.clientWidth,
		viewport_height: document.documentElement.clientHeight,

		screen_width: screen.width,
		screen_height: screen.height,

		device_pixel_ratio: window.devicePixelRatio,
	};

	$.ajax({
		method: "POST",
		url: `/get_participation_${EXPERIMENT_ID}.json`,
		dataType: "json",
		contentType: "application/json; charset=utf-8",
		cache: false,
		data: JSON.stringify({
			timestamp: getISODateTime(),
			client_info: client_info,
		}),
	})
		.done(callback)
		.fail(() => {
			if (retryCount > 0) {
				// Retry the AJAX call with one less retry count after a 1-second delay
				setTimeout(() => {
					getParticipation(callback, retryCount - 1);
				}, 1000); // 1000 milliseconds = 1 second
			} else {
				alert("Can't load videos info");
			}
		});
}

// Download all metadata
function downloadAll(videos_info_json) {
	participation_id = videos_info_json.participation_id;
	videos_list = videos_info_json.videos;
	new_participation = videos_info_json.new_participation;

	if (
		typeof VERIFICATION_CODE_FROM_CONTEXT !== "undefined" &&
		VERIFICATION_CODE_FROM_CONTEXT
	) {
		verification_code = VERIFICATION_CODE_FROM_CONTEXT;
	}

	downloadable_media = [
		{ ids: ["#img-distance"], url: "/static/imgs/dist.png" },
		{ ids: ["#mac_instruction"], url: "/static/imgs/mac_instruction.png" },
		{
			ids: ["#video-mouse-val-instr", "#video-mouse-validation"],
			url: "/static/video/mouse_val_video_7s.mp4",
		},
		{
			ids: ["#mouse-validation-preview"],
			url: "/static/imgs/mouse_val_preview.png",
		},
		{ ids: ["#img-stars"], url: "/static/imgs/stars.jpg" },
		{ ids: ["#gaze-image"], url: "/static/imgs/cp.png" },
		{ ids: ["#100-prc"], url: "/static/imgs/100_prc.png" },
		{ ids: ["#125-prc"], url: "/static/imgs/125_prc.png" },
		{ ids: ["#rules"], url: "/static/imgs/rules.jpeg" },
		{ ids: ["#cards"], url: "/static/imgs/cards.jpeg" },
		{ ids: ["penguins"], url: "/static/video/penguins.mp4" },
		{ ids: ["val_ball"], url: "/static/video/val_ball.mp4" },
		{ ids: ["val_ball_1_25x"], url: "/static/video/val_ball_1_25x.mp4" },
		{ ids: ["val_ball_1_5x"], url: "/static/video/val_ball_1_5x.mp4" },
		{ ids: ["val_ball_2x"], url: "/static/video/val_ball_2x.mp4" },
	];

	if (mode === "FPV") {
		for (let i = 1; i < 5; i++) {
			downloadable_media.push({
				ids: [`#video-instruction${i}`],
				url: `/static/video/instruction${i}-FPV.mp4`,
			});
		}
	} else if (mode === "Dynamic") {
		for (let i = 1; i < 5; i++) {
			downloadable_media.push({
				ids: [`#video-instruction${i}`],
				url: `/static/video/instruction${i}-dyn.mp4`,
			});
		}
	} else if (mode === "Edge-Hover") {
		for (let i = 1; i < 5; i++) {
			downloadable_media.push({
				ids: [`#video-instruction${i}`],
				url: `/static/video/instruction${i}-Edge.mp4`,
			});
		}
	} else {
		for (let i = 1; i < 5; i++) {
			downloadable_media.push({
				ids: [`#video-instruction${i}`],
				url: `/static/video/instruction${i}.mp4`,
			});
		}
	}

	for (let i = 0; i < downloadable_media.length; i++) {
		downloadMedia(downloadable_media[i]);
	}

	if (NUM_SEEN_VIDEOS > 0 || window.location.hash.includes("skip-tutorial")) {
		console.log("skip tutorial");
		$("#viewer").show();
		$("#instructions-panel").hide();
	} else {
		navigation("start");
	}

	if (videos_list.length === 0) {
		$("#no-videos-to-download-panel").show();
		updateAllVerificationCodes(verification_code);
		addCopyHandlersToAllCodeElements();
		return;
	}

	$("#total-videos-counter").text(videos_list.length);
	$("#total-videos-downloaded").text(videos_list.length);
	$("#downloading-panel").show();

	function startDownloadingVideos() {
		for (let video_num = 0; video_num < videos_list.length; ++video_num) {
			const video_info = videos_list[video_num];
			downloadVideo(video_info, onVideoDownload, onAllVideosDownload);
		}
	}

	if (!new_participation) {
		fetchRotateSpeed()
			.then((loadedSpeed) => {
				if (loadedSpeed !== null) {
					speed = loadedSpeed;
					console.log("Loaded speed for existing user:", speed);
				}
				startDownloadingVideos();
			})
			.catch((err) => {
				console.warn("Failed to load rotate speed, using default", err);
				startDownloadingVideos();
			});
	} else {
		startDownloadingVideos();
	}
}

function onVideoDownload() {
	$("#downloaded-videos-counter").text(num_downloaded_videos);
}

function onAllVideosDownload() {
	$("#downloading-panel").hide();
	$("#downloaded-panel").show();
	curr_video_index = 0;
}

// Download one video
function downloadVideo(video_info, callback_one, callback_all) {
	var download_retries = 0;

	// Create XHR and FileReader objects
	function doDownload() {
		var xhr = new XMLHttpRequest();
		xhr.responseType = "blob";
		xhr.open("GET", video_info.url, true);

		xhr.addEventListener(
			"load",
			() => {
				if (xhr.status === 200) {
					video_info.data_blob = xhr.response;
					video_info.data_url = URL.createObjectURL(xhr.response);

					++num_downloaded_videos;

					if (callback_one) callback_one();

					if (callback_all && num_downloaded_videos >= videos_list.length)
						callback_all();
				} else {
					console.log("Retrying download for", video_info.url);
					if (download_retries < 40) {
						download_retries++;
						setTimeout(doDownload, 1000); // Retry
					} else {
						$("#load-error").show();
					}
				}
			},
			false,
		);

		xhr.addEventListener("error", () => {
			console.log("Retrying download for", video_info.url);
			if (download_retries < 40) {
				download_retries++;
				setTimeout(doDownload, 1000); // Retry
			} else {
				$("#load-error").show();
			}
		});
		// Send XHR
		xhr.send();
	}

	doDownload();
}

// Showing videos

// Start Showing
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
function prepareCaptcha() {
	if (
		![0, Math.floor(videos_list.length / 2)].includes(curr_video_index) ||
		!WITH_AUDIO
	) {
		prepareVideoShow();
		return;
	}

	audio_numbers = [
		"1337",
		"4738",
		"5862",
		"7231",
		"7921",
		"4258",
		"5225",
		"6703",
		"7801",
		"9358",
	];
	captcha_number = audio_numbers[Math.floor(Math.random() * 10)];

	$("#captcha-src").attr("src", `/static/audios/${captcha_number}.mp3`);
	$("#captcha-controls")[0].load();
	$("#audio-captcha").show();
	console.log("show captcha");
}

// download rotate speed from backup
function fetchRotateSpeed() {
	if (!participation_id) return Promise.resolve(null);
	return fetch(`/rotate_speed/?id=${participation_id}`, {
		method: "GET",
		credentials: "same-origin",
	})
		.then((resp) => {
			if (!resp.ok) return null;
			return resp.json();
		})
		.then((data) => {
			if (data && data.rotate_speed != null) {
				speed = Number(data.rotate_speed);
			}
			return speed;
		})
		.catch((err) => {
			console.warn("fetchRotateSpeed failed", err);
			return null;
		});
}

function destroySensitivityViewport() {
	const testContainer = document.getElementById("sensitivity-test-container");
	const fpsRange = document.getElementById("fpsRange");
	const instruction = document.getElementById("fpv-instruction");
	const confirmPanel = document.getElementById("sensitivity-confirm");

	try {
		if (document.pointerLockElement) {
			document.exitPointerLock();
		}
	} catch (err) {
		console.warn("Pointer Lock could not be exited cleanly:", err);
	}

	if (SC_enterHandler) {
		SC_enterHandler.destroy();
		SC_enterHandler = null;
	}

	if (SC_exitHandler) {
		SC_exitHandler.destroy();
		SC_exitHandler = null;
	}

	setUnseenCursor(false);

	if (instruction) instruction.remove();
	if (confirmPanel) confirmPanel.remove();
	if (testContainer) testContainer.style.display = "none";

	if (fpsRange) {
		if (SC_rangeInputHandler) {
			fpsRange.removeEventListener("input", SC_rangeInputHandler);
			fpsRange.removeEventListener("change", SC_rangeInputHandler);
		}
	}
	if (SC_keydownHandler) {
		window.removeEventListener("keydown", SC_keydownHandler);
		SC_keydownHandler = null;
	}
	SC_rangeInputHandler = null;

	if (panorama && sen_control_viewer) {
		try {
			sen_control_viewer.remove(panorama);
		} catch (_e) {}
	}
	if (panorama) {
		try {
			panorama.dispose();
		} catch (_e) {}
		panorama = null;
	}

	if (testContainer) {
		const panolensCanvas = testContainer.querySelector("canvas.panolens-canvas");
		if (panolensCanvas) {
			try {
				testContainer.removeChild(panolensCanvas);
			} catch (_e) {}
		}
	}

	if (sen_control_viewer) {
		try {
			sen_control_viewer.dispose();
		} catch (_e) {}
		sen_control_viewer = null;
	}
}

// Sensitivity setting
async function sensitivity_control() {
	await fetchRotateSpeed();

	console.log("sensitivity_control");
	const testContainer = document.getElementById("sensitivity-test-container");
	if (!testContainer) return;
	testContainer.style.display = "block";

	const startBtn = document.getElementById("start-calibration-btn");
	if (!startBtn) return;

	startBtn.style.display = "block";

	const instructionElement = document.createElement("div");
	instructionElement.id = "fpv-instruction";
	instructionElement.style.cssText = `
    pointer-events: none;
    position: absolute;
    top: 20px;
    right: 20px;
    color: white;
    background-color: rgba(0, 0, 0, 0.8);
    padding: 15px;
    border-radius: 8px;
    text-align: left;
    z-index: 10000;
    max-width: 300px;
    font-size: 14px;
    line-height: 1.4;
    border: 1px solid rgba(255, 255, 255, 0.2);
  `;
	if (mode === "FPV") {
		instructionElement.innerHTML = `
      <div> <strong> Please adjust the camera rotation sensitivity. </strong></div>
      <div style="margin-bottom: 8px; font-weight: bold;">Controls:</div>
      <div>• You can interact with the panorama using a computer mouse.</div>
      <div>• The camera rotates in the direction the mouse moves.</div>
      <div>• Use the ← → arrows to adjust sensitivity</div>
      <div>• Press Enter to continue</div>
    `;
	} else if (mode === "Dynamic") {
		instructionElement.innerHTML = `
      <div> <strong> Please adjust the camera rotation sensitivity. </strong></div>
      <div style="margin-bottom: 8px; font-weight: bold;">Controls:</div>
      <div>• You can interact with the panorama using the WASD keys</div>
      <div>• Use the ← → arrows to adjust sensitivity</div>
      <div>• Press Enter to continue</div>
    `;
	} else if (mode === "Edge-Hover") {
		instructionElement.innerHTML = `
      <div> <strong> Please adjust the camera rotation sensitivity. </strong></div>
      <div style="margin-bottom: 8px; font-weight: bold;">Controls:</div>
      <div>• You can interact with the panorama using a computer mouse</div>
      <div>• When the cursor approaches the screen edge, the panorama starts rotating</div>
      <div>• Use the ← → arrows to adjust sensitivity</div>
      <div>• Press Enter to continue</div>
    `;
	} else if (mode === "Standard") {
		instructionElement.innerHTML = `
      <div> <strong> Please adjust the camera rotation sensitivity. </strong></div>
      <div style="margin-bottom: 8px; font-weight: bold;">Controls:</div>
      <div>• You can interact with the panorama using a computer mouse</div>
      <div>• Use the ← → arrows to adjust sensitivity</div>
      <div>• Press Enter to continue</div>
    `;
	}
	testContainer.appendChild(instructionElement);

	let DEFAULT_SPEED = null;
	console.log("speed", speed);
	if (speed) {
		if (mode === "Standard" || mode === "Dynamic") {
			DEFAULT_SPEED = Math.abs(speed * 100);
		} else {
			DEFAULT_SPEED = Math.abs(speed * 1000);
		}
	} else {
		DEFAULT_SPEED = 15;
	}
	const MIN_SPEED = 5;
	const MAX_SPEED = 200;
	const STEP = 1;

	const videoUrl = window.FPV_VIDEO_URL || "/static/video/penguins.mp4";

	if (!sen_control_viewer) {
		console.log("set viewer");
		console.log("speed", speed);
		if (mode === "FPV") {
			sen_control_viewer = new PANOLENS.Viewer({
				container: testContainer,
				controlMode: "fps",
				controlBar: false,
				momentum: false,
				fpsLookSpeed: DEFAULT_SPEED / 10000,
				cameraFov: FIELD_OF_VIEW,
			});
		} else if (mode === "Standard" || mode === "Dynamic") {
			sen_control_viewer = new PANOLENS.Viewer({
				container: testContainer,
				controlBar: false,
				momentum: false,
				cameraFov: FIELD_OF_VIEW,
			});
			if (sen_control_viewer.OrbitControls) {
				sen_control_viewer.OrbitControls.noZoom = true;
				sen_control_viewer.OrbitControls.rotateSpeed = -DEFAULT_SPEED / 100;
			} else {
				setTimeout(() => {
					if (sen_control_viewer.OrbitControls) {
						sen_control_viewer.OrbitControls.noZoom = true;
						sen_control_viewer.OrbitControls.rotateSpeed = -DEFAULT_SPEED / 100;
					}
				}, 50);
			}
			if (mode === "Dynamic" && sen_control_viewer.OrbitControls) {
				sen_control_viewer.OrbitControls.mouseButtons.ORBIT = null;
			}

			if (
				mode === "Standard" &&
				UNSEEN_CURSOR &&
				sen_control_viewer.OrbitControls
			) {
				const controls = sen_control_viewer.OrbitControls;

				controls.addEventListener("start", () => setUnseenCursor(true));
				controls.addEventListener("end", () => setUnseenCursor(false));
			}
		} else if (mode === "Edge-Hover") {
			sen_control_viewer = new PANOLENS.Viewer({
				container: testContainer,
				controlBar: false,
				momentum: false,
				controlMode: "edge-hover",
				edgeHoverSpeed: DEFAULT_SPEED / 1000,
				cameraFov: FIELD_OF_VIEW,
			});
		}
	}

	panorama = new PANOLENS.VideoPanorama(videoUrl, {
		autoplay: false,
		loop: true,
		muted: true,
	});
	sen_control_viewer.add(panorama);

	if (mode === "FPV") {
		SC_enterHandler = new ActionHandler(
			panorama.videoElement,
			"play",
			null,
			() => sen_control_viewer.enterPointerLock(),
		);
		SC_exitHandler = new ActionHandler(window, "keydown", "Enter", () =>
			sen_control_viewer.exitPointerLock(),
		);
	}

	const tryPlay = () => {
		const video = panorama.videoElement;
		if (!video) return setTimeout(tryPlay, 200);
		if (video.readyState === 4) {
			video.play().catch((err) => console.warn("Autoplay did not work:", err));
		} else {
			setTimeout(tryPlay, 300);
		}
	};

	startBtn.onclick = () => {
		startBtn.style.display = "none";
		tryPlay();
	};

	panorama.videoElement.addEventListener("play", () =>
		centerViewerCamera(sen_control_viewer),
	);

	const fpsRange = document.getElementById("fpsRange");
	const sensitivityValue = document.getElementById("sensitivityValue");
	if (!fpsRange || !sensitivityValue) {
		console.warn(
			"sensitivity_control: missing #fpsRange or #sensitivityValue in DOM",
		);
		return;
	}

	// Get current speed
	function getCurrentFps() {
		if (!sen_control_viewer) return DEFAULT_SPEED;

		if (mode === "FPV") {
			const val = sen_control_viewer.options?.fpsLookSpeed;
			return Math.round((val ?? DEFAULT_SPEED / 10000) * 10000);
		}

		if (mode === "Standard" || mode === "Dynamic") {
			if (!sen_control_viewer.OrbitControls) return DEFAULT_SPEED;
			const val = Math.abs(sen_control_viewer.OrbitControls.rotateSpeed);
			console.log("rot", val);
			console.log(Math.round((val ?? DEFAULT_SPEED / 100) * 100));
			return Math.round((val ?? DEFAULT_SPEED / 100) * 100);
		}

		if (mode === "Edge-Hover") {
			const val = sen_control_viewer.options?.edgeHoverSpeed;
			return Math.round((val ?? DEFAULT_SPEED / 1000) * 1000);
		}

		return DEFAULT_SPEED;
	}

	// Set speed
	function setSpeed(val) {
		console.log(val);
		let v = Number(Math.abs(val));
		if (Number.isNaN(v)) return;
		console.log(v);

		v = Math.max(MIN_SPEED, Math.min(v, MAX_SPEED));

		if (mode === "FPV") {
			const internal = v / 10000;
			if (
				sen_control_viewer &&
				typeof sen_control_viewer.setFpsLookSpeed === "function"
			) {
				sen_control_viewer.setFpsLookSpeed(internal);
			} else if (sen_control_viewer) {
				sen_control_viewer.options = sen_control_viewer.options || {};
				sen_control_viewer.options.fpsLookSpeed = internal;
			}
			speed = internal;
			if (typeof fps_speed !== "undefined") fps_speed = internal;
		} else if (mode === "Standard" || mode === "Dynamic") {
			const internal = v / 100;
			if (
				sen_control_viewer &&
				typeof sen_control_viewer.setOrbitLookSpeed === "function"
			) {
				sen_control_viewer.setOrbitLookSpeed(internal);
			} else if (sen_control_viewer && sen_control_viewer.OrbitControls) {
				sen_control_viewer.OrbitControls.rotateSpeed = internal;
			} else if (sen_control_viewer) {
				sen_control_viewer.options = sen_control_viewer.options || {};
				sen_control_viewer.options._pendingRotateSpeed = internal;
				setTimeout(() => {
					if (
						sen_control_viewer &&
						sen_control_viewer.OrbitControls &&
						sen_control_viewer.options &&
						typeof sen_control_viewer.options._pendingRotateSpeed === "number"
					) {
						sen_control_viewer.OrbitControls.rotateSpeed =
							sen_control_viewer.options._pendingRotateSpeed;
						delete sen_control_viewer.options._pendingRotateSpeed;
					}
				}, 50);
			}
			speed = internal;
		} else if (mode === "Edge-Hover") {
			const internal = v / 1000;
			if (
				sen_control_viewer &&
				typeof sen_control_viewer.setEdge_HoverLookSpeed === "function"
			) {
				sen_control_viewer.setEdge_HoverLookSpeed(internal);
			} else if (sen_control_viewer) {
				sen_control_viewer.options = sen_control_viewer.options || {};
				sen_control_viewer.options.edgeHoverSpeed = internal;
				try {
					sen_control_viewer.edgeHoverSpeed = internal;
				} catch (_e) {}
			}
			speed = internal;
		}
		fpsRange.min = MIN_SPEED;
		fpsRange.max = MAX_SPEED;
		fpsRange.step = STEP;
		console.log(v);
		fpsRange.valueAsNumber = v;
		sensitivityValue.textContent = String(v);
	}
	function onRangeInput(e) {
		setSpeed(e.target.valueAsNumber ?? e.target.value);
	}

	fpsRange.min = MIN_SPEED;
	fpsRange.max = MAX_SPEED;
	fpsRange.step = STEP;

	const initVal = getCurrentFps();
	console.log(initVal);
	const initClamped = Math.max(
		MIN_SPEED,
		Math.min(Math.abs(initVal), MAX_SPEED),
	);
	fpsRange.valueAsNumber = initClamped;
	sensitivityValue.textContent = String(initClamped);

	SC_rangeInputHandler = onRangeInput;
	SC_keydownHandler = onKeyDown;
	fpsRange.addEventListener("input", SC_rangeInputHandler);
	fpsRange.addEventListener("change", SC_rangeInputHandler);
	window.addEventListener("keydown", SC_keydownHandler);

	// key handler
	function onKeyDown(ev) {
		const active = document.activeElement;
		if (
			active &&
			(active.tagName === "INPUT" ||
				active.tagName === "TEXTAREA" ||
				active.isContentEditable)
		) {
			return;
		}

		const key = ev.key;
		let current = fpsRange.valueAsNumber;

		if (key === "ArrowRight") {
			console.log("up");
			ev.preventDefault();
			current = Math.min(current + STEP, MAX_SPEED);
			setSpeed(current);
		} else if (key === "ArrowLeft") {
			console.log("down");
			ev.preventDefault();
			current = Math.max(current - STEP, MIN_SPEED);
			setSpeed(current);
		} else if (key === "Enter") {
			ev.preventDefault();

			let confirmPanel = document.getElementById("sensitivity-confirm");

			if (confirmPanel) {
				confirmPanel.style.display = "block";
				return;
			}

			startBtn.style.display = "none";

			confirmPanel = document.createElement("div");
			confirmPanel.id = "sensitivity-confirm";
			confirmPanel.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 30px;
      border-radius: 12px;
      text-align: center;
      z-index: 10001;
      max-width: 500px;
      font-size: 16px;
      line-height: 1.5;
      border: 2px solid #fff;
    `;
			confirmPanel.innerHTML = `
      <div style="margin-bottom: 20px; font-weight: bold; font-size: 18px;">
        Confirm that the selected sensitivity is comfortable for viewing
      </div>
      <div style="margin-bottom: 25px; opacity: 0.9;">
        The selected sensitivity should allow you to navigate the entire video without difficulty.
      </div>
      <div style="display: flex; gap: 20px; justify-content: center;">
        <button id="confirm-yes" style="
          background: #4CAF50; color: white; border: none; 
          padding: 12px 24px; border-radius: 8px; 
          font-size: 16px; cursor: pointer; min-width: 140px;
        ">Yes, continue</button>
        <button id="confirm-no" style="
          background: #f44336; color: white; border: none; 
          padding: 12px 24px; border-radius: 8px; 
          font-size: 16px; cursor: pointer; min-width: 140px;
        ">No, adjust</button>
      </div>
    `;

			testContainer.appendChild(confirmPanel);

			document.getElementById("confirm-yes").onclick = () => {
				confirmPanel.remove();
				setSpeed(fpsRange.valueAsNumber);
				destroySensitivityViewport();
				sendRotateSpeed(speed);
			};

			document.getElementById("confirm-no").onclick = () => {
				if (!document.pointerLockElement) {
					try {
						sen_control_viewer.enterPointerLock();
					} catch (err) {
						console.warn("Failed to restore PointerLock:", err);
					}
				}
				confirmPanel.remove();
			};

			return;
		}
	}
}

// Send the selected speed to the server
function sendRotateSpeed(rotate_speed) {
	$.ajax({
		method: "POST",
		url: "/rotate_speed/",
		dataType: "json",
		contentType: "application/json; charset=utf-8",
		cache: false,
		data: JSON.stringify({
			id: participation_id,
			rotate_speed: rotate_speed,
		}),
	})
		.done((data, textStatus) => {
			console.log("rotate speed saved:", data.status);
			navigation("continue");
		})
		.fail((_data, textStatus) => {
			setTimeout(() => {
				sendRotateSpeed(rotate_speed);
			}, 1000);
		});
}

// Send head rotation array and validation results to the server
function sendVideoViewResults(curr_video, retryCount = 30) {
	$.ajax({
		method: "POST",
		url: "/video_view_result.json",
		dataType: "json",
		contentType: "application/json; charset=utf-8",
		cache: false,
		data: JSON.stringify({
			participation: participation_id,
			video: curr_video.id,
			client_timestamp_start: curr_video.timestamp_start.toISOString(),
			client_timestamp_finish: curr_video.timestamp_finish.toISOString(),
			data_gazes: curr_video.head_rotation,
			data_fps: curr_video.fps_data,
			video_score: curr_video.video_score,
		}),
	})
		.done((data, textStatus) => {
			curr_video.sent = true;
			curr_video.accepted = data.status === "ok";
			if (Object.hasOwn(data, "verification_code")) {
				verification_code = data.verification_code;

				updateAllVerificationCodes(verification_code);
			}
		})
		.fail((data, textStatus) => {
			if (retryCount > 0) {
				// Retry the AJAX call with one less retry count after a 1-second delay
				setTimeout(() => {
					sendVideoViewResults(curr_video, retryCount - 1);
				}, 1000); // 1000 milliseconds = 1 second
			} else {
				console.log("Can't send video view data for", curr_video.url, data);
			}
		});
}

// Stop camera rotation tracking
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
	setUnseenCursor(false);
	curr_video_info.timestamp_finish = new Date();
	sendVideoViewResults(curr_video_info);

	++curr_video_index;
	curr_video_info = videos_list[curr_video_index];

	if (curr_video_index < videos_list.length) {
		$("#next-video-number").text(curr_video_index + 1);
		$("#next-video-timer").text(SECONDS_BEFORE_VIDEO_START);
		prepareVideoShow();
	} else {
		onShowFinished();
	}
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
var instruction_page = 1;
var done_val_num = 0;

function updateContinueButtonVisibility() {
	const button = $("#continue-button");
	const pagesWithSharedContinueButton = [2, 9, 10, 11, 12, 13];

	if (pagesWithSharedContinueButton.includes(instruction_page)) {
		button.show();
	} else {
		button.hide();
	}
}

function navigation(direction) {
	let prev_cart;
	if (direction === "start") {
		console.log("start");
		if (new_participation) {
			if (FAST_MODE) {
				instruction_page = 2;
			} else {
				instruction_page = 1;
			}
		} else {
			instruction_page = 2;
		}
		$("#viewer").hide();
		$("#instructions-panel").show();
		updateInstructionTexts();
	} else if (direction === "continue") {
		prev_cart = $(`#instruction_${instruction_page}`);
		prev_cart.children("video").each((_index, elem) => {
			elem.pause();
		});
		prev_cart.hide();

		if (instruction_page === 7) {
			destroySensitivityViewport();
		}

		if (instruction_page === 1) {
			try {
				openFullscreen();
			} catch (e) {
				console.log(e);
			}
		}

		if (instruction_page === 5) {
      console.log(out_time)
			if (out_time < 0.75 * mouse_test_duration) {
				valid_mouse_tests += 1;
				pass_2d.push(true);
			} else {
				console.log("validation-failure");
				pass_2d.push(false);
			}
			done_val_num += 1;
			if (valid_mouse_tests === 2) {
				instruction_page += 2;
			} else if (done_val_num < 3 && valid_mouse_tests < 2) {
				reaction_info.push({});
				reaction_info_index = reaction_info.length - 1;
				resetMouseValidation();
				instruction_page -= 1;
			} else if (done_val_num === 3 && valid_mouse_tests < 2) {
				instruction_page += 1;
			}
		} else {
			instruction_page += 1;
		}
	} else if (direction === "return") {
		prev_cart = $(`#instruction_${instruction_page}`);
		prev_cart.children("video").each((_index, elem) => {
			elem.pause();
		});
		prev_cart.hide();

		if (instruction_page === 7) {
			destroySensitivityViewport();
		}

		resetMouseValidation();
		instruction_page -= 1;
	}

	if (instruction_page === 7) {
		$("#instruction_7").show();
		sensitivity_control();
	}
	if (instruction_page === 8) {
		$("#instruction_8").show();
		start360Validation("validation360");
	}

	if (instruction_page === 13 && !STARS) {
		instruction_page = 14;
	}
	updateContinueButtonVisibility();

	if (instruction_page > 13) {
		try {
			openFullscreen();
		} catch (e) {
			console.log(e);
		}
		$("#instructions-panel").hide();
		$("#viewer").show();
	} else {
		const cart = $(`#instruction_${instruction_page}`);
		cart.children("video").each((_index, elem) => {
			elem.play();
		});
		cart.show();
		if (instruction_page === 4) {
			textShrink2();
		}
		const button = $("#continue-button");
		button.attr("disabled", "disabled");
		setTimeout(() => {
			button.removeAttr("disabled");
		}, 5000);
	}
}

// 2D mouse validation instructions
function textShrink1() {
	val_video_instr_elem = document.getElementById("video-mouse-val-instr");
	if (
		val_video_instr_elem &&
		val_video_instr_elem.getBoundingClientRect().width > 0
	) {
		val_rect = val_video_instr_elem.getBoundingClientRect();
		document.getElementById("text-shrink-1").style.width =
			`${Math.max(0.7 * val_rect.width, 0.5 * screen.width)}px`;
	}
}

function textShrink2() {
	if (document.getElementById("mouse-val-start-button")) {
		start_button_elem = document.getElementById("mouse-val-start-button");
		preview_rect = document
			.getElementById("mouse-validation-preview")
			.getBoundingClientRect();
		start_button_elem.style.top =
			preview_rect.top +
			(200 * preview_rect.height) / 2160 -
			start_button_elem.offsetHeight / 2 +
			"px";
		start_button_elem.style.left =
			preview_rect.left +
			(200 * preview_rect.width) / 3840 -
			start_button_elem.offsetWidth / 2 +
			"px";
		document.getElementById("text-shrink-2").style.width =
			`${0.7 * Math.max(preview_rect.width, 0.5 * screen.width)}px`;
	}
}

window.addEventListener("load", () => {
	textShrink1();
});

// If full screen change
function onFullscreenChange() {
	console.log("fullscreenchange", !!document.fullscreenElement);

	fullScreenMode =
		document.webkitFullscreenElement != null ||
		document.fullscreenElement != null ||
		document.mozFullScreenElement != null ||
		document.msFullScreenElement != null;

	toggleFlags();
}

function addListenerMulti(element, eventNames, listener) {
	var events = eventNames.split(" ");
	for (let i = 0, iLen = events.length; i < iLen; i++) {
		element.addEventListener(events[i], listener);
	}
}

document.addEventListener("DOMContentLoaded", () => {
	function onResize() {
		console.log("resize");
		textShrink1();
		textShrink2();

		checkDevtools();
		setTimeout(() => checkDevtools(), 500);
	}
	window.addEventListener("resize", onResize);
	window.addEventListener("onresize", onResize);

	addListenerMulti(
		document,
		"fullscreenchange webkitfullscreenchange mozfullscreenchange msfullscreenchange",
		onFullscreenChange,
	);

	getParticipation(downloadAll);

	$("#instruction_5").on("mousemove", (e) => {
		val_video_rect = document
			.getElementById("video-mouse-validation")
			.getBoundingClientRect();
		cursor_x = e.pageX - val_video_rect.x;
		cursor_y = e.pageY - val_video_rect.y;
		updateReactInfo(cursor_x, cursor_y);
	});

	$("#video-mouse-validation").on("ended", () => {
		updateReactInfo(sq_init_size / 2, sq_init_size / 2);
		current_time = document.getElementById(
			"video-mouse-validation",
		).currentTime;
		if (current_time >= mouse_test_duration) {
			navigation("continue");
		}
	});
}); // DOMContentLoaded

// 2D mouse validation

mouse_test_duration = 7;
sq_init_size = 200;
init_height = 1080;
valid_mouse_tests = 0;
reaction_info = [{}];
pass_2d = [];
reaction_info_index = reaction_info.length - 1;
resetMouseValidation();

function resetMouseValidation() {
  current_start = 0;
  out_time = 0;
  stop_time = 0;
  prev_stat = 'in';
  reaction_info[reaction_info_index] = {
      stop_timestamps: [],
      out_timestamps: []
  };
}

function updateReactInfo(cursor_x, cursor_y) {
  video_elem = document.getElementById('video-mouse-validation');
  current_time = video_elem.currentTime;
  
  current_dur = current_time - current_start;
  if (current_dur > 0.1) {

    stop_time += current_dur
    reaction_info[reaction_info_index].stop_timestamps.push([current_start, current_dur]);
  }
  current_start = current_time;
  
  frame_width = video_elem.offsetWidth;
  frame_height = video_elem.offsetHeight;
  sq_size = frame_height * sq_init_size / init_height;
  frame_width_corr = frame_width - sq_size;
  frame_height_corr = frame_height - sq_size;
  
  up_time = mouse_test_duration / 2 * frame_width_corr / (frame_height_corr + frame_width_corr);
  right_time = mouse_test_duration / 2;
  down_time = right_time + up_time;
  if (current_time < up_time) {
    sq_x = frame_width_corr * current_time / up_time;
    sq_y = 0;
  } else if (current_time < right_time) {
    sq_x = frame_width_corr - 1;
    sq_y = frame_height_corr * (current_time - up_time) / (right_time - up_time);
  } else if (current_time < down_time) {
    sq_x = frame_width_corr * (down_time - current_time) / (down_time - right_time);
    sq_y = frame_height_corr - 1;
  } else {
    sq_x = 0;
    sq_y = frame_height_corr * (mouse_test_duration - current_time) / (mouse_test_duration - down_time);
  }
  
  if (!(sq_x < cursor_x && cursor_x < sq_x + sq_size && sq_y < cursor_y && cursor_y < sq_y + sq_size)) {

    prev_stat = 'out';
    out_time += current_dur;
    reaction_info[reaction_info_index].out_timestamps.push([current_time, current_dur, 'out']);
  } else {
    if (current_dur > 0.5) {
      out_time += current_dur;
    }
    if (prev_stat == 'out') {
      out_time += current_dur / 2;
    }

    prev_stat = 'in';
    reaction_info[reaction_info_index].out_timestamps.push([current_time, current_dur, 'in']);
  }
}


// 360 mouse validation

validation_test_duration = 20;
part = validation_test_duration / 10;
validation360Runs = 0;
done_val_num360 = 0;
val360_pass_count = 0;
reaction_info_360 = [{}];
pass_360 = [];
val_enterHandler = null;
val_exitHandler = null;

function reset360Validation() {
	reaction_info_360.push({});
	reaction_info_index = reaction_info_360.length - 1;
	reaction_info_360[reaction_info_index] = {
		stop_timestamps: [],
		out_timestamps: [],
	};

	insideTime = 0;
	outsideTime = 0;
	validation360Runs += 1;
	let video_url = null;

	if (validation360Runs === 3) {
		validation_test_duration = 20 / 1.25;
		part = 2 / 1.25;
		video_url = window.VAL_BALL_1_25x || "/static/video/val_ball_1_25x.mp4";
	} else if (validation360Runs === 4) {
		validation_test_duration = 20 / 1.5;
		part = 2 / 1.5;
		video_url = window.VAL_BALL_1_5x || "/static/video/val_ball_1_5x.mp4";
	} else if (validation360Runs === 5) {
		validation_test_duration = 20 / 2;
		part = 2 / 2;
		video_url = window.VAL_BALL_2x || "/static/video/val_ball_2x.mp4";
	} else {
		validation_test_duration = 20;
		part = 2;
	}

	if (validation360Runs > 2) {
		if (validationPanorama) {
			validationViewer.remove(validationPanorama);
			validationPanorama.dispose();
		}

		validationPanorama = new PANOLENS.VideoPanorama(video_url, {
			autoplay: false,
			loop: false,
			muted: true,
		});

		validationViewer.add(validationPanorama);

		validationPanorama.videoElement.addEventListener(
			"loadeddata",
			() => centerViewerCamera(validationViewer),
		);
		validationPanorama.videoElement.addEventListener("play", () =>
			centerViewerCamera(validationViewer),
		);

		if (mode === "FPV") {
			val_enterHandler = new ActionHandler(
				validationPanorama.videoElement,
				"play",
				null,
				() => validationViewer.enterPointerLock(),
			);
			val_exitHandler = new ActionHandler(
				validationPanorama.videoElement,
				"ended",
				null,
				() => validationViewer.exitPointerLock(),
			);
		}
	}

	console.log("reset360Validation, run:", validation360Runs);
}

function abort360ValidationAndReset() {
	if (val360_animFrame) {
		cancelAnimationFrame(val360_animFrame);
		val360_animFrame = null;
	}

	try {
		if (validationPanorama?.videoElement) {
			validationPanorama.videoElement.pause();
		}
	} catch (e) {
		console.warn("abort360ValidationAndReset video stop error", e);
	}

	validation360Runs = 0;
	done_val_num360 = 0;
	val360_pass_count = 0;

	insideTime = 0;
	outsideTime = 0;

	const failEl = document.getElementById("val360_fail_msg");
	if (failEl) {
		failEl.remove();
	}

	const startButton = document.getElementById("mouse-val360-start-button");
	if (startButton) startButton.style.display = "";
	try {
		$("#return_to_sensitivity_control").hide();
	} catch (_e) {}
	const instr = document.getElementById("val360-instruction");
	if (instr) instr.style.display = "";
	console.log("abort360ValidationAndReset: 360 state fully reset");
}

function toDeg(rad) {
	return (rad * 180) / Math.PI;
}

function computeTargetDirectionOnSphere(t) {
	const duration = validationPanorama?.videoElement?.duration
		? validationPanorama.videoElement.duration
		: typeof mouse_test_duration !== "undefined"
			? mouse_test_duration
			: 10;

	const part = duration / 10;

	let lonDeg = 180;
	let latDeg = 0;

	if (t <= part) {
		latDeg = (t / part) * 45;
	} else if (t > part && t <= 2 * part) {
		lonDeg = -((t - 1 * part) / part) * 90 + 180;
		latDeg = 45;
	} else if (t > 2 * part && t <= 4 * part) {
		lonDeg = 90;
		latDeg = 45 - ((t - 2 * part) / (2 * part)) * 90;
	} else if (t > 4 * part && t <= 6 * part) {
		lonDeg = 90 - ((t - 4 * part) / (2 * part)) * 180;
		latDeg = -45;
	} else if (t > 6 * part && t <= 8 * part) {
		lonDeg = -90;
		latDeg = -45 + ((t - 6 * part) / (2 * part)) * 90;
	} else if (t > 8 * part && t <= 9 * part) {
		lonDeg = -((t - 8 * part) / part) * 90 - 90;
		latDeg = 45;
	} else if (t > 9 * part && t <= 10 * part) {
		lonDeg = -180;
		latDeg = 45 - ((t - 9 * part) / part) * 45;
	}

	const lon = (lonDeg * Math.PI) / 180;
	const lat = (latDeg * Math.PI) / 180;

	const cosLat = Math.cos(lat);
	const x = cosLat * Math.cos(lon);
	const y = Math.sin(lat);
	const z = cosLat * Math.sin(lon);
	const dir = new THREE.Vector3(x, y, z).normalize();

	return { lonDeg: lonDeg, latDeg: latDeg, dir: dir };
}

let val360_animFrame = null;
function update360ReactInfo() {
	if (!validationPanorama?.videoElement || !validationViewer) return;

	const video = validationPanorama.videoElement;
	const t = video.currentTime;

	const lookDir = new THREE.Vector3();

	if (mode === "Dynamic" || mode === "Edge-Hover") {
		try {
			raycaster.setFromCamera(mouse, validationViewer.camera);
			const intersects = raycaster.intersectObject(validationPanorama, true);
			if (intersects?.length) {
				const targetPoint = intersects[0].point.clone();
				lookDir.copy(targetPoint).normalize();
			} else {
				validationViewer.camera.getWorldDirection(lookDir);
			}
		} catch (_e) {
			validationViewer.camera.getWorldDirection(lookDir);
		}
	} else {
		validationViewer.camera.getWorldDirection(lookDir);
	}

	const camX = lookDir.x,
		camY = lookDir.y,
		camZ = lookDir.z;
	const camLatRad = Math.asin(Math.max(-1, Math.min(1, camY)));
	const camLonRad = Math.atan2(camZ, camX);
	const camLatDeg = toDeg(camLatRad);
	const camLonDeg = toDeg(camLonRad);

	const target = computeTargetDirectionOnSphere(t);
	const targetDir = target.dir;
	const targetLonDeg = target.lonDeg;
	const targetLatDeg = target.latDeg;

	const angleRad = lookDir.angleTo(targetDir);
	const angleDeg = toDeg(angleRad);

	const ANGLE_THRESHOLD_RAD = 0.35;

	const now = performance.now();
	if (typeof update360ReactInfo._prevPerf === "undefined")
		update360ReactInfo._prevPerf = now;
	const dt = Math.max(0, (now - update360ReactInfo._prevPerf) / 1000.0);
	update360ReactInfo._prevPerf = now;
	const dtClamped = Math.min(dt, 0.2);

	const wasInside = angleRad <= ANGLE_THRESHOLD_RAD;

	if (wasInside) {
		insideTime += dtClamped;
		reaction_info_360[reaction_info_index].out_timestamps.push([
			t,
			dtClamped,
			"in",
		]);
	} else {
		outsideTime += dtClamped;
		reaction_info_360[reaction_info_index].out_timestamps.push([
			t,
			dtClamped,
			"out",
		]);
	}

	val360_animFrame = requestAnimationFrame(update360ReactInfo);
}

function finish360Validation() {
	if (val360_animFrame) {
		cancelAnimationFrame(val360_animFrame);
		val360_animFrame = null;
	}

	console.log(
		"360 validation finished. insideTime=",
		insideTime,
		"outsideTime=",
		outsideTime,
		"duration=",
		validation_test_duration,
	);

	const passed = outsideTime < 0.5 * validation_test_duration;
	if (passed) {
		val360_pass_count += 1;
		pass_360.push(true);
		console.log(
			"360 validation PASSED (val360_pass_count=",
			val360_pass_count,
			")",
		);
	} else {
		console.log("360 validation FAILED");
		pass_360.push(false);
	}

	done_val_num360 += 1;
	console.log(
		"finish360Validation: done_val_num360=",
		done_val_num360,
		"val360_pass_count=",
		val360_pass_count,
	);

	if (
		done_val_num360 === 5 ||
		(FAST_MODE && done_val_num360 === 2 && val360_pass_count === 2)
	) {
		console.log("360: >=2 passes — proceeding to next step");
		sendReactInfo();
		if (validationViewer && validationPanorama) {
			try {
				validationViewer.remove(validationPanorama);
			} catch (_e) {}
			try {
				validationPanorama.dispose();
				if (container) {
					const panolensCanvas = container.querySelector(
						"canvas.panolens-canvas",
					);
					if (panolensCanvas) {
						container.removeChild(panolensCanvas);
					}
				}
			} catch (_e) {}
		}
		validationPanorama = null;
		validationViewer = null;
		setUnseenCursor(false);
		navigation("continue");
		return;
	}

	if (done_val_num360 === 2 && val360_pass_count < 2) {
		console.log(
			"360: failed 2/3 requirement — instruct user to return to sensitivity control",
		);

		const container = document.getElementById("validation360");
		if (container) {
			let failEl = document.getElementById("val360_fail_msg");
			if (!failEl) {
				failEl = document.createElement("div");
				failEl.id = "val360_fail_msg";
				failEl.style.position = "absolute";
				failEl.style.top = "10%";
				failEl.style.left = "50%";
				failEl.style.transform = "translateX(-50%)";
				failEl.style.color = "white";
				failEl.style.background = "rgba(0,0,0,0.6)";
				failEl.style.padding = "16px";
				failEl.style.borderRadius = "6px";
				failEl.style.zIndex = 9999;
				failEl.style.fontSize = "18px";
				failEl.innerText =
					"Unfortunately, the configured sensitivity does not allow collecting the required data with sufficient accuracy. Please return to the sensitivity settings and try again.";
				container.appendChild(failEl);
			} else {
				failEl.style.display = "";
			}
		}

		$("#return_to_sensitivity_control").show();

		return;
	} else if (done_val_num360 < 5) {
		reset360Validation();
		const startButton = document.getElementById("mouse-val360-start-button");
		if (startButton) startButton.style.display = "";
		$("#return_to_sensitivity_control").show();
		const instr = document.getElementById("val360-instruction");
		if (instr) instr.style.display = "";
		return;
	}
}

function start360Validation(containerId) {
	console.log("start360Validation ->", containerId);

	const container = document.getElementById(containerId);
	if (!container) {
		console.error("start360Validation: container not found:", containerId);
		return;
	}
	container.style.display = "block";

	if (!validationViewer) {
		if (mode === "FPV") {
			validationViewer = new PANOLENS.Viewer({
				container,
				controlBar: false,
				momentum: false,
				controlMode: "fps",
				fpsLookSpeed: speed,
				cameraFov: FIELD_OF_VIEW,
			});
		} else if (mode === "Standard") {
			validationViewer = new PANOLENS.Viewer({
				container,
				controlBar: false,
				momentum: false,
				cameraFov: FIELD_OF_VIEW,
			});
			validationViewer.OrbitControls.noZoom = true;
			validationViewer.OrbitControls.rotateSpeed = -speed;

			if (
				mode === "Standard" &&
				UNSEEN_CURSOR &&
				validationViewer.OrbitControls
			) {
				const controls = validationViewer.OrbitControls;

				controls.addEventListener("start", () => setUnseenCursor(true));
				controls.addEventListener("end", () => setUnseenCursor(false));
			}
		} else if (mode === "Dynamic") {
			validationViewer = new PANOLENS.Viewer({
				container,
				controlBar: false,
				momentum: false,
				cameraFov: FIELD_OF_VIEW,
			});
			validationViewer.OrbitControls.noZoom = true;
			validationViewer.OrbitControls.mouseButtons.ORBIT = null;
			validationViewer.OrbitControls.rotateSpeed = -speed;
		} else if (mode === "Edge-Hover") {
			validationViewer = new PANOLENS.Viewer({
				container,
				controlBar: false,
				momentum: false,
				controlMode: "edge-hover",
				edgeHoverSpeed: speed,
				cameraFov: FIELD_OF_VIEW,
			});
		}

		const video_url = window.VAL_BALL || "/static/video/val_ball.mp4";

		validationPanorama = new PANOLENS.VideoPanorama(video_url, {
			autoplay: false,
			loop: false,
			muted: true,
		});

		validationViewer.add(validationPanorama);

		validationPanorama.videoElement.addEventListener(
			"loadeddata",
			() => centerViewerCamera(validationViewer),
		);
		validationPanorama.videoElement.addEventListener("play", () =>
			centerViewerCamera(validationViewer),
		);

		if (mode === "FPV") {
			val_enterHandler = new ActionHandler(
				validationPanorama.videoElement,
				"play",
				null,
				() => validationViewer.enterPointerLock(),
			);
			val_exitHandler = new ActionHandler(
				validationPanorama.videoElement,
				"ended",
				null,
				() => validationViewer.exitPointerLock(),
			);
		}
	}

	reset360Validation();

	const startButton = document.getElementById("mouse-val360-start-button");
	if (!startButton) {
		console.warn(
			"start360Validation: start button not found (#mouse-val360-start-button)",
		);
	} else {
		const handler = () => {
			startButton.style.display = "none";
			$("#return_to_sensitivity_control").hide();
			const instr = document.getElementById("val360-instruction");
			if (instr) instr.style.display = "none";

			if (validationPanorama?.videoElement) {
				validationPanorama.videoElement.addEventListener(
					"ended",
					finish360Validation,
				);

				update360ReactInfo._prevPerf = undefined;
				validationPanorama.videoElement
					.play()
					.catch((err) => console.warn("play failed", err));
				if (!val360_animFrame) {
					val360_animFrame = requestAnimationFrame(update360ReactInfo);
				}
			}
		};
		startButton.style.display = "";
		$("#return_to_sensitivity_control").show();
		startButton.removeEventListener("click", handler);
		startButton.addEventListener("click", handler);
	}

	(function attachReturnHandlerOnce() {
		const btn = document.getElementById("return_to_sensitivity_control");
		if (!btn) return;
		if (btn._abortAttached) return;
		btn.addEventListener(
			"click",
			(_ev) => {
				abort360ValidationAndReset();
				if (validationViewer) {
					try {
						validationViewer.dispose();
					} catch (_e) {}
					validationViewer = null;
					if (container) {
						const panolensCanvas = container.querySelector(
							"canvas.panolens-canvas",
						);
						if (panolensCanvas) {
							container.removeChild(panolensCanvas);
						}
					}
				}

				if (validationPanorama) {
					try {
						validationPanorama.dispose();
						if (container) {
							const panolensCanvas = container.querySelector(
								"canvas.panolens-canvas",
							);
							if (panolensCanvas) {
								container.removeChild(panolensCanvas);
							}
						}
					} catch (_e) {}
					validationPanorama = null;
				}
				$("#instruction_8").hide();
				instruction_page -= 2;
				navigation("continue");
			},
			true,
		);
		btn._abortAttached = true;
	})();

	if (mode === "Dynamic" || mode === "Edge-Hover") {
		container.addEventListener("mousemove", (event) => {
			const rect = container.getBoundingClientRect();
			mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		});
	}
}

// Send validation results to the server
function sendReactInfo() {
	$.ajax({
		method: "POST",
		url: "/react_info.json",
		dataType: "json",
		contentType: "application/json; charset=utf-8",
		cache: false,
		async: false,
		data: JSON.stringify({
			id: participation_id,
			react_info: {
				info360: reaction_info_360,
				pass_2d: pass_2d,
				info2d: reaction_info,
				pass_360: pass_360,
			},
		}),
	})
		.done((data, textStatus) => {
			console.log("reaction info sending:", data.status);
		})
		.fail((_data, textStatus) => {
			setTimeout(() => {
				sendReactInfo();
			}, 1000); // 1000 milliseconds = 1 second
		});
}

// verify audio captcha
function verifyCaptcha() {
	var userInput = document.getElementById("captcha").value;

	if (userInput === captcha_number) {
		$("#audio-captcha").hide();
		openFullscreen();
		prepareVideoShow();
	} else {
		alert("The captcha was entered incorrectly. Please try again.");
		openFullscreen();
	}
	$("#captcha").val("");

	return false;
}

function preventFreeze(video) {
	if (video.paused === false && !this.preventingFreeze) {
		this.preventingFreeze = true;
		const freezeTime = video.currentTime;
		setTimeout(() => {
			if (video.currentTime === freezeTime) {
				this.participationEvent.next({
					etype: "video_freeze",
					data: {
						video: this.left_viewer_locked ? "left" : "right",
						date: new Date().toISOString(),
					},
				});
				console.log("Freeze!");
				setTimeout(() => {
					this.preventingFreeze = false;
					this.preventFreeze(video);
				}, 5000);
			} else {
				this.preventingFreeze = false;
			}
		}, 500);
	}
}
$(".video-instruction").onwaiting = preventFreeze;

// download media
function downloadMedia(media_info) {
	var download_retries = 0;

	// Create XHR and FileReader objects
	function doDownload() {
		var xhr = new XMLHttpRequest();
		xhr.responseType = "blob";
		xhr.open("GET", media_info.url, true);
		xhr.addEventListener(
			"load",
			() => {
				if (xhr.status === 200) {
					media_info.data_blob = xhr.response;
					media_info.data_url = URL.createObjectURL(xhr.response);
					for (i = 0; i < media_info.ids.length; i++) {
						if (media_info.ids[i] === "penguins") {
							window.FPV_VIDEO_URL = media_info.data_url;
						} else if (media_info.ids[i] === "val_ball") {
							window.VAL_BALL = media_info.data_url;
						} else if (media_info.ids[i] === "val_ball_1_25x") {
							window.VAL_BALL_1_25x = media_info.data_url;
						} else if (media_info.ids[i] === "val_ball_1_5x") {
							window.VAL_BALL_1_5x = media_info.data_url;
						} else if (media_info.ids[i] === "val_ball_2x") {
							window.VAL_BALL_2x = media_info.data_url;
						}

						if (media_info.ids[i].startsWith("#")) {
							const mediaElem = $(media_info.ids[i])[0];
							if (mediaElem) {
								mediaElem.src = media_info.data_url;
							}
						}
					}
				} else {
					console.log("Retrying download for", media_info.url);
					if (download_retries < 40) {
						download_retries++;
						setTimeout(doDownload, 1000); // Retry
					} else {
						$("#load-error").show();
					}
				}
			},
			false,
		);

		xhr.addEventListener("error", () => {
			console.log("Retrying download for", media_info.url);
			if (download_retries < 20) {
				download_retries++;
				setTimeout(doDownload, 1000); // Retry
			} else {
				$("#load-error").show();
			}
		});
		// Send XHR
		xhr.send();
	}

	doDownload();
}

// screen-check component
rulerAccuracy = 0.1;
cardAccuracy = 0.05;
rulerValue1 = 7;
rulerValue2 = 5;
rulerValue3 = 13;
rulerValue4 = 11;
rulerValue5 = 3;
cardW = 8.56;
cardH = 5.398;
showQuestionnaire = true;
var questions = [
	{
		question_text: "1. Indicate your gender",
		id: 1,
		radio: [
			{
				id: 1,
				text: "Female",
			},
			{
				id: 2,
				text: "Male",
			},
			{
				id: 3,
				text: "Other",
			},
		],
		answer: null,
	},
	{
		question_text: "2. Indicate your age",
		id: 2,
		number: {
			min: "18",
			max: "99",
		},
		answer: null,
	},
	{
		question_text: "3. Assess your vision",
		id: 3,
		radio: [
			{
				id: 1,
				text: "Normal",
			},
			{
				id: 2,
				text: "Nearsightedness",
			},
			{
				id: 3,
				text: "Farsightedness",
			},
		],
		answer: null,
	},
	{
		question_text: "4. Assess your color perception",
		id: 4,
		radio: [
			{
				id: 1,
				text: "Normal",
			},
			{
				id: 2,
				text: "Protanopia (impaired perception of the red part of the spectrum)",
			},
			{
				id: 3,
				text: "Deuteranopia (impaired perception of the green part of the spectrum)",
			},
			{
				id: 4,
				text: "Tritanopia (impaired perception of the blue-violet part of the spectrum)",
			},
		],
		answer: null,
	},
	{
		question_text: "5. Assess the ambient lighting around you",
		id: 5,
		radio: [
			{
				id: 1,
				text: "Very bright (bright sunlight)",
			},
			{
				id: 2,
				text: "Bright (room lighting + light from windows)",
			},
			{
				id: 3,
				text: "Optimal (room lighting only)",
			},
			{
				id: 4,
				text: "Dark (dim light sources are present apart from the computer screen)",
			},
			{
				id: 5,
				text: "Very dark (there are no other light sources besides the computer screen)",
			},
		],
		answer: null,
	},
	{
		question_text: "6. Assess your surroundings",
		id: 6,
		radio: [
			{
				id: 1,
				text: "Many external distractions (for example, a noisy street)",
			},
			{
				id: 2,
				text: "A small number of distractions",
			},
			{
				id: 3,
				text: "Nothing is distracting",
			},
		],
		answer: null,
	},
];
timeout_message = "Try again in {timeout_left} minutes";
max_attempts = 10;
timeout_time = 180;

helpVisible = true;
fullScreenMode = false;
devtoolsMode = false;
questions_complete = false;
rulerNotCard = true;
current_attempt = 0;
timeout = false;

inner_width = null;
inner_height = null;
outer_width = null;
outer_height = null;
rulerLen1 = null;
rulerLen2 = null;
rulerLen3 = null;
rulerLen4 = null;
rulerLen5 = null;
screenWidth = null;
screenHeight = null;
screenDiag = null;

temp_len_1 = 0;
temp_len_2 = 0;
temp_len_3 = 0;
temp_len_4 = 0;
temp_len_5 = 0;

function toggleHelp() {
	helpVisible = !helpVisible;
	toggleFlags();
}

function closeHelp() {
	helpVisible = false;
	toggleFlags();
}

function handleMouseDown(event) {
	target = event.target;

	if (!target.closest(".help-popup") && helpVisible) {
		closeHelp();
	}
}
document.addEventListener("mousedown", handleMouseDown);

function checkTimeOut() {
	if (
		localStorage.getItem("test_attempts_number") !== null &&
		parseInt(localStorage.getItem("test_attempts_number"), 10) > current_attempt
	) {
		current_attempt = parseInt(
			localStorage.getItem("test_attempts_number"),
			10,
		);
	}

	if (localStorage.getItem("timeout_date") !== null) {
		if (
			timeout_time * 60 <
			(Date.now() - parseInt(localStorage.getItem("timeout_date"), 10)) * 0.001
		) {
			timeout = false;
			current_attempt = 0;
			localStorage.setItem("test_attempts_number", current_attempt.toString());
			localStorage.removeItem("timeout_date");
			document.getElementById("error_message").innerHTML = "";
		} else {
			timeout = true;
		}
		toggleFlags();
	}

	if (current_attempt > max_attempts) {
		if (!timeout) {
			timeout = true;
			localStorage.setItem("timeout_date", Date.now().toString());
			toggleFlags();
		}
		const timeout_left = (
			(timeout_time * 60 -
				(Date.now() - parseInt(localStorage.getItem("timeout_date"), 10)) *
					0.001) /
			60
		).toFixed(0);
		document.getElementById("error_message").innerHTML =
			timeout_message.replace("{timeout_left}", timeout_left);
	}
	return timeout;
}

function ngAfterViewInit() {
	enterFullScreen();
	setTimeout(() => checkDevtools(), 500);
	checkTimeOut();
}

function ngOnChanges() {
	if (questions === null) {
		questions_complete = true;
	} else {
		questions_complete = false;
	}
	checkTimeOut();
	setTimeout(() => checkDevtools(), 500);
	toggleFlags();
}

function enterFullScreen() {
	fullScreenMode =
		document.webkitFullscreenElement != null ||
		document.fullscreenElement != null ||
		document.mozFullScreenElement != null;
	toggleFlags();
	if (!fullScreenMode) {
		if (document.body.parentElement.requestFullscreen)
			document.body.parentElement.requestFullscreen();
		else if (document.body.parentElement.webkitRequestFullscreen)
			document.body.parentElement.webkitRequestFullscreen();
		else if (document.body.parentElement.mozRequestFullscreen)
			document.body.parentElement.mozRequestFullscreen();
	}
}

function exitFullScreen() {
	if (document.exitFullscreen) document.exitFullscreen();
	else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
	else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
}

function onFullscreenError(_event) {
	fullScreenMode =
		document.webkitFullscreenElement != null ||
		document.fullscreenElement != null ||
		document.mozFullScreenElement != null;
	toggleFlags();
}
document.addEventListener("fullscreenerror", onFullscreenError);
document.addEventListener("webkitfullscreenerror", onFullscreenError);
document.addEventListener("mozfullscreenerror", onFullscreenError);

function checkDevtools() {
	if (
		Math.abs(window.screen.height - window.innerHeight) > 5 ||
		Math.abs(window.screen.width - window.innerWidth) > 5
	) {
		devtoolsMode = true;
	} else {
		devtoolsMode = false;
	}
	toggleFlags();
}

function checkLengths() {
	if (checkTimeOut()) {
	} else {
		if (rulerNotCard) {
			const ruler1_width = parseInt(
				document.getElementById("ruler1").style.width,
				10,
			);
			const ruler2_width = parseInt(
				document.getElementById("ruler2").style.width,
				10,
			);
			const ruler3_width = parseInt(
				document.getElementById("ruler3").style.width,
				10,
			);
			const ruler4_width = parseInt(
				document.getElementById("ruler4").style.width,
				10,
			);
			const ruler5_width = parseInt(
				document.getElementById("ruler5").style.width,
				10,
			);

			if (
				temp_len_1 !== ruler1_width ||
				temp_len_2 !== ruler2_width ||
				temp_len_3 !== ruler3_width ||
				temp_len_4 !== ruler4_width ||
				temp_len_5 !== ruler5_width
			) {
				current_attempt++;
				temp_len_1 = ruler1_width;
				temp_len_2 = ruler2_width;
				temp_len_3 = ruler3_width;
				temp_len_4 = ruler4_width;
				temp_len_5 = ruler5_width;
			}
			const div75 = rulerValue1 / rulerValue2;
			const div713 = rulerValue1 / rulerValue3;
			const div711 = rulerValue1 / rulerValue4;
			const div73 = rulerValue1 / rulerValue5;
			const div513 = rulerValue2 / rulerValue3;
			const div511 = rulerValue2 / rulerValue4;
			const div53 = rulerValue2 / rulerValue5;
			const div1311 = rulerValue3 / rulerValue4;
			const div133 = rulerValue3 / rulerValue5;
			const div113 = rulerValue4 / rulerValue5;

			if (
				Math.abs(ruler1_width / ruler2_width - div75) < rulerAccuracy * div75 &&
				Math.abs(ruler1_width / ruler3_width - div713) <
					rulerAccuracy * div713 &&
				Math.abs(ruler1_width / ruler4_width - div711) <
					rulerAccuracy * div711 &&
				Math.abs(ruler1_width / ruler5_width - div73) < rulerAccuracy * div73 &&
				Math.abs(ruler2_width / ruler3_width - div513) <
					rulerAccuracy * div513 &&
				Math.abs(ruler2_width / ruler4_width - div511) <
					rulerAccuracy * div511 &&
				Math.abs(ruler2_width / ruler5_width - div53) < rulerAccuracy * div53 &&
				Math.abs(ruler3_width / ruler4_width - div1311) <
					rulerAccuracy * div1311 &&
				Math.abs(ruler3_width / ruler5_width - div133) <
					rulerAccuracy * div133 &&
				Math.abs(ruler4_width / ruler5_width - div113) < rulerAccuracy * div113
			) {
				rulerLen1 = ruler1_width;
				rulerLen2 = ruler2_width;
				rulerLen3 = ruler3_width;
				rulerLen4 = ruler4_width;
				rulerLen5 = ruler5_width;
				inner_height = window.innerHeight;
				inner_width = window.innerWidth;
				outer_height = window.screen.height;
				outer_width = window.screen.width;
				screenWidth = (10 * rulerValue1 * window.innerWidth) / ruler1_width;
				screenHeight = (screenWidth * outer_height) / outer_width;
				screenDiag = Math.sqrt(
					screenHeight * screenHeight + screenWidth * screenWidth,
				);
				uploadScreenInfo();
				localStorage.removeItem("test_attempts_number");
				localStorage.removeItem("timeout_date");
				checkQuestions();
			} else {
				document.getElementById("error_message").innerHTML =
					"Incorrect ruler lengths, please try again. If you have problems, use the help.";
				localStorage.setItem(
					"test_attempts_number",
					current_attempt.toString(),
				);
				checkTimeOut();
			}
		} else {
			const card_h_width = parseInt(
				document.getElementById("card_h").style.width,
				10,
			);
			const card_h_height = parseInt(
				document.getElementById("card_h").style.height,
				10,
			);
			const card_v_width = parseInt(
				document.getElementById("card_v").style.width,
				10,
			);
			const card_v_height = parseInt(
				document.getElementById("card_v").style.height,
				10,
			);

			if (
				temp_len_1 !== card_h_width ||
				temp_len_2 !== card_h_height ||
				temp_len_3 !== card_v_width ||
				temp_len_4 !== card_v_height
			) {
				current_attempt++;
				temp_len_1 = card_h_width;
				temp_len_2 = card_h_height;
				temp_len_3 = card_v_width;
				temp_len_4 = card_v_height;
			}

			const div_card = cardW / cardH;

			if (
				Math.abs(card_h_width / card_h_height - div_card) <
					cardAccuracy * div_card &&
				Math.abs(card_v_height / card_v_width - div_card) <
					cardAccuracy * div_card &&
				Math.abs(card_h_width / card_v_height - 1) < cardAccuracy
			) {
				rulerLen1 = card_h_width;
				rulerLen2 = card_h_height;
				rulerLen3 = card_v_width;
				rulerLen4 = card_v_height;
				rulerLen5 = null;
				inner_height = window.innerHeight;
				inner_width = window.innerWidth;
				outer_height = window.screen.height;
				outer_width = window.screen.width;
				screenWidth = (10 * cardW * window.innerWidth) / card_h_width;
				screenHeight = (screenWidth * outer_height) / outer_width;
				screenDiag = Math.sqrt(
					screenHeight * screenHeight + screenWidth * screenWidth,
				);
				uploadScreenInfo();
				localStorage.removeItem("test_attempts_number");
				localStorage.removeItem("timeout_date");
				checkQuestions();
			} else {
				document.getElementById("error_message").innerHTML =
					"Incorrect card sizes, please try again. If you have problems, use the help.";
				localStorage.setItem(
					"test_attempts_number",
					current_attempt.toString(),
				);
				checkTimeOut();
			}
		}
	}
}

function changeRulers() {
	rulerNotCard = !rulerNotCard;
	toggleFlags();
}

function uploadScreenInfo(retryCount = 30) {
	$.ajax({
		method: "POST",
		url: "/questions_info.json",
		dataType: "json",
		contentType: "application/json; charset=utf-8",
		cache: false,
		data: JSON.stringify({
			id: participation_id,
			questions_info: {
				screen_width: window.screen.width,
				screen_height: window.screen.height,
				device_pixel_ratio: window.devicePixelRatio,
				inner_width: inner_width,
				inner_height: inner_height,
				outer_width: outer_width,
				outer_height: outer_height,
				test_attempts: current_attempt,
				rulerNotCard: rulerNotCard,
				rulerLen1: rulerLen1,
				rulerLen2: rulerLen2,
				rulerLen3: rulerLen3,
				rulerLen4: rulerLen4,
				rulerLen5: rulerLen5,
				realScreenWidth: screenWidth,
				realScreenHeight: screenHeight,
				realScreenDiag: screenDiag,
				questions: questions,
			},
		}),
	})
		.done((data, textStatus) => {
			console.log("questions info sending:", data.status);
		})
		.fail((data, textStatus) => {
			if (retryCount > 0) {
				// Retry the AJAX call with one less retry count after a 1-second delay
				setTimeout(() => {
					uploadScreenInfo(retryCount - 1);
				}, 1000); // 1000 milliseconds = 1 second
			} else {
				console.log("Can't send questions info for", data);
			}
		});
}

function onRadioButtonChange() {
	let flag = true;
	questions.forEach((question) => {
		flag = flag && question.answer !== null;
	});
	questions_complete = flag;
	toggleFlags();
}

var previewTimerInterval = null;

function showPreviewTimer() {
	if (previewTimerInterval) {
		clearInterval(previewTimerInterval);
		previewTimerInterval = null;
	}

	$("#preview-timer-block").show();
	var secondsLeft = PREVIEWS_TIME;
	$("#preview-seconds").text(secondsLeft);

	previewTimerInterval = setInterval(() => {
		secondsLeft--;
		$("#preview-seconds").text(secondsLeft);

		if (secondsLeft <= 0) {
			clearInterval(previewTimerInterval);
			previewTimerInterval = null;
			$("#preview-timer-block").hide();
		}
	}, 1000);
}

function hidePreviewTimer() {
	if (previewTimerInterval) {
		clearInterval(previewTimerInterval);
		previewTimerInterval = null;
	}
	$("#preview-timer-block").hide();
}

// Displaying instructions depending on the mode and survey
function updateInstructionTexts() {
	const instructionTexts = {
		FPV: {
			instruction1:
				"The image in the center has the highest sharpness. By rotating the panorama, you can better examine individual objects in the video.",
			instruction2:
				"You can interact with the panorama using a computer mouse.",
			instruction3:
				"If a more interesting object appears in the frame, move the center toward it.",
			instruction4:
				"If there are several objects in the frame, follow the one you currently find most interesting.",
		},
		Dynamic: {
			instruction1:
				"The image in the cursor area has the highest sharpness. By rotating the panorama and moving the mouse cursor, you can better examine individual objects in the video.",
			instruction2:
				"You can interact with the panorama using the WASD keys",
			instruction3:
				"If a more interesting object appears in the frame, move the cursor toward it.",
			instruction4:
				"If there are several objects in the frame, follow the one you currently find most interesting.",
		},
		Standard: {
			instruction1:
				"The image in the center has the highest sharpness. By rotating the panorama, you can better examine individual objects in the video.",
			instruction2:
				"You can interact with the panorama using a computer mouse or the WASD keys.",
			instruction3:
				"If a more interesting object appears in the frame, move the center toward it.",
			instruction4:
				"If there are several objects in the frame, follow the one you currently find most interesting.",
		},
		"Edge-Hover": {
			instruction1:
				"The image in the center has the highest sharpness. By rotating the panorama and moving the mouse cursor, you can better examine individual objects in the video.",
			instruction2:
				"You can interact with the panorama using a computer mouse. When the cursor approaches the screen edge, the panorama starts rotating",
			instruction3:
				"If a more interesting object appears in the frame, move the center cursor toward it.",
			instruction4:
				"If there are several objects in the frame, follow the one you currently find most interesting.",
		},
	};

	const currentMode = mode || "Standard";
	const texts = instructionTexts[currentMode] || instructionTexts.Standard;

	for (let i = 1; i <= 4; i++) {
		const element = document.getElementById(`text-instruction${i}`);
		if (element && texts[`instruction${i}`]) {
			element.textContent = texts[`instruction${i}`];
		}
	}

	const container = document.getElementById("validation360");
	if (!container) return;

	const arrowsWrapper = container.firstElementChild;
	const arrowSvgs = arrowsWrapper ? arrowsWrapper.querySelectorAll("svg") : [];

	const instrElem = document.getElementById("val360-instruction");

	const defaultText = `
    To continue, you need to complete a short test.
    
    After pressing the <b>"Start"</b> button, the white circle will begin moving.
    You need to <span style="color: #3495ff">keep the circle between the white arrows</span> for as long as possible,<br>
    by rotating the panorama.
    
    For this test, we recommend using
    <span style="color: #3495ff">computer mouse</span>
    (with medium DPI) instead of a touchpad.
    
    The test will be repeated <span style="color: #3495ff">5 times</span>.
    
    To ensure maximum experiment accuracy, please,
    <span style="color: #3495ff">do not leave fullscreen mode</span>.
  `;

	const dynamicText = `
    To continue, you need to complete a short test.
    
    After pressing the <b>"Start"</b> button, the white circle will begin moving.
    You need to <span style="color: #3495ff">keep the cursor inside the circle</span> for as long as possible,<br>
    by rotating the panorama and moving the cursor.
    
    For this test, we recommend using
    <span style="color: #3495ff">computer mouse</span>
    (with medium DPI) instead of a touchpad.
    
    The test will be repeated <span style="color: #3495ff">5 times</span>.
    
    To ensure maximum experiment accuracy, please,
    <span style="color: #3495ff">do not leave fullscreen mode</span>.
  `;

	if (mode === "Dynamic" || mode === "Edge-Hover") {
		arrowSvgs.forEach((s) => {
			s.style.display = "none";
		});
		if (instrElem) instrElem.innerHTML = dynamicText;
	} else {
		arrowSvgs.forEach((s) => {
			s.style.display = "";
		});
		if (instrElem) instrElem.innerHTML = defaultText;
	}
}

function toggleFlags() {
	if (fullScreenMode) {
		console.log("fullscreen");
		$("#fullscreenRequest").hide();
	} else if (
		($("#instruction_6").length === 0 ||
			$("#instruction_6").css("display") === "none") &&
		$("#no-videos-to-download-panel").css("display") === "none" &&
		$("#final-panel").css("display") === "none" &&
		!helpVisible
	) {
		console.log("notfullscreen");
		$("#fullscreenRequest").show();
	}

	if (
		helpVisible &&
		fullScreenMode &&
		$("#no-videos-to-download-panel").css("display") === "none"
	) {
		$("#helpBlock").show();
	} else {
		$("#helpBlock").hide();
	}

	if (
		devtoolsMode &&
		fullScreenMode &&
		($("#instruction_6").length === 0 ||
			$("#instruction_6").css("display") === "none") &&
		$("#no-videos-to-download-panel").css("display") === "none" &&
		$("#final-panel").css("display") === "none"
	) {
		$("#noDevtoolsRequest").show();
	} else {
		$("#noDevtoolsRequest").hide();
	}

	if (!fullScreenMode || devtoolsMode) {
		if (videoPanorama != null) {
			videoPanorama.pauseVideo();
		}
		if (instruction_page === 7) {
			if (panorama) {
				panorama.pauseVideo();
			}
		}
		if (instruction_page === 8) {
			const vp = validationPanorama?.videoElement;
			const isPlaying = !!(
				vp &&
				!vp.paused &&
				vp.currentTime > 0 &&
				vp.currentTime < vp.duration
			);

			if (isPlaying) {
				if (val360_animFrame) {
					cancelAnimationFrame(val360_animFrame);
					val360_animFrame = null;
				}

				try {
					vp.pause();
					vp.currentTime = 0;
				} catch (e) {
					console.warn(
						"Error pausing/resetting validation video on fullscreen exit",
						e,
					);
				}

				if (typeof reaction_info_360[reaction_info_index] !== "undefined") {
					reaction_info_360[reaction_info_index] = {
						stop_timestamps: [],
						out_timestamps: [],
					};
				}
				insideTime = 0;
				outsideTime = 0;

				const startButton = document.getElementById(
					"mouse-val360-start-button",
				);
				if (startButton) startButton.style.display = "";
				try {
					$("#return_to_sensitivity_control").show();
				} catch (_e) {}

				console.log(
					"Exited fullscreen during 360 run — current run reset, ready to restart.",
				);
			} else {
				console.log("Exited fullscreen while 360 not playing — no action.");
			}
		}

		if (instruction_page === 5) {
			const val_video_elem = document.getElementById("video-mouse-validation");
			val_video_elem.pause();
			val_video_elem.currentTime = 0;
		}
		if (blurOverlay) {
			blurOverlay.style.display = "none";
		}
		if (previewTimerInterval) {
			clearInterval(previewTimerInterval);
			previewTimerInterval = null;
			$("#preview-timer-block").hide();
		}
	} else {
		if (
			validationPanorama != null &&
			instruction_page === 8 &&
			done_val_num360 < 5
		) {
			if (
				validationPanorama.videoElement.currentTime <
				validationPanorama.videoElement.duration
			) {
				validationPanorama.videoElement.currentTime = 0;
				$("#mouse-val360-start-button").show();
				$("#return_to_sensitivity_control").show();
			}
		}
		if (instruction_page === 7) {
			if (panorama) {
				const tryPlay = () => {
					const video = panorama.videoElement;
					if (!video) return setTimeout(tryPlay, 200);
					if (video.readyState === 4) {
						video
							.play()
							.catch((err) => console.warn("Autoplay did not work:", err));
					} else {
						setTimeout(tryPlay, 300);
					}
				};
				const startBtn = document.getElementById("start-calibration-btn");
				if (!startBtn) return;

				startBtn.style.display = "block";

				startBtn.onclick = () => {
					startBtn.style.display = "none";
					tryPlay();
				};
			}
		}
		if (videoPanorama != null) {
			if (
				videoPanorama.videoElement.currentTime <
				videoPanorama.videoElement.duration
			) {
				videoPanorama.videoElement.currentTime = 0;
				if (ready_to_start) {
						videoPanorama.playVideo();
				}
			}
		}
		if (instruction_page === 5) {
			navigation("return");
		}
	}

	if (timeout || !showQuestionnaire || !questions) {
		$("#questionnaireBlock").hide();
	} else {
		$("#questionnaireBlock").show();
	}

	if (timeout) {
		$("#descriptionBlock").hide();
		$("#rulerChangeButton").hide();
		$("#ruler-check-button").hide();
	} else {
		$("#descriptionBlock").show();
		$("#rulerChangeButton").show();
		$("#ruler-check-button").show();
	}

	if (!rulerNotCard || timeout) {
		$("#rulerNotCardBlock").hide();
	} else {
		$("#rulerNotCardBlock").show();
	}

	if (rulerNotCard || timeout) {
		$("#rulerCardBlock").hide();
	} else {
		$("#rulerCardBlock").show();
	}
}
toggleFlags();

function renderQuestions() {
	const container = document.getElementById("questionsInnerBlock");
	container.innerHTML = "";

	questions.forEach((question) => {
		const questionDiv = document.createElement("div");
		questionDiv.className = "question-container";

		const questionTitle = document.createElement("p");
		questionTitle.innerHTML = question.question_text;
		questionDiv.appendChild(questionTitle);

		if (Object.hasOwn(question, "radio")) {
			question.radio.forEach((variant) => {
				const variantDiv = document.createElement("div");
				variantDiv.className = "variant-container";

				const input = document.createElement("input");
				input.type = "radio";
				input.id = `answer_${question.id}_${variant.id}`;
				input.value = variant.text;
				input.name = `answer_${question.id}`;
				input.checked = question.answer === variant.text;

				input.addEventListener("change", () => {
					question.answer = variant.text;
					onRadioButtonChange();
				});

				const label = document.createElement("label");
				label.setAttribute("for", `answer_${question.id}_${variant.id}`);
				label.innerHTML = variant.text;

				variantDiv.appendChild(input);
				variantDiv.appendChild(label);
				questionDiv.appendChild(variantDiv);
			});
		} else if (Object.hasOwn(question, "number")) {
			number = question.number;

			const input = document.createElement("input");
			input.type = "number";
			input.id = `answer_${question.id}`;
			input.setAttribute("min", number.min);
			input.setAttribute("max", number.max);
			input.setAttribute("placeholder", "0".repeat(number.max.length));
			input.style.width = `${number.max.length + 1}em`;

			input.addEventListener("change", () => {
				if (input.checkValidity()) {
					question.answer = input.value;
					input.style.borderColor = "rgb(118, 118, 118)";
					onRadioButtonChange();
				} else {
					question.answer = null;
					input.style.borderColor = "red";
				}
			});

			questionDiv.appendChild(input);
		}

		container.appendChild(questionDiv);
	});
}

function onRadioButtonChange() {
	console.log("Answers:", questions);
}

function checkQuestions() {
	not_answered = [];
	for (i = 0; i < questions.length; ++i) {
		if (questions[i].answer === null) {
			not_answered.push(i + 1);
		}
	}
	if (not_answered.length === 0) {
		navigation("continue");
		$("#continue-button").show();
	} else {
		error_message = "Please answer the questions correctly";
		for (i = 0; i < not_answered.length; ++i) {
			error_message = `${error_message}, ${not_answered[i]}`;
		}
		document.getElementById("error_message").innerHTML = error_message;
	}
}

