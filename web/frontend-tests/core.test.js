const test = require("node:test");
const assert = require("node:assert/strict");

const {
	roundTimestamp,
	roundAngle,
	buildVideoViewPayload,
	incompleteQuestionNumbers,
	questionsAreComplete,
} = require("../static/js/salimouse/core.js");

test("tracking values are normalized to the precision sent to the server", () => {
	assert.equal(roundTimestamp(1.2345678904), 1234567890);
	assert.equal(roundTimestamp(0), 0);
	assert.equal(roundAngle(Math.PI), 3.142);
	assert.equal(roundAngle(-0.0006), -0.001);
});

test("video results are serialized using the API's field names", () => {
	const video = {
		id: 17,
		timestamp_start: new Date("2026-06-01T10:00:00.000Z"),
		timestamp_finish: new Date("2026-06-01T10:00:12.500Z"),
		head_rotation: { t: [0, 100], x: [0, 0.2], y: [0, -0.1], z: [0, 0] },
		fps_data: { render_video_timestamps: [0, 0.016] },
		video_score: 4,
	};

	assert.deepEqual(buildVideoViewPayload(23, video), {
		participation: 23,
		video: 17,
		client_timestamp_start: "2026-06-01T10:00:00.000Z",
		client_timestamp_finish: "2026-06-01T10:00:12.500Z",
		data_gazes: video.head_rotation,
		data_fps: video.fps_data,
		video_score: 4,
	});
});

test("questionnaire completeness reports the visible question numbers", () => {
	const questions = [
		{ id: "demographics", answer: "Female" },
		{ id: "age", answer: null },
		{ id: "vision", answer: "Normal" },
		{ id: "lighting", answer: null },
	];

	assert.deepEqual(incompleteQuestionNumbers(questions), [2, 4]);
	assert.equal(questionsAreComplete(questions), false);
	questions[1].answer = "31";
	questions[3].answer = "Optimal";
	assert.equal(questionsAreComplete(questions), true);
});
