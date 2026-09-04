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

	if (videos_list.length === 0) {
		experimentFinished = true;
		$("#instructions-panel").hide();
		$("#helpBlock").hide();
		$("#fullscreenRequest").hide();
		$("#noDevtoolsRequest").hide();
		$("#questionnaireBlock").hide();
		$("#viewer").show();
		$("#no-videos-to-download-panel").show();
		updateAllVerificationCodes(verification_code);
		addCopyHandlersToAllCodeElements();
		return;
	}

	if (NUM_SEEN_VIDEOS > 0 || window.location.hash.includes("skip-tutorial")) {
		console.log("skip tutorial");
		$("#viewer").show();
		$("#instructions-panel").hide();
	} else {
		navigation("start");
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
