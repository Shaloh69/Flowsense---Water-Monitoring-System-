import { addToast } from "@heroui/toast";

export const toast = {
  success: (title: string, description?: string) => {
    addToast({
      title,
      description,
      color: "success",
      variant: "flat",
      timeout: 4000,
    });
  },
  error: (title: string, description?: string) => {
    addToast({
      title,
      description,
      color: "danger",
      variant: "flat",
      timeout: 7000,
      shouldShowTimeoutProgress: true,
    });
  },
  info: (title: string, description?: string) => {
    addToast({
      title,
      description,
      color: "primary",
      variant: "flat",
      timeout: 4000,
    });
  },
  warning: (title: string, description?: string) => {
    addToast({
      title,
      description,
      color: "warning",
      variant: "flat",
      timeout: 6000,
      shouldShowTimeoutProgress: true,
    });
  },
};
