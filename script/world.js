import Elevator from './elevator.js';
import ElevatorInterface from './interfaces.js';
import Floor from './floor.js';
import User from './user.js';

export class WorldCreator {
	constructor() {
		
	}
	
	createFloors(floorCount, floorHeight, errorHandler) {
		const floors = _.map(_.range(floorCount), (e, i) => {
			const yPos = (floorCount - 1 - i) * floorHeight;
			const floor = new Floor(i, yPos, errorHandler);
			return floor;
		});
		return floors;
	}
	
	createElevators(elevatorCount, floorCount, floorHeight, elevatorCapacities) {
		elevatorCapacities = elevatorCapacities || [4];
		let currentX = 200.0;
		const elevators = _.map(_.range(elevatorCount), (e, i) => {
			const elevator = new Elevator(2.6, floorCount, floorHeight, elevatorCapacities[i % elevatorCapacities.length]);

			// Move to right x position
			elevator.moveTo(currentX, null);
			elevator.setFloorPosition(0);
			elevator.updateDisplayPosition();
			currentX += 20 + elevator.width;
			return elevator;
		});
		return elevators;
	}

	createRandomUser() {
		const weight = _.random(55, 100);
		const user = new User(weight);
		if (_.random(40) === 0) {
			user.displayType = 'child';
		} else if (_.random(1) === 0) {
			user.displayType = 'female';
		} else {
			user.displayType = 'male';
		}
		return user;
	}

	spawnUserRandomly(floorCount, floorHeight, floors) {
		const user = this.createRandomUser();
		user.moveTo(105 + _.random(40), 0);
		const currentFloor = _.random(1) === 0 ? 0 : _.random(floorCount - 1);
		let destinationFloor;
		if (currentFloor === 0) {
			// Definitely going up
			destinationFloor = _.random(1, floorCount - 1);
		} else {
			// Usually going down, but sometimes not
			if (_.random(10) === 0) {
				destinationFloor = (currentFloor + _.random(1, floorCount - 1)) % floorCount;
			} else {
				destinationFloor = 0;
			}
		}
		user.appearOnFloor(floors[currentFloor], destinationFloor);
		return user;
	}

