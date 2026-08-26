import { NextResponse } from "next/server";
import {
    createAboutLinksRepo,
    isValidLinkId,
    parseAboutLinkInput,
    type AboutLinkInput,
} from "@/lib/about-links";

export const dynamic = "force-dynamic";

/** GET /admin/api/links — every link, hidden ones included. */
export async function GET() {
    try {
        const repo = createAboutLinksRepo();
        const links = await repo.getAllForAdmin();
        return NextResponse.json({ links });
    } catch (error) {
        console.error("Admin links GET error:", error);
        return NextResponse.json(
            { error: "Failed to load links" },
            { status: 500 },
        );
    }
}

/** POST /admin/api/links — create one link. */
export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => null)) as
            | AboutLinkInput
            | null;
        if (!body || typeof body !== "object") {
            return NextResponse.json(
                { error: "Expected a JSON object body." },
                { status: 400 },
            );
        }

        const id = typeof body.id === "string" ? body.id.trim() : "";
        if (!isValidLinkId(id)) {
            return NextResponse.json(
                {
                    error: "Id must be a URL-safe slug: lowercase letters, numbers and single hyphens (e.g. my-link).",
                },
                { status: 400 },
            );
        }

        const parsed = parseAboutLinkInput(body, true);
        if ("error" in parsed) {
            return NextResponse.json(
                { error: parsed.error },
                { status: 400 },
            );
        }

        const repo = createAboutLinksRepo();
        const link = await repo.create(id, parsed.patch);
        if (!link) {
            return NextResponse.json(
                { error: `A link with the id "${id}" already exists.` },
                { status: 409 },
            );
        }

        return NextResponse.json({ link }, { status: 201 });
    } catch (error) {
        console.error("Admin links POST error:", error);
        return NextResponse.json(
            { error: "Failed to create link" },
            { status: 500 },
        );
    }
}
