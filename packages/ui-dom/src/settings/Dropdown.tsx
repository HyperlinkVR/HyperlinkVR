export const Dropdown = ({ options, value, on_change, label, tooltip, placeholder_item, enabled = true }: { options: {label?: string, value: string}[]; value: string; on_change: (new_value: string) => void; label?: string; tooltip?: string; placeholder_item?: string, enabled?: boolean }) => (
    <label title={tooltip} className="cursor-pointer flex items-center">
        {label && <span className="mr-2">{label}</span>}
        <select
            className="bg-gray-700 text-white rounded-md px-2 py-1 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            value={value}
            onChange={(e) => on_change(e.target.value)}
            disabled={!enabled}
        >
            {placeholder_item && (
                <option value="" disabled>
                    {placeholder_item}
                </option>
            )}
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label || option.value}
                </option>
            ))}
        </select>
    </label>
);
