import File from "../File";
import {
	checkSize,
	withAuthenticatedUser,
	withJson,
	withRawContent,
	withUploadKey,
} from "./middleware";
import { Hono } from "hono";

export const router = new Hono();

router
	// All file routes must have valid upload key (if configured) and be authenticated
	.post("*", withUploadKey, withAuthenticatedUser)

	.post("/check-css", (c) => {
		const file = new File(c);
		return c.json(file.checkCss());
	})

	.post("/create-note", withJson, async (c) => {
		const file = new File(c);
		return c.json(await file.createNote());
	})

	.post("/check-file", withJson, async (c) => {
		const file = new File(c);
		return c.json(await file.checkFile());
	})

	.post("/check-files", withJson, async (c) => {
		const file = new File(c);
		return c.json(await file.checkFiles());
	})

	.post("/upload", withRawContent, checkSize, async (c) => {
		const file = new File(c);
		return c.json(await file.upload());
	})

	.post("/delete", withJson, async (c) => {
		const file = new File(c);
		return c.json(await file.deleteFile());
	});
