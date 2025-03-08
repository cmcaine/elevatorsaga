import { createParamsUrl } from './app.js';
import { USER_ERROR_REGEX } from './base.js';

function makeFragment(html) {
	const container = document.createElement('template');
	container.innerHTML = html;

	return container.content.cloneNode(true);
}

export function clearAll(elements) {
	for (const element of elements) {
		element.replaceChildren();
	}
}

function setTransformPos(elem, x, y) {
	const style = `translate(${x}px,${y}px) translateZ(0)`;
	elem.style.transform = style;
	elem.style['-ms-transform'] = style;
	elem.style['-webkit-transform'] = style;
}

function updateUserState(userElement, user) {
	setTransformPos(userElement, user.worldX, user.worldY);
	if (user.done) {
		userElement.classList.add('leaving');
	}
}

export function presentStats(parent, world) {
	const elem_transportedcounter = parent.querySelector('.transportedcounter'),
		elem_elapsedtime = parent.querySelector('.elapsedtime'),
		elem_transportedpersec = parent.querySelector('.transportedpersec'),
		elem_avgwaittime = parent.querySelector('.avgwaittime'),
		elem_maxwaittime = parent.querySelector('.maxwaittime'),
		elem_movecount = parent.querySelector('.movecount');

	world.on('stats_display_changed', () => {
		elem_transportedcounter.textContent = world.transportedCounter;
		elem_elapsedtime.textContent = `${world.elapsedTime.toFixed(0)}s`;
		elem_transportedpersec.textContent = world.transportedPerSec.toPrecision(3);
		elem_avgwaittime.textContent = `${world.avgWaitTime.toFixed(1)}s`;
		elem_maxwaittime.textContent = `${world.maxWaitTime.toFixed(1)}s`;
		elem_movecount.textContent = world.moveCount;
	});
	world.trigger('stats_display_changed');
}

export function presentChallengeSelector(challenges, currentIndex, highestIndex) {
	const prevButton = document.querySelector('.challenge-navigator .previous');
	const nextButton = document.querySelector('.challenge-navigator .next');
	if (currentIndex === 0) {
		prevButton.removeAttribute('href');
		prevButton.classList.add('disabled');
	} else {
		prevButton.href = createParamsUrl({ challenge: currentIndex });
		prevButton.classList.remove('disabled');
	}
	if (currentIndex === challenges.length - 1 || currentIndex >= highestIndex) {
		nextButton.removeAttribute('href');
		nextButton.classList.add('disabled');
	} else {
		nextButton.href = createParamsUrl({ challenge: currentIndex + 2 });
		nextButton.classList.remove('disabled');
	}

	document.querySelector('.challenge-selector').replaceChildren(
		...challenges.map((_, index) => {
			const element = document.createElement('a');
			element.innerText = index + 1;
			element.href = createParamsUrl({ challenge: index + 1 });
			if (currentIndex === index) {
				element.classList.add('emphasis-color');
			}
			if (index > highestIndex) {
				element.classList.add('disabled');
				element.removeAttribute('href');
				element.addEventListener('click', (event) => {
					event.preventDefault();
				});
			}

			return element;
		}),
	);
}

export function presentChallenge(parent, challenge, challengeNum, app, world, worldController, challengeTempl) {
	parent.innerHTML = riot.render(challengeTempl, {
		challenge,
		num: challengeNum,
		timeScale: `${worldController.timeScale.toFixed(0)}x`,
		startButtonText: world.challengeEnded ? 'Restart' : worldController.isPaused ? 'Start' : 'Pause',
		startButtonIcon: world.challengeEnded ? 'replay' : worldController.isPaused ? 'play_arrow' : 'pause',
	});

	parent.querySelector('.startstop').addEventListener('click', () => {
		app.startStopOrRestart();
	});
	parent.querySelector('.timescale_increase').addEventListener('click', (e) => {
		e.preventDefault();
		if (worldController.timeScale < 40) {
			const timeScale = Math.round(worldController.timeScale * 1.618);
			worldController.setTimeScale(timeScale);
		}
	});
	parent.querySelector('.timescale_decrease').addEventListener('click', (e) => {
		e.preventDefault();
		const timeScale = Math.round(worldController.timeScale / 1.618);
		worldController.setTimeScale(timeScale);
	});
}

export function presentFeedback(parent, feedbackTempl, world, title, message, url) {
	parent.innerHTML = riot.render(feedbackTempl, {
		title: title,
		message: message,
		url: url,
		paddingTop: world.floors.length * world.floorHeight * 0.2,
	});
	if (!url) {
		parent.querySelector('a').remove();
	}
}

