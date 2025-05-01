
import { toast } from "sonner";
import { useToast as useToastImpl } from "./toast";

export { toast };
export const useToast = () => {
  return {
    toast
  };
};
