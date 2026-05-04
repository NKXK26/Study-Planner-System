'use client';
import { useState, useEffect } from 'react';
import { 
  LightBulbIcon, 
  XMarkIcon, 
  ClockIcon, 
  SparklesIcon,
  CreditCardIcon,
  CheckCircleIcon,
  AcademicCapIcon,
  BookOpenIcon,
  ArrowPathIcon,
  CalendarIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  BriefcaseIcon
} from '@heroicons/react/24/outline';

/**
 * Unit Recommendation Component
 * 
 * Based on 5 Study Planners:
 * - Artificial Intelligence (AI)
 * - Cybersecurity (Cyber)
 * - Data Science (Data Sci)
 * - Internet of Things (IoT)
 * - Software Development (Software Dev)
 * 
 * RULES:
 * - 1 Year = 2 Semesters
 * - Only recommends units from the selected study planner
 * - Checks prerequisites (AND, OR, credit requirements, co-requisites)
 * - WIL (ICT20016): Year 2 Sem 2+ AND 12+ units completed
 * - Project A (COS40005): Year 3 Sem 1 AND 175+ credits
 * - Project B (COS40006): Year 3 Sem 2 AND Project A completed
 * - Prioritizes fastest graduation path
 */

const UnitRecommendations = ({ 
  isOpen, 
  onClose, 
  planner, 
  completedUnits,
  studentInfo
}) => {
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [skippedUnits, setSkippedUnits] = useState([]);
  const [wilRecommendation, setWilRecommendation] = useState(null);
  const [regularRecommendations, setRegularRecommendations] = useState([]);
  const [currentYear, setCurrentYear] = useState(1);
  const [currentSemester, setCurrentSemester] = useState(1);
  const [yearSemesterLoading, setYearSemesterLoading] = useState(true);

  // Fetch student's current year and semester
  useEffect(() => {
    const fetchStudentYearSemester = async () => {
      if (!studentInfo?.studentId) {
        setYearSemesterLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/students/${studentInfo.studentId}/year-semester`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setCurrentYear(data.data.currentYear);
            setCurrentSemester(data.data.currentSemester);
          }
        }
      } catch (error) {
        // Fallback: Calculate from credits
        const totalCredits = completedUnits.reduce((sum, u) => sum + (u.creditPoints || 0), 0);
        let year = 1;
        if (totalCredits >= 200) year = 3;
        else if (totalCredits >= 100) year = 2;
        setCurrentYear(year);
        setCurrentSemester(1);
      } finally {
        setYearSemesterLoading(false);
      }
    };

    if (isOpen && completedUnits) {
      fetchStudentYearSemester();
    }
  }, [isOpen, studentInfo?.studentId, completedUnits]);

  useEffect(() => {
    if (isOpen && planner && completedUnits && !yearSemesterLoading) {
      generateRecommendations();
    }
  }, [isOpen, planner, completedUnits, yearSemesterLoading, currentYear, currentSemester]);

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================

  // Extract unit code (e.g., "COS10009" from "COS10009 - Programming")
  const extractUnitCode = (unitCodeStr) => {
    if (!unitCodeStr) return '';
    const match = unitCodeStr.match(/[A-Z]{3}\d{5}/i);
    return match ? match[0].toUpperCase() : unitCodeStr.split(' ')[0].toUpperCase();
  };

  // Parse prerequisites string into structured conditions
  const parsePrerequisites = (prereqString) => {
    if (!prereqString || prereqString === 'Nil' || prereqString === 'nil' || prereqString === 'NIL') {
      return { type: 'none', conditions: [] };
    }

    // Handle credit-only (e.g., "50cp", "175cp")
    const creditMatch = prereqString.match(/^(\d+)cp$/i);
    if (creditMatch) {
      return { type: 'credit', conditions: [{ type: 'credit', value: parseInt(creditMatch[1]) }] };
    }

    // Handle co-requisite (e.g., "Co-req: COS10009")
    if (prereqString.toLowerCase().includes('co-req')) {
      const unitMatch = prereqString.match(/[A-Z]{3}\d{5}/i);
      if (unitMatch) {
        return { type: 'coreq', conditions: [{ type: 'unit', code: unitMatch[0].toUpperCase() }] };
      }
    }

    // Handle anti-requisite (e.g., "Anti-req: COS10011") - treat as warning but not blocking
    if (prereqString.toLowerCase().includes('anti-req')) {
      return { type: 'anti', conditions: [] };
    }

    // Handle AND condition (e.g., "COS10009 & COS10026")
    if (prereqString.includes('&')) {
      const parts = prereqString.split('&').map(p => p.trim());
      const conditions = [];
      for (const part of parts) {
        const unitMatch = part.match(/[A-Z]{3}\d{5}/i);
        const creditMatchPart = part.match(/(\d+)cp/i);
        if (unitMatch) {
          conditions.push({ type: 'unit', code: unitMatch[0].toUpperCase() });
        } else if (creditMatchPart) {
          conditions.push({ type: 'credit', value: parseInt(creditMatchPart[1]) });
        }
      }
      return { type: 'and', conditions };
    }

    // Handle OR condition (e.g., "COS10009 / COS10026")
    if (prereqString.includes('/')) {
      const parts = prereqString.split('/').map(p => p.trim());
      const conditions = [];
      for (const part of parts) {
        const unitMatch = part.match(/[A-Z]{3}\d{5}/i);
        if (unitMatch) {
          conditions.push({ type: 'unit', code: unitMatch[0].toUpperCase() });
        }
      }
      return { type: 'or', conditions };
    }

    // Handle single unit with credit (e.g., "COS20007 & 150cp" already handled above)
    // Handle single unit (e.g., "COS10009")
    const unitMatch = prereqString.match(/[A-Z]{3}\d{5}/i);
    if (unitMatch) {
      return { type: 'unit', conditions: [{ type: 'unit', code: unitMatch[0].toUpperCase() }] };
    }

    return { type: 'unknown', conditions: [] };
  };

  // Check if prerequisites are met
  const arePrerequisitesMet = (unit, completedUnitsMap, totalCredits) => {
    const prereqString = unit.Prerequisites;
    const parsed = parsePrerequisites(prereqString);

    if (parsed.type === 'none') return true;
    if (parsed.type === 'anti') return true; // Anti-requisite is a warning, not a blocker
    if (parsed.type === 'unknown') return false;

    // Credit-only
    if (parsed.type === 'credit') {
      return totalCredits >= parsed.conditions[0].value;
    }

    // AND condition - ALL must be met
    if (parsed.type === 'and') {
      for (const condition of parsed.conditions) {
        if (condition.type === 'unit') {
          const isMet = completedUnitsMap.has(condition.code) || completedUnitsMap.has(condition.code.toUpperCase());
          if (!isMet) return false;
        } else if (condition.type === 'credit') {
          if (totalCredits < condition.value) return false;
        }
      }
      return true;
    }

    // OR condition - ANY one must be met
    if (parsed.type === 'or') {
      for (const condition of parsed.conditions) {
        if (condition.type === 'unit') {
          const isMet = completedUnitsMap.has(condition.code) || completedUnitsMap.has(condition.code.toUpperCase());
          if (isMet) return true;
        }
      }
      return false;
    }

    // Single unit
    if (parsed.type === 'unit') {
      const unitCode = parsed.conditions[0].code;
      return completedUnitsMap.has(unitCode) || completedUnitsMap.has(unitCode.toUpperCase());
    }

    // Co-requisite - treated as prerequisite (must have or take together)
    if (parsed.type === 'coreq') {
      const unitCode = parsed.conditions[0].code;
      return completedUnitsMap.has(unitCode) || completedUnitsMap.has(unitCode.toUpperCase());
    }

    return false;
  };

  // Check special units completion
  const isProjectACompleted = (completedUnitsMap) => {
    return completedUnitsMap.has('COS40005') || completedUnitsMap.has('COS40005'.toUpperCase());
  };

  const isProjectBCompleted = (completedUnitsMap) => {
    return completedUnitsMap.has('COS40006') || completedUnitsMap.has('COS40006'.toUpperCase());
  };

  const isWILCompleted = (completedUnitsMap) => {
    return completedUnitsMap.has('ICT20016') || completedUnitsMap.has('ICT20016'.toUpperCase());
  };

  // ============================================================
  // SEMESTER ORDERING (1 Year = 2 Semesters)
  // ============================================================
  
  const getSemesterOrder = (unit) => {
    const termId = unit.TermID || unit.termId || unit.semester || '';
    const termLower = termId.toLowerCase();
    const unitCode = unit.UnitCode || '';
    
    // Capstone
    if (unitCode === 'COS40005') return 7;  // Year 3 Sem 1
    if (unitCode === 'COS40006') return 8;  // Year 3 Sem 2
    if (unitCode === 'ICT20016') return 9;  // WIL (flexible)
    
    // Year 1
    if (termLower.includes('year one') && termLower.includes('semester 1')) return 1;
    if (termLower.includes('winter') && termLower.includes('june')) return 2;
    if (termLower.includes('year one') && termLower.includes('semester 2')) return 3;
    
    // Year 2
    if (termLower.includes('year two') && termLower.includes('semester 1')) return 4;
    if (termLower.includes('year two') && termLower.includes('semester 2')) return 5;
    if (termLower.includes('summer') && termLower.includes('jan')) return 6;
    
    // Year 3
    if (termLower.includes('year three') && termLower.includes('semester 1')) return 7;
    if (termLower.includes('year three') && termLower.includes('semester 2')) return 8;
    
    return 99;
  };

  const getSemesterDisplayName = (unit) => {
    const termId = unit.TermID || unit.termId || unit.semester || '';
    const termLower = termId.toLowerCase();
    const unitCode = unit.UnitCode || '';
    
    if (unitCode === 'COS40005') return '🎓 Year 3, Semester 1 (Capstone Project A)';
    if (unitCode === 'COS40006') return '🎓 Year 3, Semester 2 (Capstone Project B)';
    if (unitCode === 'ICT20016') return '💼 Work-Integrated Learning (WIL) - 3 months';
    
    if (termLower.includes('year one') && termLower.includes('semester 1')) return '📚 Year 1, Semester 1';
    if (termLower.includes('winter') && termLower.includes('june')) return '❄️ Winter Term (Year 1)';
    if (termLower.includes('year one') && termLower.includes('semester 2')) return '📚 Year 1, Semester 2';
    if (termLower.includes('year two') && termLower.includes('semester 1')) return '📚 Year 2, Semester 1';
    if (termLower.includes('year two') && termLower.includes('semester 2')) return '📚 Year 2, Semester 2';
    if (termLower.includes('summer') && termLower.includes('jan')) return '☀️ Summer Term (Year 2)';
    if (termLower.includes('year three') && termLower.includes('semester 1')) return '📚 Year 3, Semester 1';
    if (termLower.includes('year three') && termLower.includes('semester 2')) return '📚 Year 3, Semester 2';
    
    return termId || 'Recommended';
  };

  // ============================================================
  // ELIGIBILITY RULES
  // ============================================================

  const isWILEligible = (totalUnitsCompleted, studentYear, studentSemester) => {
    // WIL: Year 2 Sem 2+ AND 12+ units
    const hasCompletedYear2Sem2 = (studentYear > 2) || (studentYear === 2 && studentSemester >= 2);
    return hasCompletedYear2Sem2 && totalUnitsCompleted >= 12;
  };

  const isProjectAEligible = (totalCredits, studentYear, studentSemester) => {
    // Project A: Year 3 Sem 1 AND 175+ credits
    return (studentYear === 3 && studentSemester === 1) && totalCredits >= 175;
  };

  const isProjectBEligible = (completedUnitsMap, studentYear, studentSemester) => {
    // Project B: Year 3 Sem 2 AND Project A completed
    return (studentYear === 3 && studentSemester === 2) && isProjectACompleted(completedUnitsMap);
  };

  const isUnitCompleted = (unit, completedUnitsMap) => {
    const unitCode = extractUnitCode(unit.UnitCode);
    if (!unitCode) return false;
    return completedUnitsMap.has(unitCode) || completedUnitsMap.has(unitCode.toUpperCase());
  };

  // ============================================================
  // FASTEST PATH SCORING
  // ============================================================

  const calculateFastestPathScore = (unit, studentYear, studentSemester, totalCredits, totalUnitsCompleted, prerequisitesMet) => {
    let score = 0;
    const unitCode = unit.UnitCode || '';
    const unitOrder = getSemesterOrder(unit);
    const creditPoints = unit.CreditPoints || 12.5;
    
    // Factor 1: Prerequisites met (35%) - MOST IMPORTANT
    if (prerequisitesMet) score += 35;
    
    // Factor 2: Graduation impact (25%)
    if (unitCode === 'COS40006') score += 25; // Project B = graduation
    else if (unitCode === 'COS40005') score += 20; // Project A unlocks Project B
    else if (unitCode === 'ICT20016') score += 15; // WIL = 25 CP
    
    // Factor 3: Credit value (20%)
    score += (Math.min(creditPoints, 25) / 25) * 20;
    
    // Factor 4: Year level (10%)
    if (unitOrder >= 7) score += 10;
    else if (unitOrder >= 4) score += 5;
    
    // Factor 5: Core unit (10%)
    if (unit.Type === 'Core') score += 10;
    
    return Math.min(score, 100);
  };

  const getTargetSemesterOrder = (currentYear, currentSemester) => {
    if (currentYear === 1 && currentSemester === 1) return 1;
    if (currentYear === 1 && currentSemester === 2) return 3;
    if (currentYear === 2 && currentSemester === 1) return 4;
    if (currentYear === 2 && currentSemester === 2) return 5;
    if (currentYear === 3 && currentSemester === 1) return 7;
    if (currentYear === 3 && currentSemester === 2) return 8;
    return 1;
  };

  // ============================================================
  // MAIN RECOMMENDATION ALGORITHM
  // ============================================================

  const generateRecommendations = () => {
    setLoading(true);
    
    try {
      const plannerUnits = planner?.totalUnits || [];
      
      if (!plannerUnits || plannerUnits.length === 0) {
        setLoading(false);
        return;
      }
      
      // Create Set of planner unit codes
      const plannerUnitCodes = new Set();
      plannerUnits.forEach(unit => {
        const code = extractUnitCode(unit.UnitCode);
        if (code) plannerUnitCodes.add(code);
      });
      
      // Create map of completed units (only planner units)
      const completedUnitsMap = new Map();
      completedUnits.forEach(unit => {
        const unitCodeUpper = unit.code?.toUpperCase();
        if (plannerUnitCodes.has(unitCodeUpper)) {
          completedUnitsMap.set(unit.code, unit);
          completedUnitsMap.set(unit.code?.toUpperCase(), unit);
        }
      });
      
      // Calculate student statistics
      const totalCredits = Array.from(completedUnitsMap.values()).reduce((sum, u) => sum + (u.creditPoints || 0), 0);
      const totalUnitsCompleted = completedUnitsMap.size;
      
      // Sort planner units by semester order
      const sortedPlannerUnits = [...plannerUnits].sort((a, b) => {
        return getSemesterOrder(a) - getSemesterOrder(b);
      });
      
      // ============================================================
      // CHECK WIL
      // ============================================================
      const wilCompleted = isWILCompleted(completedUnitsMap);
      const wilEligible = isWILEligible(totalUnitsCompleted, currentYear, currentSemester);
      
      let wilUnitData = null;
      if (!wilCompleted && wilEligible) {
        const wilUnit = plannerUnits.find(unit => unit.UnitCode === 'ICT20016');
        if (wilUnit) {
          const prereqsMet = arePrerequisitesMet(wilUnit, completedUnitsMap, totalCredits);
          const fastestScore = calculateFastestPathScore(wilUnit, currentYear, currentSemester, totalCredits, totalUnitsCompleted, prereqsMet);
          wilUnitData = {
            ...wilUnit,
            extractedCode: extractUnitCode(wilUnit.UnitCode),
            creditPoints: wilUnit.CreditPoints || 25,
            semesterDisplay: getSemesterDisplayName(wilUnit),
            isEligible: prereqsMet,
            fastestPathScore: fastestScore,
            statusMessage: prereqsMet ? '✅ Eligible for WIL internship' : '⚠️ Complete 12 units first',
            statusType: prereqsMet ? 'success' : 'warning',
            prerequisitesMet: prereqsMet
          };
        }
      }
      
      // ============================================================
      // FIND MISSING REGULAR UNITS
      // ============================================================
      const targetSemesterOrder = getTargetSemesterOrder(currentYear, currentSemester);
      const regularMissingUnits = [];
      
      for (const unit of sortedPlannerUnits) {
        const isCompleted = isUnitCompleted(unit, completedUnitsMap);
        const unitCode = unit.UnitCode || '';
        const unitOrder = getSemesterOrder(unit);
        
        // Skip special units
        if (unitCode === 'ICT20016' || unitCode === 'COS40005' || unitCode === 'COS40006') {
          continue;
        }
        
        if (!isCompleted && unitOrder >= targetSemesterOrder) {
          regularMissingUnits.push(unit);
        }
      }
      
      // ============================================================
      // CHECK CAPSTONE PROJECTS
      // ============================================================
      const projectACompleted = isProjectACompleted(completedUnitsMap);
      const projectAEligible = isProjectAEligible(totalCredits, currentYear, currentSemester);
      
      let projectARecommendation = null;
      if (!projectACompleted && projectAEligible) {
        const projectAUnit = plannerUnits.find(unit => unit.UnitCode === 'COS40005');
        if (projectAUnit) {
          const prereqsMet = arePrerequisitesMet(projectAUnit, completedUnitsMap, totalCredits);
          const fastestScore = calculateFastestPathScore(projectAUnit, currentYear, currentSemester, totalCredits, totalUnitsCompleted, prereqsMet);
          projectARecommendation = {
            ...projectAUnit,
            extractedCode: extractUnitCode(projectAUnit.UnitCode),
            creditPoints: projectAUnit.CreditPoints || 25,
            semesterDisplay: getSemesterDisplayName(projectAUnit),
            isEligible: prereqsMet,
            fastestPathScore: fastestScore,
            statusMessage: prereqsMet ? '✅ Eligible for Capstone Project A' : '⚠️ Need 175+ credits',
            statusType: prereqsMet ? 'success' : 'warning',
            prerequisitesMet: prereqsMet
          };
        }
      }
      
      const projectBCompleted = isProjectBCompleted(completedUnitsMap);
      const projectBEligible = isProjectBEligible(completedUnitsMap, currentYear, currentSemester);
      
      let projectBRecommendation = null;
      if (!projectBCompleted && projectBEligible) {
        const projectBUnit = plannerUnits.find(unit => unit.UnitCode === 'COS40006');
        if (projectBUnit) {
          const prereqsMet = arePrerequisitesMet(projectBUnit, completedUnitsMap, totalCredits) && projectACompleted;
          const fastestScore = calculateFastestPathScore(projectBUnit, currentYear, currentSemester, totalCredits, totalUnitsCompleted, prereqsMet);
          projectBRecommendation = {
            ...projectBUnit,
            extractedCode: extractUnitCode(projectBUnit.UnitCode),
            creditPoints: projectBUnit.CreditPoints || 25,
            semesterDisplay: getSemesterDisplayName(projectBUnit),
            isEligible: prereqsMet,
            fastestPathScore: fastestScore,
            statusMessage: prereqsMet ? '✅ Eligible for Capstone Project B - GRADUATION!' : '⚠️ Complete Project A first',
            statusType: prereqsMet ? 'success' : 'warning',
            prerequisitesMet: prereqsMet
          };
        }
      }
      
      // ============================================================
      // SCORE AND RANK UNITS
      // ============================================================
      const scoredMissingUnits = regularMissingUnits.map(unit => {
        const prereqsMet = arePrerequisitesMet(unit, completedUnitsMap, totalCredits);
        const fastestScore = calculateFastestPathScore(unit, currentYear, currentSemester, totalCredits, totalUnitsCompleted, prereqsMet);
        
        return {
          ...unit,
          extractedCode: extractUnitCode(unit.UnitCode),
          creditPoints: unit.CreditPoints || 12.5,
          semesterDisplay: getSemesterDisplayName(unit),
          isEligible: prereqsMet,
          fastestPathScore: fastestScore,
          statusMessage: prereqsMet ? '✅ Ready to take' : '⚠️ Prerequisites needed',
          statusType: prereqsMet ? 'success' : 'warning',
          prerequisitesMet: prereqsMet
        };
      });
      
      scoredMissingUnits.sort((a, b) => b.fastestPathScore - a.fastestPathScore);
      
      let regularRecs = scoredMissingUnits.slice(0, 4);
      
      // Add Capstone projects
      const allCandidates = [];
      if (projectARecommendation && projectARecommendation.prerequisitesMet) {
        allCandidates.push(projectARecommendation);
      }
      if (projectBRecommendation && projectBRecommendation.prerequisitesMet) {
        allCandidates.push(projectBRecommendation);
      }
      
      const allScoredCandidates = [...regularRecs, ...allCandidates];
      allScoredCandidates.sort((a, b) => b.fastestPathScore - a.fastestPathScore);
      regularRecs = allScoredCandidates.slice(0, 4);
      
      // Find skipped units
      const allMissingOrdered = [...regularMissingUnits];
      const recommendedCodes = new Set(regularRecs.map(r => r.UnitCode));
      const skipped = allMissingOrdered
        .filter(u => !recommendedCodes.has(u.UnitCode))
        .slice(0, 4)
        .map(unit => ({
          ...unit,
          extractedCode: extractUnitCode(unit.UnitCode),
          semesterDisplay: getSemesterDisplayName(unit)
        }));
      
      setWilRecommendation(wilUnitData);
      setRegularRecommendations(regularRecs);
      setSkippedUnits(skipped);
      
      const remainingToGraduate = regularMissingUnits.length + 
        (projectARecommendation && !projectACompleted ? 1 : 0) +
        (projectBRecommendation && !projectBCompleted ? 1 : 0) +
        (wilUnitData && !wilCompleted ? 1 : 0);
      
      setRecommendations({
        wilRecommendation: wilUnitData,
        regularRecommendations: regularRecs,
        hasWILOption: wilUnitData !== null && wilUnitData.prerequisitesMet,
        totalPlannerUnits: plannerUnits.length,
        totalCompleted: totalUnitsCompleted,
        totalRemaining: remainingToGraduate,
        totalCredits: totalCredits,
        plannerName: planner?.plannerName,
        completedPercent: (totalUnitsCompleted / plannerUnits.length) * 100,
        currentYear: currentYear,
        currentSemester: currentSemester,
        creditsToGraduate: Math.max(0, 300 - totalCredits),
        unitsToGraduate: remainingToGraduate
      });
      
    } catch (error) {
      console.error('Error generating recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 rounded-t-2xl">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-xl">
                <SparklesIcon className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Unit Recommendations</h2>
                <p className="text-emerald-100 text-sm">{recommendations?.plannerName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {/* Modal Body */}
        <div className="p-6">
          
          {/* Student Progress Summary */}
          {studentInfo && (
            <div className="bg-emerald-50 rounded-xl p-4 mb-6 border border-emerald-200">
              <div className="flex items-center gap-2 mb-3">
                <UserGroupIcon className="h-5 w-5 text-emerald-600" />
                <h3 className="font-semibold text-emerald-800">Student Progress</h3>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                <div>
                  <span className="text-gray-500">Student ID:</span>
                  <p className="font-semibold">{studentInfo.studentId}</p>
                </div>
                <div>
                  <span className="text-gray-500">Current Position:</span>
                  <p className="font-semibold text-blue-600">Year {recommendations?.currentYear}, Semester {recommendations?.currentSemester}</p>
                </div>
                <div>
                  <span className="text-gray-500">Completed:</span>
                  <p className="font-semibold text-emerald-600">{recommendations?.totalCompleted}/{recommendations?.totalPlannerUnits} units</p>
                </div>
                <div>
                  <span className="text-gray-500">Credits:</span>
                  <p className="font-semibold text-emerald-600">{recommendations?.totalCredits}/300</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div className="bg-white rounded-lg p-2 text-center">
                  <span className="text-gray-500">Credits Left:</span>
                  <p className="font-bold text-orange-600 text-lg">{recommendations?.creditsToGraduate || 0}</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <span className="text-gray-500">Units Left:</span>
                  <p className="font-bold text-orange-600 text-lg">{recommendations?.unitsToGraduate || 0}</p>
                </div>
              </div>
              
              <div className="border-t border-emerald-200 pt-3">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progress</span>
                  <span>{recommendations?.completedPercent?.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-emerald-200 rounded-full h-2">
                  <div 
                    className="bg-emerald-600 h-2 rounded-full transition-all"
                    style={{ width: `${recommendations?.completedPercent || 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
          
          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <ArrowPathIcon className="h-10 w-10 text-emerald-500 animate-spin mx-auto mb-3" />
              <p className="text-gray-500">Calculating fastest path...</p>
            </div>
          )}
          
          {/* WIL Section */}
          {!loading && recommendations?.hasWILOption && (
            <div className="mb-6">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <BriefcaseIcon className="h-6 w-6 text-orange-600" />
                  <h3 className="font-bold text-orange-800">WIL Internship Available</h3>
                </div>
                
                {recommendations.wilRecommendation && (
                  <div className="border-2 border-orange-300 rounded-xl p-4 bg-white mb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xl font-bold text-orange-800">
                            {recommendations.wilRecommendation.extractedCode}
                          </span>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            Priority: {Math.round(recommendations.wilRecommendation.fastestPathScore)}%
                          </span>
                        </div>
                        {recommendations.wilRecommendation.Name && (
                          <p className="text-sm text-gray-600 mt-1">{recommendations.wilRecommendation.Name}</p>
                        )}
                      </div>
                      <div className="bg-orange-100 rounded-full px-2 py-1">
                        <span className="text-sm font-bold text-orange-700">{recommendations.wilRecommendation.creditPoints} CP</span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-2">{recommendations.wilRecommendation.semesterDisplay}</div>
                    <div className="text-sm text-green-700 bg-green-50 p-2 rounded-lg mt-2">
                      {recommendations.wilRecommendation.statusMessage}
                    </div>
                  </div>
                )}
                
                <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-700">
                  <strong>⚠️ Important:</strong> WIL is a full-time 3-month placement. No other units can be taken this semester.
                </div>
              </div>
            </div>
          )}
          
          {/* Regular Recommendations */}
          {!loading && recommendations && recommendations.regularRecommendations.length > 0 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-gray-800">
                  Recommended Units
                </h3>
                <span className="text-xs text-gray-400">(Fastest path to graduation)</span>
              </div>
              
              {recommendations.hasWILOption && (
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <p className="text-sm text-blue-700">
                    <strong>📌 Alternative:</strong> If not taking WIL, here are your next best options:
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                {recommendations.regularRecommendations.map((unit, idx) => (
                  <div 
                    key={idx} 
                    className={`border-2 rounded-xl p-4 transition-all ${
                      unit.statusType === 'success' 
                        ? 'border-emerald-300 bg-emerald-50' 
                        : 'border-amber-300 bg-amber-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xl font-bold text-gray-800">
                            {unit.extractedCode}
                          </span>
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                            Priority: {Math.round(unit.fastestPathScore)}%
                          </span>
                          {unit.Type === 'Core' && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Core</span>
                          )}
                          {unit.UnitCode === 'COS40005' && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Capstone A</span>
                          )}
                          {unit.UnitCode === 'COS40006' && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">GRADUATION!</span>
                          )}
                        </div>
                        {unit.Name && (
                          <p className="text-sm text-gray-600 mt-1">{unit.Name}</p>
                        )}
                      </div>
                      <div className="bg-white rounded-full px-2 py-1 ml-2">
                        <span className="text-sm font-bold text-emerald-700 flex items-center gap-1">
                          <CreditCardIcon className="h-3 w-3" />
                          {unit.creditPoints} CP
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-500 mb-2">{unit.semesterDisplay}</div>
                    
                    <div className="mb-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span>Graduation Impact</span>
                        <span>{Math.round(unit.fastestPathScore)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-emerald-600 h-1.5 rounded-full"
                          style={{ width: `${unit.fastestPathScore}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div className={`text-sm p-2 rounded-lg ${
                      unit.statusType === 'success' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {unit.statusMessage}
                    </div>
                    
                    {!unit.prerequisitesMet && unit.Prerequisites && unit.Prerequisites !== 'Nil' && (
                      <div className="text-xs text-amber-600 mt-2">
                        <strong>Required:</strong> {unit.Prerequisites}
                      </div>
                    )}
                    
                    {unit.UnitCode === 'COS40005' && unit.prerequisitesMet && (
                      <div className="text-xs text-purple-600 mt-2">
                        📌 After this, take Capstone Project B in Semester 2 (GRADUATION!)
                      </div>
                    )}
                    
                    {unit.UnitCode === 'COS40006' && unit.prerequisitesMet && (
                      <div className="text-xs text-yellow-600 mt-2 font-semibold">
                        🎓 FINAL UNIT - Complete to graduate!
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {skippedUnits.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 mt-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <ClockIcon className="h-4 w-4 text-gray-500" />
                    <h4 className="font-semibold text-gray-600 text-sm">Next in Line</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {skippedUnits.map((unit, idx) => (
                      <span key={idx} className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                        {unit.extractedCode}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* No Recommendations */}
          {!loading && recommendations && recommendations.regularRecommendations.length === 0 && !recommendations?.hasWILOption && (
            <div className="text-center py-12">
              <div className="bg-emerald-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <CheckCircleIcon className="h-10 w-10 text-emerald-600" />
              </div>
              <p className="text-gray-700 text-lg font-medium">🎓 Congratulations!</p>
              <p className="text-gray-500 mt-2">You have completed all units for graduation!</p>
            </div>
          )}
          
          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center">
            <p className="text-xs text-gray-400">
              ✅ Only units from this study planner with prerequisites met
            </p>
            <button
              onClick={onClose}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2 rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnitRecommendations;