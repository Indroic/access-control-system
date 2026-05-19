"use client";

import { Dropdown, Header, Label, Separator } from "@heroui/react";
import { cloneElement, isValidElement } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

type DropdownProps = ComponentProps<typeof Dropdown>;
type PopoverProps = ComponentProps<typeof Dropdown.Popover>;
type MenuProps = ComponentProps<typeof Dropdown.Menu>;
type ItemProps = ComponentProps<typeof Dropdown.Item>;

function DropdownMenu(props: DropdownProps) {
  return <Dropdown {...props} />;
}

type DropdownMenuTriggerProps = {
  children?: ReactNode;
  render?: ReactElement;
  asChild?: boolean;
} & Omit<ComponentProps<typeof Dropdown.Trigger>, "children" | "render">;

function DropdownMenuTrigger({ children, render, ...rest }: DropdownMenuTriggerProps) {
  const triggerChild = render
    ? isValidElement(render)
      ? cloneElement(render as ReactElement<{ children?: ReactNode }>, undefined, children)
      : render
    : children;
  return <Dropdown.Trigger {...rest}>{triggerChild}</Dropdown.Trigger>;
}

type DropdownMenuContentProps = PopoverProps &
  Pick<MenuProps, "selectionMode" | "selectedKeys" | "onSelectionChange" | "onAction"> & {
    align?: "start" | "center" | "end";
  };

function DropdownMenuContent({
  children,
  selectionMode,
  selectedKeys,
  onSelectionChange,
  onAction,
  align: _align,
  ...rest
}: DropdownMenuContentProps) {
  return (
    <Dropdown.Popover {...rest}>
      <Dropdown.Menu
        selectionMode={selectionMode}
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
        onAction={onAction}
      >
        {children}
      </Dropdown.Menu>
    </Dropdown.Popover>
  );
}

function DropdownMenuGroup({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

function DropdownMenuLabel({ children, ...props }: ComponentProps<typeof Header>) {
  return <Header {...props}>{children}</Header>;
}

type DropdownMenuItemProps = Omit<ItemProps, "variant" | "onClick" | "children"> & {
  variant?: "default" | "destructive" | "danger";
  inset?: boolean;
  onClick?: ItemProps["onPress"];
  children?: ReactNode;
};

function DropdownMenuItem({
  variant,
  inset: _inset,
  onClick,
  onPress,
  children,
  ...rest
}: DropdownMenuItemProps) {
  const mappedVariant: ItemProps["variant"] =
    variant === "destructive" ? "danger" : (variant as ItemProps["variant"]);
  return (
    <Dropdown.Item variant={mappedVariant} onPress={onPress ?? onClick} {...rest}>
      <Label>{children}</Label>
    </Dropdown.Item>
  );
}

function DropdownMenuSeparator(props: ComponentProps<typeof Separator>) {
  return <Separator {...props} />;
}

function DropdownMenuPortal({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

function DropdownMenuShortcut({ children, ...props }: ComponentProps<"span">) {
  return (
    <span data-slot="dropdown-menu-shortcut" {...props}>
      {children}
    </span>
  );
}

const DropdownMenuSub = Dropdown.SubmenuTrigger;
const DropdownMenuSubTrigger = Dropdown.SubmenuTrigger;
const DropdownMenuSubContent = DropdownMenuContent;
const DropdownMenuCheckboxItem = Dropdown.Item;
const DropdownMenuRadioItem = Dropdown.Item;
const DropdownMenuRadioGroup = Dropdown.Section;

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