export function presentWorld(worldElement, world, floorTempl, elevatorTempl, elevatorButtonTempl, userTempl) {
	worldElement.style.height = `${world.floorHeight * world.floors.length}px`;

	for (const floor of world.floors) {
		const floorFragment = makeFragment(riot.render(floorTempl, floor));
		const up = floorFragment.querySelector('.up');
		const down = floorFragment.querySelector('.down');
		floor.on('buttonstate_change', (eventName, buttonStates) => {
			up.classList.toggle('activated', buttonStates.up !== '');
			down.classList.toggle('activated', buttonStates.down !== '');
		});
		up.addEventListener('click', () => {
			floor.pressUpButton();
		});
		down.addEventListener('click', () => {
			floor.pressDownButton();
		});
		worldElement.appendChild(floorFragment);
	}

	worldElement.querySelector('.floor:first-of-type .down').classList.add('invisible');
	worldElement.querySelector('.floor:last-of-type .up').classList.add('invisible');

	function renderElevatorButtons(states) {
		// This is a rarely executed inner-inner loop, does not need efficiency
		return _.map(states, (b, i) => {
			return riot.render(elevatorButtonTempl, { floorNum: i });
		}).join('');
	}

	function setUpElevator(elevator) {
		const elevatorElement = makeFragment(riot.render(elevatorTempl, { e: elevator })).firstChild;
		elevatorElement.querySelector('.buttonindicator').innerHTML = renderElevatorButtons(elevator.buttonStates);
		const buttons = elevatorElement.querySelector('.buttonindicator').children;
		const elem_floorindicator = elevatorElement.querySelector('.floorindicator > span');

		elevatorElement.addEventListener('click', (event) => {
			if (!event.target.classList.has('buttonpress')) {
				return;
			}

			elevator.pressFloorButton(parseInt(event.target.textContent));
		});
		elevator.on('new_display_state', () => {
			setTransformPos(elevatorElement, elevator.worldX, elevator.worldY);
		});
		elevator.on('new_current_floor', (eventName, floor) => {
			elem_floorindicator.textContent = floor;
		});
		elevator.on('floor_buttons_changed', (eventName, states, indexChanged) => {
			buttons[indexChanged].classList.toggle('activated', states[indexChanged]);
		});
		elevator.on('indicatorstate_change', (eventName, indicatorStates) => {
			elevatorElement.querySelector('.up').classList.toggle('activated', indicatorStates.up);
			elevatorElement.querySelector('.down').classList.toggle('activated', indicatorStates.down);
		});
		elevator.trigger('new_state', elevator);
		elevator.trigger('new_display_state', elevator);
		elevator.trigger('new_current_floor', elevator.currentFloor);
		return elevatorElement;
	}

	for (const elevator of world.elevators) {
		worldElement.appendChild(setUpElevator(elevator));
	}

	world.on('new_user', (eventName, user) => {
		const userElement = makeFragment(
			riot.render(userTempl, { u: user, state: user.done ? 'leaving' : '' }),
		).firstChild;

		user.on('new_display_state', () => {
			updateUserState(userElement, user);
		});
		user.on('removed', () => {
			userElement.remove();
		});
		worldElement.append(userElement);
	});
}

function formatErrorMessage(error) {
	if (!error) return '';
	let msg = error.toString();
	let stack = error.stack.toString();

	// Trim repeated message on Chrome
	if (stack.startsWith(msg)) {
		stack = stack.replace(msg, '');
	}

	// Trim unneccessary parts of stack trace
	stack = stack
		.split(/\s*\n\s*/)
		.map((line) => line.match(USER_ERROR_REGEX))
		.filter((matches) => matches !== null)
		.map((matches) => matches[0].replace(matches.groups['blob'], 'your_solution.js'))
		.join('\n');

	msg = msg.trim() + '\n' + stack.trim();
	msg = msg.replaceAll('\n', '<br>');

	return msg;
}

export function presentCodeStatus(parent, templ, error) {
	const errorDisplay = error ? 'block' : 'none';
	const successDisplay = error ? 'none' : 'block';

	const errorMessage = formatErrorMessage(error);
	const status = riot.render(templ, { errorMessage, errorDisplay, successDisplay });
	parent.innerHTML = status;
}

export function makeDemoFullscreen() {
	for (const element of document.querySelectorAll('body .container > *:not(.world)')) {
		element.style.visibility = 'hidden';
	}

	for (const element of document.querySelectorAll('html, body, body .container, .world')) {
		element.style.width = '100%';
		element.style.margin = 0;
		element.style.padding = 0;
	}
}
