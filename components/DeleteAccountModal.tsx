import React, { useState } from "react";

interface Account {
    id: string;
    name: string;
}

interface DeleteAccountModalProps {
    account: Account | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function DeleteAccountModal({
    account,
    isOpen,
    onClose,
    onSuccess,
}: DeleteAccountModalProps) {
    const [typedName, setTypedName] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [activeCampaigns, setActiveCampaigns] = useState<string[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    if (!isOpen || !account) return null;

    const isConfirmed = typedName.trim() === account.name.trim();

    const handleDelete = async () => {
        if (!isConfirmed) return;

        setIsDeleting(true);
        setErrorMessage(null);
        setActiveCampaigns([]);

        try {
            const res = await fetch(`/api/accounts/${account.id}`, {
                method: "DELETE",
            });

            if (res.status === 409) {
                const data = await res.json();
                setErrorMessage(data.error);
                setActiveCampaigns(data.campaigns || []);
                setIsDeleting(false);
                return;
            }

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to delete account");
            }

            onSuccess();
            handleClose();
        } catch (err: any) {
            setErrorMessage(err.message || "An error occurred");
            setIsDeleting(false);
        }
    };

    const handleClose = () => {
        setTypedName("");
        setErrorMessage(null);
        setActiveCampaigns([]);
        setIsDeleting(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-xl bg-neutral-900 border border-neutral-800 p-6 text-white shadow-2xl">
                <h3 className="text-lg font-bold text-red-500">Delete Account</h3>
                <p className="mt-2 text-sm text-neutral-400">
                    This will permanently delete <span className="font-semibold text-white">{account.name}</span> and remove its campaign runs.
                </p>

                {/* 409 Conflict: Campaign Block Warning */}
                {activeCampaigns.length > 0 && (
                    <div className="mt-4 rounded-lg bg-red-950/50 border border-red-800 p-3 text-xs text-red-300">
                        <p className="font-semibold mb-1">{errorMessage}</p>
                        <ul className="list-disc pl-4 space-y-1">
                            {activeCampaigns.map((camp, idx) => (
                                <li key={idx} className="font-medium text-red-200">{camp}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* General Error */}
                {errorMessage && activeCampaigns.length === 0 && (
                    <div className="mt-4 rounded-lg bg-red-950/50 border border-red-800 p-3 text-xs text-red-300">
                        {errorMessage}
                    </div>
                )}

                {/* Confirmation Input */}
                <div className="mt-4">
                    <label className="block text-xs font-medium text-neutral-400 mb-1">
                        Type <span className="font-bold text-white">{account.name}</span> to confirm:
                    </label>
                    <input
                        type="text"
                        value={typedName}
                        onChange={(e) => setTypedName(e.target.value)}
                        placeholder={account.name}
                        className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
                    />
                </div>

                {/* Modal Action Buttons */}
                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        onClick={handleClose}
                        disabled={isDeleting}
                        className="rounded-md px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={!isConfirmed || isDeleting}
                        className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold !text-white shadow-md hover:bg-red-700 disabled:opacity-40 transition-all"
                    >
                        {isDeleting ? "Deleting..." : "Delete Account"}
                    </button>
                </div>
            </div>
        </div>
    );
}