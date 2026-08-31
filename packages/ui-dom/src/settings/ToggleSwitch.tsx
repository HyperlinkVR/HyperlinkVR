export const ToggleSwitch = ({ value, on_change, label, tooltip, enabled = true }: { value?: boolean; on_change: (new_state: boolean) => void; label?: string; tooltip?: string; enabled?: boolean }) => {
    return (
        <label title={tooltip} className="cursor-pointer flex items-center">
            {label && <span className="mr-2">{label}</span>}
            <button
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                    value ? (enabled ? "bg-blue-600 cursor-pointer" : "bg-blue-900") : (enabled ? "bg-gray-300 cursor-pointer" : "bg-gray-800")
                }`}
                onClick={() => enabled && on_change(!value)}
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full ${enabled ? "bg-white" : "bg-gray-600"} transition-transform duration-200 ${
                        value ? "translate-x-5" : "translate-x-1"
                    }`}
                />
            </button>
        </label>
    );
}
