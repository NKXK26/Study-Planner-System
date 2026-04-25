class MasterStudyPlanner {
    constructor({ id = null, course_intake_id, status }) {
        this.id = id;
        this.course_intake_id = course_intake_id;
        this.status = status;
    }

    // Getters and Setters
    get id() {
        return this._id;
    }
    set id(value) {
        this._id = value;
    }

    get course_intake_id() {
        return this._course_intake_id;
    }
    set course_intake_id(value) {
        this._course_intake_id = value;
    }

    get status() {
        return this._status;
    }
    set status(value) {
        this._status = value;
    }
}

export default MasterStudyPlanner;
