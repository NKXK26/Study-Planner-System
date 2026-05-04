import StudentStudyPlannerAmmendments from "./StudentStudyPlannerAmmendments";
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

class StudentStudyPlannerAmmendmentsDB {
    static async FetchAmendments(params = {}) {
        try {
            const query = new URLSearchParams({
                ...params,
                ...(params.order_by ? { order_by: JSON.stringify(params.order_by) } : {}),
                ...(params.return ? { return: params.return.join(',') } : {}),
                ...(params.exclude ? { exclude: JSON.stringify(params.exclude) } : {})
            }).toString();

            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/students/student_study_planner_ammendments?${query}`);
            const textResponse = await response.text();

            const data = JSON.parse(textResponse);

            if (!response.ok) {
                return { success: false, message: data.message || "Failed to fetch data" };
            }

            return data.map(item => new StudentStudyPlannerAmmendments({
                id: item.ID,
                student_id: item.StudentID,
                unit_code: item.Unit_StudentStudyPlannerAmmendments_UnitIDToUnit?.UnitCode || null,
                new_unit_code: item.Unit_StudentStudyPlannerAmmendments_NewUnitIDToUnit?.UnitCode || null,
                action: item.Action,
                time_of_action: item.TimeofAction,
                new_unit_type_id: item.NewUnitTypeID,
                old_unit_type_id: item.OldUnitTypeID,
                year: item.Year,
                sem_index: item.SemIndex,
                sem_type: item.SemType,
                sem_id: item.SemID
            }));

        } catch (error) {
            console.error("Fetch error:", error);
            throw error;
        }
    }
    static async AddAmendment(amendments) {
        try {
            // If a single amendment is passed, wrap it in an array for consistency
            const amendmentsArray = Array.isArray(amendments) ? amendments : [amendments];

            // Send the array of amendments to the API
            const response = await SecureFrontendAuthHelper.authenticatedFetch(
                `/api/students/student_study_planner_ammendments`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(amendmentsArray),
                }
            );

            const textResponse = await response.text();

            let data;
            try {
                data = JSON.parse(textResponse);
            } catch (e) {
                console.error('Failed to parse response as JSON:', textResponse);
                return {
                    success: false,
                    message: `Failed to parse response from server: ${textResponse}`
                };
            }

            return {
                success: data.success,
                message: data.message || (response.ok ? "Amendments added successfully" : "Failed to add amendments"),
                data: data.data,
                ids: data.ids,
                status: response.status
            };
        } catch (err) {
            console.error('AddAmendment error:', err);
            return { success: false, message: err.message };
        }
    }

    // Not Needed for now, maybe in future usage
    // static async UpdateAmendment(amendment) {
    //     try {
    //         const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/student_study_planner_ammendments`, {
    //             method: 'PUT',
    //             headers: {
    //                 'Content-Type': 'application/json',
    //             },
    //             body: JSON.stringify(amendment)
    //         });

    //         const data = await response.json();

    //         if (!response.ok) {
    //             if (response.status !== 200) {
    //                 console.warn('Amendment already exists:', data.amendment);
    //                 return { success: false, message: data.message, amendment: data.amendment };
    //             }
    //             throw new Error(data.error || 'Failed to edit the amendment');
    //         }

    //         return {
    //             success: true,
    //             message: 'The amendment has been updated successfully',
    //             amendment: data.amendment,
    //         };
    //     } catch (err) {
    //         console.error('UpdateAmendment Error:', err);
    //         return { success: false, message: err.message };
    //     }
    // }

    static async DeleteAmendment(id) {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/students/student_study_planner_ammendments`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            });

            const data = await response.json();
            return {
                success: response.ok,
                message: data.message || (response.ok ? "Amendments deleted successfully" : "Failed to delete master study planner"),
                data: data
            };
        } catch (err) {
            console.error('DeleteMasterStudyPlanner Error:', err);
            return { success: false, message: err.message };
        }
    }
}

export default StudentStudyPlannerAmmendmentsDB;
