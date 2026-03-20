import { useState } from 'react';

export interface PromptSetup {
    title: string;
    description: string;
    placeholder?: string;
    type?: 'text' | 'password';
    confirmText?: string;
    cancelText?: string;
}

export const usePrompt = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [config, setConfig] = useState<PromptSetup>({
        title: '',
        description: '',
    });
    const [resolveFn, setResolveFn] = useState<(value: string | null) => void>(() => () => {});

    const requestPrompt = (setup: PromptSetup): Promise<string | null> => {
        setConfig(setup);
        setIsOpen(true);
        return new Promise((resolve) => {
            setResolveFn(() => resolve);
        });
    };

    const handleConfirm = async (value: string) => {
        resolveFn(value);
        setIsOpen(false);
    };

    const handleCancel = () => {
        resolveFn(null);
        setIsOpen(false);
    };

    return {
        isOpen,
        config,
        requestPrompt,
        handleConfirm,
        handleCancel
    };
};
