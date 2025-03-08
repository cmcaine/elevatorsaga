import './fitness.js';
import { World, WorldController } from './world.js';
import {
	clearAll,
	makeDemoFullscreen,
	presentChallenge,
	presentChallengeSelector,
	presentCodeStatus,
	presentFeedback,
	presentStats,
	presentWorld,
} from './presenters.js';
import Emitter from './emitter.js';
import { challenges } from './challenges.js';
import config from './config.js';
import { Editor } from './editor.js';
import { getTemplate } from './util.js';
import { isUserError } from './base.js';

let params = {};

export function createParamsUrl(overrides) {
	const merged = { ...params, ...overrides };

	return (
		'#' +
		Object.entries(merged)
			.filter(([, value]) => {
				return value !== null && value !== undefined;
			})
			.map(([key, value]) => {
				return `${key}=${value}`;
			})
			.join(',')
	);
}

class App extends Emitter {
	worldController = new WorldController(1.0 / 60.0);
	world = undefined;
	currentChallengeIndex = 0;
	highestChallengeIndex = 0;
	editor;

	element = {
		innerWorld: document.querySelector('.innerworld'),
		stats: document.querySelector('.statscontainer'),
		feedback: document.querySelector('.feedbackcontainer'),
		challenge: document.querySelector('.challenge'),
	};

	template = {
		floor: getTemplate('floor-template'),
		elevator: getTemplate('elevator-template'),
		elevatorButton: getTemplate('elevatorbutton-template'),
		user: getTemplate('user-template'),
		challenge: getTemplate('challenge-template'),
		feedback: getTemplate('feedback-template'),
	};

	constructor(editor) {
		super();

		this.editor = editor;
		this.worldController.on('usercode_error', (eventName, error) => {
			console.log('World raised code error', error);
			editor.trigger('usercode_error', error);
		});
		console.log(this.worldController);
	}

	startStopOrRestart() {
		if (this.world.challengeEnded) {
			this.startChallenge(this.currentChallengeIndex);
		} else {
			this.worldController.setPaused(!this.worldController.isPaused);
		}
	}

	async startChallenge(challengeIndex, autoStart = false) {
		if (typeof this.world !== 'undefined') {
			this.world.unWind();
			// TODO: Investigate if memory leaks happen here
		}
		this.currentChallengeIndex = challengeIndex;

		if (challengeIndex > this.highestChallengeIndex) {
			this.highestChallengeIndex = challengeIndex;
		}

		this.world = new World(challenges[challengeIndex].options);
		(window as any).world = this.world;

		clearAll([this.element.innerWorld, this.element.feedback]);
		presentStats(this.element.stats, this.world);
		presentChallengeSelector(challenges, challengeIndex, this.highestChallengeIndex);
		presentChallenge(
			this.element.challenge,
			challenges[challengeIndex],
			challengeIndex + 1,
			this,
			this.world,
			this.worldController,
			this.template.challenge,
		);
		presentWorld(
			this.element.innerWorld,
			this.world,
			this.template.floor,
			this.template.elevator,
			this.template.elevatorButton,
			this.template.user,
		);

		this.worldController.on('timescale_changed', () => {
			localStorage.setItem(config.STORAGE_KEY_TIMESCALE, this.worldController.timeScale as any);
			presentChallenge(
				this.element.challenge,
				challenges[challengeIndex],
				challengeIndex + 1,
				this,
				this.world,
				this.worldController,
				this.template.challenge,
			);
		});

		this.world.on('stats_changed', () => {
			const challengeStatus = challenges[challengeIndex].condition.evaluate(this.world);
			if (challengeStatus !== null) {
				this.world.challengeEnded = true;
				this.worldController.setPaused(true);
				if (challengeStatus) {
					this.highestChallengeIndex = Math.max(this.highestChallengeIndex, challengeIndex + 1);
					presentChallengeSelector(challenges, challengeIndex, this.highestChallengeIndex);
					presentFeedback(
						this.element.feedback,
						this.template.feedback,
						this.world,
						'Success!',
						'Challenge completed',
						createParamsUrl({ challenge: challengeIndex + 2 }),
					);
				} else {
					presentFeedback(
						this.element.feedback,
						this.template.feedback,
						this.world,
						'Challenge failed',
						'Maybe your program needs an improvement?',
						'',
					);
				}
			}
		});

		const codeObj = await this.editor.getCodeObj();
		console.log('Starting...');
		this.worldController.start(this.world, codeObj, window.requestAnimationFrame, autoStart);
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const editor = new Editor();
	const codestatus = document.querySelector('.codestatus');
	const codeStatusTempl = getTemplate('codestatus-template');

	const app = new App(editor);

	// Handle uncaught promise rejections in user code
	window.addEventListener('unhandledrejection', (event) => {
		if (isUserError(event.reason)) {
			app.worldController.setPaused(true);
			presentCodeStatus(codestatus, codeStatusTempl, event.reason);
		}
	});
	editor.on('apply_code', () => {
		app.startChallenge(app.currentChallengeIndex, true);
	});
	editor.on('code_success', () => {
		presentCodeStatus(codestatus, codeStatusTempl, null);
	});
	editor.on('usercode_error', (eventName, error) => {
		presentCodeStatus(codestatus, codeStatusTempl, error);
	});
	editor.on('change', () => {
		document.querySelector('#fitness_message').classList.add('faded');
		// const codeStr = editor.getCode();
		// fitnessSuite(codeStr, true, function (results) {
		// 	var message = '';
		// 	if (!results.error) {
		// 		message =
		// 			'Fitness avg wait times: ' +
		// 			_.map(results, function (r) {
		// 				return r.options.description + ': ' + r.result.avgWaitTime.toPrecision(3) + 's';
		// 			}).join('&nbsp&nbsp&nbsp');
		// 	} else {
		// 		message = 'Could not compute fitness due to error: ' + results.error;
		// 	}
		// 	document.querySelector('#fitness_message').innerHTML = message
		// 	document.querySelector('#fitness_message').classList.remove('faded');
		// });
	});
	editor.trigger('change');

	riot.route((path) => {
		const hash = path.match(/#(.+)/)?.[1] ?? '';
		params = _.reduce(
			hash.split(','),
			(result, p: string) => {
				const match = p.match(/(\w+)=(\w+$)/);
				if (match) {
					result[match[1]] = match[2];
				}
				return result;
			},
			{},
		);
		let requestedChallenge = 0;
		let autoStart = false;
		let timeScale = parseFloat(localStorage.getItem(config.STORAGE_KEY_TIMESCALE)) || 2.0;
		_.each(params, (val: string, key) => {
			if (key === 'challenge') {
				requestedChallenge = _.parseInt(val) - 1;
				if (requestedChallenge < 0 || requestedChallenge >= challenges.length) {
					console.log('Invalid challenge index', requestedChallenge);
					console.log('Defaulting to first challenge');
					requestedChallenge = 0;
				}
			} else if (key === 'autostart') {
				autoStart = val === 'false' ? false : true;
			} else if (key === 'timescale') {
				timeScale = parseFloat(val);
			} else if (key === 'devtest') {
				editor.setDevTestCode();
			} else if (key === 'fullscreen') {
				makeDemoFullscreen();
			}
		});
		app.worldController.setTimeScale(timeScale);
		app.startChallenge(requestedChallenge, autoStart);
	});

	// Trigger route function above
	// Not needed when used in a synchronous context (without ES6+ import/export)
	riot.route(location.pathname + location.hash);
});
