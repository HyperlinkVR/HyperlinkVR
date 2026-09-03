import { useSetting } from "./useSetting";
import { settings_def } from "@hyperlinkvr/types";

export const useServiceURLs = () => {
    const [overrides_enabled] = useSetting("service_override");

    const [featured_override] = useSetting("service_featured");

    return {
        featured: overrides_enabled ? featured_override : settings_def["service_featured"].default_value
    }
}
