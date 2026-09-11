export const SquareButton = ({label, title, className = "", on_click}: {label: React.ReactNode; title?: string; className?: string; on_click: () => void}) => {
    return (
        <button onClick={on_click} title={title} className={`${className} text-white aspect-square cursor-pointer flex items-center justify-center`}>
            {label}
        </button>
    );
}
