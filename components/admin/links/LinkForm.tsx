"use client";

import { useState } from "react";
import {
    ABOUT_LINK_GROUPS,
    ABOUT_LINK_ICONS,
    isRenderedGroup,
} from "@/lib/about-links";
import { Field, Select, TextArea, TextInput } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";

export interface LinkFormValues {
    id: string;
    name: string;
    url: string;
    icon: string;
    description: string;
    groupName: string;
    visible: boolean;
}

export const EMPTY_LINK: LinkFormValues = {
    id: "",
    name: "",
    url: "",
    icon: "link",
    description: "",
    groupName: "quick-links",
    visible: true,
};

/** Mirrors the server's id rule so the field can suggest a legal value. */
function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

/**
 * Create/edit form for one about link. Field state lives here; the parent
 * owns persistence, so mount it with a `key` that changes per record to get
 * a clean form for each edit.
 */
export function LinkForm({
    mode,
    initial,
    saving,
    onSubmit,
    onCancel,
}: {
    mode: "create" | "edit";
    initial: LinkFormValues;
    saving: boolean;
    onSubmit: (values: LinkFormValues) => void;
    onCancel: () => void;
}) {
    const [values, setValues] = useState<LinkFormValues>(initial);
    // Once the id is typed by hand, stop deriving it from the name.
    const [idTouched, setIdTouched] = useState(mode === "edit");

    const set = <K extends keyof LinkFormValues>(
        key: K,
        value: LinkFormValues[K],
    ) => setValues((v) => ({ ...v, [key]: value }));

    // Preserve a group that predates the known list rather than silently
    // rewriting it to the first option.
    const groupOptions = ABOUT_LINK_GROUPS.some(
        (g) => g.value === values.groupName,
    )
        ? ABOUT_LINK_GROUPS
        : [
              ...ABOUT_LINK_GROUPS,
              {
                  value: values.groupName,
                  label: values.groupName,
                  rendered: false,
              },
          ];

    const canSubmit =
        values.id.trim() !== "" &&
        values.name.trim() !== "" &&
        values.url.trim() !== "" &&
        !saving;

    return (
        <form
            className="mb-6 rounded-xl border border-border bg-bg-card p-4"
            onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) onSubmit(values);
            }}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <Field
                    label="Name"
                    htmlFor="link-name"
                    hint="Shown on the card or row."
                >
                    <TextInput
                        id="link-name"
                        value={values.name}
                        required
                        maxLength={120}
                        placeholder="Share"
                        onChange={(e) => {
                            const name = e.target.value;
                            setValues((v) => ({
                                ...v,
                                name,
                                id: idTouched ? v.id : slugify(name),
                            }));
                        }}
                    />
                </Field>

                <Field
                    label="Id"
                    htmlFor="link-id"
                    hint={
                        mode === "edit"
                            ? "The primary key — create a new link to change it."
                            : "Lowercase letters, numbers and single hyphens."
                    }
                >
                    <TextInput
                        id="link-id"
                        value={values.id}
                        required
                        maxLength={64}
                        disabled={mode === "edit"}
                        placeholder="share"
                        className="font-mono disabled:opacity-60"
                        onChange={(e) => {
                            setIdTouched(true);
                            set("id", e.target.value);
                        }}
                    />
                </Field>

                <Field
                    label="URL"
                    htmlFor="link-url"
                    hint="Absolute http:// or https:// address."
                    className="sm:col-span-2"
                >
                    <TextInput
                        id="link-url"
                        type="url"
                        value={values.url}
                        required
                        maxLength={2048}
                        placeholder="https://example.com"
                        className="font-mono"
                        onChange={(e) => set("url", e.target.value)}
                    />
                </Field>

                <Field
                    label="Group"
                    htmlFor="link-group"
                    hint={
                        isRenderedGroup(values.groupName)
                            ? "Has its own section on /about."
                            : "Stored, but /about has no section for this group."
                    }
                >
                    <Select
                        id="link-group"
                        value={values.groupName}
                        onChange={(e) => set("groupName", e.target.value)}
                    >
                        {groupOptions.map((g) => (
                            <option key={g.value} value={g.value}>
                                {g.label}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field
                    label="Icon"
                    htmlFor="link-icon"
                    hint="Only these render on /about; anything else falls back to the link glyph."
                >
                    <Select
                        id="link-icon"
                        value={values.icon}
                        onChange={(e) => set("icon", e.target.value)}
                    >
                        {ABOUT_LINK_ICONS.map((icon) => (
                            <option key={icon} value={icon}>
                                {icon}
                            </option>
                        ))}
                    </Select>
                </Field>

                <Field
                    label="Description"
                    htmlFor="link-description"
                    hint="Optional. Quick Links show it; Friends rows don't."
                    className="sm:col-span-2"
                >
                    <TextArea
                        id="link-description"
                        rows={2}
                        maxLength={300}
                        value={values.description}
                        placeholder="Temporary file sharing · 5GB max"
                        onChange={(e) => set("description", e.target.value)}
                    />
                </Field>

                <Field label="Visibility" htmlFor="link-visible">
                    <Select
                        id="link-visible"
                        value={values.visible ? "1" : "0"}
                        onChange={(e) => set("visible", e.target.value === "1")}
                    >
                        <option value="1">Visible on /about</option>
                        <option value="0">Hidden</option>
                    </Select>
                </Field>
            </div>

            <div className="mt-4 flex gap-2">
                <Button type="submit" size="sm" disabled={!canSubmit}>
                    {saving
                        ? "Saving…"
                        : mode === "create"
                          ? "Create link"
                          : "Save changes"}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
            </div>
        </form>
    );
}
