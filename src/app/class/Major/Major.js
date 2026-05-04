import Course from "../Course/Course";
import CourseIntake from "../CourseIntake/CourseIntake";
class Major {
	constructor({ ID = null, CourseID, CourseCode, Name, Status, CourseData = null, CourseIntakes = []}) {
		this.id = ID;
		this.courseId = CourseID;
		this.courseCode = CourseCode;
		this.name = Name;
		this.status = Status;
	
		// Map PascalCase to camelCase for Course
		this._course = CourseData
			? new Course({
				id: CourseData.ID,
				code: CourseData.Code,
				name: CourseData.Name,
				credits_required: CourseData.CreditsRequired,
				status: CourseData.Status
			})
			: null;
		this.course_intakes = CourseIntakes;
	}

	get courseIntakes () {
		return this.course_intakes;
	}

	set courseIntakes (value){
		this.course_intakes = value;
	}

	// Getters and Setters for Major attributes
	get id() {
		return this._id;
	}

	set id(value) {
		this._id = value;
	}

	get courseId() {
		return this._courseId;
	}

	set courseId(value) {
		this._courseId = value;
	}

	get courseCode() {
		return this._courseCode;
	}

	set courseCode(value) {
		this._courseCode = value;
	}

	get name() {
		return this._name;
	}

	set name(value) {
		this._name = value;
	}

	get status() {
		return this._status;
	}

	set status(value) {
		this._status = value;
	}

	// Getter and Setter for the 'course' attribute (the Course object)
	get course() {
		return this._course;
	}

	set course(courseData) {
		this._course = courseData ? new Course(courseData) : null;
	}
}

export default Major;