	createWorld(options) {
		console.log('Creating world with options', options);
		const defaultOptions = {floorHeight: 50, floorCount: 4, elevatorCount: 2, spawnRate: 0.5};
		options = _.defaults(_.clone(options), defaultOptions);
		const world = new riot.observable();
		world.floorHeight = options.floorHeight;
		world.transportedCounter = 0;

		const handleUserCodeError = function (e) {
			world.trigger('usercode_error', e);
		};

		world.floors = this.createFloors(options.floorCount, world.floorHeight, handleUserCodeError);
		world.elevators = this.createElevators(options.elevatorCount, options.floorCount, world.floorHeight, options.elevatorCapacities);
		world.elevatorInterfaces = _.map(world.elevators, (e) => {
			return new ElevatorInterface(e, options.floorCount, handleUserCodeError);
		});
		world.users = [];
		world.transportedCounter = 0;
		world.transportedPerSec = 0.0;
		world.moveCount = 0;
		world.elapsedTime = 0.0;
		world.maxWaitTime = 0.0;
		world.avgWaitTime = 0.0;
		world.challengeEnded = false;

		const recalculateStats = function () {
			world.transportedPerSec = world.transportedCounter / world.elapsedTime;
			// TODO: Optimize this loop?
			world.moveCount = _.reduce(world.elevators, (sum, elevator) => {
				return sum + elevator.moveCount;
			}, 0);
			world.trigger('stats_changed');
		};

		const registerUser = function (user) {
			world.users.push(user);
			user.updateDisplayPosition(true);
			user.spawnTimestamp = world.elapsedTime;
			world.trigger('new_user', user);
			user.on('exited_elevator', () => {
				world.transportedCounter++;
				world.maxWaitTime = Math.max(world.maxWaitTime, world.elapsedTime - user.spawnTimestamp);
				world.avgWaitTime = (world.avgWaitTime * (world.transportedCounter - 1) + (world.elapsedTime - user.spawnTimestamp)) / world.transportedCounter;
				recalculateStats();
			});
			user.updateDisplayPosition(true);
		};

		const handleElevAvailability = function (elevator) {
			// Use regular loops for memory/performance reasons
			// Notify floors first because overflowing users
			// will press buttons again.
			for (let i = 0, len = world.floors.length; i < len; ++i) {
				const floor = world.floors[i];
				if (elevator.currentFloor === i) {
					floor.elevatorAvailable(elevator);
				}
			}
			for (let users = world.users, i = 0, len = users.length; i < len; ++i) {
				const user = users[i];
				if (user.currentFloor === elevator.currentFloor) {
					user.elevatorAvailable(elevator, world.floors[elevator.currentFloor]);
				}
			}
		};

		// Bind them all together
		for (let i = 0; i < world.elevators.length; ++i) {
			world.elevators[i].on('entrance_available', handleElevAvailability);
		}

		const handleButtonRepressing = function (eventName, floor) {
			// Need randomize iteration order or we'll tend to fill upp first elevator
			for (let i = 0, len = world.elevators.length, offset = _.random(len - 1); i < len; ++i) {
				const elevIndex = (i + offset) % len;
				const elevator = world.elevators[elevIndex];
				if (eventName === 'up_button_pressed' && elevator.goingUpIndicator ||
                    eventName === 'down_button_pressed' && elevator.goingDownIndicator) {

					// Elevator is heading in correct direction, check for suitability
					if (elevator.currentFloor === floor.level && elevator.isOnAFloor() && !elevator.isMoving && !elevator.isFull()) {
						// Potentially suitable to get into
						// Use the interface queue functionality to queue up this action
						world.elevatorInterfaces[elevIndex].goToFloor(floor.level, true);
						return;
					}
				}
			}
		};

		// This will cause elevators to "re-arrive" at floors if someone presses an
		// appropriate button on the floor before the elevator has left.
		for (let i = 0; i < world.floors.length; ++i) {
			world.floors[i].on('up_button_pressed down_button_pressed', handleButtonRepressing);
		}

		let elapsedSinceSpawn = 1.001 / options.spawnRate;
		let elapsedSinceStatsUpdate = 0.0;

		// Main update function
		world.update = (dt) => {
			world.elapsedTime += dt;
			elapsedSinceSpawn += dt;
			elapsedSinceStatsUpdate += dt;
			while (elapsedSinceSpawn > 1.0 / options.spawnRate) {
				elapsedSinceSpawn -= 1.0 / options.spawnRate;
				registerUser(this.spawnUserRandomly(options.floorCount, world.floorHeight, world.floors));
			}

			// Use regular for loops for performance and memory friendlyness
			for (let i = 0, len = world.elevators.length; i < len; ++i) {
				const e = world.elevators[i];
				e.update(dt);
				e.updateElevatorMovement(dt);
			}
			for (let users = world.users, i = 0, len = users.length; i < len; ++i) {
				const u = users[i];
				u.update(dt);
				world.maxWaitTime = Math.max(world.maxWaitTime, world.elapsedTime - u.spawnTimestamp);
			}

			for (let users = world.users, i = world.users.length - 1; i >= 0; i--) {
				const u = users[i];
				if (u.removeMe) {
					users.splice(i, 1);
				}
			}
            
			recalculateStats();
		};

		world.updateDisplayPositions = function () {
			for (let i = 0, len = world.elevators.length; i < len; ++i) {
				world.elevators[i].updateDisplayPosition();
			}
			for (let users = world.users, i = 0, len = users.length; i < len; ++i) {
				users[i].updateDisplayPosition();
			}
		};

		world.unWind = function () {
			console.log('Unwinding', world);
			_.each(world.elevators.concat(world.elevatorInterfaces).concat(world.users).concat(world.floors).concat([world]), (obj) => {
				obj.off('*');
			});
			world.challengeEnded = true;
			world.elevators = world.elevatorInterfaces = world.users = world.floors = [];
		};

		world.init = function () {
			// Checking the floor queue of the elevators triggers the idle event here
			for (let i = 0; i < world.elevatorInterfaces.length; ++i) {
				world.elevatorInterfaces[i].checkDestinationQueue();
			}
		};

		return world;
	}
}

export class WorldController extends riot.observable {
	constructor(dtMax) {
		super();
		
		this.dtMax = dtMax;
		this.timeScale = 1.0;
		this.isPaused = true;
	}
	
	start(world, codeObj, animationFrameRequester, autoStart) {
		this.isPaused = true;
		let lastT = null;
		let firstUpdate = true;
		world.on('usercode_error', this.handleUserCodeError);
		const updater = (t) => {
			if (!this.isPaused && !world.challengeEnded && lastT !== null) {
				if (firstUpdate) {
					firstUpdate = false;
					// This logic prevents infite loops in usercode from breaking the page permanently - don't evaluate user code until game is unpaused.
					try {
						codeObj.init(world.elevatorInterfaces, world.floors);
						world.init();
					} catch (e) {
						this.handleUserCodeError(e);
					}
				}

				const dt = t - lastT;
				let scaledDt = dt * 0.001 * this.timeScale;
				scaledDt = Math.min(scaledDt, this.dtMax * 3 * this.timeScale); // Limit to prevent unhealthy substepping
				try {
					codeObj.update(scaledDt, world.elevatorInterfaces, world.floors);
				} catch (e) {
					this.handleUserCodeError(e);
				}
				while (scaledDt > 0.0 && !world.challengeEnded) {
					const thisDt = Math.min(this.dtMax, scaledDt);
					world.update(thisDt);
					scaledDt -= this.dtMax;
				}
				world.updateDisplayPositions();
				world.trigger('stats_display_changed'); // TODO: Trigger less often for performance reasons etc
			}
			lastT = t;
			if (!world.challengeEnded) {
				animationFrameRequester(updater);
			}
		};
		if (autoStart) {
			this.setPaused(false);
		}
		animationFrameRequester(updater);
	}

	handleUserCodeError(e) {
		this.setPaused(true);
		console.log('Usercode error on update', e);
		this.trigger('usercode_error', e);
	}

	setPaused(paused) {
		this.isPaused = paused;
		this.trigger('timescale_changed');
	}
	setTimeScale(timeScale) {
		this.timeScale = timeScale;
		this.trigger('timescale_changed');
	}
}
