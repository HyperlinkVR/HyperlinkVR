export const ProfilePicture = ({avatar_url, username, className = "w-10 h-10"}: {avatar_url?: string, username?: string, className?: string}) => {
    if (avatar_url) {
        return (
            <img src={avatar_url} className={`${className} rounded-full`} />
        );
    }

    return (
        <div className={`${className} rounded-full text-white flex items-center justify-center bg-gray-500`}>
            <span className="text-lg font-bold">{username && username.length > 0 ? username[0]!.toUpperCase() : "?"}</span>
        </div>
    );
}
