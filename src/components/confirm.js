import styles from '@styles/unit.module.css';
import React from 'react';

const ConfirmPopup = ({ title, description, isOpen, onClose, onConfirm, confirmButtonColor = 'red' }) => {
	if (!isOpen) return null;

	const getButtonClasses = (color) => {
		switch (color) {
			case 'green':
				return 'bg-green-600 hover:bg-green-700';
			case 'blue':
				return 'bg-blue-600 hover:bg-blue-700';
			case 'red':
			default:
				return 'bg-red-600 hover:bg-red-700';
		}
	};

	return (
		<div className={`${styles.unitFormWrapper} fixed inset-0 flex items-center justify-center z-50`}>
			<div className="bg-white p-6 rounded-md shadow-md w-[50%]">
				<h2 className="text-lg font-semibold text-gray-800 mb-4">{title}</h2>
				<p className="text-sm text-gray-600 mb-6">
					{description.split('\n').map((line, index) => (
						<React.Fragment key={index}>
							{line}
							<br />
						</React.Fragment>
					))}
				</p>
				<div className="flex justify-end space-x-3">
					<button
						onClick={onClose}
						className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
					>
						Cancel
					</button>
					<button
						onClick={onConfirm}
						className={`px-4 py-2 text-sm text-white rounded ${getButtonClasses(confirmButtonColor)}`}
					>
						Confirm
					</button>
				</div>
			</div>
		</div>
	);
};

export default ConfirmPopup;
