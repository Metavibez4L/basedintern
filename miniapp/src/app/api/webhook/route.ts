import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Handle notification webhooks from Base App
  const { event } = body;

  if (event === "frame_added") {
    // User saved the mini app — can now send notifications
    console.log("User added mini app:", body);
  } else if (event === "frame_removed") {
    // User removed the mini app
    console.log("User removed mini app:", body);
  } else if (event === "notifications_enabled") {
    console.log("User enabled notifications:", body);
  } else if (event === "notifications_disabled") {
    console.log("User disabled notifications:", body);
  }

  return NextResponse.json({ success: true });
}
