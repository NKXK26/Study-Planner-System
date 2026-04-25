'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StudentDB from '@app/class/Student/StudentsDB';
import CourseDB from '@app/class/Course/CourseDB';
import MajorDB from '@app/class/Major/MajorDB';
import TermDB from '@app/class/Term/termDB';
import CourseIntakeDB from '@app/class/CourseIntake/CourseIntakeDB';
import StudentUnitHistory from './student_unit_history';

import Link from 'next/link';
import { ConditionalRequireAuth, redirect } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

export default function StudentDetailsPage() {
    const router = useRouter();
    const params = useParams();
    const studentId = params.student_id;
    const [formMode, setFormMode] = useState("READ");
    const { can } = useRole();

    // Keep form mode in sync with localStorage without using URL params
    useEffect(() => {
        const storageKey = `student_view_mode_${studentId}`;
        const updateModeFromStorage = () => {
            try {
                const stored = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
                const requestedMode = stored && stored.toUpperCase() === 'EDIT' ? 'EDIT' : 'READ';

                // Check if user is trying to access edit mode without permission
                if (requestedMode === 'EDIT' && !can('student_info', 'update')) {
                    setFormMode('READ');
                    return;
                }

                setFormMode(requestedMode);
            } catch (_) {
                setFormMode('READ');
            }
        };

        // Initial sync
        updateModeFromStorage();

        // Listen for cross-tab storage updates
        const handleStorage = (e) => {
            if (e.key === storageKey) updateModeFromStorage();
        };
        window.addEventListener('storage', handleStorage);

        // Listen for local custom event to sync immediately in same tab
        const handleCustom = () => updateModeFromStorage();
        window.addEventListener('student-view-mode-change', handleCustom);

        // Also refresh on window focus
        const handleFocus = () => updateModeFromStorage();
        window.addEventListener('focus', handleFocus);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('student-view-mode-change', handleCustom);
            window.removeEventListener('focus', handleFocus);
        };
    }, [studentId, can]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [pageError, setPageError] = useState(null);
    const [studentDetails, setStudentDetails] = useState({
        FirstName: "",
        StudentID: "",
        Course: "",
        Major: "",
        Intake: "",
        Status: "",
        CreditCompleted: "",
        MPUCreditCompleted: "0",
        CourseID: "",
        MajorID: "",
        IntakeID: "",
        TermID: -1
    });
    const [unitHistory, setUnitHistory] = useState([]);
    const [planner, setPlanner] = useState(null);
    const [plannerId, setPlannerId] = useState(null);
    const [editStudentDetails, setEditStudentDetails] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [courses, setCourses] = useState([]);
    const [majors, setMajors] = useState([]);
    const [intakes, setIntakes] = useState([]);
    const [intakeDetails, setIntakeDetails] = useState({});
    const statusOptions = ["Active", "Inactive"];
    const [hasStudentChanges, setHasStudentChanges] = useState(false);

    const fetchStudentDetails = async () => {
        if (!studentId) return;

        setLoading(true);
        setIsLoading(true);
        setPageError(null);
        try {
            // Debug log: print studentId before fetch
            console.log("Fetching student with ID:", studentId, "(type:", typeof studentId, ")");
            // Fetch student basic details
            const students = await StudentDB.FetchStudents({
                StudentID: studentId,
                return: ['StudentID', 'FirstName', 'CourseID', 'MajorID', 'IntakeID', 'CreditCompleted', 'MPUCreditCompleted', 'Status'],
                includeAllInfo: true
            });
            // Debug log: print fetch result
            console.log("Fetch result for student:", students);

            if (students && students.length > 0) {
                const student = students[0];

                // Normalize field names (handle both camelCase and PascalCase)
                const normalizedStudent = {
                    FirstName: student.FirstName || student.firstName || "",
                    studentID: student.StudentID || student.studentID || student.id || student.ID || "",
                    courseID: student.CourseID || student.courseID || "",
                    majorID: student.MajorID || student.majorID || "",
                    intakeID: student.IntakeID || student.intakeID || "",
                    creditCompleted: student.CreditCompleted || student.creditCompleted || "0",
                    mpuCreditCompleted: student.MPUCreditCompleted || student.mpuCreditCompleted || "0",
                    status: student.Status || student.status || ""
                };

                //Related data
                let course = student.course;
                let major = student.courseIntake.Major;
                let term = student.courseIntake.Term;

                setPlanner(student.courseIntake.MasterStudyPlanner || null);
                setPlannerId(student.courseIntake.MasterStudyPlanner.id || null);

                // Format term/intake display
                let intakeDisplay = 'N/A';
                if (term.name && term.year && term.month && term.semtype) {
                    const monthAbbrev = getMonthAbbrev(term.month);
                    intakeDisplay = `${term.name} - ${monthAbbrev}${term.year} (${term.semtype})`;
                } else if (term.name && term.year) {
                    intakeDisplay = `${term.name} - ${term.year}`;
                } else {
                    intakeDisplay = 'N/A';
                }

                // Handle creditCompleted specially to ensure 0 is displayed as "0" not empty string
                const creditCompletedValue = student.creditCompleted !== null &&
                    student.creditCompleted !== undefined ?
                    String(student.creditCompleted) :
                    "0";

                const mpuCreditCompletedValue = student.mpuCreditCompleted !== null &&
                    student.mpuCreditCompleted !== undefined ?
                    String(student.mpuCreditCompleted) :
                    "0";

                const updatedStudentDetails = {
                    FirstName: normalizedStudent.FirstName || "",
                    StudentID: normalizedStudent.studentID || "",
                    Course: course.code ? `${course.code} - ${course.name}` : course.Code ? `${course.Code} - ${course.Name}` : 'N/A',
                    Major: major.name || major.Name || 'N/A',
                    Intake: intakeDisplay,
                    Status: normalizedStudent.status || "",
                    CreditCompleted: creditCompletedValue,
                    MPUCreditCompleted: mpuCreditCompletedValue,
                    CourseID: normalizedStudent.courseID || "",
                    MajorID: normalizedStudent.majorID || "",
                    IntakeID: normalizedStudent.intakeID || "",
                    TermID: term.id
                };

                setStudentDetails(updatedStudentDetails);
                setUnitHistory(student.unitHistory);
                if (formMode === "EDIT") {
                    setEditStudentDetails(updatedStudentDetails);
                }
            } else {
                // Student not found: clear the form
                setStudentDetails({
                    FirstName: "",
                    StudentID: "",
                    Course: "",
                    Major: "",
                    Intake: "",
                    Status: "",
                    CreditCompleted: "",
                    MPUCreditCompleted: "0",
                    CourseID: "",
                    MajorID: "",
                    IntakeID: ""
                });
                setEditStudentDetails({
                    FirstName: "",
                    StudentID: "",
                    CourseID: "",
                    MajorID: "",
                    IntakeID: "",
                    Status: "",
                    CreditCompleted: "0"
                });
                setUnitHistory([]);
                setPlanner(null);
                setPlannerId(null);
                setMajors([]);
                setIntakes([]);
                setIntakeDetails({});
                setError("Student not found");
            }
        } catch (err) {
            console.error('Error fetching student details:', err);
            setPageError('Failed to load student details');
        } finally {
            setLoading(false);
            setIsLoading(false);
        }
    };

    // Fetch all courses for dropdown
    const fetchCourses = async () => {
        try {
            setLoading(true);
            setIsLoading(true);
            const res = await CourseDB.FetchCourses({ return: ["id", "ID", "code", "Code", "name", "Name"], include_majors: true });
            console.log('res', res)
            if (res.success) {
                // Handle potential field name inconsistencies
                const normalizedCourses = res.data.map(course => ({
                    ID: course.ID || course.id || "",
                    Code: course.Code || course.code || "",
                    Name: course.Name || course.name || "",
                    Majors: course.majors || [],
                }));
                console.log("Fetched courses:", normalizedCourses);
                setCourses(normalizedCourses);
            } else {
                // Try alternative method if the first approach fails
                const allCourses = await CourseDB.FetchCourses({ include_majors: true });
                console.log("Raw courses data:", allCourses);
                if (allCourses && Array.isArray(allCourses)) {
                    const normalizedCourses = allCourses.map(course => ({
                        ID: course.ID || course.id || "",
                        Code: course.Code || course.code || "",
                        Name: course.Name || course.name || "",
                        Majors: course.majors || [],
                    }));
                    setCourses(normalizedCourses);
                }
            }
        } catch (err) {
            console.error("Error fetching courses:", err);
            // Fallback error handling
            try {
                // Last attempt with minimal fields
                const basicCourses = await CourseDB.FetchCourses();
                console.log("Basic courses data:", basicCourses);
                if (basicCourses && Array.isArray(basicCourses)) {
                    setCourses(basicCourses);
                }
            } catch (secondErr) {
                console.error("Final attempt to fetch courses failed:", secondErr);
            }
        } finally {
            setLoading(false);
            setIsLoading(false);
        }
    };

    // Helper function to convert month number to abbreviation
    const getMonthAbbrev = (monthNum) => {
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        return months[(monthNum || 1) - 1] || '';
    };

    // Fetch intakes for selected major
    // Fixed SetIntakesData function for filtering by majorId
    const SetIntakesData = async (majorId) => {
        if (!majorId || courses.length == 0) {
            setIntakes([]);
            setIntakeDetails({});
            return;
        }

        const target_course = courses.find(((course) => parseInt(course.ID) == parseInt(editStudentDetails.CourseID)));

        const target_major = target_course.Majors.find((major) => parseInt(major.id) === parseInt(majorId));

        const published_intakes_for_majors = target_major.courseIntakes.filter((course_intake) => course_intake.Status == "published");

        if (published_intakes_for_majors.length > 0) {
            let intakeDetailsObj = {};
            published_intakes_for_majors.map((intake) => {
                let term = intake.Term;
                const monthAbbrev = term.month ? getMonthAbbrev(term.month) : '';
                intakeDetailsObj[intake.ID] = `${term.name} - ${monthAbbrev} ${term.year} (${term.semtype})`;
            })

            setIntakes(published_intakes_for_majors);
            setIntakeDetails(intakeDetailsObj);
        } else {
            setIntakes([]);
            setIntakeDetails({});
        }
    };

    // Secondary effect to ensure courses are loaded on component mount if in edit mode
    useEffect(() => {
        if (formMode === "EDIT" && courses.length === 0) {
            fetchCourses();
        }
    }, [formMode]);

    // Fetch intakes when major changes
    useEffect(() => {
        if (formMode === "EDIT" && editStudentDetails?.MajorID && courses) {
            SetIntakesData(editStudentDetails.MajorID);
        }
    }, [formMode, editStudentDetails?.MajorID, courses]);

    // When switching to edit mode, set editStudentDetails
    useEffect(() => {
        if (formMode === "EDIT" && studentDetails) {
            setEditStudentDetails({
                FirstName: studentDetails.FirstName || "",
                StudentID: studentDetails.StudentID || "",
                CourseID: studentDetails.CourseID || "",
                MajorID: studentDetails.MajorID || "",
                IntakeID: studentDetails.IntakeID || "",
                Status: studentDetails.Status || "",
                CreditCompleted: studentDetails.CreditCompleted || "0"
            });
        }
    }, [formMode, studentDetails]);

    // Handle input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditStudentDetails(prev => ({ ...prev, [name]: value }));
    };

    // Save changes
    const handleSave = async () => {
        setIsSaving(true);
        if (!editStudentDetails.IntakeID) {
            await window.Swal.fire({
                title: 'Validation Error',
                text: 'Cannot save: Intake is required.',
                icon: 'error'
            });
            setIsSaving(false);
            return;
        }
        if (!editStudentDetails.MajorID) {
            await window.Swal.fire({
                title: 'Validation Error',
                text: 'Cannot save: Major is required.',
                icon: 'error'
            });
            setIsSaving(false);
            return;
        }
        if (!/^[0-9]+$/.test(editStudentDetails.StudentID)) {
            await window.Swal.fire({
                title: 'Validation Error',
                text: 'Cannot save: Student ID must be a number.',
                icon: 'error'
            });
            setIsSaving(false);
            return;
        }
        try {
            const payload = {
                originalStudentID: studentDetails.StudentID,
                StudentID: editStudentDetails.StudentID,
                FirstName: editStudentDetails.FirstName,
                CourseID: editStudentDetails.CourseID,
                MajorID: editStudentDetails.MajorID,
                IntakeID: editStudentDetails.IntakeID,
                CreditCompleted: editStudentDetails.CreditCompleted,
                Status: editStudentDetails.Status
            };

            const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/students', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                await window.Swal.fire({
                    title: 'Success',
                    text: 'Student details have been saved successfully.',
                    icon: 'success',
                    confirmButtonText: 'OK'
                });
                // If Student ID was changed, update the URL and fetch new data
                if (editStudentDetails.StudentID !== studentDetails.StudentID) {
                    try { window.localStorage.setItem(`student_view_mode_${editStudentDetails.StudentID}`, 'EDIT'); } catch (_) { }
                    router.replace(`/view/student_information/${editStudentDetails.StudentID}`);
                } else {
                    await fetchStudentDetails();
                }
            } else {
                const errorData = await res.json();
                await window.Swal.fire({
                    title: 'Error',
                    text: `Cannot save: ${errorData.message || 'Unknown error'}`,
                    icon: 'error'
                });
            }
        } catch (err) {
            await window.Swal.fire({
                title: 'Error',
                text: `Cannot save: ${err.message}`,
                icon: 'error'
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Cancel changes
    const handleCancel = () => {
        setEditStudentDetails({ ...studentDetails });
    };

    useEffect(() => {
        fetchStudentDetails();
    }, [studentId]);

    useEffect(() => {
        if (formMode === "EDIT" && editStudentDetails) {
            // Compare editStudentDetails with studentDetails
            const isChanged = JSON.stringify(editStudentDetails) !== JSON.stringify({
                FirstName: studentDetails.FirstName || "",
                StudentID: studentDetails.StudentID || "",
                CourseID: studentDetails.CourseID || "",
                MajorID: studentDetails.MajorID || "",
                IntakeID: studentDetails.IntakeID || "",
                Status: studentDetails.Status || "",
                CreditCompleted: studentDetails.CreditCompleted || "0"
            });
            setHasStudentChanges(isChanged);
        }
    }, [editStudentDetails, studentDetails, formMode]);

    const handleGoBack = () => {
        router.push('/view/student_information');
    };

    // Check if user has permission to view student information
    const hasReadPermission = can('student_info', 'read');
    const hasEditPermission = can('student_info', 'update');

    return (
        <ConditionalRequireAuth>
            {!hasReadPermission ? (
                <AccessDenied requiredPermission="student_info:read" resourceName="student information" />
            ) : formMode === 'EDIT' && !hasEditPermission ? (
                <AccessDenied requiredPermission="student_info:update" resourceName="student information edit functionality" />
            ) : (
                <PageLoadingWrapper
                    requiredPermission={{ resource: 'student_info', action: 'read' }}
                    resourceName="student information"
                    isLoading={isLoading}
                    loadingText="Loading student details..."
                    error={pageError}
                    errorMessage="Failed to load student details"
                >
                    <div className="page-bg p-6 min-h-screen">
                        <div className="max-w-7xl mx-auto">
                            {error === "Student not found" ? null : (
                                <>
                                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 mb-6">
                                        <div>
                                            <span className="text-muted text-sm mb-1">{formMode === 'EDIT' ? 'Edit' : 'View'} Mode</span>
                                            <h1 className="title-text">Student Details</h1>
                                        </div>
                                        <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                                            <button
                                                onClick={handleGoBack}
                                                className="btn-secondary px-3 py-2 rounded text-sm"
                                            >
                                                Back to Students
                                            </button>
                                            {formMode === 'EDIT' ? (
                                                <button
                                                    onClick={() => {
                                                        try { window.localStorage.setItem(`student_view_mode_${studentId}`, 'READ'); } catch (_) { }
                                                        try { window.dispatchEvent(new Event('student-view-mode-change')); } catch (_) { }
                                                    }}
                                                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded text-sm"
                                                >
                                                    Change to View
                                                </button>
                                            ) : (
                                                // Only render the Change to Edit button if the user has update permission
                                                hasEditPermission ? (
                                                    <button
                                                        onClick={() => {
                                                            try { window.localStorage.setItem(`student_view_mode_${studentId}`, 'EDIT'); } catch (_) { }
                                                            try { window.dispatchEvent(new Event('student-view-mode-change')); } catch (_) { }
                                                        }}
                                                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm"
                                                        title="Change to Edit"
                                                    >
                                                        Change to Edit
                                                    </button>
                                                ) : null
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            {loading ? (
                                <div className="text-center py-8">
                                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
                                    <p className="text-primary mt-2">Loading student details...</p>
                                </div>
                            ) : error === "Student not found" ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <div className="title-text mb-4">Student not found</div>
                                    <button
                                        onClick={handleGoBack}
                                        className="btn-secondary px-4 py-2 rounded"
                                    >
                                        Back to Students
                                    </button>
                                </div>
                            ) : error ? (
                                <div className="badge-error px-4 py-3 rounded relative mb-6">
                                    <strong className="font-bold">Error:</strong>
                                    <span className="block sm:inline"> {error}</span>
                                </div>
                            ) : (
                                <div className="card-bg p-6 rounded-theme shadow-theme">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            <div>
                                                <h3 className="label-text-alt">Name</h3>
                                                {formMode === "EDIT" ? (
                                                    <input
                                                        name="FirstName"
                                                        value={editStudentDetails?.FirstName || ""}
                                                        onChange={handleInputChange}
                                                        className="input-field w-full border rounded p-2"
                                                    />
                                                ) : (

                                                    <p className="text-primary mt-1 text-lg font-medium">{studentDetails.FirstName}</p>

                                                )}
                                            </div>
                                            <div>
                                                <h3 className="label-text-alt">Student ID</h3>
                                                {formMode === "EDIT" ? (
                                                    <input
                                                        name="StudentID"
                                                        type="number"
                                                        value={editStudentDetails?.StudentID || ""}
                                                        onChange={handleInputChange}
                                                        className="input-field w-full border rounded p-2"
                                                    />
                                                ) : (
                                                    <p className="text-primary mt-1 text-lg font-medium">{studentDetails.StudentID}</p>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="label-text-alt">Course</h3>
                                                {formMode === "EDIT" ? (
                                                    <>
                                                        <select
                                                            name="CourseID"
                                                            value={editStudentDetails?.CourseID || ""}
                                                            onChange={e => {
                                                                handleInputChange(e);
                                                                setEditStudentDetails(prev => ({ ...prev, MajorID: "", IntakeID: "" }));
                                                            }}
                                                            className="select-field w-full border rounded p-2"
                                                        >
                                                            <option value="" disabled>Select Course</option>
                                                            {courses.length > 0 ? (
                                                                courses.map(c => (
                                                                    <option key={c.ID || c.id} value={c.ID || c.id}>
                                                                        {(c.Code || c.code)} - {(c.Name || c.name)}
                                                                    </option>
                                                                ))
                                                            ) : (
                                                                <option value="" disabled>Loading courses...</option>
                                                            )}
                                                        </select>
                                                        {courses.length === 0 && (
                                                            <div className="text-red-500 text-sm mt-1">
                                                                No courses available. Please check the database connection.
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="text-primary mt-1">{studentDetails.Course}</p>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="label-text-alt">Major</h3>
                                                {formMode === "EDIT" ? (
                                                    <>
                                                        <select
                                                            name="MajorID"
                                                            value={editStudentDetails?.MajorID || ""}
                                                            onChange={e => {
                                                                handleInputChange(e);
                                                                setEditStudentDetails(prev => ({ ...prev, IntakeID: "" })); // reset IntakeID
                                                            }}
                                                            className="select-field w-full border rounded p-2"
                                                            disabled={!editStudentDetails?.CourseID}
                                                        >
                                                            <option value="" disabled>
                                                                Select Major
                                                            </option>
                                                            {courses
                                                                .find(c => String(c.ID) === String(editStudentDetails?.CourseID || ""))?.Majors
                                                                ?.map(major => (
                                                                    <option key={major.id} value={major.id}>
                                                                        {major.name}
                                                                    </option>
                                                                ))}
                                                        </select>
                                                        {courses.find(c => String(c.ID) === String(editStudentDetails?.CourseID || ""))?.Majors.length === 0 && (
                                                            <p className="text-sm text-red-500 mt-1">No major available for this course.</p>
                                                        )}
                                                    </>

                                                ) : (
                                                    <p className="text-primary mt-1">{studentDetails.Major}</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <h3 className="label-text-alt">Intake</h3>
                                                {formMode === "EDIT" ? (
                                                    <>
                                                        <select
                                                            name="IntakeID"
                                                            value={editStudentDetails?.IntakeID || ""}
                                                            onChange={handleInputChange}
                                                            className="select-field w-full border rounded p-2"
                                                            disabled={!editStudentDetails?.MajorID}
                                                        >
                                                            <option value="" disabled>Select Intake</option>
                                                            {intakes.map(i => (
                                                                <option key={i.ID} value={i.ID}>
                                                                    {intakeDetails[i.ID] || `Intake ID: ${i.ID}`}
                                                                </option>
                                                            ))}
                                                        </select>

                                                        {intakes.length === 0 && editStudentDetails?.MajorID && (
                                                            <p className="text-sm text-red-500 mt-1">No intakes available for this major.</p>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="text-primary mt-1">{studentDetails.Intake}</p>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="label-text-alt">Status</h3>
                                                {formMode === "EDIT" ? (
                                                    <select
                                                        name="Status"
                                                        value={editStudentDetails?.Status || ""}
                                                        onChange={handleInputChange}
                                                        className="select-field w-full border rounded p-2"
                                                    >
                                                        <option value="" disabled>Select Status</option>
                                                        {statusOptions.map(s => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <p className="text-primary mt-1">{studentDetails.Status}</p>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="label-text-alt">Credits Completed</h3>
                                                <p className="text-primary mt-1">{studentDetails.CreditCompleted}</p>
                                            </div>
                                            <div>
                                                <h3 className="label-text-alt">MPU Completed</h3>
                                                <p className="text-primary mt-1 font-semibold text-blue-600">{studentDetails.MPUCreditCompleted || 0}</p>
                                            </div>
                                            
                                            <div className='flex items-center gap-5'>
                                                <h3 className="label-text-alt">Study Planner:</h3>
                                                {planner?._status === "Complete" ? (
                                                    <Link
                                                    href={`/view/student_information/${studentId}/${planner._id}`}
                                                    className="
                                                        bg-red-500 
                                                        hover:bg-red-600 
                                                        text-white 
                                                        font-bold 
                                                        py-1 
                                                        px-2
                                                        rounded 
                                                        transition 
                                                        duration-150 
                                                        ease-in-out
                                                    "
                                                    onClick={() => {
                                                        try { 
                                                            window.localStorage.setItem(`student_view_mode_${studentId}`, formMode === 'EDIT' ? 'EDIT' : 'READ'); 
                                                        } catch (_) { 
                                                            // Handle error if localStorage is unavailable
                                                        }
                                                    }}
                                                >
                                                    {formMode?.toLowerCase() === 'edit' ? 'Edit Study Planner' : 'View Study Planner'}
                                                </Link>
                                                ) : (
                                                    <p className="text-red-500">Master Study Planner For {studentDetails.Course} - {studentDetails.Major} ({studentDetails.Intake}) is not complete</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {formMode === "EDIT" && (
                                        <div className="flex gap-2 mt-4">
                                            <button
                                                onClick={handleSave}
                                                disabled={!hasStudentChanges || isSaving}
                                                className={`${hasStudentChanges && !isSaving ? 'bg-green-500 hover:bg-green-600' : 'bg-green-300'} text-white px-4 py-2 rounded cursor-pointer`}
                                            >
                                                {isSaving ? 'Saving...' : 'Save Changes'}
                                            </button>
                                            <button
                                                onClick={handleCancel}
                                                disabled={!hasStudentChanges}
                                                className={`${hasStudentChanges ? 'bg-red-500 hover:bg-red-600' : 'bg-red-300'} text-white px-4 py-2 rounded cursor-pointer`}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                    {/* Unit History Section */}
                                    <div className="mt-8 pt-6">
                                        <h2 className="text-xl font-semibold mb-4 heading-text">Unit History</h2>
                                        <StudentUnitHistory
                                            studentDetails={studentDetails}
                                            unitHistory={unitHistory}
                                            studentId={studentId}
                                            refreshStudentDetails={fetchStudentDetails}
                                            formMode={formMode}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </PageLoadingWrapper>
            )}
        </ConditionalRequireAuth>
    );
}