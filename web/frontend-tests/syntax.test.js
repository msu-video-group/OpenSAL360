const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const scriptDirectory = path.join(__dirname, "../static/js/salimouse");
const scriptLoadOrder = [
	"core.js",
	"state.js",
	"participation.js",
	"player.js",
	"sensitivity.js",
	"tracking.js",
	"validation.js",
	"tutorial.js",
	"media.js",
	"screen-check.js",
];

function loadScript(context, script) {
	const source = fs.readFileSync(path.join(scriptDirectory, script), "utf8");
	vm.runInContext(source, context, { filename: script });
}

function createJqueryTracker() {
	const visibility = new Map();
	const jquery = (selector) => ({
		hide() {
			visibility.set(selector, "hidden");
			return this;
		},
		show() {
			visibility.set(selector, "visible");
			return this;
		},
		text() { return this; },
		css() { return this; },
	});
	return { jquery, visibility };
}

function createThreeStub() {
	return {
		Raycaster: class {},
		Vector2: class {},
		Euler: class {},
		Object3D: class {},
	};
}

function createAjaxHarness() {
	let doneHandler = null;
	let failHandler = null;
	const jquery = () => ({
		length: 0,
		hide() { return this; },
		show() { return this; },
		text() { return this; },
		css() { return "none"; },
		children() { return this; },
		each() { return this; },
		attr() { return this; },
		removeAttr() { return this; },
	});
	jquery.ajax = () => {
		const request = {
			done(handler) {
				doneHandler = handler;
				return request;
			},
			fail(handler) {
				failHandler = handler;
				return request;
			},
		};
		return request;
	};
	return {
		jquery,
		resolve(payload = { status: "ok" }) {
			assert.ok(doneHandler, "an AJAX success callback should be registered");
			doneHandler(payload, "success");
		},
		reject(payload = {}) {
			assert.ok(failHandler, "an AJAX failure callback should be registered");
			failHandler(payload, "error");
		},
	};
}

function createNetworkTestContext(jquery, extras = {}) {
	const eventTarget = {
		addEventListener() {},
		removeEventListener() {},
	};
	return vm.createContext({
		console,
		document: {
			...eventTarget,
			body: { classList: { add() {}, remove() {} } },
			getElementById() { return null; },
			querySelectorAll() { return []; },
		},
		window: {
			...eventTarget,
			screen: { width: 1920, height: 1080 },
			devicePixelRatio: 1,
		},
		$: jquery,
		THREE: createThreeStub(),
		mode: "Standard",
		UNSEEN_CURSOR: false,
		setTimeout() {},
		...extras,
	});
}

test("all player modules contain valid classic-script JavaScript", () => {
	const scripts = fs
		.readdirSync(scriptDirectory)
		.filter((name) => name.endsWith(".js"));

	assert.equal(scripts.length, 10);
	for (const script of scripts) {
		const source = fs.readFileSync(path.join(scriptDirectory, script), "utf8");
		assert.doesNotThrow(
			() => new vm.Script(source, { filename: script }),
			`${script} should parse`,
		);
	}
});

test("player modules initialize in their browser load order", () => {
	const eventTarget = {
		addEventListener() {},
		removeEventListener() {},
	};
	const jquery = () => ({ on() {} });
	const context = vm.createContext({
		console,
		document: { ...eventTarget },
		window: { ...eventTarget },
		$: jquery,
		THREE: createThreeStub(),
	});

	for (const script of scriptLoadOrder.slice(0, 8)) {
		assert.doesNotThrow(
			() => loadScript(context, script),
			`${script} should initialize after its dependencies`,
		);
	}

	assert.equal(context.current_start, 0);
	assert.equal(context.prev_stat, "in");
});

test("an empty video list bypasses the initial questionnaire", () => {
	const { jquery, visibility } = createJqueryTracker();
	let navigationCalls = 0;
	const context = vm.createContext({
		console,
		document: {},
		window: { location: { hash: "" } },
		$: jquery,
		THREE: createThreeStub(),
		mode: "Standard",
		NUM_SEEN_VIDEOS: 0,
		VERIFICATION_CODE_FROM_CONTEXT: "",
		downloadMedia() {},
		navigation() { navigationCalls += 1; },
		updateAllVerificationCodes() {},
		addCopyHandlersToAllCodeElements() {},
	});

	loadScript(context, "core.js");
	loadScript(context, "state.js");
	loadScript(context, "participation.js");
	vm.runInContext(
		"downloadAll({ participation_id: 1, videos: [], new_participation: true })",
		context,
	);

	assert.equal(navigationCalls, 0);
	assert.equal(context.experimentFinished, true);
	assert.equal(visibility.get("#instructions-panel"), "hidden");
	assert.equal(visibility.get("#questionnaireBlock"), "hidden");
	assert.equal(visibility.get("#no-videos-to-download-panel"), "visible");
});

