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
