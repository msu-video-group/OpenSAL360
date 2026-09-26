function downloadMedia(media_info) {
	const globalTargets = {
		penguins: "FPV_VIDEO_URL",
		val_ball: "VAL_BALL",
		val_ball_1_25x: "VAL_BALL_1_25x",
		val_ball_1_5x: "VAL_BALL_1_5x",
		val_ball_2x: "VAL_BALL_2x",
	};

	const loadResults = media_info.ids.map((target) => {
		if (globalTargets[target]) {
			window[globalTargets[target]] = media_info.url;
			return Promise.resolve(true);
		}

		const element = document.querySelector(target);
		if (!element) {
			console.debug(
				`Skipping media target "${target}": the element is not present on this page`,
			);
			return Promise.resolve(false);
		}

		return new Promise((resolve) => {
			const isMediaElement = element instanceof HTMLMediaElement;
			const successEvent = isMediaElement ? "loadedmetadata" : "load";

			function cleanup() {
				element.removeEventListener(successEvent, onLoad);
				element.removeEventListener("error", onError);
			}

			function onLoad() {
				cleanup();
				resolve(true);
			}

			function onError() {
				cleanup();
				const mediaError = isMediaElement ? element.error : null;
				const mediaErrorDetails = mediaError
					? `; MediaError code ${mediaError.code}: ${mediaError.message}`
					: "";
				console.error(
					`Failed to load media "${media_info.url}" for "${target}"${mediaErrorDetails}`,
				);
				resolve(false);
			}

			element.addEventListener(successEvent, onLoad, { once: true });
			element.addEventListener("error", onError, { once: true });

			if (isMediaElement) element.preload = "auto";
			element.src = media_info.url;
			if (isMediaElement) element.load();
		});
	});

	return Promise.all(loadResults).then((results) => results.every(Boolean));
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
