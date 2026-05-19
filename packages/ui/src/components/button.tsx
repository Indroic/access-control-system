"use client";

import { Button as HeroButton } from "@heroui/react";
import type { ComponentProps } from "react";

type HeroButtonProps = ComponentProps<typeof HeroButton>;

type LegacyVariant =
  | "default"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "link"
  | HeroButtonProps["variant"];

type LegacySize =
  | "default"
  | "xs"
  | "sm"
  | "lg"
  | "icon"
  | "icon-xs"
  | "icon-sm"
  | "icon-lg"
  | HeroButtonProps["size"];

type ButtonProps = Omit<HeroButtonProps, "variant" | "size"> & {
  variant?: LegacyVariant;
  size?: LegacySize;
  disabled?: boolean;
};

const variantMap: Record<string, HeroButtonProps["variant"]> = {
  default: "primary",
  destructive: "danger",
  link: "ghost",
};

const sizeMap: Record<string, { size: HeroButtonProps["size"]; isIconOnly?: boolean }> = {
  default: { size: "md" },
  xs: { size: "sm" },
  sm: { size: "sm" },
  lg: { size: "lg" },
  icon: { size: "md", isIconOnly: true },
  "icon-xs": { size: "sm", isIconOnly: true },
  "icon-sm": { size: "sm", isIconOnly: true },
  "icon-lg": { size: "lg", isIconOnly: true },
};

function Button({ variant, size, disabled, isDisabled, ...props }: ButtonProps) {
  const mappedVariant =
    (variant && variantMap[variant as string]) ??
    (variant as HeroButtonProps["variant"]) ??
    "primary";
  const sized = sizeMap[size as string];
  const mappedSize = sized?.size ?? (size as HeroButtonProps["size"]) ?? "md";
  const iconOnly = sized?.isIconOnly;

  return (
    <HeroButton
      variant={mappedVariant}
      size={mappedSize}
      isIconOnly={iconOnly}
      isDisabled={isDisabled ?? disabled}
      {...props}
    />
  );
}

export { Button };
export type { ButtonProps };
