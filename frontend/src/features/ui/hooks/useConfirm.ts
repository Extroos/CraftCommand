import { useState } from 'react';

interface ConfirmSetup {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}

export const useConfirm = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [config, setConfig] = useState<ConfirmSetup>({
        title: '',
        description: '',
    });
    const [resolveFn, setResolveFn] = useState<(value: boolean) => void>(() => () => {});

    const confirm = (setup: ConfirmSetup): Promise<boolean> => {
        setConfig(setup);
        setIsOpen(true);
        return new Promise((resolve) => {
            setResolveFn(() => resolve);
        });
    };

    const handleConfirm = async () => {
        resolveFn(true);
        setIsOpen(false);
    };

    const handleCancel = () => {
        resolveFn(false);
        setIsOpen(false);
    };

    return {
        isOpen,
        config,
        confirm,
        handleConfirm,
        handleCancel
    };
};
