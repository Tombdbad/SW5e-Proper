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
/**
 * Copy text to clipboard with fallback for browser compatibility
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    }
  } catch (error) {
    console.error('Failed to copy text to clipboard', error);
    return false;
  }
};

/**
 * Read text from clipboard with permissions check
 */
export const readFromClipboard = async (): Promise<string | null> => {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
    return null;
  } catch (error) {
    console.error('Failed to read from clipboard - permissions may be required', error);
    return null;
  }
};
