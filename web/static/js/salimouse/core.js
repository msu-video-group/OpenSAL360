(function (root, factory) {
	const core = factory();

	if (typeof module === "object" && module.exports) {
		module.exports = core;
	}
	root.SalimouseCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
	function roundTimestamp(timestamp) {
		return Math.round(timestamp * 1000000000);
	}

	function roundAngle(angle) {
		return Math.round(angle * 1000) / 1000;
	}

	function buildVideoViewPayload(participationId, video) {
		return {
			participation: participationId,
			video: video.id,
			client_timestamp_start: video.timestamp_start.toISOString(),
			client_timestamp_finish: video.timestamp_finish.toISOString(),
			data_gazes: video.head_rotation,
			data_fps: video.fps_data,
			video_score: video.video_score,
		};
	}

	function incompleteQuestionNumbers(questions) {
		return questions
			.map((question, index) => (question.answer === null ? index + 1 : null))
			.filter((number) => number !== null);
	}

	function questionsAreComplete(questions) {
		return incompleteQuestionNumbers(questions).length === 0;
	}

	return {
		roundTimestamp,
		roundAngle,
		buildVideoViewPayload,
		incompleteQuestionNumbers,
		questionsAreComplete,
	};
});
