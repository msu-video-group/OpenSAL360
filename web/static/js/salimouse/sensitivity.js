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
function sendRotateSpeed(
	rotate_speed,
	onSuccess = () => navigation("continue"),
) {
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
			if (data.status === "ok") onSuccess(data);
		})
		.fail((_data, textStatus) => {
			setTimeout(() => {
				sendRotateSpeed(rotate_speed, onSuccess);
			}, 1000);
		});
}

// Send head rotation array and validation results to the server
function sendVideoViewResults(curr_video, onSuccess, retryCount = 30) {
	$.ajax({
		method: "POST",
		url: "/video_view_result.json",
		dataType: "json",
		contentType: "application/json; charset=utf-8",
		cache: false,
		data: JSON.stringify(buildVideoViewPayload(participation_id, curr_video)),
	})
		.done((data, textStatus) => {
			curr_video.sent = true;
			curr_video.accepted = data.status === "ok";
			if (!curr_video.accepted) return;
			if (Object.hasOwn(data, "verification_code")) {
				verification_code = data.verification_code;

				updateAllVerificationCodes(verification_code);
			}
			if (onSuccess) onSuccess(data);
		})
		.fail((data, textStatus) => {
			if (retryCount > 0) {
				// Retry the AJAX call with one less retry count after a 1-second delay
				setTimeout(() => {
					sendVideoViewResults(curr_video, onSuccess, retryCount - 1);
				}, 1000); // 1000 milliseconds = 1 second
			} else {
				console.log("Can't send video view data for", curr_video.url, data);
			}
		});
}

// Stop camera rotation tracking
