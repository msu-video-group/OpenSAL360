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
	let showUsageGuide = false;
	if (direction === "start") {
		console.log("start");
		showUsageGuide = new_participation || FAST_MODE;
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

	if (showUsageGuide) showHelp();
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
