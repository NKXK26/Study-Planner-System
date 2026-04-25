class UnitType {
	constructor({ id = null, name, colour = '#000000' }) {
		this.id = id;
		this.name = name;
		this.colour = colour;
	}

	// Getters and Setters
	get id() {
		return this._id;
	}
	set id(value) {
		this._id = value;
	}

	get name() {
		return this._name;
	}
	set name(value) {
		this._name = value;
	}

	get colour() {
		return this._colour;
	}
	set colour(value) {
		this._colour = value;
	}
}

export default UnitType;