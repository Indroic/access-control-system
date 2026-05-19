"use client";

import { Toast, toast as heroToast } from "@heroui/react";
import type { ComponentProps } from "react";

type ToasterProps = ComponentProps<typeof Toast.Provider> & { richColors?: boolean };

function Toaster({ richColors: _richColors, ...props }: ToasterProps) {
  return <Toast.Provider placement="bottom end" {...props} />;
}

type ToastOptions = Parameters<typeof heroToast>[1];

function callToast(message: string, options?: ToastOptions) {
  return heroToast(message, options);
}

callToast.success = (message: string, options?: ToastOptions) => heroToast.success(message, options);
callToast.info = (message: string, options?: ToastOptions) => heroToast.info(message, options);
callToast.warning = (message: string, options?: ToastOptions) => heroToast.warning(message, options);
callToast.danger = (message: string, options?: ToastOptions) => heroToast.danger(message, options);
callToast.error = (message: string, options?: ToastOptions) => heroToast.danger(message, options);
callToast.clear = () => heroToast.clear();
callToast.dismiss = () => heroToast.clear();

const toast = callToast;

export { Toaster, toast };
