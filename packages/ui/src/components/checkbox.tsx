"use client";

import { Checkbox as HeroCheckbox } from "@heroui/react";
import type { ComponentProps } from "react";

type CheckboxProps = ComponentProps<typeof HeroCheckbox>;

function Checkbox(props: CheckboxProps) {
  return (
    <HeroCheckbox {...props}>
      <HeroCheckbox.Control>
        <HeroCheckbox.Indicator />
      </HeroCheckbox.Control>
    </HeroCheckbox>
  );
}

export { Checkbox };
