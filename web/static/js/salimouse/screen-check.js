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

helpVisible = false;
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

function showHelp() {
	helpVisible = true;
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
				uploadScreenInfo(() => {
					localStorage.removeItem("test_attempts_number");
					localStorage.removeItem("timeout_date");
					checkQuestions();
				});
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
				uploadScreenInfo(() => {
					localStorage.removeItem("test_attempts_number");
					localStorage.removeItem("timeout_date");
					checkQuestions();
				});
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

function uploadScreenInfo(onSuccess, retryCount = 30) {
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
			if (data.status === "ok" && onSuccess) onSuccess(data);
		})
		.fail((data, textStatus) => {
			if (retryCount > 0) {
				// Retry the AJAX call with one less retry count after a 1-second delay
				setTimeout(() => {
					uploadScreenInfo(onSuccess, retryCount - 1);
				}, 1000); // 1000 milliseconds = 1 second
			} else {
				console.log("Can't send questions info for", data);
			}
		});
}

function onRadioButtonChange() {
	questions_complete = questionsAreComplete(questions);
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
	if (experimentFinished) {
		$("#fullscreenRequest").hide();
		$("#noDevtoolsRequest").hide();
		$("#helpBlock").hide();
		$("#questionnaireBlock").hide();
		return;
	}

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

	if (helpVisible) {
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
			const number = question.number;

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

function checkQuestions() {
	const not_answered = incompleteQuestionNumbers(questions);
	if (not_answered.length === 0) {
		navigation("continue");
		$("#continue-button").show();
	} else {
		let error_message = "Please answer the questions correctly";
		for (let i = 0; i < not_answered.length; ++i) {
			error_message = `${error_message}, ${not_answered[i]}`;
		}
		document.getElementById("error_message").innerHTML = error_message;
	}
}
