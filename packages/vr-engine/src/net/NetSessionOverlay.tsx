import { useNetSession } from "./NetSession";

// TODO: move into the watch ui once there's more than a debug list
export const NetSessionOverlay = () => {
    const { room, peers, host } = useNetSession();

    if (!room) {
        return null;
    }

    return (
        <div className="absolute top-10 left-4 z-40 rounded bg-black/60 px-3 py-2 text-xs text-white font-sans pointer-events-none">
            <div className="font-semibold mb-1">{peers.length} in room</div>

            {peers.map((peer) => (
                <div key={peer.id}>
                    {peer.username ?? "Guest"}
                    <span className="text-gray-400"> {peer.id.slice(0, 4)}</span>
                    {peer.id === host && <span className="text-amber-300"> host</span>}
                    {peer.id === room.self.id && <span className="text-sky-300"> you</span>}
                </div>
            ))}
        </div>
    );
};
