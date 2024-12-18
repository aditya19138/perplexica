'use client';

import { createContext, useState, ReactNode } from "react";

type AnalyticsContextType = {
    analyticsEnabled: boolean;
    setAnalyticsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    fileUrls: string[];
    setFileUrls: React.Dispatch<React.SetStateAction<string[]>>;

};

export const AnalyticsContext = createContext<AnalyticsContextType | null>(null);

type AnalyticsProviderProps = {
    children: ReactNode;
};

export const AnalyticsProvider: React.FC<AnalyticsProviderProps> = ({ children }) => {
    const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
    const [fileUrls, setFileUrls] = useState<string[]>([]);

    return (
        <AnalyticsContext.Provider value={{ analyticsEnabled, setAnalyticsEnabled, fileUrls, setFileUrls }}>
            {children}
        </AnalyticsContext.Provider>
    );
};


