// Countdown duration before next video
const SECONDS_BEFORE_VIDEO_START = 2;
const {
	roundTimestamp,
	roundAngle,
	buildVideoViewPayload,
	incompleteQuestionNumbers,
	questionsAreComplete,
} = SalimouseCore;

// Array with all videos should be played
var videos_list = null;
var participation_id = null;

// Index of current showing video
var curr_video_index = -1;
var curr_video_info = null;

var num_downloaded_videos = 0;

// Got verification code
var verification_code = null;

// Terminal state: no questionnaire or validation overlays may be shown.
var experimentFinished = false;

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
					admin_mode(retryCount - 1);
				}, 1000); // 1000 milliseconds = 1 second
			} else {
				console.log("Can't send admin mode set for", data);
			}
		});
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
