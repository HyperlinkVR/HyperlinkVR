import { useSetting } from "./useSetting";
import { settings_def } from "@hyperlinkvr/types";

export const useServiceURLs = () => {
    const [overrides_enabled] = useSetting("service_override");

    const [featured_override] = useSetting("service_featured");
    const [search_override] = useSetting("service_search");

    return {
        featured: overrides_enabled ? featured_override : settings_def["service_featured"].default_value,
        search: overrides_enabled ? search_override : settings_def["service_search"].default_value,
    }
}
