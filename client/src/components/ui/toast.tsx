
import { toast as sonnerToast } from "sonner";

export type ToastProps = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
};

const toast = ({ title, description, variant }: ToastProps) => {
  switch (variant) {
    case "destructive":
      sonnerToast.error(title, {
        description
      });
      break;
    case "success":
      sonnerToast.success(title, {
        description
      });
      break;
    default:
      sonnerToast(title, {
        description
      });
  }
};

export const useToast = () => {
  return {
    toast
  };
};