test("finishing the last video leaves only the completion UI active", () => {
	const { jquery, visibility } = createJqueryTracker();
	const context = vm.createContext({
		console,
		document: { querySelectorAll: () => [] },
		window: {},
		$: jquery,
		THREE: createThreeStub(),
		mode: "Standard",
		UNSEEN_CURSOR: false,
	});

	loadScript(context, "core.js");
	loadScript(context, "state.js");
	loadScript(context, "tracking.js");
	vm.runInContext('verification_code = "ready"; onShowFinished()', context);

	assert.equal(context.experimentFinished, true);
	assert.equal(visibility.get("#instructions-panel"), "hidden");
	assert.equal(visibility.get("#questionnaireBlock"), "hidden");
	assert.equal(visibility.get("#helpBlock"), "hidden");
	assert.equal(visibility.get("#final-panel"), "visible");
});

test("the last video cannot finish the experiment before upload acknowledgement", () => {
	const ajax = createAjaxHarness();
	let finishCalls = 0;
	const context = createNetworkTestContext(ajax.jquery, {
		finishSpy() { finishCalls += 1; },
		setTimeout(callback) { callback(); },
	});

	for (const script of ["core.js", "state.js", "sensitivity.js", "tracking.js"])
		loadScript(context, script);
	vm.runInContext(`
		videos_list = [{
			id: 7,
			timestamp_start: new Date("2026-06-01T10:00:00Z"),
			head_rotation: {},
			fps_data: {},
			video_score: 4,
		}];
		participation_id = 3;
		curr_video_index = 0;
		curr_video_info = videos_list[0];
		onShowFinished = finishSpy;
		onVideoFinished();
	`, context);

	assert.equal(context.curr_video_index, 0);
	assert.equal(finishCalls, 0);
	assert.equal(context.curr_video_info.result_pending, true);

	ajax.reject();

	assert.equal(context.curr_video_index, 0);
	assert.equal(finishCalls, 0);

	ajax.resolve({ status: "ok", verification_code: "confirmed" });

	assert.equal(context.curr_video_index, 1);
	assert.equal(finishCalls, 1);
});

test("validation navigation waits for reaction-data acknowledgement", () => {
	const ajax = createAjaxHarness();
	let navigationCalls = 0;
	const context = createNetworkTestContext(ajax.jquery, {
		FAST_MODE: false,
		navigation() { navigationCalls += 1; },
		performance: { now: () => 0 },
		cancelAnimationFrame() {},
		requestAnimationFrame() { return 1; },
	});

	for (const script of ["core.js", "state.js", "validation.js"])
		loadScript(context, script);
	vm.runInContext(`
		pass_2d = [];
		reaction_info = [];
		done_val_num360 = 4;
		val360_pass_count = 0;
		insideTime = 20;
		outsideTime = 0;
		finish360Validation();
	`, context);

	assert.equal(navigationCalls, 0);
	ajax.resolve();
	assert.equal(navigationCalls, 1);
});

test("questionnaire continuation callback waits for upload acknowledgement", () => {
	const ajax = createAjaxHarness();
	let continuationCalls = 0;
	const context = createNetworkTestContext(ajax.jquery, {
		instruction_page: 0,
		blurOverlay: null,
		showQuestionnaire: true,
	});

	for (const script of ["core.js", "state.js", "screen-check.js"])
		loadScript(context, script);
	context.afterUpload = () => { continuationCalls += 1; };
	vm.runInContext("participation_id = 3; uploadScreenInfo(afterUpload)", context);

	assert.equal(continuationCalls, 0);
	ajax.resolve();
	assert.equal(continuationCalls, 1);
});

test("usage guide opens only at the intended initial tutorial step", () => {
	function startTutorial({ fastMode, newParticipation }) {
		const ajax = createAjaxHarness();
		let guideCalls = 0;
		const context = createNetworkTestContext(ajax.jquery, {
			FAST_MODE: fastMode,
			STARS: true,
			showHelp() { guideCalls += 1; },
			updateInstructionTexts() {},
		});

		for (const script of scriptLoadOrder.slice(0, 8))
			loadScript(context, script);
		context.new_participation = newParticipation;
		vm.runInContext('navigation("start")', context);
		return { guideCalls, instructionPage: context.instruction_page };
	}

	assert.deepEqual(
		startTutorial({ fastMode: false, newParticipation: true }),
		{ guideCalls: 1, instructionPage: 1 },
	);
	assert.deepEqual(
		startTutorial({ fastMode: false, newParticipation: false }),
		{ guideCalls: 0, instructionPage: 2 },
	);
	assert.deepEqual(
		startTutorial({ fastMode: true, newParticipation: false }),
		{ guideCalls: 1, instructionPage: 2 },
	);
});
