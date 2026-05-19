"use client";

import { Label as HeroLabel } from "@heroui/react";
import type { ComponentProps } from "react";

type LabelProps = ComponentProps<typeof HeroLabel>;

function Label(props: LabelProps) {
  return <HeroLabel {...props} />;
}

export { Label };
