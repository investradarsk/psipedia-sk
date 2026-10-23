import { legacyAutomationRetiredResponse } from "@/lib/legacy-automation-retired";

// Legacy Tavily automation actions are permanently retired. Never dispatch
// an old manual run, even when a stale browser tab submits an old form.
export const dynamic = "force-dynamic";
export async function GET() { return legacyAutomationRetiredResponse(); }
export async function POST() { return legacyAutomationRetiredResponse(); }
export async function PUT() { return legacyAutomationRetiredResponse(); }
export async function PATCH() { return legacyAutomationRetiredResponse(); }
export async function DELETE() { return legacyAutomationRetiredResponse(); }
