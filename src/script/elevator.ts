import {
	accelerationNeededToAchieveChangeDistance,
	deprecationWarning,
	distanceNeededToAchieveSpeed,
	epsilonEquals,
	limitNumber,
} from './base.js';
import Movable from './movable.js';
import User from './user.js';

function newElevStateHandler(eventName, elevator) {
	elevator.handleNewState();
}

export default class Elevator extends Movable {
	ACCELERATION: number;
	DECELERATION: number;
	MAXSPEED: number;
	floorCount: number;
	floorHeight: number;
	maxUsers: number;
	destinationY: number;
	velocityY = 0.0;
	// isMoving flag is needed when going to same floor again - need to re-raise events
	isMoving = false;

	goingDownIndicator = true;
	goingUpIndicator = true;

	currentFloor = 0;
	previousTruncFutureFloorIfStopped = 0;
	buttonStates;

	moveCount = 0;
	removed = false;
	userSlots: { pos: number[]; user: User }[];
	width: number;

	constructor(speedFloorsPerSec, floorCount, floorHeight, maxUsers) {
		super();

		this.ACCELERATION = floorHeight * 2.1;
		this.DECELERATION = floorHeight * 2.6;
		this.MAXSPEED = floorHeight * speedFloorsPerSec;
		this.floorCount = floorCount;
		this.floorHeight = floorHeight;
		this.maxUsers = maxUsers || 4;
		this.buttonStates = _.map(_.range(floorCount), (e, i) => {
			return false;
		});
		this.userSlots = _.map(_.range(this.maxUsers), (user, i) => {
			return { pos: [2 + i * 10, 30], user: null };
		});
		this.width = this.maxUsers * 10;
		this.destinationY = this.getYPosOfFloor(this.currentFloor);

		this.on('new_state', newElevStateHandler);

		this.on('change:goingUpIndicator', (eventName, value) => {
			this.trigger('indicatorstate_change', { up: this.goingUpIndicator, down: this.goingDownIndicator });

			if (this.worldY == this.getYPosOfFloor(this.getExactFloorOfYPos(this.worldY))) {
				this.goToFloor(this.getExactFloorOfYPos(this.worldY), true);
			}
		});

		this.on('change:goingDownIndicator', (eventName, value) => {
			this.trigger('indicatorstate_change', { up: this.goingUpIndicator, down: this.goingDownIndicator });

			if (this.worldY == this.getYPosOfFloor(this.getExactFloorOfYPos(this.worldY))) {
				this.goToFloor(this.getExactFloorOfYPos(this.worldY), true);
			}
		});
	}

	setFloorPosition(floor) {
		const destination = this.getYPosOfFloor(floor);
		this.currentFloor = floor;
		this.previousTruncFutureFloorIfStopped = floor;
		this.moveTo(null, destination);
	}

	userEntering(user) {
		const randomOffset = _.random(this.userSlots.length - 1);
		for (let i = 0; i < this.userSlots.length; i++) {
			const slot = this.userSlots[(i + randomOffset) % this.userSlots.length];
			if (slot.user === null) {
				slot.user = user;
				return slot.pos;
			}
		}
		return false;
	}

	pressFloorButton(floorNumber) {
		floorNumber = limitNumber(floorNumber, 0, this.floorCount - 1);
		const prev = this.buttonStates[floorNumber];
		this.buttonStates[floorNumber] = true;
		if (!prev) {
			this.trigger('floor_button_pressed', floorNumber);
			this.trigger('floor_buttons_changed', this.buttonStates, floorNumber);
		}
	}

	userExiting(user) {
		for (let i = 0; i < this.userSlots.length; i++) {
			const slot = this.userSlots[i];
			if (slot.user === user) {
				slot.user = null;
			}
		}
	}

	update(dt) {
		super.update(dt);
		if (this.isBusy()) {
			// TODO: Consider if having a nonzero velocity here should throw error..
			return;
		}

		// Make sure we're not speeding
		this.velocityY = limitNumber(this.velocityY, -this.MAXSPEED, this.MAXSPEED);

		// Move elevator
		this.moveTo(null, this.y + this.velocityY * dt);

		const destinationDiff = this.destinationY - this.y;
		const directionSign = Math.sign(destinationDiff);
		const velocitySign = Math.sign(this.velocityY);
		let acceleration = 0.0;
		if (destinationDiff !== 0.0) {
			if (directionSign === velocitySign) {
				// Moving in correct direction
				const distanceNeededToStop = distanceNeededToAchieveSpeed(this.velocityY, 0.0, this.DECELERATION);
				if (distanceNeededToStop * 1.05 < -Math.abs(destinationDiff)) {
					// Slow down
					// Allow a certain factor of extra breaking, to enable a smooth breaking movement after detecting overshoot
					const requiredDeceleration = accelerationNeededToAchieveChangeDistance(
						this.velocityY,
						0.0,
						destinationDiff,
					);
					const deceleration = Math.min(this.DECELERATION * 1.1, Math.abs(requiredDeceleration));
					this.velocityY -= directionSign * deceleration * dt;
				} else {
					// Speed up (or keep max speed...)
					acceleration = Math.min(Math.abs(destinationDiff * 5), this.ACCELERATION);
					this.velocityY += directionSign * acceleration * dt;
				}
			} else if (velocitySign === 0) {
				// Standing still - should accelerate
				acceleration = Math.min(Math.abs(destinationDiff * 5), this.ACCELERATION);
				this.velocityY += directionSign * acceleration * dt;
			} else {
				// Moving in wrong direction - decelerate as much as possible
				this.velocityY -= velocitySign * this.DECELERATION * dt;
				// Make sure we don't change direction within this time step - let standstill logic handle it
				if (Math.sign(this.velocityY) !== velocitySign) {
					this.velocityY = 0.0;
				}
			}
		}

		if (this.isMoving && Math.abs(destinationDiff) < 0.5 && Math.abs(this.velocityY) < 3) {
			// Snap to destination and stop
			this.moveTo(null, this.destinationY);
			this.velocityY = 0.0;
			this.isMoving = false;
			this.handleDestinationArrival();
		}
	}

