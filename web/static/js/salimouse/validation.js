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
		sendReactInfo(() => {
			const container = document.getElementById("validation360");
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
		});
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
function sendReactInfo(onSuccess) {
	$.ajax({
		method: "POST",
		url: "/react_info.json",
		dataType: "json",
		contentType: "application/json; charset=utf-8",
		cache: false,
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
			if (data.status === "ok" && onSuccess) onSuccess(data);
		})
		.fail((_data, textStatus) => {
			setTimeout(() => {
				sendReactInfo(onSuccess);
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
