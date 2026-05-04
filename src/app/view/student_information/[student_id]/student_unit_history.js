'use client';
import React, { useEffect, useState, useRef } from 'react';
import ConfirmPopup from '@components/confirm';
import UnitDB from '@app/class/Unit/UnitDB';
import UnitTermOfferedDB from '@app/class/UnitTermOffered/UnitTermOfferedDB';
import UnitRequisitesDisplay from '@app/view/unit/unit_requisite_display';
import TermDB from '@app/class/Term/termDB';
import { useRouter } from 'next/navigation';
import StudentDB from '@app/class/Student/StudentsDB';
import CourseIntakeDB from '@app/class/CourseIntake/CourseIntakeDB';
import StudentUnitHistoryUploader from './HistoryFileUploader'; // IMPORT UPLOADER
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import LoadingSpinner from '@components/LoadingSpinner';
import { useLightDarkMode } from '@app/context/LightDarkMode';

export default function StudentUnitHistory({ studentDetails, unitHistory, studentId, refreshStudentDetails, formMode = "READ" }) {
	const { theme } = useLightDarkMode();
	const [openUnitForm, setOpenUnitForm] = useState(false);
	const [selectedUnitIndex, setSelectedUnitIndex] = useState(null);
	const [confirmPopup, setConfirmPopup] = useState(null);
	const [units, setUnits] = useState([]);
	const [originalUnits, setOriginalUnits] = useState([]);
	const [unitsOffered, setUnitsOffered] = useState([]);
	const [unitsNotOffered, setUnitsNotOffered] = useState([]);
	const [searchTerm, setSearchTerm] = useState('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [availableTerms, setAvailableTerms] = useState([]);
	const [selectedTermId, setSelectedTermId] = useState(null);
	const [loadingUnits, setLoadingUnits] = useState(false);
	const [termsError, setTermsError] = useState(null);
	const [currentYear, setCurrentYear] = useState(1);
	const [studentIntakeTerm, setStudentIntakeTerm] = useState(null);
	const [showImportUploader, setShowImportUploader] = useState(false); // STATE FOR UPLOADER MODAL
	const [pendingImportData, setPendingImportData] = useState(null); // NEW STATE FOR STAGED IMPORT DATA
	const [importMode, setImportMode] = useState(null); // NEW STATE TO TRACK IMPORT MODE
	const [allTerms, setAllTerms] = useState([]); // NEW STATE TO HOLD ALL TERMS
	const router = useRouter();

	const modalRef = useRef(null);

	const handleBackdropClick = (e) => {
		if (e.target === e.currentTarget) {
			setOpenUnitForm(false)
		}
	};

	const isViewMode = formMode === "READ";

	// Track changes
	useEffect(() => {
		// Always check for changes, even if originalUnits is empty
		const hasChanged = !deepEqual(units, originalUnits) || pendingImportData !== null;
		setHasChanges(hasChanged);
	}, [units, originalUnits, pendingImportData]);

	// Deep comparison helper function
	const deepEqual = (a, b) => {
		if (a === b) return true;
		if (!a || !b) return false;
		if (typeof a !== 'object' || typeof b !== 'object') return false;

		const keysA = Object.keys(a);
		const keysB = Object.keys(b);

		if (keysA.length !== keysB.length) return false;

		return keysA.every(key => {
			if (key === 'unit' || key === 'term') {
				return deepEqual(a[key], b[key]);
			}
			return a[key] === b[key];
		});
	};

	// Helper to map term names to month numbers
	const getMonthFromTermName = (name) => {
		if (!name) return 99;
		const lower = name.toLowerCase();
		if (lower.includes('jan')) return 1;
		if (lower.includes('feb')) return 2;
		if (lower.includes('mar')) return 3;
		if (lower.includes('apr')) return 4;
		if (lower.includes('may')) return 5;
		if (lower.includes('jun')) return 6;
		if (lower.includes('jul')) return 7;
		if (lower.includes('aug')) return 8;
		if (lower.includes('sep')) return 9;
		if (lower.includes('oct')) return 10;
		if (lower.includes('nov')) return 11;
		if (lower.includes('dec')) return 12;
		return 99;
	};

	// Helper to get month from term object, falling back to getMonthFromTermName
	const getMonth = (term) => {
		if (!term) return 99;
		return term.Month !== undefined ? Number(term.Month) : getMonthFromTermName(term.Name);
	};

	// Group units by year based on term count and ensure same term is always in the same year
	const groupUnitsByYear = (unitsList) => {
		const getSemesterInfo = (term) => {
			if (!term) return { type: 'none', order: 99 };
			const name = term.Name.toLowerCase();
			if (name.includes('long')) return { type: 'long', order: 1 };
			if (name.includes('winter')) return { type: 'short', order: 2 };
			if (name.includes('s1')) return { type: 'long', order: 1 };
			if (name.includes('s2')) return { type: 'long', order: 3 };
			return { type: 'short', order: 2 };
		};

		// Enhanced sorting: year, month, term name, unit code, unit name
		const sortedUnits = [...unitsList].sort((a, b) => {
			if (!a.term && !b.term) return 0;
			if (!a.term) return 1;
			if (!b.term) return -1;

			// Sort by term year
			if (a.term.Year !== b.term.Year) {
				return a.term.Year - b.term.Year;
			}

			// Sort by term month (as number, with fallback)
			if (getMonth(a.term) !== getMonth(b.term)) {
				return getMonth(a.term) - getMonth(b.term);
			}

			// Sort by term name (to distinguish e.g. JAN_SUMMER vs JAN_LONG)
			if ((a.term.Name || '').localeCompare(b.term.Name || '') !== 0) {
				return (a.term.Name || '').localeCompare(b.term.Name || '');
			}

			// Sort by unit code
			if ((a.unit?.UnitCode || '').localeCompare(b.unit?.UnitCode || '') !== 0) {
				return (a.unit?.UnitCode || '').localeCompare(b.unit?.UnitCode || '');
			}

			// Sort by unit name
			return (a.unit?.Name || '').localeCompare(b.unit?.Name || '');
		});

		const termToYear = {};
		let currentYear = 1;
		let yearsTerms = {};
		yearsTerms[currentYear] = { long: 0, short: 0, terms: new Set() };

		sortedUnits.forEach(unit => {
			if (unit.term) {
				const termKey = unit.term.ID;
				if (termToYear[termKey]) {
					unit.Year = termToYear[termKey];
					unit.year = termToYear[termKey];
				} else {
					const semesterInfo = getSemesterInfo(unit.term);
					const yearTerms = yearsTerms[currentYear];
					const alreadyHasTerm = yearTerms.terms.has(termKey);
					const wouldExceedLong = semesterInfo.type === 'long' && !alreadyHasTerm && yearTerms.long >= 2;
					const wouldExceedShort = semesterInfo.type === 'short' && !alreadyHasTerm && yearTerms.short >= 2;
					if (wouldExceedLong || wouldExceedShort) {
						currentYear++;
						yearsTerms[currentYear] = { long: 0, short: 0, terms: new Set() };
					}
					termToYear[termKey] = currentYear;
					unit.Year = currentYear;
					unit.year = currentYear;
					yearsTerms[currentYear].terms.add(termKey);
					if (semesterInfo.type === 'long') {
						yearsTerms[currentYear].long++;
					} else if (semesterInfo.type === 'short') {
						yearsTerms[currentYear].short++;
					}
				}
			} else {
				unit.Year = 0;
				unit.year = 0;
			}
		});

		const grouped = {};
		sortedUnits.forEach(unit => {
			const y = unit.Year || 0;
			if (!grouped[y]) grouped[y] = [];
			grouped[y].push(unit);
		});

		return Object.fromEntries(
			Object.entries(grouped).sort(([a], [b]) => parseInt(a) - parseInt(b))
		);
	};

	// Move fetchTerms out of useEffect so it can be called directly
	const fetchTerms = async () => {
		try {
			setLoading(true);
			// Enable logging to debug issues

			// Order by Year (descending) and then by Month (ascending)
			const termsResponse = await TermDB.FetchTerms({
				order_by: [
					{ column: 'Year', ascending: false },
					{ column: 'Month', ascending: true }
				]
			});

			// Check if the response has a data property (Supabase style)
			const terms = termsResponse.data || termsResponse;

			if (terms && terms.length > 0) {
				console.log('terms', terms)
				setAllTerms(terms);
				// Filter out terms with missing data
				const validTerms = terms.filter(term => {
					// Normalize the term object structure based on what's in your database
					// In Supabase, fields might be prefixed with underscores
					const id = term.ID || term._id || term.id;
					const name = term.Name || term._name || term.name;
					const year = term.Year || term._year || term.year;

					return id && name && year;
				});

				if (validTerms.length > 0) {
					// Normalize term objects to ensure consistent structure
					const normalizedTerms = validTerms.map(term => ({
						ID: term.ID || term._id || term.id,
						Name: term.Name || term._name || term.name,
						Year: term.Year || term._year || term.year,
						Month: term.Month !== undefined ? Number(term.Month) : getMonthFromTermName(term.Name || term._name || term.name),
						Status: term.Status || term._status || term.status
					}));

					setAvailableTerms(normalizedTerms);
					// No default term is set here
				} else {
					console.error('No valid terms found with complete data');
					setTermsError('No valid terms found with complete data');
				}
			} else {
				console.error('No terms returned from database');
				setTermsError('No terms returned from database');
			}
		} catch (error) {
			console.error('Error fetching terms:', error);
			setTermsError(`Error fetching terms: ${error.message}`);
		} finally {
			setLoading(false);
		}
	};

	// Replace the useEffect for fetching terms
	useEffect(() => {
		fetchTerms();
	}, []);

	// Helper to generate a temporary unique id for new units
	const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

	//TODO: Commented by i think its redundant?? But then if unit history some how fail randomly just uncomment this
	// Fetch student's unit history when terms are loaded
	// useEffect(() => {
	// 	// if (pendingImportData) return; // Skip fetch if import is staged
	// 	if (!studentDetails || availableTerms.length === 0) return;

	// 	const fetchStudentUnitHistory = async () => {
	// 		try {
	// 			setLoading(true);
	// 			const response = await SecureFrontendAuthHelper.authenticatedFetch(`/api/student_unit_history?studentId=${studentDetails.StudentID}`);

	// 			if (response.ok) {
	// 				const data = await response.json();
	// 				const formattedUnits = (data.units || []).map(u => ({
	// 					id: u.ID || u.id || generateTempId(), // Use DB id or generate one
	// 					unit: u.Unit
	// 						? {
	// 							UnitCode: u.Unit.UnitCode,
	// 							Name: u.Unit.Name,
	// 							CreditPoints: u.Unit.CreditPoints
	// 						}
	// 						: null,
	// 					status: u.Status || 'current', // CHANGED FROM 'In Progress' TO 'current'
	// 					term: u.Term
	// 						? {
	// 							ID: u.Term.ID,
	// 							Name: u.Term.Name,
	// 							Year: u.Term.Year
	// 						}
	// 						: null,
	// 					Year: u.Year || u.CompletedYear,
	// 					year: u.Year || u.CompletedYear
	// 				}));
	// 				setUnits(formattedUnits);
	// 				setOriginalUnits(formattedUnits);
	// 			} else {
	// 				setUnits([]);
	// 				setOriginalUnits([]);
	// 			}
	// 		} catch (error) {
	// 			console.error('Error fetching student unit history:', error);
	// 			setUnits([]);
	// 			setOriginalUnits([]);
	// 		} finally {
	// 			setLoading(false);
	// 		}
	// 	};



	// 	if (!pendingImportData) {
	// 		fetchStudentUnitHistory();
	// 	}
	// 	// fetchStudentUnitHistory();
	// }, [pendingImportData]);

	useEffect(() => {
		if (unitHistory) {
			if (unitHistory.length > 0) {
				const formattedUnits = (unitHistory || []).map(u => ({
					id: u.ID || u.id || generateTempId(), // Use DB id or generate one
					unit: u.Unit
						? {
							UnitID: u.Unit.ID,
							UnitCode: u.Unit.UnitCode,
							Name: u.Unit.Name,
							CreditPoints: u.Unit.CreditPoints
						}
						: null,
					status: u.Status || 'current', // CHANGED FROM 'In Progress' TO 'current'
					term: u.Term
						? {
							ID: u.Term.ID,
							Name: u.Term.Name,
							Year: u.Term.Year
						}
						: null,
					Year: u.Year || u.CompletedYear,
					year: u.Year || u.CompletedYear
				}));
				setUnits(formattedUnits);
				setOriginalUnits(formattedUnits);
			} else {
				setUnits([]);
				setOriginalUnits([]);
			}
		}
	}, [unitHistory])


	// useEffect(() => {
	// 	setLoading(true);
	// 	if (!studentDetails || availableTerms.length === 0) return;

	// 	if (unitHistory && unitHistory.length > 0) {
	// 		const formattedUnits = (unitHistory || []).map(u => ({
	// 			id: u.ID || u.id || generateTempId(), // Use DB id or generate one
	// 			unit: u.Unit
	// 				? {
	// 					UnitCode: u.Unit.UnitCode,
	// 					Name: u.Unit.Name,
	// 					CreditPoints: u.Unit.CreditPoints
	// 				}
	// 				: null,
	// 			status: u.Status || 'current', // CHANGED FROM 'In Progress' TO 'current'
	// 			term: u.Term
	// 				? {
	// 					ID: u.Term.ID,
	// 					Name: u.Term.Name,
	// 					Year: u.Term.Year
	// 				}
	// 				: null,
	// 			Year: u.Year || u.CompletedYear,
	// 			year: u.Year || u.CompletedYear
	// 		}));
	// 		setUnits(formattedUnits);
	// 		setOriginalUnits(formattedUnits);
	// 	} else {
	// 		setUnits([]);
	// 		setOriginalUnits([]);
	// 	}
	// 	setLoading(false);

	// }, [studentDetails]);

	// Fetch all available units from UnitDB
	const fetchUnits = async () => {
		try {
			setLoadingUnits(true);

			// Get all units without term filtering
			const units = await UnitDB.FetchUnits({
				order_by: [{ column: 'UnitCode', ascending: true }]
			});

			console.log('units', units.data)

			if (units.success) {
				// const unit_code_offered = units_offered.data.map(unit => unit._unit_code);
				// const units_offered_obj = units.data.filter(unit => unit_code_offered.includes(unit._unit_code));
				setUnitsNotOffered(units.data.filter(unit => unit.offered_terms.length == 0));
				setUnitsOffered(units.data.filter(unit => unit.offered_terms.length > 0));
			} else {
				setUnitsNotOffered(units.data || []);
				setUnitsOffered([]);
			}
		} catch (error) {
			console.error('Error fetching units:', error);
			setUnitsOffered([]);
			setUnitsNotOffered([]);
		} finally {
			setLoadingUnits(false);
		}
	};

	useEffect(() => {
		if (openUnitForm) {
			fetchUnits();
		}
	}, [openUnitForm]);

	const filteredUnits = [...unitsOffered, ...unitsNotOffered]
		.filter(unit =>
			unit._unit_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			unit._name?.toLowerCase().includes(searchTerm.toLowerCase())
		)
		.sort((a, b) => {
			// First sort by availability (Offered first, then Not Offered)
			const aIsOffered = unitsOffered.some(offeredUnit => offeredUnit._unit_code === a._unit_code);
			const bIsOffered = unitsOffered.some(offeredUnit => offeredUnit._unit_code === b._unit_code);

			if (aIsOffered !== bIsOffered) {
				return aIsOffered ? -1 : 1;
			}

			// Then sort by unit code
			return a._unit_code.localeCompare(b._unit_code);
		});

	const handleUnitForm = (unitIndex) => {
		setOpenUnitForm(true);
		setSelectedUnitIndex(unitIndex);
		setSearchTerm(''); // Reset search query when opening the form
	};

	const handleAddUnit = () => {
		if (isViewMode) return;
		const newUnit = {
			id: generateTempId(),
			unit: null,
			status: 'current', // CHANGED FROM 'In Progress' TO 'current'
			term: null,
			Year: currentYear,
			year: currentYear
		};
		setUnits(prevUnits => [...prevUnits, newUnit]);
		setSelectedUnitIndex(null);
	};

	const handleStatusChange = (index, newStatus) => {
		if (isViewMode || !units[index].unit) return;
		const updatedUnits = units.map((unit, i) => {
			if (i === index) {
				return {
					...unit,
					status: newStatus
				};
			}
			return unit;
		});
		setUnits(updatedUnits);
	};

	const onUnitSelect = (selectedUnit) => {
		try {
			// Check if the unit is offered in any term
			const isOffered = unitsOffered.some(offeredUnit => offeredUnit._unit_code === selectedUnit._unit_code);

			// Check if unit is already in the student's history
			const existingUnit = units.find(
				unit => unit.unit && unit.unit.UnitCode === selectedUnit._unit_code && unit.status !== 'fail'
			);

			if (existingUnit) {
				// If the unit exists and is not failed, show the "already added" message
				setConfirmPopup({
					show: true,
					title: "Unit Already Added",
					message: `The unit ${selectedUnit._unit_code} (${selectedUnit._name}) is already in your draft.`,
					onConfirm: () => setConfirmPopup({ show: false }),
					confirmText: "OK"
				});
				return;
			}

			if (!isOffered) {
				// If unit is not offered, show confirmation
				setConfirmPopup({
					show: true,
					title: "Unit Not Offered",
					message: `The unit ${selectedUnit._unit_code} (${selectedUnit._name}) is not currently offered in any term. Are you sure you want to add this unit?`,
					onConfirm: () => processUnitSelection(selectedUnit),
					confirmText: "Yes, Add Unit"
				});
				return;
			}

			// If unit is offered and not already added (or failed), proceed normally
			processUnitSelection(selectedUnit);
		} catch (error) {
			console.error('Error in onUnitSelect:', error);
		}
	};

	const processUnitSelection = (selectedUnit) => {
		console.log('selectedUnit', selectedUnit)
		// Check if there is a failed attempt for this unit
		const hasFailedBefore = units.some(
			unit => unit.unit && unit.unit.UnitCode === selectedUnit._unit_code && unit.status === 'fail'
		);

		const defaultStatus = hasFailedBefore ? 'pass' : 'current'; // CHANGED FROM 'In Progress' TO 'current'

		if (selectedUnitIndex !== null && units[selectedUnitIndex] && !units[selectedUnitIndex].unit) {
			// Fill the empty row by id
			const updatedUnits = units.map((unit, index) => {
				if (index === selectedUnitIndex) {
					return {
						...unit,
						unit: {
							UnitID: selectedUnit._id,
							UnitCode: selectedUnit._unit_code,
							Name: selectedUnit._name,
							CreditPoints: selectedUnit._credit_points
						},
						status: defaultStatus,
						Year: currentYear,
						year: currentYear
					};
				}
				return unit;
			});
			console.log('updatedUnits', updatedUnits)
			setUnits(updatedUnits);
		} else {
			// Always add a new row (retake or new unit)
			const newUnit = {
				id: generateTempId(),
				unit: {
					UnitCode: selectedUnit._unit_code,
					Name: selectedUnit._name,
					CreditPoints: selectedUnit._credit_points
				},
				status: defaultStatus,
				term: null,
				Year: currentYear,
				year: currentYear
			};
			setUnits(prevUnits => [...prevUnits, newUnit]);
		}
		setOpenUnitForm(false);
		setSelectedUnitIndex(null);
	};

	const handleRemoveUnit = async (id) => {
		if (isViewMode) return;
		const result = await window.Swal.fire({
			title: 'Remove Unit',
			text: 'Are you sure you want to remove this unit?',
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#d33',
			cancelButtonColor: '#aaa',
			confirmButtonText: 'Remove',
			cancelButtonText: 'Cancel'
		});
		if (result.isConfirmed) {
			const updatedUnits = units.filter((unit) => unit.id !== id);
			setUnits(updatedUnits);
		}
	};

	// NEW FUNCTION: HANDLE STAGED IMPORT DATA
	const handleDataStaged = async (importedUnits, mode) => {
		try {
			console.log('Processing staged import data:', importedUnits);
			console.log('Available terms for matching:', availableTerms.map(t => `${t.Name} (${t.Year})`));

			// Fetch full unit details for imported units
			const enrichedUnits = await Promise.all(
				importedUnits.map(async (importUnit) => {
					try {
						// FIXED: FETCH BY UNIT CODE, NOT ID (since imported IDs can be invalid like -1)
						const unitResponse = await UnitDB.FetchUnits({
							code: importUnit.unit.UnitCode, // Fetch by unit code
							return: ['UnitCode', 'Name', 'CreditPoints', 'ID']
						});

						console.log(`Fetching unit details for ${importUnit.unit.UnitCode}:`, unitResponse);

						if (unitResponse.success && unitResponse.data.length > 0) {
							const fullUnit = unitResponse.data[0];
							importUnit.unit = {
								UnitID: fullUnit.id,
								UnitCode: fullUnit._unit_code,
								Name: fullUnit._name,
								CreditPoints: fullUnit._credit_points
							};
							console.log(`Enriched unit ${importUnit.unit.UnitCode} with name: ${fullUnit._name}, credits: ${fullUnit._credit_points}`);
						} else {
							console.warn(`Could not find unit details for ${importUnit.unit.UnitCode}`);
							// Keep the original data but set a default name
							importUnit.unit.Name = importUnit.unit.UnitCode; // Fallback to unit code
							importUnit.unit.CreditPoints = null;
						}

						// IMPROVED TERM MATCHING LOGIC
						if (importUnit.term && importUnit.term.ID) {
							// Already a term object, use as is
							// No rematching needed
						} else if (importUnit.termName && availableTerms.length > 0) {
							console.log(`Trying to match term: "${importUnit.termName}" from available terms:`, availableTerms.map(t => t.Name));

							// Extract year and semester information from term name
							const termInput = importUnit.termName.toLowerCase();
							const yearMatch = importUnit.termName.match(/(\d{4})/);
							const year = yearMatch ? parseInt(yearMatch[1]) : null;

							// Try multiple matching strategies
							let matchedTerm = null;

							// Strategy 1: Exact match
							matchedTerm = availableTerms.find(term =>
								term.Name.toLowerCase() === termInput
							);

							// Strategy 2: Contains match (both ways)
							if (!matchedTerm) {
								matchedTerm = availableTerms.find(term =>
									term.Name.toLowerCase().includes(termInput) ||
									termInput.includes(term.Name.toLowerCase())
								);
							}

							// Strategy 3: Year and semester type matching
							if (!matchedTerm && year) {
								// Look for terms in the same year
								const sameYearTerms = availableTerms.filter(term => term.Year === year);

								if (termInput.includes('s1') || termInput.includes('sem1') || termInput.includes('semester 1')) {
									matchedTerm = sameYearTerms.find(term =>
										term.Name.toLowerCase().includes('s1') ||
										term.Name.toLowerCase().includes('semester 1') ||
										term.Name.toLowerCase().includes('sem 1')
									);
								} else if (termInput.includes('s2') || termInput.includes('sem2') || termInput.includes('semester 2')) {
									matchedTerm = sameYearTerms.find(term =>
										term.Name.toLowerCase().includes('s2') ||
										term.Name.toLowerCase().includes('semester 2') ||
										term.Name.toLowerCase().includes('sem 2')
									);
								}
							}

							if (matchedTerm) {
								importUnit.term = {
									ID: matchedTerm.ID,
									Name: matchedTerm.Name,
									Year: matchedTerm.Year
								};
								console.log(`Successfully matched term "${importUnit.termName}" to "${matchedTerm.Name}"`);
							} else {
								console.warn(`Could not match term "${importUnit.termName}" to any available term`);
								importUnit.term = null;
							}
						}

						return importUnit;
					} catch (error) {
						console.error(`Error enriching unit ${importUnit.unit.UnitCode}:`, error);
						return importUnit; // Return as-is if enrichment fails
					}
				})
			);

			// Handle different import modes
			if (mode === 'replace') {
				// Replace all existing units with imported ones
				setUnits(enrichedUnits);
				setPendingImportData({ mode: 'replace', units: enrichedUnits });
				setImportMode('replace');
				await fetchTerms(); // <-- Refetch terms after import
				// Re-link imported units' term to the object in availableTerms
				const relinkedUnits = enrichedUnits.map(unit => {
					if (unit.term && unit.term.ID) {
						const matchedTerm = availableTerms.find(t => String(t.ID) === String(unit.term.ID));
						if (matchedTerm) {
							return { ...unit, term: matchedTerm };
						}
					}
					return unit;
				});
				setUnits(relinkedUnits);
				setPendingImportData({ mode: 'replace', units: relinkedUnits });
			} else {
				// Add mode - merge with existing units
				const combinedUnits = [...units];

				enrichedUnits.forEach(importUnit => {
					// Check if unit already exists (by unit code and term ID)
					const exists = combinedUnits.some(
						existing =>
							existing.unit?.UnitCode === importUnit.unit.UnitCode &&
							(existing.term?.ID || existing.termID) === (importUnit.term?.ID || importUnit.termID)
					);

					if (!exists) {
						// Only new units get isImported: true
						combinedUnits.push({ ...importUnit, isImported: true });
					}
					// Do NOT update or overwrite existing units
				});

				// Remove isImported from all existing units
				const cleanedUnits = combinedUnits.map(unit =>
					unit.isImported ? unit : { ...unit, isImported: false }
				);

				setUnits(cleanedUnits);
				const newUnits = cleanedUnits.filter(u => u.isImported);
				setPendingImportData({ mode: 'add', units: newUnits });
				setImportMode('add');
				await fetchTerms(); // <-- Refetch terms after import
				// Re-link imported units' term to the object in availableTerms
				const relinkedUnits = cleanedUnits.map(unit => {
					if (unit.term && unit.term.ID) {
						const matchedTerm = availableTerms.find(t => String(t.ID) === String(unit.term.ID));
						if (matchedTerm) {
							return { ...unit, term: matchedTerm };
						}
					}
					return unit;
				});
				setUnits(relinkedUnits);
				const relinkedNewUnits = relinkedUnits.filter(u => u.isImported);
				setPendingImportData({ mode: 'add', units: relinkedNewUnits });
			}

			console.log('Import data staged successfully');

		} catch (error) {
			console.error('Error processing staged import data:', error);
			setConfirmPopup({
				show: true,
				title: "Import Error",
				message: `Failed to process imported data: ${error.message}`,
				onConfirm: () => setConfirmPopup({ show: false }),
				confirmText: "OK"
			});
		}
	};

	const handleSaveChanges = async () => {
		if (isViewMode) return;
		setSaving(true);

		try {
			//TODO: Maybe something should be done to this? I dont think this is great
			// Validate data before saving
			const invalidUnits = units.filter(unit => unit.unit && !unit.term && unit.status === 'pass');
			if (invalidUnits.length > 0) {
				await window.Swal.fire({
					title: 'Validation Error',
					text: "Some passed units don't have a term assigned. Please assign terms or change their status.",
					icon: 'warning'
				});
				setSaving(false);
				return;
			}

			// IMPROVED VALIDATION: Allow current units without terms, but require terms for pass/fail units
			const incompleteRows = units.filter(unit => {
				if (!unit.unit) return true; // Always require a unit
				if (unit.status === 'current') return false; // Current units don't require terms
				// For pass/fail units, check if term exists OR if it has an ID (existing unit with term from DB)
				if (!unit.term && !unit.id) return true; // New pass/fail units must have terms
				return false;
			});

			if (incompleteRows.length > 0) {
				const missingUnits = incompleteRows.filter(unit => !unit.unit).length;
				const missingTerms = incompleteRows.filter(unit => unit.unit && !unit.term && !unit.id).length;

				let errorMessage = '';
				if (missingUnits > 0) {
					errorMessage += `${missingUnits} rows are missing unit selections. `;
				}
				if (missingTerms > 0) {
					errorMessage += `${missingTerms} new passed/failed units are missing term assignments. `;
				}
				errorMessage += 'Please complete all required fields before saving. (Note: Current units and existing records can be saved without terms)';

				await window.Swal.fire({
					title: 'Validation Error',
					text: errorMessage,
					icon: 'warning'
				});
				setSaving(false);
				return;
			}

			// Prepare the data for saving
			const unitsToSave = units
				.filter(unit => unit.unit !== null)
				.map(unit => {
					const unitData = {
						id: unit.id && !unit.id.toString().startsWith('temp_') ? unit.id : undefined,
						unitCode: unit.unit.UnitCode,
						status: unit.status || 'current',
						termId: unit.term?.ID || null,
						year: parseInt(unit.Year || currentYear, 10)
					};

					// Only include unitID if it exists and is valid
					if (unit.unit?.UnitID && !isNaN(parseInt(unit.unit.UnitID))) {
						unitData.unitID = parseInt(unit.unit.UnitID);
					}

					return unitData;
				});

			if (unitsToSave.length === 0) {
				const result = await window.Swal.fire({
					title: "No Units to Save",
					text: "This will remove all unit history for this student. Continue?",
					icon: "warning",
					showCancelButton: true,
					confirmButtonText: "Yes, remove all",
					cancelButtonText: "Cancel"
				});
				if (!result.isConfirmed) {
					setSaving(false);
					return;
				}
			}

			// Make a single API call to save all units
			const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/students/student_unit_history', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					studentId: studentId,
					units: unitsToSave
				})
			});

			const result = await response.json();

			if (response.ok && result.success) {
				const updatedUnits = units.map(unit => ({ ...unit, isImported: false }));
				setOriginalUnits(updatedUnits);
				setHasChanges(false);

				// Clear pending import data after successful save
				setPendingImportData(null);
				setImportMode(null);

				await window.Swal.fire({
					title: 'Success',
					text: 'Your unit history has been saved successfully.',
					icon: 'success',
					confirmButtonText: 'OK'
				});
				// Refresh the student details (including Credits Completed)
				if (refreshStudentDetails) {
					await refreshStudentDetails();
				}
				// Refresh the whole page
				// router.refresh();
			} else {
				throw new Error(result.error || result.message || 'Failed to save unit history');
			}
		} catch (error) {
			console.error('Error saving unit history:', error);
			setConfirmPopup({
				show: true,
				title: "Error",
				message: error.message || "Failed to save unit history. Please try again.",
				onConfirm: () => setConfirmPopup({ show: false }),
				confirmText: "OK"
			});
		} finally {
			setSaving(false);
		}
	};

	const handleCancelChanges = async () => {
		if (isViewMode) return;
		const result = await window.Swal.fire({
			title: 'Cancel Changes',
			text: 'Are you sure you want to discard all your changes?',
			icon: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#d33',
			cancelButtonColor: '#aaa',
			confirmButtonText: 'Discard Changes',
			cancelButtonText: 'Cancel'
		});
		if (result.isConfirmed) {
			setUnits(originalUnits.map(unit => ({ ...unit, isImported: false })));
			setHasChanges(false);
			// CLEAR PENDING IMPORT DATA
			setPendingImportData(null);
			setImportMode(null);
		}
	};

	// Debug panel to show term data 
	const renderDebugInfo = () => {
		if (!termsError) return null;

		return (
			<div className="bg-red-50 border border-red-200 text-red-800 p-4 mb-4 rounded">
				<h3 className="font-bold">Term Loading Error:</h3>
				<p>{termsError}</p>
				<p>Terms available: {availableTerms.length}</p>
				{availableTerms.length > 0 && (
					<details>
						<summary className="cursor-pointer">Show Terms Data</summary>
						<pre className="mt-2 bg-gray-100 p-2 rounded text-xs overflow-auto">
							{JSON.stringify(availableTerms, null, 2)}
						</pre>
					</details>
				)}
			</div>
		);
	};

	// Update the term selection in the table
	const handleTermChange = (index, termId) => {
		if (isViewMode) return;
		console.log('Term Change:', {
			index,
			termId,
			currentTerm: units[index].term
		});

		const updatedUnits = units.map((unit, i) => {
			if (i === index) {
				if (termId === '') {
					return {
						...unit,
						term: null
					};
				} else {
					const selectedTerm = availableTerms.find(t => t.ID.toString() === termId);
					if (selectedTerm) {
						return {
							...unit,
							term: {
								ID: selectedTerm.ID,
								Name: selectedTerm.Name,
								Year: selectedTerm.Year
							}
						};
					}
				}
			}
			return unit;
		});

		const regroupedUnits = Object.values(groupUnitsByYear(updatedUnits)).flat();
		console.log('Updated Units after term change:', regroupedUnits);
		setUnits(regroupedUnits);
	};

	// Calculate total credits completed for passed units - UPDATED TO USE CORRECT STATUS
	// Separates MPU credits from regular credits
	const calculateCreditsCompleted = () => {
		const passedUnits = units.filter(unit => unit.status === 'pass' && unit.unit && unit.unit.CreditPoints);

		const regularCredits = passedUnits
			.filter(unit => !unit.unit.UnitCode.startsWith('MPU'))
			.reduce((sum, unit) => sum + Number(unit.unit.CreditPoints), 0);

		const mpuCredits = passedUnits
			.filter(unit => unit.unit.UnitCode.startsWith('MPU'))
			.reduce((sum, unit) => sum + Number(unit.unit.CreditPoints), 0);

		return {
			regularCredits,
			mpuCredits,
			totalCredits: regularCredits + mpuCredits
		};
	};

	// Fetch student's intake term when terms are loaded
	useEffect(() => {
		setStudentIntakeTerm(studentDetails.TermID);
	}, [studentId]);

	// Filter terms based on student's intake
	const getFilteredTerms = () => {
		const currentDate = new Date();
		const currentYear = currentDate.getFullYear();
		// Month is 0-indexed in JavaScript (0=Jan, 11=Dec), so we add 1 for comparison
		const currentMonth = currentDate.getMonth() + 1; 
	
		// Handle initial edge cases
		if (!studentIntakeTerm || !availableTerms.length) return availableTerms;
	
		// Find the student's intake term object (assuming studentIntakeTerm is the ID)
		const intakeTerm = availableTerms.find(term => term.ID === studentIntakeTerm);
		if (!intakeTerm) return availableTerms;
		
		console.log('Intake Term:', intakeTerm);
		console.log(`Current Date Cap: ${currentYear}-${currentMonth}`);
	
		const filteredTerms = availableTerms
			.filter(term => {
				
				// --- 1. Intake Term Check (Must be >= Intake Term) ---
				
				// If the term year is before the intake year, discard it.
				if (term.Year < intakeTerm.Year) {
					return false;
				}
				// If the year is the same, but the month is before the intake month, discard it.
				if (term.Year === intakeTerm.Year && term.Month < intakeTerm.Month) {
					return false;
				}
				
				// --- 2. Current Date Check (Must be <= Current Date) ---
				// If the term year is after the current year, discard it.
				if (term.Year > currentYear) {
					return false; 
				}
				
				// If the year is the same, but the month is after the current month, discard it.
				if (term.Year === currentYear && term.Month > currentMonth) {
					return false;
				}
	
				// If the term passes both checks, keep it.
				return true;
			})
			.sort((a, b) => {
				// Sort in DESCENDING order (newest terms first)
				
				// First sort by year (descending)
				if (b.Year !== a.Year) {
					return b.Year - a.Year;
				}
				// If same year, sort by month (descending)
				return b.Month - a.Month;
			});
	
		return filteredTerms;
	};

	// REMOVED THE OLD handleImportSuccess FUNCTION SINCE WE'RE USING handleDataStaged NOW

	if (loading) {
		return (
			<LoadingSpinner
				size="medium"
				color="primary"
				text="Loading unit history..."
				fullScreen={false}
			/>
		);
	}

	return (
		<div className={`relative ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
			{/* Debug Info panel */}
			{renderDebugInfo()}

			{/* NEW: SHOW PENDING IMPORT STATUS */}
			{pendingImportData && (
				<div className={`mb-4 p-3 sm:p-4 rounded-lg ${theme === 'dark' ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-yellow-50 border border-yellow-200'}`}>
					<div className="flex items-start sm:items-center mb-2">
						<svg className={`w-5 h-5 mr-2 flex-shrink-0 mt-0.5 sm:mt-0 ${theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
						<h3 className={`font-medium text-sm sm:text-base ${theme === 'dark' ? 'text-yellow-300' : 'text-yellow-800'}`}>
							Import Data Staged ({importMode === 'replace' ? 'First Time Import Mode' : 'Update Import Mode'})
						</h3>
					</div>
					<p className={`text-xs sm:text-sm ${theme === 'dark' ? 'text-yellow-200' : 'text-yellow-700'}`}>
						{importMode === 'add'
							? `${pendingImportData.units.filter(u => u.isImported).length} unit records have been staged for import. `
							: `${pendingImportData.units.length} unit records have been staged for import.`
						}
						Click "Save Unit History" to persist these changes to the database, or "Cancel Changes" to discard them.
					</p>
				</div>
			)}

			{/* Action buttons for save/cancel/import - only show in edit mode */}
			{!isViewMode && (
				<div className="mb-4 flex flex-col sm:flex-row justify-between gap-3">
					{/* LEFT SIDE: Import button */}
					<button
						onClick={() => setShowImportUploader(true)}
						className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center justify-center gap-2 w-full sm:w-auto"
					>
						<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
						</svg>
						Import Unit History
					</button>

					{/* RIGHT SIDE: Save/Cancel buttons */}
					<div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
						<button
							onClick={handleCancelChanges}
							disabled={!hasChanges || saving}
							className={`px-4 py-2 rounded-md w-full sm:w-auto ${hasChanges && !saving
								? theme === 'dark'
									? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
									: 'bg-gray-200 hover:bg-gray-300 text-gray-800'
								: theme === 'dark'
									? 'bg-gray-800 text-gray-500 cursor-not-allowed'
									: 'bg-gray-100 text-gray-400 cursor-not-allowed'
								}`}
						>
							Cancel Changes
						</button>
						<button
							onClick={handleSaveChanges}
							disabled={!hasChanges || saving}
							className={`px-4 py-2 rounded-md w-full sm:w-auto ${hasChanges && !saving
								? 'bg-blue-600 hover:bg-blue-700 text-white'
								: theme === 'dark'
									? 'bg-blue-900 text-gray-400 cursor-not-allowed'
									: 'bg-blue-300 text-white cursor-not-allowed'
								}`}
						>
							{saving ? 'Saving...' : 'Save Unit History'}
						</button>
					</div>
				</div>
			)}

			{/* Add Unit Button (only in edit mode) */}
			{!isViewMode && (
				<button
					onClick={handleAddUnit}
					className={`w-full font-bold text-white py-2 text-base transition-colors mb-2 rounded-md ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-600 hover:bg-gray-500'}`}
					title="Add Unit"
				>
					Add Unit <span className="text-lg align-middle">➕</span>
				</button>
			)}
			{/* THIS PART IS WHERE IT WILL SHOW THE UNIT HISTORY TABLE */}
			<div className="listing-body-overflow">
				<table className="unit-history-divider">
					<thead className="listing-unit-table">
						<tr>
							<th scope="col" className="listing-unit-info">
								Unit
							</th>
							<th scope="col" className="listing-unit-info">
								Credits
							</th>
							<th scope="col" className="listing-unit-info">
								Earned
							</th>
							<th scope="col" className="listing-unit-info">
								Status
							</th>
							<th scope="col" className="listing-unit-info">
								Term
							</th>
							{!isViewMode && (
								<th scope="col" className="listing-unit-info">
									Actions
								</th>
							)}
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-200">
						{Object.entries(groupUnitsByYear(units)).map(([year, yearUnits]) => {
							return (
								<React.Fragment key={year}>
									<tr className="bg-gray-100">
										<td colSpan={isViewMode ? 5 : 6} className="listing-year">
											{year === '0' ? 'Draft' : `Year ${year}`}
										</td>
									</tr>
									{yearUnits.map((unit) => {
										// Find the index in the original units array
										const originalIndex = units.findIndex(
											u => u.unit?.UnitCode === unit.unit?.UnitCode && u.term?.ID === unit.term?.ID
										);
										return (
											<tr key={unit.id}>
												<td
													className={`listing-unit-history ${!unit.unit ? 'cursor-pointer' : ''}`}
													onClick={() => !unit.unit && handleUnitForm(originalIndex)}
												>
													{unit.unit ? (
														<div>
															{`${unit.unit.UnitCode} - ${unit.unit.Name}`}
															{unit.isImported && (
																<span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
																	Imported
																</span>
															)}
														</div>
													) : (
														<>
															Empty<span className="listing-unit-history"> | Click to select unit</span>
														</>
													)}
												</td>
												<td className="listing-unit-history">
													{unit.unit?.CreditPoints ?? 'N/A'}
												</td>
												<td className="listing-unit-history">
													{unit.status === 'pass' ? (unit.unit?.CreditPoints ?? 'N/A') :
														unit.status === 'fail' ? '0' :
															'No'}
												</td>
												<td className="listing-unit-history">
													<select
														value={unit.status || ''}
														onChange={(e) => handleStatusChange(originalIndex, e.target.value)}
														className={`unit-history-select-status ${unit.status === 'pass' ? 'bg-green-100 text-green-800' :
															unit.status === 'fail' ? 'bg-red-100 text-red-800' :
																'bg-yellow-100 text-yellow-800'
															}`}
														disabled={!unit.unit || isViewMode}
													>
														<option value="">Select status</option>
														<option value="pass">Pass</option>
														<option value="fail">Fail</option>
													</select>
												</td>
												<td className="listing-unit-history">
													<select
														value={unit.term?.ID?.toString() || ''}
														onChange={(e) => handleTermChange(originalIndex, e.target.value)}
														className="unit-history-select"
														disabled={isViewMode}
													>
														<option value="">Select a term</option>
														{/* Include existing term even if not in filtered list */}
														{unit.term && !getFilteredTerms().find(t => t.ID === unit.term.ID) && (
															<option key={`existing-${unit.term.ID}`} value={unit.term.ID.toString()}>
																{unit.term.Name} {unit.term.Year} (existing)
															</option>
														)}
														{getFilteredTerms().map(term => (
															<option key={term.ID} value={term.ID.toString()}>
																{term.Name} {term.Year}
															</option>
														))}
													</select>
												</td>
												{!isViewMode && (
													<td className="listing-unit-history">
														<button
															onClick={() => handleRemoveUnit(unit.id)}
															className="text-red-600 hover:text-red-800"
															title="Remove Unit"
														>
															Remove
														</button>
													</td>
												)}
											</tr>
										);
									})}
								</React.Fragment>
							);
						})}
						{units.length === 0 && (
							<tr>
								<td colSpan={isViewMode ? 5 : 6} className="unit-history-listing">
									No unit history found
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{openUnitForm && (
				//the add unit into unit history listing
				<div className="unit-history-modal-wrapper" onClick={handleBackdropClick}>
					<div className="unit-history-modal-container" ref={modalRef}>
						<div className="unit-history-modal-header">
							<h2 className="unit-history-modal-title">Unit Listing</h2>
							<button
								onClick={() => setOpenUnitForm(false)}
								className="unit-history-modal-close"
								aria-label="Close"
							>
								✕
							</button>
						</div>

						<div className="mb-4">
							<input
								type="text"
								placeholder="Search by unit code or name..."
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className="unit-history-search-input focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<div className="unit-history-table-container">
							{loadingUnits ? (
								<LoadingSpinner
									size="medium"
									color="primary"
									text="Loading units..."
									fullScreen={false}
								/>
							) : (
								<table className="unit-history-table-wrapper">
									<thead className="unit-history-table-head">
										<tr>
											<th className="listing-unit-options">Unit Code</th>
											<th className="listing-unit-options">Unit Name</th>
											<th className="listing-unit-options">Credit Points</th>
											<th className="listing-unit-options">Availability</th>
											<th className="listing-unit-options">Status</th>
											<th className="listing-unit-options">Requisites</th>
										</tr>
									</thead>
									<tbody>
										{filteredUnits.length === 0 && (
											<tr>
												<td colSpan={6} className="unit-history-no-data">
													{(unitsOffered.length <= 0 && unitsNotOffered.length <= 0)
														? "No Units Available"
														: "No units found matching your search"}
												</td>
											</tr>
										)}
										{filteredUnits.map((unit) => {
											const isOffered = unitsOffered.some(offeredUnit => offeredUnit._unit_code === unit._unit_code);
											// Check all attempts for this unit
											const allAttempts = units.filter(u => u.unit && u.unit.UnitCode === unit._unit_code);
											const hasPass = allAttempts.some(u => u.status === 'pass');
											const hasFail = allAttempts.some(u => u.status === 'fail');
											const isAlreadySelected = hasPass;
											const isFailed = !hasPass && hasFail;

											// Build className dynamically
											let rowClassName = 'unit-history-table-row';
											if (!isOffered) rowClassName += ' unit-history-table-row-not-offered';
											if (isAlreadySelected) rowClassName += ' unit-history-table-row-selected';
											if (isFailed) rowClassName += ' unit-history-table-row-failed';

											return (
												<tr
													onClick={() => !isAlreadySelected && onUnitSelect(unit)}
													key={unit._id || `${unit._unit_code}-${index}`}
													className={rowClassName}
												>
													<td className="unit-history-table-cell">{unit._unit_code}</td>
													<td className="unit-history-table-cell">{unit._name}</td>
													<td className="unit-history-table-cell text-center">{unit._credit_points}</td>
													<td className="unit-history-table-cell text-center">
														<span className={isOffered ? "unit-history-badge-offered" : "unit-history-badge-not-offered"}>
															{isOffered ? "Offered" : "Not Offered"}
														</span>
													</td>
													<td className="unit-history-table-cell text-center">
														{isAlreadySelected ? (
															<span className="unit-history-status-selected">Selected</span>
														) : isFailed ? (
															<span className="unit-history-status-failed">Failed</span>
														) : (
															<span className="unit-history-status-available">Available</span>
														)}
													</td>
													<td className="unit-history-table-cell">
														<UnitRequisitesDisplay unit={unit} />
													</td>
												</tr>
											)
										})}
									</tbody>
								</table>
							)}
						</div>
					</div>
				</div>
			)}

			{/* UPDATED IMPORT UPLOADER MODAL WITH NEW PROPS */}
			{showImportUploader && (
				<StudentUnitHistoryUploader
					studentId={studentId}
					onDataStaged={handleDataStaged}
					onClose={() => setShowImportUploader(false)}
					allTerms={allTerms}
				/>
			)}

			{confirmPopup && (
				<ConfirmPopup
					title={confirmPopup.title}
					description={confirmPopup.message}
					isOpen={confirmPopup.show}
					onClose={() => setConfirmPopup({ show: false })}
					onConfirm={() => {
						if (confirmPopup.onConfirm) {
							confirmPopup.onConfirm();
						}
						setConfirmPopup({ show: false });
					}}
					confirmButtonColor={confirmPopup.title === "Remove Unit" || confirmPopup.title === "Cancel Changes" ? "red" : "blue"}
				/>
			)}
		</div>
	);
}