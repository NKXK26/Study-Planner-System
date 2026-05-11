class UnitType {
	constructor({ id = null, name, colour = '#000000', colors = [] }) {
		this.id = id;
		this.name = name;
		this.colour = colour;
		this.colors = colors;   // add alternative colors array
	}

	// Getters and Setters
	get id() { return this._id; }
	set id(value) { this._id = value; }

	get name() { return this._name; }
	set name(value) { this._name = value; }

	get colour() { return this._colour; }
	set colour(value) { this._colour = value; }

	get colors() { return this._colors; }
	set colors(value) { this._colors = Array.isArray(value) ? value : []; }
}

export default UnitType;