	handleDestinationArrival() {
		this.trigger('stopped', this.getExactCurrentFloor());

		if (this.isOnAFloor()) {
			this.buttonStates[this.currentFloor] = false;
			this.trigger('floor_buttons_changed', this.buttonStates, this.currentFloor);
			this.trigger('stopped_at_floor', this.currentFloor);
			// Need to allow users to get off first, so that new ones
			// can enter on the same floor
			this.trigger('exit_available', this.currentFloor, this);
			this.trigger('entrance_available', this);
		}
	}

	goToFloor(floor) {
		this.makeSureNotBusy();
		this.isMoving = true;
		this.destinationY = this.getYPosOfFloor(floor);
	}

	getFirstPressedFloor() {
		deprecationWarning('getFirstPressedFloor');
		for (let i = 0; i < this.buttonStates.length; i++) {
			if (this.buttonStates[i]) {
				return i;
			}
		}
		return 0;
	}

	getPressedFloors() {
		const arr = [];
		for (let i = 0; i < this.buttonStates.length; i++) {
			if (this.buttonStates[i]) {
				arr.push(i);
			}
		}
		return arr;
	}

	isSuitableForTravelBetween(fromFloorNum, toFloorNum) {
		if (fromFloorNum > toFloorNum) {
			return this.goingDownIndicator;
		}
		if (fromFloorNum < toFloorNum) {
			return this.goingUpIndicator;
		}
		return true;
	}

	getYPosOfFloor(floorNum) {
		return (this.floorCount - 1) * this.floorHeight - floorNum * this.floorHeight;
	}

	getExactFloorOfYPos(y) {
		return ((this.floorCount - 1) * this.floorHeight - y) / this.floorHeight;
	}

	getExactCurrentFloor() {
		return this.getExactFloorOfYPos(this.y);
	}

	getDestinationFloor() {
		return this.getExactFloorOfYPos(this.destinationY);
	}

	getRoundedCurrentFloor() {
		return Math.round(this.getExactCurrentFloor());
	}

	getExactFutureFloorIfStopped() {
		const distanceNeededToStop = distanceNeededToAchieveSpeed(this.velocityY, 0.0, this.DECELERATION);
		return this.getExactFloorOfYPos(this.y - Math.sign(this.velocityY) * distanceNeededToStop);
	}

	isApproachingFloor(floorNum) {
		const floorYPos = this.getYPosOfFloor(floorNum);
		const elevToFloor = floorYPos - this.y;
		return this.velocityY !== 0.0 && Math.sign(this.velocityY) === Math.sign(elevToFloor);
	}

	isOnAFloor() {
		return epsilonEquals(this.getExactCurrentFloor(), this.getRoundedCurrentFloor());
	}

	getLoadFactor() {
		const load = _.reduce(
			this.userSlots,
			(sum, slot) => {
				return sum + (slot.user ? slot.user.weight : 0);
			},
			0,
		);
		return load / (this.maxUsers * 100);
	}

	isFull() {
		for (let i = 0; i < this.userSlots.length; i++) {
			if (this.userSlots[i].user === null) {
				return false;
			}
		}
		return true;
	}
	isEmpty() {
		for (let i = 0; i < this.userSlots.length; i++) {
			if (this.userSlots[i].user !== null) {
				return false;
			}
		}
		return true;
	}

	handleNewState() {
		// Recalculate the floor number etc
		const currentFloor = this.getRoundedCurrentFloor();
		if (currentFloor !== this.currentFloor) {
			this.moveCount++;
			this.currentFloor = currentFloor;
			this.trigger('new_current_floor', this.currentFloor);
		}

		// Check if we are about to pass a floor
		const futureTruncFloorIfStopped = Math.trunc(this.getExactFutureFloorIfStopped());
		if (futureTruncFloorIfStopped !== this.previousTruncFutureFloorIfStopped) {
			// The following is somewhat ugly.
			// A formally correct solution should iterate and generate events for all passed floors,
			// because the elevator could theoretically have such a velocity that it would
			// pass more than one floor over the course of one state change (update).
			// But I can't currently be arsed to implement it because it's overkill.
			const floorBeingPassed = Math.round(this.getExactFutureFloorIfStopped());

			// Never emit passing_floor event for the destination floor
			// Because if it's the destination we're not going to pass it, at least not intentionally
			if (this.getDestinationFloor() !== floorBeingPassed && this.isApproachingFloor(floorBeingPassed)) {
				const direction = this.velocityY > 0.0 ? 'down' : 'up';
				this.trigger('passing_floor', floorBeingPassed, direction);
			}
		}
		this.previousTruncFutureFloorIfStopped = futureTruncFloorIfStopped;
	}
}
