class CourseIntake {
	constructor({ ID, Status, TermID, MajorID, Term = null, Major = null, MasterStudyPlanner = null}) {
		this.ID = ID;
		this.Status = Status;
		this.TermID = TermID;
		this.MajorID = MajorID;
		this.Term = Term;
		this.Major = Major;
		this.MasterStudyPlanner = MasterStudyPlanner;
	}

	// ID
	get ID() {
		return this._ID;
	}
	set ID(value) {
		this._ID = value;
	}

	// Status
	get Status() {
		return this._Status;
	}
	set Status(value) {
		this._Status = value;
	}

	// TermID
	get TermID() {
		return this._TermID;
	}
	set TermID(value) {
		this._TermID = value;
	}

	// MajorID
	get MajorID() {
		return this._MajorID;
	}
	set MajorID(value) {
		this._MajorID = value;
	}

	// Term (object)
	get Term() {
		return this._Term;
	}
	set Term(value) {
		this._Term = value;
	}

	// Major (object)
	get Major() {
		return this._Major;
	}
	set Major(value) {
		this._Major = value;
	}

	// MasterStudyPlanner (object)
	get MasterStudyPlanner() {
		return this._MasterStudyPlanner;
	}
	set MasterStudyPlanner(value) {
		this._MasterStudyPlanner = value;
	}
}

export default CourseIntake;
