'use client';

const formatRequisiteRelationship = (relationship) => {
	switch (relationship.toLowerCase()) {
		case 'pre': return 'Pre';
		case 'co': return 'Co';
		case 'anti': return 'Anti';
		default: return relationship;
	}
};

const createPDFContent = (studyPlanner) => {
	const content = document.createElement('div');
	content.style.padding = '20px';
	content.style.fontFamily = 'Arial, sans-serif';
	content.style.backgroundColor = 'white';

	const now = new Date();
	const formattedDate = now.toLocaleString('en-MY', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});


	// Header section with course info
	const header = document.createElement('div');
	header.innerHTML = `
		<div style="padding: 0.5rem; font-weight: bold; margin-bottom: 20px;">
			<div style="display: flex; justify-content: space-between; align-items: center; flex-direction: row;">
				<div style="width: fit-content;">
					<h2 style="font-size: 1.875rem; line-height: 2.25rem; margin: 0; font-weight: bold;">
					<h2 style="font-size: 1.875rem; line-height: 2.25rem; margin: 0; font-weight: bold;">
						${studyPlanner.details.course.course_name} - ${studyPlanner.details.course.course_code}
						<p style="font-size: 1.25rem; line-height: 1.75rem; margin: 0.5rem 0; font-weight: bold;">${studyPlanner.details.course.major_name}</p>
					</h2>
					<h2 style="font-size: 1.125rem; line-height: 1.75rem; color: #4B5563;">
						${studyPlanner.details.intake.name} | ${studyPlanner.details.intake.year}
					</h2>
					<h2 style="font-size: 1rem; color: #4B5563;">
						(Unofficial Planner, not officially from Swinburne Sarawak)
					</h2>
					<h2 style="font-size: 1rem; color: #4B5563;">
						Generated On: ${formattedDate}
					</h2>
				</div>
			</div>
		</div>
	`;
	content.appendChild(header);


	const legend = document.createElement('div');
	legend.style.marginBottom = '2rem';
	legend.innerHTML = `
		<div style="background-color: #242323; padding: 1rem; margin-bottom: 1rem; border-radius: 10px;">
			<div style="display: flex; align-items: center;">
				<div style="background-color: white; padding: 0.5rem; border-radius: 9999px; margin-right: 0.75rem;">
					<svg xmlns="http://www.w3.org/2000/svg" style="height: 1.5rem; width: 1.5rem; color: #DC2D27;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<h3 style="font-size: 1.25rem; font-weight: 600; color: white; padding-bottom: 10px;">Unit Types</h3>
			</div>
			<div style="margin-top: 10px; background-color: white; padding: 10px; border-radius: 10px;">
			${studyPlanner.details.unit_types.map(unitType => `
				<div style="margin-bottom: 0.5rem;">
					<span style="
						display: inline-block;
						width: 2rem;
						height: 2rem;
						border: 1px solid black;
						background-color: ${unitType._color};
						border-radius: 50%;
						vertical-align: middle;
						margin-right: 0.5rem;
					"></span>
					<span style="
						font-size: 1rem;
						font-weight: 500;
						vertical-align: middle;
						padding-bottom: 15px;
						display: inline-block;
					">
						${unitType._name}
					</span>
				</div>
			`).join('')}
			</div>
		</div>
	`;
	content.appendChild(legend);

	studyPlanner.years.forEach(year => {
		const yearDiv = document.createElement('div');
		yearDiv.style.marginBottom = '0.5rem';
		yearDiv.innerHTML = `
			<div style="padding: 0.5rem; margin-bottom: 1rem;">
				<h3 style="font-size: 1.875rem; font-weight: bold; margin-bottom: 0.5rem;">Year ${year.year}</h3>
				${year.semesters.map(semester => `
					<div style="margin-bottom: 1rem;">
						<div style="background-color: #1F2937; color: white; font-weight: bold; padding: 5px; padding-bottom: 15px; display: flex; align-items: center; min-height: 2.5rem;">
							${semester.sem_name} | ${semester.intake.month} ${semester.intake.year}
						</div>
						<table style="width: 100%; border-collapse: collapse; background-color: white;">
							<thead>
								<tr>
									<th style="font-weight: bold; border: 1px solid #6B7280; text-align: left; padding: 5px; padding-bottom:15px; background-color: #D1D5DB; width: 70%; line-height: 1.2;">Unit</th>
									<th style="font-weight: bold; border: 1px solid #6B7280; text-align: left; padding: 5px; padding-bottom:15px; background-color: #D1D5DB; width: 30%; line-height: 1.2;">Requisites</th>
								</tr>
							</thead>
							<tbody>
								${semester.units.map(unit => `
									<tr style="background-color: ${unit.unit_type?._color || 'transparent'}; height: 100%;">
										<td style="
											border: 1px solid #6B7280;
											padding:10px;
											padding-bottom: 20px;
											height: 100%;
											vertical-align: middle;
										">
											<div>
												${unit.unit?.code || unit.unit_type?._name === "Elective" ?
				`${unit.unit.code ? `${unit.unit.code} - ` : ''}${unit.unit.name}`
				: 'Empty'
			}
											</div>
										</td>
										<td style="
											border: 1px solid #6B7280; 
											padding:10px;
											padding-bottom: 20px; 
											height: 100%;
											display: table-cell;
										">
											<div>
												${unit.requisites.length > 0 ?
				unit.requisites.reduce((acc, req, index, array) => {
					if (req._minCP) {
						return `Min(${req._minCP}CP)`;
					}

					const relationship = formatRequisiteRelationship(req._unit_relationship);
					const currentReq = `${relationship}(${req._requisite_unit_code})`;

					// If it's not the last item, add the operator
					if (index < array.length - 1) {
						// Use the operator from the current requisite
						return acc + currentReq + ` ${req._operator === 'and' ? '&' : '|'} `;
					}

					// Last item, don't add operator
					return acc + currentReq;
				}, '')
				: 'NIL'
			}
											</div>
										</td>
									</tr>
								`).join('')}
							</tbody>
						</table>
					</div>
				`).join('')}
			</div>
		`;
		content.appendChild(yearDiv);
	});

	return content;
};



