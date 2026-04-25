"use client";
import React, { useState } from 'react';
import { supabase } from '@/utils/db/supabaseClient';
import SecureFrontendAuthHelper from "@utils/auth/FrontendAuthHelper";

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { HeadingNode, QuoteNode, $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import {
	INSERT_ORDERED_LIST_COMMAND,
	INSERT_UNORDERED_LIST_COMMAND
} from '@lexical/list';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $generateHtmlFromNodes } from '@lexical/html';
import { $getRoot, $insertNodes } from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import {
	$getSelection,
	$isRangeSelection,
	$createParagraphNode,
	FORMAT_ELEMENT_COMMAND,
	FORMAT_TEXT_COMMAND,
	$isParagraphNode
} from 'lexical';
import { $setBlocksType, $patchStyleText } from '@lexical/selection';

function HtmlOnChangePlugin({ onHtmlChange }) {
	// 1. Get the editor instance from context (this works now)
	const [editor] = useLexicalComposerContext();

	const onChange = (editorState) => {
		editorState.read(() => {
			// 2. Use the 'editor' instance from the hook
			const htmlString = $generateHtmlFromNodes(editor);
			onHtmlChange(htmlString);
		});
	};

	return <OnChangePlugin onChange={onChange} />;
}
const CreatePDFContent = (studyPlanner, studentName, studentID) => {
	const content = document.createElement('div');
	content.style.padding = '20px';
	content.style.fontFamily = 'Arial, sans-serif';
	content.style.backgroundColor = 'white';

	// Header section with course info
	const header = document.createElement('div');
	header.innerHTML = `
		<div style="padding: 0.5rem; font-weight: bold; margin-bottom: 20px;">
			<div style="display: flex; justify-content: space-between; align-items: center; flex-direction: row;">
				<div style="width: fit-content;">
					<h2 style="font-size: 1.875rem; line-height: 2.25rem; margin: 0; font-weight: bold;">
						${studyPlanner.details.course.course_name} - ${studyPlanner.details.course.course_code}
						<p style="font-size: 1.25rem; line-height: 1.75rem; margin: 0.5rem 0; font-weight: bold;">${studyPlanner.details.course.major_name}</p>
					</h2>
					<h2 style="font-size: 1.125rem; line-height: 1.75rem; color: #4B5563;">
						${studyPlanner.details.intake.name} | ${studyPlanner.details.intake.year}
					</h2>
					<h2 style="font-size: 0.8rem; color: #4B5563;">
						(Unofficial Planner, not officially from Swinburne Sarawak)
					</h2>
					<h2 style="font-size: 1.5rem; font-weight:bold">
						Personal Study Planner for: ${studentName} ( ${studentID} )
					</h2>
				</div>
			</div>
		</div>
	`;
	content.appendChild(header);

	const legend = document.createElement('div');
	legend.style.marginBottom = '2rem';
	legend.innerHTML = `
		<div style="background-color: #242323; padding: 1rem; margin-bottom: 1rem; border-radius: 10px">
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
							${semester.sem_completed ? `
								<div style="
									margin-left: 0.5rem;
									background-color: #dcfce7;
									border-radius: 99999px;
									display: inline-flex;
									align-items: center;
									padding: 1px 10px;
									margin-top: 20px;
								">
									<span style="
										color: #15803d;
										font-size: 0.75rem;
										padding-bottom: 15px;
									">
										Completed in ${semester.sem_completed}
									</span>
								</div>
							` : ''}
						</div>
						<table style="width: 100%; border-collapse: collapse; background-color: white;">
							<thead>
								<tr>
									<th style="font-weight: bold; border: 1px solid #6B7280; text-align: left; padding: 5px; padding-bottom:15px; background-color: #D1D5DB; width: 60%; line-height: 1.2;">Unit</th>
									<th style="font-weight: bold; border: 1px solid #6B7280; text-align: left; padding: 5px; padding-bottom:15px; background-color: #D1D5DB; width: 30%; line-height: 1.2;">Requisites</th>
									<th style="font-weight: bold; border: 1px solid #6B7280; text-align: left; padding: 5px; padding-bottom:15px; background-color: #D1D5DB; width: 10%; line-height: 1.2;">Status</th>
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

					if (index < array.length - 1) {
						return acc + currentReq + ` ${req._operator === 'and' ? '&' : '|'} `;
					}

					return acc + currentReq;
				}, '')
				: 'NIL'
			}
											</div>
										</td>
										<td style="
											border: 1px solid #6B7280;
											padding: 10px;
											padding-bottom: 20px;
											height: 100%;
											text-align: center;
											display: block;
											display: table-cell;
											background-color: ${unit.status === 'pass'
				? '#d1fadf'
				: unit.status === 'planned'
					? '#fef9c3'
					: unit.status === 'fail'
						? '#fee2e2'
						: 'transparent'
			};
										">
											<span style="
												font-weight: 500;
												color: ${unit.status === 'pass'
				? '#16a34a'
				: unit.status === 'planned'
					? '#eab308'
					: unit.status === 'fail'
						? '#ef4444'
						: 'transparent'
			};
												padding: 4px 10px;
												border-radius: 6px;
											">
												${unit.status.charAt(0).toUpperCase() + unit.status.slice(1)}
											</span>
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

const formatRequisiteRelationship = (relationship) => {
	switch (relationship.toLowerCase()) {
		case 'pre': return 'Pre';
		case 'co': return 'Co';
		case 'anti': return 'Anti';
		default: return relationship;
	}
};

const ConvertToPDFBlob = async (pdf_content, studentID, intakeName, filename) => {
	if (typeof window === 'undefined') {
		console.error('PDF generation is only available in browser environment');
		return;
	}

	let html2pdf;
	try {
		const html2pdfModule = await import('html2pdf.js');
		html2pdf = html2pdfModule.default || html2pdfModule;
	} catch (error) {
		console.error('Failed to load html2pdf.js:', error);
		alert('Failed to load PDF library. Please try again.');
		return;
	}

	document.body.appendChild(pdf_content);
	const pxToMm = px => px * 0.35;
	const heightPx = pdf_content.offsetHeight;
	const heightMm = pxToMm(heightPx);
	document.body.removeChild(pdf_content);

	const options = {
		margin: [0, 0, 0, 0],
		filename: `${filename}`,
		image: { type: 'jpeg', quality: 0.7 },
		html2canvas: {
			scale: 1.5,
			useCORS: true,
			letterRendering: true
		},
		jsPDF: {
			unit: 'mm',
			format: [300, heightMm],
			orientation: 'portrait',
			compress: true
		},
		pagebreak: { mode: [] }
	};

	const pdfBlob = await html2pdf()
		.set(options)
		.from(pdf_content)
		.output('blob');
	return pdfBlob
}

const SendPlannerToSupabaseStorage = async (pdf_content, studentID, intakeName, filename) => {
	try {
		const pdfBlob = await ConvertToPDFBlob(pdf_content, studentID, intakeName, filename);
		const url_link = "google.com";
		return { url_link, pdfBlob };
	} catch (err) {
		console.error("Error uploading planner:", err.message);
		return null;
	}
};

function BlobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result.split(',')[1]);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

const SendEmail = async (studentStudyPlanner, recipients, emailSubject, emailContent) => {
	Swal.fire({
		title: 'Sending Email...',
		html: 'Please wait while we generate and send your study planner.',
		allowOutsideClick: false,
		allowEscapeKey: false,
		allowEnterKey: false,
		showConfirmButton: false,
		didOpen: () => {
			Swal.showLoading();
		}
	});

	try {
		const filename = `${studentStudyPlanner.student_info.student_id}_${studentStudyPlanner.study_planner.details.intake.name}_personal_study_planner.pdf`;
		const student_name = studentStudyPlanner.student_info.name;
		const student_id = studentStudyPlanner.student_info.student_id;
		const intake_name = studentStudyPlanner.study_planner.details.intake.name;
		const pdf_content = CreatePDFContent(studentStudyPlanner.study_planner, student_name, student_id);

		const { url_link, pdfBlob } = await SendPlannerToSupabaseStorage(pdf_content, student_id, studentStudyPlanner.study_planner.details.intake.name, filename);
		const pdfBase64 = await BlobToBase64(pdfBlob);

		const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/send-email', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				student_name,
				student_id,
				recipients,
				email_subject: emailSubject,
				email_content: emailContent,
				url_link,
				pdf_base64: pdfBase64,
				filename
			}),
		});

		const data = await res.json();
		Swal.close();

		if (data.success) {
			Swal.fire({
				icon: "success",
				title: "Email Sent!",
				text: `Your email was sent successfully to ${recipients.length} recipient(s)`,
				confirmButtonColor: "#3085d6"
			});
		} else {
			console.log('data', data)
			Swal.fire({
				icon: "error",
				title: "Failed",
				html: `Something went wrong. Please try again later.<br>${(data.error)}`,
			});
		}
	} catch (error) {
		Swal.close();
		console.error("Error sending email:", error);
		Swal.fire({
			icon: "error",
			title: "Error",
			text: "An unexpected error occurred while sending the email. Please try again.",
		});
	}
};

// Toolbar Component for Lexical Editor
function ToolbarPlugin() {
	const [editor] = useLexicalComposerContext();
	const [isBold, setIsBold] = useState(false);
	const [isItalic, setIsItalic] = useState(false);
	const [isUnderline, setIsUnderline] = useState(false);

	// 1. Add state for the block type
	const [blockType, setBlockType] = useState('paragraph');

	// This function updates the toolbar state based on the current selection
	const updateToolbar = React.useCallback(() => {
		const selection = $getSelection();
		if ($isRangeSelection(selection)) {
			// Update text format states
			setIsBold(selection.hasFormat('bold'));
			setIsItalic(selection.hasFormat('italic'));
			setIsUnderline(selection.hasFormat('underline'));

			// 2. Update block type state
			const anchorNode = selection.anchor.getNode();
			const element =
				anchorNode.getKey() === 'root'
					? anchorNode
					: anchorNode.getTopLevelElementOrThrow();

			if ($isHeadingNode(element)) {
				const tag = element.getTag();
				setBlockType(tag); // e.g., 'h1', 'h2'
			} else if ($isParagraphNode(element)) {
				setBlockType('paragraph');
			}
		}
	}, [editor]); // Depend on the editor instance

	// Register a listener to update the toolbar when the editor state changes
	React.useEffect(() => {
		// Use a merge register to listen to updates
		return editor.registerUpdateListener(({ editorState }) => {
			editorState.read(() => {
				updateToolbar();
			});
		});
	}, [updateToolbar, editor]);


	return (
		<div className="border border-gray-300 rounded-t-md  p-2 flex flex-wrap gap-1 items-center">
			{/* Headings - FIXED */}
			<select
				// 3. Bind the value prop to the new state
				value={blockType}
				onChange={(e) => {
					const value = e.target.value;
					editor.update(() => {
						const selection = $getSelection();
						if ($isRangeSelection(selection)) {
							if (value === 'paragraph') {
								$setBlocksType(selection, () => $createParagraphNode());
							} else {
								$setBlocksType(selection, () => $createHeadingNode(value));
							}
						}
					});
				}}
				className="px-2 py-1 border border-gray-300 rounded text-sm "
			>
				<option value="paragraph">Paragraph</option>
				<option value="h1">Heading 1</option>
				<option value="h2">Heading 2</option>
				<option value="h3">Heading 3</option>
			</select>

			{/* Text Formatting */}
			<button
				onClick={() => {
					editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold');
				}}
				className={`px-3 py-1 border border-gray-300 rounded font-bold ${isBold ? 'bg-blue-200' : ''}`}
				type="button"
			>
				B
			</button>
			<button
				onClick={() => {
					editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');
				}}
				className={`px-3 py-1 border border-gray-300 rounded italic ${isItalic ? 'bg-blue-200' : ''}`}
				type="button"
			>
				I
			</button>
			<button
				onClick={() => {
					editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
				}}
				className={`px-3 py-1 border border-gray-300 rounded underline ${isUnderline ? 'bg-blue-200' : ''}`}
				type="button"
			>
				U
			</button>

			{/* Lists */}
			<button
				onClick={() => {
					editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
				}}
				className="px-3 py-1 border border-gray-300 rounded "
				type="button"
			>
				• List
			</button>
			<button
				onClick={() => {
					editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
				}}
				className="px-3 py-1 border border-gray-300 rounded "
				type="button"
			>
				1. List
			</button>

			{/* Text Color */}
			<input
				type="color"
				onChange={(e) => {
					const color = e.target.value;
					editor.update(() => {
						const selection = $getSelection();
						if ($isRangeSelection(selection)) {
							$patchStyleText(selection, { color: color });
						}
					});
				}}
				className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
				title="Text Color"
			/>

			{/* Alignment */}
			<button
				onClick={() => {
					editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left');
				}}
				className="px-3 py-1 border border-gray-300 rounded "
				type="button"
			>
				⇤
			</button>
			<button
				onClick={() => {
					editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center');
				}}
				className="px-3 py-1 border border-gray-300 rounded "
				type="button"
			>
				↔
			</button>
			<button
				onClick={() => {
					editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right');
				}}
				className="px-3 py-1 border border-gray-300 rounded "
				type="button"
			>
				⇥
			</button>
		</div>
	);
}

// Plugin to initialize editor with HTML content
function InitialContentPlugin({ initialHtml }) {
	const [editor] = useLexicalComposerContext();

	React.useEffect(() => {
		if (initialHtml) {
			editor.update(() => {
				const parser = new DOMParser();
				const dom = parser.parseFromString(initialHtml, 'text/html');
				const nodes = $generateNodesFromDOM(editor, dom);
				const root = $getRoot();
				root.clear();
				root.append(...nodes);
			});
		}
	}, [editor, initialHtml]);

	return null;
}

const SendStudyPlanner = ({ studentStudyPlanner, studentEmail, setStudentEmail, isEmailExpanded, setIsEmailExpanded }) => {
	const [recipients, setRecipients] = useState(studentEmail || '');
	const [emailSubject, setEmailSubject] = useState('Study Planner for ' + ` ${studentStudyPlanner?.student_info?.name || '[Student Name]'} (${studentStudyPlanner?.student_info?.student_id || '[Student ID]'})`);
	const [emailHtmlContent, setEmailHtmlContent] = useState('');

	const defaultContent = `
		<p>
			Your <strong>Personalized Study Planner</strong> for 
			<strong>${studentStudyPlanner?.student_info?.name || '[Student Name]'}</strong> 
			(Student ID: 
			<strong>${studentStudyPlanner?.student_info?.student_id || '[Student ID]'}</strong>) 
			is now ready.
		</p>
		<p>
			You can view it using the attached PDF file.
		</p>
		<p>
			Please note that this planner was automatically generated by 
			<strong>Swinburne Sarawak FYP Group 3 Students</strong> for reference purposes only. 
			It is <strong>not an official document from Swinburne University of Technology, Sarawak</strong>.
		</p>
		<p>
			If you have any questions, you may contact your course coordinator.
		</p>
		<p><br></p>
		<p>
			Best regards,<br>
			Study Planner System
		</p>
	`;
	// Lexical configuration
	const editorConfig = {
		namespace: 'EmailEditor',
		theme: {
			paragraph: 'mb-1',
			heading: {
				h1: 'text-3xl font-bold mb-2',
				h2: 'text-2xl font-bold mb-2',
				h3: 'text-xl font-bold mb-2',
			},
			list: {
				nested: {
					listitem: 'list-none',
				},
				ol: 'list-decimal ml-4',
				ul: 'list-disc ml-4',
			},
			text: {
				bold: 'font-bold',
				italic: 'italic',
				underline: 'underline',
			},
		},
		nodes: [
			HeadingNode,
			ListNode,
			ListItemNode,
			QuoteNode,
			CodeNode,
			CodeHighlightNode,
			TableNode,
			TableCellNode,
			TableRowNode,
			AutoLinkNode,
			LinkNode,
		],
		onError: (error) => {
			console.error('Lexical Error:', error);
		},
	};

	// Update recipients when studentEmail changes
	React.useEffect(() => {
		if (studentEmail) {
			setRecipients(studentEmail);
		}
	}, [studentEmail]);

	const parseRecipients = (text) => {
		return text
			.split(/[\n,]/)
			.map(email => email.trim())
			.filter(email => email.length > 0);
	};

	const handleSendEmail = async () => {
		const recipientList = parseRecipients(recipients);

		if (recipientList.length === 0) {
			Swal.fire({
				icon: "warning",
				title: "No Recipients",
				text: "Please enter at least one email address.",
			});
			return;
		}

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const invalidEmails = recipientList.filter(email => !emailRegex.test(email));

		if (invalidEmails.length > 0) {
			Swal.fire({
				icon: "warning",
				title: "Invalid Email Format",
				html: `The following emails are invalid:<br>${invalidEmails.join('<br>')}`,
			});
			return;
		}

		if (!emailHtmlContent) {
			Swal.fire({
				icon: "warning",
				title: "Empty Content",
				text: "Please write some content for the email.",
			});
			return;
		}

		try {
			await SendEmail(studentStudyPlanner, recipientList, emailSubject, emailHtmlContent);
		} catch (err) {
			console.error("Failed to send email:", err);
		}
	};

	return (
		<div className="plannerInfoCard ">
			<div
				className="plannerInfoHeader"
				onClick={() => setIsEmailExpanded(!isEmailExpanded)}
			>
				<div className="flex items-center">
					<div className=" p-2 rounded-full mr-3 shadow-sm bg-white">
						<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#DC2D27]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
						</svg>
					</div>
					<h3 className="plannerInfoTitle">Send Study Planner</h3>
				</div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					className={`h-5 w-5 text-white transition-transform duration-300 ${isEmailExpanded ? 'transform rotate-180' : ''}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</div>

			<div
				className={`transition-all duration-300 ease-in-out overflow-hidden ${isEmailExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}
			>
				<div className="p-6">
					<p className="plannerDetailsSubtitle mb-4">Send the study plan to multiple recipients</p>

					{/* Recipients Field */}
					<div className="mb-4">
						<label htmlFor="recipients" className="block plannerDetailsSubtitle mb-2">
							Recipients <span className="text-red-500">*</span>
						</label>
						<textarea
							id="recipients"
							value={recipients}
							onChange={(e) => setRecipients(e.target.value)}
							placeholder="Enter email addresses separated by commas or new lines&#10;e.g., user1@swin.edu.my, user2@swin.edu.my"
							rows={3}
							className="w-full border border-gray-300 px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-y"
						/>
						<p className="text-sm text-gray-500 mt-1">
							Separate multiple emails with commas or new lines
						</p>
					</div>

					{/* Subject Field */}
					<div className="mb-4">
						<label htmlFor="emailSubject" className="block plannerDetailsSubtitle mb-2">
							Subject <span className="text-red-500">*</span>
						</label>
						<input
							type="text"
							id="emailSubject"
							value={emailSubject}
							onChange={(e) => setEmailSubject(e.target.value)}
							className="w-full border border-gray-300 px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
						/>
					</div>

					{/* Email Content Field */}
					<div className="mb-4">
						<label htmlFor="emailContent" className="block plannerDetailsSubtitle mb-2">
							Email Content <span className="text-red-500">*</span>
						</label>

						<LexicalComposer initialConfig={editorConfig}>
							<div className="border border-gray-300 rounded-md overflow-hidden">
								<ToolbarPlugin />
								<div className="relative">
									<RichTextPlugin
										contentEditable={
											<ContentEditable className="h-[250px] overflow-y-auto p-4 outline-none" />
										}
										placeholder={
											<div className="absolute top-4 left-4 text-gray-400 pointer-events-none">
												Write your email content here...
											</div>
										}
									/>
									<HtmlOnChangePlugin onHtmlChange={setEmailHtmlContent} />
									<HistoryPlugin />
									<AutoFocusPlugin />
									<ListPlugin />
									<LinkPlugin />
									<MarkdownShortcutPlugin transformers={TRANSFORMERS} />
									<InitialContentPlugin initialHtml={defaultContent} />
								</div>
							</div>
						</LexicalComposer>

						<p className="text-sm text-gray-500 mt-1">
							Edit the default message or write your own using the rich text editor
						</p>
					</div>

					{/* Send Button */}
					<button
						className="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-3 rounded-md transition-colors duration-200 flex items-center justify-center shadow-sm hover:shadow"
						onClick={handleSendEmail}
					>
						<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
						</svg>
						Send Email to All Recipients
					</button>
				</div>
			</div>
		</div>
	);
};

export default SendStudyPlanner;