
//Student Object and constructor

class Student {
  constructor({
    studentID,
    FirstName = null,
    status = null,
    creditCompleted = null,
    mpuCreditCompleted = null,
    courseID,
    majorID,
    intakeID,
    course = null,
    major = null,
    courseIntake = null,
    studentStudyPlannerAmmendments = [],
    unitHistory = [],
  }) {
    this.studentID = studentID;
    this.FirstName = FirstName;
    this.status = status;
    this.creditCompleted = creditCompleted;
    this.mpuCreditCompleted = mpuCreditCompleted;
    this.courseID = courseID;
    this.majorID = majorID;
    this.intakeID = intakeID;
    this.course = course;
    this.major = major;
    this.courseIntake = courseIntake;
    this.studentStudyPlannerAmmendments = studentStudyPlannerAmmendments
    this.unitHistory = unitHistory
  }

  get studentStudyPlannerAmmendments() {
    return this._studentStudyPlannerAmmendments;
  }
  set studentStudyPlannerAmmendments(value) {
    this._studentStudyPlannerAmmendments = value;
  }


  get unitHistory() {
    return this._unitHistory;
  }
  set unitHistory(value) {
    this._unitHistory = value;
  }

  get studentID() {
    return this._studentID;
  }
  set studentID(value) {
    this._studentID = value;
  }

  get FirstName() {
    return this._FirstName;
  }
  set FirstName(value) {
    this._FirstName = value;
  }

  get status() {
    return this._status;
  }
  set status(value) {
    this._status = value;
  }

  get creditCompleted() {
    return this._creditCompleted;
  }
  set creditCompleted(value) {
    this._creditCompleted = value;
  }

  get mpuCreditCompleted() {
    return this._mpuCreditCompleted;
  }
  set mpuCreditCompleted(value) {
    this._mpuCreditCompleted = value;
  }

  get courseID() {
    return this._courseID;
  }
  set courseID(value) {
    this._courseID = value;
  }

  get majorID() {
    return this._majorID;
  }
  set majorID(value) {
    this._majorID = value;
  }

  get intakeID() {
    return this._intakeID;
  }
  set intakeID(value) {
    this._intakeID = value;
  }

  get course() {
    return this._course;
  }
  set course(value) {
    this._course = value;
  }

  get major() {
    return this._major;
  }
  set major(value) {
    this._major = value;
  }

  get courseIntake() {
    return this._courseIntake;
  }
  set courseIntake(value) {
    this._courseIntake = value;
  }
}

export default Student;
