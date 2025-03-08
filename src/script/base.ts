export const limitNumber = function (num, min, max) {
	return Math.min(max, Math.max(num, min));
};

export const epsilonEquals = function (a, b) {
	return Math.abs(a - b) < 0.00000001;
};

export const deprecationWarning = function (name) {
	console.warn(`You are using a deprecated feature scheduled for removal: ${name}`);
};

export const distanceNeededToAchieveSpeed = function (currentSpeed, targetSpeed, acceleration) {
	// v² = u² + 2a * d
	const requiredDistance = (Math.pow(targetSpeed, 2) - Math.pow(currentSpeed, 2)) / (2 * acceleration);
	return requiredDistance;
};
export const accelerationNeededToAchieveChangeDistance = function (currentSpeed, targetSpeed, distance) {
	// v² = u² + 2a * d
	const requiredAcceleration = 0.5 * ((Math.pow(targetSpeed, 2) - Math.pow(currentSpeed, 2)) / distance);
	return requiredAcceleration;
};

// Fake frame requester helper used for testing and fitness simulations
export const createFrameRequester = function (timeStep) {
	let currentCb = null;
	const requester: any = {};
	requester.currentT = 0.0;
	requester.register = function (cb) {
		currentCb = cb;
	};
	requester.trigger = function () {
		requester.currentT += timeStep;
		if (currentCb !== null) {
			currentCb(requester.currentT);
		}
	};
	return requester;
};

export const getModuleFromUserCode = async function (code) {
	const moduleURL = URL.createObjectURL(new Blob([code], { type: 'text/javascript; charset=utf-8' }));
	const userModule = await import(moduleURL);
	URL.revokeObjectURL(moduleURL);

	if (typeof userModule.init !== 'function') {
		throw new Error('Module must export an init function');
	}
	if (typeof userModule.update !== 'function') {
		throw new Error('Module must export an update function');
	}

	return userModule;
};

export const USER_ERROR_REGEX = /^.*(?<blob>blob:.*?):(?<line>\d+):(?<column>\d+).*$/;

export const isUserError = (error) => {
	return USER_ERROR_REGEX.test(error.stack);
};
