"use client";

import { Skeleton as HeroSkeleton } from "@heroui/react";
import type { ComponentProps } from "react";

type SkeletonProps = ComponentProps<typeof HeroSkeleton>;

function Skeleton(props: SkeletonProps) {
  return <HeroSkeleton {...props} />;
}

export { Skeleton };
