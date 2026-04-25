'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import StudentListing from './student_listing';
import Form from './form';
import StudentDB from '@app/class/Student/StudentsDB';
import CourseDB from '@app/class/Course/CourseDB';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import { trackSynchronousPlatformIOAccessInDev } from 'next/dist/server/app-render/dynamic-rendering';
import InfoTooltip from '@components/InfoTooltip';
import ActionButton from '@components/ActionButton';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import styles from '@styles/student.module.css';

const StudentInfo = () => {
    const { can } = useRole();
    const { theme } = useLightDarkMode();
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [formMode, setFormMode] = useState("READ");
    const [selectedStudentID, setSelectedStudentID] = useState(null);
    const [error, setError] = useState(null);
    const [formStudentID, setFormStudentID] = useState("");
    const [formStudentName, setFormStudentName] = useState("");
    const [formCourseID, setFormCourseID] = useState("")
    const [formMajorID, setFormMajorID] = useState("")
    const [allCourses, setAllCourses] = useState([]);
    const [deleteLoading, setDeleteLoading] = useState({});
    const [params, setParams] = useState({
        StudentID: "",
        FirstName: "",
        CourseID: "",
        MajorID: "",
        Status: "all",
        return: ["StudentID", "FirstName", "CourseID", "MajorID", "IntakeID", "Status"],
        order_by: [{ column: "StudentID", ascending: true }],
        includeBasicInfo: true,
        page: 1,
        limit: 10,
    });

    const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [isLoading, setIsLoading] = useState(true);
    const [pageError, setPageError] = useState(null);

    const is_first_load = useRef(true);
    const is_fetching = useRef(false);

    const HandleOpenForm = (mode, studentID = null) => {
        // Permission gating for simulated roles
        if (mode === 'ADD' && !can('student_info', 'create')) {
            window.Swal?.fire?.({ title: 'Permission denied', text: 'You need student_info:create', icon: 'warning' });
            return;
        }
        if (mode === 'EDIT' && !can('student_info', 'update')) {
            window.Swal?.fire?.({ title: 'Permission denied', text: 'You need student_info:update', icon: 'warning' });
            return;
        }
        setFormMode(mode);
        setSelectedStudentID(studentID);
        setShowForm(true);
    };

    // Reset filters
    const resetFilters = () => {
        setParams({
            StudentID: "",
            FirstName: "",
            CourseID: "",
            MajorID: "",
            Status: "all",
            return: ["StudentID", "FirstName", "CourseID", "MajorID", "IntakeID", "Status"],
            order_by: [{ column: "StudentID", ascending: true }],
            includeBasicInfo: true,
            page: 1,
            limit: pagination.limit || 10,
        });
        //Clear the fitlers input
        setFormStudentID("");
        setFormStudentName("")
        setFormCourseID("")
        setFormMajorID("")
    };


    useEffect(() => {
        const FetchAllCourse = async () => {
            try {
                const course_params = {
                    include_majors: true,
                }
                const all_course_res = await CourseDB.FetchCourses(course_params);
                if (all_course_res.success === false) throw new Error(all_course_res.message || "Failed to fetch courses")
                setAllCourses(all_course_res.data)
            } catch (err) {
                setAllCourses([]);
                console.error("Failed to fetch courses:", err);
            } finally {
                // Delay to ensure loading screen shows
                setTimeout(() => {
                    setIsLoading(false);
                }, 500);
            }
        }

        FetchAllCourse();
    }, [])

    const handleViewStudent = async (studentID) => {
        if (!studentID || is_fetching.current) return;

        is_fetching.current = true;
        try {
            if (studentID) {
                // Navigate to the student details page
                router.push(`/view/student_information/${studentID}`);
            } else {
                await window.Swal.fire({
                    title: 'No Student Found',
                    text: 'No student found with the provided Student ID.',
                    icon: 'warning'
                });
                resetFilters(); // Refresh the list and clear the search bar
            }
        } catch (err) {
            await window.Swal.fire({
                title: 'Error',
                text: `Failed to fetch student data: ${err.message}`,
                icon: 'error'
            });
        } finally {
            is_fetching.current = false;
        }
    };

    const handleViewButtonClick = async () => {
        if (formStudentID.trim() === "") {
            await window.Swal.fire({
                title: 'Input Required',
                text: 'Please enter a Student ID.',
                icon: 'warning'
            });
            return;
        }
        handleViewStudent(formStudentID);
    };

    const handleDeleteClick = async (studentID) => {
        try {
            const result = await window.Swal.fire({
                title: 'Delete Student',
                text: `Are you sure you want to delete the student "${studentID}"?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#aaa',
                confirmButtonText: 'Confirm',
                cancelButtonText: 'Cancel'
            });

            if (result.isConfirmed) {
                // Set loading IMMEDIATELY after confirmation, before any async work
                setDeleteLoading(prev => ({ ...prev, [studentID]: true }));

                // Small delay to allow React to re-render with loading state
                await new Promise(resolve => setTimeout(resolve, 50));

                await handleConfirmDelete(studentID);
            }
        } catch (error) {
            console.error("Delete error:", error);
            setDeleteLoading(prev => ({ ...prev, [studentID]: false }));
        }
    };

    const handleConfirmDelete = async (studentID) => {
        if (!can('student_info', 'delete')) {
            await window.Swal?.fire?.({ title: 'Permission denied', text: 'No delete privileges is granted', icon: 'warning' });
            setDeleteLoading(prev => ({ ...prev, [studentID]: false }));
            return;
        }

        try {
            if (!studentID) {
                throw new Error("No student selected for deletion");
            }
            const response = await StudentDB.DeleteStudent({ StudentID: studentID });
            if (response.success) {
                await window.Swal.fire({
                    title: 'Deleted!',
                    text: 'Student has been deleted successfully.',
                    icon: 'success'
                });
                setParams(prev => ({ ...prev })); // Refresh list
            } else {
                await window.Swal.fire({
                    title: 'Error',
                    text: response.message || 'Failed to delete student',
                    icon: 'error'
                });
            }
        } catch (err) {
            console.error("Delete error:", err);
            await window.Swal.fire({
                title: 'Error',
                text: err.message || 'An error occurred while deleting the student',
                icon: 'error'
            });
        } finally {
            setDeleteLoading(prev => ({ ...prev, [studentID]: false }));
        }
    };

    useEffect(() => {
        let timeout;
        if (is_first_load.current) {
            is_first_load.current = false;
        }
        return () => clearTimeout(timeout);
    }, [params]);

    const CustomHandleOpenForm = (mode, studentID) => {
        if (mode === "READ") {
            handleViewStudent(studentID);
        } else {
            HandleOpenForm(mode, studentID);
        }
    };

    const handleSearchButton = () => {
        setParams(prev => ({ ...prev, StudentID: formStudentID.trim(), FirstName: formStudentName.trim(), CourseID: formCourseID, MajorID: formMajorID, page: 1 }));
    }

    // Pagination handlers
    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > pagination.totalPages) return;
        setParams(prev => ({ ...prev, page: newPage }));
        setPagination(prev => ({ ...prev, page: newPage }));
    };

    const handleLimitChange = (e) => {
        const newLimit = Number(e.target.value) || 10;
        const page = 1;
        setParams(prev => ({ ...prev, limit: newLimit, page }));
        setPagination(prev => ({ ...prev, limit: newLimit, page }));
    };

    return (
        <ConditionalRequireAuth>
            <PageLoadingWrapper
                requiredPermission={{ resource: 'student_info', action: 'read' }}
                resourceName="student information"
                isLoading={isLoading}
                loadingText="Loading student information..."
                error={pageError}
                errorMessage="Failed to load student information"
                showPermissionLoading={false}
            >
                <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
                    {showForm && (
                        <div
                            className="fixed inset-0 flex items-center justify-center z-50"
                            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
                        >
                            <Form
                                onClose={() => setShowForm(false)}
                                mode={formMode}
                                studentID={selectedStudentID}
                                RefreshList={() => setParams({ ...params })}
                            />
                        </div>
                    )}
                    <div className="page-bg p-3 w-full min-h-screen">
                        <h1 className='title-text'>
                            Student Information
                            <InfoTooltip
                                content={"In this page, it is where all the students that are currently in the database will be shown. All students have their ID, Name, Course, Major, Term Intake, and Status."}
                                position='right'
                                className='info-bttn'
                            ></InfoTooltip>
                        </h1>

                        {/* SEARCH INTERFACE */}
                        <div className='flex flex-col xl:flex-row items-stretch gap-2 mb-6'>
                            <input
                                type="text"
                                id="studentIdInput"
                                value={formStudentID}
                                onChange={(e) => setFormStudentID(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        handleSearchButton();
                                    }
                                }}
                                placeholder="Search by Student ID"
                                className="input-field border rounded-md p-3 flex-2"
                            />
                            <input
                                type="text"
                                id="studentIdInput"
                                value={formStudentName}
                                onChange={(e) => setFormStudentName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        handleSearchButton();
                                    }
                                }}
                                placeholder="Search by Student Name"
                                className="input-field border rounded-md p-3 flex-2"
                            />
                            <select
                                value={formCourseID}
                                onChange={(e) => setFormCourseID(e.target.value)}
                                className="input-field border rounded-md p-3 flex-2"
                            >
                                <option value="">All Courses</option>
                                {allCourses.map(course => (
                                    <option key={course.id} value={course.id}>
                                        {course.code} - {course.name}
                                    </option>
                                ))}
                            </select>

                            <select
                                value={formMajorID}
                                onChange={(e) => setFormMajorID(e.target.value)}
                                className="input-field border rounded-md p-3 flex-2"
                                disabled={!formCourseID} // disable until a course is chosen
                            >
                                <option value="">All Majors</option>
                                {allCourses
                                    .find(c => String(c.id) === String(formCourseID))?.majors
                                    ?.map(major => (
                                        <option key={major.id} value={major.id}>
                                            {major.name}
                                        </option>
                                    ))}
                            </select>
                            <div className='flex flex-row gap-2 xl:justify-end w-full xl:w-auto'>
                                <button
                                    onClick={resetFilters}
                                    className={`px-4 py-3 rounded-md flex items-center justify-center cursor-pointer w-full xl:w-auto border ${theme === 'dark' ? 'bg-gray-700 text-gray-100 hover:bg-gray-600 border-gray-600' : 'bg-white text-gray-700 hover:bg-gray-50 border'}`}
                                >
                                    Reset Filters
                                </button>
                                <button
                                    onClick={handleSearchButton}
                                    disabled={!formStudentID.trim() && !formStudentName.trim() && !formCourseID && !formMajorID}
                                    className={`px-4 py-3 rounded-md flex items-center justify-center w-full xl:w-auto ${!formStudentID.trim() && !formStudentName.trim() && !formCourseID && !formMajorID
                                        ? "bg-gray-400 text-white cursor-not-allowed"
                                        : "bg-[#DC2D27] text-white hover:bg-red-700 cursor-pointer"
                                        }`}
                                >
                                    Search
                                </button>
                                {can('student_info', 'create') && (
                                    <button
                                        onClick={() => HandleOpenForm('ADD')}
                                        className={`px-4 py-3 rounded-md flex items-center justify-center w-full xl:w-auto ${can('student_info', 'create') ? 'bg-[#DC2D27] text-white cursor-pointer hover:bg-red-700' : 'bg-gray-300 text-white cursor-not-allowed'}`}
                                    >
                                        Add Student
                                        <span className="ml-1 text-xl">+</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* TABLE FOR STUDENTS */}
                        <div className={`${styles.studentListingContainer} mt-5 shadow-md sm:rounded-lg`}>
                            <table className='table-base'>
                                <thead>
                                    <tr className='table-header-row'>
                                        <th scope="col" className="px-6 py-4 table-text">No</th>
                                        <th scope="col" className="px-6 py-4 table-text">Student ID</th>
                                        <th scope="col" className="px-6 py-4 table-text">Name</th>
                                        <th scope="col" className="px-6 py-4 table-text">Course</th>
                                        <th scope="col" className="px-6 py-4 table-text">Major</th>
                                        <th scope="col" className="px-6 py-4 table-text">Term Intake</th>
                                        <th scope="col" className="px-6 py-4 table-text">Status</th>
                                        <th scope="col" className="px-6 py-4 table-text">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="table-body-divided">
                                    <StudentListing
                                        params={params}
                                        error={error}
                                        HandleOpenForm={CustomHandleOpenForm}
                                        onDeleteClick={(student) => handleDeleteClick(student.StudentID || student.studentID || student.id || student.ID)}
                                        deleteLoading={deleteLoading}
                                        setPagination={setPagination}
                                    />
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Controls */}
                        <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-2 pagination-information">
                                <span>Items per page:</span>
                                <select
                                    value={pagination.limit}
                                    onChange={handleLimitChange}
                                    className="select-field border rounded px-2 py-1"
                                >
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                </select>
                                <span>
                                    Page {pagination.page} of {Math.max(1, pagination.totalPages)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handlePageChange(pagination.page - 1)}
                                    className="pagination-btn"
                                    disabled={pagination.page <= 1}
                                >
                                    Previous
                                </button>
                                {Array.from({ length: Math.max(1, pagination.totalPages) }, (_, i) => i + 1).map(pageNum => (
                                    <button
                                        key={pageNum}
                                        onClick={() => handlePageChange(pageNum)}
                                        className={pagination.page === pageNum ? 'pagination-btn-active' : 'pagination-btn'}
                                    >
                                        {pageNum}
                                    </button>
                                ))}
                                <button
                                    onClick={() => handlePageChange(pagination.page + 1)}
                                    className="pagination-btn"
                                    disabled={pagination.page >= Math.max(1, pagination.totalPages)}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </PageLoadingWrapper>
        </ConditionalRequireAuth>
    );
}

export default StudentInfo;