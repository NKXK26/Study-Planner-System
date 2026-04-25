import { useState, useEffect } from 'react';
import StudentDB from '@app/class/Student/StudentsDB';
import CourseDB from '@app/class/Course/CourseDB';
import MajorDB from '@app/class/Major/MajorDB';
import TermDB from '@app/class/Term/termDB';
import CourseIntakeDB from '@app/class/CourseIntake/CourseIntakeDB';
import { useRouter } from 'next/navigation';
import { useRole } from '@app/context/RoleContext';
import ActionButton from '@components/ActionButton';

const StudentListing = ({ params, error, HandleOpenForm, onDeleteClick, deleteLoading, RefreshList, setPagination }) => {
    const { can } = useRole();
    const [studentListing, setStudentListing] = useState([]);
    const [courses, setCourses] = useState({});
    const [majors, setMajors] = useState({});
    const [terms, setTerms] = useState({});
    const [intakes, setIntakes] = useState({});
    const [fetchError, setFetchError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);  
    const router = useRouter();

    useEffect(() => {
        const fetchStudents = async () => {
            setIsLoading(true);
            try {
                const students = await StudentDB.FetchStudents(params);

                // Check if students is an error response
                if (!Array.isArray(students)) {
                    setFetchError(students.message || "Failed to fetch students");
                    setStudentListing([]);
                    // Update pagination in parent
                    if (setPagination) {
                        setPagination({ total: 0, page: params.page || 1, limit: params.limit || 10, totalPages: 1 });
                    }
                    return;
                }

                setStudentListing(students);
                setFetchError(null);

                // Update pagination totals in parent (frontend-only)
                if (setPagination) {
                    const total = students.length;
                    const limit = Number(params.limit) || 10;
                    const page = Number(params.page) || 1;
                    const totalPages = Math.max(1, Math.ceil(total / limit));
                    setPagination({ total, page, limit, totalPages });
                }

                // Fetch related data
            } catch (err) {
                console.error("Fetch error:", err);
                setFetchError(err.message);
                setStudentListing([]);
                if (setPagination) {
                    setPagination({ total: 0, page: params.page || 1, limit: params.limit || 10, totalPages: 1 });
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchStudents();
    }, [params]);

    if (isLoading) {
        return (
            <tr>
                <td colSpan="8" className="py-8 text-muted" style={{ height: "120px" }}>
                    <div className="flex items-center justify-center w-full h-full">
                        Loading students...
                    </div>
                </td>
            </tr>
        );
    }

    if (fetchError || error) {
        return (
            <tr>
                <td colSpan="8" className="py-8 text-muted" style={{ height: "120px" }}>
                    <div className="flex items-center justify-center w-full h-full">
                        {fetchError || error}
                    </div>
                </td>
            </tr>
        );
    }

    if (studentListing.length === 0) {
        return (
            <tr>
                <td colSpan="8" className="py-8 text-muted" style={{ height: "120px" }}>
                    <div className="flex items-center justify-center w-full h-full">
                        No students found
                    </div>
                </td>
            </tr>
        );
    }

    // Helper function to convert month number to month abbreviation
    const getMonthAbbrev = (monthNum) => {
        const months = {
            1: 'JAN', 2: 'FEB', 3: 'MAR', 4: 'APR', 5: 'MAY', 6: 'JUN',
            7: 'JUL', 8: 'AUG', 9: 'SEP', 10: 'OCT', 11: 'NOV', 12: 'DEC'
        };
        return months[monthNum] || 'JAN'; // Default to JAN if month is not available
    };

    const currentPage = Number(params?.page) || 1;
    const currentLimit = Number(params?.limit) || 10;
    const start = (currentPage - 1) * currentLimit;
    const end = currentPage * currentLimit;

    return (
        <>
            {studentListing.slice(start, end).map((student, index) => {
                const course = student.course
                const major = student.major;

                // Get term information
                const term = student.courseIntake.Term;

                // Format term display with month abbreviation followed by year
                let termDisplay = 'N/A';
                if (term.id) {
                    // Use month field if available, otherwise derive from term name
                    const monthAbbrev = term.month
                        ? getMonthAbbrev(term.month)
                        : (term.name && term.name.includes('Sem1') ? 'FEB' : 'AUG');

                    termDisplay = `${term.name} - ${monthAbbrev}${term.year} (${term.semtype})`;
                }

                return (
                    <tr
                        key={student.studentID || start + index}
                        className="table-row-hover"
                    >
                        <td onClick={() => HandleOpenForm("READ", student.studentID)} className="px-6 py-4 table-text cursor-pointer">{start + index + 1}</td>
                        <td onClick={() => HandleOpenForm("READ", student.studentID)} className="px-6 py-4 table-text cursor-pointer">{student.studentID}</td>
                        <td onClick={() => HandleOpenForm("READ", student.studentID)} className="px-6 py-4 table-text cursor-pointer">{student.FirstName}</td>
                        <td onClick={() => HandleOpenForm("READ", student.studentID)} className="px-6 py-4 table-text cursor-pointer">{course.code ? `${course.code} - ${course.name}` : 'N/A'}</td>
                        <td onClick={() => HandleOpenForm("READ", student.studentID)} className="px-6 py-4 table-text cursor-pointer">{major.name || 'N/A'}</td>
                        <td onClick={() => HandleOpenForm("READ", student.studentID)} className="px-6 py-4 table-text cursor-pointer">{termDisplay}</td>
                        <td onClick={() => HandleOpenForm("READ", student.studentID)} className="px-6 py-4 table-text cursor-pointer">{student.status && student.status.charAt(0).toUpperCase() + student.status.slice(1).toLowerCase()}</td>
                        <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center space-x-2 justify-center">
                                {can('student_info', 'read') && (
                                    <ActionButton
                                        actionType="view"
                                        onClick={() => HandleOpenForm("READ", student.studentID)}
                                        title="View student"
                                    />
                                )}
                                {can('student_info', 'update') && (
                                    <ActionButton
                                        actionType="edit"
                                        onClick={() => router.push(`/view/student_information/${student.studentID}?mode=EDIT`)}
                                        title="Edit student"
                                    />
                                )}
                                {can('student_info', 'delete') && (
                                    <ActionButton
                                        actionType="delete"
                                        onClick={() => {
                                            console.log('Student object:', student);
                                            console.log('Student ID:', student.studentID);
                                            console.log('Delete loading state for this student:', deleteLoading[student.studentID]);
                                            onDeleteClick(student);
                                        }}
                                        title="Delete student"
                                        isLoading={deleteLoading[student.studentID]}
                                    />
                                )}
                            </div>
                        </td>
                    </tr>
                );
            })}
        </>
    );
};

export default StudentListing;