import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const getLocalStorage = (key: string): any =>
    JSON.parse(window.localStorage.getItem(key) || "null");
const setLocalStorage = (key: string, value: any): void =>
    window.localStorage.setItem(key, JSON.stringify(value));

export { getLocalStorage, setLocalStorage };

// Added apiRequest function
export const apiRequest = async (
    url: string,
    options?: RequestInit,
): Promise<Response> => {
    try {
        // Ensure options is undefined or a proper RequestInit object
        const safeOptions =
            options && typeof options === "object" ? options : undefined;

        const response = await fetch(url, safeOptions);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response;
    } catch (error) {
        console.error("Error fetching data:", error);
        throw error;
    }
};
