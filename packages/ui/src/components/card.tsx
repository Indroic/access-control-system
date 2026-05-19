"use client";

import { Card as HeroCard } from "@heroui/react";
import type { ComponentProps } from "react";

type LegacyCardProps = ComponentProps<typeof HeroCard> & { size?: "default" | "sm" };

function Card({ size: _size, ...props }: LegacyCardProps) {
  return <HeroCard {...props} />;
}

const CardHeader = HeroCard.Header;
const CardTitle = HeroCard.Title;
const CardDescription = HeroCard.Description;
const CardContent = HeroCard.Content;
const CardFooter = HeroCard.Footer;

function CardAction({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-action" className={className} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
