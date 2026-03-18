/**
 * Security Middleware for Insider Threat Protection
 * 
 * 1. Audit Logging — records every data access
 * 2. Rate Limiting — blocks excessive data access 
 * 3. Session Expiry — auto-expires old tokens
 * 4. Role-Based Access — restricts data by employee role
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_VERTEX_SUPABASE_URL!,
    process.env.VERTEX_SUPABASE_SERVICE_KEY!
);

// ─── AUDIT LOGGING ───
export async function logAudit(params: {
    userId: string;
    email: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}) {
    try {
        await supabase.from("audit_logs").insert({
            user_id: params.userId,
            user_email: params.email,
            action: params.action,
            resource_type: params.resourceType,
            resource_id: params.resourceId,
            metadata: params.metadata || {},
            ip_address: params.ipAddress,
            user_agent: params.userAgent,
        });
    } catch (err) {
        console.error("[AUDIT] Failed to log:", err);
    }
}

// ─── RATE LIMITING ───
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_ACCESS_PER_HOUR = 50; // Default

export async function checkRateLimit(userId: string): Promise<{
    allowed: boolean;
    count: number;
    limit: number;
}> {
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    // Count recent accesses
    const { count } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", oneHourAgo);

    const accessCount = count || 0;

    // Get user's custom limit
    const { data: profile } = await supabase
        .from("employee_profiles")
        .select("max_data_access_per_hour, is_blocked")
        .eq("user_id", userId)
        .single();

    const limit = profile?.max_data_access_per_hour || MAX_ACCESS_PER_HOUR;
    const isBlocked = profile?.is_blocked || false;

    if (isBlocked) {
        return { allowed: false, count: accessCount, limit: 0 };
    }

    if (accessCount >= limit) {
        // Auto-block if exceeded by 2x
        if (accessCount >= limit * 2) {
            await supabase
                .from("employee_profiles")
                .update({
                    is_blocked: true,
                    blocked_reason: `Exceeded rate limit: ${accessCount} accesses in 1 hour (limit: ${limit})`,
                })
                .eq("user_id", userId);
            console.error(`[SECURITY] ⛔ User ${userId} AUTO-BLOCKED: ${accessCount} accesses in 1 hour`);
        }
        return { allowed: false, count: accessCount, limit };
    }

    return { allowed: true, count: accessCount, limit };
}

// ─── SESSION VALIDATION ───
const DEFAULT_SESSION_TIMEOUT_HOURS = 8;

export async function checkSessionExpiry(userId: string): Promise<{
    valid: boolean;
    reason?: string;
}> {
    const { data: profile } = await supabase
        .from("employee_profiles")
        .select("session_timeout_hours, is_blocked, last_access_at")
        .eq("user_id", userId)
        .single();

    if (!profile) {
        return { valid: false, reason: "No employee profile found" };
    }

    if (profile.is_blocked) {
        return { valid: false, reason: "Account is blocked" };
    }

    // Check session timeout
    if (profile.last_access_at) {
        const lastAccess = new Date(profile.last_access_at).getTime();
        const timeoutHours = profile.session_timeout_hours || DEFAULT_SESSION_TIMEOUT_HOURS;
        const timeoutMs = timeoutHours * 60 * 60 * 1000;

        if (Date.now() - lastAccess > timeoutMs) {
            return { valid: false, reason: `Session expired (${timeoutHours}h timeout)` };
        }
    }

    // Update last access timestamp
    await supabase
        .from("employee_profiles")
        .update({ last_access_at: new Date().toISOString() })
        .eq("user_id", userId);

    return { valid: true };
}

// ─── ROLE-BASED ACCESS CHECK ───
type Role = "admin" | "manager" | "staff";

const ROLE_PERMISSIONS: Record<Role, string[]> = {
    admin: ["*"], // Can access everything
    manager: [
        "view_clients",
        "view_events",
        "view_employees",
        "view_reports",
    ],
    staff: [
        "view_assigned_events",
        "view_own_profile",
    ],
};

export async function checkPermission(
    userId: string,
    requiredPermission: string
): Promise<{ allowed: boolean; role: string }> {
    const { data: profile } = await supabase
        .from("employee_profiles")
        .select("role")
        .eq("user_id", userId)
        .single();

    const role = (profile?.role || "staff") as Role;
    const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.staff;

    const allowed = permissions.includes("*") || permissions.includes(requiredPermission);

    return { allowed, role };
}

// ─── COMBINED SECURITY CHECK ───
export async function securityCheck(params: {
    userId: string;
    email: string;
    action: string;
    permission: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
}): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Check if blocked or session expired
    const session = await checkSessionExpiry(params.userId);
    if (!session.valid) {
        await logAudit({
            ...params,
            metadata: { blocked: true, reason: session.reason },
        });
        return { allowed: false, reason: session.reason };
    }

    // 2. Check role permission
    const perm = await checkPermission(params.userId, params.permission);
    if (!perm.allowed) {
        await logAudit({
            ...params,
            metadata: { blocked: true, reason: `Insufficient role: ${perm.role}` },
        });
        return { allowed: false, reason: `Acces interzis pentru rolul: ${perm.role}` };
    }

    // 3. Check rate limit
    const rate = await checkRateLimit(params.userId);
    if (!rate.allowed) {
        await logAudit({
            ...params,
            metadata: { blocked: true, reason: `Rate limit: ${rate.count}/${rate.limit}` },
        });
        return {
            allowed: false,
            reason: `Prea multe accesări (${rate.count}/${rate.limit} pe oră). Contul a fost restricționat.`,
        };
    }

    // 4. Log the access
    await logAudit(params);

    return { allowed: true };
}
