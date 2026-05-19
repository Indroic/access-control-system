"use client";

import { Input as HeroInput } from "@heroui/react";
import type { ComponentProps } from "react";

type InputProps = ComponentProps<typeof HeroInput>;

function Input(props: InputProps) {
  return <HeroInput {...props} />;
}

export { Input };
