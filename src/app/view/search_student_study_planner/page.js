'use client'
import React, { useState } from 'react'
import StudentDB from '@app/class/Student/StudentsDB'
import MasterStudyPlannerDB from '@app/class/MasterStudyPlanner/MasterStudyPlannerDB'
import { redirect } from '@components/helper'
import { ConditionalRequireAuth } from '@components/helper'
import { useRole } from '@app/context/RoleContext'
import AccessDenied from '@components/AccessDenied'

const SearchStudentStudyPlanner = () => {
  const [studentID, setStudentID] = useState('')
  const [studentData, setStudentData] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const { can } = useRole()

  // Check if user has permission to search students
  const hasPermission = can('search_students', 'read');

  const FetchStudentData = async () => {
    if (!studentID) return alert("Please enter a Student ID.")
    setIsSearching(true)
    try {
      const student_res = await StudentDB.FetchStudents({ StudentID: studentID })
      if (student_res) {
        const student = student_res[0]
        if (!student) {
          alert("Student not found.")
          return
        }
        const studyPlanner_res = await MasterStudyPlannerDB.FetchMasterStudyPlanners({ course_intake_id: student._intakeID })
        const student_id = student.studentID
        const master_study_planenr_id = studyPlanner_res[0]._id
        redirect(`/view/student_information/${student_id}/${master_study_planenr_id}`)
      }
    } catch (error) {
      console.error("Failed to fetch student data:", error)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <ConditionalRequireAuth>
      {!hasPermission ? (
        <AccessDenied requiredPermission="search_students:read" resourceName="search students study planner" />
      ) : (
        <div className="page-bg min-h-screen py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="card-bg rounded-theme shadow-theme p-8">
              <h1 className="title-text text-center mb-8">Search Student Study Planner</h1>

              <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
                <input
                  type="text"
                  placeholder="Enter Student ID"
                  value={studentID}
                  onChange={(e) => setStudentID(e.target.value)}
                  className="input-field w-full sm:w-96 px-4 py-3 border rounded-md focus:ring-2 focus:ring-[#DC2D27] focus:border-[#DC2D27] outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  onKeyDown={(e) => e.key === 'Enter' && !isSearching && FetchStudentData()}
                  disabled={isSearching}
                />
                <button
                  onClick={FetchStudentData}
                  className={`w-full sm:w-auto px-6 py-3 rounded-md flex items-center justify-center gap-2 ${isSearching ? 'btn-primary-disabled' : 'btn-primary'}`}
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <>
                      <svg
                        className="animate-spin h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                      </svg>
                      Search Student
                    </>
                  )}
                </button>
              </div>

              {studentData && (
                <div className="mt-8 p-4 card-bg rounded-theme">
                  <h2 className="heading-text text-lg font-semibold mb-2">Student Data:</h2>
                  <pre className="modal-bg p-4 rounded-md border border-divider overflow-x-auto text-primary">{JSON.stringify(studentData, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </ConditionalRequireAuth>
  )
}

export default SearchStudentStudyPlanner
