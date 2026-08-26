import { NextResponse } from "next/server";
import {
    createAboutLinksRepo,
    isValidLinkId,
    parseAboutLinkInput,
    type AboutLinkInput,
} from "@/lib/about-links";

export const dynamic = "force-dynamic";

interface UpdateBody extends AboutLinkInput {
    /** Reorder within the group instead of editing fields. */
    move?: "up" | "down";
}

/**
 * PUT /admin/api/links/[id]
 *
 * Two shapes share the verb because both are "change this one link":
 *   { move: "up" | "down" }  → reorder inside its group
 *   { name?, url?, ... }     → patch the fields that are present
 */
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        if (!isValidLinkId(id)) {
            return NextResponse.json(
                { error: "Invalid link id." },
                { status: 400 },
            );
        }

        const body = (await request.json().catch(() => null)) as
            | UpdateBody
            | null;
        if (!body || typeof body !== "object") {
            return NextResponse.json(
                { error: "Expected a JSON object body." },
                { status: 400 },
            );
        }

        const repo = createAboutLinksRepo();

        if (body.move !== undefined) {
            if (body.move !== "up" && body.move !== "down") {
                return NextResponse.json(
                    { error: 'move must be "up" or "down".' },
                    { status: 400 },
                );
            }
            const moved = await repo.move(id, body.move);
            if (!moved) {
                // Either the row is gone or it's already at that end — the
                // client refetches either way, so say which.
                const exists = await repo.getById(id);
                return exists
                    ? NextResponse.json(
                          {
                              error: `Already ${body.move === "up" ? "first" : "last"} in its group.`,
                          },
                          { status: 400 },
                      )
                    : NextResponse.json(
                          { error: "Link not found." },
                          { status: 404 },
                      );
            }
            const links = await repo.getAllForAdmin();
            return NextResponse.json({ links });
        }

        const parsed = parseAboutLinkInput(body, false);
        if ("error" in parsed) {
            return NextResponse.json(
                { error: parsed.error },
                { status: 400 },
            );
        }

        const link = await repo.update(id, parsed.patch);
        if (!link) {
            return NextResponse.json(
                { error: "Link not found." },
                { status: 404 },
            );
        }

        return NextResponse.json({ link });
    } catch (error) {
        console.error("Admin links PUT error:", error);
        return NextResponse.json(
            { error: "Failed to update link" },
            { status: 500 },
        );
    }
}

/** DELETE /admin/api/links/[id] */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        if (!isValidLinkId(id)) {
            return NextResponse.json(
                { error: "Invalid link id." },
                { status: 400 },
            );
        }

        const repo = createAboutLinksRepo();
        const deleted = await repo.delete(id);
        if (!deleted) {
            return NextResponse.json(
                { error: "Link not found." },
                { status: 404 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Admin links DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to delete link" },
            { status: 500 },
        );
    }
}