export const SaveStudyPlannerAsPDF = async (studyPlanner) => {
	// Ensure we're in a browser environment
	if (typeof window === 'undefined') {
		console.error('PDF generation is only available in browser environment');
		return;
	}

	// Dynamically import html2pdf only when needed (client-side)
	let html2pdf;
	try {
		const html2pdfModule = await import('html2pdf.js');
		html2pdf = html2pdfModule.default || html2pdfModule;
	} catch (error) {
		console.error('Failed to load html2pdf.js:', error);
		alert('Failed to load PDF library. Please try again.');
		return;
	}

	const content = createPDFContent(studyPlanner);

	// --- NEW: Calculate content height in mm ---
	document.body.appendChild(content); // Temporarily add to DOM to measure
	const pxToMm = px => px * 0.35; // 1px = 0.264583mm
	// const widthPx = content.offsetWidth;
	const heightPx = content.offsetHeight;
	// const widthMm = pxToMm(widthPx);
	const heightMm = pxToMm(heightPx);
	document.body.removeChild(content);

	const options = {
		margin: [0, 0, 0, 0], // No margins for full content
		filename: `MSP_${studyPlanner.details.course.course_code}_${studyPlanner.details.intake.name}_${studyPlanner.details.course.major_name.replace(/ /g, '_')}.pdf`,
		image: { type: 'jpeg', quality: 0.98 },
		html2canvas: {
			scale: 2,
			useCORS: true,
			letterRendering: true
		},
		jsPDF: {
			unit: 'mm',
			format: [300, heightMm], // Custom size for one long page
			orientation: 'portrait'
		},
		pagebreak: { mode: [] } // Disable all pagebreaks
	};

	await html2pdf().set(options).from(content).save();
};