-- ============================================
-- INSIDER THREAT PROTECTION — Database Schema
-- ============================================

-- 1. Audit Log table — tracks every data access
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT,
    action TEXT NOT NULL,           -- 'view_client', 'export_data', 'view_profile', etc.
    resource_type TEXT,             -- 'client', 'event', 'employee', etc.
    resource_id TEXT,               -- ID of the accessed resource
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',    -- Extra context (search query, filters used, etc.)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);

-- 2. Employee roles & permissions
ALTER TABLE employee_profiles 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'staff',
ADD COLUMN IF NOT EXISTS max_data_access_per_hour INT DEFAULT 50,
ADD COLUMN IF NOT EXISTS session_timeout_hours INT DEFAULT 8,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
ADD COLUMN IF NOT EXISTS last_access_at TIMESTAMPTZ;

-- 3. Rate limiting tracking
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    window_start TIMESTAMPTZ DEFAULT now(),
    access_count INT DEFAULT 1,
    is_blocked BOOLEAN DEFAULT false,
    UNIQUE(user_id, window_start)
);

CREATE INDEX idx_rate_user ON rate_limit_tracking(user_id, window_start DESC);

-- 4. RLS policies — employees see only their assigned data
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs
CREATE POLICY "admins_read_audit" ON audit_logs
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM employee_profiles WHERE role = 'admin'
        )
    );

-- Insert allowed for all authenticated (server writes logs)
CREATE POLICY "authenticated_insert_audit" ON audit_logs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
